import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('focused pane storage exists before startup consumers read the pane proxy', async () => {
  const source = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');
  const declaration = source.indexOf('const extraPanes: PaneState[] = [pane1];');
  const resolver = source.indexOf('const resolveFocusedPaneState =');
  const settings = source.indexOf('const settingsUI = buildSettings(');
  const firstThemeRead = source.indexOf('const themeLabelColor = () =>');

  assert.ok(declaration >= 0, 'extraPanes declaration is missing');
  assert.ok(resolver >= 0, 'focused pane resolver is missing');
  assert.ok(settings > declaration, 'startup settings read the pane proxy before extraPanes is initialized');
  assert.ok(firstThemeRead > declaration, 'render helpers read the pane proxy before extraPanes is initialized');
  assert.equal(source.indexOf('const extraPanes: PaneState[] = [pane1];', declaration + 1), -1);
});
