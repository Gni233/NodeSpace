import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const ts = createRequire(import.meta.url)('typescript');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const groupUrl = url(compile(await readFile(new URL('../src/group-membership.ts', import.meta.url), 'utf8')));
const { searchResultViewport } = await import(url(compile((await readFile(new URL('../src/search.ts', import.meta.url), 'utf8'))
  .replace("from './group-membership'", `from '${groupUrl}'`))));
const main = ts.createSourceFile('main.ts', await readFile(new URL('../src/main.ts', import.meta.url), 'utf8'), ts.ScriptTarget.ES2022, true);
function closure(name, context) {
  let initializer;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(main) === name) initializer = node.initializer;
    if (!initializer) ts.forEachChild(node, visit);
  };
  visit(main);
  assert.ok(initializer, name);
  return new Function('context', `with (context) { ${compile(`const handler = ${initializer.getText(main)};`)}\nreturn handler; }`)(context);
}

class Element {
  children = []; attributes = {}; style = {}; scrollTop = 0; clientHeight = 150; offsetHeight = 50; offsetTop = 0;
  replaceChildren(...items) { this.children = items; }
  setAttribute(key, value) { this.attributes[key] = value; }
  removeAttribute(key) { delete this.attributes[key]; }
  append(...items) { items.forEach(item => this.appendChild(item)); }
  appendChild(item) { item.offsetTop = this.children.length * item.offsetHeight; this.children.push(item); }
  querySelector() { return this.children.find(item => item.attributes['aria-selected'] === 'true'); }
}

function fixture(paneIndex = 0, reduced = false) {
  const graph = {
    nodes: Array.from({ length: 12 }, (_, index) => ({ id: `n${index}`, label: `想法 ${index + 1}`, note: '保留原文\n', x: 10_000 + index * 120, y: -5_000 - index * 90 })),
    edges: [], groups: [], settings: { sourceMode: 'vault-readonly' },
  };
  const results = graph.nodes.map(node => ({ nodeId: node.id, label: node.label, context: node.note }));
  const calls = [], selected = [], timers = [];
  const viewport = { scale: { x: 0.25, y: 0.25 }, plugins: { active: null, get() { return this.active; } },
    animate: value => { viewport.plugins.active = {}; calls.push(value); }, moveCenter: (x, y) => calls.push({ position: { x, y }, immediate: true }) };
  const pixi = { viewport, app: { canvas: { clientWidth: 408, clientHeight: 812 } } };
  const pane = { index: paneIndex, pixi };
  const searchInput = new Element(), document = { activeElement: searchInput, createElement: () => new Element() };
  searchInput.blur = () => { document.activeElement = null; };
  const context = {
    graph, results, pane, index: -1, query: '想法', nodes: graph.nodes, selected,
    searchPreviewing: false, searchComposing: false, searchResultViewport, searchAnimations: new WeakSet(), reveals: 0,
    previousSearchRender: null, renderSearchViewport: () => {},
    focusedSearchState: () => ({ pane, query: context.query, index: context.index }),
    focusedPaneState: () => pane,
    currentSearchResults: () => context.query ? context.results : [],
    mutateFocusedSearch: values => { if (values.index !== undefined) context.index = values.index; if (values.query !== undefined) context.query = values.query; },
    scopedPaneGraph: () => graph, paneRuntimeGraph: () => context.graph, scopedPaneSimulationManager: () => ({ getSim: () => ({ nodes: () => context.nodes }) }),
    PANE_LEFT: 0, pixi: paneIndex === 0 ? pixi : { viewport: { animate() { assert.fail('Must use the focused pane camera'); } } },
    controlsDetails: { open: true }, searchRow: { hidden: false }, searchInput, document,
    withFocusedPane: callback => callback(), fillNode: id => { pane.selNode = id; selected.push(id); }, draw() {},
    editCtx: { revealSelection: () => context.reveals++ },
    window: { matchMedia: () => ({ matches: reduced }) }, EASING: { easeInOut: 'easeInOut' }, SEARCH_MOVE_DURATION: 300,
    searchResults: new Element(), searchResultTrack: new Element(), searchResultRowHeight: 56,
    searchStatus: new Element(), searchPrevBtn: new Element(), searchNextBtn: new Element(), searchClearBtn: new Element(),
    V: (key, fallback) => fallback,
    setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {},
  };
  for (const name of ['matchesSearch', 'renderSearchResults', 'focusSearchResult', 'nextSearchIndex', 'onSearchKeyDown', 'updateSearchInput']) context[name] = closure(name, context);
  return { graph, results, calls, selected, context, pane, timers };
}

