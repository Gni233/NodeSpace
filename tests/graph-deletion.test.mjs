import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const read = file => readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
const orderUrl = url(compile(await read('node-order.ts')));
const structureUrl = url(compile((await read('structure-nodes.ts')).replace("from './node-order'", `from '${orderUrl}'`)));
const structures = await import(structureUrl);
const views = await import(url(compile((await read('structure-view.ts')).replace("from './structure-nodes'", `from '${structureUrl}'`))));
const groups = await import(url(compile(await read('group-membership.ts'))));
const { serializeGraphSnapshot } = await import(url(compile(await read('graph-snapshot.ts'))));
const { GraphRuntime } = await import(url(compile(await read('graph-runtime.ts'))));
const { UndoManager } = await import(url(compile((await read('undo-redo.ts')).replace("'./toast'", `'${url('export const showToast = () => {};')}'`))));
const main = ts.createSourceFile('main.ts', await read('main.ts'), ts.ScriptTarget.ES2022, true);
const inspector = ts.createSourceFile('ui-edit.ts', await read('ui-edit.ts'), ts.ScriptTarget.ES2022, true);

function assignedClosure(file, name, context) {
  let body;
  const visit = node => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && node.left.getText(file) === name) body = node.right;
    if (!body) ts.forEachChild(node, visit);
  };
  visit(file);
  assert.ok(body, name);
  return new Function('context', `with (context) { ${compile(`const handler = ${body.getText(file)};`)}\nreturn handler; }`)(context);
}

function fixture(graph, index = 0) {
  const primaryRuntime = new GraphRuntime('primary.json', index === 0 ? graph : { nodes: [], edges: [], groups: [] }, new UndoManager());
  const runtime = index === 0 ? primaryRuntime : new GraphRuntime('extra.json', graph, new UndoManager());
  const pane = { index, runtime, undoManager: runtime.undoManager, selNode: 'b', selEdge: 0, selGroup: null, structureView: null };
  const state = { focused: pane, saves: [], refreshed: [], clears: 0, toasts: [] };
  const context = {
    PANE_LEFT: 0, primaryRuntime,
    ...structures, ...groups,
    isPaneStructureProxyNode: views.isPaneStructureProxyNode,
    paneRuntimeGraph: owner => owner.index === 0 ? primaryRuntime.graph : owner.runtime.graph,
    focusedPaneState: () => state.focused,
    originalEdgeIndexForPane: (owner, index) => views.getPaneOriginalEdgeIndex(owner.structureView, index),
    clearEd: () => { state.clears++; },
    reinitializeRuntimeViews: runtime => state.refreshed.push(runtime),
    scheduleSaveForRuntime: runtime => state.saves.push({ runtime, graph: JSON.parse(serializeGraphSnapshot(runtime.graph)) }),
    showToast: (...message) => state.toasts.push(message),
    draw() {},
    setTimeout: () => { throw new Error('Deletion must not schedule later graph mutations'); },
  };
  return {
    graph, pane, runtime, primaryRuntime, state, context,
    nodes: assignedClosure(main, 'deleteNodesForPane', context),
    edges: assignedClosure(main, 'deleteEdgesForPane', context),
    group: assignedClosure(main, 'deleteGroupForPane', context),
  };
}

function smallGraph() {
  return {
    nodes: [{ id: 'a', label: '窗边', note: '留住段落\n', tags: ['灵感'] }, { id: 'b', label: '雨声' }, { id: 'c', label: '晚风' }],
    edges: [
      { source: 'a', target: { id: 'b' }, label: '听见', color: '#8b8170' },
      { source: { id: 'b' }, target: 'c', label: '接着', arrow: true },
      { source: 'a', target: 'c', label: '保留', lineStyle: 'dash-2' },
    ],
    groups: [{ id: 'g', label: '灵感', displayMode: 'rect', color: '#a8563e', opacity: 0.15 }],
  };
}

test('node deletion removes incident edges immediately and undoes and redoes as one complete edit', () => {
  const graph = smallGraph(), before = structuredClone(graph);
  const f = fixture(graph);
  assert.equal(f.nodes(f.pane, ['b', 'b', 'missing']), true);
  assert.deepEqual(graph.nodes.map(node => node.id), ['a', 'c']);
  assert.deepEqual(graph.edges, [before.edges[2]]);
  assert.deepEqual(graph.groups, before.groups);
  assert.deepEqual(f.state.saves[0].graph.edges, [before.edges[2]]);
  assert.equal(f.state.saves[0].runtime, f.runtime);
  assert.equal(f.state.clears, 1);
  assert.equal(f.pane.undoManager.undo(graph), true);
  assert.deepEqual(graph, before);
  assert.equal(f.pane.undoManager.canUndo(), false);
  assert.equal(f.pane.undoManager.redo(graph), true);
  assert.deepEqual(graph.edges, [before.edges[2]]);
  assert.ok(graph.nodes.every(node => node.id !== 'b'));
});

