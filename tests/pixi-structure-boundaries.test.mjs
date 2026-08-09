import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadPureRendererHelpers() {
  const source = await readFile(path.join(root, 'src', 'pixi-structure-boundaries.ts'), 'utf8');
  const pixiStub = "export class Container {}; export class Graphics {}; export class Text {};";
  const pixiUrl = `data:text/javascript;base64,${Buffer.from(pixiStub).toString('base64')}`;
  const output = ts.transpileModule(
    source.replace("from 'pixi.js'", `from '${pixiUrl}'`).replace(/import type .*?geometry\/structure-boundary';\r?\n/, ''),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

const renderer = await loadPureRendererHelpers();

test('structure boundary cache reconciliation retains reusable IDs and removes stale IDs', () => {
  const first = renderer.getStructureBoundaryCacheChanges([], [{ id: 'a' }, { id: 'b' }]);
  assert.deepEqual(first, { retainedIds: [], createdIds: ['a', 'b'], staleIds: [] });

  const second = renderer.getStructureBoundaryCacheChanges(['a', 'b'], [{ id: 'b' }, { id: 'c' }]);
  assert.deepEqual(second, { retainedIds: ['b'], createdIds: ['c'], staleIds: ['a'] });
});

test('structure boundary helpers preserve input polygons and create finite rectangular fallback bounds', () => {
  const polygon = [{ x: 2, y: 3 }, { x: 12, y: 3 }, { x: 12, y: 9 }];
  assert.equal(renderer.getStructureBoundaryVertices(polygon), polygon);
  assert.deepEqual(renderer.getStructureBoundaryBounds(polygon), { minX: 2, minY: 3, maxX: 12, maxY: 9 });

  const rectangle = renderer.getStructureBoundaryVertices({ bounds: { x: -2, y: 4, width: 10, height: 6 } });
  assert.deepEqual(rectangle, [[-2, 4], [8, 4], [8, 10], [-2, 10]]);
  assert.equal(renderer.truncateStructureBoundarySummary('  one\n two\tthree  ', 30), 'one two three');
  assert.equal(renderer.truncateStructureBoundarySummary('abcdefghijklmnopqrstuvwxyz123456', 30), 'abcdefghijklmnopqrstuvwxyz123…');
});

test('remove preview renders the source snapshot and excludes its dragged membership guide', () => {
  const liveShape = { polygon: [[0, 0], [100, 0], [100, 100]] };
  const sourceSnapshot = { polygon: [[0, 0], [40, 0], [40, 40]] };
  const source = {
    id: 'source', label: 'Source', shape: liveShape, memberCount: 2, externalLinkCount: 0,
    memberPositions: [{ id: 'dragged', x: 90, y: 90 }, { id: 'retained', x: 20, y: 20 }],
  };
  const other = { id: 'other', label: 'Other', shape: liveShape, memberCount: 1, externalLinkCount: 0 };
  const preview = {
    nodeId: 'dragged', sourceStructureId: 'source', targetStructureId: null,
    mode: 'remove', message: 'remove', sourceBoundaryShape: sourceSnapshot,
  };

  const renderedSource = renderer.resolveMembershipDragBoundaryModel(source, preview);
  assert.equal(renderedSource.shape, sourceSnapshot);
  assert.deepEqual(renderedSource.memberPositions, [{ id: 'retained', x: 20, y: 20 }]);
  assert.equal(renderer.resolveMembershipDragBoundaryModel(other, preview), other);
  assert.equal(renderer.resolveMembershipDragBoundaryModel(source, { ...preview, mode: 'reject' }), source);
});

test('Pixi app keeps a dedicated structure layer between groups and edges', async () => {
  const source = await readFile(path.join(root, 'src', 'pixi-app.ts'), 'utf8');
  assert.match(source, /structureLayer: Container/);
  assert.match(source, /new Container\(\{ label: 'structure-boundaries' \}\)/);
  assert.match(source, /viewport\.addChild\(groupLayer\);\s*viewport\.addChild\(structureLayer\);\s*viewport\.addChild\(edgeLayer\);/);
});
