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

const { getExpandedStructureBoundaryModels } = await importTypeScriptModule(
  path.join(root, 'src', 'structure-nodes.ts'),
  { './node-order': path.join(root, 'src', 'node-order.ts') },
);

const ordinary = id => ({ id, label: id.toUpperCase() });
const structure = (id, memberIds, collapsed, extras = {}) => ({
  id, label: `Structure ${id}`, color: '#abc', structure: { memberIds, collapsed, summary: 'Boundary summary', ...extras },
});

test('expanded boundary models use valid ordinary members and persistent edge counts without mutation', () => {
  const graph = {
    nodes: [
      ordinary('a'), ordinary('b'), ordinary('outside'),
      structure('expanded', ['a', 'b', 'a', 'missing', 'collapsed'], false),
      structure('collapsed', ['a'], true),
      structure('empty', ['missing'], false),
    ],
    edges: [
      { source: 'a', target: 'b' },
      { source: 'a', target: 'outside' },
      { source: 'outside', target: 'b' },
      { source: 'expanded', target: 'outside' },
      { source: 'a', target: 'expanded' },
      { source: 'a', target: 'b', _structureMembership: true },
      { source: { id: 'b' }, target: { id: 'outside' } },
    ],
    groups: [],
  };
  const before = structuredClone(graph);

  const models = getExpandedStructureBoundaryModels(graph);

  assert.deepEqual(models, [{
    structureId: 'expanded',
    memberIds: ['a', 'b'],
    label: 'Structure expanded',
    summary: 'Boundary summary',
    color: '#abc',
    memberCount: 2,
    externalEdgeCount: 4,
    directEdgeCount: 2,
  }]);
  assert.equal(Object.isFrozen(models[0].memberIds), true);
  assert.deepEqual(graph, before);
});

test('expanded boundary models accept one valid member and omit absent optional metadata', () => {
  const graph = {
    nodes: [ordinary('a'), { id: 's', structure: { memberIds: ['a'], collapsed: false } }],
    edges: [],
    groups: [],
  };

  assert.deepEqual(getExpandedStructureBoundaryModels(graph), [{
    structureId: 's', memberIds: ['a'], label: 's', summary: undefined, color: undefined,
    memberCount: 1, externalEdgeCount: 0, directEdgeCount: 0,
  }]);
});
