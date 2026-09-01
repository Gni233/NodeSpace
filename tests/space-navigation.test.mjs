import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadModule() {
  const source = await readFile(path.join(root, 'src', 'space-navigation.ts'), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

test('space portal detail reveals monotonically while zooming in', async () => {
  const { spacePortalZoomProfile } = await loadModule();
  const samples = [0.25, 0.4, 0.55, 0.7, 0.9, 1.15].map(spacePortalZoomProfile);
  for (let index = 1; index < samples.length; index++) {
    for (const key of ['expansion', 'mapAlpha', 'labelAlpha', 'hintAlpha', 'borderAlpha']) {
      assert.ok(samples[index][key] >= samples[index - 1][key], `${key} must reveal monotonically`);
    }
    assert.ok(samples[index].bodyAlpha <= samples[index - 1].bodyAlpha, 'summary must yield to the interior map');
  }
  assert.equal(spacePortalZoomProfile(0.4).labelAlpha, 0);
  assert.ok(spacePortalZoomProfile(1.15).hintAlpha > 0.9);
  assert.equal(spacePortalZoomProfile(1.15).bodyAlpha, 0);
});

test('portal anchors survive canvas resize and clamp inside the destination', async () => {
  const { normalizeSpacePortalAnchor, resolveSpacePortalAnchor } = await loadModule();
  const sourceCanvas = { left: 200, top: 40, width: 1000, height: 700 };
  const portal = { left: 640, top: 310, width: 220, height: 140 };
  const anchor = normalizeSpacePortalAnchor(sourceCanvas, portal);
  assert.deepEqual(anchor, { centerX: 0.55, centerY: 0.4857142857142857, width: 220, height: 140 });
  const restored = resolveSpacePortalAnchor({ left: 40, top: 10, width: 600, height: 400 }, anchor);
  assert.equal(restored.width, 220);
  assert.equal(restored.height, 140);
  assert.ok(restored.left >= 40 && restored.left + restored.width <= 640);
  assert.ok(restored.top >= 10 && restored.top + restored.height <= 410);
});

test('expanded portal respects usable canvas insets', async () => {
  const { expandedSpacePortalRect } = await loadModule();
  assert.deepEqual(
    expandedSpacePortalRect({ left: 10, top: 20, width: 1000, height: 700 }, { left: 230, top: 64, right: 18, bottom: 24 }),
    { left: 240, top: 84, width: 752, height: 612 },
  );
});

test('desktop integration keeps portal disclosure and anchored transitions lightweight', async () => {
  const [main, pixi, css] = await Promise.all([
    readFile(path.join(root, 'src', 'main.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'pixi-nodes.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'workspace-ui.css'), 'utf8'),
  ]);
  assert.match(pixi, /spacePortalZoomProfile/);
  assert.match(pixi, /_spacePortalViewport/);
  assert.match(main, /playSpacePortalEntryTransition/);
  assert.match(main, /playSpacePortalReturnTransition/);
  assert.match(main, /normalizeSpacePortalAnchor/);
  assert.match(main, /referenceNavigationInFlight\.add\(sourcePane\.index\)[\s\S]*?playSpacePortalEntryTransition[\s\S]*?finally \{[\s\S]*?referenceNavigationInFlight\.delete\(sourcePane\.index\)/);
  assert.match(main, /referenceNavigationInFlight\.add\(focusedPaneIndex\)[\s\S]*?playSpacePortalReturnTransition[\s\S]*?finally \{[\s\S]*?referenceNavigationInFlight\.delete\(focusedPaneIndex\)/);
  assert.match(main, /const entryViewport = panePixi\(sourcePane\)[\s\S]*?captureSpacePortalAnchorForNode\(sourcePane, node\)[\s\S]*?await resolveSpaceReferenceTarget/);
  assert.match(css, /\.fg-space-transition-surface/);
  assert.doesNotMatch(main, /new PIXI\.Application[\s\S]*spaceTransition/);
});
