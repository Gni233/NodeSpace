import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const asUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const order = await import(asUrl(compile(await readFile(new URL('../src/node-order.ts', import.meta.url), 'utf8'))));
const undoSource = (await readFile(new URL('../src/undo-redo.ts', import.meta.url), 'utf8'))
  .replace("'./toast'", `'${asUrl('export const showToast = () => {};')}'`);
const { UndoManager } = await import(asUrl(compile(undoSource)));
const main = ts.createSourceFile('main.ts', await readFile(new URL('../src/main.ts', import.meta.url), 'utf8'), ts.ScriptTarget.ES2022, true);
const events = ts.createSourceFile('ui-events.ts', await readFile(new URL('../src/ui-events.ts', import.meta.url), 'utf8'), ts.ScriptTarget.ES2022, true);

// Exercise the actual application closures with their platform boundaries supplied.
function closure(file, name, context) {
  let initializer;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name) initializer = node.initializer;
    if (!initializer) ts.forEachChild(node, visit);
  };
  visit(file);
  assert.ok(initializer, name);
  const output = compile(`const handler = ${initializer.getText(file)};`);
  return new Function('context', `with (context) { ${output}\nreturn handler; }`)(context);
}

function creationContext(graph) {
  const context = {
    graph, undoManager: new UndoManager(), primaryRuntime: {}, defArrow: true,
    focusedExtraPane: () => null,
    focusedInteractionBlocked: () => false,
    isStructureNode: node => !!node.structure,
    createNodeId: order.createNodeId,
    assignCreatedOrder: order.assignCreatedOrder,
    simManager: { getSim: () => ({ nodes: () => graph.nodes }) },
    selected: [], saved: [],
    selectAndEditFocusedNode: (id, pane) => context.selected.push([id, pane]),
    scheduleSave: () => context.saved.push('primary'),
    scheduleSaveForPane: pane => context.saved.push(pane),
    pane0: {}, beginNodeTitleEditForPane() {},
    reinitializeRuntimeViews() {}, syncFocusedCommands() {}, draw() {}, showToast() {},
  };
  return context;
}

test('a new branch creates one node and edge, with one atomic undo and redo', () => {
  const graph = { nodes: [{ id: 'root', headingLevel: 2, createdOrder: 0, x: 10, y: 20 }], edges: [], groups: [] };
  const before = structuredClone(graph);
  const context = creationContext(graph);
  const create = closure(main, 'createChildNodeForPane', context);
  const id = create('root', null, { x: 240, y: -90, dashed: true });
  assert.equal(graph.nodes.length, 2);
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.nodes[1].id, id);
  assert.deepEqual([graph.nodes[1].x, graph.nodes[1].y, graph.nodes[1].headingLevel], [240, -90, 3]);
  assert.deepEqual([graph.edges[0].source, graph.edges[0].target, graph.edges[0].lineStyle], ['root', id, 'dash-2']);
  assert.deepEqual(context.selected, [[id, null]]);
  assert.deepEqual(context.saved, ['primary']);
  assert.equal(context.undoManager.undo(graph), true);
  assert.deepEqual(graph, before);
  assert.equal(context.undoManager.canUndo(), false);
  assert.equal(context.undoManager.redo(graph), true);
  assert.equal(graph.nodes[1].id, id);
  assert.equal(graph.edges[0].target, id);
});

test('branch creation stays within its pane and rejects read-only or stale sources', () => {
  const primary = { nodes: [{ id: 'primary', createdOrder: 0 }], edges: [], groups: [] };
  const graph = { nodes: [{ id: 'root', headingLevel: 6, createdOrder: 0 }], edges: [], groups: [] };
  const context = creationContext(primary);
  const pane = { graph, runtime: {}, undoManager: new UndoManager(), defArrow: false };
  const create = closure(main, 'createChildNodeForPane', context);
  const id = create('root', pane, { x: 4, y: 8 });
  assert.equal(graph.nodes[1].id, id);
  assert.equal(graph.nodes[1].headingLevel, 6);
  assert.equal(graph.edges[0].arrow, false);
  assert.equal(primary.nodes.length, 1);
  assert.equal(context.undoManager.canUndo(), false);
  assert.equal(pane.undoManager.canUndo(), true);
  assert.equal(context.saved[0], pane);
  for (const mode of ['readonly', 'missing', 'structure', 'locked']) {
    const blocked = { nodes: [{ id: 'root', createdOrder: 0, ...(mode === 'structure' ? { structure: {} } : {}) }], edges: [], groups: [], settings: {} };
    if (mode === 'readonly') blocked.settings.sourceMode = 'vault-readonly';
    const isolated = creationContext(blocked);
    isolated.focusedInteractionBlocked = () => mode === 'locked';
    const before = structuredClone(blocked);
    const result = closure(main, 'createChildNodeForPane', isolated)(mode === 'missing' ? 'gone' : 'root', null);
    assert.equal(result, null, mode);
    assert.deepEqual(blocked, before, mode);
    assert.equal(isolated.undoManager.canUndo(), false, mode);
  }
});

