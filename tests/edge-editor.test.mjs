import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const source = ts.createSourceFile('ui-edit.ts', await readFile(new URL('../src/ui-edit.ts', import.meta.url), 'utf8'), ts.ScriptTarget.ES2022, true);
const { UndoManager } = await import(url(compile((await readFile(new URL('../src/undo-redo.ts', import.meta.url), 'utf8'))
  .replace("'./toast'", `'${url('export const showToast = () => {};')}'`))));

function closure(name, context) {
  let body;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) body = node.initializer;
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && node.left.getText(source) === name) body = node.right;
    if (!body) ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(body, name);
  return new Function('context', `with (context) { ${compile(`const handler = ${body.getText(source)};`)}\nreturn handler; }`)(context);
}

function fixture() {
  const graph = {
    nodes: [{ id: 'a', label: '窗边的光', x: 20, y: 50 }, { id: 'b', label: '下午的雨', x: 120, y: 50 }],
    edges: [{ source: { id: 'a' }, target: 'b', label: '映照', arrow: false, lineStyle: 'dash-4', color: '#8b9270', colorMode: 'custom' }],
    groups: [], settings: { graphTheme: 'paper-light' },
  };
  const history = new UndoManager();
  const context = {
    ctx: {
      graph,
      canMutate: () => context.mutable,
      saveUndo: () => history.pushSnapshot(context.ctx.graph),
      triggerSave: () => context.saves++, draw() {},
      syncGraphToOtherPanes: () => context.syncs++,
      updateLinkForce: () => context.linkUpdates++,
    },
    mutable: true, selected: 0, saves: 0, syncs: 0, linkUpdates: 0, initializations: 0, fills: [],
    getSelNode: () => null, getSelGroup: () => null, getSelEdge: () => context.selected,
    getSimulation: () => null, getInitSim: () => () => context.initializations++,
    eIdSpan: { textContent: '' },
    eLabel: { value: '映照' }, eCol: { value: '#8b9270' }, eArrChk: { type: 'checkbox', checked: false }, eStyle: { value: 'dash-4' },
    displayedGraph: graph, displayedItem: graph.edges[0], propertyEdit: null, formBaseline: new Map(), touchedControls: new Set(),
  };
  for (const name of ['controlValue', 'changed', 'beginPropertyEdit', 'savePropertyUndo', 'rememberForm', 'updateEdgeEndpoints', 'saveCurrent', 'commitEdgeArrow']) {
    context[name] = closure(name, context);
  }
  const controls = [context.eLabel, context.eCol, context.eArrChk, context.eStyle];
  context.rememberForm(graph.edges[0], controls);
  context.fillEdge = index => { context.fills.push(index); context.updateEdgeEndpoints(context.ctx.graph.edges[index]); };
  context.swap = closure('swapBtn.onclick', context);
  return { graph, history, context };
}

test('relationship typing commits before selection changes and remains one undo per focus', () => {
  const { graph, history, context } = fixture();
  const input = new EventTarget();
  input.value = '映照'; input.type = 'text';
  context.eLabel = input;
  context.formBaseline.set(input, input.value);
  closure('bindAutoSave', context)(input);
  input.dispatchEvent(new Event('focus'));
  context.beginPropertyEdit();
  input.value = '联系'; input.dispatchEvent(new Event('input'));
  input.value = '彼此联系'; input.dispatchEvent(new Event('input'));
  assert.equal(graph.edges[0].label, '彼此联系');
  context.selected = null;
  input.dispatchEvent(new Event('blur'));
  assert.equal(graph.edges[0].label, '彼此联系');
  history.undo(graph);
  assert.equal(graph.edges[0].label, '映照');
  assert.equal(history.canUndo(), false);
});

test('reversing a relationship preserves its properties and node positions in one undoable edit', () => {
  const { graph, history, context } = fixture();
  const before = structuredClone(graph);
  assert.equal(context.swap(), true);
  const reversed = structuredClone(graph);
  assert.deepEqual(reversed.edges[0], { ...before.edges[0], source: before.edges[0].target, target: before.edges[0].source });
  assert.deepEqual(graph.nodes, before.nodes);
  assert.equal(context.eIdSpan.textContent, '下午的雨 — 窗边的光');
  assert.equal(context.saves, 1);
  assert.equal(context.syncs, 1);
  assert.equal(context.initializations, 1);
  assert.deepEqual(context.fills, [0]);
  assert.equal(history.undo(graph), true);
  assert.deepEqual(graph, before);
  assert.equal(history.canUndo(), false);
  assert.equal(history.redo(graph), true);
  assert.deepEqual(graph, reversed);
});

