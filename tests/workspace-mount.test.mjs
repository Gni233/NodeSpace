import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const ts = createRequire(import.meta.url)('typescript');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const read = name => readFile(new URL(`../src/${name}`, import.meta.url), 'utf8');
const url = source => `data:text/javascript;base64,${Buffer.from(compile(source)).toString('base64')}`;
const keys = url(await read('storage-keys.ts'));
const recovery = await import(url((await read('recovery-storage.ts')).replace('./storage-keys', keys)));
const { createWorkbenchHistory } = await import(url(await read('workbench-history.ts')));
const { userFacingGraphPaths } = await import(url(await read('file-tree-visibility.ts')));
const { replacePathName } = await import(url(await read('file-adapter.ts')));
const main = ts.createSourceFile('main.ts', await read('main.ts'), ts.ScriptTarget.ES2022, true);

function createClosures(names, context) {
  const declarations = [];
  const wanted = new Set(names);
  const visit = node => {
    if (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => wanted.has(d.name.getText(main)))) {
      declarations.push(node.getText(main));
    }
    ts.forEachChild(node, visit);
  };
  visit(main);
  assert.equal(declarations.length, names.length);
  return new Function('context', `with(context){${compile(declarations.join('\n'))}\nreturn {${names.join(',')}};}`)(context);
}

function fixture() {
  const calls = [];
  const context = {
    fileSystemMountPath: 'D:/Old', mountedStorageScope: 'electron:d:/old', workspacePickerActive: false, mountWritesPaused: false,
    safIsAvailable: () => false,
    markdownSourceEditor: null, hasActiveTextDraft: () => false,
    flushAllGraphs: async () => (calls.push('flush:old'), true),
    showToast: (...message) => calls.push(message),
    window: {
      electronAPI: {
        openFolder: async () => (calls.push('picker'), 'D:/New'),
        configWrite: async value => (calls.push(value), { ok: true }),
      },
      location: { reload: () => calls.push('reload') },
    },
  };
  return { calls, context, ...createClosures(['saveBeforeWorkspaceSwitch', 'reloadMountedWorkspace', 'openWorkspaceFolder'], context) };
}

test('desktop selects without changing scope, flushes the old workspace, then commits and starts a fresh renderer', async () => {
  const f = fixture();
  await f.openWorkspaceFolder();
  assert.deepEqual(f.calls, ['picker', 'flush:old', { folderPath: 'D:/New', graphFolderRelative: null }, 'reload']);
  assert.equal(f.context.fileSystemMountPath, 'D:/Old');
  assert.equal(f.context.mountedStorageScope, 'electron:d:/old');
  assert.equal(f.context.mountWritesPaused, true);
});

test('a failed flush or canceled selection cannot change the configured desktop workspace', async () => {
  const failed = fixture();
  failed.context.flushAllGraphs = async () => (failed.calls.push('failed'), false);
  await failed.openWorkspaceFolder();
  assert.deepEqual(failed.calls.slice(0, 2), ['picker', 'failed']);
  assert.equal(failed.calls.length, 3);
  assert.equal(failed.context.mountWritesPaused, false);

  const canceled = fixture();
  canceled.context.window.electronAPI.openFolder = async () => null;
  await canceled.openWorkspaceFolder();
  assert.deepEqual(canceled.calls, []);
  assert.equal(canceled.context.workspacePickerActive, false);
});

