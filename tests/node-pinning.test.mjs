import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const ts = createRequire(import.meta.url)('typescript');
const source = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
const main = ts.createSourceFile('main.ts', source, ts.ScriptTarget.ES2022, true);
const compile = code => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function implementation(name, context) {
  let code;
  const visit = node => {
    if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name?.getText(main) === name) code = node;
    if (!code) ts.forEachChild(node, visit);
  };
  visit(main);
  assert.ok(code, name);
  const declaration = ts.isVariableDeclaration(code) ? `const ${code.getText(main)};` : code.getText(main);
  return new Function('context', `with (context) { ${compile(declaration)}; return ${name}; }`)(context);
}

function fixture() {
  const saves = [], history = [], calls = [];
  const runtime = index => ({
    graph: { nodes: [{ id: 'a', x: index, y: 0 }, { id: 'b', x: index, y: 20 }], edges: [], groups: [] },
    undoManager: { pushSnapshot(graph) { history.push(structuredClone(graph)); } },
  });
  const primaryRuntime = runtime(0), focusedRuntime = runtime(1);
  let nodes = [{ id: 'a', x: 25, y: 37 }, { id: 'b', x: 60, y: 78 }];
  const sim = {
    nodes(value) { if (value) { calls.push('refresh force'); nodes = value; return sim; } return nodes; },
    alpha(value) { return value === undefined ? 0 : sim; },
    alphaTarget() { return sim; }, restart() { return sim; },
  };
  const manager = { getSim: () => sim, isStaticMode: () => false, getDragNode: () => null };
  focusedRuntime.simManager = manager;
  class SemanticLayoutController {}
  const primary = { index: 0, runtime: primaryRuntime };
  const pane = {
    index: 1, runtime: focusedRuntime, activeMode: 'auto', savedFixedNodes: [], layout: { current: new SemanticLayoutController() },
    currentAnimationCancel: () => calls.push('cancel automatic movement'),
  };
  const context = {
    PANE_LEFT: 0, primaryRuntime, coordinateLayoutModes: new Set(), SemanticLayoutController,
    scopedPaneGraph: owner => owner.structureView?.graph ?? owner.runtime.graph,
    scopedPaneSimulationManager: owner => owner.runtime.simManager,
    canMutateCanvasPane: owner => owner.runtime.graph.settings?.sourceMode !== 'vault-readonly',
    isPaneStructureProxyNode: (view, id) => Boolean(view?.proxyNodeIds?.has(id)),
    isCrossSpaceProxyNode: node => Boolean(node?._localContextProxy),
    allPaneOwners: () => [primary, pane], temporaryNodeAnchors: new WeakSet(nodes),
    scheduleSaveForRuntime: runtime => saves.push({ runtime, graph: structuredClone(runtime.graph) }),
    draw: () => calls.push('draw'),
  };
  return { pane, focusedRuntime, primaryRuntime, saves, history, calls, context, sim, manager,
    pin: implementation('setPaneNodesFixed', context) };
}

test('batch pinning stores visible positions and records one undo and save in the originating split', () => {
  const f = fixture();
  const before = structuredClone(f.focusedRuntime.graph);
  assert.equal(f.pin(f.pane, ['a', 'b', 'a']), true);
  assert.deepEqual(f.history, [before]);
  assert.equal(f.saves[0].runtime, f.focusedRuntime);
  assert.deepEqual(f.saves[0].graph.nodes, [
    { id: 'a', x: 25, y: 37, fixed: true, fx: 25, fy: 37 },
    { id: 'b', x: 60, y: 78, fixed: true, fx: 60, fy: 78 },
  ]);
  assert.deepEqual(f.sim.nodes(), f.saves[0].graph.nodes);
  assert.deepEqual(f.calls, ['cancel automatic movement', 'refresh force', 'draw']);
  assert.equal(f.primaryRuntime.graph.nodes[0].fixed, undefined);
  assert.ok(f.sim.nodes().every(node => !f.context.temporaryNodeAnchors.has(node)));
  assert.equal(f.pin(f.pane, ['a', 'b'], true), false);
  assert.equal(f.history.length, 1);
  assert.equal(f.pin(f.pane, ['a', 'b']), true);
  assert.ok(f.saves[1].graph.nodes.every(node => !node.fixed && node.fx === null && node.fy === null));
});

