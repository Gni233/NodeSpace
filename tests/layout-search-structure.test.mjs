import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const dataUrl = output => `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;

async function transpile(relativePath, replacements = new Map()) {
  let source = await readFile(path.join(root, relativePath), 'utf8');
  for (const [specifier, replacement] of replacements) {
    source = source
      .replaceAll(`from '${specifier}'`, `from '${replacement}'`)
      .replaceAll(`from "${specifier}"`, `from '${replacement}'`);
  }
  return dataUrl(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText);
}

test('tree layout is deterministic, collision-aware, and separates cross edges', async () => {
  const { computeTreeLayout } = await import(await transpile('src/layouts/tree.ts'));
  const nodes = [
    { id: 's', label: '课程结构', headingLevel: 1, structure: { memberIds: ['a', 'b'], collapsed: false } },
    { id: 'a', headingLevel: 2, radius: 18, createdOrder: 1 },
    { id: 'b', headingLevel: 2, radius: 18, createdOrder: 2 },
    { id: 'c', headingLevel: 3, radius: 14, createdOrder: 3 },
    { id: 'd', headingLevel: 3, radius: 14, createdOrder: 4 },
  ];
  const edges = [
    { source: 's', target: 'a', kind: 'membership' },
    { source: 's', target: 'b', kind: 'membership' },
    { source: 'a', target: 'c', arrow: true },
    { source: 'b', target: 'd', arrow: true },
    { source: 'c', target: 'd', label: '横向关联' },
  ];
  const first = computeTreeLayout(structuredClone(nodes), structuredClone(edges));
  const second = computeTreeLayout(structuredClone(nodes), structuredClone(edges));
  assert.equal(first.positions.size, nodes.length);
  assert.equal(first.rootIds[0], 's');
  assert.equal(first.treeEdgeIndices.size, nodes.length - 1);
  assert.deepEqual([...first.crossEdgeIndices], [4]);
  assert.deepEqual([...first.positions], [...second.positions]);
  assert.ok(Math.abs(first.positions.get('a').x - first.positions.get('b').x) > 70);
});

test('star layout chooses an explicit structure as centre and is stable', async () => {
  const { computeRadialLayout } = await import(await transpile('src/layouts/radial.ts'));
  const nodes = [
    { id: 'a', headingLevel: 1, createdOrder: 1 },
    { id: 's', headingLevel: 2, createdOrder: 2, structure: { memberIds: ['a', 'b'], collapsed: false } },
    { id: 'b', headingLevel: 3, createdOrder: 3 },
  ];
  const edges = [{ source: 's', target: 'a' }, { source: 's', target: 'b' }];
  computeRadialLayout(nodes, edges);
  assert.equal(nodes.find(node => node.id === 's')._starRoot, true);
  const coordinates = nodes.map(node => [node.id, node.x, node.y]);
  computeRadialLayout(nodes, edges);
  assert.deepEqual(nodes.map(node => [node.id, node.x, node.y]), coordinates);
});

test('search shares one weighted rule for names, notes, fuzzy text, and computed structure tags', async () => {
  const groupUrl = await transpile('src/group-membership.ts');
  const { searchGraph } = await import(await transpile('src/search.ts', new Map([
    ['./group-membership', groupUrl],
  ])));
  const graph = {
    nodes: [
      { id: 's', label: '机器学习', structure: { memberIds: ['a', 'b'], collapsed: true }, structureParentId: null },
      { id: 'a', label: '注意力机制', note: '查询矩阵与键矩阵', structureParentId: 's' },
      { id: 'b', label: '复习清单', note: '周五复习', structureParentId: 's' },
    ],
    edges: [], groups: [],
  };
  assert.deepEqual(searchGraph(graph, '机器学习', 'tags').map(result => result.nodeId), ['a', 'b']);
  assert.equal(searchGraph(graph, '查询矩阵', 'all')[0].nodeId, 'a');
  assert.equal(searchGraph(graph, '注力制', 'name', 'fuzzy')[0].nodeId, 'a');
});

test('structure collections participate in category cards without copying tags', async () => {
  const groupUrl = await transpile('src/group-membership.ts');
  const { buildGroupCards } = await import(await transpile('src/cardgrid/partition.ts', new Map([
    ['../group-membership', groupUrl],
    ['./types', dataUrl('export {};')],
  ])));
  const graph = {
    nodes: [
      { id: 's', label: '数据结构', structure: { memberIds: ['a', 'b'], collapsed: false } },
      { id: 'a', label: '树', tags: [], structureParentId: 's' },
      { id: 'b', label: '图', tags: [], structureParentId: 's' },
    ],
    edges: [],
    groups: [{ id: 'g_structure_s', label: '数据结构', displayMode: 'none', collectionKind: 'structure', structureId: 's' }],
  };
  const cards = buildGroupCards(graph, false);
  const structureCard = cards.find(card => card.id === 'group:g_structure_s');
  assert.deepEqual(structureCard.nodeIds.sort(), ['a', 'b']);
  assert.deepEqual(graph.nodes[1].tags, []);
});

test('mobile card rendering targets 60fps while idle work stops completely', async () => {
  const source = await readFile(path.join(root, 'src', 'cardgrid', 'index.ts'), 'utf8');
  const main = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');
  assert.match(source, /const ACTIVE_FRAME_MS = 15/);
  assert.doesNotMatch(source, /IDLE_FRAME_MS/);
  assert.match(source, /this\._rafId = null;\s*return;/);
  assert.match(source, /getStructureProjection\(this\._graph\)/);
  assert.match(main, /const topologyChanged = gn\.length !== _starLastNodeCount \|\| projection\.edges\.length !== _starLastEdgeCount/);
  assert.doesNotMatch(main, /if \(!starRotateMode \|\| nodeCountChanged\)/);
});