test('search locates distant and negative world coordinates at every focused pane without editing source content', () => {
  for (const index of [0, 1, 2]) {
    const f = fixture(index), before = structuredClone(f.graph);
    f.context.focusSearchResult(7, false);
    assert.deepEqual(f.calls[0].position, { x: 10_840, y: -5_630 });
    assert.equal(f.calls[0].scale, undefined);
    assert.equal(f.calls[0].removeOnInterrupt, true);
    assert.deepEqual(f.selected, ['n7']);
    assert.equal(f.context.controlsDetails.open, false);
    assert.equal(f.context.searchResults.hidden, true);
    assert.equal(f.context.searchInput.attributes['aria-expanded'], 'false');
    assert.deepEqual(f.graph, before);
  }
});

test('search respects reduced motion and locates a visible structure when its member is collapsed', () => {
  const f = fixture(1, true);
  f.graph.nodes[0].structureParentId = 's';
  f.graph.nodes.push({ id: 's', label: '一组想法', x: -420, y: 180 });
  f.context.nodes = [f.graph.nodes.at(-1)];
  f.context.focusSearchResult(0);
  assert.deepEqual(f.calls, [{ position: { x: -420, y: 180 }, immediate: true }]);
  assert.deepEqual(f.selected, ['s']);
});

test('panel reveal follows completed search movement only while its graph and selection still own the view', () => {
  for (const mode of ['current', 'selection', 'graph', 'pane']) {
    const f = fixture();
    f.context.focusSearchResult(5);
    assert.equal(f.context.searchAnimations.has(f.pane.pixi.viewport.plugins.active), true);
    assert.equal(f.context.reveals, 0);
    if (mode === 'selection') f.pane.selNode = 'n1';
    if (mode === 'graph') f.context.graph = structuredClone(f.graph);
    if (mode === 'pane') f.context.focusedPaneState = () => ({ index: 1 });
    f.calls[0].callbackOnComplete();
    assert.equal(f.context.reveals, mode === 'current' ? 1 : 0, mode);
  }
});

test('missing or invalid targets never move the camera or dismiss the search UI', () => {
  for (const mode of ['missing', 'invalid', 'empty']) {
    const f = fixture();
    if (mode === 'missing') f.context.nodes = [];
    if (mode === 'invalid') f.graph.nodes[0].x = NaN;
    if (mode === 'empty') f.context.results = [];
    f.context.focusSearchResult(0);
    assert.deepEqual(f.calls, [], mode);
    assert.deepEqual(f.selected, [], mode);
    assert.equal(f.context.controlsDetails.open, true, mode);
  }
});

test('next and previous results start at the correct end and wrap in both directions', () => {
  const f = fixture();
  assert.equal(f.context.nextSearchIndex(1), 0);
  assert.equal(f.context.nextSearchIndex(-1), 11);
  f.context.index = 11;
  assert.equal(f.context.nextSearchIndex(1), 0);
  f.context.index = 0;
  assert.equal(f.context.nextSearchIndex(-1), 11);
  f.context.results = [];
  assert.equal(f.context.nextSearchIndex(1), -1);
});

test('keyboard navigation mounts and scrolls to the selected result beyond the opening viewport', () => {
  const f = fixture();
  f.context.renderSearchResults();
  assert.equal(f.context.searchStatus.textContent, '12 条结果');
  f.context.index = 11;
  f.context.renderSearchResults();
  const current = f.context.searchResultTrack.querySelector();
  assert.equal(current.id, 'ns-search-result-11');
  assert.equal(current.attributes['aria-posinset'], '12');
  assert.equal(current.attributes['aria-setsize'], '12');
  assert.equal(f.context.searchInput.attributes['aria-activedescendant'], current.id);
  assert.equal(f.context.searchStatus.textContent, '12/12');
  assert.ok(f.context.searchResults.scrollTop > 0);
});

