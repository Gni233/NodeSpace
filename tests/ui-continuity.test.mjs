import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = file => readFile(path.join(root, 'src', file), 'utf8');

test('dialogs and feedback share one DOM-native visual language', async () => {
  const [dialog, toast, updateDialog, styles] = await Promise.all([
    source('dialog.ts'), source('toast.ts'), source('update-dialog.ts'), source('workspace-ui.css'),
  ]);

  assert.doesNotMatch(dialog, /window\.prompt/);
  assert.match(dialog, /fg-modal-backdrop/);
  assert.match(dialog, /fg-modal-button fg-modal-button-primary/);
  assert.match(toast, /fg-toast-stack/);
  assert.match(toast, /fg-modal-backdrop/);
  assert.match(updateDialog, /fg-modal fg-update-dialog/);
  assert.match(styles, /\.fg-modal-backdrop/);
  assert.match(styles, /\.fg-toast\[data-type='error'\]/);
});

test('menus, settings scopes, and mobile actions use the shared component grammar', async () => {
  const [main, contextMenu, sidebar, tabs, settings, mobile, styles] = await Promise.all([
    source('main.ts'), source('ui-contextmenu.ts'), source('ui-sidebar.ts'), source('ui-tabs.ts'),
    source('settings-panel.ts'), source('ui-mobile-toolbar.ts'), source('workspace-ui.css'),
  ]);

  for (const menuSource of [main, contextMenu, sidebar, tabs]) assert.match(menuSource, /fg-context-menu/);
  assert.match(sidebar, /应用与默认值/);
  assert.match(settings, /新空间默认值/);
  assert.match(settings, /当前空间在顶部“外观”中调整/);
  assert.match(mobile, /fg-mobile-action-label/);
  for (const label of ['记录', '撤销', '连线', '全览', '更多']) assert.match(mobile, new RegExp(`'${label}'`));
  assert.match(styles, /\.fg-context-menu/);
  assert.match(styles, /\.fg-settings-section/);
  assert.match(styles, /\.fg-mobile-toolbar > \.fg-mobile-action \.fg-mobile-action-label/);
});

test('native and custom dropdowns inherit the active light or dark theme', async () => {
  const [theme, main, settings, styles, index] = await Promise.all([
    source('theme.ts'), source('main.ts'), source('ui-settings.ts'), source('workspace-ui.css'),
    readFile(path.join(root, 'index.html'), 'utf8'),
  ]);

  assert.match(theme, /"--fg-color-scheme": dark \? "dark" : "light"/);
  assert.match(index, /color-scheme: var\(--fg-color-scheme\)/);
  assert.match(index, /select, option, optgroup[\s\S]*?background-color: var\(--fg-input-bg\)/);
  assert.match(index, /html, body[\s\S]*?color: var\(--fg-text\)/);
  assert.match(styles, /\.fg-setting-select[\s\S]*?color: var\(--fg-input-text\) !important/);
  assert.match(styles, /\.fg-setting-select > option:disabled[\s\S]*?color: var\(--fg-text-muted\)/);
  assert.match(main, /groupDropdown\.className = 'fg-group-dropdown'/);
  assert.match(settings, /cbSel\.className = 'fg-setting-select'/);
});