test('edge deletion handles duplicate projected indexes without index drift and saves the final result', () => {
  const graph = smallGraph(), before = structuredClone(graph);
  const f = fixture(graph);
  f.pane.structureView = { getOriginalEdgeIndex: index => new Map([[0, 2], [1, 0]]).get(index) ?? null };
  assert.equal(f.edges(f.pane, [0, 1, 0]), true);
  assert.deepEqual(graph.edges, [before.edges[1]]);
  const saved = f.state.saves[0].graph.edges[0];
  assert.equal(saved.source, 'b');
  assert.equal(saved.target, 'c');
  assert.equal(saved._dyingAt, undefined);
  f.pane.undoManager.undo(graph);
  assert.deepEqual(graph, before);
  f.pane.undoManager.redo(graph);
  assert.deepEqual(graph.edges, [before.edges[1]]);
});

test('a quick undo followed by deleting a different edge keeps the new history isolated', () => {
  const graph = smallGraph(), before = structuredClone(graph);
  const f = fixture(graph);
  f.edges(f.pane, [0]);
  f.pane.undoManager.undo(graph);
  f.edges(f.pane, [1]);
  assert.deepEqual(graph.edges, [before.edges[0], before.edges[2]]);
  assert.equal(f.pane.undoManager.canRedo(), false);
  f.pane.undoManager.undo(graph);
  assert.deepEqual(graph, before);
  f.pane.undoManager.redo(graph);
  assert.deepEqual(graph.edges, [before.edges[0], before.edges[2]]);
});

function structureGraph(directEdge = false) {
  const graph = {
    nodes: [
      { id: 'a', label: 'A', structureParentId: 's' },
      { id: 'b', label: 'B', structureParentId: 's' },
      { id: 'outside', label: 'Outside' },
      { id: 's', label: '一个结构', structure: { memberIds: ['a', 'b'], collapsed: false } },
    ],
    edges: [{ source: 'a', target: 'b', label: '内部关系' }, { source: 'b', target: 'outside', label: '跨界关系' }],
    groups: [],
  };
  if (directEdge) graph.edges.push({ source: 's', target: 'outside', label: '整体关系' });
  structures.syncStructureCollections(graph);
  return graph;
}

test('deleting a member restores its automatically dissolved structure with one undo', () => {
  const graph = structureGraph(), before = structuredClone(graph), f = fixture(graph);
  assert.equal(f.nodes(f.pane, ['a']), true);
  assert.deepEqual(graph.nodes.map(node => node.id), ['b', 'outside']);
  assert.equal(graph.nodes[0].structureParentId, undefined);
  assert.deepEqual(graph.edges, [before.edges[1]]);
  assert.deepEqual(graph.groups, []);
  f.pane.undoManager.undo(graph);
  assert.deepEqual(graph, before);
});

test('structure deletion protects whole-structure relationships before any batch changes', () => {
  const graph = structureGraph(true), before = structuredClone(graph), f = fixture(graph);
  assert.equal(f.nodes(f.pane, ['outside', 's']), false);
  assert.deepEqual(graph, before);
  assert.equal(f.pane.undoManager.canUndo(), false);
  assert.deepEqual(f.state.saves, []);
  assert.match(f.state.toasts[0][0], /未删除任何节点/);
});

test('safe structure deletion dissolves the container and preserves its members and relations', () => {
  const graph = structureGraph(), before = structuredClone(graph), f = fixture(graph);
  assert.equal(f.nodes(f.pane, ['s']), true);
  assert.deepEqual(graph.nodes.map(node => node.id), ['a', 'b', 'outside']);
  assert.ok(graph.nodes.every(node => node.structureParentId === undefined));
  assert.deepEqual(graph.edges, before.edges);
  assert.deepEqual(graph.groups, []);
  f.pane.undoManager.undo(graph);
  assert.deepEqual(graph, before);
});

