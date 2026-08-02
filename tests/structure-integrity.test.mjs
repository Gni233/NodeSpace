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

const structureNodes = await importTypeScriptModule(
  path.join(root, 'src', 'structure-nodes.ts'),
  { './node-order': path.join(root, 'src', 'node-order.ts') },
);
const { normalizeStructureRelations, sanitizeCopiedNode } = structureNodes;

const ordinary = id => ({ id, label: id });
const structure = (id, memberIds, collapsed = true) => ({
  id,
  label: id,
  structure: { memberIds, collapsed },
});

test('normalization retains an invalid structure with direct edges and reports protection', () => {
  const graph = {
    nodes: [ordinary('a'), ordinary('b'), ordinary('outside'), structure('s', ['a', 'b'])],
    edges: [{ source: 's', target: 'outside' }, { source: 'a', target: 's' }],
    groups: [],
  };

  graph.nodes = graph.nodes.filter(node => node.id !== 'b');
  const result = normalizeStructureRelations(graph);

  assert.deepEqual(graph.nodes.map(node => node.id), ['a', 'outside', 's']);
  assert.deepEqual(graph.edges, [{ source: 's', target: 'outside' }, { source: 'a', target: 's' }]);
  assert.equal(graph.nodes.find(node => node.id === 'a').structureParentId, undefined);
  assert.deepEqual(result, { dissolvedStructureIds: [], protectedStructureIds: ['s'] });
});

test('dissolving an edge-free structure clears members without changing persistent edges', () => {
  const graph = {
    nodes: [ordinary('a'), ordinary('b'), ordinary('outside'), structure('s', ['a', 'b'])],
    edges: [{ source: 'a', target: 'outside' }],
    groups: [],
  };

  normalizeStructureRelations(graph);
  assert.equal(structureNodes.canDissolveStructure(graph, 's'), true);
  assert.equal(structureNodes.dissolveStructureNode(graph, 's'), true);

  assert.deepEqual(graph.nodes.map(node => node.id), ['a', 'b', 'outside']);
  assert.deepEqual(graph.edges, [{ source: 'a', target: 'outside' }]);
  assert.ok(graph.nodes.every(node => node.structureParentId === undefined));
});

test('direct structure edges prevent dissolution without any mutation', () => {
  const graph = {
    nodes: [ordinary('a'), ordinary('b'), ordinary('outside'), structure('s', ['a', 'b'])],
    edges: [{ source: 'outside', target: 's' }],
    groups: [],
  };
  const before = structuredClone(graph);

  assert.equal(structureNodes.canDissolveStructure(graph, 's'), false);
  assert.deepEqual(structureNodes.getDirectStructureEdges(graph, 's').map(item => item.originalIndex), [0]);
  assert.equal(structureNodes.dissolveStructureNode(graph, 's'), false);
  assert.deepEqual(graph, before);
});

test('normalization removes invalid members, resolves ownership by graph order, and clears stale parents', () => {
  const graph = {
    nodes: [
      ordinary('a'),
      ordinary('b'),
      ordinary('c'),
      structure('first', ['a', 'b', 'missing', 'a']),
      structure('second', ['b', 'c']),
      structure('invalid', ['first', 'c']),
      { ...ordinary('stale'), structureParentId: 'missing-parent' },
    ],
    edges: [],
    groups: [],
  };

  normalizeStructureRelations(graph);

  assert.deepEqual(graph.nodes.map(node => node.id), ['a', 'b', 'c', 'first', 'stale']);
  assert.deepEqual(graph.nodes.find(node => node.id === 'first').structure.memberIds, ['a', 'b']);
  assert.equal(graph.nodes.find(node => node.id === 'a').structureParentId, 'first');
  assert.equal(graph.nodes.find(node => node.id === 'b').structureParentId, 'first');
  assert.equal(graph.nodes.find(node => node.id === 'c').structureParentId, undefined);
  assert.equal(graph.nodes.find(node => node.id === 'stale').structureParentId, undefined);
});

test('copied structure and member nodes lose all structure relations', () => {
  const originalStructure = structure('s', ['a', 'b']);
  const originalMember = { ...ordinary('a'), structureParentId: 's' };

  assert.deepEqual(sanitizeCopiedNode(originalStructure), { id: 's', label: 's' });
  assert.deepEqual(sanitizeCopiedNode(originalMember), { id: 'a', label: 'a' });
});

test('text graph application normalizes relations before runtime replacement', async () => {
  const main = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');

  assert.match(main, /normalizeStructureRelations\(repaired\)/);
  assert.match(main, /repairGraphCreatedOrders\(compiled\);\s*\n\s*normalizeStructureRelations\(repaired\);/);
});

test('MCP deletion paths guard direct structure edges and copied nodes are sanitized', async () => {
  const server = await readFile(path.join(root, 'mcp-server', 'server.js'), 'utf8');

  assert.match(server, /function getDirectStructureEdges\(graph, structureId\)/);
  assert.match(server, /function canDissolveStructure\(graph, structureId\)/);
  assert.match(server, /async delete_node[\s\S]*?!canDissolveStructure\(data, nodeId\)[\s\S]*?return \{ error:/);
  assert.match(server, /async delete_nodes_batch[\s\S]*?protectedStructures[\s\S]*?return \{[\s\S]*?error:/);
  assert.match(server, /async delete_nodes_batch[\s\S]*?dissolveStructureNode\(data, node\.id\)[\s\S]*?normalizeStructureRelations\(data\)/);
  assert.match(server, /delete copy\.structure;\s*\n\s*delete copy\.structureParentId;/);
});
