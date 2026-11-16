import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import fsSync from 'node:fs';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';

const { createFilePoller } = createRequire(import.meta.url)('../electron/file-poller.cjs');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const ioError = code => Object.assign(new Error(code), { code });
const fileEntry = name => ({ name, isSymbolicLink: () => false, isDirectory: () => false, isFile: () => true });
const directoryEntry = name => ({ name, isSymbolicLink: () => false, isDirectory: () => true, isFile: () => false });
const fakeStat = (mtimeMs = 1, size = 20) => ({ mtimeMs, size, isSymbolicLink: () => false, isFile: () => true });

async function withDirectory(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nodespace-poller-test-'));
  try { await run(directory); }
  finally {
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('nodespace-poller-test-'));
    await fs.rm(resolved, { recursive: true, force: true });
  }
}

test('polling establishes a quiet baseline and detects modified, created and deleted graph and Vault resources', async () => withDirectory(async directory => {
  await fs.mkdir(path.join(directory, '资料'));
  await fs.mkdir(path.join(directory, '.obsidian'));
  await fs.mkdir(path.join(directory, 'node_modules'));
  const graph = path.join(directory, '想法.json'), note = path.join(directory, '资料', '原文.md'), audio = path.join(directory, '资料', '雨声.mp3');
  await fs.writeFile(graph, '{"nodes":[],"edges":[],"groups":[]}');
  await fs.writeFile(note, '# 原文\n保留所有空格  \n');
  await fs.writeFile(audio, 'audio');
  await fs.writeFile(path.join(directory, '.obsidian', 'config.json'), '{}');
  await fs.writeFile(path.join(directory, 'node_modules', 'ignored.json'), '{}');
  await fs.writeFile(path.join(directory, 'unrelated.txt'), 'ignored');
  const events = [];
  const poller = createFilePoller({ getRoots: () => [directory], onChange: (...event) => events.push(event) });
  const first = await poller.poll();
  assert.equal(first.files, 3);
  assert.deepEqual(events, []);
  await fs.writeFile(graph, '{"nodes":[{"id":"a"}],"edges":[],"groups":[]}');
  await fs.writeFile(path.join(directory, '资料', '新想法.md'), '# 新想法');
  await fs.unlink(audio);
  await poller.poll();
  assert.deepEqual(events.map(([file, , kind]) => [file, kind]).sort(), [
    ['想法.json', 'modified'], ['资料/新想法.md', 'created'], ['资料/雨声.mp3', 'deleted'],
  ].sort());
  assert.ok(events.every(([, root]) => root === directory));
  assert.equal(await fs.readFile(note, 'utf8'), '# 原文\n保留所有空格  \n');
  assert.equal((await poller.poll()).changes, 0);
  poller.stop();
}));

test('internal writes stay quiet while unrelated changes during writing are retained for the next poll', async () => withDirectory(async directory => {
  const own = path.join(directory, 'own.json'), external = path.join(directory, 'external.md'), removed = path.join(directory, 'removed.md');
  for (const file of [own, external, removed]) await fs.writeFile(file, 'before');
  const events = []; let writing = false;
  const poller = createFilePoller({ getRoots: () => [directory], isWriting: () => writing, onChange: (file, root, kind) => events.push([file, kind]) });
  await poller.poll(); writing = true;
  await fs.writeFile(own, 'saved by app');
  poller.remember(process.platform === 'win32' ? own.toUpperCase() : own, await fs.lstat(own));
  await fs.writeFile(external, 'external change with a different size');
  await fs.writeFile(path.join(directory, 'created.md'), 'created externally');
  await fs.unlink(removed);
  await poller.poll(); assert.deepEqual(events, []);
  writing = false; await poller.poll();
  assert.deepEqual(events.sort(), [['created.md', 'created'], ['external.md', 'modified'], ['removed.md', 'deleted']].sort());
  assert.equal((await poller.poll()).changes, 0);
  poller.stop();
}));

test('a completed app save wins over an older in-flight stat and overlapping ticks share one scan', async () => withDirectory(async directory => {
  const file = path.join(directory, '想法.json'); await fs.writeFile(file, 'before');
  const waiting = deferred(), release = deferred(), events = [];
  let hold = false;
  const io = { ...fs, async lstat(target) {
    const stat = await fs.lstat(target);
    if (hold && target === file) { waiting.resolve(); await release.promise; }
    return stat;
  } };
  const poller = createFilePoller({ getRoots: () => [directory], io, onChange: (...event) => events.push(event) });
  await poller.poll(); hold = true;
  const running = poller.poll(); await waiting.promise;
  assert.equal(poller.poll(), running);
  await fs.writeFile(file, 'new app content'); poller.remember(file, await fs.lstat(file));
  hold = false; release.resolve(); await running;
  await poller.poll(); assert.deepEqual(events, []);
  poller.stop();
}));

