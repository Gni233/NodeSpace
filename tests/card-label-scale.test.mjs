import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadCardLabelScale() {
  const source = await readFile(path.join(root, 'src', 'cardgrid', 'index.ts'), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const start = output.indexOf('export function getCardLabelSize');
  const end = output.indexOf('export class CardGridController', start);
  return import(`data:text/javascript;base64,${Buffer.from(output.slice(start, end)).toString('base64')}`);
}

test('card label sizes follow local view scale and remain readable', async () => {
  const { getCardLabelSize } = await loadCardLabelScale();

  assert.equal(getCardLabelSize(20, 0.45), 12);
  assert.equal(getCardLabelSize(20, 1), 20);
  assert.equal(getCardLabelSize(20, 1.5), 28);
  assert.equal(getCardLabelSize(20, 2.5), 28);
  assert.equal(getCardLabelSize(20, Number.NaN), 20);
});

test('main applies local card label scale only while card layout is active', async () => {
  const main = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');

  assert.match(main, /const cardController = isCardMode && st\.layout\.current instanceof CardGridController/);
  assert.match(main, /const cardViewScale = cardController\?\.getNodeViewScale\(id\) \?\? 1;/);
  assert.match(main, /const nodeLabelSize = isCardMode\s*\? getCardLabelSize\(baseNodeLabelSize, cardViewScale\)\s*: baseNodeLabelSize;/);
  assert.match(main, /const displayLabel = resolveNodeDisplayLabel\(n, graphNodeById\);/);
  assert.match(main, /sprite = createNodeSprite\(id, displayLabel, n\.x, n\.y, nodeRadius, color, lblColor, nodeLabelSize\);/);
  assert.match(main, /applyNodeVisual\(sprite, baseColor, lblColor, nodeLabelSize2,/);
});
