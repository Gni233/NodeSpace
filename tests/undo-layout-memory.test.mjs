import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { inlineNodeRadiusModule } from './helpers/node-radius-module.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const source = file => readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
const { UndoManager } = await import(url(compile((await source('undo-redo.ts'))
  .replace("'./toast'", `'${url('export const showToast = () => {};')}'`))));
const { computeSemanticLayout, stabilizeSemanticLayout } = await import(url(compile(inlineNodeRadiusModule(await source('layouts/semantic.ts')))));
const { serializeGraphSnapshot } = await import(url(compile(await source('graph-snapshot.ts'))));

const coordinates = graph => graph.nodes.map(node => [node.id, node.x, node.y]);
function compose(graph, options = {}) {
  const ideal = computeSemanticLayout(graph, { collapsedNodeIds: new Set(graph.nodes.map(node => node.id)), ...options });
  const next = stabilizeSemanticLayout(graph, ideal, graph.settings?.semanticLayoutMemory);
  graph.settings ||= {};
  graph.settings.semanticLayoutMemory = next.memory;
  for (const node of graph.nodes) {
    const point = next.result.positions.get(node.id);
    node.x = point.x; node.y = point.y;
    node._semanticCard = { ...point.card };
  }
  return next;
}

function growingGraph() {
  const graph = {
    nodes: ['下午的雨', '窗边的光', '傍晚的风'].map((label, index) => ({ id: `n${index}`, label, headingLevel: 6, createdOrder: index })),
    edges: [{ source: 'n0', target: 'n1' }, { source: 'n0', target: 'n2' }], groups: [],
    settings: { graphTheme: 'paper-light', fontFamily: 'system-ui', semanticCardDensity: 'nodes' },
  };
  compose(graph);
  for (const label of ['窗外的树', '屋内的书']) {
    const id = `n${graph.nodes.length}`;
    graph.nodes.push({ id, label, headingLevel: 6, createdOrder: graph.nodes.length });
    graph.edges.push({ source: 'n0', target: id });
    compose(graph);
  }
  return graph;
}

test('content undo and redo restore the matching spatial memory without reverting theme or font preferences', () => {
  const graph = growingGraph(), manager = new UndoManager();
  const original = coordinates(graph), originalMemory = structuredClone(graph.settings.semanticLayoutMemory);
  const arrays = { nodes: graph.nodes, edges: graph.edges, groups: graph.groups };
  manager.pushSnapshot(graph);
  graph.nodes[4].label = '书页里的细微声音与一段很长的回忆';
  compose(graph);
  const edited = coordinates(graph), editedMemory = structuredClone(graph.settings.semanticLayoutMemory);
  assert.notDeepEqual(edited, original);
  assert.ok(edited.some((point, index) => Math.hypot(point[1] - original[index][1], point[2] - original[index][2]) > 5));
  graph.settings.graphTheme = 'constellation-dark';
  graph.settings.fontFamily = 'monospace';
  assert.equal(manager.undo(graph), true);
  assert.deepEqual(graph.settings.semanticLayoutMemory, originalMemory);
  assert.deepEqual(coordinates(graph), original);
  const restored = compose(graph);
  assert.deepEqual(coordinates(graph), original);
  assert.deepEqual(restored.movedNodeIds, []);
  assert.equal(graph.settings.graphTheme, 'constellation-dark');
  assert.equal(graph.settings.fontFamily, 'monospace');
  assert.equal(manager.redo(graph), true);
  assert.deepEqual(graph.settings.semanticLayoutMemory, editedMemory);
  compose(graph);
  assert.deepEqual(coordinates(graph), edited);
  assert.equal(graph.nodes[4].label, '书页里的细微声音与一段很长的回忆');
  for (const key of ['nodes', 'edges', 'groups']) assert.equal(graph[key], arrays[key]);
  assert.equal(graph.settings.graphTheme, 'constellation-dark');
  assert.equal(graph.settings.fontFamily, 'monospace');
});

test('repeated reflows and reopenings preserve a grown composition exactly', () => {
  let graph = growingGraph();
  const original = coordinates(graph);
  // This arrangement contains incremental inertia, rather than just a fresh
  // canonical layout that would happen to remain unchanged without memory.
  const canonical = computeSemanticLayout(graph, { collapsedNodeIds: new Set(graph.nodes.map(node => node.id)) });
  assert.ok(graph.nodes.some(node => Math.hypot(node.x - canonical.positions.get(node.id).x, node.y - canonical.positions.get(node.id).y) > 1));
  for (let pass = 0; pass < 8; pass++) {
    graph = JSON.parse(serializeGraphSnapshot(graph));
    const next = compose(graph);
    assert.deepEqual(coordinates(graph), original);
    assert.deepEqual(next.movedNodeIds, []);
  }
});

test('layout memory snapshots are isolated from later in-place cache changes', () => {
  const graph = growingGraph(), manager = new UndoManager();
  const original = structuredClone(graph.settings.semanticLayoutMemory);
  manager.pushSnapshot(graph);
  graph.settings.semanticLayoutMemory.nodes.n0.x += 1000;
  graph.settings.semanticLayoutMemory.compositions[Object.keys(original.compositions)[0]] = 'changed';
  const changed = structuredClone(graph.settings.semanticLayoutMemory);
  manager.undo(graph);
  assert.deepEqual(graph.settings.semanticLayoutMemory, original);
  graph.settings.semanticLayoutMemory.nodes.n0.y -= 700;
  manager.redo(graph);
  assert.deepEqual(graph.settings.semanticLayoutMemory, changed);
});

test('undoing to a graph without spatial memory removes only that cache and keeps current view settings', () => {
  const graph = { nodes: [{ id: 'a', label: '窗边' }], edges: [], groups: [], settings: { graphTheme: 'paper-light' } };
  const manager = new UndoManager();
  manager.pushSnapshot(graph);
  compose(graph);
  const memory = structuredClone(graph.settings.semanticLayoutMemory);
  graph.settings.fontFamily = 'serif';
  manager.undo(graph);
  assert.equal(graph.settings.semanticLayoutMemory, undefined);
  assert.equal(graph.settings.graphTheme, 'paper-light');
  assert.equal(graph.settings.fontFamily, 'serif');
  manager.redo(graph);
  assert.deepEqual(graph.settings.semanticLayoutMemory, memory);
  assert.equal(graph.settings.fontFamily, 'serif');
});

test('explicit spacing changes invalidate the cached composition instead of freezing it', () => {
  const graph = growingGraph(), before = coordinates(graph);
  const keys = structuredClone(graph.settings.semanticLayoutMemory.compositions);
  const next = compose(graph, { levelSpacing: 700 });
  assert.notDeepEqual(graph.settings.semanticLayoutMemory.compositions, keys);
  assert.notDeepEqual(coordinates(graph), before);
  assert.ok(next.movedNodeIds.length > 0);
  const adjusted = coordinates(graph);
  compose(graph, { levelSpacing: 700 });
  assert.deepEqual(coordinates(graph), adjusted);
});

test('fixed coordinates remain authoritative when the compositor geometry otherwise matches', () => {
  const graph = growingGraph();
  graph.nodes[0].fixed = true;
  graph.nodes[0].x = 120; graph.nodes[0].y = -30;
  compose(graph);
  graph.nodes[0].x = 640; graph.nodes[0].y = -120;
  const next = compose(graph);
  assert.deepEqual([graph.nodes[0].x, graph.nodes[0].y], [640, -120]);
  assert.deepEqual([next.memory.nodes.n0.x, next.memory.nodes.n0.y], [640, -120]);
});
