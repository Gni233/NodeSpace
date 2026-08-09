import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function importTypeScriptModule(filePath) {
  const source = await readFile(filePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

const geometry = await importTypeScriptModule(path.join(root, 'src', 'geometry', 'structure-boundary.ts'));
const { computeStructureBoundary, containsPoint, hitTestStructureBoundary } = geometry;

const finiteShape = shape => {
  assert.ok(shape);
  for (const point of [...shape.polygon, shape.headerAnchor, shape.center]) {
    assert.equal(Number.isFinite(point.x), true);
    assert.equal(Number.isFinite(point.y), true);
  }
};

test('boundary returns null for no valid members and a round padded shape for one member', () => {
  assert.equal(computeStructureBoundary([]), null);
  assert.equal(computeStructureBoundary([{ x: Number.NaN, y: 2 }]), null);

  const shape = computeStructureBoundary([{ x: 20, y: 30, visualRadius: 8 }], { padding: 4, headerHeight: 0 });
  finiteShape(shape);
  assert.ok(shape.polygon.length >= 12);
  assert.equal(containsPoint(20, 30, shape), true);
  assert.equal(containsPoint(40, 30, shape), false);
});

test('two and collinear members produce finite capsule-like outlines', () => {
  const pair = computeStructureBoundary([
    { x: 0, y: 0, radius: 5 },
    { x: 50, y: 0, visualRadius: 8 },
  ], { padding: 3, headerHeight: 0 });
  const collinear = computeStructureBoundary([
    { x: -30, y: 10, radius: 1 },
    { x: 0, y: 10, radius: 2 },
    { x: 40, y: 10, radius: 3 },
  ], { padding: 6, headerHeight: 0 });

  finiteShape(pair);
  finiteShape(collinear);
  assert.ok(pair.bounds.maxX - pair.bounds.minX > 60);
  assert.ok(collinear.bounds.maxX - collinear.bounds.minX > 70);
  assert.equal(containsPoint(10, 10, collinear), true);
});

test('header and outline hit testing does not capture interior content', () => {
  const shape = computeStructureBoundary([
    { x: 20, y: 70, radius: 8 },
    { x: 80, y: 70, radius: 8 },
    { x: 50, y: 120, radius: 8 },
  ], { padding: 10, headerHeight: 20 });
  finiteShape(shape);

  assert.equal(hitTestStructureBoundary(shape.headerAnchor.x, shape.headerAnchor.y, shape), 'header');
  assert.equal(hitTestStructureBoundary(shape.center.x, shape.center.y, shape), null);
  const outlinePoint = shape.polygon.reduce((lowest, point) => point.y > lowest.y ? point : lowest);
  assert.equal(hitTestStructureBoundary(outlinePoint.x, outlinePoint.y, shape, { outlineTolerance: 2 }), 'outline');
  assert.equal(hitTestStructureBoundary(outlinePoint.x, outlinePoint.y, shape), null);
  assert.equal(containsPoint(shape.center.x, shape.center.y, shape), true);
});