test('an app file created after directory enumeration is not mistaken for a deletion', async () => withDirectory(async directory => {
  const waiting = deferred(), release = deferred(), events = [];
  let hold = false;
  const io = { ...fs, async readdir(target, options) {
    const entries = await fs.readdir(target, options);
    if (hold) { waiting.resolve(); await release.promise; }
    return entries;
  } };
  const poller = createFilePoller({ getRoots: () => [directory], io, onChange: (...event) => events.push(event) });
  await poller.poll(); hold = true;
  const running = poller.poll(); await waiting.promise;
  const file = path.join(directory, 'new.json');
  await fs.writeFile(file, '{}'); poller.remember(file, await fs.lstat(file));
  hold = false; release.resolve(); await running; await poller.poll();
  assert.deepEqual(events, []);
  poller.stop();
}));

test('temporary permission failures preserve known files instead of reporting false deletions', async () => withDirectory(async directory => {
  const folder = path.join(directory, '资料'), file = path.join(folder, '原文.md');
  await fs.mkdir(folder); await fs.writeFile(file, 'before');
  let inaccessible = false;
  const events = [];
  const io = { ...fs, async readdir(target, options) {
    if (inaccessible && target === folder) throw ioError('EACCES');
    return fs.readdir(target, options);
  } };
  const poller = createFilePoller({ getRoots: () => [directory], io, onChange: (file, root, kind) => events.push([file, kind]) });
  await poller.poll(); inaccessible = true;
  await fs.writeFile(file, 'changed while inaccessible');
  await poller.poll(); assert.deepEqual(events, []);
  inaccessible = false; await poller.poll();
  assert.deepEqual(events, [['资料/原文.md', 'modified']]);
  poller.stop();
}));

test('nested allowed roots scan once and metadata I/O remains bounded', async () => {
  const root = path.resolve(os.tmpdir(), 'nodespace-fake-root');
  let active = 0, maximum = 0, reads = 0;
  const io = {
    async readdir(target) { reads++; assert.equal(target, root); return Array.from({ length: 50 }, (_, index) => fileEntry(`${index}.md`)); },
    async lstat() { active++; maximum = Math.max(maximum, active); await new Promise(setImmediate); active--; return fakeStat(); },
  };
  const poller = createFilePoller({ getRoots: () => [path.join(root, 'nested'), root, root], io, concurrency: 8, onChange() { assert.fail('Initial scan must be quiet'); } });
  const result = await poller.poll();
  assert.equal(result.files, 50); assert.equal(reads, 1); assert.equal(maximum, 8);
  poller.stop();
});

test('a directory replaced by a link is never traversed and unrelated extensions are not statted', async () => {
  const root = path.resolve(os.tmpdir(), 'nodespace-fake-links'), child = path.join(root, 'link');
  const io = {
    async readdir(target) { assert.equal(target, root); return [directoryEntry('link'), directoryEntry('.git'), directoryEntry('node_modules'), fileEntry('ignored.txt')]; },
    async lstat(target) { assert.equal(target, child); return { isSymbolicLink: () => true }; },
  };
  const poller = createFilePoller({ getRoots: () => [root], io, onChange() { assert.fail('No followed links'); } });
  assert.equal((await poller.poll()).files, 0);
  poller.stop();
});

test('stopping during an asynchronous scan cancels notifications and future timer work', async () => {
  const root = path.resolve(os.tmpdir(), 'nodespace-fake-stop'), waiting = deferred(), release = deferred();
  let reads = 0;
  const io = {
    async readdir() { reads++; waiting.resolve(); await release.promise; return [fileEntry('note.md')]; },
    async lstat() { assert.fail('Stopped work must not continue'); },
  };
  const poller = createFilePoller({ getRoots: () => [root], io, onChange() { assert.fail('Stopped scans must stay quiet'); } });
  const running = poller.poll(); await waiting.promise;
  poller.stop(); release.resolve(); await running;
  assert.equal(await poller.poll(), null); assert.equal(reads, 1);
});

test('file sizes detect changes on coarse timestamp filesystems and failed file stats do not delete known files', async () => {
  const root = path.resolve(os.tmpdir(), 'nodespace-fake-stat');
  const events = []; let size = 20, failure = false;
  const io = {
    async readdir() { return [fileEntry('note.md')]; },
    async lstat() { if (failure) throw ioError('EACCES'); return fakeStat(1000, size); },
  };
  const poller = createFilePoller({ getRoots: () => [root], io, onChange: (file, owner, kind) => events.push([file, kind]) });
  await poller.poll(); failure = true; size = 40;
  await poller.poll(); assert.deepEqual(events, []);
  failure = false; await poller.poll();
  assert.deepEqual(events, [['note.md', 'modified']]);
  poller.stop();
});

