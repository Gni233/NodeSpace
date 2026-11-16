import assert from 'node:assert/strict';
import fsSync from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = name => readFile(new URL(`../src/${name}.ts`, import.meta.url), 'utf8');
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText).toString('base64');
const adapterUrl = moduleUrl(await source('file-adapter'));
const { ok, err } = await import(adapterUrl);
const { createElectronAdapter } = await import(moduleUrl((await source('fs-electron')).replace("'./file-adapter'", JSON.stringify(adapterUrl))));
const electronMain = await readFile(new URL('../electron/main.cjs', import.meta.url), 'utf8');

async function desktop(t, faults) {
  const directory = await mkdtemp(path.join(tmpdir(), 'nodespace-mutations-'));
  const handlers = new Map();
  const savedWindow = globalThis.window;
  t.after(async () => {
    if (savedWindow === undefined) delete globalThis.window;
    else globalThis.window = savedWindow;
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), path.resolve(tmpdir()));
    assert.ok(path.basename(resolved).startsWith('nodespace-mutations-'));
    await rm(resolved, { recursive: true, force: true });
  });
  const electron = {
    app: { getPath: () => directory, whenReady: () => ({ then() {} }), on() {} },
    ipcMain: { handle: (name, callback) => handlers.set(name, callback), on() {} },
  };
  const nativeFs = { ...fsSync, ...faults };
  vm.runInNewContext(electronMain, {
    require: name => name === 'electron' ? electron : name === 'fs' ? nativeFs
      : name.startsWith('./') ? require(`../electron/${name.slice(2)}`) : require(name),
    process,
    console,
    setTimeout() {},
  }, { filename: 'electron/main.cjs' });
  const api = {
    delete: (target, options) => handlers.get('fs-delete')(null, target, options),
    rename: (oldPath, newPath) => handlers.get('fs-rename')(null, oldPath, newPath),
    writeFile: (target, content, expectedContent) => handlers.get('fs-write-file')(null, target, content, expectedContent),
    stat: target => handlers.get('fs-stat')(null, target),
  };
  globalThis.window = { electronAPI: api };
  const root = path.join(directory, 'NodeSpace');
  return { root, api, adapter: createElectronAdapter(root) };
}

test('native source writes compare the original after staging the replacement', async t => {
  let sourcePath;
  let outsideChange = false;
  const { root, api } = await desktop(t, {
    writeFileSync(target, data, encoding) {
      fsSync.writeFileSync(target, data, encoding);
      if (outsideChange && typeof target === 'number') fsSync.writeFileSync(sourcePath, '# 外部修改\r\n');
    },
  });
  sourcePath = path.join(root, '原文.md');
  await writeFile(sourcePath, '# 原文\r\n');
  assert.equal((await api.writeFile(sourcePath, '# 已保存\r\n', '# 原文\r\n')).ok, true);
  assert.equal(await readFile(sourcePath, 'utf8'), '# 已保存\r\n');

  outsideChange = true;
  const conflict = await api.writeFile(sourcePath, '# 草稿\r\n', '# 已保存\r\n');
  assert.equal(conflict.conflict, true);
  assert.equal(conflict.content, '# 外部修改\r\n');
  assert.equal(await readFile(sourcePath, 'utf8'), '# 外部修改\r\n');
  assert.deepEqual(await readdir(root), ['原文.md']);

  outsideChange = false;
  const missing = path.join(root, '不存在.md');
  assert.match((await api.writeFile(missing, '# 草稿', '# 原文')).error, /ENOENT/);
  assert.deepEqual(await readdir(root), ['原文.md']);
  assert.equal((await api.writeFile(path.join(root, 'graph.json'), '{}')).ok, true);
  assert.equal(await readFile(path.join(root, 'graph.json'), 'utf8'), '{}');
});

test('desktop delete treats only missing files as already deleted and reports failure through the adapter', async t => {
  const { root, api, adapter } = await desktop(t, {
    rmSync(target, options) {
      if (path.basename(target) === 'locked.json') throw Object.assign(new Error('File is locked'), { code: 'EACCES' });
      return fsSync.rmSync(target, options);
    },
  });
  await writeFile(path.join(root, 'locked.json'), 'keep');
  await writeFile(path.join(root, 'open.json'), 'remove');
  assert.deepEqual(await adapter.deleteFile('missing.json'), ok(true));
  assert.deepEqual(await adapter.deleteFile('open.json'), ok(true));
  assert.deepEqual(await adapter.deleteFile('locked.json'), err('File is locked'));
  assert.deepEqual(await adapter.deleteFile('../outside.json'), err('Access denied'));
  assert.deepEqual(await readdir(root), ['locked.json']);

  api.delete = async () => { throw new Error('IPC closed'); };
  assert.deepEqual(await adapter.deleteFile('locked.json'), err('IPC closed'));
  assert.equal(await readFile(path.join(root, 'locked.json'), 'utf8'), 'keep');
});

