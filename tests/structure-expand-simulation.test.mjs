import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inlineNodeRadiusModule } from './helpers/node-radius-module.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function transpiledDataUrl(filePath, replacements = new Map()) {
  let source = inlineNodeRadiusModule(await readFile(filePath, 'utf8'));
  for (const [specifier, replacement] of replacements) {
    source = source
      .replaceAll(`from '${specifier}'`, `from '${replacement}'`)
      .replaceAll(`from "${specifier}"`, `from "${replacement}"`);
  }
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
}

async function importSimulation(includeManager = false) {
  const sourceRoot = path.join(root, 'src');
  const nodeOrderUrl = await transpiledDataUrl(path.join(sourceRoot, 'node-order.ts'));
  const structureUrl = await transpiledDataUrl(
    path.join(sourceRoot, 'structure-nodes.ts'),
    new Map([[ './node-order', nodeOrderUrl ]]),
  );
  const groupUrl = await transpiledDataUrl(path.join(sourceRoot, 'group-membership.ts'));
  const hitUrl = await transpiledDataUrl(
    path.join(sourceRoot, 'geometry', 'hit.ts'),
    new Map([[ '../group-membership', groupUrl ]]),
  );
  const d3Url = pathToFileURL(require.resolve('d3')).href;
  const simulationUrl = await transpiledDataUrl(
    path.join(sourceRoot, 'simulation.ts'),
    new Map([
      [ 'd3', d3Url ],
      [ './geometry/hit', hitUrl ],
      [ './structure-nodes', structureUrl ],
      [ './group-membership', groupUrl ],
    ]),
  );
  if (!includeManager) return import(simulationUrl);
  const staticSimulationUrl = await transpiledDataUrl(path.join(sourceRoot, 'static-simulation.ts'));
  return import(await transpiledDataUrl(path.join(sourceRoot, 'graph-sim.ts'), new Map([
    ['d3', d3Url], ['./simulation', simulationUrl], [ './structure-nodes', structureUrl ], ['./static-simulation', staticSimulationUrl],
  ])));
}

async function importGraphVisibility() {
  const source = await readFile(path.join(root, 'src', 'graph-visibility.ts'), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

function simulationManagerCalls(source, fileName) {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const calls = [];
  const visit = node => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'createSimManager') {
      calls.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return calls.map(call => call.getText(file));
}

const simParams = excludeNodeIds => ({
  gw: 800,
  gh: 600,
  linkDist: 120,
  linkStr: 0.3,
  charge: -100,
  centerS: 0.02,
  collideR: 10,
  groupBound: 0.8,
  excludeNodeIds,
  onTick: () => {},
});

function graphWithStructure(collapsed) {
  return {
    nodes: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'outside', label: 'Outside' },
      { id: 's', label: 'Structure', structure: { memberIds: ['a', 'b'], collapsed } },
    ],
    edges: [
      { source: 'a', target: 'b', label: 'internal' },
      { source: 'a', target: 'outside', label: 'external' },
    ],
    groups: [],
  };
}

test('base simulation exclusions are derived from each graph, never rendered shared state', async () => {
  const main = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');
  const paneManager = await readFile(path.join(root, 'src', 'pane-manager.ts'), 'utf8');

  const baseCalls = [
    ...simulationManagerCalls(main, 'main.ts').filter(call => !call.includes('view.graph')),
    ...simulationManagerCalls(paneManager, 'pane-manager.ts'),
  ];
  assert.ok(baseCalls.length > 0);
  assert.ok(baseCalls.every(call => !call.includes('sharedState.hiddenNodeIds')));
  assert.ok(baseCalls.every(call => call.includes('getCollapsedHierarchyHiddenNodeIds')));
  assert.match(main, /getCollapsedHierarchyHiddenNodeIds\(graph\)/);
  assert.match(main, /getCollapsedHierarchyHiddenNodeIds\(pane1\.graph\)/);
  assert.match(main, /getCollapsedHierarchyHiddenNodeIds\(pane\.graph\)/);
  assert.match(main, /getCollapsedHierarchyHiddenNodeIds\(np\.graph\)/);
  assert.match(paneManager, /getCollapsedHierarchyHiddenNodeIds\(pane\.graph\)/);
});

