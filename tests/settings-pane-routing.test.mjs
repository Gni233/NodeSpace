import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const ts = createRequire(import.meta.url)('typescript');
const source = ts.createSourceFile('main.ts', await readFile(new URL('../src/main.ts', import.meta.url), 'utf8'), ts.ScriptTarget.ES2022, true);
function actual(name, context) {
  let expression;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) expression = node.initializer;
    if (ts.isPropertyAssignment(node) && node.name.getText(source) === name) expression = node.initializer;
    if (!expression) ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(expression, name);
  const code = ts.transpileModule(`const handler = ${expression.getText(source)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function('context', `with(context) { ${code}; return handler; }`)(context);
}

function fixture() {
  const panes = Array.from({ length: 4 }, (_, index) => ({
    index, linkDist: 70 + index, labelSize: 12 + index,
    fontFamily: `Font ${index}`, nodeColorStyle: index ? 'uniform' : 'hierarchical',
    cardBorderStyle: index ? 'rounded' : 'straight', graphTheme: `theme-${index}`,
    activeMode: 'auto', gridSnapEnabled: false, edgeColorGradient: false, edgeWidthByLevel: index === 3,
    canvasContainer: { pane: index },
    graph: { nodes: [{ id: `note-${index}` }], edges: [], groups: [] },
  }));
  const calls = [], state = {
    panes, focus: 0,
    focusedPaneState: () => panes[state.focus],
    allPaneOwners: () => panes,
    paneRuntime: pane => pane.graph,
    updateOpacity: value => calls.push(['opacity', value]),
    applyPaneCanvasBg: (canvas, theme) => calls.push(['canvas', canvas.pane, theme]),
    applyUIToFocusedPane: theme => calls.push(['ui', theme]),
    document: { documentElement: { style: { setProperty: (...args) => calls.push(['css', ...args]) } } },
    setNodeFontFamily: font => calls.push(['font', font]),
    normalizeLayoutMode: value => value === 'radial-legacy' ? 'radial' : value,
    renderModeBar: () => calls.push(['mode']),
  };
  state.setFocusedEdgeAppearance = actual('setFocusedEdgeAppearance', state);
  return { state, calls, get: actual('getFocusedSettingValues', state), apply: actual('applySettingValues', state) };
}

test('presets read the actual focused pane, including third and fourth panes and card preferences', () => {
  const { state, get } = fixture();
  for (let index = 0; index < state.panes.length; index++) {
    state.focus = index;
    const values = get();
    assert.equal(values.linkDist, 70 + index);
    assert.equal(values.fontFamily, `Font ${index}`);
    assert.equal(values.graphTheme, `theme-${index}`);
    assert.equal(values.cardBorderStyle, index ? 'rounded' : 'straight');
    assert.equal(values.layoutMode, 'auto');
    assert.equal(values.edgeWidthByLevel, index === 3);
  }
});

test('applying a preset changes only its owning pane and dispatches appearance to that canvas', () => {
  const { state, calls, apply } = fixture();
  state.focus = 3;
  const before = structuredClone(state.panes);
  apply({
    linkDist: 160, labelSize: 19, fontFamily: 'User Serif', graphTheme: 'paper-light',
    nodeColorStyle: 'spectrum-narrow', cardBorderStyle: 'straight',
    edgeColorGradient: true, edgeWidthByLevel: false,
    gridSnap: true, gridMode: 'line', editPanelOpacity: .85, layoutMode: 'radial-legacy',
    graph: { nodes: [] }, index: 999,
  });
  assert.deepEqual(state.panes.slice(0, 3), before.slice(0, 3));
  const owner = state.panes[3];
  assert.equal(owner.linkDist, 160);
  assert.equal(owner.fontFamily, 'User Serif');
  assert.equal(owner.nodeColorStyle, 'spectrum-narrow');
  assert.equal(owner.cardBorderStyle, 'straight');
  assert.equal(owner.gridSnapEnabled, true);
  assert.equal(owner.gridMode, 'line');
  assert.equal(owner.activeMode, 'radial');
  assert.equal(owner.edgeColorGradient, true);
  assert.equal(owner.edgeWidthByLevel, false);
  assert.equal(owner.index, 3);
  assert.deepEqual(owner.graph, before[3].graph);
  assert.ok(calls.some(call => call[0] === 'canvas' && call[1] === 3 && call[2] === 'paper-light'));
  assert.ok(calls.some(call => call[0] === 'font' && call[1] === 'User Serif'));
  assert.ok(calls.some(call => call[0] === 'opacity' && call[1] === .85));
  assert.equal(calls.filter(call => call[0] === 'mode').length, 1);
});

test('line appearance propagates to another view of the same graph only', () => {
  const { state } = fixture();
  state.focus = 1;
  state.panes[3].graph = state.panes[1].graph;
  state.setFocusedEdgeAppearance('edgeColorGradient', true);
  assert.deepEqual(state.panes.map(pane => pane.edgeColorGradient), [false, true, false, true]);
});

test('standalone split opens the focused graph and saves the rightmost pane before closing', async () => {
  const panes = [{ runtime: 'right' }];
  const actions = [];
  const state = {
    splitPending: false, splitActive: false, extraPanes: panes, splitDetails: { open: true },
    draft: true, save: true, blockForTextDraft: () => state.draft,
    paneLoadedTab: pane => pane.file, focusedPaneState: () => ({ file: 'current.json' }),
    syncSplitControls() {}, syncSpaceNavigation() {}, persistTabs() {},
    async openFirstSplitPane(file) { state.splitActive = true; actions.push(['open', file]); },
    async addSplitPane(file) { panes.push({ runtime: 'extra' }); actions.push(['add', file]); },
    collectPaneSettings: pane => ({ owner: pane.runtime }),
    async saveRuntimeNow(runtime, settings) { actions.push(['save', runtime, settings.owner]); return state.save; },
    removeSplitPane(index) { actions.push(['close', index]); panes.pop(); },
    reportWorkbenchActionError: error => { throw error; },
  };
  const split = actual('changeSplit', state);
  await split(true);
  assert.deepEqual(actions, []);
  state.draft = false;
  await split(true);
  await split(true);
  state.save = false;
  await split(false);
  assert.equal(panes.length, 2);
  state.save = true;
  await split(false);
  assert.deepEqual(actions, [
    ['open', 'current.json'], ['add', 'current.json'],
    ['save', 'extra', 'extra'], ['save', 'extra', 'extra'], ['close', 1],
  ]);
  assert.equal(state.splitPending, false);
});
