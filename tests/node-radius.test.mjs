import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { inlineNodeRadiusModule, nodeRadiusModuleUrl } from './helpers/node-radius-module.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const read = file => readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
const radius = await import(nodeRadiusModuleUrl);
const { computeSemanticLayout, stabilizeSemanticLayout, semanticGraphSignature, SemanticLayoutController } =
  await import(url(compile(inlineNodeRadiusModule(await read('layouts/semantic.ts')))));
const groupUrl = url(compile(await read('group-membership.ts')));
const { nodeContainsPoint } = await import(url(compile(inlineNodeRadiusModule(await read('geometry/hit.ts'))
  .replace("'../group-membership'", `'${groupUrl}'`))));

function actualFunction(source, name, context) {
  const file = ts.createSourceFile('source.ts', source, ts.ScriptTarget.ES2022, true);
  const declaration = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, name);
  return new Function('context', `with (context) { ${compile(declaration.getText(file).replace('export ', ''))}\nreturn ${name}; }`)(context);
}
const boundaryDistance = actualFunction(await read('pixi-edges.ts'), 'boundaryDistance', radius);
const nodePaintSource = await read('pixi-nodes.ts');
const fitCompactNodeTitle = actualFunction(nodePaintSource, 'fitCompactNodeTitle', {});
const applyHierarchyNodeTransform = actualFunction(nodePaintSource, 'applyHierarchyNodeTransform', {});
const paint = actualFunction(nodePaintSource, 'applyNodeVisual', {
  window: {}, applyHierarchyNodeTransform,
  updateSemanticViewportDetails() {}, fitCompactNodeTitle, readFontFamily: () => 'system-ui',
  CanvasTextMetrics: { measureText: (text, style) => ({ width: Array.from(text).length * style.fontSize }) },
});

test('compact titles use measured width and disclose a bounded second line only for selection', () => {
  const measure = text => Array.from(text).reduce((width, char) => width + (/[a-z ]/.test(char) ? 5 : 10), 0);
  assert.equal(fitCompactNodeTitle('abcdefghijk', 60, measure, false), 'abcdefghijk');
  assert.equal(fitCompactNodeTitle('一二三四五六七八九十', 60, measure, false), '一二三四五…');
  assert.equal(fitCompactNodeTitle('一二三四五六七八九十', 60, measure, true), '一二三四五六\n七八九十');
  const long = fitCompactNodeTitle('一二三四五六七八九十一二三四五六', 60, measure, true);
  assert.equal(long.split('\n').length, 2);
  assert.ok(long.endsWith('…'));
  assert.ok(long.split('\n').every(line => measure(line) <= 60));
  assert.equal(fitCompactNodeTitle('😀😀😀😀😀😀😀', 60, measure, true), '😀😀😀😀😀😀\n😀');
});

