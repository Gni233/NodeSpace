import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
const ts = createRequire(import.meta.url)('typescript');
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { createMediaTextEditor, bindMediaTextInput } = await import(url(compile(await readFile(new URL('../src/media-text-editor.ts', import.meta.url), 'utf8'))));
const { UndoManager } = await import(url(compile((await readFile(new URL('../src/undo-redo.ts', import.meta.url), 'utf8'))
  .replace("'./toast'", `'${url('export const showToast = () => {};')}'`))));
function fixture(field = 'mediaUrl') {
  const node = { id: 'a', note: '原笔记', mediaUrl: '# 原文\n\n  空白  \n' };
  const graph = { nodes: [node], edges: [], groups: [] }, undo = new UndoManager();
  const state = { graph, node, undo, mutable: true, changes: 0 };
  state.editor = createMediaTextEditor({ getGraph: () => state.graph, node, field, canMutate: () => state.mutable,
    saveUndo: graph => undo.pushSnapshot(graph), onChange: () => state.changes++ });
  return state;
}

test('reading edits preserve exact Markdown and keep one undo per editing session', () => {
  const state = fixture(), editor = state.editor;
  assert.equal(editor.begin(), '# 原文\n\n  空白  \n');
  assert.equal(editor.update('# 改动\n'), true); assert.equal(editor.update('# 改动\n\n  尾空格  '), true);
  assert.equal(state.node.note, '原笔记');
  editor.end();
  assert.equal(editor.begin(), '# 改动\n\n  尾空格  ');
  editor.update('第二次编辑'); editor.end();
  assert.equal(state.undo.undo(state.graph), true);
  assert.equal(state.graph.nodes[0].mediaUrl, '# 改动\n\n  尾空格  ');
  assert.equal(state.undo.undo(state.graph), true);
  assert.equal(state.graph.nodes[0].mediaUrl, '# 原文\n\n  空白  \n');
  assert.equal(state.undo.canUndo(), false);
});

test('opening ordinary note content edits the note field without manufacturing an attachment', () => {
  const state = fixture('note');
  state.editor.begin(); state.editor.update('  新笔记\n'); state.editor.end();
  assert.equal(state.node.note, '  新笔记\n');
  assert.equal(state.node.mediaUrl, '# 原文\n\n  空白  \n');
  assert.equal(state.node.mediaType, undefined);
});

test('reading edits reject changed graph identities, undo, deletion, read-only and concurrent writes', () => {
  for (const mode of ['graph', 'identity', 'removed', 'readonly', 'locked', 'external', 'media-type']) {
    const state = fixture(); state.editor.begin();
    if (mode === 'graph') state.graph = { ...state.graph };
    if (mode === 'identity') state.graph.nodes[0] = { ...state.node };
    if (mode === 'removed') state.graph.nodes.length = 0;
    if (mode === 'readonly') state.graph.settings = { sourceMode: 'vault-readonly' };
    if (mode === 'locked') state.mutable = false;
    if (mode === 'external') state.node.mediaUrl = '别处刚写入的内容';
    if (mode === 'media-type') state.node.mediaType = 'image';
    const before = structuredClone(state.node);
    assert.equal(state.editor.update('过期内容'), false, mode);
    assert.deepEqual(state.node, before, mode);
    assert.equal(state.undo.canUndo(), false, mode); assert.equal(state.changes, 0, mode);
  }
});

class TextInput extends EventTarget {
  value = ''; readOnly = false; attributes = {};
  setAttribute(key, value) { this.attributes[key] = value; }
  send(type) { this.dispatchEvent(new Event(type)); }
}
test('IME waits for composition, blur flushes immediately and stale input becomes read-only', () => {
  const input = new TextInput(), values = []; let valid = true;
  bindMediaTextInput(input, value => { if (valid) values.push(value); return valid; });
  input.send('compositionstart'); input.value = '拼'; input.send('input');
  assert.deepEqual(values, []);
  input.value = '拼音\n'; input.send('compositionend'); assert.deepEqual(values, ['拼音\n']);
  input.value = '  最后的字  '; input.send('blur'); assert.equal(values.at(-1), '  最后的字  ');
  valid = false; input.value = '过期'; input.send('input');
  assert.equal(input.readOnly, true); assert.match(input.attributes['aria-label'], /来源已变化/);
  valid = true; input.send('blur'); assert.equal(values.length, 2);
});

test('reader markup has no delayed main-graph mutation or editable HTML fallback', async () => {
  const source = await readFile(new URL('../src/media-nodes.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /__graphNodes|__triggerSave|mdSaveTimer|contentEditable/);
});
