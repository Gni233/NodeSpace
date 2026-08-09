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

const ordinary = (id, extra = {}) => ({ id, label: id, x: id.charCodeAt(0), y: id.charCodeAt(0) + 10, ...extra });
const structure = (id, memberIds) => ({ id, label: id, x: 900, y: 901, headingLevel: 2, radiusMode: 'level', radius: 31, structure: { memberIds, collapsed: true } });

function graphWithStructure(memberIds = ['a', 'b', 'c']) {
  const members = memberIds.map(id => ordinary(id, { structureParentId: 's' }));
  return {
    nodes: [...members, ordinary('d'), structure('s', memberIds)],
    edges: [{ source: 'a', target: 'd', label: 'persistent', bend: 17 }],
    groups: [],
  };
}

const bytes = value => JSON.stringify(value);

test('add validates before mutation and appends exactly one ordinary member', () => {
  const graph = graphWithStructure();
  const beforeEdges = structuredClone(graph.edges);
  const structureBefore = { ...graph.nodes.find(node => node.id === 's') };

  const result = structureNodes.transactStructureMembership(graph, { action: 'add', structureId: 's', nodeId: 'd' });

  assert.deepEqual(result, { status: 'changed', action: 'add' });
  assert.deepEqual(graph.nodes.find(node => node.id === 's').structure.memberIds, ['a', 'b', 'c', 'd']);
  assert.equal(graph.nodes.find(node => node.id === 'd').structureParentId, 's');
  assert.deepEqual(graph.edges, beforeEdges);
  assert.equal(graph.nodes.find(node => node.id === 's').x, structureBefore.x);
  assert.equal(graph.nodes.find(node => node.id === 's').y, structureBefore.y);
  assert.equal(graph.nodes.find(node => node.id === 's').headingLevel, structureBefore.headingLevel);
  assert.equal(graph.nodes.find(node => node.id === 's').radiusMode, structureBefore.radiusMode);
  assert.equal(graph.nodes.find(node => node.id === 's').radius, structureBefore.radius);
});

test('add is a byte-stable noop for an existing valid member', () => {
  const graph = graphWithStructure();
  const before = bytes(graph);

  assert.deepEqual(
    structureNodes.addNodeToStructure(graph, 's', 'a'),
    { status: 'noop', action: 'add' },
  );
  assert.equal(bytes(graph), before);
});

test('add rejects another owner without partially appending the member', () => {
  const graph = graphWithStructure();
  graph.nodes.find(node => node.id === 'd').structureParentId = 'other';
  const before = bytes(graph);

  assert.deepEqual(
    structureNodes.transactStructureMembership(graph, { action: 'add', structureId: 's', nodeId: 'd' }),
    { status: 'rejected', action: 'add', reason: 'owned-by-other', ownerId: 'other' },
  );
  assert.equal(bytes(graph), before);
  assert.deepEqual(graph.nodes.find(node => node.id === 's').structure.memberIds, ['a', 'b', 'c']);
});

test('remove preserves the structure at two members and changes no edges or coordinates', () => {
  const graph = graphWithStructure();
  const beforeEdges = structuredClone(graph.edges);
  const beforePositions = graph.nodes.map(node => [node.id, node.x, node.y]);

  assert.deepEqual(
    structureNodes.removeNodeFromStructure(graph, 's', 'c'),
    { status: 'changed', action: 'remove' },
  );
  assert.deepEqual(graph.nodes.find(node => node.id === 's').structure.memberIds, ['a', 'b']);
  assert.equal(graph.nodes.find(node => node.id === 'c').structureParentId, undefined);
  assert.deepEqual(graph.edges, beforeEdges);
  assert.deepEqual(graph.nodes.map(node => [node.id, node.x, node.y]), beforePositions);
});

