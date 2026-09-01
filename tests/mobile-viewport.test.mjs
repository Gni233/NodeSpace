import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadViewportModule() {
  const source = await readFile(path.join(root, 'src', 'mobile-viewport.ts'), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

test('mobile viewport distinguishes browser chrome from a typing keyboard', async () => {
  const { resolveMobileViewportMetrics } = await loadViewportModule();
  assert.deepEqual(resolveMobileViewportMetrics({
    layoutHeight: 844,
    visualHeight: 810,
    largestVisualHeight: 844,
    editableFocused: false,
  }), {
    visualHeight: 810,
    visualTop: 0,
    bottomInset: 34,
    keyboardOpen: false,
  });
  assert.deepEqual(resolveMobileViewportMetrics({
    layoutHeight: 844,
    visualHeight: 490,
    largestVisualHeight: 844,
    editableFocused: true,
  }), {
    visualHeight: 490,
    visualTop: 0,
    bottomInset: 354,
    keyboardOpen: true,
  });
});

test('remembered viewport height covers WebViews that shrink innerHeight while typing', async () => {
  const { resolveMobileViewportMetrics } = await loadViewportModule();
  const metrics = resolveMobileViewportMetrics({
    layoutHeight: 500,
    visualHeight: 500,
    largestVisualHeight: 820,
    editableFocused: true,
  });
  assert.equal(metrics.keyboardOpen, true);
  assert.equal(metrics.bottomInset, 320);
});

test('mobile shell wiring shares viewport variables across editors, menus, and feedback', async () => {
  const [main, toolbar, tabs, contextMenu, styles, index] = await Promise.all([
    readFile(path.join(root, 'src', 'main.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'ui-mobile-toolbar.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'ui-tabs.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'ui-contextmenu.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'workspace-ui.css'), 'utf8'),
    readFile(path.join(root, 'index.html'), 'utf8'),
  ]);
  assert.match(main, /createMobileViewportCoordinator\(appShell\)/);
  assert.match(main, /data\.mobileDuplicate|dataset\.mobileDuplicate/);
  assert.match(main, /activateSelection:[\s\S]*?enterStructureForPane/);
  assert.match(toolbar, /bottom:calc\(10px[\s\S]*?--ns-visual-bottom/);
  assert.match(toolbar, /openBtn/);
  assert.match(tabs, /tabsContainer\.scrollLeft/);
  assert.match(contextMenu, /data-menu', 'context-submenu'/);
  assert.match(styles, /--ns-mobile-dock-clearance/);
  assert.match(styles, /is-mobile-keyboard-open/);
  assert.match(styles, /\.fg-tab:not\(\.is-active\) \[data-tab-close\]/);
  assert.match(styles, /\.fg-context-menu\[data-menu='context'\]/);
  assert.match(styles, /\.ns-md-editor[\s\S]*?--ns-visual-bottom/);
  assert.match(index, /height: 100vh; height: 100dvh/);
});
