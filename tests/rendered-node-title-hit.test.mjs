import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const ts = createRequire(import.meta.url)('typescript');
const output = ts.transpileModule(await readFile(new URL('../src/node-title-hit.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { renderedNodeTitleHitBounds: bounds } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
const { Container, Graphics } = createRequire(import.meta.url)('pixi.js');

function fixture(rectangle = { x: 100, y: 60, width: 80, height: 24 }) {
  let queries = 0;
  const viewport = { parent: null, alpha: .8, toWorld: (x, y) => ({ x: (x - 20) / 2, y: (y + 10) / 2 }) };
  const container = { parent: viewport, alpha: .5 };
  const label = { text: '两行\n标题', parent: container, alpha: .9, visible: true,
    getBounds() { queries++; return { rectangle }; } };
  return { sprite: { label, container }, viewport, label, container, queries: () => queries };
}

test('actual rendered title bounds use the owning viewport and effective ancestor opacity', () => {
  const f = fixture();
  const first = bounds(f.sprite, f.viewport);
  assert.deepEqual(first, { left: 40, top: 35, right: 80, bottom: 47, visible: true, alpha: .9 * .5 * .8 });
  const other = { toWorld: (x, y) => ({ x: (x + 200) / .5, y: (y - 40) / .5 }) };
  assert.deepEqual(bounds(f.sprite, other), { ...first, left: 600, right: 760, top: 40, bottom: 88 });
  assert.equal(f.queries(), 2);
});

test('hidden, detached, fading, dying and destroyed titles stay noninteractive without measuring', () => {
  for (const invalidate of [
    f => { f.label.visible = false; }, f => { f.label.text = ' '; },
    f => { f.label.destroyed = true; }, f => { f.container.destroyed = true; },
    f => { f.container.renderable = false; }, f => { f.viewport.visible = false; },
    f => { f.container.alpha = .01; }, f => { f.label.parent = null; },
    f => { f.container.parent = null; }, f => { f.sprite._dyingAnim = true; },
  ]) {
    const f = fixture(); invalidate(f);
    assert.equal(bounds(f.sprite, f.viewport), null);
    assert.equal(f.queries(), 0);
  }
  assert.equal(bounds(undefined, {}), null);
});

test('microscopic growth frames and invalid geometry never leave a title hit target', () => {
  for (const rectangle of [
    { x: 0, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: 40, height: 0 },
    { x: Infinity, y: 0, width: 40, height: 20 }, { x: 0, y: NaN, width: 40, height: 20 },
  ]) {
    const f = fixture(rectangle);
    assert.equal(bounds(f.sprite, f.viewport), null);
  }
  const f = fixture();
  assert.equal(bounds(f.sprite, { toWorld: () => ({ x: NaN, y: 0 }) }), null);
});

function renderedFixture() {
  const stage = new Container(), viewport = new Container(), layer = new Container(), container = new Container();
  const label = new Graphics().rect(-40, 0, 80, 15).fill(0);
  label.text = 'Actual title geometry';
  stage.position.set(17, 29); stage.scale.set(1.2, .9); stage.alpha = .9;
  viewport.position.set(100, 80); viewport.scale.set(.8, 1.4);
  layer.position.set(-13, 11); container.position.set(250, 120);
  container.scale.set(1.3, .7); container.alpha = .8;
  label.position.set(4, 10); label.scale.set(1.5, .8);
  stage.addChild(viewport); viewport.addChild(layer); layer.addChild(container); container.addChild(label);
  viewport.toWorld = (x, y) => viewport.toLocal({ x, y });
  let globalQueries = 0;
  const original = label.getBounds.bind(label);
  label.getBounds = (...args) => { globalQueries++; return original(...args); };
  const oracle = () => {
    const rectangle = original().rectangle;
    const a = viewport.toWorld(rectangle.x, rectangle.y);
    const b = viewport.toWorld(rectangle.x + rectangle.width, rectangle.y + rectangle.height);
    return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y),
      right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y), visible: true, alpha: .9 * .8 };
  };
  const query = (x, y) => bounds({ container, label }, viewport, x, y);
  return { stage, viewport, layer, container, label, query, oracle, globalQueries: () => globalQueries };
}
function sameRectangle(actual, expected) {
  assert.ok(actual);
  for (const key of ['left', 'top', 'right', 'bottom', 'alpha']) assert.ok(Math.abs(actual[key] - expected[key]) < 1e-8, `${key}: ${actual[key]} vs ${expected[key]}`);
  assert.equal(actual.visible, expected.visible);
}

test('live Pixi title geometry matches global projection without global measurement or viewport inversions', () => {
  const f = renderedFixture();
  try {
    const expected = f.oracle(), inverse = f.viewport.toWorld;
    f.viewport.toWorld = () => assert.fail('Axis-aligned titles do not need a viewport inversion');
    sameRectangle(f.query(), expected);
    sameRectangle(f.query((expected.left + expected.right) / 2, (expected.top + expected.bottom) / 2), expected);
    assert.equal(f.query(expected.left - 1, expected.top), null, 'a distant title is rejected before allocating its result');
    assert.equal(f.globalQueries(), 0);
    f.viewport.toWorld = inverse;
  } finally { f.stage.destroy({ children: true }); }
});

test('local bounds stay current across movement, zoom, mirrored scales and changed title geometry', () => {
  const f = renderedFixture();
  try {
    const before = f.query();
    f.container.position.set(-90, 210); f.label.scale.set(-1.1, 1.2);
    f.label.clear().rect(-70, -2, 140, 30).fill(0);
    const expected = f.oracle();
    sameRectangle(f.query(), expected);
    assert.notDeepEqual(f.query(), before);
    f.viewport.position.set(-500, 120);
    f.viewport.scale.set(.5, .6);
    sameRectangle(f.query(), expected, 'panning and readable zoom preserve world coordinates');
    f.stage.scale.set(.001);
    assert.equal(f.query(), null, 'microscopic labels never become invisible targets');
    f.stage.scale.set(1.2, .9);
    sameRectangle(f.query(), expected);
    assert.equal(f.globalQueries(), 0);
  } finally { f.stage.destroy({ children: true }); }
});

test('rotated and skewed Pixi titles retain the general projection path', () => {
  const f = renderedFixture();
  try {
    f.label.rotation = .3;
    sameRectangle(f.query(), f.oracle());
    assert.equal(f.globalQueries(), 1);
    f.label.rotation = 0; f.layer.skew.set(.1, .2);
    sameRectangle(f.query(), f.oracle());
    assert.equal(f.globalQueries(), 2);
  } finally { f.stage.destroy({ children: true }); }
});
