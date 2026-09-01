import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parse(source, fileName) {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
}

function visit(node, predicate) {
  if (predicate(node)) return node;
  return ts.forEachChild(node, child => visit(child, predicate));
}

function functionLike(file, name) {
  return visit(file, node => (
    (ts.isFunctionDeclaration(node) && node.name?.text === name)
    || (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name)
  ));
}

async function importStructureView() {
  let structureSource = await readFile(path.join(root, 'src', 'structure-nodes.ts'), 'utf8');
  const orderSource = await readFile(path.join(root, 'src', 'node-order.ts'), 'utf8');
  const orderOutput = ts.transpileModule(orderSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  structureSource = structureSource.replace(
    "from './node-order'",
    `from 'data:text/javascript;base64,${Buffer.from(orderOutput).toString('base64')}'`,
  );
  const structureOutput = ts.transpileModule(structureSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let viewSource = await readFile(path.join(root, 'src', 'structure-view.ts'), 'utf8');
  viewSource = viewSource
    .replace("import type { GraphData } from './data/storage';\n", '')
    .replace(
      "from './structure-nodes'",
      `from 'data:text/javascript;base64,${Buffer.from(structureOutput).toString('base64')}'`,
    );
  const output = ts.transpileModule(viewSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

test('pane structure view keeps real members but owns stable read-only proxies and whole-entry nodes', async () => {
  const { createPaneStructureView, isPaneStructureProxyNode, isPaneStructureProxyEdge } = await importStructureView();
  const a = { id: 'a', label: 'A', x: 10, y: 20 };
  const b = { id: 'b', label: 'B', x: 50, y: 20 };
  const outside = { id: 'outside', label: 'Outside', x: 300, y: 20 };
  const structure = { id: 's', label: 'Structure', structure: { memberIds: ['a', 'b'], collapsed: true } };
  const internal = { source: 'a', target: 'b', label: 'inside' };
  const boundary = { source: 'a', target: 'outside', label: 'boundary' };
  const direct = { source: 's', target: 'outside', label: 'whole' };
  const graph = { nodes: [a, b, outside, structure], edges: [internal, boundary, direct], groups: [] };

  const view = createPaneStructureView(graph, 's');
  assert.ok(view);
  assert.equal(view.graph.nodes[0], a);
  assert.equal(view.graph.nodes[1], b);
  assert.equal(view.graph.edges[0], internal);
  assert.equal(view.directStructureEdgeCount, 1);
  assert.equal(view.graph.nodes.some(node => node === outside), false);

  const externalProxy = view.graph.nodes.find(node => node._structureInteriorProxy && !node._structureInteriorEntry);
  const wholeEntry = view.graph.nodes.find(node => node._structureInteriorEntry);
  assert.ok(externalProxy);
  assert.ok(wholeEntry);
  assert.equal(externalProxy.fixed, true);
  assert.equal(wholeEntry.fixed, true);
  assert.equal(isPaneStructureProxyNode(view, externalProxy.id), true);
  assert.equal(isPaneStructureProxyNode(view, wholeEntry.id), true);
  assert.equal([...view.proxyEdgeIndexes].length, 2);
  for (const index of view.proxyEdgeIndexes) assert.equal(isPaneStructureProxyEdge(view, index), true);

  externalProxy.x = 999;
  wholeEntry.label = 'changed pane-only label';
  assert.equal(outside.x, 300);
  assert.equal(direct.label, 'whole');
  assert.equal(graph.nodes.includes(externalProxy), false);
  assert.equal(graph.nodes.includes(wholeEntry), false);
});

test('main integration enters and exits pane scope without replacing runtime graph or shared sim', async () => {
  const source = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');
  const file = parse(source, 'main.ts');
  const main = visit(file, node => ts.isFunctionDeclaration(node) && node.name?.text === 'main');
  assert.ok(main?.body);
  const bodyText = main.body.getText(file);
  assert.match(bodyText, /const enterStructureForPane = \(pane: PaneState, id: string\): void => \{/);
  assert.match(bodyText, /scopedPaneGraph\(pane\)\.nodes\.find\(candidate => candidate\.id === id\)/);
  assert.match(bodyText, /pane\.textViewActive \|\| runtime\.textEditActive/);
  assert.match(bodyText, /pane\.structureController\.enter\(id\)/);
  assert.match(bodyText, /pane\.structureView = view/);
  assert.match(bodyText, /pane\.structureView\.simManager\?\.getSim\?\.\(\)\?\.stop\?\.\(\)/);
  assert.match(bodyText, /pane\.structureController\.exitTo\(-1\)/);
  assert.match(bodyText, /pane\.structurePath = \[\]/);
  assert.match(bodyText, /createPaneStructureView\(paneRuntimeGraph\(pane\), structureId\)/);
  assert.match(bodyText, /view\.simManager = createSimManager/);

  const enterSection = bodyText.slice(bodyText.indexOf('const enterStructureForPane'), bodyText.indexOf('const attachStructureNavigation'));
  assert.doesNotMatch(enterSection, /runtime\.graph\s*=/);
  assert.doesNotMatch(enterSection, /runtime\.simManager\s*=/);
});

test('pane events are scoped and reject proxy mutation, linking, dragging, copy, and delete', async () => {
  const mainSource = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');
  const mainFile = parse(mainSource, 'main.ts');
  const bind = functionLike(mainFile, 'bindPaneEvents');
  assert.ok(bind);
  const bindText = bind.getText(mainFile);
  assert.match(bindText, /const effectiveGraph = paneGraphFacade\(pi, scopedPaneGraph\)/);
  assert.match(bindText, /getSimulation: \(\) => getSM\(\)\.getSim\(\)/);
  assert.match(bindText, /onNodeDoubleClick: \(id: string\) => enterStructureForPane\(pi, id\)/);
  assert.match(bindText, /if \(pi\.structureView \|\| isReadOnlyNode\(sourceId\)/);

  const eventSource = await readFile(path.join(root, 'src', 'ui-events.ts'), 'utf8');
  const eventFile = parse(eventSource, 'ui-events.ts');
  const setup = functionLike(eventFile, 'setupCanvasEvents');
  assert.ok(setup);
  const setupText = setup.getText(eventFile);
  assert.match(setupText, /hasReadOnlyNodes/);
  assert.match(setupText, /!ctx\.isReadOnlyNode\?\.\(node\.id\)/);
  assert.match(setupText, /selEdges\.every\(edge => !ctx\.isReadOnlyEdge\?\.\(edge\.idx\)\)/);
  assert.match(setupText, /!hasReadOnlyNodes\) items\.push\(\{\s*label: `复制所选/);
});

test('text entry, Esc, file loads, pane destruction, and dissolution use structure lifecycle guards', async () => {
  const mainSource = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');
  const mainFile = parse(mainSource, 'main.ts');
  for (const name of ['loadGraphData', 'loadGraphDataPane1', 'loadGraphForPane']) {
    const fn = functionLike(mainFile, name);
    assert.ok(fn);
    assert.match(fn.getText(mainFile), /exitStructureForPane\(/);
  }
  assert.match(mainSource, /targetPane\.structureView && !exitStructureForPane\(targetPane\)/);
  assert.match(mainSource, /else if \(exitStructureForPane\(fp \?\? pane0 as unknown as PaneState, true\)\)/);
  assert.match(mainSource, /请先删除或改接 \$\{directEdges\.length\} 条结构整体关系/);
  const directGuard = mainSource.indexOf('const directEdges = getDirectStructureEdges');
  const dissolveMutation = mainSource.indexOf('dissolveStructureNode(_runtimeGraph, id)', directGuard);
  const undoMutation = mainSource.lastIndexOf('_saveUndo();', dissolveMutation);
  assert.ok(directGuard >= 0 && undoMutation > directGuard && dissolveMutation > undoMutation);

  const managerSource = await readFile(path.join(root, 'src', 'pane-manager.ts'), 'utf8');
  const managerFile = parse(managerSource, 'pane-manager.ts');
  const remove = visit(managerFile, node => ts.isMethodDeclaration(node) && node.name.getText(managerFile) === 'removePane');
  assert.ok(remove);
  assert.match(remove.getText(managerFile), /pane\.structureView\?\.simManager\?\.getSim\?\.\(\)\?\.stop\?\.\(\)/);
  assert.match(remove.getText(managerFile), /pane\.disposeStructureBreadcrumb\?\.\(\)/);
});
