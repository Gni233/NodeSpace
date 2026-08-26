import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadMagnifierMath() {
  const source = await readFile(path.join(root, 'src', 'canvas-magnifier.ts'), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

const magnifier = await loadMagnifierMath();

test('magnifier activates only for Ctrl plus a fine pointer below 1x overview zoom', () => {
  const base = {
    controlHeld: true,
    pointerInside: true,
    pointerType: 'mouse',
    zoom: 0.8,
    viewportWidth: 1000,
    viewportHeight: 700,
  };
  assert.equal(magnifier.shouldActivateMagnifier(base), true);
  assert.equal(magnifier.shouldActivateMagnifier({ ...base, controlHeld: false }), false);
  assert.equal(magnifier.shouldActivateMagnifier({ ...base, pointerInside: false }), false);
  assert.equal(magnifier.shouldActivateMagnifier({ ...base, pointerType: 'touch' }), false);
  assert.equal(magnifier.shouldActivateMagnifier({ ...base, zoom: 0.99 }), true);
  assert.equal(magnifier.shouldActivateMagnifier({ ...base, zoom: 1 }), false);
  assert.equal(magnifier.shouldActivateMagnifier({ ...base, zoom: 1.2 }), false);
  assert.equal(magnifier.shouldActivateMagnifier({ ...base, zoom: 0 }), false);
  assert.equal(magnifier.shouldActivateMagnifier({ ...base, viewportWidth: 160 }), false);
});

test('magnification grows as the overview shrinks and aims at a readable local scale', () => {
  assert.equal(magnifier.getMagnifierMagnification(0.9), 1.72);
  assert.equal(magnifier.getMagnifierMagnification(0.5), 2.3);
  assert.equal(magnifier.getMagnifierMagnification(0.2), 5.5);
  for (const zoom of [0.2, 0.4, 0.6, 0.8]) {
    assert.ok(magnifier.getMagnifierMagnification(zoom) * zoom >= Math.min(1.1, zoom * 5.5));
  }
});

test('capture resolution matches lens enlargement without increasing its pixel budget', () => {
  for (const zoom of [0.2, 0.4, 0.5, 0.8]) {
    const scale = magnifier.getMagnifierMagnification(zoom);
    const resolution = magnifier.getMagnifierCaptureResolution(2, scale);
    const sourceWidth = 236 / scale;
    assert.ok(Math.abs(sourceWidth * resolution - 472) < 1e-9);
  }
  assert.equal(magnifier.getMagnifierCaptureResolution(2, 5.5), 11);
});

test('magnifier samples the pointer at its reticle without shifting a central subject', () => {
  const geometry = magnifier.computeMagnifierGeometry(500, 350, 1000, 700, 236, 2);
  assert.equal(geometry.diameter, 236);
  assert.equal(geometry.lensLeft, 382);
  assert.equal(geometry.lensTop, 232);
  assert.equal(geometry.sourceX, 441);
  assert.equal(geometry.sourceY, 291);
  assert.equal(geometry.sourceWidth, 118);
  assert.equal(geometry.destinationX, 0);
  assert.equal(geometry.destinationY, 0);
  assert.equal(geometry.destinationWidth, 236);
  assert.equal(geometry.destinationHeight, 236);
});

test('magnifier remains inside the pane and preserves pointer focus at edges', () => {
  const geometry = magnifier.computeMagnifierGeometry(10, 8, 1000, 700, 236, 2);
  assert.equal(geometry.lensLeft, 12);
  assert.equal(geometry.lensTop, 12);
  assert.equal(geometry.sourceX, 0);
  assert.equal(geometry.sourceY, 0);
  assert.equal(geometry.destinationX, 98);
  assert.equal(geometry.destinationY, 102);
  assert.equal(geometry.destinationWidth, 138);
  assert.equal(geometry.destinationHeight, 134);
});

test('canvas event lifecycle owns and disposes the temporary magnifier', async () => {
  const eventsSource = await readFile(path.join(root, 'src', 'ui-events.ts'), 'utf8');
  assert.match(eventsSource, /const magnifier = createCanvasMagnifier\(\s*canvas,/);
  assert.match(eventsSource, /ctx\.captureMagnifierRegion/);
  assert.match(eventsSource, /magnifier\.destroy\(\);/);
});

test('Pixi captures only the requested screen patch while the lens is active', async () => {
  const pixiSource = await readFile(path.join(root, 'src', 'pixi-app.ts'), 'utf8');
  assert.match(pixiSource, /app\.renderer\.extract\.canvas\(\{/);
  assert.match(pixiSource, /frame: new Rectangle\(region\.x, region\.y, region\.width, region\.height\)/);
  assert.doesNotMatch(pixiSource, /preserveDrawingBuffer:\s*true/);
});
