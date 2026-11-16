import assert from 'node:assert/strict';
import { test } from 'node:test';
import { graphCopyModuleUrl } from './helpers/graph-copy-module.mjs';
const { prepareGraphCopy } = await import(graphCopyModuleUrl);
const empty = () => ({ nodes: [], edges: [], groups: [] });

test('copying preserves relative positions, authored colors and order without mutating source data', () => {
  const destination = empty(), clipboard = {
    nodes: [{ id: 'later', label: '雨声', x: 20, y: 40, createdOrder: 8, color: '#000000', colorMode: 'custom', tags: ['阅读'] },
      { id: 'earlier', label: '树影', x: 0, y: 0, createdOrder: 2 }],
    edges: [{ source: 'earlier', target: 'later', label: '唤起', color: '#9985A8' }],
  };
  const before = structuredClone(clipboard);
  const copy = prepareGraphCopy(destination, clipboard, { x: 100, y: 200 });
  assert.deepEqual(copy.nodes.map(node => [node.label, node.x, node.y]), [['树影', 90, 180], ['雨声', 110, 220]]);
  assert.equal(copy.edges[0].source, copy.nodes[0].id); assert.equal(copy.edges[0].target, copy.nodes[1].id);
  assert.equal(copy.nodes[1].colorMode, 'custom'); assert.equal(copy.nodes[1].color, '#000000');
  assert.equal(copy.edges[0].label, '唤起'); assert.equal(copy.edges[0].color, '#9985A8');
  copy.nodes[1].tags.push('新标签');
  assert.deepEqual(clipboard, before); assert.deepEqual(destination, empty());
});

test('rapid copies reserve unique IDs against existing nodes and the whole prepared batch', () => {
  const now = Date.now; Date.now = () => 5000;
  try {
    const graph = empty(); graph.nodes.push({ id: 'n_5000' });
    const clipboard = { nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges: [] };
    const first = prepareGraphCopy(graph, clipboard, { x: 0, y: 0 }); graph.nodes.push(...first.nodes);
    const second = prepareGraphCopy(graph, clipboard, { x: 0, y: 0 });
    assert.equal(new Set([...graph.nodes, ...second.nodes].map(node => node.id)).size, 7);
  } finally { Date.now = now; }
});

test('copying remaps object endpoints and prototype-like IDs and omits external edges', () => {
  const clipboard = { nodes: [{ id: '__proto__' }, { id: 'constructor' }], edges: [
    { source: { id: '__proto__' }, target: { id: 'constructor' }, label: 'inside' },
    { source: 'outside', target: 'constructor', label: 'outside' },
  ] };
  const copy = prepareGraphCopy(empty(), clipboard, { x: 0, y: 0 });
  assert.equal(copy.edges.length, 1); assert.equal(copy.edges[0].source, copy.nodes[0].id);
  assert.equal(copy.edges[0].target, copy.nodes[1].id);
});

test('a copied structure becomes ordinary content while references and notes remain independent', () => {
  const node = { id: 's', structure: { memberIds: ['a', 'b'] }, structureParentId: 'parent', createdOrder: 99,
    note: '笔记', fixed: true, fx: 20, fy: 30, mediaType: 'image', mediaUrl: 'nodespace-attachment:local',
    resourceRef: { path: '原文.md', kind: 'markdown' } };
  const copy = prepareGraphCopy(empty(), { nodes: [node], edges: [] }, { x: 0, y: 0 }).nodes[0];
  assert.equal(copy.structure, undefined); assert.equal(copy.structureParentId, undefined); assert.equal(copy.createdOrder, undefined);
  assert.equal(copy.fixed, false); assert.equal(copy.fx, null); assert.equal(copy.fy, null);
  assert.equal(copy.note, '笔记'); assert.equal(copy.mediaUrl, node.mediaUrl); assert.deepEqual(copy.resourceRef, node.resourceRef);
  copy.resourceRef.path = '副本.md'; assert.equal(node.resourceRef.path, '原文.md');
});

test('invalid coordinate values are contained and duplicate clipboard IDs reject before mutation', () => {
  const graph = empty();
  const copy = prepareGraphCopy(graph, { nodes: [{ id: 'a', x: NaN, y: Infinity }, { id: 'b', x: '12', y: null }], edges: [] }, { x: NaN, y: Infinity });
  assert.ok(copy.nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y)));
  assert.throws(() => prepareGraphCopy(graph, { nodes: [{ id: 'same' }, { id: 'same' }], edges: [] }, { x: 0, y: 0 }), /duplicate/);
  assert.deepEqual(graph, empty());
});