test('scrolling reaches the middle and end of a long list while keeping the number of mounted rows bounded', () => {
  const f = fixture(1);
  const { context } = f;
  context.results = Array.from({ length: 152 }, (_, index) => ({ nodeId: `n${index}`, label: `想法 ${index + 1}` }));
  context.renderSearchResults();
  const { searchResults, searchResultTrack, searchResultRowHeight } = context;
  assert.equal(searchResultTrack.style.height, `${152 * searchResultRowHeight}px`);
  const mountedPositions = () => searchResultTrack.children.map(row => Number(row.attributes['aria-posinset']));
  assert.equal(mountedPositions()[0], 1);
  for (const index of [11, 80, 151]) {
    searchResults.scrollTop = Math.min(index * searchResultRowHeight, 152 * searchResultRowHeight - searchResults.clientHeight);
    context.renderSearchViewport();
    assert.ok(mountedPositions().includes(index + 1));
    assert.ok(searchResultTrack.children.length <= 10);
  }
  context.query = '新查询';
  context.renderSearchResults();
  assert.equal(searchResults.scrollTop, 0);
  assert.equal(mountedPositions()[0], 1);
});

test('search actions appear when the query or result count makes them useful', () => {
  const { context, results } = fixture();
  context.query = '';
  context.renderSearchResults();
  assert.equal(context.searchClearBtn.hidden, true);
  assert.equal(context.searchPrevBtn.hidden, true);
  assert.equal(context.searchNextBtn.hidden, true);
  context.query = '想法';
  context.results = results.slice(0, 1);
  context.renderSearchResults();
  assert.equal(context.searchClearBtn.hidden, false);
  assert.equal(context.searchPrevBtn.hidden, true);
  context.results = results;
  context.renderSearchResults();
  assert.equal(context.searchPrevBtn.hidden, false);
  assert.equal(context.searchNextBtn.hidden, false);
});

test('a stale search result cannot open a different node after the input changes', () => {
  const f = fixture(1);
  f.context.renderSearchResults();
  const result = f.context.searchResultTrack.children[0];
  f.context.results = f.results.slice(1);
  result.onclick();
  assert.deepEqual(f.selected, []);
  assert.deepEqual(f.calls, []);
  assert.equal(f.context.controlsDetails.open, true);
});

const key = (context, value, properties = {}) => {
  const event = { key: value, prevented: false, preventDefault() { this.prevented = true; }, ...properties };
  context.onSearchKeyDown(event);
  return event;
};

test('arrow keys preview a result without moving the camera and Enter opens that exact result', () => {
  const f = fixture();
  key(f.context, 'ArrowUp');
  assert.equal(f.context.index, 11);
  assert.deepEqual(f.calls, []);
  assert.deepEqual(f.selected, []);
  assert.equal(f.context.searchResultTrack.querySelector().id, 'ns-search-result-11');
  key(f.context, 'Enter');
  assert.deepEqual(f.selected, ['n11']);
  assert.equal(f.context.index, 11);
  assert.equal(f.context.controlsDetails.open, false);
});

test('Enter and Shift Enter keep cycling results when no arrow preview is pending', () => {
  const f = fixture();
  key(f.context, 'Enter');
  assert.equal(f.context.index, 0);
  key(f.context, 'Enter');
  assert.equal(f.context.index, 1);
  key(f.context, 'Enter', { shiftKey: true });
  assert.equal(f.context.index, 0);
  key(f.context, 'Enter', { shiftKey: true });
  assert.equal(f.context.index, 11);
});

test('IME confirmation and candidate arrows never navigate, clear the query or dismiss search', () => {
  for (const mode of ['flag', 'event', 'keyCode']) for (const value of ['Enter', 'ArrowDown', 'ArrowUp', 'Escape']) {
    const f = fixture();
    if (mode === 'flag') f.context.searchComposing = true;
    const event = key(f.context, value, mode === 'event' ? { isComposing: true } : mode === 'keyCode' ? { keyCode: 229 } : {});
    assert.equal(event.prevented, false);
    assert.equal(f.context.index, -1);
    assert.equal(f.context.query, '想法');
    assert.equal(f.context.controlsDetails.open, true);
    assert.deepEqual(f.calls, []);
  }
});

test('unfinished phonetics do not replace the query; committed text resets the preview once', () => {
  const f = fixture();
  f.context.searchPreviewing = true; f.context.searchComposing = true;
  f.context.searchInput.value = 'yu'; f.context.updateSearchInput();
  assert.equal(f.context.query, '想法');
  assert.equal(f.timers.length, 0);
  f.context.searchComposing = false; f.context.searchInput.value = '雨'; f.context.updateSearchInput();
  assert.equal(f.context.query, '雨');
  assert.equal(f.context.searchPreviewing, false);
  assert.equal(f.context.index, -1);
  assert.equal(f.timers.length, 1);
});