test('pane fonts stay local to titles, measurement caches, and reused card paragraphs', () => {
  const measuredFonts = [];
  const render = actualFunction(nodePaintSource, 'applyNodeVisual', {
    window: {}, applyHierarchyNodeTransform,
    updateSemanticViewportDetails() {}, fitCompactNodeTitle, readFontFamily: () => 'global-fallback',
    CanvasTextMetrics: { measureText: (text, style) => {
      measuredFonts.push(style.fontFamily);
      return { width: Array.from(text).length * (style.fontFamily === 'wide-serif' ? 15 : 7) };
    } },
  });
  const vector = () => ({ x: 1, y: 1, set(x, y = x) { this.x = x; this.y = y; } });
  const makeSprite = () => {
    const graphic = {};
    for (const method of ['clear', 'circle', 'fill', 'stroke', 'roundRect', 'moveTo', 'lineTo']) graphic[method] = () => graphic;
    return { circle: graphic, radius: 7, container: {}, _fixedAnimTarget: 0, _fixedAnim: 0,
      label: { text: 'abcdefghijk', width: 70, style: {}, anchor: vector(), position: vector(), scale: vector() } };
  };
  const a = makeSprite(), b = makeSprite();
  const state = { fixed: false, inFocus: true, selected: false, semanticZoom: 1,
    semanticCard: { width: 100, height: 58, form: 'node', kind: 'note', nodeRadius: 7 } };
  render(a, 0xa8563e, 0x39372f, 13, { ...state, fontFamily: 'wide-serif' });
  render(b, 0xa8563e, 0x39372f, 13, { ...state, fontFamily: 'narrow-sans' });
  assert.equal(a.label.style.fontFamily, 'wide-serif');
  assert.equal(b.label.style.fontFamily, 'narrow-sans');
  assert.notEqual(a.label.text, b.label.text);
  const count = measuredFonts.length;
  a.label.text = 'abcdefghijk';
  render(a, 0xa8563e, 0x39372f, 13, { ...state, fontFamily: 'wide-serif' });
  assert.equal(measuredFonts.length, count, 'Other pane renders do not invalidate this sprite cache');
  a.label.text = 'abcdefghijk';
  render(a, 0xa8563e, 0x39372f, 13, { ...state, fontFamily: 'narrow-sans' });
  assert.ok(measuredFonts.length > count, 'Changing the local font refreshes measured text');
  const body = { style: { fontFamily: 'old-font', fill: 0xffffff }, position: vector() };
  a._semanticBody = body;
  render(a, 0xa8563e, 0x123456, 13, { ...state, fontFamily: 'wide-serif',
    semanticCard: { width: 160, height: 90, form: 'card', kind: 'note', excerpt: 'Existing paragraph' } });
  assert.equal(a._semanticBody, body);
  assert.equal(body.style.fontFamily, 'wide-serif');
  assert.equal(body.style.fill, 0x123456);
  assert.equal(a.label.style.fontFamily, 'wide-serif');
  assert.equal(b.label.style.fontFamily, 'narrow-sans');
});

test('configured radius respects custom sizes, legacy files, levels and structure policy', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(headingLevel => radius.getConfiguredNodeRadius({ headingLevel })), [22, 19, 16, 13, 10, 7]);
  assert.equal(radius.getConfiguredNodeRadius({}), 7);
  assert.equal(radius.getConfiguredNodeRadius({ radiusMode: 'custom', radius: 28, headingLevel: 1 }), 28);
  assert.equal(radius.hasCustomNodeRadius({ radius: 28 }), true);
  assert.equal(radius.getConfiguredNodeRadius({ radius: 28 }), 28);
  assert.equal(radius.getConfiguredNodeRadius({ radiusMode: 'level', radius: 28, headingLevel: 4 }), 13);
  assert.equal(radius.getConfiguredNodeRadius({ radiusMode: 'custom', radius: 90 }), 90);
  for (const invalid of [-4, Infinity, NaN]) assert.equal(radius.getConfiguredNodeRadius({ radiusMode: 'custom', radius: invalid }), 9);
  assert.equal(radius.getConfiguredNodeRadius({ radiusMode: 'custom', radius: 28, headingLevel: 3, structure: { memberIds: ['a', 'b'] } }), 16);
});

test('compact layout, actual paint commands, edge endpoints and click boundaries agree on custom size', () => {
  const node = { id: 'a', label: '窗边的光', radiusMode: 'custom', radius: 28 };
  const point = computeSemanticLayout({ nodes: [node], edges: [], groups: [] }, { collapsedNodeIds: new Set(['a']) }).positions.get('a');
  const rendered = { ...node, x: point.x, y: point.y, _semanticCard: point.card };
  assert.equal(point.card.nodeRadius, 28);
  assert.ok(point.card.width >= 64 && point.card.height >= 100);
  const circles = [];
  const graphic = { clear() { return this; }, circle(x, y, value) { circles.push(value); return this; }, fill() { return this; }, stroke() { return this; } };
  const vector = () => ({ x: 1, y: 1, set(x, y = x) { this.x = x; this.y = y; } });
  const sprite = { circle: graphic, radius: 28, container: { alpha: 1 }, _fixedAnimTarget: 0, _fixedAnim: 0,
    label: { text: node.label, width: 52, style: {}, anchor: vector(), position: vector(), scale: vector() } };
  paint(sprite, 0xa8563e, 0x39372f, 15, { fixed: false, fixedHollow: false, inFocus: true, selected: false,
    boxSelected: false, searchMatch: false, semanticCard: point.card, semanticZoom: 1 });
  assert.ok(circles.length > 0 && circles.every(value => value === 28));
  assert.equal(sprite.label.position.y, 31);
  assert.equal(radius.getNodeVisualRadius(rendered), 28);
  assert.equal(boundaryDistance(rendered, 1, 0), 28);
  assert.equal(nodeContainsPoint(rendered, rendered.x + 27.5, rendered.y), true);
  assert.equal(nodeContainsPoint(rendered, rendered.x + 28.5, rendered.y), false);
  assert.equal(nodeContainsPoint(rendered, rendered.x + 33, rendered.y, 6), true);
});

