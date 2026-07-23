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
    source = source.replace(`from '${specifier}'`, `from '${dependencyUrl}'`);
  }
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

const nodeOrderPath = path.join(root, 'src', 'node-order.ts');

test('repairCreatedOrders backfills legacy nodes in array order', async () => {
  const { repairCreatedOrders } = await importTypeScriptModule(nodeOrderPath);
  const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  repairCreatedOrders(nodes);

  assert.deepEqual(nodes.map(node => node.createdOrder), [0, 1, 2]);
});

test('repairCreatedOrders preserves first valid unique orders and repairs the rest', async () => {
  const { repairCreatedOrders } = await importTypeScriptModule(nodeOrderPath);
  const nodes = [
    { id: 'a', createdOrder: 4 },
    { id: 'b', createdOrder: 4 },
    { id: 'c', createdOrder: -1 },
    { id: 'd', createdOrder: 2.5 },
    { id: 'e', createdOrder: 1 },
    { id: 'f', createdOrder: '3' },
  ];

  repairCreatedOrders(nodes);

  assert.deepEqual(nodes.map(node => node.createdOrder), [4, 5, 6, 7, 1, 8]);
});

test('repairCreatedOrders is idempotent and new nodes receive the next order', async () => {
  const { assignCreatedOrder, nextCreatedOrder, repairCreatedOrders } = await importTypeScriptModule(nodeOrderPath);
  const nodes = [{ id: 'a', createdOrder: 3 }, { id: 'b' }];

  repairCreatedOrders(nodes);
  const once = nodes.map(node => node.createdOrder);
  repairCreatedOrders(nodes);
  assert.deepEqual(nodes.map(node => node.createdOrder), once);
  assert.equal(nextCreatedOrder(nodes), 5);

  const newNode = { id: 'c' };
  assert.equal(assignCreatedOrder(newNode, nodes), 5);
  assert.equal(newNode.createdOrder, 5);
});

test('assignCreatedOrders repairs once and preserves supplied batch order', async () => {
  const { assignCreatedOrders } = await importTypeScriptModule(nodeOrderPath);
  const existing = [
    { id: 'preserved', createdOrder: 4 },
    { id: 'legacy' },
    { id: 'duplicate', createdOrder: 4 },
  ];
  const batch = [{ id: 'third' }, { id: 'first' }, { id: 'second' }];

  assert.deepEqual(assignCreatedOrders(batch, existing), [7, 8, 9]);
  assert.deepEqual(existing.map(node => node.createdOrder), [4, 5, 6]);
  assert.deepEqual(batch.map(node => node.createdOrder), [7, 8, 9]);
});

test('assignCreatedOrders rejects batches beyond the safe integer boundary', async () => {
  const { assignCreatedOrders } = await importTypeScriptModule(nodeOrderPath);
  const existing = [{ id: 'last', createdOrder: Number.MAX_SAFE_INTEGER - 1 }];
  const batch = [{ id: 'overflow-a' }, { id: 'overflow-b' }];

  assert.throws(
    () => assignCreatedOrders(batch, existing),
    /createdOrder has reached the largest safe integer/,
  );
  assert.deepEqual(batch.map(node => node.createdOrder), [undefined, undefined]);
});

test('structure nodes receive a new order and copied nodes discard it', async () => {
  const { createStructureNode, sanitizeCopiedNode } = await importTypeScriptModule(
    path.join(root, 'src', 'structure-nodes.ts'),
    { './node-order': nodeOrderPath },
  );
  const graph = {
    nodes: [
      { id: 'a', label: 'A', x: 0, y: 0, headingLevel: 4, tags: ['shared'], createdOrder: 2 },
      { id: 'b', label: 'B', x: 8, y: 4, headingLevel: 5, tags: ['shared'] },
    ],
    edges: [],
    groups: [],
  };

  const structure = createStructureNode(graph, ['a', 'b'], 'Group');

  assert.equal(structure.createdOrder, 4);
  assert.deepEqual(graph.nodes.map(node => node.createdOrder), [2, 3, 4]);
  assert.equal(sanitizeCopiedNode(structure).createdOrder, undefined);
});