function gestureContext() {
  const context = {
    BRANCH_DRAG_THRESHOLD: 28, downPoint: [100, 100], rightDragSource: 'root', rightDragged: true,
    isRightButtonDown: false, suppressContextMenu: false, lastBoxUpTime: 0,
    pointerGesture: { pointerId: null },
    canvas: { style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 600 }) },
    getTransform: () => ({ k: 1 }), getNodeExpand: () => 0,
    visibleNodes: () => [], hitTestNode: () => null, nodeHitOptions: {},
    toWorldPos: event => [event.clientX, event.clientY],
    graph: { nodes: [{ id: 'root' }], edges: [] },
    sharedState: { rightDragLink: { sourceId: 'root' } },
    branches: [], edges: [], menus: [],
    draw() {}, hideNotePreview() {},
    triggerContextMenu: (...point) => context.menus.push(point),
  };
  context.ctx = {
    viewport: { pause: true },
    onCreateLinkedNode: (...args) => context.branches.push(args),
    onCreateEdge: (...args) => context.edges.push(args),
  };
  context.canGrowBranchAt = closure(events, 'canGrowBranchAt', context);
  context.cancelRightDragLink = closure(events, 'cancelRightDragLink', context);
  return context;
}
const release = () => ({ clientX: 240, clientY: 210, pointerId: 1, shiftKey: true, preventDefault() {}, stopImmediatePropagation() {} });

test('link growth requires a deliberate screen-space drag inside the canvas and outside a structure', () => {
  const context = gestureContext();
  const canGrow = context.canGrowBranchAt;
  assert.equal(canGrow(110, 110, 110, 110), false);
  assert.equal(canGrow(240, 210, 240, 210), true);
  assert.equal(canGrow(900, 210, 900, 210), false);
  context.getTransform = () => ({ k: 0.25 });
  assert.equal(canGrow(180, 100, 120, 100), false);
  assert.equal(canGrow(220, 100, 130, 100), true);
  context.ctx.hitStructureBoundary = () => 'structure';
  assert.equal(canGrow(240, 210, 240, 210), false);
});

test('pointer release grows exactly once even when followed by contextmenu and a second release', () => {
  const context = gestureContext();
  const onUp = closure(events, 'onPointerUp', context);
  onUp(release());
  closure(events, 'onContextMenu', context)(release());
  onUp(release());
  assert.deepEqual(context.branches, [['root', 240, 210, true]]);
  assert.deepEqual(context.edges, []);
  assert.equal(context.rightDragSource, null);
  assert.equal(context.sharedState.rightDragLink, null);
  assert.equal(context.ctx.viewport.pause, false);
});

test('existing targets keep ordinary linking, while Escape and pointer cancellation never grow nodes', () => {
  const linked = gestureContext();
  linked.hitTestNode = () => ({ id: 'target' });
  closure(events, 'onPointerUp', linked)(release());
  assert.deepEqual(linked.edges, [['root', 'target', true]]);
  assert.deepEqual(linked.branches, []);
  for (const cancel of ['key', 'pointer']) {
    const context = gestureContext();
    if (cancel === 'key') closure(events, 'onCancelLinkKey', context)({ ...release(), key: 'Escape' });
    else closure(events, 'onPointerCancel', context)(release());
    closure(events, 'onPointerUp', context)(release());
    assert.deepEqual(context.branches, []);
    assert.equal(context.ctx.viewport.pause, false);
    assert.equal(context.sharedState.rightDragLink, null);
  }
});
