import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const toModuleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

async function loadMenuTree() {
  const source = await readFile(path.join(root, 'src', 'ui-contextmenu.ts'), 'utf8');
  const sharedStateStub = 'export const sharedState = {};';
  const layoutConstantsStub = 'export const Z_CONTEXT_MENU = 1; export const V = (_name, fallback) => fallback;';
  const moduleSource = source
    .replace('from "./shared-state"', `from "${toModuleUrl(sharedStateStub)}"`)
    .replace('from "./layout-constants"', `from "${toModuleUrl(layoutConstantsStub)}"`);
  const output = ts.transpileModule(
    moduleSource,
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  return import(toModuleUrl(output));
}

const contextMenu = await loadMenuTree();

function fakeMenu(inside) {
  return {
    removed: 0,
    contains(target) { return target === inside; },
    remove() { this.removed += 1; },
  };
}

test('context-menu tree owns root and submenu lifecycle as one unit', () => {
  const rootTarget = {};
  const submenuTarget = {};
  const rootMenu = fakeMenu(rootTarget);
  const submenu = fakeMenu(submenuTarget);
  const menus = new contextMenu.ContextMenuTree();

  menus.register(rootMenu);
  menus.register(submenu);
  assert.equal(menus.size, 2);
  assert.equal(menus.contains(rootTarget), true);
  assert.equal(menus.contains(submenuTarget), true);
  assert.equal(menus.contains({}), false);

  // Reopening a submenu removes the prior submenu while retaining the root.
  menus.closeAllExcept(rootMenu);
  assert.equal(submenu.removed, 1);
  assert.equal(rootMenu.removed, 0);
  assert.equal(menus.size, 1);

  const reopenedSubmenu = fakeMenu({});
  menus.register(reopenedSubmenu);
  menus.closeAll();
  assert.equal(rootMenu.removed, 1);
  assert.equal(reopenedSubmenu.removed, 1);
  assert.equal(menus.size, 0);
});

test('context menu routes all outside handling through the menu tree', async () => {
  const source = await readFile(path.join(root, 'src', 'ui-contextmenu.ts'), 'utf8');

  assert.match(source, /const openMenus = new ContextMenuTree<HTMLElement>\(\);/);
  assert.match(source, /export function closeContextMenu\(\) \{\s*openMenus\.closeAll\(\);/);
  assert.match(source, /!openMenus\.contains\(e\.target as Node \| null\)/);
  assert.match(source, /openMenus\.closeAllExcept\(menu\);\s*container\.appendChild\(sub\);\s*openMenus\.register\(sub\);/);
  assert.match(source, /item\.action\?\.\(\);\s*closeContextMenu\(\);/);
  assert.doesNotMatch(source, /onSubClose/);
  assert.match(source, /if \(currentMenu !== menu\) return;/);
});
