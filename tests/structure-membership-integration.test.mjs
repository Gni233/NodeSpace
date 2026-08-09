import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

async function transpile(filePath) {
  return ts.transpileModule(await readFile(filePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

async function importTs(filePath, replacements = {}) {
  let source = await readFile(filePath, 'utf8');
  for (const [specifier, replacement] of Object.entries(replacements)) {
    source = source.replaceAll(`from '${specifier}'`, `from '${toUrl(replacement)}'`);
  }
  return import(toUrl(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText));
}

const geometrySource = await transpile(path.join(root, 'src', 'geometry', 'structure-boundary.ts'));
const structureNodes = await importTs(path.join(root, 'src', 'structure-nodes.ts'), {
  './node-order': await transpile(path.join(root, 'src', 'node-order.ts')),
});
const geometry = await import(toUrl(geometrySource));
const paneState = await importTs(path.join(root, 'src', 'pane-state.ts'), {
  './undo-redo': 'export class UndoManager {}',
  './layout-controller': 'export class LayoutSlot { clear() {} onGraphChanged() {} }',
  './graph-runtime': 'export class GraphRuntime { constructor(fileName, graph, undoManager) { this.fileName = fileName; this.graph = graph; this.undoManager = undoManager; this.simManager = null; this.saveTimeout = null; } attach() {} }',
  './structure-view': 'export class StructureNavigationState { constructor() {} }',
  './geometry/structure-boundary': geometrySource,
  './pixi-structure-boundaries': 'export const clearStructureBoundaries = () => {}; export const destroyStructureBoundaries = () => {};',
});

const ordinary = (id, owner) => ({ id, label: id, x: 0, y: 0, ...(owner ? { structureParentId: owner } : {}) });
const structure = (id, memberIds, extra = {}) => ({
  id,
  label: id,
  x: 0,
  y: 0,
  structure: { memberIds, collapsed: false },
  ...extra,
});
const makeGraph = (memberIds = ['a', 'b', 'c']) => ({
  nodes: [
    ...memberIds.map(id => ordinary(id, 's')),
    ordinary('d'),
    structure('s', memberIds),
  ],
  edges: [],
  groups: [],
});

const bytes = value => JSON.stringify(value);

test('preview is byte-stable and exactly matches real transaction outcomes', () => {
  const cases = [
    { graph: makeGraph(), request: { action: 'add', structureId: 's', nodeId: 'd' } },
    { graph: makeGraph(), request: { action: 'remove', structureId: 's', nodeId: 'c' } },
    { graph: makeGraph(['a', 'b']), request: { action: 'remove', structureId: 's', nodeId: 'a' } },
    { graph: makeGraph(['a', 'b']), request: { action: 'remove', structureId: 's', nodeId: 'a', confirmDissolve: true } },
  ];

  for (const item of cases) {
    const graph = structuredClone(item.graph);
    const before = bytes(graph);
    const preview = structureNodes.previewStructureMembershipTransaction(graph, item.request);
    assert.equal(bytes(graph), before, `preview does not mutate for ${item.request.action}`);
    const actual = structureNodes.transactStructureMembership(graph, item.request);
    assert.deepEqual(actual, preview);
  }
});

test('undo hook runs once immediately before a real mutation and never for confirmation or rejection', () => {
  const graph = makeGraph();
  let calls = 0;
  const result = structureNodes.transactStructureMembership(
    graph,
    { action: 'add', structureId: 's', nodeId: 'd' },
    () => {
      calls++;
      assert.deepEqual(graph.nodes.find(node => node.id === 's').structure.memberIds, ['a', 'b', 'c']);
      assert.equal(graph.nodes.find(node => node.id === 'd').structureParentId, undefined);
    },
  );
  assert.deepEqual(result, { status: 'changed', action: 'add' });
  assert.equal(calls, 1);

  const twoMembers = makeGraph(['a', 'b']);
  structureNodes.transactStructureMembership(
    twoMembers,
    { action: 'remove', structureId: 's', nodeId: 'a' },
    () => calls++,
  );
  structureNodes.transactStructureMembership(
    twoMembers,
    { action: 'add', structureId: 'missing', nodeId: 'd' },
    () => calls++,
  );
  assert.equal(calls, 1);
});

test('source-exclusion boundary makes dragging a member out reachable', () => {
  const exclusionShape = geometry.computeStructureBoundary([{ x: 0, y: 0, visualRadius: 10 }]);
  assert.ok(exclusionShape);
  const snapshot = { shape: exclusionShape, center: exclusionShape.center, escapeRadius: 64 };
  assert.equal(paneState.isOutsideMembershipSourceSnapshot(snapshot, 0, 0), false);
  assert.equal(paneState.isOutsideMembershipSourceSnapshot(snapshot, 100, 0), true);

  const fallback = { center: { x: 10, y: 10 }, escapeRadius: 48 };
  assert.equal(paneState.isOutsideMembershipSourceSnapshot(fallback, 20, 20), false);
  assert.equal(paneState.isOutsideMembershipSourceSnapshot(fallback, 100, 100), true);
});

test('overlapping expanded boundaries resolve by center distance then graph order', () => {
  const wide = geometry.computeStructureBoundary([{ x: 0, y: 0, visualRadius: 30 }]);
  const near = geometry.computeStructureBoundary([{ x: 15, y: 0, visualRadius: 30 }]);
  assert.equal(
    paneState.pickMembershipBoundaryTarget(new Map([['wide', wide], ['near', near]]), ['wide', 'near'], 12, 0),
    'near',
  );

  const sameA = geometry.computeStructureBoundary([{ x: 0, y: 0, visualRadius: 20 }]);
  const sameB = geometry.computeStructureBoundary([{ x: 0, y: 0, visualRadius: 20 }]);
  assert.equal(
    paneState.pickMembershipBoundaryTarget(new Map([['b', sameB], ['a', sameA]]), ['a', 'b'], 0, 0),
    'a',
  );
});

test('cancel cleanup changes no graph membership', () => {
  const pane = paneState.createPaneState(0, {});
  const graph = makeGraph();
  pane.runtime.graph = graph;
  pane.membershipDragSession = { runtime: pane.runtime, nodeId: 'd', sourceStructureId: null, sourceExpanded: false, sourceSnapshot: null };
  pane.membershipDragPreview = { nodeId: 'd', sourceStructureId: null, targetStructureId: 's', mode: 'add', message: 'ready' };
  const before = bytes(graph);
  paneState.clearMembershipDragPreview(pane);
  assert.equal(bytes(graph), before);
  assert.equal(pane.membershipDragSession, null);
  assert.equal(pane.membershipDragPreview, null);
});

test('main orchestration rechecks confirmation, blocks direct edges, binds menus to panes, and refreshes shared runtimes', async () => {
  const main = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');
  const paneManager = await readFile(path.join(root, 'src', 'pane-manager.ts'), 'utf8');

  assert.match(main, /previewStructureMembershipTransaction\(graph, executionRequest\)/);
  assert.match(main, /executionRequest = \{[\s\S]*?action: 'remove'[\s\S]*?confirmDissolve: true[\s\S]*?previewStructureMembershipTransaction\(graph, executionRequest\)/);
  assert.match(main, /preview\.directEdgeCount > 0[\s\S]*?请先删除或改接/);
  assert.match(main, /移出后结构不足两个成员，将解散结构/);
  assert.match(main, /transactStructureMembership\(graph, executionRequest, \(\) => \{[\s\S]*?pushSnapshot\(graph\)/);

  assert.match(main, /onContextMenu: \(type:[\s\S]*?=> onContextMenu\(pi, type, id, x, y\)/);
  assert.match(main, /label: '加入展开结构'[\s\S]*?expandedStructures\.map/);
  assert.match(main, /label: `移出「\$\{owner\.label \|\| owner\.id\}」`/);
  assert.match(main, /!focusedPane\.structureView[\s\S]*?!focusedPane\.textViewActive[\s\S]*?!coordinateLayoutModes\.has\(focusedPane\.activeMode\)/);
  assert.match(paneManager, /onContextMenu: \(pane: PaneState,/);

  assert.match(main, /reinitializeRuntimeViews\(runtime\);[\s\S]*?scheduleSaveForRuntime\(runtime\);[\s\S]*?draw\(\)/);
  assert.match(main, /for \(const owner of extraPanes\)[\s\S]*?owner\.runtime !== runtime[\s\S]*?owner\.simManager\.initSim\(\)/);
  assert.match(main, /clearRuntimeMembershipDragState\(runtime\)/);
});
