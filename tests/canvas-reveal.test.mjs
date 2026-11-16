import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const ts = createRequire(import.meta.url)('typescript');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { computeRevealTranslation, createInspectorRevealCoordinator } = await import(url(compile(await readFile(new URL('../src/canvas-reveal.ts', import.meta.url), 'utf8'))));
const rect = (x, y, width, height) => ({ left: x, top: y, right: x + width, bottom: y + height });
const move = (r, shift) => ({ left: r.left + shift.x, right: r.right + shift.x, top: r.top + shift.y, bottom: r.bottom + shift.y });
const contains = (a, b) => a.left <= b.left && a.right >= b.right && a.top <= b.top && a.bottom >= b.bottom;
const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

test('already visible objects stay still without mutating graph or screen geometry', () => {
  const targets = [rect(110, 220, 60, 70)], screen = rect(16, 16, 376, 780), obstacles = [rect(42, 440, 358, 292)];
  const before = structuredClone({ targets, screen, obstacles });
  assert.equal(computeRevealTranslation(targets, screen, obstacles), null);
  assert.deepEqual({ targets, screen, obstacles }, before);
});

test('a bottom editor reveals both relationship endpoints by the smallest vertical movement', () => {
  const targets = [rect(95, 380, 70, 80), rect(310, 445, 65, 42)];
  const screen = rect(16, 16, 376, 780), sheet = rect(42, 430, 358, 302);
  const shift = computeRevealTranslation(targets, screen, [rect(0, 0, 38, 812), sheet, rect(70, 742, 266, 60)]);
  assert.deepEqual(shift, { x: 0, y: -69 });
  for (const target of targets.map(target => move(target, shift))) {
    assert.ok(contains(screen, target));
    assert.ok(!overlaps(sheet, target));
    assert.ok(target.bottom <= sheet.top - 12);
  }
  assert.equal(computeRevealTranslation(targets.map(target => move(target, shift)), screen, [rect(0, 0, 38, 812), sheet]), null);
});

test('a desktop inspector moves an occluded node sideways without recentering it vertically', () => {
  const node = rect(810, 340, 90, 70), panel = rect(780, 112, 326, 550);
  const shift = computeRevealTranslation([node], rect(16, 16, 1080, 740), [panel]);
  assert.deepEqual(shift, { x: -132, y: 0 });
  assert.equal(move(node, shift).right, panel.left - 12);
});

test('floating and overlapping controls use their actual rectangles rather than reserving a whole side', () => {
  const screen = rect(16, 16, 600, 700), targets = [rect(300, 340, 40, 40)];
  const obstacles = [rect(280, 320, 140, 160), rect(300, 330, 70, 80)];
  const shift = computeRevealTranslation(targets, screen, obstacles);
  assert.equal(Math.hypot(shift.x, shift.y), 72);
  for (const obstacle of obstacles) assert.ok(!overlaps(move(targets[0], shift), obstacle));
  assert.equal(computeRevealTranslation(targets.map(target => move(target, shift)), screen, obstacles), null);
  const offset = { x: 480, y: 120 };
  assert.deepEqual(computeRevealTranslation(targets.map(target => move(target, offset)), move(screen, offset), obstacles.map(target => move(target, offset))), shift);
});

test('large cards and widely separated endpoints reveal the available content without repeated drift', () => {
  const screen = rect(16, 16, 376, 780), obstacles = [rect(42, 300, 358, 432), rect(70, 742, 266, 60)];
  for (const targets of [[rect(130, 340, 230, 560)], [rect(100, 80, 50, 40), rect(250, 660, 50, 40)]]) {
    const shift = computeRevealTranslation(targets, screen, obstacles);
    assert.ok(shift);
    assert.equal(computeRevealTranslation(targets.map(target => move(target, shift)), screen, obstacles), null);
  }
});

test('invalid coordinates and fully covered viewports never produce camera movement', () => {
  const screen = rect(16, 16, 376, 780);
  assert.equal(computeRevealTranslation([rect(NaN, 0, 50, 50)], screen, []), null);
  assert.equal(computeRevealTranslation([], screen, []), null);
  assert.equal(computeRevealTranslation([rect(100, 200, 50, 50)], rect(0, 0, 0, 0), []), null);
  assert.equal(computeRevealTranslation([rect(100, 200, 50, 50)], screen, [screen]), null);
});