test('desktop rename refuses an occupied name and rolls back if the old name cannot be removed', async t => {
  let locked = true;
  const { root, adapter } = await desktop(t, {
    unlinkSync(target) {
      if (locked && path.basename(target) === 'Original.json') throw Object.assign(new Error('File is locked'), { code: 'EACCES' });
      return fsSync.unlinkSync(target);
    },
  });
  const nested = path.join(root, '图');
  await mkdir(nested);
  await writeFile(path.join(nested, 'Original.json'), 'original');
  await writeFile(path.join(nested, 'Occupied.json'), 'keep');

  assert.deepEqual(await adapter.renameFile('图/Original.json', 'Occupied'), err('Destination already exists'));
  if (fsSync.existsSync(path.join(nested, 'original.json'))) {
    assert.deepEqual(await adapter.renameFile('图/Original.json', 'original'), err('Destination already exists'));
  }
  assert.equal(await readFile(path.join(nested, 'Occupied.json'), 'utf8'), 'keep');
  assert.deepEqual(await adapter.renameFile('图/Original.json', 'Renamed'), err('File is locked'));
  assert.deepEqual((await readdir(nested)).sort(), ['Occupied.json', 'Original.json']);
  assert.equal(await readFile(path.join(nested, 'Original.json'), 'utf8'), 'original');

  locked = false;
  assert.deepEqual(await adapter.renameFile('图/Original.json', 'Renamed'), ok(true));
  assert.deepEqual((await readdir(nested)).sort(), ['Occupied.json', 'Renamed.json']);
  assert.equal(await readFile(path.join(nested, 'Renamed.json'), 'utf8'), 'original');
});

test('deleting a graph cannot recursively remove a directory at that path', async t => {
  const { root, adapter } = await desktop(t);
  const replacement = path.join(root, 'workspace.json');
  await mkdir(replacement);
  await writeFile(path.join(replacement, 'keep.md'), 'keep');
  assert.equal((await adapter.deleteFile('workspace.json', { recursive: false })).ok, false);
  assert.equal(await readFile(path.join(replacement, 'keep.md'), 'utf8'), 'keep');
  await writeFile(path.join(root, 'graph.json'), '{}');
  assert.deepEqual(await adapter.deleteFile('graph.json', { recursive: false }), ok(true));
});

test('desktop file fingerprints use metadata and reject paths outside the allowed root', async t => {
  const { root, api, adapter } = await desktop(t, {
    promises: { ...fsSync.promises, readFile() { assert.fail('Fingerprint checks must not read content'); } },
  });
  const graph = path.join(root, 'graph.json');
  const markdown = path.join(root, '源.md');
  await writeFile(graph, '{}');
  await writeFile(markdown, '# 原文');

  const before = await adapter.statFile('graph.json');
  assert.equal(before.ok, true);
  assert.equal(before.value.size, 2);
  assert.ok(Number.isFinite(before.value.ctime));
  assert.deepEqual(Object.keys(before.value).sort(), ['ctime', 'mtime', 'size']);
  const later = new Date(before.value.mtime + 10_000);
  await utimes(graph, later, later);
  const after = await adapter.statFile('graph.json');
  assert.equal(after.value.size, before.value.size);
  assert.notEqual(after.value.mtime, before.value.mtime);
  assert.equal((await api.stat(markdown)).size, Buffer.byteLength('# 原文'));
  assert.deepEqual(await adapter.statFile('missing.json'), ok(null));
  assert.equal(await api.stat(path.join(root, 'missing.md')), null);

  const neighboring = path.join(root, '..', 'neighboring');
  await mkdir(neighboring);
  await writeFile(path.join(neighboring, 'private.md'), '# 私有内容');
  await symlink(neighboring, path.join(root, 'link'), 'junction');
  assert.deepEqual(await adapter.statFile('../neighboring/private.md'), err('Invalid file path'));
  assert.equal((await api.stat(path.join(neighboring, 'private.md'))).error, 'Access denied');
  assert.equal((await api.stat(path.join(root, 'link', 'private.md'))).error, 'Access denied');
});