test('pinning rejects stale views, read-only data and pane proxies without partial writes', () => {
  const f = fixture();
  const before = structuredClone(f.focusedRuntime.graph);
  assert.equal(f.pin(f.pane, ['a'], true, before), false);
  f.pane.structureView = { graph: f.focusedRuntime.graph, proxyNodeIds: new Set(['b']) };
  assert.equal(f.pin(f.pane, ['a', 'b']), false);
  f.focusedRuntime.graph.settings = { sourceMode: 'vault-readonly' };
  assert.equal(f.pin(f.pane, ['a']), false);
  assert.deepEqual(f.focusedRuntime.graph.nodes, before.nodes);
  assert.deepEqual(f.history, []);
  assert.deepEqual(f.saves, []);
});

test('a temporary force-layout anchor cannot release an explicit pin', () => {
  const f = fixture(), timers = [];
  f.context.simManager = f.manager;
  f.context.setTimeout = callback => timers.push(callback);
  f.context.requestAnimationFrame = () => assert.fail('The retired anchor should not schedule a frame');
  const add = implementation('addNodeToSim', f.context);
  const node = { id: 'new', x: 19, y: -31 };
  f.focusedRuntime.graph.nodes.push(node);
  add(node);
  assert.equal(timers.length, 1);
  assert.equal(f.pin(f.pane, ['new'], true), true);
  timers[0]();
  const simulated = f.sim.nodes().find(node => node.id === 'new');
  assert.deepEqual([simulated.fixed, simulated.fx, simulated.fy], [true, 19, -31]);
});

test('force-layout hot reload preserves incoming pins and yields to manual pinning during entry', () => {
  const f = fixture();
  const graph = f.focusedRuntime.graph;
  const pinned = { id: 'fixed', x: 85, y: -14, fixed: true };
  const free = { id: 'free', x: 77, y: 42, fixed: false };
  graph.nodes.push(pinned, free);
  f.focusedRuntime.saveGeneration = 1;
  let animation;
  const context = {
    graph, targetRuntime: f.focusedRuntime, primaryRuntime: f.focusedRuntime, reloadGeneration: 1,
    simManager: f.manager, pixi: { viewport: { center: { x: 10, y: 10 } } },
    addedNodes: [pinned, free], removedNodeIds: [], newEdgesClean: [], EASING: {},
    startNodeAnimation: options => { animation = options; },
  };
  const start = source.indexOf('// 8) 增量更新：');
  const end = source.indexOf('// 外部版本已成为当前权威数据', start);
  assert.ok(start > 0 && end > start);
  new Function('context', `with (context) { ${compile(source.slice(start, end))} }`)(context);

  assert.deepEqual([pinned.x, pinned.y], [85, -14]);
  const simulated = f.sim.nodes().find(node => node.id === pinned.id);
  assert.deepEqual([simulated.fixed, simulated.fx, simulated.fy], [true, 85, -14]);
  assert.equal(animation.getTarget(pinned), null);
  assert.deepEqual(animation.getTarget(free), { x: 77, y: 42 });
  context.targetRuntime.saveGeneration++;
  assert.equal(animation.getTarget(free), null);
  context.targetRuntime.saveGeneration--;
  assert.equal(f.pin(f.pane, [free.id], true), true);
  assert.equal(animation.getTarget(free), null);
  assert.deepEqual([free.x, free.y, free.fx, free.fy], [10, 10, 10, 10]);
});

test('switching a split to force layout preserves the pin before and after the transition', () => {
  const f = fixture(), { context } = f;
  const graph = f.focusedRuntime.graph;
  const pinned = Object.assign(graph.nodes[0], { x: 16, y: 12, fixed: true, fx: 16, fy: 12 });
  let animation;
  f.pane.layout.clear = () => {};
  f.pane.simManager = f.manager;
  f.manager.setStaticMode = () => {};
  f.manager.initSim = () => f.sim.nodes(structuredClone(graph.nodes));
  Object.assign(context, {
    withFocusedPane: callback => callback(), focusedExtraPane: () => f.pane, focusedPaneIndex: 1,
    extraPanes: [f.pane], simManager: f.manager, currentAnimationCancel: null, activeMode: 'auto', graph,
    saveFixedState: () => { context.savedFixedNodes = structuredClone(graph.nodes); }, savedGroupModes: [],
    syncFocusedCommands() {}, renderModeBar() {}, collectPaneSettings: pane => ({ layoutMode: pane.activeMode }),
    _skipDraw: false, LAYOUT_ANIM_DURATION: 900,
    EASING: { smoothStep: value => value },
    startNodeAnimation: options => { animation = options; return () => {}; },
  });
  implementation('applyLayoutMode', context)('force');
  assert.deepEqual(f.saves[0].runtime, f.focusedRuntime);
  assert.deepEqual([pinned.fixed, pinned.fx, pinned.fy], [true, 16, 12]);
  assert.equal(animation.getTarget(pinned), null);
  const free = graph.nodes[1];
  f.sim.nodes()[1].x = 50;
  context.graph = f.primaryRuntime.graph;
  context.simManager = { getSim: () => assert.fail('The transition must stay in the originating pane') };
  assert.equal(animation.getTarget(free).x, 50);
  animation.onComplete();
  assert.deepEqual([pinned.fixed, pinned.fx, pinned.fy], [true, 16, 12]);
  assert.deepEqual(f.sim.nodes()[0], pinned);
});