test('space renaming protects existing names and stays inside the source folder', async () => {
  const calls = [];
  const context = {
    adapter: {
      readFile: async path => ({ ok: true, value: path === '课程/已有.json' ? '{}' : null }),
      renameFile: async (...paths) => (calls.push(paths), { ok: true, value: true }),
    },
    blockForTextDraft: () => false, replacePathName, mountWritesPaused: false,
    isNewGraphPathReserved: () => false,
    showToast() {},
    migrateOpenFile: async (_oldPath, _newPath, operation) => (await operation()).ok,
    refreshFileTree: async () => calls.push('refresh'),
  };
  const { renameSpaceFile } = createClosures(['renameSpaceFile'], context);
  assert.equal(await renameSpaceFile('课程/讲义.json', '../已有'), false);
  assert.equal(await renameSpaceFile('课程/讲义.json', '已有'), false);
  assert.deepEqual(calls, []);
  assert.equal(await renameSpaceFile('课程/讲义.json', '总结.JSON'), true);
  assert.deepEqual(calls, [['课程/讲义.json', '总结.json'], 'refresh']);
});

test('space copies use the live graph and exclusive creation, and reject a missing source', async () => {
  const graph = { nodes: [{ id: 'note' }], edges: [], groups: [] };
  const context = {
    adapter: { suggestCopyName: async () => ({ ok: true, value: '课程/讲义 2.json' }) },
    runtimeRegistry: { get: path => path === '课程/讲义.json' ? { graph } : undefined },
    readGraphData: async () => null,
    writeNewGraph: async (...values) => calls.push(values),
    refreshFileTree: async () => calls.push('refresh'),
  };
  const calls = [];
  const { copySpaceFile } = createClosures(['copySpaceFile'], context);
  assert.equal(await copySpaceFile('课程/讲义.json'), '课程/讲义 2.json');
  assert.deepEqual(calls, [[context.adapter, '课程/讲义 2.json', graph], 'refresh']);
  await assert.rejects(copySpaceFile('课程/找不到.json'), /无法读取源空间/);
  assert.equal(calls.length, 2);
});

test('deleting a space from the wall rechecks the confirmed contents and removes only a file', async () => {
  const calls = [];
  let contents = 'replaced by another app';
  const context = {
    adapter: {
      readFile: async () => ({ ok: true, value: contents }),
      deleteFile: async (path, options) => (calls.push([path, options]), { ok: true, value: true }),
    },
    blockForTextDraft: () => false, mountWritesPaused: false,
    runtimeRegistry: { get: () => null, delete() {} },
    graphRecovery: () => ({ delete() {} }),
    removeOpenFile: async () => {}, showToast() {}, syncSpaceNavigation() {}, persistTabs() {},
    refreshFileTree: async () => calls.push('refresh'),
  };
  const { deleteSpaceFile } = createClosures(['deleteSpaceFile'], context);
  assert.equal(await deleteSpaceFile('笔记.json', 'confirmed graph'), false);
  assert.deepEqual(calls, []);
  contents = 'confirmed graph';
  assert.equal(await deleteSpaceFile('笔记.json', contents), true);
  assert.deepEqual(calls, [['笔记.json', { recursive: false }], 'refresh']);
});

test('closing the last deleted space displays a blank graph instead of seeding a demo', async () => {
  const opened = [];
  const context = {
    _flatTreePaths: ['未命名.json'], openTabs: ['未命名.json'], activeTab: '未命名.json',
    dirtyTabs: new Set(), extraPanes: [], loadGraphData: async path => opened.push(path),
  };
  const { removeOpenFile } = createClosures(['removeOpenFile'], context);
  await removeOpenFile('未命名.json');
  assert.deepEqual(opened, ['未命名 2.json']);
});

test('Android drains writes and pauses the old adapter before the native picker can change its URI', async () => {
  const f = fixture();
  f.context.safIsAvailable = () => true;
  f.context.safPickDirectory = async () => {
    assert.equal(f.context.mountWritesPaused, true);
    f.calls.push('android picker');
    return { name: 'Notes', path: 'content://new' };
  };
  await f.openWorkspaceFolder();
  assert.deepEqual(f.calls, ['flush:old', 'android picker', 'reload']);
  assert.equal(f.context.mountWritesPaused, true);
});