test('last-member removal needs confirmation and a confirmed safe dissolve retains both members', () => {
  const graph = graphWithStructure(['a', 'b']);
  const before = bytes(graph);

  assert.deepEqual(
    structureNodes.transactStructureMembership(graph, { action: 'remove', structureId: 's', nodeId: 'a' }),
    { status: 'needs-confirmation', action: 'remove', remainingMemberIds: ['b'], directEdgeCount: 0 },
  );
  assert.equal(bytes(graph), before);

  assert.deepEqual(
    structureNodes.transactStructureMembership(graph, { action: 'remove', structureId: 's', nodeId: 'a', confirmDissolve: true }),
    { status: 'changed', action: 'dissolve' },
  );
  assert.deepEqual(graph.nodes.map(node => node.id), ['a', 'b', 'd']);
  assert.equal(graph.nodes.find(node => node.id === 'a').structureParentId, undefined);
  assert.equal(graph.nodes.find(node => node.id === 'b').structureParentId, undefined);
  assert.deepEqual(graph.edges, [{ source: 'a', target: 'd', label: 'persistent', bend: 17 }]);
  assert.deepEqual(graph.nodes.map(node => [node.id, node.x, node.y]), [['a', 97, 107], ['b', 98, 108], ['d', 100, 110]]);
});

test('object-endpoint direct edges block confirmed dissolution without mutation', () => {
  const graph = graphWithStructure(['a', 'b']);
  graph.edges.push({ source: { id: 'outside' }, target: { id: 's' }, label: 'whole structure' });
  const before = bytes(graph);

  assert.deepEqual(
    structureNodes.transactStructureMembership(graph, { action: 'remove', structureId: 's', nodeId: 'a' }),
    { status: 'needs-confirmation', action: 'remove', remainingMemberIds: ['b'], directEdgeCount: 1 },
  );
  assert.equal(bytes(graph), before);
  assert.deepEqual(
    structureNodes.transactStructureMembership(graph, { action: 'remove', structureId: 's', nodeId: 'a', confirmDissolve: true }),
    { status: 'rejected', action: 'remove', reason: 'direct-edges', directEdgeCount: 1 },
  );
  assert.equal(bytes(graph), before);
});

test('invalid, missing, stale, and structure-node requests are rejected byte-stably', () => {
  const missingGraph = graphWithStructure();
  const missingBefore = bytes(missingGraph);
  assert.deepEqual(
    structureNodes.transactStructureMembership(missingGraph, { action: 'add', structureId: 'missing', nodeId: 'd' }),
    { status: 'rejected', action: 'add', reason: 'missing-structure' },
  );
  assert.equal(bytes(missingGraph), missingBefore);
  assert.deepEqual(
    structureNodes.transactStructureMembership(missingGraph, { action: 'add', structureId: 's', nodeId: 'missing' }),
    { status: 'rejected', action: 'add', reason: 'missing-node' },
  );
  assert.equal(bytes(missingGraph), missingBefore);
  assert.deepEqual(
    structureNodes.transactStructureMembership(missingGraph, { action: 'add', structureId: 's', nodeId: 's' }),
    { status: 'rejected', action: 'add', reason: 'structure-node' },
  );
  assert.equal(bytes(missingGraph), missingBefore);

  const invalidGraph = graphWithStructure(['a', 'a', 'b']);
  const invalidBefore = bytes(invalidGraph);
  assert.deepEqual(
    structureNodes.transactStructureMembership(invalidGraph, { action: 'add', structureId: 's', nodeId: 'd' }),
    { status: 'rejected', action: 'add', reason: 'invalid-structure' },
  );
  assert.equal(bytes(invalidGraph), invalidBefore);

  const staleGraph = graphWithStructure();
  staleGraph.nodes.find(node => node.id === 'b').structureParentId = undefined;
  const staleBefore = bytes(staleGraph);
  assert.deepEqual(
    structureNodes.transactStructureMembership(staleGraph, { action: 'remove', structureId: 's', nodeId: 'a' }),
    { status: 'rejected', action: 'remove', reason: 'stale' },
  );
  assert.equal(bytes(staleGraph), staleBefore);
});

test('remove rejects a non-member without changing the target structure', () => {
  const graph = graphWithStructure();
  const before = bytes(graph);

  assert.deepEqual(
    structureNodes.transactStructureMembership(graph, { action: 'remove', structureId: 's', nodeId: 'd' }),
    { status: 'rejected', action: 'remove', reason: 'stale' },
  );
  assert.equal(bytes(graph), before);
});
