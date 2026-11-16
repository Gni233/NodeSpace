import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const ts = createRequire(import.meta.url)('typescript');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const read = name => readFile(new URL(`../src/${name}`, import.meta.url), 'utf8');
const importTs = async name => import(`data:text/javascript;base64,${Buffer.from(compile(await read(name))).toString('base64')}`);
const { GraphRuntime, GraphRuntimeRegistry } = await importTs('graph-runtime.ts');
const { serializeGraphSnapshot } = await importTs('graph-snapshot.ts');
const main = ts.createSourceFile('main.ts', await read('main.ts'), ts.ScriptTarget.ES2022, true);
const names = new Set(['clearRuntimeDirty', 'persistRuntimeSnapshot', 'saveRuntimeNow',
  'saveFocusedGraphWithFeedback', 'writeGraphSnapshot', 'reportSaveFailure', 'lastSaveErrorAt']);
const declarations = [];
let loadRightPaneSource, openTabSource;
function visit(node) {
  if (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => names.has(d.name.getText(main)))) {
    declarations.push(node.getText(main));
  }
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'loadGraphDataPane1') loadRightPaneSource = node.getText(main);
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'openTab') openTabSource = node.getText(main);
  ts.forEachChild(node, visit);
}
visit(main);
assert.equal(declarations.length, names.size);
const createSave = new Function('context', `with (context) { ${compile(declarations.join('\n'))}\nreturn saveFocusedGraphWithFeedback; }`);
const loadRightPane = new Function('context', `with (context) { ${compile(loadRightPaneSource)}\nreturn loadGraphDataPane1; }`);
const createOpenTab = new Function('context', `with (context) { ${compile(openTabSource)}\nreturn openTab; }`);

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function fixture() {
  const runtimeRegistry = new GraphRuntimeRegistry();
  const pane = { dirtyTabs: new Set(['extra.json']) };
  const primaryRuntime = runtimeRegistry.acquire('primary.json', {}, () => new GraphRuntime('primary.json'));
  const runtime = runtimeRegistry.acquire('extra.json', pane, () => new GraphRuntime('extra.json'));
  pane.runtime = runtime;
  runtime.graph.nodes.push({ id: 'n', label: '草稿' });
  runtime.markDirty();
  const toasts = [], writes = [], recoveryEvents = [];
  const context = {
    focusedPaneIndex: 1, PANE_LEFT: 0, primaryRuntime, extraPanes: [pane], runtimeRegistry,
    dirtyTabs: new Set(['primary.json']), serializeGraphSnapshot,
    collectSettings: () => ({ gridVis: false }), collectPaneSettings: () => ({ gridVis: true }),
    syncSpaceNavigation() {}, refreshOpenSpaceReferences() {}, internalGraphWriteGuard: { mark() {} },
    mountWritesPaused: false,
    graphRecovery: fileName => ({
      writeSnapshot: snapshot => (recoveryEvents.push([fileName, JSON.parse(snapshot)]), true),
      markUnsynced: () => (recoveryEvents.push('unsynced'), true), clearUnsynced: () => recoveryEvents.push('synced'),
    }),
    adapter: { writeFile: async (fileName, snapshot) => (writes.push([fileName, JSON.parse(snapshot)]), { ok: true, value: true }) },
    confirmAction: async () => false,
    isVaultLocationTabId: name => name.startsWith('vault:'),
    showToast: (message, type) => toasts.push({ message, type }),
  };
  return { context, runtime, primaryRuntime, pane, toasts, writes, recoveryEvents, save: createSave(context) };
}