test('tree layout holds only manual pins and keeps explicit changes for the next layout', () => {
  const f = fixture();
  const { graph } = f.focusedRuntime;
  const [pinned, free] = graph.nodes;
  Object.assign(pinned, { x: 150, y: -120, fixed: true, fx: 150, fy: -120 });
  f.pane.savedFixedNodes = structuredClone(graph.nodes);
  f.pane.activeMode = 'tree';
  let animation;
  Object.assign(f.context, {
    graph, simManager: f.manager, currentAnimationCancel: null,
    getStructureProjection: model => model,
    computeTreeLayout: () => ({
      positions: new Map([[pinned.id, { x: 0, y: -50 }], [free.id, { x: 0, y: 50 }]]),
      treeEdgeIndices: [], crossEdgeIndices: [], parentByNode: new Map(),
    }),
    startNodeAnimation: options => { animation = options; return () => {}; },
    EASING: {},
  });
  f.sim.stop = () => {};
  f.manager.setStaticMode = () => {};
  f.manager.initStatic = () => {};
  implementation('applyTreeLayoutV3', f.context)(f.focusedRuntime);
  assert.equal(animation.getTarget(pinned), null);
  assert.deepEqual(animation.getTarget(free), { x: 0, y: 50 });
  assert.equal(animation.fixOnComplete, undefined);
  Object.assign(free, { x: 0, y: 50, fx: 0, fy: 50 });
  animation.onComplete();
  assert.deepEqual([pinned.x, pinned.y, pinned.fixed], [150, -120, true]);
  assert.deepEqual([free.fx, free.fy], [null, null]);
  assert.equal(f.pin(f.pane, [pinned.id], false), true);
  assert.equal(f.pane.savedFixedNodes[0].fixed, false);
});

test('cycling grid snap keeps manual pins and saves the originating split settings', () => {
  const f = fixture();
  const left = { index: 0, runtime: f.primaryRuntime };
  const anotherViewOfSplit = { index: 2, runtime: f.focusedRuntime };
  Object.assign(f.pane, { gridSp: 20, gridSnapEnabled: false, partialGridSnap: false });
  const pinned = { id: 'a', x: 0, y: 0, fixed: true, fx: 0, fy: 0 };
  const free = { id: 'b', x: 4, y: 5, fixed: false, fx: null, fy: null };
  f.focusedRuntime.graph.nodes = structuredClone([pinned, free]);
  f.sim.nodes(structuredClone([pinned, free]));
  const settings = [];
  Object.assign(f.context, {
    paneRuntime: pane => pane.runtime,
    paneRuntimeGraph: pane => pane.runtime.graph,
    allPaneOwners: () => [left, f.pane, anotherViewOfSplit],
    collectSettings: () => assert.fail('The unrelated left pane must not be saved'),
    collectPaneSettings: pane => [pane.gridSnapEnabled, pane.partialGridSnap],
    scheduleSaveForRuntime: (runtime, value) => settings.push({ runtime, value }),
  });
  f.context.snapPosToGrid = implementation('snapPosToGrid', f.context);
  f.context.applyGridSnapLayout = implementation('applyGridSnapLayout', f.context);
  const cycle = implementation('cycleGridSnapForPane', f.context);

  const modes = [[false, true], [true, false], [false, false]];
  for (const mode of modes) {
    cycle(f.pane);
    assert.deepEqual([f.pane.gridSnapEnabled, f.pane.partialGridSnap], mode);
    assert.deepEqual([anotherViewOfSplit.gridSnapEnabled, anotherViewOfSplit.partialGridSnap], mode);
    assert.deepEqual(f.focusedRuntime.graph.nodes[0], pinned);
    assert.deepEqual(f.sim.nodes()[0], pinned);
  }
  assert.deepEqual(settings, modes.map(value => ({ runtime: f.focusedRuntime, value })));
  assert.deepEqual(f.focusedRuntime.graph.nodes[1], { ...free, x: -20, y: -20 });
  assert.deepEqual(f.sim.nodes()[1], f.focusedRuntime.graph.nodes[1]);
  assert.equal(left.gridSnapEnabled, undefined);
});