test('Electron boot, self-write suppression, watcher retry and quit cleanup use the asynchronous poller', async () => withDirectory(async directory => {
  const require = createRequire(import.meta.url), handlers = new Map(), lifecycle = new Map(), timeouts = new Map(), intervals = new Map();
  const watchers = [], messages = [], asynchronousReads = [];
  let ready, poller, timerId = 0;
  const nativeFs = { ...fsSync, promises: { ...fsSync.promises, async readFile(...args) {
    asynchronousReads.push(args[0]); return fsSync.promises.readFile(...args);
  } }, watch(_directory, _options, notify) {
    const watcher = new EventEmitter(); watcher.closed = 0; watcher.close = () => watcher.closed++;
    watcher.notify = notify;
    watchers.push(watcher); return watcher;
  } };
  class BrowserWindow {
    webContents = { send: (...message) => messages.push(message) };
    loadFile() {} on() {} isDestroyed() { return false; }
  }
  const electron = {
    app: { getPath: () => directory, whenReady: () => ({ then(callback) { ready = callback; } }), on: (event, callback) => lifecycle.set(event, callback) },
    BrowserWindow, dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [path.join(directory, '选择的原文.txt')] }) }, Menu: { setApplicationMenu() {} }, shell: {},
    ipcMain: { handle: (name, callback) => handlers.set(name, callback), on() {} },
  };
  const source = await fs.readFile(new URL('../electron/main.cjs', import.meta.url), 'utf8');
  const sandbox = {
    require: name => name === 'electron' ? electron : name === 'fs' ? nativeFs
      : name === './file-poller.cjs' ? { createFilePoller(options) { poller = createFilePoller(options); return poller; } }
        : name.startsWith('./') ? require(`../electron/${name.slice(2)}`) : require(name),
    __dirname: path.resolve('electron'), process: { platform: process.platform, pid: process.pid, env: {} }, console,
    setTimeout: (callback, delay) => { const id = ++timerId; timeouts.set(id, { callback, delay }); return { id, unref() {} }; },
    clearTimeout: timer => timeouts.delete(timer?.id),
    setInterval: (callback, delay) => { const id = ++timerId; intervals.set(id, { callback, delay }); return { id, unref() {} }; },
    clearInterval: timer => intervals.delete(timer?.id),
  };
  vm.runInNewContext(source, sandbox, { filename: 'electron/main.cjs' });
  try {
    ready(); await poller.poll();
    const attachment = path.join(directory, '选择的原文.txt'), sibling = path.join(directory, '旁边的原文.txt');
    await fs.writeFile(attachment, '# 原文\n\n  保留空白  \n');
    await fs.writeFile(sibling, 'unselected');
    assert.equal((await handlers.get('fs-read-file')(null, attachment)).error, 'Access denied');
    assert.equal(await handlers.get('dialog-open-file')(), attachment);
    assert.equal(await handlers.get('fs-read-file')(null, attachment), '# 原文\n\n  保留空白  \n');
    assert.ok(asynchronousReads.includes(attachment));
    assert.equal((await handlers.get('fs-read-file')(null, sibling)).error, 'Access denied');
    assert.equal((await handlers.get('fs-write-file')(null, attachment, 'overwrite')).error, 'Access denied');
    assert.equal((await handlers.get('fs-delete')(null, attachment)).error, 'Access denied');
    assert.equal((await handlers.get('fs-rename')(null, attachment, sibling)).error, 'Access denied');
    assert.equal(await fs.readFile(attachment, 'utf8'), '# 原文\n\n  保留空白  \n');
    assert.equal(watchers.length, 1);
    assert.equal(intervals.size, 1);
    const root = path.join(directory, 'NodeSpace'), own = path.join(root, '自己的图.json');
    assert.equal((await handlers.get('fs-write-file')(null, own, '{"nodes":[]}')).ok, true);
    await poller.poll(); assert.deepEqual(messages, []);
    for (const [id, timer] of [...timeouts]) if (timer.delay === 300) { timeouts.delete(id); timer.callback(); }
    await fs.writeFile(path.join(root, '原文.md'), '# 外部原文');
    await fs.writeFile(path.join(root, '外部图.json'), '{}');
    await poller.poll();
    for (const [id, timer] of [...timeouts]) if (timer.delay === 500) { timeouts.delete(id); timer.callback(); }
    assert.deepEqual(messages, [['vault-file-change', '原文.md'], ['file-external-change', '外部图']]);
    watchers[0].emit('error', new Error('Watcher disconnected'));
    assert.equal(watchers[0].closed, 1);
    assert.ok([...timeouts.values()].some(timer => timer.delay === 5000));
    lifecycle.get('will-quit')();
    assert.equal(intervals.size, 0);
    assert.equal(timeouts.size, 0);
    assert.equal(await poller.poll(), null);
    watchers[0].notify('change', '延迟通知.json');
    watchers[0].notify('change', '延迟通知.md');
    assert.equal(timeouts.size, 0);
    assert.equal(messages.length, 2);
  } finally { lifecycle.get('will-quit')?.(); }
}));
