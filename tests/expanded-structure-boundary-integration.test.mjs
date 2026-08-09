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

async function importPaneBoundaryHelpers() {
  let geometrySource = await readFile(path.join(root, 'src', 'geometry', 'structure-boundary.ts'), 'utf8');
  const geometryOutput = ts.transpileModule(geometrySource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const geometryUrl = `data:text/javascript;base64,${Buffer.from(geometryOutput).toString('base64')}`;
  const paneSource = await readFile(path.join(root, 'src', 'pane-state.ts'), 'utf8');
  const helperStart = paneSource.indexOf('export function hitPaneStructureBoundary');
  const helperEnd = paneSource.indexOf('/** Stable event-context facade', helperStart);
  const helperSource = paneSource.slice(helperStart, helperEnd)
    .replace('export function', 'function')
    .concat('\nexport { hitPaneStructureBoundary };');
  const output = ts.transpileModule(`import { hitTestStructureBoundary } from '${geometryUrl}';\n${helperSource}`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return Promise.all([
    import(geometryUrl),
    import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`),
  ]);
}

test('pane-local helper hits header/outline but not boundary interior', async () => {
  const [{ computeStructureBoundary }, { hitPaneStructureBoundary }] = await importPaneBoundaryHelpers();
  const shape = computeStructureBoundary([
    { x: 0, y: 0, visualRadius: 8 },
    { x: 80, y: 0, visualRadius: 8 },
  ]);
  assert.ok(shape);
  const first = { structureBoundaryShapes: new Map([['s1', shape]]) };
  const second = { structureBoundaryShapes: new Map() };
  assert.equal(hitPaneStructureBoundary(first, shape.headerAnchor.x, shape.headerAnchor.y), 's1');
  assert.equal(hitPaneStructureBoundary(first, shape.center.x, shape.bounds.maxY - 15), null);
  assert.equal(hitPaneStructureBoundary(second, shape.headerAnchor.x, shape.headerAnchor.y), null);
});

test('renderPane gates root boundaries, hides expanded circles, filters membership, and anchors direct edges', async () => {
  const source = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');
  const file = parse(source, 'main.ts');
  const render = functionLike(file, 'renderPane');
  assert.ok(render);
  const text = render.getText(file);

  assert.match(text, /if \(st\.structureView \|\| isCardMode\) \{[\s\S]*clearPaneStructureBoundaries\(st\)/);
  assert.match(text, /getExpandedStructureBoundaryModels\(graph\)/);
  assert.match(text, /const member = simNodesById\.get\(memberId\)/);
  assert.match(text, /const shape = computeStructureBoundary\(memberPositions\)/);
  assert.match(text, /updateStructureBoundaries\(pixi\.structureLayer, boundaryModels/);
  assert.match(text, /drawMembershipLines: true/);
  assert.match(text, /selected: st\.selNode === model\.structureId/);
  assert.match(text, /hovered: st\.hoverStructureId === model\.structureId/);
  assert.match(text, /color: model\.color/);
  assert.match(text, /externalLinkCount: model\.externalEdgeCount/);

  assert.match(text, /hiddenNodes\.has\(n\.id\) \|\| expandedBoundaryIds\.has\(n\.id\)/);
  assert.match(text, /expandedBoundaryIds\.has\(id\)/);
  assert.match(text, /edge\._structureMembership \? \[\] : \[\{ edge, projectionIndex \}\]/);
  assert.match(text, /paneStructureBoundaryEndpoints\(st\)/);
  assert.match(text, /updateEdges\(pixi\.edgeLayer, edgeGraph, edgeRenderNodes/);
});

test('ordinary edge hit testing ignores structure membership edges', async () => {
  const source = await readFile(path.join(root, 'src', 'geometry', 'hit.ts'), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const { hitTestEdge } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
  const nodes = [{ id: 's', x: 0, y: 0 }, { id: 'm', x: 100, y: 0 }];
  assert.equal(hitTestEdge(50, 0, [{ source: 's', target: 'm', _structureMembership: true }], nodes, 6), null);
  assert.equal(hitTestEdge(50, 0, [{ source: 's', target: 'm' }], nodes, 6), 0);
});

test('event priority is node then boundary then edge/group with boundary click, double click, context, and hover', async () => {
  const source = await readFile(path.join(root, 'src', 'ui-events.ts'), 'utf8');
  const file = parse(source, 'ui-events.ts');
  const setup = functionLike(file, 'setupCanvasEvents');
  assert.ok(setup);
  const text = setup.getText(file);

  const tapStart = text.indexOf('const handleTap');
  const tapEnd = text.indexOf('// 视口拖拽', tapStart);
  const tap = text.slice(tapStart, tapEnd);
  assert.ok(tap.indexOf('hitTestNode') < tap.indexOf('hitStructureBoundary'));
  assert.ok(tap.indexOf('hitStructureBoundary') < tap.indexOf('hitTestEdge'));
  assert.ok(tap.indexOf('hitTestEdge') < tap.indexOf('hitTestGroup'));
  assert.match(tap, /ctx\.onStructureBoundaryTap\?\.\(structureId\)/);

  const contextStart = text.indexOf('const triggerContextMenu');
  const contextEnd = text.indexOf('const onDoubleClick', contextStart);
  const context = text.slice(contextStart, contextEnd);
  assert.ok(context.indexOf('hitTestNode') < context.indexOf('hitStructureBoundary'));
  assert.ok(context.indexOf('hitStructureBoundary') < context.indexOf('hitTestEdge'));
  assert.match(context, /onAppContextMenu\?\.\('node', structureId/);

  assert.match(text, /const structureId = node \? null : ctx\.hitStructureBoundary\?\.\(x, y\)/);
  assert.match(text, /ctx\.onNodeDoubleClick\?\.\(targetId\)/);
  assert.match(text, /const hoverStructureId = hoverNode \? null : ctx\.hitStructureBoundary/);
  assert.match(text, /ctx\.onStructureBoundaryHover\?\.\(hoverStructureId\)/);
  assert.match(text, /ctx\.onStructureBoundaryHover\?\.\(null\)/);

  const downStart = text.indexOf('const onPointerDown');
  const downEnd = text.indexOf('const onPointerMove', downStart);
  assert.doesNotMatch(text.slice(downStart, downEnd), /hitStructureBoundary/);
});

test('main and PaneManager factories wire pane-local boundary interaction and lifecycle cleanup', async () => {
  const mainSource = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');
  const mainFile = parse(mainSource, 'main.ts');
  const bind = functionLike(mainFile, 'bindPaneEvents');
  assert.ok(bind);
  const bindText = bind.getText(mainFile);
  assert.match(bindText, /isStructureBoundaryNode: \(id: string\) => pi\.structureBoundaryShapes\.has\(id\)/);
  assert.match(bindText, /hitStructureBoundary: \(x: number, y: number\) => hitPaneStructureBoundary\(pi/);
  assert.match(bindText, /pi\.hoverStructureId = nextId/);
  assert.match(bindText, /onStructureBoundaryTap: \(id: string\) => \{/);
  assert.match(bindText, /fillNode\(id\)/);
  assert.match(bindText, /onNodeDoubleClick: \(id: string\) => enterStructureForPane\(pi, id\)/);

  for (const name of ['loadGraphData', 'loadGraphDataPane1', 'loadGraphForPane']) {
    const fn = functionLike(mainFile, name);
    assert.ok(fn);
    assert.match(fn.getText(mainFile), /clearPaneStructureBoundaries\(/);
  }
  assert.match(mainSource, /clearPaneStructureBoundaries\(pane\);[\s\S]*pane\.structureView = view/);
  assert.match(mainSource, /clearPaneStructureBoundaries\(np, true\)/);

  const managerSource = await readFile(path.join(root, 'src', 'pane-manager.ts'), 'utf8');
  assert.match(managerSource, /isStructureBoundaryNode: \(id: string\) => pi\.structureBoundaryShapes\.has\(id\)/);
  assert.match(managerSource, /hitStructureBoundary: \(x: number, y: number\) => hitPaneStructureBoundary\(pi/);
  assert.match(managerSource, /onStructureBoundaryTap: \(id: string\) => \{/);
  assert.match(managerSource, /clearPaneStructureBoundaries\(pane, true\)/);

  const stateSource = await readFile(path.join(root, 'src', 'pane-state.ts'), 'utf8');
  assert.match(stateSource, /structureBoundaryShapes: Map<string, StructureBoundaryShape>/);
  assert.match(stateSource, /hoverStructureId: string \| null/);
  assert.match(stateSource, /structureBoundaryShapes: new Map\(\)/);
  assert.match(stateSource, /pane\.structureBoundaryShapes\.clear\(\)/);
});