test('reopening the right split pane preserves the shared graph and its pending save', async t => {
  const fileName = 'shared.json';
  const runtimeRegistry = new GraphRuntimeRegistry();
  const pane1 = { activeTab: fileName, openTabs: [fileName] };
  const runtime = runtimeRegistry.acquire(fileName, {}, () => new GraphRuntime(fileName));
  assert.equal(runtimeRegistry.acquire(fileName, pane1), runtime);
  pane1.runtime = runtime;
  pane1.graph = runtime.graph;
  const node = { id: 'n', label: '准备保存的记录' };
  runtime.graph.nodes.push(node);
  runtime.markDirty();
  const pendingSave = runtime.saveTimeout = setTimeout(() => {}, 10000);
  t.after(() => runtime.cancelPendingSave());
  const sim = { setStaticMode() {}, initSim() {} };
  runtime.simManager = pane1.simManager = sim;
  const noop = () => {};
  let reads = 0;
  const reopen = loadRightPane({
    pane1, pixi1: null, runtimeRegistry, sharedState: {}, DEFAULT_SETTINGS: {}, simManager1: sim, extraSims: [sim],
    PANE_RIGHT: 1, focusedPaneIndex: 0, pane1Container: {}, pane1NodeSprites: new Map(), loadingOverlay: { style: {} },
    beginPaneGraphLoad: () => () => true,
    exitStructureForPane: noop, clearPaneStructureBoundaries: noop, clearPaneLayout: noop, prepareRuntimeForSharing: noop,
    findExistingForFile: () => null, createSimManager: () => sim, applyPaneSettings: noop,
    hydrateGraphResourceReferencePreviews: noop, hydrateGraphSpaceReferences: noop,
    readGraphData: async () => { reads++; return { nodes: [], edges: [], groups: [] }; },
    isBuiltin: () => false, restorePaneOpeningViewport: () => true,
    applyPaneCanvasBg: noop, getAccentColorsForTheme: () => ({}), pixiDrawPane1: noop, setTimeout: noop,
  });

  await reopen(fileName);
  assert.equal(reads, 0);
  assert.equal(pane1.runtime, runtime);
  assert.equal(runtime.ownerCount, 2);
  assert.deepEqual(runtime.graph.nodes, [node]);
  assert.equal(runtime.saveTimeout, pendingSave);
});

test('file navigation preserves the requested split through a slow save and keeps the old graph when saving fails', async () => {
  const left = { index: 0, runtime: new GraphRuntime('left.json') };
  const right = { index: 1, runtime: new GraphRuntime('right.json') };
  let focused = right;
  const saves = [], loads = [], selections = [];
  let committedFile = '';
  const firstSave = deferred();
  const noop = () => {};
  const context = {
    PANE_LEFT: 0, splitActive: true, extraPanes: [right], adapter: {}, hoveredMediaId: '',
    openTabRequests: new WeakMap(),
    commitAppearanceInput: () => { committedFile = focused.runtime.fileName; },
    paneRuntime: pane => pane.runtime, paneLoadedTab: pane => pane.runtime.fileName,
    focusedPaneState: () => focused, sidebar: { syncActiveFile: name => selections.push(name) },
    collectSettings: noop, collectPaneSettings: noop,
    saveRuntimeNow: runtime => {
      assert.equal(committedFile, runtime.fileName);
      saves.push(runtime.fileName);
      return firstSave.promise;
    },
    loadGraphForPane: (pane, fileName) => { loads.push([pane, fileName]); pane.runtime = new GraphRuntime(fileName); },
    clearAllMedia: noop, manuallyOpenedMediaIds: new Set(),
    loadLayouts: noop, renderModeBar: noop, syncSpaceNavigation: noop, persistTabs: noop, draw: noop,
  };
  const openTab = createOpenTab(context);

  const opening = openTab('chosen.json');
  focused = left;
  firstSave.resolve(true);
  await opening;
  assert.deepEqual(saves, ['right.json']);
  assert.deepEqual(loads, [[right, 'chosen.json']]);
  assert.deepEqual(selections, ['left.json']);

  focused = right;
  context.saveRuntimeNow = () => false;
  await openTab('blocked.json');
  assert.equal(loads.length, 1);
  assert.equal(right.runtime.fileName, 'chosen.json');
  assert.equal(selections.at(-1), 'chosen.json');

  context.saveRuntimeNow = () => assert.fail('Reopening the current file should reuse the loaded graph');
  await openTab('chosen.json');
  assert.equal(loads.length, 1);
});

