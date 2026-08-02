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

async function importTranspiled(fileName, transforms = source => source) {
  const source = transforms(await readFile(path.join(root, 'src', fileName), 'utf8'));
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
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
  return importTranspiled('structure-view.ts', source => source
    .replace("import type { GraphData } from './data/storage';\n", '')
    .replace(
      "from './structure-nodes'",
      `from 'data:text/javascript;base64,${Buffer.from(structureOutput).toString('base64')}'`,
    ));
}

test('global pane helpers route and reindex a third pane without falling back to primary', async () => {
  const paneState = await importTranspiled('pane-state.ts', source => source
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/export interface PaneState[\s\S]*?^}\r?\n/m, '')
    .replace(/export function paneGraph[\s\S]*$/m, ''));
  const primary = { index: 0, name: 'primary' };
  const extras = [{ index: 99, name: 'right' }, { index: 99, name: 'third' }];

  assert.equal(paneState.paneIndexForExtra(0), 1);
  assert.equal(paneState.paneIndexForExtra(1), 2);
  assert.equal(paneState.extraIndexForPane(2), 1);
  assert.equal(paneState.paneAtGlobalIndex(primary, extras, 2), extras[1]);
  paneState.reindexExtraPanes(extras);
  assert.deepEqual(extras.map(pane => pane.index), [1, 2]);
});

test('structure edge mapping edits only real internal edges and rejects proxies', async () => {
  const { createPaneStructureView, getPaneOriginalEdgeIndex } = await importStructureView();
  const a = { id: 'a', label: 'A' };
  const b = { id: 'b', label: 'B' };
  const outside = { id: 'outside', label: 'Outside' };
  const structure = { id: 's', label: 'S', structure: { memberIds: ['a', 'b'], collapsed: true } };
  const before = { source: 'outside', target: 'a', label: 'before' };
  const internal = { source: 'a', target: 'b', label: 'inside' };
  const boundary = { source: 'b', target: 'outside', label: 'boundary' };
  const direct = { source: 's', target: 'outside', label: 'whole' };
  const graph = { nodes: [a, b, outside, structure], edges: [before, internal, boundary, direct], groups: [] };

  const view = createPaneStructureView(graph, 's');
  assert.ok(view);
  assert.equal(view.getOriginalEdgeIndex(0), 1);
  assert.equal(getPaneOriginalEdgeIndex(view, 0), 1);
  assert.equal(view.isReadOnlyEdge(0), false);
  for (let index = 1; index < view.graph.edges.length; index++) {
    assert.equal(view.getOriginalEdgeIndex(index), null);
    assert.equal(view.isReadOnlyEdge(index), true);
  }
  view.graph.edges[0].label = 'edited';
  assert.equal(graph.edges[1].label, 'edited');
  assert.equal(graph.edges[2].label, 'boundary');
  assert.equal(graph.edges[3].label, 'whole');
});

test('proxy and whole-entry IDs avoid every runtime node ID while real members remain editable', async () => {
  const { createPaneStructureView } = await importStructureView();
  const structureId = 's';
  const externalId = 'outside';
  const collidingProxyId = `__structure_proxy__${encodeURIComponent(structureId)}__${encodeURIComponent(externalId)}`;
  const collidingEntryId = `__structure_entry__${encodeURIComponent(structureId)}__2`;
  const a = { id: 'a', label: 'A' };
  const b = { id: 'b', label: 'B' };
  const outside = { id: externalId, label: 'Outside' };
  const realProxyCollision = { id: collidingProxyId, label: 'Real proxy collision' };
  const realEntryCollision = { id: collidingEntryId, label: 'Real entry collision' };
  const structure = { id: structureId, label: 'S', structure: { memberIds: ['a', 'b'], collapsed: true } };
  const graph = {
    nodes: [a, b, outside, realProxyCollision, realEntryCollision, structure],
    edges: [
      { source: 'a', target: 'b' },
      { source: 'a', target: externalId },
      { source: structureId, target: externalId },
    ],
    groups: [],
  };

  const view = createPaneStructureView(graph, structureId);
  assert.ok(view);
  const projectedIds = view.graph.nodes.map(node => node.id);
  assert.equal(new Set(projectedIds).size, projectedIds.length);
  assert.equal(view.proxyNodeIds.has(collidingProxyId), false);
  assert.equal(view.proxyNodeIds.has(collidingEntryId), false);
  a.label = 'editable member';
  assert.equal(view.graph.nodes.find(node => node.id === 'a').label, 'editable member');
});

