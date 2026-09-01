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
  const [source, zoomSource] = await Promise.all([
    readFile(path.join(root, 'src', 'pixi-text-quality.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'semantic-zoom.ts'), 'utf8'),
  ]);
  const zoomOutput = ts.transpileModule(zoomSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const zoomUrl = `data:text/javascript;base64,${Buffer.from(zoomOutput).toString('base64')}`;
  const output = ts.transpileModule(source.replace("'./semantic-zoom'", `'${zoomUrl}'`), {
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
  const { semanticBodyDetailAlpha, semanticBodyScale, semanticReferenceBodyDetailAlpha, semanticReferenceBodyScale } = await loadTextQuality();
  assert.equal(semanticBodyDetailAlpha(0.28), 0);
  assert.ok(semanticBodyDetailAlpha(0.39) > 0.45);
  assert.equal(semanticBodyDetailAlpha(0.48), 1);
  assert.equal(semanticBodyDetailAlpha(Number.NaN), 1);
  assert.equal(semanticBodyScale(0.3), 1.8);
  assert.equal(semanticBodyScale(0.5), 1.4);
  assert.equal(semanticBodyScale(0.7), 1);
  assert.equal(semanticBodyScale(Number.NaN), 1);
  assert.equal(semanticReferenceBodyDetailAlpha(0.2), 0);
  assert.ok(semanticReferenceBodyDetailAlpha(0.3) > 0.35);
  assert.equal(semanticReferenceBodyDetailAlpha(0.38), 1);
  assert.equal(semanticReferenceBodyDetailAlpha(Number.NaN), 1);
  assert.equal(semanticReferenceBodyScale(0.3), 2.2);
  assert.equal(semanticReferenceBodyScale(0.5), 1.4);
  assert.equal(semanticReferenceBodyScale(0.7), 1);
  assert.equal(semanticReferenceBodyScale(Number.NaN), 1);
});

test('semantic cards and world labels opt into the shared low-zoom policy', async () => {
  const [nodes, scene, edges, main] = await Promise.all([
    readFile(path.join(root, 'src', 'pixi-nodes.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'pixi-semantic-scene.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'pixi-edges.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'main.ts'), 'utf8'),
  ]);
  assert.match(nodes, /const text = new Text\(\{[\s\S]*?\.\.\.WORLD_TEXT_SAMPLING/);
  assert.match(nodes, /isReferenceCard \? WORLD_TEXT_SAMPLING : \{\}/);
  assert.match(nodes, /semanticBodyScale\(zoom\)/);
  assert.match(nodes, /semanticReferenceBodyScale\(zoom\)/);
  assert.match(nodes, /fitCardExcerpt\(view\.excerpt, visibleCharacters\)/);
  assert.match(nodes, /semanticReferenceBodyDetailAlpha\(zoom\)[\s\S]*?: semanticBodyDetailAlpha\(zoom\)/);
  assert.match(nodes, /export function updateSemanticBodiesForViewport/);
  assert.match(nodes, /export function updateSemanticViewportDetails/);
  assert.doesNotMatch(nodes, /semanticCardTransitionFrame|semanticBodyAllowed/);
  assert.match(nodes, /_semanticBodyViewport/);
  assert.match(nodes, /state\.spaceReferencePreview \|\| state\.resourceReferencePreview \|\| card\.excerpt/);
  assert.match(scene, /resolution: LABEL_RESOLUTION,\s*\.\.\.WORLD_TEXT_SAMPLING/g);
  assert.match(edges, /new Text\(\{ text: e\.label, style: labelStyle, \.\.\.WORLD_TEXT_SAMPLING \}\)/);
  assert.match(main, /semanticZoom: st\.activeMode === 'auto' \? pixi\.viewport\.scale\.x : undefined/);
});
