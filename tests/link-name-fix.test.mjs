import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('link exits clear cursor state, preview graphics, and redraw the active pane', async () => {
  const main = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');

  assert.match(main, /const finishLinkMode = \(pane = focusedExtraPane\(\)\) => \{[\s\S]*?pane\.linkMode = false;[\s\S]*?pane\.linkSrc = null;[\s\S]*?pane\.linkCursorX = 0;[\s\S]*?pane\.linkCursorY = 0;[\s\S]*?clearLinkPreview\(pane\);[\s\S]*?\} else \{[\s\S]*?linkMode = false;[\s\S]*?linkSrc = null;[\s\S]*?linkCursorX = 0;[\s\S]*?linkCursorY = 0;[\s\S]*?clearLinkPreview\(pane0\);[\s\S]*?draw\(\);/);
  assert.match(main, /const finishCurrentLinkMode = \(\) => finishLinkMode\(pi\);/);
  assert.match(main, /if \(ls === n\.id\) \{ finishCurrentLinkMode\(\); return true; \}/);
  assert.match(main, /g\.edges\.push\([\s\S]*?finishCurrentLinkMode\(\);/);
  assert.match(main, /const wasActive = targetPane\?\.linkMode \?\? linkMode;[\s\S]*?if \(wasActive\) \{[\s\S]*?finishLinkMode\(targetPane\);/);
  assert.match(main, /else if \(focusedLinkActive\(\)\) \{[\s\S]*?finishLinkMode\(fp\);/);
});

test('node name edits update graph and simulation live with one undo snapshot', async () => {
  const edit = await readFile(path.join(root, 'src', 'ui-edit.ts'), 'utf8');
  const main = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');

  assert.match(edit, /saveUndo\?: \(\) => void;/);
  assert.match(edit, /const syncNodeName = \(\) => \{[\s\S]*?ctx\.saveUndo\?\.\(\);[\s\S]*?node\.label = label;[\s\S]*?simNode\.label = label;[\s\S]*?ctx\.triggerSave\(\);[\s\S]*?ctx\.draw\(\);/);
  assert.match(edit, /nName\.addEventListener\('input', syncNodeName\);/);
  assert.match(edit, /nName\.addEventListener\('blur', commitNameEdit\);/);
  assert.match(edit, /const fillNode = \(id: string\) => \{\s*commitNameEdit\(\);/);
  assert.match(main, /clearLinkMode: \(\) => finishLinkMode\(\),\s*saveUndo,/);
});
