import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadStructureNodes() {
  let source = await readFile(path.join(root, 'src', 'structure-nodes.ts'), 'utf8');
  const dependencySource = await readFile(path.join(root, 'src', 'node-order.ts'), 'utf8');
  const dependencyOutput = ts.transpileModule(dependencySource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const dependencyUrl = `data:text/javascript;base64,${Buffer.from(dependencyOutput).toString('base64')}`;
  source = source.replaceAll("from './node-order'", `from '${dependencyUrl}'`);
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

const { getStructureProjection } = await loadStructureNodes();

const node = id => ({ id, label: id });
const structure = (id, memberIds, collapsed) => ({
  id,
  label: id,
  structure: { memberIds, collapsed },
});

test('projection keeps source arrays and edge identities when structures have no valid work', () => {
  const edge = { source: 'a', target: 'b', label: 'kept' };
  const graph = {
    nodes: [node('a'), node('b'), structure('invalid', ['a'], true)],
    edges: [edge],
    groups: [],
  };

  const projection = getStructureProjection(graph);

  assert.equal(projection.nodes, graph.nodes);
  assert.equal(projection.edges, graph.edges);
  assert.equal(projection.edges[0], edge);
  assert.equal(projection.hiddenNodeIds.size, 0);
});

test('projection reuses unredirected edges and adds expanded membership edges', () => {
  const unchanged = { source: 'outside', target: 'other' };
  const redirected = { source: 'a', target: 'outside' };
  const graph = {
    nodes: [node('a'), node('b'), node('outside'), node('other'), structure('collapsed', ['a', 'b'], true), structure('expanded', ['outside', 'other'], false)],
    edges: [unchanged, redirected],
    groups: [],
  };

  const projection = getStructureProjection(graph);

  assert.equal(projection.edges[0], unchanged);
  assert.notEqual(projection.edges[1], redirected);
  assert.deepEqual(projection.edges[1], { source: 'collapsed', target: 'outside', _originalIndex: 1 });
  assert.deepEqual(
    projection.edges.filter(edge => edge._structureMembership).map(edge => [edge.source, edge.target]),
    [['expanded', 'outside'], ['expanded', 'other']],
  );
});
