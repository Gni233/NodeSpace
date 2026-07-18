import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolveInside } from '../mcp-server/path-utils.js';

const require = createRequire(import.meta.url);
const { isPathInside } = require('../electron/path-guard.cjs');
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function importTypeScriptModule(filePath, dependencies = {}) {
  let source = await readFile(filePath, 'utf8');
  for (const [specifier, dependencyPath] of Object.entries(dependencies)) {
    const dependencySource = await readFile(dependencyPath, 'utf8');
    const dependencyOutput = ts.transpileModule(dependencySource, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const dependencyUrl = `data:text/javascript;base64,${Buffer.from(dependencyOutput).toString('base64')}`;
    source = source.replace(`from '${specifier}'`, `from '${dependencyUrl}'`);
  }
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

test('path guards allow descendants but reject sibling-prefix and traversal paths', () => {
  const base = path.join(root, 'data');
  assert.equal(isPathInside(base, path.join(base, 'graph.json')), true);
  assert.equal(isPathInside(base, base), true);
  assert.equal(isPathInside(base, path.join(root, 'data-copy', 'graph.json')), false);
  assert.equal(isPathInside(base, path.join(base, '..', 'secret.json')), false);

  assert.equal(resolveInside(base, 'folder', 'graph.json'), path.join(base, 'folder', 'graph.json'));
  assert.throws(() => resolveInside(base, '..', 'secret.json'), /Access denied/);
});

test('layout slots isolate controller lifecycle per pane', async () => {
  const { LayoutSlot } = await importTypeScriptModule(path.join(root, 'src', 'layout-controller.ts'));
  const events = [];
  const controller = (mode) => ({
    mode,
    deactivate: () => events.push(`deactivate:${mode}`),
    onGraphChanged: () => events.push(`change:${mode}`),
  });
  const left = new LayoutSlot();
  const right = new LayoutSlot();
  const leftCard = controller('cardgrid');
  const leftCategory = controller('category');
  const rightCard = controller('cardgrid-right');

  left.set(leftCard);
  left.set(leftCard);
  right.set(rightCard);
  left.onGraphChanged();
  assert.deepEqual(events, ['change:cardgrid']);

  left.set(leftCategory);
  assert.deepEqual(events, ['change:cardgrid', 'deactivate:cardgrid']);
  assert.equal(right.current, rightCard);

  left.clear();
  assert.deepEqual(events, ['change:cardgrid', 'deactivate:cardgrid', 'deactivate:category']);
  assert.equal(right.current, rightCard);
  right.onGraphChanged();
  assert.equal(events.at(-1), 'change:cardgrid-right');
});

test('graph runtimes share documents and release clean instances safely', async () => {
  const { GraphRuntime, GraphRuntimeRegistry } = await importTypeScriptModule(path.join(root, 'src', 'graph-runtime.ts'));
  const registry = new GraphRuntimeRegistry();
  const left = {};
  const right = {};
  const graph = { nodes: [{ id: 'a' }], edges: [], groups: [] };
  const runtime = registry.acquire('shared.json', left, () => new GraphRuntime('shared.json', graph, {}));
  const shared = registry.acquire('shared.json', right, () => { throw new Error('must reuse runtime'); });

  assert.equal(shared, runtime);
  assert.equal(runtime.ownerCount, 2);
  shared.graph.nodes.push({ id: 'b' });
  assert.equal(runtime.graph.nodes.length, 2);

  registry.release(runtime, left);
  assert.equal(runtime.ownerCount, 1);
  assert.equal(registry.get('shared.json'), runtime);

  runtime.markDirty();
  registry.release(runtime, right);
  assert.equal(runtime.ownerCount, 0);
  assert.equal(registry.get('shared.json'), runtime);

  runtime.markSaved();
  registry.prune(runtime);
  assert.equal(registry.get('shared.json'), null);

  const renameOwner = {};
  const renamed = registry.acquire('before.json', renameOwner, () => new GraphRuntime('before.json', { nodes: [{ id: 'kept' }], edges: [], groups: [] }, {}));
  const renamedSim = { getSim: () => ({ stop() {} }) };
  renamed.simManager = renamedSim;
  renamed.markDirty();
  assert.equal(registry.rename('before.json', 'after.json'), renamed);
  assert.equal(registry.get('before.json'), null);
  assert.equal(registry.get('after.json'), renamed);
  assert.equal(renamed.fileName, 'after.json');
  assert.equal(renamed.graph.nodes[0].id, 'kept');
  assert.equal(renamed.simManager, renamedSim);
  assert.equal(renamed.dirty, true);
  assert.throws(() => {
    registry.acquire('occupied.json', {}, () => new GraphRuntime('occupied.json'));
    registry.rename('after.json', 'occupied.json');
  }, /already exists/);
  registry.delete('after.json');
  registry.delete('occupied.json');

  const deleted = registry.acquire('deleted.json', {}, () => new GraphRuntime('deleted.json', { nodes: [], edges: [], groups: [] }, {}));
  deleted.markDirty();
  registry.delete('deleted.json');
  assert.equal(registry.get('deleted.json'), null);

  const queued = new GraphRuntime('queue.json', { nodes: [], edges: [], groups: [] }, {});
  const order = [];
  queued.markDirty();
  const first = queued.enqueueSave('first-snapshot', async snapshot => {
    await new Promise(resolve => setTimeout(resolve, 5));
    order.push(snapshot);
    return true;
  });
  const second = queued.enqueueSave('second-snapshot', async snapshot => {
    order.push(snapshot);
    return true;
  });
  assert.deepEqual(await Promise.all([first, second]), [
    { saved: true, current: true, revision: 1 },
    { saved: true, current: true, revision: 1 },
  ]);
  assert.deepEqual(order, ['first-snapshot', 'second-snapshot']);

  queued.markDirty();
  let releaseSave;
  const stale = queued.enqueueSave('stale-snapshot', (_snapshot) => new Promise(resolve => { releaseSave = resolve; }));
  await new Promise(resolve => setTimeout(resolve, 0));
  queued.markDirty();
  releaseSave(true);
  assert.deepEqual(await stale, { saved: true, current: false, revision: 2 });
  assert.equal(queued.markSaved(2), false);
  assert.equal(queued.dirty, true);

  queued.markExternalConflict();
  assert.equal(queued.externalConflict, true);
  queued.clearExternalConflict();
  assert.equal(queued.externalConflict, false);

  let invalidatedRan = false;
  const blocker = queued.enqueueSave('blocker', async () => {
    await new Promise(resolve => setTimeout(resolve, 5));
    return true;
  });
  const invalidated = queued.enqueueSave('invalidated', async () => {
    invalidatedRan = true;
    return true;
  });
  await queued.invalidateSaves();
  await Promise.all([blocker, invalidated]);
  assert.equal(invalidatedRan, false);
});

test('graph snapshots freeze clean data and recovery metadata tracks unsynced writes', async () => {
  const { serializeGraphSnapshot } = await importTypeScriptModule(path.join(root, 'src', 'graph-snapshot.ts'));
  const { createRecoveryStorage } = await importTypeScriptModule(
    path.join(root, 'src', 'recovery-storage.ts'),
    { './storage-keys': path.join(root, 'src', 'storage-keys.ts') },
  );
  const graph = {
    nodes: [{ id: 'a', tags: ['before'], _pieColors: ['#fff'], _runtime: true }],
    edges: [{ source: { id: 'a' }, target: { id: 'b' }, label: 'edge', _createdAt: 1, _conflict: true }],
    groups: [{ id: 'g', label: 'group', _cached: true }],
    settings: { cardViews: { c1: { scale: 2, offsetX: 1, offsetY: 2 } }, graphTheme: 'old' },
  };
  const serialized = serializeGraphSnapshot(graph, { graphTheme: 'new', layoutMode: 'default' });
  graph.nodes[0].tags[0] = 'after';
  graph.settings.cardViews.c1.scale = 9;
  const snapshot = JSON.parse(serialized);
  assert.deepEqual(snapshot.nodes[0].tags, ['before']);
  assert.equal(snapshot.nodes[0]._pieColors, undefined);
  assert.equal(snapshot.edges[0]._createdAt, undefined);
  assert.equal(snapshot.edges[0].source, 'a');
  assert.equal(snapshot.edges[0].target, 'b');
  assert.equal(snapshot.groups[0]._cached, undefined);
  assert.equal(snapshot.settings.graphTheme, 'new');
  assert.equal(snapshot.settings.cardViews.c1.scale, 2);

  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  const recovery = createRecoveryStorage('graph.json', storage);
  assert.equal(recovery.hasUnsynced(), false);
  assert.equal(recovery.writeSnapshot(serialized), true);
  recovery.markUnsynced();
  assert.equal(recovery.hasUnsynced(), true);
  assert.equal(recovery.readSnapshot(), serialized);
  recovery.clearUnsynced();
  assert.equal(recovery.hasUnsynced(), false);
  recovery.delete();
  assert.equal(recovery.readSnapshot(), null);
});

test('mobile toolbar gestures preserve taps and suppress only completed drags', async () => {
  const { MobileToolbarGesture } = await importTypeScriptModule(path.join(root, 'src', 'mobile-toolbar-gesture.ts'));
  const gesture = new MobileToolbarGesture(5);
  gesture.begin(1, 10, 10, true);
  assert.deepEqual(gesture.move(1, 12, 12), { started: false, dragging: false, dx: 2, dy: 2 });
  assert.equal(gesture.end(1), false);
  assert.equal(gesture.consumeClickSuppression(), false);

  gesture.begin(2, 10, 10, true);
  assert.deepEqual(gesture.move(2, 20, 10), { started: true, dragging: true, dx: 10, dy: 0 });
  assert.equal(gesture.end(2), true);
  assert.equal(gesture.consumeClickSuppression(), true);
  assert.equal(gesture.consumeClickSuppression(), false);

  gesture.begin(3, 0, 0, false);
  gesture.move(3, 10, 0);
  gesture.cancel();
  assert.equal(gesture.pointerId, null);
  assert.equal(gesture.consumeClickSuppression(), false);
});

test('card grid uses bounded continuous motion and independent card gestures', async () => {
  const source = await readFile(path.join(root, 'src', 'cardgrid', 'index.ts'), 'utf8');
  const graphSim = await readFile(path.join(root, 'src', 'graph-sim.ts'), 'utf8');
  const interactions = await readFile(path.join(root, 'src', 'cardgrid', 'interactions.ts'), 'utf8');
  const treemap = await readFile(path.join(root, 'src', 'cardgrid', 'treemap.ts'), 'utf8');
  assert.doesNotMatch(source, /n\.x\s*\+=\s*0\.2/);
  assert.doesNotMatch(source, /sim\.alphaTarget\(0\.3\)/);
  assert.match(source, /sim\.alpha\(1\)\.alphaTarget\(0\.018\)\.stop\(\)/);
  assert.match(source, /const ACTIVE_FRAME_MS = 15/);
  assert.match(source, /now < this\._activeFpsUntil \? ACTIVE_FRAME_MS : IDLE_FRAME_MS/);
  assert.doesNotMatch(source, /const nodeMap = new Map<string, any>\(this\._graph\.nodes/);
  assert.match(source, /Math\.max\(0\.45, Math\.min\(2\.5,/);
  assert.match(source, /_viewSaveTimer/);
  assert.match(source, /const dragNodeId = this\._sm\?\.getDragNode\?\.\(\)/);
  assert.match(source, /implements LayoutController/);
  assert.match(source, /delete n\._pieColors/);
  assert.match(source, /onGraphChanged\(\): void/);
  assert.doesNotMatch(source, /if \(gsn\.fx != null \|\| gsn\.fy != null\)/);
  assert.match(graphSim, /return \{ initSim, updateCenter, getSim, setDragNode, getDragNode \}/);
  assert.match(source, /\{ \.\.\.e, source: s, target: t \}/);
  assert.doesNotMatch(source, /\['drag', 'wheel', 'pinch', 'decelerate'\]/);
  assert.match(interactions, /gesture: 'reorder' \| 'pan' \| 'pinch' \| null/);
  assert.match(interactions, /const card = hitCard\([\s\S]*?e\.stopImmediatePropagation\(\);[\s\S]*?if \(!card\) return;/);
  assert.match(interactions, /e\.stopImmediatePropagation\(\)/);
  assert.match(treemap, /card\?\.order/);
  assert.doesNotMatch(treemap, /b\.value/);
});

test('save flow only clears dirty tabs after a successful frozen write', async () => {
  const source = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');
  assert.match(source, /const snapshot = serializeGraphSnapshot\(runtime\.graph, settings\);[\s\S]*?runtime\.enqueueSave\(snapshot, savedSnapshot => writeGraphSnapshot/);
  assert.match(source, /result\.saved && result\.current && runtime\.markSaved\(result\.revision\)/);
  assert.match(source, /const result = await adapter\.writeFile\(fileName, snapshot\);[\s\S]*?recovery\.writeSnapshot\(snapshot\) && recovery\.markUnsynced\(\)/);
  assert.match(source, /clearTransientCategoryVisuals\(parsed\)/);
  assert.match(source, /clearBlobLayer\(pixi\)/);
  assert.match(source, /clearBlobLayer\(pixi1\)/);
  assert.match(source, /clearBlobLayer\(pane\.pixi\)/);
  assert.match(source, /pixi\.blobLayerGfx[\s\S]*?bg\?\.clear\?\.\(\);\s*pixi\.blobLayer\.visible = false/);
  assert.match(source, /onBeforeClose/);
  assert.match(source, /function clearPaneLayout\(pane: Pick<PaneState, 'layout' \| 'pixi' \| 'activeMode'>\)/);
  assert.match(source, /pane\.layout\.clear\(\);\s*pane\.activeMode = 'default'/);
  assert.match(source, /async function loadGraphData\(fileName: string\) \{\s*clearPaneLayout\(pane0\)/);
  assert.match(source, /async function loadGraphForPane\(pane: PaneState, fileName: string\) \{\s*clearPaneLayout\(pane\)/);
  assert.doesNotMatch(source, /let cardGridCtrl/);
  assert.match(source, /targetPane\.layout\.set\(controller\)/);
  assert.match(source, /const scheduleSaveForPane = \(pane: PaneState\)/);
  assert.match(source, /runtimeRegistry\.acquire\(fileName, pane/);
  assert.match(source, /pane\.runtime\.markDirty\(\)/);
  assert.doesNotMatch(source, /pane\.graph = \{ nodes: \[\], edges: \[\], groups: \[\]/);
  assert.match(source, /controller\.saveFn = \(\) => \{[\s\S]*?scheduleSaveForPane\(extraPane\)/);
  assert.match(source, /targetRuntime\.markExternalConflict\(\)/);
  assert.match(source, /if \(runtime\.externalConflict \|\| runtime\.fileOperationActive\) return/);
  assert.match(source, /targetRuntime\.undoManager\?\.pushSnapshot\?\.\(targetRuntime\.graph\)/);
  assert.match(source, /coordinateLayoutModes\.has\(mode\) && targetRuntime\.ownerCount > 1/);
  assert.match(source, /prepareRuntimeForSharing\(existing\)/);
  assert.match(source, /const collectRuntimeSettings = \(runtime: GraphRuntime\)/);
  assert.match(source, /for \(const runtime of runtimeRegistry\.values\(\)\) \{\s*if \(!runtime\.dirty && !runtime\.externalConflict\) continue;\s*const saved = await saveRuntimeNow\(runtime, collectRuntimeSettings\(runtime\)\)/);
  assert.match(source, /runtimeRegistry\.rename\(oldPath, newPath\)/);
  assert.match(source, /for \(const pane of extraPanes\) \{[\s\S]*?pane\.openTabs = replaceTabPath/);
  assert.match(source, /if \(runtime\) await runtime\.invalidateSaves\(\);[\s\S]*?await removeOpenFile\(path\);[\s\S]*?runtimeRegistry\.delete\(path\)/);
  assert.match(source, /migrateOpenFile\(src, dstPath/);
  assert.match(source, /runtime\.fileOperationActive = true;[\s\S]*?await runtime\.invalidateSaves\(\)/);
  assert.match(source, /const finishRuntimeOperation = \(\) => \{[\s\S]*?if \(!runtime\.dirty \|\| runtime\.externalConflict\) return;[\s\S]*?await saveRuntimeNow\(runtime\)/);
  assert.match(source, /targetRuntime\.markExternalConflict\(\);\s*await targetRuntime\.invalidateSaves\(\)/);
  assert.doesNotMatch(source, /g\.nodes\.length === 0\) return/);
});

test('interface keeps low-frequency tools and appearance settings off the canvas layout', async () => {
  const source = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');
  const styles = await readFile(path.join(root, 'index.html'), 'utf8');
  assert.match(source, /primaryRow\.appendChild\(controlsDetails\)/);
  assert.match(source, /controlsRow2\.appendChild\(refreshBtn\)/);
  assert.match(source, /const bottom = 4/);
  assert.match(styles, /\.fg-appearance-panel:not\(\[open\]\) \{ display:none !important; \}/);
  assert.match(styles, /\.fg-tools-content \{\s*position:fixed/);
  assert.match(styles, /@media \(max-width: 720px\)/);
});

test('interface regressions keep panel controls usable and inactive tab close isolated', async () => {
  const main = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');
  const sidebar = await readFile(path.join(root, 'src', 'ui-sidebar.ts'), 'utf8');
  const tabs = await readFile(path.join(root, 'src', 'ui-tabs.ts'), 'utf8');
  const styles = await readFile(path.join(root, 'index.html'), 'utf8');
  const fileSystem = await readFile(path.join(root, 'src', 'file-system.ts'), 'utf8');

  assert.match(main, /rightRail\.appendChild\(appearanceBtn\)/);
  assert.match(main, /modeRow\.hidden = modeCollapsed/);
  assert.match(main, /modeToggle\.setAttribute\('aria-expanded'/);
  assert.match(sidebar, /presetHeader = document\.createElement\('button'\)/);
  assert.match(sidebar, /callbacks\.onApplyPreset\?\.\(''\)/);
  assert.match(tabs, /closest\('\[data-tab-close\]'\)/);
  assert.match(tabs, /closeBtn\.onpointerdown = \(e\) => e\.stopPropagation\(\)/);
  assert.match(styles, /\.fg-mode-switcher\[hidden\] \{ display:none !important; \}/);
  assert.match(styles, /\.fg-status-line \{[\s\S]*?right:82px !important;/);
  assert.match(fileSystem, /const wrote = await writeGraphFile\(newPath, data, h\);\s*if \(!wrote\) return false;\s*\/\/ 删除旧文件/);
});

test('mobile toolbar routes focused-pane commands and keeps touch state synchronized', async () => {
  const main = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');
  const toolbar = await readFile(path.join(root, 'src', 'ui-mobile-toolbar.ts'), 'utf8');
  const undo = await readFile(path.join(root, 'src', 'undo-redo.ts'), 'utf8');

  assert.match(toolbar, /export interface MobileToolbarController \{[\s\S]*?sync\(\): void;[\s\S]*?destroy\(\): void;/);
  assert.match(toolbar, /const createBtn = makeBtn\('\+'/);
  assert.match(toolbar, /const undoBtn = makeBtn\('↩'/);
  assert.match(toolbar, /const linkBtn = makeBtn\('↔'/);
  assert.match(toolbar, /const fitBtn = makeBtn\('◎'/);
  assert.match(toolbar, /const moreBtn = makeBtn\('⋯'/);
  assert.match(toolbar, /menu\.append\(redoBtn, boxBtn\)/);
  assert.match(toolbar, /min-width:44px; height:44px/);
  assert.match(toolbar, /setAttribute\('aria-label'/);
  assert.match(toolbar, /setAttribute\('aria-pressed'/);
  assert.match(toolbar, /setAttribute\('aria-expanded'/);
  assert.match(toolbar, /boxBtn\.disabled = !callbacks\.getBoxSelectEnabled\(\)/);
  assert.match(toolbar, /window\.visualViewport\?\.addEventListener\('resize', updateViewport\)/);
  assert.match(toolbar, /window\.addEventListener\('orientationchange', updateViewport\)/);
  assert.match(toolbar, /const fromButton = !!\(e\.target as Element\)\.closest\('button'\)/);
  assert.match(toolbar, /gesture\.begin\(e\.pointerId[\s\S]*?bar\.setPointerCapture\(e\.pointerId\);[\s\S]*?if \(!fromButton\)/);
  assert.match(toolbar, /if \(move\.started && !bar\.hasPointerCapture\(e\.pointerId\)\)/);
  assert.match(toolbar, /if \(!gesture\.consumeClickSuppression\(\)\) return/);
  assert.doesNotMatch(toolbar, /addEventListener\('touch(?:start|move|end|cancel)'/);

  assert.match(main, /const targetPane = focusedExtraPane\(\);[\s\S]*?createNodeInFocusedPane/);
  assert.match(main, /const runFocusedHistory = \(direction: 'undo' \| 'redo'\)/);
  assert.match(main, /const toggleFocusedLinkMode = \(\)/);
  assert.match(main, /const fitFocusedPane = \(\)/);
  assert.match(main, /appShell\.appendChild\(mobileToolbar\.element\)/);
  assert.match(main, /syncFocusedCommands = \(\) => \{[\s\S]*?mobileToolbar\.sync\(\)/);
  assert.match(main, /switchFocusedPane\([\s\S]*?syncFocusedCommands\(\)/);
  assert.match(main, /finishLinkMode[\s\S]*?syncFocusedCommands\(\)/);
  assert.match(main, /setBoxSelectMode: \(value: boolean\) => \{ boxSelectMode = value; syncFocusedCommands\(\); \}/);
  assert.match(main, /\['cardgrid', 'category', 'fullcat'\]\.includes\(mode\)\) boxSelectMode = false/);
  const mobileCallbacks = main.slice(
    main.indexOf('const mobileToolbar = createMobileToolbar({'),
    main.indexOf('appShell.appendChild(mobileToolbar.element)')
  );
  assert.doesNotMatch(mobileCallbacks, /focusedPaneIndex === PANE_RIGHT/);
  assert.match(main, /const focusedUndoManager = \(\) => focusedExtraPane\(\)\?\.undoManager/);
  assert.match(main, /const createNodeInFocusedPane = \(\) => \{\s*const targetPane = focusedExtraPane\(\)/);

  assert.match(undo, /canUndo\(\): boolean \{\s*return this\.undoStack\.length > 0;/);
  assert.match(undo, /canRedo\(\): boolean \{\s*return this\.redoStack\.length > 0;/);
});
