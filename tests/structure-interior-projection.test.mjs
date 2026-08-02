import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
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
    source = source.replaceAll(`from '${specifier}'`, `from '${dependencyUrl}'`);
  }
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

const { getStructureInteriorProjection } = await importTypeScriptModule(
  path.join(root, 'src', 'structure-nodes.ts'),
  { './node-order': path.join(root, 'src', 'node-order.ts') },
);

const ordinary = (id, x = 0, y = 0) => ({ id, label: id.toUpperCase(), x, y });
const structure = (id, memberIds) => ({ id, label: id, structure: { memberIds, collapsed: true } });

test('interior projection returns original members/internal edges and immutable merged proxies', () => {
  const inside = { source: 'a', target: 'b', label: 'inside' };
  const outgoing = { source: 'a', target: 'outside', label: 'out' };
  const incoming = { source: 'outside', target: 'b', label: 'in' };
  const graph = {
    nodes: [ordinary('a', 10, 20), ordinary('b', 30, 40), ordinary('outside', 90, 100), structure('s', ['a', 'b', 's', 'missing', 'a'])],
    edges: [inside, outgoing, incoming, { source: 's', target: 'outside', label: 'whole relationship' }],
    groups: [],
  };
  const before = structuredClone(graph);

  const projection = getStructureInteriorProjection(graph, 's');

  assert.ok(projection);
  assert.deepEqual(projection.memberNodes, [graph.nodes[0], graph.nodes[1]]);
  assert.equal(projection.internalEdges[0], inside);
  assert.equal(projection.externalProxyNodes.length, 1);
  assert.equal(projection.externalProxyNodes[0]._externalNodeId, 'outside');
  assert.equal(Object.isFrozen(projection.externalProxyNodes[0]), true);
  assert.equal(Object.isFrozen(projection.externalProxyEdges[0]), true);
  assert.equal(projection.externalProxyEdges.length, 2);
  assert.deepEqual(projection.externalProxyEdges.map(edge => edge._originalIndex), [1, 2]);
  assert.equal(projection.externalProxyEdges[0].originalEdge, outgoing);
  assert.equal(projection.externalProxyEdges[0].target, projection.externalProxyNodes[0].id);
  assert.equal(projection.externalProxyEdges[1].source, projection.externalProxyNodes[0].id);
  assert.deepEqual(projection.metadata.memberIds, ['a', 'b']);
  assert.deepEqual(projection.metadata.invalidMemberIds, ['s', 'missing', 'a']);
  assert.deepEqual(projection.metadata.boundaryEdgeIndexes, [1, 2]);
  assert.deepEqual(projection.metadata.directStructureEdges.map(item => item.originalIndex), [3]);
  assert.deepEqual(graph, before);
});

test('interior proxy IDs remain deterministic and never collide with real node IDs', () => {
  const expectedBase = '__structure_proxy__s__outside';
  const graph = {
    nodes: [ordinary('a'), ordinary('b'), ordinary('outside'), ordinary(expectedBase), structure('s', ['a', 'b'])],
    edges: [{ source: 'a', target: 'outside' }],
    groups: [],
  };

  const first = getStructureInteriorProjection(graph, 's');
  const second = getStructureInteriorProjection(graph, 's');

  assert.ok(first && second);
  assert.equal(first.externalProxyNodes[0].id, `${expectedBase}__1`);
  assert.equal(first.externalProxyNodes[0].id, second.externalProxyNodes[0].id);
  assert.equal(graph.nodes.some(node => node.id === first.externalProxyNodes[0].id), false);
});

test('interior projection proxies structure boundary endpoints without recursively entering them', () => {
  const graph = {
    nodes: [ordinary('a'), ordinary('b'), ordinary('c'), ordinary('d'), structure('other', ['c', 'd']), structure('s', ['a', 'b'])],
    edges: [{ source: 'a', target: 'other' }],
    groups: [],
  };
  const before = structuredClone(graph);

  assert.equal(getStructureInteriorProjection(graph, 'missing'), null);
  const projection = getStructureInteriorProjection(graph, 's');

  assert.ok(projection);
  assert.equal(projection.externalProxyNodes.length, 1);
  assert.equal(projection.externalProxyNodes[0]._externalNodeId, 'other');
  assert.equal(projection.externalProxyNodes[0].label, 'other');
  assert.equal(Object.isFrozen(projection.externalProxyNodes[0]), true);
  assert.equal(projection.externalProxyEdges.length, 1);
  assert.equal(projection.externalProxyEdges[0].target, projection.externalProxyNodes[0].id);
  assert.deepEqual(projection.memberNodes, [graph.nodes[0], graph.nodes[1]]);
  assert.deepEqual(graph, before);
});