function schedulerFixture(revealOverride) {
  const previous = Object.fromEntries(['requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver', 'window'].map(key => [key, globalThis[key]]));
  const frames = new Map(), observers = [];
  let frameId = 0, animations = [];
  const root = new EventTarget(), panel = { getAnimations: () => animations };
  const fakeWindow = new EventTarget(); fakeWindow.visualViewport = new EventTarget();
  globalThis.window = fakeWindow;
  globalThis.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  globalThis.ResizeObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  };
  const state = { selected: {}, reveals: 0, cancels: 0 };
  const coordinator = createInspectorRevealCoordinator(panel, root, () => state.selected, revealOverride || (() => {
    state.reveals++;
    return () => state.cancels++;
  }));
  return {
    coordinator, state, root,
    runFrames() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); },
    resize() { observers[0].callback([]); },
    navigation(type, tagName = 'CANVAS') {
      const event = new Event(type); Object.defineProperty(event, 'target', { value: { tagName } }); root.dispatchEvent(event);
    },
    animate() {
      let finish;
      animations = [{ playState: 'running', finished: new Promise(resolve => { finish = resolve; }) }];
      return () => { animations = []; finish(); };
    },
    restore() { coordinator.destroy(); for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } },
    observers,
  };
}

test('panel changes coalesce and wait for the entrance animation before revealing once', async () => {
  const f = schedulerFixture();
  try {
    const finish = f.animate();
    f.coordinator.request(); f.resize(); f.resize(); f.runFrames();
    assert.equal(f.state.reveals, 0);
    finish(); await Promise.resolve(); await Promise.resolve(); f.runFrames();
    assert.equal(f.state.reveals, 1);
  } finally { f.restore(); }
});

test('a delayed reveal cannot follow a replaced selection, hidden panel or disposed editor', async () => {
  for (const mode of ['selection', 'hidden', 'destroyed']) {
    const f = schedulerFixture();
    try {
      const finish = f.animate(); f.coordinator.request(); f.runFrames();
      if (mode === 'selection') f.state.selected = {};
      if (mode === 'hidden') f.state.selected = null;
      if (mode === 'destroyed') f.coordinator.destroy();
      finish(); await Promise.resolve(); await Promise.resolve(); f.runFrames();
      assert.equal(f.state.reveals, 0, mode);
    } finally { f.restore(); }
  }
});

test('canvas panning and wheel navigation cancel automatic motion until the next explicit selection', () => {
  for (const type of ['pointerdown', 'wheel']) {
    const f = schedulerFixture();
    try {
      f.coordinator.request(); f.navigation(type); f.resize(); f.runFrames();
      assert.equal(f.state.reveals, 0, type);
      f.coordinator.request(); f.runFrames();
      assert.equal(f.state.reveals, 1, type);
      f.coordinator.request(); f.navigation(type, 'BUTTON'); f.runFrames();
      assert.equal(f.state.reveals, 2, type);
    } finally { f.restore(); }
  }
});

test('disposing the editor removes observers and queued frame work', () => {
  const f = schedulerFixture();
  try {
    f.coordinator.request(); f.coordinator.destroy(); f.resize(); f.runFrames();
    assert.equal(f.state.reveals, 0);
    assert.equal(f.observers[0].disconnected, true);
  } finally { f.restore(); }
});

test('manual navigation also stops an already running inspector movement', () => {
  for (const type of ['pointerdown', 'wheel']) {
    const f = schedulerFixture();
    try {
      f.coordinator.request(); f.runFrames();
      f.navigation(type);
      assert.equal(f.state.cancels, 1);
      f.resize(); f.runFrames();
      assert.equal(f.state.reveals, 1);
      f.coordinator.request(); f.runFrames();
      assert.equal(f.state.reveals, 2);
      f.coordinator.destroy();
      assert.equal(f.state.cancels, 2);
    } finally { f.restore(); }
  }
});

