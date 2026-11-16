import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const ts = createRequire(import.meta.url)('typescript');
const hitSource = await readFile(new URL('../src/geometry/hit.ts', import.meta.url), 'utf8');
const eventSource = await readFile(new URL('../src/ui-events.ts', import.meta.url), 'utf8');
function actual(source, name, context) {
  const file = ts.createSourceFile('source.ts', source, ts.ScriptTarget.ES2022, true);
  let found;
  const visit = node => {
    if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name?.getText(file) === name) found = node;
    ts.forEachChild(node, visit);
  };
  visit(file);
  const declaration = ts.isFunctionDeclaration(found) ? found.getText(file).replace('export ', '') : `const ${found.getText(file)};`;
  const output = ts.transpileModule(declaration, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function('context', `with(context) { ${output}; return ${name}; }`)(context);
}
const nodeContainsPoint = actual(hitSource, 'nodeContainsPoint', { getNodeVisualRadius: node => node.radius || 7 });
const hitTestNode = actual(hitSource, 'hitTestNode', { nodeContainsPoint });
const hitTestEdge = actual(hitSource, 'hitTestEdge', {});
const node = { id: 'a', x: 0, y: 0, radius: 7, _semanticCard: { form: 'node', width: 120, height: 58 } };
const bounds = { left: -45, top: 10, right: 45, bottom: 39, visible: true, alpha: 1 };

test('visible multiline titles hit their actual rectangle without making the surrounding cell clickable', () => {
  const options = { titleBounds: () => bounds };
  assert.equal(hitTestNode(30, 30, [node], 0, options), node);
  assert.equal(hitTestNode(30, 30, [node]), null, 'Legacy callers keep the circle-only API');
  assert.equal(hitTestNode(50, 30, [node], 6, options), null, 'Title does not inherit generous circle padding');
  for (const changes of [{ visible: false }, { alpha: 0.01 }, { alpha: NaN }, { right: NaN }, { bottom: 10 }]) {
    assert.equal(hitTestNode(30, 30, [node], 0, { titleBounds: () => ({ ...bounds, ...changes }) }), null);
  }
  assert.equal(hitTestNode(30, 30, [node], 0, { titleBounds: () => null }), null);
});

test('all node bodies beat overlapping titles, independent of array order', () => {
  const body = { id: 'b', x: 30, y: 30, radius: 8 };
  for (const nodes of [[body, node], [node, body]]) {
    assert.equal(hitTestNode(30, 30, nodes, 0, { titleBounds: candidate => candidate === node ? bounds : null }), body);
  }
  const card = { id: 'card', x: 30, y: 30, _semanticCard: { form: 'card', width: 20, height: 20 } };
  assert.equal(hitTestNode(30, 30, [card, node], 0, { titleBounds: () => bounds }), card);
});

test('title queries receive the world pointer and invalid pointers never query render geometry', () => {
  const calls = [], options = { titleBounds: (candidate, x, y) => { calls.push([candidate.id, x, y]); return bounds; } };
  assert.equal(hitTestNode(30, 30, [node], 0, options), node);
  assert.deepEqual(calls, [['a', 30, 30]]);
  for (const [x, y] of [[NaN, 30], [30, Infinity]]) assert.equal(hitTestNode(x, y, [node], 0, options), null);
  assert.equal(calls.length, 1);
});

test('actual tap handler selects visible title over a crossing edge, then edge when title disappears', () => {
  const endpoint = { id: 'b', x: 100, y: 100, radius: 7 };
  let visible = true, selectedNode = null, selectedEdge = null;
  const nodes = [node, endpoint];
  const context = {
    clearBoxSelection() {}, ctx: {}, visibleNodes: () => nodes, getNodeExpand: () => 0,
    nodeHitOptions: { titleBounds: candidate => visible && candidate === node ? bounds : null }, hitTestNode, hitTestEdge,
    graph: { edges: [{ source: 'a', target: 'b' }], groups: [] }, edgeNodes: () => nodes,
    getLineExpand: () => 0, edgeHitOptions: () => ({}), hitTestGroup: () => null,
    setSelNode: value => { selectedNode = value; }, setSelEdge: value => { selectedEdge = value; },
    setSelGroup() {}, draw() {},
  };
  const tap = actual(eventSource, 'handleTap', context);
  tap(30, 30);
  assert.equal(selectedNode, 'a'); assert.equal(selectedEdge, null);
  visible = false;
  tap(30, 30);
  assert.equal(selectedNode, null); assert.equal(selectedEdge, 0);
});

test('each pane converts its own canvas offset and zoom before querying title world bounds', () => {
  for (const pane of [{ left: 0, top: 20, x: 10, y: 15, k: 0.5 }, { left: 800, top: 60, x: -25, y: 40, k: 2 }]) {
    const toWorld = actual(eventSource, 'toWorldPos', {
      ctx: {}, canvas: { getBoundingClientRect: () => pane }, getTransform: () => pane,
    });
    const [x, y] = toWorld({ clientX: pane.left + pane.x + 30 * pane.k, clientY: pane.top + pane.y + 30 * pane.k });
    assert.equal(hitTestNode(x, y, [node], 0, { titleBounds: () => bounds }), node);
    assert.deepEqual([x, y], [30, 30]);
  }
});
