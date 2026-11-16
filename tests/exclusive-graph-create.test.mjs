import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { authorizedGraphRoot, createGraphFile } = require('../electron/graph-create.cjs');
const ts = require('typescript');
const source = name => readFile(new URL(`../src/${name}.ts`, import.meta.url), 'utf8');
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext },
}).outputText).toString('base64');
const adapterModule = moduleUrl(await source('file-adapter'));
const { createFileWithFallback, ok, err } = await import(adapterModule);
const safModule = (await source('saf-bridge'))
  .replace("'./file-adapter'", JSON.stringify(adapterModule))
  .replace("'@capacitor/filesystem'", JSON.stringify(import.meta.resolve('@capacitor/filesystem')));
const { createSAFAdapter } = await import(moduleUrl(safModule));
const server = fileURLToPath(new URL('../mcp-server/server.js', import.meta.url));

async function temporaryRoot(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'nodespace-exclusive-'));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('nodespace-exclusive-'));
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

function requestMcpCreate(directory, name) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [server, '--dir', directory], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { output += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', exit => {
      if (exit !== 0) { reject(new Error(stderr)); return; }
      try {
        const result = JSON.parse(output).result;
        assert.ok(!result.isError, result.content[0].text);
        resolve(JSON.parse(result.content[0].text));
      }
      catch (error) { reject(error); }
    });
    const message = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_graph', arguments: { name } } };
    child.stdin.end(JSON.stringify(message) + '\n');
  });
}

test('desktop exclusive graph creation preserves an existing file, directory, and complete UTF-8 content', async t => {
  const root = await temporaryRoot(t);
  await mkdir(path.join(root, 'sub'));
  const graph = 'sub/日记.json';
  const content = JSON.stringify({ nodes: [{ label: '日记🍂' }], edges: [], groups: [] });
  assert.equal(createGraphFile([root], root, graph, content), 'created');
  assert.equal(createGraphFile([root], root, graph, 'changed'), 'exists');
  assert.equal(await readFile(path.join(root, graph), 'utf8'), content);
  assert.deepEqual(await readdir(path.join(root, 'sub')), ['日记.json']);
  await mkdir(path.join(root, 'directory.json'));
  assert.equal(createGraphFile([root], root, 'directory.json', content), 'exists');
});

test('desktop will create only graphs in the authorized Vault graph directory and rejects parent links', async t => {
  const root = await temporaryRoot(t);
  const vault = path.join(root, 'vault');
  const graphs = path.join(vault, 'custom graphs');
  const other = path.join(root, 'other');
  await mkdir(path.join(vault, '.obsidian'), { recursive: true });
  await mkdir(graphs);
  await mkdir(other);
  const config = { folderPath: vault, graphFolderRelative: 'custom graphs' };
  assert.equal(authorizedGraphRoot([vault], vault, config), undefined);
  assert.equal(authorizedGraphRoot([vault], path.join(vault, '.obsidian'), config), undefined);
  assert.equal(authorizedGraphRoot([vault], graphs, config), vault);
  for (const name of ['../escape.json', 'directory/../../escape.json', 'nested\\fake.json', 'stream:other.json', 'source.md']) {
    assert.throws(() => createGraphFile([vault], graphs, name, '{}'), /Invalid graph path/);
  }
  await symlink(other, path.join(graphs, 'jump'), 'junction');
  assert.throws(() => createGraphFile([vault], graphs, 'jump/escape.json', '{}'), /Access denied/);
  assert.deepEqual(await readdir(other), []);
});

