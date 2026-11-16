import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadSemanticZoom() {
  const source = await readFile(path.join(root, 'src', 'semantic-zoom.ts'), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

test('one semantic profile reveals every detail monotonically across zoom', async () => {
  const { semanticZoomProfile } = await loadSemanticZoom();
  const samples = [0.2, 0.3, 0.4, 0.5, 0.7, 1.1].map(semanticZoomProfile);
  for (const key of ['titleAlpha', 'bodyAlpha', 'referenceBodyAlpha', 'mediaAlpha', 'topicBlend', 'edgeDetailAlpha', 'edgeLabelAlpha', 'focusedEdgeLabelAlpha', 'echoReasonAlpha']) {
    for (let index = 1; index < samples.length; index++) {
      assert.ok(samples[index][key] >= samples[index - 1][key], `${key} must not become stronger while zooming out`);
    }
  }
  assert.equal(semanticZoomProfile(0.3).bodyScale, 1.8);
  assert.equal(semanticZoomProfile(0.3).referenceBodyScale, 2.2);
  assert.equal(semanticZoomProfile(0.7).bodyScale, 1);
});

test('screen-space budgets reveal more cards and annotations by band', async () => {
  const { semanticInformationBudget } = await loadSemanticZoom();
  const make = band => semanticInformationBudget({
    band,
    nodeCount: 80,
    viewportWidth: 1280,
    viewportHeight: 720,
    hasFocus: false,
  });
  const overview = make('overview');
  const balanced = make('balanced');
  const reading = make('reading');
  assert.ok(overview.cardCount < balanced.cardCount);
  assert.ok(balanced.cardCount < reading.cardCount);
  assert.equal('bodyCount' in overview, false);
  assert.equal(overview.edgeLabelCount, 0);
  assert.ok(balanced.edgeLabelCount < reading.edgeLabelCount);
});

test('compact titles stay near reading size at modest zoom-out with a bounded scale', async () => {
  const { semanticZoomProfile } = await loadSemanticZoom();
  for (const zoom of [0.65, 0.7, 0.8, 0.9, 1]) {
    const scale = semanticZoomProfile(zoom).nodeTitleScale;
    assert.ok(scale >= 1 && scale <= 1.5);
    assert.ok(13 * scale * zoom >= 12);
  }
  assert.equal(semanticZoomProfile(0.2).nodeTitleScale, 1.5);
  assert.equal(semanticZoomProfile(1.2).nodeTitleScale, 1);
  assert.equal(semanticZoomProfile(NaN).nodeTitleScale, 1);
});

test('automatic rendering wires one budget through cards, relationships, regions, and media detail', async () => {
  const [main, lens, nodes, edges, scene] = await Promise.all([
    readFile(path.join(root, 'src', 'main.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'semantic-lens.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'pixi-nodes.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'pixi-edges.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'pixi-semantic-scene.ts'), 'utf8'),
  ]);
  assert.match(lens, /semanticInformationBudget/);
  assert.doesNotMatch(lens, /bodyNodeIds|bodyBudget/);
  assert.doesNotMatch(main, /semanticBodyAllowed:/);
  assert.match(main, /semanticLabelBudget: semanticLens\?\.edgeLabelBudget/);
  assert.match(main, /regionLabelBudget: semanticLens\?\.regionLabelBudget/);
  assert.match(nodes, /semanticZoomProfile\(zoom\)/);
  assert.doesNotMatch(nodes, /semanticCardTransitionFrame|semanticFormAlpha/);
  assert.match(edges, /visibleLabelIndices/);
  assert.match(scene, /regionLabelBudget/);
  assert.match(scene, /echoBudget/);
});