test('direction reversal rejects stale selections, replaced graph objects and read-only views', () => {
  for (const mode of ['readonly', 'graph', 'replaced', 'removed', 'index-reused', 'no-selection']) {
    const { graph, history, context } = fixture();
    if (mode === 'readonly') context.mutable = false;
    if (mode === 'graph') context.ctx.graph = structuredClone(graph);
    if (mode === 'replaced') graph.edges[0] = structuredClone(graph.edges[0]);
    if (mode === 'removed') graph.edges.length = 0;
    if (mode === 'index-reused') graph.edges.unshift({ source: 'b', target: 'a' });
    if (mode === 'no-selection') context.selected = null;
    const before = structuredClone(graph), current = structuredClone(context.ctx.graph);
    assert.equal(context.swap(), false, mode);
    assert.deepEqual(graph, before, mode);
    assert.deepEqual(context.ctx.graph, current, mode);
    assert.equal(history.canUndo(), false, mode);
    assert.equal(context.saves + context.syncs + context.initializations + context.fills.length, 0, mode);
  }
});

test('a self relationship has no reverse direction and does not create an empty undo step', () => {
  const { graph, history, context } = fixture();
  graph.edges[0].target = 'a';
  assert.equal(context.swap(), false);
  assert.equal(history.canUndo(), false);
  assert.equal(context.saves, 0);
});

test('each arrow toggle is a separate keyboard action and updates the endpoint preview', () => {
  const { graph, history, context } = fixture();
  context.beginPropertyEdit(); // Focus stays on the checkbox while Space toggles it twice.
  context.eArrChk.checked = true;
  context.commitEdgeArrow();
  assert.equal(graph.edges[0].arrow, true);
  assert.equal(context.eIdSpan.textContent, '窗边的光 → 下午的雨');
  context.eArrChk.checked = false;
  context.commitEdgeArrow();
  assert.equal(graph.edges[0].arrow, false);
  assert.equal(context.eIdSpan.textContent, '窗边的光 — 下午的雨');
  assert.equal(context.saves, 2);
  assert.equal(context.linkUpdates, 2);
  history.undo(graph);
  assert.equal(graph.edges[0].arrow, true);
  history.undo(graph);
  assert.equal(graph.edges[0].arrow, false);
  assert.equal(history.canUndo(), false);
  history.redo(graph);
  assert.equal(graph.edges[0].arrow, true);
  history.redo(graph);
  assert.equal(graph.edges[0].arrow, false);
});

test('arrow changes cannot write through a stale or read-only inspector', () => {
  for (const mode of ['readonly', 'graph', 'replaced', 'no-selection']) {
    const { graph, history, context } = fixture();
    if (mode === 'readonly') context.mutable = false;
    if (mode === 'graph') context.ctx.graph = structuredClone(graph);
    if (mode === 'replaced') graph.edges[0] = structuredClone(graph.edges[0]);
    if (mode === 'no-selection') context.selected = null;
    const before = structuredClone(graph), current = structuredClone(context.ctx.graph);
    context.eArrChk.checked = true;
    context.commitEdgeArrow();
    assert.deepEqual(graph, before, mode);
    assert.deepEqual(context.ctx.graph, current, mode);
    assert.equal(history.canUndo(), false, mode);
    assert.equal(context.saves, 0, mode);
  }
});

test('relation text keeps IME confirmation separate from finishing the field', () => {
  let handler;
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'eLabel.addEventListener'
      && node.arguments[0]?.text === 'keydown') handler = node.arguments[1];
    if (!handler) ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(handler);
  const input = { blurs: 0, blur() { this.blurs++; } };
  const onKey = new Function('eLabel', `return ${compile(`const handler = ${handler.getText(source)};`).replace('const handler = ', '').trim().replace(/;$/, '')};`)(input);
  for (const properties of [{ isComposing: true }, { keyCode: 229 }]) {
    onKey({ key: 'Enter', ...properties, preventDefault() { assert.fail('IME confirmation must reach the input'); } });
  }
  assert.equal(input.blurs, 0);
  let prevented = false;
  onKey({ key: 'Enter', preventDefault() { prevented = true; } });
  assert.equal(input.blurs, 1);
  assert.equal(prevented, true);
});