test('UI safety paths use callbacks and read-only checks before mutation or fill', async () => {
  const source = await readFile(path.join(root, 'src', 'ui-events.ts'), 'utf8');
  const file = parse(source, 'ui-events.ts');
  const setup = visit(file, node => ts.isFunctionDeclaration(node) && node.name?.text === 'setupCanvasEvents');
  assert.ok(setup?.body);
  const body = setup.body.getText(file);
  assert.match(body, /if \(ctx\.isReadOnlyEdge\?\.\(index\)\) ctx\.onReadOnlySelection\?\.\('edge'\);\s*else ctx\.fillEdge\?\.\(index\)/);
  assert.match(body, /ctx\.deleteNodes\?\.\(\[\.\.\.ids\]\)/);
  assert.match(body, /ctx\.deleteEdges\?\.\(selEdges\.map\(edge => edge\.idx\)\)/);
  assert.doesNotMatch(body, /detachNodeFromStructure\(/);
});

test('main deletion transaction guards direct structure edges before undo and dissolves safe structures', async () => {
  const source = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');
  const file = parse(source, 'main.ts');
  const assignment = visit(file, node => ts.isBinaryExpression(node)
    && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
    && ts.isIdentifier(node.left)
    && node.left.text === 'deleteNodesForPane');
  assert.ok(assignment);
  const text = assignment.getText(file);
  const guard = text.indexOf('protectedEdgeIndexes.size > 0');
  const undo = text.indexOf('pane.undoManager.pushSnapshot');
  const dissolve = text.indexOf('dissolveStructureNode');
  assert.ok(guard >= 0 && undo > guard && dissolve > undo);
  assert.match(text, /未删除任何节点/);
});

test('hot replacement normalizes before refreshing structure views for primary and extra runtimes', async () => {
  const source = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');
  const file = parse(source, 'main.ts');
  const handler = visit(file, node => ts.isFunctionDeclaration(node) && node.name?.text === 'handleExternalGraphChange');
  assert.ok(handler?.body);
  const text = handler.body.getText(file);
  const primaryNormalize = text.indexOf('normalizeStructureRelations(graph)');
  const primaryRefresh = text.indexOf('refreshStructureViews(primaryRuntime)', primaryNormalize);
  const extraNormalize = text.indexOf('normalizeStructureRelations(targetRuntime.graph)');
  const extraRefresh = text.indexOf('refreshStructureViews(targetRuntime)', extraNormalize);
  assert.ok(primaryNormalize >= 0 && primaryRefresh > primaryNormalize);
  assert.ok(extraNormalize >= 0 && extraRefresh > extraNormalize);
});

test('legacy inspector delete buttons are intercepted by the unified pane deletion transactions', async () => {
  const source = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');
  const file = parse(source, 'main.ts');
  const listener = visit(file, node => ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === 'addEventListener'
    && node.expression.expression.getText(file) === 'editCtx.editPanel'
    && ts.isStringLiteral(node.arguments[0])
    && node.arguments[0].text === 'click');
  assert.ok(listener);
  const text = listener.getText(file);
  assert.match(text, /deleteNodesForPane\(pane, \[pane\.selNode\]\)/);
  assert.match(text, /deleteEdgesForPane\(pane, \[pane\.selEdge\]\)/);
  assert.match(text, /stopImmediatePropagation\(\)/);
});