test('manual save reports success only after its captured graph writes and leaves the newly focused graph dirty', async () => {
  const f = fixture();
  const started = deferred(), finish = deferred();
  const writeFile = f.context.adapter.writeFile;
  f.context.adapter.writeFile = async (...args) => {
    started.resolve();
    await finish.promise;
    return writeFile(...args);
  };
  const saving = f.save();
  await started.promise;
  assert.deepEqual(f.toasts, []);
  f.context.focusedPaneIndex = 0;
  f.pane.runtime = f.primaryRuntime;
  f.pane.dirtyTabs.add('primary.json');
  finish.resolve();
  await saving;
  assert.deepEqual(f.writes.map(([file]) => file), ['extra.json']);
  assert.equal(f.writes[0][1].settings.gridVis, true);
  assert.equal(f.runtime.dirty, false);
  assert.deepEqual([...f.pane.dirtyTabs], ['primary.json']);
  assert.deepEqual([...f.context.dirtyTabs], ['primary.json']);
  assert.match(f.toasts[0].message, /已保存.*extra/);
  assert.equal(f.toasts[0].type, 'success');
});

test('a write rejection keeps the graph dirty and preserves an unsynced recovery copy', async () => {
  const f = fixture();
  f.context.adapter.writeFile = async () => { throw new Error('permission denied'); };
  await f.save();
  assert.equal(f.runtime.dirty, true);
  assert.equal(f.pane.dirtyTabs.has('extra.json'), true);
  assert.equal(f.recoveryEvents[0][0], 'extra.json');
  assert.equal(f.recoveryEvents[0][1].nodes[0].label, '草稿');
  assert.equal(f.recoveryEvents[1], 'unsynced');
  assert.deepEqual(f.toasts.map(({ type }) => type), ['error']);
});

test('editing while a save is still writing keeps newer edits visibly unsaved', async () => {
  const f = fixture();
  const finish = deferred();
  f.context.adapter.writeFile = () => finish.promise;
  const saving = f.save();
  await Promise.resolve();
  f.runtime.graph.nodes[0].label = '更新的草稿';
  f.runtime.markDirty();
  finish.resolve({ ok: true, value: true });
  await saving;
  assert.equal(f.runtime.dirty, true);
  assert.equal(f.pane.dirtyTabs.has('extra.json'), true);
  assert.equal(f.recoveryEvents[0][1].nodes[0].label, '草稿');
  assert.deepEqual(f.toasts, []);
});

test('cancelled and failed overwrites preserve external conflict until a successful confirmed write', async () => {
  const f = fixture();
  f.runtime.markExternalConflict();
  await f.save();
  assert.deepEqual(f.writes, []);
  assert.deepEqual(f.toasts, []);
  assert.equal(f.runtime.externalConflict, true);
  f.context.confirmAction = async () => true;
  const writeFile = f.context.adapter.writeFile;
  f.context.adapter.writeFile = async () => ({ ok: true, value: false });
  await f.save();
  assert.equal(f.runtime.externalConflict, true);
  assert.equal(f.runtime.dirty, true);
  f.context.adapter.writeFile = writeFile;
  await f.save();
  assert.equal(f.runtime.externalConflict, false);
  assert.equal(f.runtime.dirty, false);
  assert.equal(f.writes.length, 1);
  assert.equal(f.toasts.at(-1).type, 'success');
});

test('a new external edit invalidates prior overwrite consent and prevents queued writes from starting', async () => {
  const f = fixture();
  const started = deferred(), finish = deferred(), confirm = deferred();
  const inFlight = f.runtime.enqueueSave('previous snapshot', async () => {
    started.resolve();
    await finish.promise;
    return true;
  });
  await started.promise;
  const queued = f.runtime.enqueueSave('queued snapshot', async () => { throw new Error('conflict allowed pending write'); });
  f.runtime.markExternalConflict();
  f.context.confirmAction = () => confirm.promise;
  const saving = f.save();
  f.runtime.markExternalConflict();
  confirm.resolve(true);
  finish.resolve();
  await saving;
  assert.equal((await inFlight).current, false);
  assert.equal((await queued).saved, false);
  assert.deepEqual(f.writes, []);
  assert.equal(f.runtime.externalConflict, true);
  assert.equal(f.toasts[0].type, 'warning');
});

test('read-only projections and active file operations give clear feedback and never write', async () => {
  const f = fixture();
  f.runtime.fileOperationActive = true;
  await f.save();
  f.pane.runtime = new GraphRuntime('vault:notes.md');
  await f.save();
  assert.deepEqual(f.writes, []);
  assert.deepEqual(f.toasts.map(({ type }) => type), ['warning', 'info']);
});
