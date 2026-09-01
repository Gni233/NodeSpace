import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadModule() {
  const source = await readFile(path.join(root, 'src', 'cross-space-context.ts'), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

const node = (id, headingLevel = 6) => ({ id, label: id, note: `${id} content`, headingLevel });

test('cross-space neighborhoods begin at the requested anchor and stay bounded', async () => {
  const { selectCrossSpaceNeighborhood } = await loadModule();
  const graph = {
    nodes: [node('root', 1), ...Array.from({ length: 10 }, (_, index) => node(`n${index}`, 3 + index % 3))],
    edges: Array.from({ length: 10 }, (_, index) => ({ source: index === 0 ? 'root' : `n${index - 1}`, target: `n${index}` })),
    groups: [],
  };
  const selected = selectCrossSpaceNeighborhood(graph, 'n5', 5);
  assert.equal(selected.anchorNodeId, 'n5');
  assert.equal(selected.nodes[0].id, 'n5');
  assert.equal(selected.nodes.length, 5);
  assert.equal(selected.omittedCount, 6);
  const ids = new Set(selected.nodes.map(item => item.id));
  assert.ok(selected.edges.every(edge => ids.has(edge.source) && ids.has(edge.target)));
});

test('branches use canonical proxy identity and never mutate source graphs', async () => {
  const { createCrossSpaceBranch, crossSpaceProxyId } = await loadModule();
  const source = {
    nodes: [node('a', 2), { ...node('b'), tags: ['course'], fixed: true, fx: 4, fy: 5 }],
    edges: [{ source: 'a', target: 'b', label: 'contains' }],
    groups: [],
  };
  const before = JSON.stringify(source);
  const target = { sourceKey: 'graph:course', sourceKind: 'nodespace', sourceLabel: 'Course', sourceGraph: 'course.json', graph: source, anchorNodeId: 'a' };
  const first = createCrossSpaceBranch({ id: 'entry-1', x: 10, y: 20 }, target, 6);
  const second = createCrossSpaceBranch({ id: 'entry-2', x: 50, y: 60 }, target, 6);
  assert.ok(first && second);
  assert.equal(first.anchorProxyId, crossSpaceProxyId('graph:course', 'a'));
  assert.equal(second.anchorProxyId, first.anchorProxyId);
  assert.equal(first.proxyNodes.find(item => item._localContextProxy.canonicalNodeId === 'b').fixed, undefined);
  assert.deepEqual(first.proxyNodes.find(item => item._localContextProxy.canonicalNodeId === 'b').tags, ['跨空间']);
  assert.equal(first.bridgeEdge.relationType, 'cross-space-context');
  assert.equal(first.bridgeEdge._localContextCrossSpace, true);
  assert.equal(JSON.stringify(source), before);
});

test('projection composes branches without duplicating one canonical target', async () => {
  const { createCrossSpaceBranch, composeCrossSpaceProjection, isCrossSpaceProxyEdge } = await loadModule();
  const base = { nodes: [node('entry-1'), node('entry-2')], edges: [], groups: [], settings: { layoutMode: 'auto' } };
  const targetGraph = { nodes: [node('a'), node('b')], edges: [{ source: 'a', target: 'b' }], groups: [] };
  const target = { sourceKey: 'vault:note', sourceKind: 'vault', sourceLabel: 'Note', sourceGraph: 'vault:note', graph: targetGraph, anchorNodeId: 'a' };
  const first = createCrossSpaceBranch(base.nodes[0], target);
  const second = createCrossSpaceBranch(base.nodes[1], target);
  const projection = composeCrossSpaceProjection(base, [first, second]);
  assert.equal(projection.graph.nodes.length, 4);
  assert.equal(projection.proxyNodeIds.size, 2);
  assert.equal(projection.graph.edges.filter(isCrossSpaceProxyEdge).length, 3);
  assert.equal(projection.graph.settings.semanticLayoutMemory, undefined);
  assert.equal(base.nodes.length, 2);
});

test('retaining a path releases branches as soon as their remote anchor is left', async () => {
  const { retainCrossSpaceBranches } = await loadModule();
  const branches = [
    { id: 'one', anchorProxyId: 'proxy-a' },
    { id: 'two', anchorProxyId: 'proxy-b' },
  ];
  assert.deepEqual(retainCrossSpaceBranches(branches, ['root', 'entry', 'proxy-a']).map(item => item.id), ['one']);
  assert.deepEqual(retainCrossSpaceBranches(branches, ['root', 'entry']), []);
});

test('cross-space projection stays transient in pane state and never enters saved graph settings', async () => {
  const [main, pane, storage] = await Promise.all([
    readFile(path.join(root, 'src', 'main.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'pane-state.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'data', 'storage.ts'), 'utf8'),
  ]);
  assert.match(pane, /localContextProjection:/);
  assert.match(main, /composeCrossSpaceProjection\(paneRuntimeGraph\(pane\), branches\)/);
  assert.match(main, /retainCrossSpaceBranches\(projection\.branches, next\.path\)/);
  assert.match(main, /s\.localContextProjection = pane0\.localContextProjection/);
  assert.match(main, /在此展开目标上下文/);
  assert.doesNotMatch(storage, /localContextProjection|_localContextProxy/);
});