test('browser selects under user activation, keeps the previously saved folder ID, and flushes before persisting it', async () => {
  const f = fixture();
  const newHandle = { name: 'Notes' };
  f.context.window.electronAPI = null;
  f.context.window.showDirectoryPicker = async () => (f.calls.push('browser picker'), newHandle);
  f.context.findSavedFolderId = async handle => (assert.equal(handle, newHandle), 'prior-id');
  f.context.saveFolderHandle = async (handle, id) => (assert.equal(handle, newHandle), f.calls.push(`persist:${id}`), true);
  await f.openWorkspaceFolder();
  assert.deepEqual(f.calls, ['browser picker', 'flush:old', 'persist:prior-id', 'reload']);
});

test('an empty or unreachable mount never shows the browser-local graphs', async () => {
  const results = [{ ok: true, value: [] }, { ok: false, error: 'denied' }];
  const calls = [];
  let wallRefreshes = 0;
  const context = {
    mountedStorageScope: 'electron:d:/new', activeTab: '未命名.json', _flatTreePaths: ['old.json'],
    fileTreeAdapter: null, fileTreeRevision: 0,
    adapter: { listFiles: async () => results.shift() }, reinitAdapter() {},
    userFacingGraphPaths,
    buildFileTree: entries => entries,
    sidebar: { updateFileTree: (...args) => calls.push(args) },
    updateOpenWorkbench: () => { wallRefreshes++; },
    localStorage: new Proxy({}, { get: () => { throw new Error('must not read unscoped storage'); } }),
  };
  const { refreshFileTree } = createClosures(['refreshFileTree'], context);
  await refreshFileTree();
  await refreshFileTree();
  assert.deepEqual(calls, [[[], '未命名.json']]);
  assert.deepEqual(context._flatTreePaths, []);
  assert.equal(wallRefreshes, 1);
});

test('Android uses app storage until a SAF folder has actually been restored', () => {
  const appFiles = {};
  const selectedFolder = {};
  const context = {
    window: {}, fileSystemMountPath: 'graphs', graphStorageMountPath: null, mountedStorageScope: null,
    adapter: {}, adapterScope: 'storage', capApp: true, isHarmony: false,
    safIsAvailable: () => true, getDirHandle: () => null,
    createCapacitorAdapter: () => appFiles, createSAFAdapter: () => selectedFolder,
  };
  const { selectAdapter } = createClosures(['selectAdapter'], context);
  selectAdapter();
  assert.equal(context.adapter, appFiles);
  assert.equal(context.adapterScope, 'capacitor');
  context.fileSystemMountPath = 'Notes';
  context.mountedStorageScope = 'saf:content://provider/tree/Notes';
  selectAdapter();
  assert.equal(context.adapter, selectedFolder);
  assert.equal(context.adapterScope, 'saf');
});

test('library inventory normalizes flat paths and native entries already relative to parent folders', () => {
  const file = name => ({ name, kind: 'file', children: [] });
  const directory = (name, children) => ({ name, kind: 'directory', children });
  const input = [
    directory('Projects', [
      file('opened.json'),
      file('Projects/Unopened.json'),
      directory('Projects/archive', [file('Projects/archive/old.json'), file('nested.json')]),
      file('Projects/__reference_preview.json'),
    ]),
    file('Projects/archive/old.json'), file('flat/FSA.json'),
  ];
  assert.deepEqual(userFacingGraphPaths(input), [
    'Projects/opened.json', 'Projects/Unopened.json', 'Projects/archive/old.json', 'Projects/archive/nested.json', 'flat/FSA.json',
  ]);
});