test('size changes invalidate layout memory and reserve enough room between large nodes', () => {
  const graph = { nodes: [{ id: 'a', label: '窗边', radiusMode: 'custom', radius: 12 }, { id: 'b', label: '晚风' }],
    edges: [{ source: 'a', target: 'b' }], groups: [] };
  const options = { collapsedNodeIds: new Set(['a', 'b']) };
  const initial = stabilizeSemanticLayout(graph, computeSemanticLayout(graph, options));
  const signature = semanticGraphSignature(graph);
  graph.nodes[0].radius = 45;
  assert.notEqual(semanticGraphSignature(graph), signature);
  const next = stabilizeSemanticLayout(graph, computeSemanticLayout(graph, options), initial.memory);
  assert.deepEqual(next.changedNodeIds, ['a']);
  const a = next.result.positions.get('a'), b = next.result.positions.get('b');
  assert.equal(a.card.nodeRadius, 45);
  assert.ok(Math.abs(a.x - b.x) >= (a.card.width + b.card.width) / 2 + 11 || Math.abs(a.y - b.y) >= (a.card.height + b.card.height) / 2 + 11);
  graph.nodes[0].radiusMode = 'level'; graph.nodes[0].headingLevel = 4;
  const byLevel = semanticGraphSignature(graph);
  graph.nodes[0].radius = 120;
  assert.equal(semanticGraphSignature(graph), byLevel);
});

test('custom radius alone triggers automatic recomposition', async () => {
  const graph = { nodes: [{ id: 'a', label: '窗边', radiusMode: 'custom', radius: 12 }], edges: [], groups: [] };
  let applies = 0;
  const controller = new SemanticLayoutController(() => graph, () => { applies++; }, 5);
  graph.nodes[0].radius = 30; controller.onGraphChanged();
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(applies, 1);
  controller.deactivate();
});

test('legacy circle hits use the level radius and missing compact metadata uses configured geometry', () => {
  const level = { id: 'a', x: 0, y: 0, headingLevel: 1 };
  assert.equal(nodeContainsPoint(level, 21, 0), true);
  assert.equal(nodeContainsPoint(level, 23, 0), false);
  const legacy = { id: 'b', x: 0, y: 0, radius: 28, _semanticCard: { form: 'node', width: 120, height: 100 } };
  assert.equal(radius.getNodeVisualRadius(legacy), 28);
  assert.equal(boundaryDistance(legacy, 0, 1), 28);
  assert.equal(nodeContainsPoint(legacy, 29, 0), false);
});

test('reading cards retain rectangular hit and connection boundaries', () => {
  const card = { id: 'a', x: 0, y: 0, radiusMode: 'custom', radius: 28, _semanticCard: { form: 'card', width: 200, height: 100 } };
  assert.equal(radius.getNodeVisualRadius(card), 100);
  assert.equal(boundaryDistance(card, 1, 0), 100);
  assert.equal(boundaryDistance(card, 0, 1), 50);
  assert.equal(nodeContainsPoint(card, 99, 49), true);
  assert.equal(nodeContainsPoint(card, 101, 0), false);
});
