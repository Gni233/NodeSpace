import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadGridLod() {
  const source = await readFile(path.join(root, 'src', 'grid-lod.ts'), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

const grid = await loadGridLod();

test('grid LOD disappears at 0.4 and every tier fades monotonically while zooming out', () => {
  assert.deepEqual(grid.getGridLodLevels(0.39), []);
  assert.deepEqual(grid.getGridLodLevels(0.4), []);
  assert.deepEqual(grid.getGridLodLevels(0.5).map(level => level.skip), [5]);
  assert.deepEqual(grid.getGridLodLevels(0.7).map(level => level.skip), [5, 2]);
  assert.deepEqual(grid.getGridLodLevels(0.8).map(level => level.skip), [5, 2, 1]);

  const zooms = [0.4, 0.45, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
  for (const skip of [5, 2, 1]) {
    const alphas = zooms.map(zoom => grid.getGridLodLevels(zoom).find(level => level.skip === skip)?.alpha ?? 0);
    for (let index = 1; index < alphas.length; index++) {
      assert.ok(alphas[index] >= alphas[index - 1], `skip ${skip} at zoom ${zooms[index]}`);
    }
  }
});

test('every grid density remains anchored to the immutable world origin', () => {
  for (const skip of [1, 2, 5]) {
    const spacing = 30 * skip;
    for (const min of [-913, -31, -1, 0, 17, 899]) {
      const start = grid.alignedGridStart(min, 30, skip);
      assert.equal(Math.abs(start % spacing), 0);
      assert.ok(start <= min - spacing);
    }
  }
});

test('monotonic grid tiers stay within a small point budget at desktop size', () => {
  for (const zoom of [0.17, 0.4, 0.7, 1, 2]) {
    assert.ok(grid.estimateGridPointCount(1200, 800, 30, zoom) < 4000, `zoom ${zoom}`);
  }
});

test('grid primitives never shrink into the sub-pixel shimmer range', () => {
  for (const zoom of [0.16, 0.25, 0.4, 0.7, 1, 2]) {
    const dotWorldRadius = grid.gridWorldSize(1.5, zoom, 0.85);
    const lineWorldWidth = grid.gridWorldSize(0.5, zoom, 0.55);
    assert.ok(dotWorldRadius * zoom >= 0.85 - 1e-9);
    assert.ok(lineWorldWidth * zoom >= 0.55 - 1e-9);
  }
  assert.equal(grid.gridWorldSize(1.5, 2, 0.85), 1.5);
});
