import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function transpiledModule(relativePath) {
  let source = await readFile(path.join(root, relativePath), 'utf8');
  if (source.includes("'../group-membership'")) {
    const groupSource = await readFile(path.join(root, 'src', 'group-membership.ts'), 'utf8');
    const groupOutput = ts.transpileModule(groupSource, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const groupUrl = `data:text/javascript;base64,${Buffer.from(groupOutput).toString('base64')}`;
    source = source.replaceAll("'../group-membership'", `'${groupUrl}'`);
  }
  if (source.includes("'./semantic-zoom'")) {
    const zoomSource = await readFile(path.join(root, 'src', 'semantic-zoom.ts'), 'utf8');
    const zoomOutput = ts.transpileModule(zoomSource, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const zoomUrl = `data:text/javascript;base64,${Buffer.from(zoomOutput).toString('base64')}`;
    source = source.replaceAll("'./semantic-zoom'", `'${zoomUrl}'`);
  }
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

test('semantic edge grammar distinguishes facts, structure, and declared or textual direction', async () => {
  const { inferSemanticEdgeGrammar } = await transpiledModule('src/semantic-edge-grammar.ts');
  assert.deepEqual(inferSemanticEdgeGrammar({ label: '共同主题' }), {
    role: 'explicit', tentative: false, cue: '共同主题',
  });
  assert.equal(inferSemanticEdgeGrammar({ kind: 'hierarchy' }).role, 'structure');
  assert.equal(inferSemanticEdgeGrammar({ label: '属于这个主题' }).tentative, true);
  assert.deepEqual(inferSemanticEdgeGrammar({ arrow: true }), {
    role: 'directional', tentative: false, cue: 'arrow',
  });
  assert.equal(inferSemanticEdgeGrammar({ label: '这个观察导致下一步' }).role, 'directional');
  assert.deepEqual(inferSemanticEdgeGrammar({ relationType: 'cross-space-context', arrow: true }), {
    role: 'reference', tentative: false, cue: 'cross-space-context',
  });
});

test('route families are stable and geometrically distinct', async () => {
  const { buildSemanticEdgeRoute, inferSemanticEdgeGrammar, semanticEdgePoint } = await transpiledModule('src/semantic-edge-grammar.ts');
  const start = { x: 0, y: 0 }, end = { x: 120, y: 0 };
  const explicit = buildSemanticEdgeRoute(start, end, inferSemanticEdgeGrammar({}), 'a');
  const directional = buildSemanticEdgeRoute(start, end, inferSemanticEdgeGrammar({ arrow: true }), 'a');
  const directionalAgain = buildSemanticEdgeRoute(start, end, inferSemanticEdgeGrammar({ arrow: true }), 'a');
  const structure = buildSemanticEdgeRoute(start, { x: 80, y: 120 }, inferSemanticEdgeGrammar({ kind: 'hierarchy' }), 'a');
  assert.equal(explicit.kind, 'cubic');
  assert.equal(directional.kind, 'quadratic');
  assert.notEqual(semanticEdgePoint(explicit, 0.5).y, 0);
  assert.notEqual(semanticEdgePoint(directional, 0.5).y, 0);
  assert.ok(Math.abs(semanticEdgePoint(directional, 0.5).y) > Math.abs(semanticEdgePoint(explicit, 0.5).y));
  assert.deepEqual(directionalAgain, directional);
  assert.equal(structure.kind, 'cubic');
});

test('only tiny semantic gaps fall back to straight segments', async () => {
  const { buildSemanticEdgeRoute, inferSemanticEdgeGrammar } = await transpiledModule('src/semantic-edge-grammar.ts');
  const grammar = inferSemanticEdgeGrammar({ label: '共同主题' });
  assert.equal(buildSemanticEdgeRoute({ x: 0, y: 0 }, { x: 18, y: 0 }, grammar, 'short').kind, 'line');
  assert.equal(buildSemanticEdgeRoute({ x: 0, y: 0 }, { x: 32, y: 0 }, grammar, 'long-enough').kind, 'cubic');
});

test('semantic solid routes receive a subtle under-stroke', async () => {
  const source = await readFile(path.join(root, 'src', 'pixi-edges.ts'), 'utf8');
  assert.match(source, /semanticMode && dashLen === 0/);
  assert.match(source, /drawSolidRoute\(glowG, route, contentWidth \+ 2\.8, baseColor, edgeAlpha \* 0\.12\)/);
});

test('semantic disclosure preserves the backbone and reveals labels with focus and zoom', async () => {
  const { semanticEdgeDisclosure } = await transpiledModule('src/semantic-edge-grammar.ts');
  const structure = { role: 'structure', tentative: false, cue: 'hierarchy' };
  const explicit = { role: 'explicit', tentative: false, cue: 'explicit' };
  const farStructure = semanticEdgeDisclosure(structure, 0.3, false, false);
  const farExplicit = semanticEdgeDisclosure(explicit, 0.3, false, false);
  assert.ok(farStructure.alphaMultiplier > farExplicit.alphaMultiplier);
  assert.ok(farExplicit.widthMultiplier > semanticEdgeDisclosure(explicit, 1, false, false).widthMultiplier);
  assert.equal(farExplicit.showLabel, false);
  assert.ok(semanticEdgeDisclosure(explicit, 0.44, true, true).labelAlpha > 0);
  assert.equal(semanticEdgeDisclosure(explicit, 0.8, true, true).showLabel, true);
  assert.equal(semanticEdgeDisclosure(explicit, 0.8, true, true).labelAlpha, 1);
  assert.ok(semanticEdgeDisclosure(explicit, 0.8, false, true).alphaMultiplier < 0.2);
});

test('curved semantic routes remain selectable through route-aware hit testing', async () => {
  const grammar = await transpiledModule('src/semantic-edge-grammar.ts');
  const { hitTestEdge } = await transpiledModule('src/geometry/hit.ts');
  const nodes = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 120, y: 0 }];
  const edges = [{ source: 'a', target: 'b', arrow: true }];
  const route = grammar.semanticEdgePolyline(edges[0], nodes[0], nodes[1]);
  const midpoint = route[Math.floor(route.length / 2)];
  assert.equal(hitTestEdge(midpoint.x, midpoint.y, edges, nodes, 0), null);
  assert.equal(hitTestEdge(midpoint.x, midpoint.y, edges, nodes, 0, { routePoints: grammar.semanticEdgePolyline }), 0);

  const explicitEdges = [{ source: 'a', target: 'b', label: '共同主题' }];
  const explicitRoute = grammar.semanticEdgePolyline(explicitEdges[0], nodes[0], nodes[1]);
  const explicitMidpoint = explicitRoute[Math.floor(explicitRoute.length / 2)];
  assert.notEqual(explicitMidpoint.y, 0);
  assert.equal(hitTestEdge(explicitMidpoint.x, explicitMidpoint.y, explicitEdges, nodes, 0, { routePoints: grammar.semanticEdgePolyline }), 0);
});
