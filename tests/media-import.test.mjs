import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { mediaImportModuleUrl } from './helpers/media-import-module.mjs';
import { graphCopyModuleUrl } from './helpers/graph-copy-module.mjs';

const ts = createRequire(import.meta.url)('typescript');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const orderUrl = url(compile(await readFile(new URL('../src/node-order.ts', import.meta.url), 'utf8')));
const order = await import(orderUrl);
const media = await import(mediaImportModuleUrl);
const { prepareGraphCopy } = await import(graphCopyModuleUrl);
const { createMediaTextEditor } = await import(url(compile(await readFile(new URL('../src/media-text-editor.ts', import.meta.url), 'utf8'))));
const structures = await import(url(compile((await readFile(new URL('../src/structure-nodes.ts', import.meta.url), 'utf8'))
  .replace("from './node-order'", `from '${orderUrl}'`))));
const { UndoManager } = await import(url(compile((await readFile(new URL('../src/undo-redo.ts', import.meta.url), 'utf8'))
  .replace("'./toast'", `'${url('export const showToast = () => {};')}'`))));
const main = ts.createSourceFile('main.ts', await readFile(new URL('../src/main.ts', import.meta.url), 'utf8'), ts.ScriptTarget.ES2022, true);
function closure(name, context) {
  let initializer;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(main) === name) initializer = node.initializer;
    if (!initializer) ts.forEachChild(node, visit);
  };
  visit(main); assert.ok(initializer, name);
  return new Function('context', `with (context) { ${compile(`const fn = ${initializer.getText(main)};`)} return fn; }`)(context);
}
const empty = () => ({ nodes: [], edges: [], groups: [] });
const source = (name = '雨声.md') => ({ name, type: 'md', value: '# 雨声\n\n  窗边  \n' });
function fixture() {
  const primaryRuntime = { graph: empty(), undoManager: new UndoManager() };
  const owner = { index: 2, runtime: { graph: empty(), undoManager: new UndoManager() }, canvasContainer: { style: {} }, origin: { x: 10, y: 20 } };
  const state = { primaryRuntime, graph: primaryRuntime.graph, PANE_LEFT: 0, splitActive: true,
    appShell: { isConnected: true }, owners: [owner], owner, focused: owner, saved: [], fills: [],
    allPaneOwners: () => state.owners, panePixi: pane => ({ viewport: { center: pane.origin } }),
    paneRuntimeGraph: pane => pane.index === 0 ? primaryRuntime.graph : pane.runtime.graph,
    focusedPaneState: () => state.focused, assignCreatedOrders: order.assignCreatedOrders,
    previewStructureMembershipTransaction: structures.previewStructureMembershipTransaction,
    transactStructureMembership: structures.transactStructureMembership,
    reinitializeRuntimeViews() {}, scheduleSaveForRuntime: runtime => state.saved.push(runtime),
    fillNode: id => state.fills.push(id), syncFocusedCommands() {}, draw() {},
  };
  owner.runtime.canInteract = () => !owner.blocked;
  state.canMutateCanvasPane = closure('canMutateCanvasPane', state);
  state.commitCreatedPaneNodes = closure('commitCreatedPaneNodes', state);
  const session = () => media.createMediaImportSession(owner, {
    getGraph: state.paneRuntimeGraph, canMutate: state.canMutateCanvasPane,
    getContextKey: pane => pane.structureView?.structureId ?? null,
    getOrigin: pane => pane.origin, commit: state.commitCreatedPaneNodes,
  });
  return { state, owner, session };
}

test('a batch imports into the original third pane with one undo and unique identities', () => {
  const { state, owner, session } = fixture(), graph = owner.runtime.graph;
  const pending = session(); owner.origin.x = 999; state.focused = {};
  const now = Date.now; Date.now = () => 12345;
  let created;
  try { created = pending.add([source(), source('风声.md'), source('书页.md'), source('灯.md')]); }
  finally { Date.now = now; }
  assert.equal(new Set(created.map(node => node.id)).size, 4);
  assert.deepEqual(created.map(node => [node.x, node.y]), [[10,20], [58,20], [106,20], [10,68]]);
  assert.equal(created[0].mediaUrl, source().value);
  assert.deepEqual(state.fills, []); assert.deepEqual(state.graph.nodes, []);
  assert.deepEqual(state.saved, [owner.runtime]);
  assert.equal(owner.runtime.undoManager.undo(graph), true); assert.deepEqual(graph, empty());
  assert.equal(owner.runtime.undoManager.canUndo(), false);
  assert.equal(owner.runtime.undoManager.redo(graph), true); assert.equal(graph.nodes.length, 4);
  assert.equal(state.primaryRuntime.undoManager.canUndo(), false);
});