test('expanding a structure rebuilds a simulation with its members and resolvable membership and external edges', async () => {
  const { initSimulation } = await importSimulation();
  const graph = graphWithStructure(true);
  const staleRenderedHiddenIds = new Set(['a', 'b']);

  const collapsedSim = initSimulation(graph, simParams(staleRenderedHiddenIds));
  assert.deepEqual(new Set(collapsedSim.nodes().map(node => node.id)), new Set(['outside', 's']));
  collapsedSim.stop();

  graph.nodes.find(node => node.id === 's').structure.collapsed = false;
  const expandedSim = initSimulation(graph, simParams(new Set()));
  const simNodeIds = new Set(expandedSim.nodes().map(node => node.id));
  assert.deepEqual(simNodeIds, new Set(['a', 'b', 'outside', 's']));

  const edges = expandedSim.force('link').links();
  assert.ok(edges.some(edge => edge._structureMembership && edge.source.id === 's' && edge.target.id === 'a'));
  assert.ok(edges.some(edge => edge._structureMembership && edge.source.id === 's' && edge.target.id === 'b'));
  assert.ok(edges.some(edge => edge.label === 'external' && edge.source.id === 'a' && edge.target.id === 'outside'));
  assert.ok(edges.every(edge => typeof edge.source === 'object' && typeof edge.source.id === 'string'));
  assert.ok(edges.every(edge => typeof edge.target === 'object' && typeof edge.target.id === 'string'));
  assert.deepEqual(graph.edges, [
    { source: 'a', target: 'b', label: 'internal' },
    { source: 'a', target: 'outside', label: 'external' },
  ]);
  assert.ok(graph.edges.every(edge => typeof edge.source === 'string' && typeof edge.target === 'string'));
  expandedSim.stop();
});

test('collapsed hierarchy exclusions stay local to their pane graph', async () => {
  const { getCollapsedHierarchyHiddenNodeIds } = await importGraphVisibility();
  const paneWithCollapsedHierarchy = {
    nodes: [
      { id: 'parent', collapsed: true, headingLevel: 2 },
      { id: 'child', headingLevel: 3 },
    ],
    edges: [{ source: 'parent', target: 'child' }],
    groups: [],
  };
  const unrelatedPane = {
    nodes: [{ id: 'parent' }, { id: 'child' }],
    edges: [{ source: 'parent', target: 'child' }],
    groups: [],
  };

  assert.deepEqual(getCollapsedHierarchyHiddenNodeIds(paneWithCollapsedHierarchy), new Set(['child']));
  assert.deepEqual(getCollapsedHierarchyHiddenNodeIds(unrelatedPane), new Set());
});

test('branch folding hides orphaned descendants and preserves shared paths and upward references', async () => {
  const { getCollapsedHierarchyHiddenNodeIds } = await importGraphVisibility();
  const graph = {
    nodes: [
      { id: 'upstream', headingLevel: 1, collapsed: true },
      { id: 'root', headingLevel: 2, collapsed: true },
      { id: 'hidden-branch', headingLevel: 3 },
      { id: 'hidden-leaf', headingLevel: 4 },
      { id: 'open-parent', headingLevel: 2 },
      { id: 'shared', headingLevel: 3 },
      { id: 'shared-leaf', headingLevel: 4 },
    ],
    edges: [
      { source: 'root', target: 'upstream' },
      { source: 'root', target: 'hidden-branch' },
      { source: 'hidden-branch', target: 'hidden-leaf' },
      { source: 'root', target: 'shared' },
      { source: 'open-parent', target: { id: 'shared' } },
      { source: 'shared', target: 'shared-leaf' },
      { source: 'missing', target: 'hidden-leaf' },
    ],
    groups: [],
  };
  assert.deepEqual(getCollapsedHierarchyHiddenNodeIds(graph), new Set(['hidden-branch', 'hidden-leaf']));
  graph.nodes.find(node => node.id === 'root').collapsed = false;
  assert.deepEqual(getCollapsedHierarchyHiddenNodeIds(graph), new Set());
});

