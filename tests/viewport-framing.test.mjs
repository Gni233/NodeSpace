import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const main = ts.createSourceFile('main.ts', await readFile(new URL('../src/main.ts', import.meta.url), 'utf8'), ts.ScriptTarget.ES2022, true);

function closure(name, context) {
  let declaration;
  const visit = node => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) declaration = node;
    if (!declaration) ts.forEachChild(node, visit);
  };
  visit(main);
  assert.ok(declaration, name);
  return new Function('context', `with (context) { ${compile(declaration.getText(main))}\nreturn ${name}; }`)(context);
}

const rectangle = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height, width, height });

function fixture(offsetX = 0, offsetY = 0) {
  const calls = [];
  const viewport = {
    screenWidth: 408, screenHeight: 812, scale: { x: 3 },
    animate: value => calls.push(value),
    setZoom(scale) { this.scale.x = scale; calls.push(['zoom', scale]); },
    moveCenter(x, y) { calls.push(['center', x, y]); },
  };
  const context = {
    pane0: {}, pixi: null, FIT_ALL_DURATION: 380,
    sidebar: { sidebar: { getBoundingClientRect: () => rectangle(offsetX, offsetY, 38, 812) } },
    editorShell: { getBoundingClientRect: () => rectangle(offsetX + 10, offsetY + 8, 390, 54) },
    appShell: {
      getBoundingClientRect: () => rectangle(offsetX, offsetY, 408, 812),
      style: { getPropertyValue: () => '', setProperty() {} },
    },
    floatingTop: { getBoundingClientRect: () => rectangle(offsetX + 180, offsetY + 46, 220, 40) },
    document: { querySelector: () => ({ getBoundingClientRect: () => rectangle(offsetX + 70, offsetY + 740, 266, 60) }) },
    getComputedStyle: () => ({ display: 'flex', visibility: 'visible' }),
  };
  context.syncEditorShellGeometry = closure('syncEditorShellGeometry', context);
  context.graphTopClearance = closure('graphTopClearance', context);
  const pane = { index: 0, pixi: { viewport, app: { canvas: { getBoundingClientRect: () => rectangle(offsetX, offsetY, 408, 812) } } } };
  return { context, pane, calls, fit: closure('fitPaneNodes', context) };
}

const fiveIdeas = form => [
  [0, 0], [126, 0], [-126, 0], [0, 126], [0, -126],
].map(([x, y], index) => ({ id: `n${index}`, x, y, _semanticCard: { form, width: 70, height: 58 } }));

test('five compact ideas fit at a readable scale without reserving empty card-caption space', () => {
  const f = fixture();
  const nodes = fiveIdeas('node'), before = structuredClone(nodes);
  f.fit(f.pane, nodes);
  f.fit(f.pane, fiveIdeas('card'));
  const compact = f.calls[0], reading = f.calls[1];
  assert.ok(compact.scale >= 0.9);
  assert.ok(compact.scale > reading.scale * 1.2);
  assert.deepEqual(nodes, before);
  assert.equal(compact.time, 380);
  // The complete reserved label boxes still lie inside the usable screen.
  for (const node of nodes) {
    const x = (node.x - compact.position.x) * compact.scale + 204;
    const y = (node.y - compact.position.y) * compact.scale + 406;
    assert.ok(x - 35 * compact.scale >= 52);
    assert.ok(x + 35 * compact.scale <= 386);
    assert.ok(y - 29 * compact.scale >= 100);
    assert.ok(y + 29 * compact.scale <= 722);
  }
});

test('reading cards, local context and expanded structure captions retain their wider framing', () => {
  const f = fixture(), nodes = fiveIdeas('node');
  f.fit(f.pane, fiveIdeas('card'));
  f.pane.localContext = {};
  f.fit(f.pane, nodes);
  delete f.pane.localContext;
  f.pane.structureBoundaryShapes = new Map([['s', {}]]);
  f.fit(f.pane, nodes);
  assert.equal(f.calls[1].scale, f.calls[0].scale);
  assert.equal(f.calls[2].scale, f.calls[0].scale);
});

test('framing accounts for canvas offsets and ignores invalid coordinates', () => {
  const first = fixture(), offset = fixture(480, 120);
  const nodes = fiveIdeas('node');
  first.fit(first.pane, nodes);
  offset.fit(offset.pane, [...nodes, { id: 'invalid', x: NaN, y: Infinity }]);
  assert.deepEqual(offset.calls, first.calls);
  offset.fit(offset.pane, [{ id: 'invalid', x: undefined, y: 0 }]);
  assert.equal(offset.calls.length, 1);
});

test('an empty breadcrumb row cannot move the first graph fit', () => {
  const f = fixture();
  const nodes = fiveIdeas('node');
  f.context.floatingTop.getBoundingClientRect = () => rectangle(12, 57, 380, 0);
  f.fit(f.pane, nodes);
  f.context.floatingTop.getBoundingClientRect = () => rectangle(12, 69, 380, 0);
  f.fit(f.pane, nodes);
  assert.deepEqual(f.calls[0], f.calls[1]);
  f.context.floatingTop.getBoundingClientRect = () => rectangle(12, 69, 380, 26);
  f.fit(f.pane, nodes);
  assert.notEqual(f.calls[1].position.y, f.calls[2].position.y);
});

test('a visible mobile dock reserves its space without constraining a hidden dock', () => {
  const f = fixture();
  const nodes = [{ id: 'a', x: 0, y: -300 }, { id: 'b', x: 0, y: 300 }];
  f.fit(f.pane, nodes);
  f.context.getComputedStyle = () => ({ display: 'none', visibility: 'visible' });
  f.fit(f.pane, nodes);
  assert.ok(f.calls[1].scale > f.calls[0].scale);
});