test('independent MCP processes contend for the same graph and respect an Electron winner', async t => {
  const root = await temporaryRoot(t);
  const results = await Promise.all(Array.from({ length: 4 }, () => requestMcpCreate(root, 'Shared')));
  assert.equal(results.filter(result => result.ok).length, 1);
  for (const result of results.filter(result => !result.ok)) assert.match(result.error, /已存在/);
  assert.deepEqual(await readdir(root), ['Shared.json']);
  const mcpFile = path.join(root, 'Shared.json');
  const content = await readFile(mcpFile, 'utf8');
  assert.equal(createGraphFile([root], root, 'Shared.json', '{}'), 'exists');
  assert.equal(await readFile(mcpFile, 'utf8'), content);
  assert.deepEqual(JSON.parse(content).nodes, []);

  const appContent = '{"nodes":[{"id":"app"}],"edges":[],"groups":[]}';
  assert.equal(createGraphFile([root], root, 'Desktop.json', appContent), 'created');
  assert.match((await requestMcpCreate(root, 'Desktop')).error, /已存在/);
  assert.equal(await readFile(path.join(root, 'Desktop.json'), 'utf8'), appContent);
  await writeFile(path.join(root, 'Malformed.json'), 'not JSON');
  assert.match((await requestMcpCreate(root, 'Malformed')).error, /已存在/);
  assert.equal(await readFile(path.join(root, 'Malformed.json'), 'utf8'), 'not JSON');
});

test('uses the exclusive adapter without falling back after a filesystem error', async () => {
  const adapter = {
    async createFile(path, data) { assert.equal(path, 'new.json'); assert.equal(data, '{}'); return err('Disk error'); },
    async writeFile() { assert.fail('must not retry with an overwriting write'); },
  };
  assert.deepEqual(await createFileWithFallback(adapter, 'new.json', '{}'), err('Disk error'));
});

test('fallback detects existing entries, serializes app creates, and checks storage again before writing', async () => {
  const files = new Map();
  const adapter = {
    async listFiles() {
      return ok([{ name: 'Sub', kind: 'directory', children: [{ name: 'Malformed.JSON', kind: 'file', children: [] }] }]);
    },
    async readFile(name) { return ok(files.get(name) ?? null); },
    async writeFile(name, data) {
      await new Promise(setImmediate);
      files.set(name, data);
      return ok(true);
    },
  };
  assert.deepEqual(await createFileWithFallback(adapter, 'sub/malformed.json', '{}'), ok('exists'));
  const attempts = await Promise.all([
    createFileWithFallback(adapter, 'new.json', 'first'),
    createFileWithFallback(adapter, 'new.json', 'second'),
  ]);
  assert.deepEqual(attempts, [ok('created'), ok('exists')]);
  assert.equal(files.get('new.json'), 'first');

  let eligible = true;
  const moved = { ...adapter, async readFile() { eligible = false; return ok(null); } };
  assert.deepEqual(await createFileWithFallback(moved, 'moved.json', '{}', () => eligible), err('Graph destination changed'));
  assert.equal(files.has('moved.json'), false);
});

test('SAF fallback can create missing graphs and surfaces unrelated native read errors', async t => {
  const files = new Map();
  let fault;
  const savedWindow = globalThis.window;
  globalThis.window = { Capacitor: { Plugins: { SafPlugin: {
    async listFiles() { return { files: [...files.keys()].map(name => ({ name, kind: 'file', children: [] })) }; },
    async readFile({ fileName }) {
      if (fault) throw new Error(fault);
      if (!files.has(fileName)) throw new Error(`File not found: ${fileName}`);
      return { data: files.get(fileName) };
    },
    async writeFile({ fileName, data }) { files.set(fileName, data); },
  } } } };
  t.after(() => { if (savedWindow === undefined) delete globalThis.window; else globalThis.window = savedWindow; });
  const adapter = createSAFAdapter();
  assert.deepEqual(await createFileWithFallback(adapter, 'new.json', '{}'), ok('created'));
  assert.deepEqual(await createFileWithFallback(adapter, 'new.json', 'different'), ok('exists'));
  assert.equal(files.get('new.json'), '{}');
  fault = 'No directory selected';
  assert.deepEqual(await createFileWithFallback(adapter, 'missing.json', '{}'), err(fault));
  assert.equal(files.has('missing.json'), false);
});
