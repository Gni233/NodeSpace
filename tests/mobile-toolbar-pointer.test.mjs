import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const gestureSource = await readFile(new URL('../src/mobile-toolbar-gesture.ts', import.meta.url), 'utf8');
const { MobileToolbarGesture } = await import(`data:text/javascript;base64,${Buffer.from(compile(gestureSource)).toString('base64')}`);
const source = await readFile(new URL('../src/ui-mobile-toolbar.ts', import.meta.url), 'utf8');
const file = ts.createSourceFile('toolbar.ts', source, ts.ScriptTarget.ES2022, true);
function handler(name, context) {
  let initializer;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name) initializer = node.initializer;
    if (!initializer) ts.forEachChild(node, visit);
  };
  visit(file);
  assert.ok(initializer, name);
  return new Function('context', `with (context) { ${compile(`const fn = ${initializer.getText(file)};`)}; return fn; }`)(context);
}
function harness() {
  const captured = new Set();
  const context = {
    gesture: new MobileToolbarGesture(), barLeft: null, barTop: null, dragOrigin: null,
    captures: 0, preventions: 0, stopped: 0,
    clampPosition() {},
  };
  context.bar = {
    style: {}, classList: { add() {}, remove() {} }, getBoundingClientRect: () => ({ left: 50, top: 700 }),
    setPointerCapture(id) { context.captures++; captured.add(id); },
    hasPointerCapture: id => captured.has(id),
    releasePointerCapture: id => captured.delete(id),
  };
  context.event = (fromButton, x = 100, y = 710) => ({
    pointerId: 1, button: 0, clientX: x, clientY: y,
    target: { closest: selector => selector === 'button' && fromButton ? {} : null },
    preventDefault: () => { context.preventions++; },
    stopImmediatePropagation: () => { context.stopped++; },
  });
  return context;
}

test('ordinary mobile button taps keep their click target and are never captured by the dock', () => {
  const context = harness();
  handler('onPointerDown', context)(context.event(true));
  assert.equal(context.captures, 0);
  handler('onPointerEnd', context)(context.event(true));
  handler('onClickCapture', context)(context.event(true));
  assert.equal(context.barLeft, null);
  assert.equal(context.barTop, null);
  assert.equal(context.preventions, 0);
  assert.equal(context.stopped, 0);
});

test('dragging from a mobile button captures only after movement and suppresses exactly one click', () => {
  const context = harness();
  handler('onPointerDown', context)(context.event(true));
  handler('onPointerMove', context)(context.event(true, 103, 710));
  assert.equal(context.captures, 0);
  handler('onPointerMove', context)(context.event(true, 112, 710));
  assert.equal(context.captures, 1);
  handler('onPointerEnd', context)(context.event(true, 112, 710));
  const click = handler('onClickCapture', context);
  click(context.event(true));
  click(context.event(true));
  assert.equal(context.stopped, 1);
  assert.equal(context.gesture.pointerId, null);
});

test('resizing keeps a dragged dock inside the current viewport without overwriting its chosen position', () => {
  const context = harness();
  let height = 400;
  context.viewportBounds = () => ({ left: 0, top: 0, width: 390, height });
  Object.assign(context.bar, { offsetWidth: 240, offsetHeight: 60 });
  const down = handler('onPointerDown', context);
  const clamp = handler('clampPosition', context);
  down(context.event(false));
  down({ ...context.event(false), pointerId: 2 });
  handler('onPointerMove', context)(context.event(false, 100, 640));
  assert.equal(context.barTop, 630);
  clamp();
  assert.equal(context.bar.style.top, '334px');
  height = 844;
  clamp();
  assert.equal(context.bar.style.top, '630px');
});

test('background toolbar drags still capture immediately and cancellation releases the pointer', () => {
  const context = harness();
  handler('onPointerDown', context)(context.event(false));
  assert.equal(context.captures, 1);
  handler('onPointerCancel', context)(context.event(false));
  assert.equal(context.bar.hasPointerCapture(1), false);
  assert.equal(context.gesture.pointerId, null);
});