test('fold commands keep nested flags and shared branches recoverable without changing the graph during planning', async () => {
  const { getCollapsedHierarchyHiddenNodeIds, getHierarchyFoldActions } = await importGraphVisibility();
  const graph = {
    nodes: ['root', 'inside', 'leaf', 'shared', 'shared-leaf', 'outer'].map(id => ({ id })),
    edges: [
      { source: 'root', target: 'inside' }, { source: 'inside', target: 'leaf' },
      { source: 'root', target: 'shared' }, { source: 'shared', target: 'shared-leaf' },
      { source: 'outer', target: 'shared' }, { source: 'leaf', target: 'leaf' },
    ],
    groups: [],
  };
  const apply = action => {
    const ids = getHierarchyFoldActions(graph, 'root').get(action);
    for (const node of graph.nodes) {
      if (ids.includes(node.id)) node.collapsed = action.startsWith('collapse');
    }
  };
  const before = structuredClone(graph);
  assert.deepEqual(getHierarchyFoldActions(graph, 'root').get('collapseAll'), ['root', 'inside']);
  assert.equal(getHierarchyFoldActions(graph, 'leaf').size, 0);
  assert.deepEqual(graph, before);
  apply('collapseAll');
  assert.deepEqual(getCollapsedHierarchyHiddenNodeIds(graph), new Set(['inside', 'leaf']));
  assert.deepEqual(getHierarchyFoldActions(graph, 'root').get('expandAll'), ['root', 'inside']);
  apply('expand');
  assert.deepEqual(getCollapsedHierarchyHiddenNodeIds(graph), new Set(['leaf']));
  apply('expand');
  assert.deepEqual(getCollapsedHierarchyHiddenNodeIds(graph), new Set());
});

test('a rootless cycle stays visible and a lifted branch below it can still fold', async () => {
  const { getCollapsedHierarchyHiddenNodeIds } = await importGraphVisibility();
  const graph = {
    nodes: [{ id: 'a', collapsed: true }, { id: 'b', collapsed: true }, { id: 'child' }, { id: 'leaf' }],
    edges: [
      { source: 'a', target: 'b' }, { source: 'b', target: 'a' },
      { source: 'b', target: 'child' }, { source: 'child', target: 'leaf' },
    ],
    groups: [],
  };
  assert.deepEqual(getCollapsedHierarchyHiddenNodeIds(graph), new Set(['child', 'leaf']));
  graph.nodes[1].collapsed = false;
  assert.deepEqual(getCollapsedHierarchyHiddenNodeIds(graph), new Set());
});

test('static and force simulations reuse visible positions and safely rejoin folded nodes without duplicates', async () => {
  const { createSimManager } = await importSimulation(true);
  const { getCollapsedHierarchyHiddenNodeIds } = await importGraphVisibility();
  for (const staticMode of [true, false]) {
    const graph = {
      nodes: [{ id: 'root', x: 40, y: 40 }, { id: 'child', x: 80, y: 90 }],
      edges: [{ source: 'root', target: 'child' }],
      groups: [],
    };
    const hidden = () => getCollapsedHierarchyHiddenNodeIds(graph);
    const manager = createSimManager(graph, () => 800, () => 600, () => 100, () => .3, () => -100,
      () => .02, () => 10, () => .8, () => .01, () => 1, hidden, () => {});
    manager.setStaticMode(staticMode);
    manager.initSim();
    try {
      const sim = manager.getSim();
      const [rootNode, childNode] = sim.nodes();
      graph.nodes[0].collapsed = true;
      manager.refreshHierarchyNodes(hidden(), new Set(['child']));
      assert.deepEqual(sim.nodes(), [rootNode, childNode]);
      manager.refreshHierarchyNodes(hidden());
      assert.deepEqual(sim.nodes(), [rootNode]);
      if (!staticMode) assert.equal(sim.force('link').links().length, 0);
      graph.nodes[0].collapsed = false;
      manager.refreshHierarchyNodes(hidden());
      assert.equal(manager.getSim(), sim);
      assert.equal(sim.nodes()[0], rootNode);
      assert.deepEqual(sim.nodes().map(node => [node.id, node.x, node.y]), [['root', 40, 40], ['child', 80, 90]]);
      assert.equal(graph.nodes.length, 2);
      if (!staticMode) assert.equal(sim.force('link').links().length, 1);
    } finally {
      manager.dispose();
    }
  }
});
