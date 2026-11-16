import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = file => readFile(path.join(root, 'src', file), 'utf8');

test('a prompt inside the workbench keeps keyboard focus inside its overlay', async () => {
  const ts = createRequire(import.meta.url)('typescript');
  const script = (await source('dialog.ts')).replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  const code = ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const dialog = {};
  const fakeDocument = { body: {}, querySelector: () => dialog, activeElement: null };
  const { activeDialogContainer, wrapDialogTab } = new Function('document',
    `${code}\nreturn { activeDialogContainer, wrapDialogTab };`)(fakeDocument);
  const control = () => ({ focus() { fakeDocument.activeElement = this; } });
  const first = control(), last = control();
  const overlay = { contains: element => element === first || element === last };
  const tab = shiftKey => ({ key: 'Tab', shiftKey, preventDefault() { this.prevented = true; } });

  assert.equal(activeDialogContainer(), dialog);
  first.focus();
  const backwards = tab(true);
  wrapDialogTab(backwards, overlay, first, last);
  assert.equal(fakeDocument.activeElement, last);
  assert.equal(backwards.prevented, true);
  const forwards = tab(false);
  wrapDialogTab(forwards, overlay, first, last);
  assert.equal(fakeDocument.activeElement, first);
  assert.equal(forwards.prevented, true);
  fakeDocument.activeElement = dialog;
  wrapDialogTab(tab(false), overlay, first, last);
  assert.equal(fakeDocument.activeElement, first);
});

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
  const [main, contextMenu, sidebar, events, home, settings, mobile, styles] = await Promise.all([
    source('main.ts'), source('ui-contextmenu.ts'), source('ui-sidebar.ts'), source('ui-events.ts'),
    source('workbench-home.ts'), source('settings-panel.ts'),
    source('ui-mobile-toolbar.ts'), source('workspace-ui.css'),
  ]);

  assert.match(contextMenu, /fg-context-menu/);
  for (const menuSource of [main, sidebar, events, settings]) assert.match(menuSource, /showActionWheel\(/);
  assert.match(events, /label: '批量颜色',[\s\S]*?children: PRESET_COLORS\.map/);
  assert.match(home, /showContextWheel\(menuLayer,/);
  assert.match(home, /bindContextMenuTrigger\(gallery\.element,[\s\S]*?label: '记录一个想法', action: actions\.onRecord/);
  assert.doesNotMatch(home, /ns-home-header/);
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
  assert.match(main, /groupDropdown\.className = 'fg-search-results fg-group-dropdown'/);
  assert.match(styles, /\.fg-search-results[\s\S]*?border: 1px solid var\(--ns-stroke\)/);
  assert.match(settings, /cbSel\.className = 'fg-setting-select'/);
});
