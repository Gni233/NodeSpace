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

test('inline node name edits update the owning graph and simulation with one undo snapshot', async () => {
  const edit = await readFile(path.join(root, 'src', 'ui-edit.ts'), 'utf8');
  const main = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');

  assert.match(edit, /saveUndo\?: \(\) => void;/);
  assert.match(edit, /const nodeTextEditor = createNodeTextEditor\([\s\S]*?saveUndo: ctx\.saveUndo,[\s\S]*?simNode\[field\] = node\[field\];[\s\S]*?ctx\.triggerSave\(\);/);
  assert.match(edit, /bindNodeTextInput\(nName, 'label', nodeTextEditor\);\s*appendOnEntry\(nName\)/);
  assert.match(main, /const createPaneNodeTextChange = [\s\S]*?saveUndo: \(\) => runtime\.undoManager\.pushSnapshot\(destination\)[\s\S]*?simulated\[field\] = node\[field\][\s\S]*?editor\.update\(field, value\)/);
  assert.match(main, /const beginNodeTitleEditForPane = [\s\S]*?createPaneNodeTextChange\(pane, id, 'label'\)/);
  assert.match(edit, /bindNodeTextInput\(nNote, 'note', nodeTextEditor\)/);
  assert.match(edit, /const fillNode = \(id: string\) => \{\s*propertyEdit = null;\s*nodeTextEditor\.end\(\);/);
  assert.match(main, /clearLinkMode: \(\) => finishLinkMode\(\),\s*saveUndo,/);
});

test('history shortcuts handle uppercase Z produced by Shift or Caps Lock', async () => {
  const main = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');
  const start = main.indexOf('if (ctrl && /^z$/i.test(e.key)');
  const end = main.indexOf('} else if (ctrl && /^s$/i.test(e.key))', start);
  assert.ok(start > 0 && end > start);
  const handle = new Function('e', 'ctrl', 'runFocusedHistory', `${main.slice(start, end)}}`);
  for (const key of ['z', 'Z']) {
    for (const shiftKey of [false, true]) {
      let prevented = false;
      const actions = [];
      handle({ key, shiftKey, preventDefault: () => { prevented = true; } }, true, action => actions.push(action));
      assert.deepEqual(actions, [shiftKey ? 'redo' : 'undo']);
      assert.equal(prevented, true);
    }
  }
  const actions = [];
  handle({ key: 'z', shiftKey: false, preventDefault() {} }, false, action => actions.push(action));
  assert.deepEqual(actions, []);
});