test('ordinary collection deletion preserves records and tags, and structure collections remain protected', () => {
  const graph = smallGraph(), before = structuredClone(graph), f = fixture(graph);
  assert.equal(f.group(f.pane, 'g'), true);
  assert.deepEqual(graph.groups, []);
  assert.deepEqual(graph.nodes, before.nodes);
  assert.deepEqual(graph.edges, before.edges);
  f.pane.undoManager.undo(graph);
  assert.deepEqual(graph, before);
  assert.equal(f.pane.undoManager.canUndo(), false);
  graph.groups[0].collectionKind = 'structure'; graph.groups[0].structureId = 's';
  const protectedGraph = structuredClone(graph);
  assert.equal(f.group(f.pane, 'g'), false);
  assert.deepEqual(graph, protectedGraph);
  assert.equal(f.pane.undoManager.canUndo(), false);
});

test('read-only projections and active text drafts reject every deletion without history changes', () => {
  for (const mode of ['readonly', 'text-lock', 'text-view']) {
    const graph = smallGraph(), f = fixture(graph);
    if (mode === 'readonly') graph.settings = { sourceMode: 'vault-readonly' };
    if (mode === 'text-lock') f.runtime.beginTextEdit({});
    if (mode === 'text-view') f.pane.textViewActive = true;
    const before = structuredClone(graph);
    assert.equal(f.nodes(f.pane, ['b']), false, mode);
    assert.equal(f.edges(f.pane, [0]), false, mode);
    assert.equal(f.group(f.pane, 'g'), false, mode);
    assert.deepEqual(graph, before, mode);
    assert.equal(f.pane.undoManager.canUndo(), false, mode);
    assert.deepEqual(f.state.saves, [], mode);
  }
});

test('missing selections and proxy relations are no-ops, including mixed real/proxy edge requests', () => {
  const graph = smallGraph(), before = structuredClone(graph), f = fixture(graph);
  f.pane.structureView = { proxyNodeIds: new Set(['b']), getOriginalEdgeIndex: index => index === 0 ? 0 : null };
  assert.equal(f.nodes(f.pane, ['b', 'missing']), false);
  assert.equal(f.edges(f.pane, [0, 1]), false);
  assert.equal(f.group(f.pane, 'missing'), false);
  f.pane.structureView = null;
  assert.equal(f.edges(f.pane, [-1, 2.5, Infinity, 999]), false);
  assert.deepEqual(graph, before);
  assert.equal(f.pane.undoManager.canUndo(), false);
});

test('deletion in an extra pane saves its own runtime even when focus changes during refresh', () => {
  const graph = smallGraph(), before = structuredClone(graph), f = fixture(graph, 2);
  const primaryBefore = structuredClone(f.primaryRuntime.graph);
  f.context.reinitializeRuntimeViews = runtime => {
    f.state.refreshed.push(runtime);
    f.state.focused = { index: 0, runtime: f.primaryRuntime };
  };
  assert.equal(f.nodes(f.pane, ['b']), true);
  assert.deepEqual(f.primaryRuntime.graph, primaryBefore);
  assert.equal(f.primaryRuntime.undoManager.canUndo(), false);
  assert.equal(f.state.saves[0].runtime, f.runtime);
  assert.equal(f.state.refreshed[0], f.runtime);
  assert.equal(f.state.clears, 1);
  f.pane.undoManager.undo(graph);
  assert.deepEqual(graph, before);
});

test('inspector buttons call explicit deletion transactions and reject stale displayed items', () => {
  for (const [button, kind, key, id] of [
    ['nodeDelBtn', 'nodes', 'getSelNode', 'a'], ['edgeDelBtn', 'edges', 'getSelEdge', 0], ['groupDelBtn', 'groups', 'getSelGroup', 'g'],
  ]) {
    const graph = smallGraph();
    const item = kind === 'edges' ? graph.edges[0] : graph[kind][0];
    const calls = [];
    const context = {
      displayedGraph: graph, displayedItem: item, clearEd: () => calls.push('clear'),
      isStructureCollection: groups.isStructureCollection,
      [key]: () => id,
      ctx: { graph, canMutate: () => true,
        deleteNode: id => { calls.push(id); return true; },
        deleteEdge: id => { calls.push(id); return true; },
        deleteGroup: id => { calls.push(id); return true; },
      },
    };
    const click = assignedClosure(inspector, `${button}.onclick`, context);
    click(); assert.deepEqual(calls, [id, 'clear']);
    calls.length = 0;
    context.displayedItem = { ...item };
    click(); assert.deepEqual(calls, []);
    context.displayedItem = item; context.ctx.canMutate = () => false;
    click(); assert.deepEqual(calls, []);
    context.ctx.canMutate = () => true; context.displayedGraph = structuredClone(graph);
    click(); assert.deepEqual(calls, []);
  }
});