test('workbench keeps the full inventory in stable order and does not carry order across mounts', () => {
  const adapter = {};
  const inventory = Array.from({ length: 42 }, (_, index) => `nested/space ${String(index).padStart(2, '0')}.json`);
  const models = [];
  const context = {
    adapter, fileTreeAdapter: adapter, _flatTreePaths: [...inventory].reverse(),
    workbenchOrderAdapter: null, workbenchOrder: [], vaultIndex: null, workbenchVaultPath: null,
    focusedPaneState: () => ({ graphTheme: 'paper-light' }), paneLoadedTab: () => 'old-mount-tab.json',
    isBuiltin: id => id === 'demo', isVaultLocationTabId: id => id.startsWith('vault:'), graphTabLabel: id => id.replace(/\.json$/, ''),
    demoEnabled: true, BUILTIN_NAMES: ['demo'], getTheme: () => ({}), workbenchHistory: { showAtStartup: true },
    workbenchHome: { element: { style: { removeProperty() {} } }, update: model => models.push(model) },
  };
  const { updateWorkbench } = createClosures(['isWorkbenchSpace', 'workbenchSpace', 'updateWorkbench'], context);
  updateWorkbench();
  assert.deepEqual(models[0].spaces.map(space => space.id), inventory);
  assert.equal(models[0].current, null);
  assert.deepEqual(models[0].spaces[0], { id: inventory[0], title: 'space 00', detail: 'nested' });

  context._flatTreePaths = ['topical.json', ...inventory.slice(1).reverse()];
  context.paneLoadedTab = () => inventory[2];
  updateWorkbench();
  assert.deepEqual(models[1].spaces.map(space => space.id), [...inventory.slice(1), 'topical.json']);
  assert.equal(models[1].current.id, inventory[2]);

  context.adapter = {};
  context.paneLoadedTab = () => 'demo';
  updateWorkbench();
  assert.deepEqual(models[2].spaces, [{ id: 'demo', title: 'demo', detail: undefined, example: true }]);
  assert.equal(models[2].current.id, 'demo');
});

test('a slow older inventory cannot overwrite a newer scan of the mounted adapter', async () => {
  let finishOld;
  const entries = names => ({ ok: true, value: names.map(name => ({ name, kind: 'file', children: [] })) });
  const context = {
    adapter: { listFiles: () => new Promise(resolve => { finishOld = resolve; }) },
    fileTreeAdapter: null, fileTreeRevision: 0, _flatTreePaths: [], activeTab: '',
    reinitAdapter() {}, userFacingGraphPaths, buildFileTree: paths => paths,
    sidebar: { updateFileTree() {} }, updateOpenWorkbench() {},
  };
  const { refreshFileTree } = createClosures(['refreshFileTree'], context);
  const older = refreshFileTree();
  context.adapter = { listFiles: async () => entries(['new/space.json']) };
  await refreshFileTree();
  finishOld(entries(['old/space.json']));
  await older;
  assert.deepEqual(context._flatTreePaths, ['new/space.json']);
});

test('same-named graphs keep separate recovery snapshots and recent ordering across mounts', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  const browser = recovery.createRecoveryStorage('notes.json', storage);
  const old = recovery.createRecoveryStorage('notes.json', storage, 'electron:d:/old');
  const next = recovery.createRecoveryStorage('notes.json', storage, 'electron:d:/new');
  browser.writeSnapshot('browser');
  old.writeSnapshot('old draft');
  old.markUnsynced();
  assert.equal(next.readSnapshot(), null);
  assert.equal(next.hasUnsynced(), false);
  next.writeSnapshot('new file');
  assert.equal(browser.readSnapshot(), 'browser');
  assert.equal(old.readSnapshot(), 'old draft');
  assert.deepEqual([...values.keys()].filter(key => key.startsWith('fg-data-')), ['fg-data-notes.json']);

  const history = createWorkbenchHistory(storage, 'electron:d:/old');
  history.visit('second.json');
  history.setShowAtStartup(false);
  const another = createWorkbenchHistory(storage, 'electron:d:/new');
  const candidates = ['first.json', 'second.json'];
  const revisited = createWorkbenchHistory(storage, 'electron:d:/old');
  assert.deepEqual(revisited.list(null, candidates), ['second.json']);
  assert.deepEqual(another.list(null, candidates), []);
  assert.equal(another.showAtStartup, false);
});