test('pending imports reject changed graphs, structure views, closed panes, text edits and read-only projections', () => {
  for (const mode of ['graph', 'structure', 'closed', 'split', 'hidden', 'text', 'draft', 'locked', 'readonly', 'disconnected']) {
    const { state, owner, session } = fixture(), graph = owner.runtime.graph, pending = session();
    if (mode === 'graph') owner.runtime.graph = empty();
    if (mode === 'structure') owner.structureView = { structureId: 's' };
    if (mode === 'closed') state.owners = [];
    if (mode === 'split') state.splitActive = false;
    if (mode === 'hidden') owner.canvasContainer.style.display = 'none';
    if (mode === 'text') owner.textViewActive = true;
    if (mode === 'draft') owner.runtime.textEditActive = true;
    if (mode === 'locked') owner.blocked = true;
    if (mode === 'readonly') graph.settings = { sourceMode: 'vault-readonly' };
    if (mode === 'disconnected') state.appShell.isConnected = false;
    let released = 0;
    assert.deepEqual(pending.add([{ ...source(), release: () => released++ }]), [], mode);
    assert.equal(released, 1, mode); assert.equal(graph.nodes.length, 0, mode);
    assert.equal(owner.runtime.undoManager.canUndo(), false, mode); assert.deepEqual(state.saved, [], mode);
  }
});

test('structure imports join the collection atomically and undo restores the whole structure', () => {
  const { owner, session } = fixture(), graph = owner.runtime.graph;
  graph.nodes.push({ id: 'a', structureParentId: 's' }, { id: 'b', structureParentId: 's' },
    { id: 's', structure: { memberIds: ['a', 'b'], collapsed: false } });
  structures.syncStructureCollections(graph);
  const before = structuredClone(graph);
  owner.structureView = { structureId: 's' };
  const added = session().add([source(), source('雨后.md')]);
  assert.equal(added.length, 2);
  for (const node of added) assert.equal(node.structureParentId, 's');
  assert.deepEqual(graph.nodes[2].structure.memberIds, ['a', 'b', ...added.map(node => node.id)]);
  assert.equal(owner.runtime.undoManager.undo(graph), true); assert.deepEqual(graph, before);
});

test('invalid structures and creation order exhaustion leave graph and history untouched', () => {
  for (const mode of ['structure', 'order']) {
    const { owner, session } = fixture(), graph = owner.runtime.graph;
    if (mode === 'structure') owner.structureView = { structureId: 'missing' };
    else graph.nodes.push({ id: 'a', createdOrder: Number.MAX_SAFE_INTEGER });
    const before = structuredClone(graph), pending = session(); let released = 0;
    const input = [{ ...source(), release: () => released++ }];
    if (mode === 'order') assert.throws(() => pending.add(input), RangeError);
    else assert.deepEqual(pending.add(input), []);
    assert.deepEqual(graph, before); assert.equal(released, 1);
    assert.equal(owner.runtime.undoManager.canUndo(), false);
  }
});

test('a committed import is one-shot without revoking adopted sources', () => {
  const { session } = fixture(), pending = session(); let adopted = 0, late = 0;
  const input = { ...source(), release: () => adopted++ };
  assert.equal(pending.add([input]).length, 1);
  assert.deepEqual(pending.add([input, { ...source(), release: () => late++ }]), []);
  assert.equal(adopted, 0); assert.equal(late, 1);
});

test('rapid duplicates stay in their pane and join the current structure with atomic history', () => {
  const { state, owner } = fixture(), graph = owner.runtime.graph;
  graph.nodes.push({ id: 'a', label: '原文', createdOrder: 0, x: 10, y: 20, structureParentId: 's' },
    { id: 'b', structureParentId: 's' }, { id: 's', structure: { memberIds: ['a', 'b'], collapsed: false } });
  structures.syncStructureCollections(graph); owner.structureView = { structureId: 's' };
  state.prepareGraphCopy = prepareGraphCopy;
  const duplicate = closure('duplicateNodeForPane', state), before = structuredClone(graph);
  const now = Date.now; Date.now = () => 777;
  let first, second;
  try { first = duplicate(owner, 'a'); second = duplicate(owner, 'a'); }
  finally { Date.now = now; }
  assert.ok(first); assert.ok(second); assert.notEqual(first, second);
  assert.equal(graph.nodes.find(node => node.id === first).structureParentId, 's');
  assert.deepEqual(state.graph, empty());
  assert.equal(owner.runtime.undoManager.undo(graph), true); assert.equal(graph.nodes.length, 4);
  assert.equal(owner.runtime.undoManager.undo(graph), true); assert.deepEqual(graph, before);
  assert.equal(owner.runtime.undoManager.canUndo(), false);
});

