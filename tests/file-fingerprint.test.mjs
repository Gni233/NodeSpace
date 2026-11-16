import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const ts = createRequire(import.meta.url)('typescript');
const read = name => readFile(new URL(`../src/${name}.ts`, import.meta.url), 'utf8');
const compile = text => ts.transpileModule(text, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const moduleUrl = text => 'data:text/javascript;base64,' + Buffer.from(compile(text)).toString('base64');
const adapterUrl = moduleUrl(await read('file-adapter'));
const adapterTypes = await import(adapterUrl);
const { createFSAAdapter } = await import(moduleUrl((await read('file-system')).replace("'./file-adapter'", JSON.stringify(adapterUrl))));

test('mobile storage detects the native platform through the Capacitor runtime', async () => {
  const code = compile(await read('fs-mobile')).replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  let native = true;
  const isCapacitor = new Function('Capacitor', `${code}\nreturn isCapacitor;`)({ isNativePlatform: () => native });
  assert.equal(isCapacitor(), true);
  native = false;
  assert.equal(isCapacitor(), false);
});

test('browser directory handles expose file version metadata without opening the file content', async () => {
  const seen = [];
  const folder = {
    async getFileHandle(name) {
      seen.push(name);
      if (name === 'missing') throw new DOMException('Missing', 'NotFoundError');
      if (name === 'private') throw new DOMException('Permission denied', 'NotAllowedError');
      return { async getFile() { return { size: 84, lastModified: 1200, text: () => assert.fail('Fingerprint reads contents') }; } };
    },
  };
  const filesystem = createFSAAdapter(() => ({ async getDirectoryHandle(name) { seen.push(name); return folder; } }));
  assert.deepEqual(await filesystem.statFile('笔记/图.json'), { ok: true, value: { size: 84, mtime: 1200 } });
  assert.deepEqual(await filesystem.statFile('笔记/missing'), { ok: true, value: null });
  assert.equal((await filesystem.statFile('笔记/private')).ok, false);
  assert.equal((await filesystem.statFile('../private')).ok, false);
  assert.deepEqual(seen, ['笔记', '图.json', '笔记', 'missing', '笔记', 'private']);
});

test('mobile graph metadata drops the platform URI and requires a real timestamp', async () => {
  const code = compile((await read('fs-mobile')).replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, ''));
  const { isRelativeFilePath, ok, err } = adapterTypes;
  let result = { type: 'file', size: 12, mtime: 1234, ctime: 1000, uri: 'file:///private/graph.json' };
  const filesystem = {
    stat: async options => {
      assert.deepEqual(options, { path: 'graphs/笔记.json', directory: 'DATA' });
      if (result instanceof Error) throw result;
      return result;
    },
  };
  const create = new Function('Filesystem', 'Directory', 'isRelativeFilePath', 'ok', 'err', `${code}\nreturn createCapacitorAdapter;`)(
    filesystem, { Data: 'DATA' }, isRelativeFilePath, ok, err,
  );
  const mobile = create();
  assert.deepEqual(await mobile.statFile('笔记.json'), { ok: true, value: { size: 12, mtime: 1234, ctime: 1000 } });
  result = { ...result, mtime: undefined };
  assert.equal((await mobile.statFile('笔记.json')).ok, false);
  result = Object.assign(new Error('Missing'), { code: 'OS-PLUG-FILE-0008' });
  assert.deepEqual(await mobile.statFile('笔记.json'), { ok: true, value: null });
});

test('native graph writes valid UTF-8 JSON and reads it back without base64 conversion', async () => {
  const code = compile(await read('fs-mobile')).replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  const files = new Map();
  const filesystem = {
    mkdir: async () => {},
    writeFile: async ({ path, data, encoding }) => files.set(path, Buffer.from(data, encoding || 'base64')),
    readFile: async ({ path, encoding }) => ({ data: files.get(path).toString(encoding || 'base64') }),
  };
  const getIO = new Function('Filesystem', 'Directory', 'Encoding', `${code}\nreturn { readFileMobile, writeFileMobile };`);
  const { readFileMobile, writeFileMobile } = getIO(filesystem, { Data: 'DATA' }, { UTF8: 'utf8' });
  const content = { nodes: [{ id: 'one', label: '手机记录' }], edges: [], groups: [] };
  assert.equal(await writeFileMobile('Mobile.json', content), true);
  assert.deepEqual(JSON.parse(files.get('graphs/Mobile.json').toString('utf8')), content);
  assert.deepEqual(await readFileMobile('Mobile.json'), content);
});