const mainSource = ts.createSourceFile('main.ts', await readFile(new URL('../src/main.ts', import.meta.url), 'utf8'), ts.ScriptTarget.ES2022, true);
function appFixture(index = 0, offsetX = 0, offsetY = 0, reduced = false) {
  let declaration;
  const visit = node => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'revealEditedSelection') declaration = node;
    if (!declaration) ts.forEachChild(node, visit);
  };
  visit(mainSource);
  assert.ok(declaration);
  const bounds = new Map([['a', rect(95, 380, 70, 80)], ['b', rect(310, 445, 65, 42)]]);
  const sprites = new Map([...bounds].map(([id, box]) => [id, { container: { visible: true, getBounds: () => ({ rectangle: { x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top } }) } }]));
  const calls = [];
  const viewport = {
    screenWidth: 408, screenHeight: 812, scale: { x: 0.7, y: 0.7 }, center: { x: 20, y: 30 },
    plugins: { active: null, removals: 0, get() { return this.active; }, remove() { this.active = null; this.removals++; } },
    animate: value => { viewport.plugins.active = {}; calls.push(value); }, moveCenter: (x, y) => calls.push({ position: { x, y }, immediate: true }),
  };
  const domRect = box => ({ ...box, width: box.right - box.left, height: box.bottom - box.top });
  const element = box => ({ getBoundingClientRect: () => domRect(move(box, { x: offsetX, y: offsetY })) });
  const canvas = element(rect(0, 0, 408, 812));
  const panel = element(rect(42, 430, 358, 302));
  const graph = { nodes: [{ id: 'a', x: 10, y: 20 }, { id: 'b', x: 100, y: 20 }], edges: [{ source: { id: 'a' }, target: 'b' }], groups: [], settings: { sourceMode: 'vault-readonly' } };
  const pane = { index, selNode: null, selEdge: 2, activeMode: 'auto' };
  const context = {
    computeRevealTranslation, PANE_LEFT: 0, searchAnimations: new WeakSet(),
    panePixi: () => ({ viewport, app: { canvas } }), focusedPaneState: () => pane,
    originalEdgeIndexForPane: (owner, selected) => selected === 2 ? 0 : null,
    paneRuntimeGraph: () => graph,
    nodeSprites: index === 0 ? sprites : new Map(), extraSprites: [index === 1 ? sprites : new Map(), index === 2 ? sprites : new Map()],
    sidebar: { sidebar: element(rect(0, 54, 155, 220)) },
    editorShell: element(rect(12, 8, 384, 42)), floatingTop: element(rect(180, 57, 220, 40)),
    document: { querySelector: () => element(rect(70, 742, 266, 60)) },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    window: { innerWidth: offsetX + 408, innerHeight: offsetY + 812, matchMedia: () => ({ matches: reduced }) },
    draw() {},
  };
  const reveal = new Function('context', `with (context) { ${compile(declaration.getText(mainSource))}\nreturn revealEditedSelection; }`)(context);
  return { reveal: () => reveal(panel), graph, calls, context, pane, viewport, sprites };
}

test('the app reveals original relationship endpoints in every focused pane without changing scale or source data', () => {
  const results = [];
  for (const index of [0, 1, 2]) {
    const f = appFixture(index, index * 480, index * 120), before = structuredClone(f.graph);
    f.reveal();
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].scale, undefined);
    assert.equal(f.calls[0].position.x, 20);
    assert.equal(f.calls[0].position.y, 30 + 69 / 0.7);
    assert.deepEqual(f.graph, before);
    results.push(f.calls);
  }
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[1], results[2]);
});

test('reveal respects motion preferences, hidden nodes and modes with their own camera control', () => {
  const reduced = appFixture(0, 0, 0, true);
  reduced.reveal();
  assert.equal(reduced.calls[0].immediate, true);
  for (const mode of ['center', 'drag', 'pause', 'cardgrid', 'category', 'fullcat', 'hidden']) {
    const f = appFixture();
    if (mode === 'center') f.pane.centerMode = true;
    else if (mode === 'drag') f.pane.draggingNode = 'a';
    else if (mode === 'pause') f.viewport.pause = true;
    else if (mode === 'hidden') for (const sprite of f.sprites.values()) sprite.container.visible = false;
    else f.pane.activeMode = mode;
    f.reveal();
    assert.deepEqual(f.calls, [], mode);
  }
});

test('canceling an inspector movement never interrupts a newer fit or navigation animation', () => {
  const f = appFixture();
  const cancel = f.reveal();
  assert.equal(f.calls[0].removeOnInterrupt, true);
  cancel();
  assert.equal(f.viewport.plugins.removals, 1);
  const nextCancel = f.reveal();
  f.viewport.animate({ position: { x: 200, y: 300 } });
  nextCancel();
  assert.equal(f.viewport.plugins.removals, 1);
});

test('an incoming search animation owns the camera until its completion or explicit cancellation', () => {
  const f = appFixture();
  const incoming = {};
  f.viewport.plugins.active = incoming;
  f.context.searchAnimations.add(incoming);
  const cancel = f.reveal();
  assert.deepEqual(f.calls, []);
  assert.equal(f.viewport.plugins.active, incoming);
  cancel();
  assert.equal(f.viewport.plugins.active, null);
  assert.equal(f.viewport.plugins.removals, 1);
});

test('repeated panel layout changes leave the same incoming search animation running', () => {
  const app = appFixture(), incoming = {};
  app.viewport.plugins.active = incoming;
  app.context.searchAnimations.add(incoming);
  const f = schedulerFixture(() => app.reveal());
  try {
    f.coordinator.request(); f.runFrames();
    f.resize(); f.runFrames(); f.resize(); f.runFrames();
    assert.equal(app.viewport.plugins.active, incoming);
    assert.deepEqual(app.calls, []);
    f.navigation('wheel');
    assert.equal(app.viewport.plugins.active, null);
  } finally { f.restore(); }
});

test('explicitly clearing or collapsing the editor cancels delayed work and active camera movement', () => {
  const f = schedulerFixture();
  try {
    f.coordinator.request(); f.coordinator.cancel(); f.runFrames();
    assert.equal(f.state.reveals, 0);
    f.coordinator.request(); f.runFrames(); f.coordinator.cancel();
    assert.equal(f.state.cancels, 1);
  } finally { f.restore(); }
});
