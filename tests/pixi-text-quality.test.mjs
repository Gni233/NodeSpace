import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadTextQuality() {
  const source = await readFile(path.join(root, 'src', 'pixi-text-quality.ts'), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

test('world-space labels use stable mipmapped linear sampling', async () => {
  const { WORLD_TEXT_SAMPLING } = await loadTextQuality();
  assert.equal(WORLD_TEXT_SAMPLING.autoGenerateMipmaps, true);
  assert.equal(WORLD_TEXT_SAMPLING.roundPixels, true);
  assert.deepEqual(WORLD_TEXT_SAMPLING.textureStyle, {
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
  });
});

test('semantic paragraph detail stays absent at tiny zoom and fades in near reading scale', async () => {
  const { semanticBodyDetailAlpha } = await loadTextQuality();
  assert.equal(semanticBodyDetailAlpha(0.4), 0);
  assert.equal(semanticBodyDetailAlpha(0.64), 0);
  assert.ok(semanticBodyDetailAlpha(0.76) > 0.45);
  assert.equal(semanticBodyDetailAlpha(0.88), 1);
  assert.equal(semanticBodyDetailAlpha(Number.NaN), 1);
});

test('semantic cards and world labels opt into the shared low-zoom policy', async () => {
  const [nodes, scene, edges, main] = await Promise.all([
    readFile(path.join(root, 'src', 'pixi-nodes.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'pixi-semantic-scene.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'pixi-edges.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'main.ts'), 'utf8'),
  ]);
  assert.match(nodes, /const text = new Text\(\{[\s\S]*?\.\.\.WORLD_TEXT_SAMPLING/);
  assert.match(nodes, /semanticBodyDetailAlpha\(state\.semanticZoom \?\? 1\)/);
  assert.match(scene, /resolution: LABEL_RESOLUTION,\s*\.\.\.WORLD_TEXT_SAMPLING/g);
  assert.match(edges, /new Text\(\{ text: e\.label, style: labelStyle, \.\.\.WORLD_TEXT_SAMPLING \}\)/);
  assert.match(main, /semanticZoom: st\.activeMode === 'auto' \? pixi\.viewport\.scale\.x : undefined/);
});
