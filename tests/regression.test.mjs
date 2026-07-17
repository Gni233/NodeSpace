import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolveInside } from '../mcp-server/path-utils.js';

const require = createRequire(import.meta.url);
const { isPathInside } = require('../electron/path-guard.cjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('path guards allow descendants but reject sibling-prefix and traversal paths', () => {
  const base = path.join(root, 'data');
  assert.equal(isPathInside(base, path.join(base, 'graph.json')), true);
  assert.equal(isPathInside(base, base), true);
  assert.equal(isPathInside(base, path.join(root, 'data-copy', 'graph.json')), false);
  assert.equal(isPathInside(base, path.join(base, '..', 'secret.json')), false);

  assert.equal(resolveInside(base, 'folder', 'graph.json'), path.join(base, 'folder', 'graph.json'));
  assert.throws(() => resolveInside(base, '..', 'secret.json'), /Access denied/);
});

test('card grid uses bounded continuous motion and independent card gestures', async () => {
  const source = await readFile(path.join(root, 'src', 'cardgrid', 'index.ts'), 'utf8');
  const graphSim = await readFile(path.join(root, 'src', 'graph-sim.ts'), 'utf8');
  const interactions = await readFile(path.join(root, 'src', 'cardgrid', 'interactions.ts'), 'utf8');
  const treemap = await readFile(path.join(root, 'src', 'cardgrid', 'treemap.ts'), 'utf8');
  assert.doesNotMatch(source, /n\.x\s*\+=\s*0\.2/);
  assert.doesNotMatch(source, /sim\.alphaTarget\(0\.3\)/);
  assert.match(source, /sim\.alpha\(1\)\.alphaTarget\(0\.018\)\.stop\(\)/);
  assert.match(source, /Math\.max\(0\.45, Math\.min\(2\.5,/);
  assert.match(source, /_viewSaveTimer/);
  assert.match(source, /const dragNodeId = this\._sm\?\.getDragNode\?\.\(\)/);
  assert.doesNotMatch(source, /if \(gsn\.fx != null \|\| gsn\.fy != null\)/);
  assert.match(graphSim, /return \{ initSim, updateCenter, getSim, setDragNode, getDragNode \}/);
  assert.match(source, /\{ \.\.\.e, source: s, target: t \}/);
  assert.match(interactions, /gesture: 'reorder' \| 'pan' \| 'pinch' \| null/);
  assert.match(interactions, /e\.stopImmediatePropagation\(\)/);
  assert.match(treemap, /card\?\.order/);
  assert.doesNotMatch(treemap, /b\.value/);
});

test('save flow only clears dirty tabs after a successful write', async () => {
  const source = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');
  assert.match(source, /const saved = await writeGraphData\(activeTab, graph\);\s*if \(saved\) dirtyTabs\.delete/);
  assert.match(source, /onBeforeClose/);
  assert.doesNotMatch(source, /g\.nodes\.length === 0\) return/);
});

test('interface keeps low-frequency tools and appearance settings off the canvas layout', async () => {
  const source = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');
  const styles = await readFile(path.join(root, 'index.html'), 'utf8');
  assert.match(source, /primaryRow\.appendChild\(controlsDetails\)/);
  assert.match(source, /controlsRow2\.appendChild\(refreshBtn\)/);
  assert.match(source, /const bottom = 4/);
  assert.match(styles, /\.fg-appearance-panel:not\(\[open\]\) \{ display:none !important; \}/);
  assert.match(styles, /\.fg-tools-content \{\s*position:fixed/);
  assert.match(styles, /@media \(max-width: 720px\)/);
});

test('interface regressions keep panel controls usable and inactive tab close isolated', async () => {
  const main = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');
  const sidebar = await readFile(path.join(root, 'src', 'ui-sidebar.ts'), 'utf8');
  const tabs = await readFile(path.join(root, 'src', 'ui-tabs.ts'), 'utf8');
  const styles = await readFile(path.join(root, 'index.html'), 'utf8');

  assert.match(main, /rightRail\.appendChild\(appearanceBtn\)/);
  assert.match(main, /modeRow\.hidden = modeCollapsed/);
  assert.match(main, /modeToggle\.setAttribute\('aria-expanded'/);
  assert.match(sidebar, /presetHeader = document\.createElement\('button'\)/);
  assert.match(sidebar, /callbacks\.onApplyPreset\?\.\(''\)/);
  assert.match(tabs, /closest\('\[data-tab-close\]'\)/);
  assert.match(tabs, /closeBtn\.onpointerdown = \(e\) => e\.stopPropagation\(\)/);
  assert.match(styles, /\.fg-mode-switcher\[hidden\] \{ display:none !important; \}/);
  assert.match(styles, /\.fg-status-line \{[\s\S]*?right:82px !important;/);
});