test('opening another graph uses its own framing before the canvas is revealed', () => {
  const f = fixture(), nodes = fiveIdeas('node');
  f.context.panePixi = pane => pane.pixi;
  f.context.restoreVaultViewportForPane = (_, id) => id === 'vault-space:Ideas';
  const restore = closure('restorePaneOpeningViewport', f.context);

  assert.equal(restore(f.pane, 'vault-space:Ideas'), true);
  assert.deepEqual(f.calls, []);
  assert.equal(restore(f.pane, 'Another.json'), false);
  assert.deepEqual(f.calls.splice(0), [['zoom', 1], ['center', 0, 0]]);

  f.fit(f.pane, nodes);
  const destination = f.calls.pop();
  f.fit(f.pane, nodes, 0);
  assert.deepEqual(f.calls, [
    ['zoom', destination.scale],
    ['center', destination.position.x, destination.position.y],
  ]);
});

test('a new graph load invalidates older callbacks and stops the old camera motion per pane', () => {
  const calls = [];
  const pane = {
    index: 0, fileName: 'old.json', selNode: 'previous', semanticLensState: {},
    search: 'previous', searchMatchIndex: 3, lastSearchTerm: 'previous', searchDebounceTimer: 4,
    currentAnimationCancel: () => calls.push('cancel layout'),
  };
  const other = { index: 1, fileName: 'other.json', search: 'unaffected' };
  const context = {
    PANE_LEFT: 0, paneGraphLoads: new WeakMap(),
    vaultViewportSaveTimers: new WeakMap([[pane, 3]]),
    clearTimeout: id => calls.push(['clear timeout', id]),
    saveVaultViewportForPane: owner => calls.push(['save', owner]),
    paneLoadedTab: owner => owner.fileName,
    panePixi: owner => owner === pane ? { viewport: { plugins: {
      remove: name => calls.push(['remove', name]), reset: () => calls.push('stop inertia'),
    } } } : null,
    _starRaf: 10, cancelAnimationFrame: id => calls.push(['cancel frame', id]),
    _wasd: { vx: 4, vy: -1 }, _skipDraw: true,
  };
  const begin = closure('beginPaneGraphLoad', context);
  const first = begin(pane, 'next.json');
  assert.deepEqual(calls, [
    ['clear timeout', 3], ['save', pane], ['clear timeout', 4], 'cancel layout', ['remove', 'animate'],
    'stop inertia', ['cancel frame', 10],
  ]);
  assert.equal(pane.selNode, null);
  assert.equal(pane.semanticLensState, null);
  assert.deepEqual([pane.search, pane.searchMatchIndex, pane.lastSearchTerm, pane.searchDebounceTimer], ['', -1, '', null]);
  assert.deepEqual(context._wasd, { vx: 0, vy: 0 });
  assert.equal(context._skipDraw, false);
  const otherCurrent = begin(other, 'other.json');
  assert.equal(other.search, 'unaffected');
  const second = begin(pane, 'last.json');
  assert.equal(first(), false);
  assert.equal(second(), true);
  assert.equal(otherCurrent(), true);
});

test('fit-all uses the rendered nodes and the actual sprite map of every focused pane', () => {
  for (const index of [0, 1, 2]) {
    const nodes = [{ id: 'visible', x: 0, y: 0 }, { id: 'hidden', x: 10_000, y: 10_000 }];
    const primary = { index: 0, layout: { current: null } }, extra = { index, layout: { current: null }, nodeSprites: new Map() };
    const calls = [];
    const context = {
      PANE_LEFT: 0, pane0: primary,
      SemanticLayoutController: class {},
      focusedExtraPane: () => index === 0 ? null : extra,
      scopedPaneSimulationManager: () => ({ getSim: () => ({ nodes: () => nodes }) }),
      nodeSprites: new Map([['visible', {}]]),
      extraSprites: [new Map([['visible', {}]]), new Map([['visible', {}]])],
      fitPaneNodes: (pane, fitted) => calls.push({ pane, nodes: fitted }),
    };
    closure('fitFocusedPane', context)();
    assert.equal(calls[0].pane, index === 0 ? primary : extra);
    assert.deepEqual(calls[0].nodes, [nodes[0]]);
  }
});

test('fit-all flushes a pending automatic edit and frames its destination rather than an animation midpoint', () => {
  const intermediate = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 20, y: 10 }];
  const destination = [{ id: 'a', x: -100, y: 0 }, { id: 'b', x: 180, y: 80 }];
  const calls = [];
  class AutomaticController {
    flush() { calls.push('flush'); return true; }
  }
  const pane = { index: 0, layout: { current: new AutomaticController() } };
  const context = {
    PANE_LEFT: 0, pane0: pane, SemanticLayoutController: AutomaticController,
    focusedExtraPane: () => null,
    scopedPaneGraph: () => ({ nodes: destination }),
    scopedPaneSimulationManager: () => ({ getSim: () => ({ nodes: () => intermediate }) }),
    nodeSprites: new Map([['a', {}], ['b', {}]]),
    draw: () => calls.push('draw'),
    fitPaneNodes: (owner, nodes) => calls.push({ owner, nodes }),
  };
  closure('fitFocusedPane', context)();
  assert.deepEqual(calls.slice(0, 2), ['flush', 'draw']);
  assert.equal(calls[2].owner, pane);
  assert.deepEqual(calls[2].nodes, destination);
  assert.deepEqual(intermediate, [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 20, y: 10 }]);
});