test('duplicate commands reject stale destinations, missing selections and readonly graphs', () => {
  for (const mode of ['stale', 'missing', 'readonly', 'proxy']) {
    const { state, owner } = fixture(), graph = owner.runtime.graph;
    graph.nodes.push({ id: 'a', ...(mode === 'proxy' ? { _localContextProxy: {} } : {}) });
    if (mode === 'readonly') graph.settings = { sourceMode: 'vault-readonly' };
    state.prepareGraphCopy = prepareGraphCopy;
    const before = structuredClone(graph);
    assert.equal(closure('duplicateNodeForPane', state)(owner, mode === 'missing' ? 'gone' : 'a', mode === 'stale' ? empty() : graph), null);
    assert.deepEqual(graph, before); assert.deepEqual(state.saved, []); assert.equal(owner.runtime.undoManager.canUndo(), false);
  }
});

test('prepared nodes and remapped edges paste as one transaction and reject dangling edges', () => {
  const { state, owner } = fixture(), graph = owner.runtime.graph;
  const copy = prepareGraphCopy(graph, { nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ source: 'a', target: 'b' }] }, { x: 4, y: 8 });
  assert.equal(state.commitCreatedPaneNodes(owner, graph, copy.nodes, null, copy.edges), true);
  assert.equal(graph.nodes.length, 2); assert.equal(graph.edges.length, 1);
  assert.equal(owner.runtime.undoManager.undo(graph), true); assert.deepEqual(graph, empty());
  assert.equal(owner.runtime.undoManager.canUndo(), false);
  assert.equal(state.commitCreatedPaneNodes(owner, graph, copy.nodes, null, [{ source: 'missing', target: copy.nodes[0].id }]), false);
  assert.deepEqual(graph, empty()); assert.equal(owner.runtime.undoManager.canUndo(), false);
});

test('a reading editor saves its original pane even when another graph has the same node ID', () => {
  const { state, owner } = fixture();
  const primary = { id: 'same', mediaType: 'md', mediaUrl: '主图原文' };
  const node = { id: 'same', mediaType: 'md', mediaUrl: '分屏原文' };
  state.graph.nodes.push(primary); owner.runtime.graph.nodes.push(node);
  const simulated = { ...node };
  state.createMediaTextEditor = createMediaTextEditor;
  state.scopedPaneSimulationManager = () => ({ getSim: () => ({ nodes: () => [simulated] }) });
  state.rafDraw = () => {}; state.focused = {};
  state.reinitializeRuntimeViews = () => assert.fail('Typing must not restart layout');
  const editor = closure('mediaTextEditorForPane', state)(owner, node, 'mediaUrl');
  assert.equal(editor.begin(), '分屏原文'); assert.equal(editor.update('分屏新内容'), true);
  assert.equal(primary.mediaUrl, '主图原文'); assert.equal(simulated.mediaUrl, '分屏新内容');
  assert.deepEqual(state.saved, [owner.runtime]); assert.deepEqual(state.fills, []);
  assert.equal(state.primaryRuntime.undoManager.canUndo(), false);
  assert.equal(owner.runtime.undoManager.undo(owner.runtime.graph), true);
  assert.equal(owner.runtime.graph.nodes[0].mediaUrl, '分屏原文');
});

test('a callback failure after adoption keeps files referenced by the undoable graph', () => {
  const graph = empty(), owner = {}; let released = 0;
  const pending = media.createMediaImportSession(owner, { getGraph: () => graph, getContextKey: () => null,
    canMutate: () => true, getOrigin: () => ({ x: 0, y: 0 }),
    commit(_owner, destination, nodes) { destination.nodes.push(...nodes); throw new Error('paint failed'); } });
  assert.throws(() => pending.add([{ ...source(), release: () => released++ }]), /paint failed/);
  assert.equal(graph.nodes.length, 1); assert.equal(released, 0);
});

test('browser import reads exact text, recognizes PDF and releases rejected temporary files', async () => {
  const releases = [];
  const files = [new File([source().value], '雨声.md'), new File(['pdf'], '阅读.PDF'), new File(['x'], 'app.exe')];
  const result = await media.readBrowserMediaSources(files, async file => {
    let released = false;
    return { value: `blob:${file.name}`, release() { if (!released) { released = true; releases.push(`blob:${file.name}`); } } };
  });
  assert.equal(result.sources[0].value, source().value); assert.equal(result.sources[1].type, 'pdf');
  assert.deepEqual(result.unsupported, ['app.exe']);
  media.releaseMediaSources(result.sources); media.releaseMediaSources(result.sources);
  assert.deepEqual(releases, ['blob:阅读.PDF']);
});

test('a failed text read releases earlier URLs without returning a partial batch', async () => {
  const releases = [];
  await assert.rejects(media.readBrowserMediaSources([new File(['img'], 'image.png'),
    { name: 'broken.txt', type: 'text/plain', text: async () => { throw new Error('read failed'); } }],
  async () => ({ value: 'blob:image', release: () => releases.push('blob:image') })), /read failed/);
  assert.deepEqual(releases, ['blob:image']);
});
