import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { nodeRadiusModuleUrl } from './helpers/node-radius-module.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = await readFile(new URL('../src/ui-edit.ts', import.meta.url), 'utf8');
const file = ts.createSourceFile('ui-edit.ts', source, ts.ScriptTarget.ES2022, true);
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const declarations = file.statements.filter(node => ts.isFunctionDeclaration(node)
  && ['createNodeTextEditor', 'bindNodeTextInput'].includes(node.name?.text)).map(node => node.getText(file));
const { createNodeTextEditor, bindNodeTextInput } = await import(url(compile(declarations.join('\n'))));
const undoSource = (await readFile(new URL('../src/undo-redo.ts', import.meta.url), 'utf8'))
  .replace("'./toast'", `'${url('export const showToast = () => {};')}'`);
const { UndoManager } = await import(url(compile(undoSource)));
const { getConfiguredNodeRadius } = await import(nodeRadiusModuleUrl);
const { setGraphColorOverride } = await import(url(compile(await readFile(new URL('../src/utils/color.ts', import.meta.url), 'utf8'))));

class TextInput extends EventTarget {
  value = '';
  blurs = 0;
  focus() { this.dispatchEvent(new Event('focus')); }
  blur() { this.blurs++; this.dispatchEvent(new Event('blur')); }
  send(type, properties = {}) {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, properties);
    this.dispatchEvent(event);
    return event;
  }
  type(value) { this.value = value; this.send('input'); }
}

function fixture() {
  const graph = { nodes: [{ id: 'a', label: '阳光', note: '', headingLevel: 6 }, { id: 'b', label: '晚风' }], edges: [], groups: [] };
  const state = { graph, selected: graph.nodes[0], mutable: true, updates: [] };
  const history = new UndoManager();
  const editor = createNodeTextEditor({
    getGraph: () => state.graph,
    getSelectedNode: () => state.selected,
    canMutate: () => state.mutable,
    saveUndo: () => history.pushSnapshot(state.graph),
    onChange: (node, field) => state.updates.push([node.id, field]),
  });
  const name = new TextInput(), note = new TextInput();
  bindNodeTextInput(name, 'label', editor);
  bindNodeTextInput(note, 'note', editor);
  return { state, graph, history, editor, name, note };
}

test('completing a node note from its touch control flushes the draft and blurs the text field', async () => {
  const previewSource = (await readFile(new URL('../src/node-note-preview.ts', import.meta.url), 'utf8'))
    .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  class Element extends TextInput {
    children = [];
    style = {};
    offsetHeight = 56;
    offsetWidth = 120;
    classList = new Set();
    append(...children) { this.children.push(...children); }
    getBoundingClientRect() { return { left: 0, top: 0, right: 360, bottom: 420 }; }
    setAttribute() {}
    setSelectionRange() {}
  }
  const host = new Element();
  const document = { createElement() { const element = new Element(); element.classList.remove = key => element.classList.delete(key); element.classList.toggle = () => {}; return element; } };
  const create = new Function('document', 'bindNodeTextInput', 'Z_TOOLTIP', `${compile(previewSource)}\nreturn createNodeNotePreview;`)(document, bindNodeTextInput, 70);
  const note = create(host);
  const commits = [];
  assert.equal(note.show('便签', '原文', 150, 180, 8, host.getBoundingClientRect(), () => ({ note: '原文', commit: draft => commits.push(draft) })), true);
  assert.equal(note.edit(), true);
  const [surface] = host.children;
  const [, , input, done] = surface.children;
  assert.equal(surface.classList.has('is-editing'), true);
  assert.equal(done.hidden, false);
  input.type('  新增内容\n');
  assert.equal(done.send('pointerdown').defaultPrevented, true);
  done.onclick();
  assert.equal(input.blurs, 1);
  assert.deepEqual(commits, ['  新增内容\n']);
  assert.equal(surface.classList.has('is-editing'), false);
  assert.equal(done.hidden, true);
});

test('a continuous note edit saves live and undoes atomically with exact whitespace', () => {
  const { graph, state, note, history } = fixture();
  note.focus();
  note.type('  窗边的光\n');
  note.type('  窗边的光\n\n  下午的雨  \n');
  note.type(note.value);
  assert.equal(graph.nodes[0].note, note.value);
  assert.equal(graph.nodes[0].color, undefined);
  assert.equal(state.updates.length, 2);
  note.blur();
  assert.equal(history.undo(graph), true);
  assert.equal(graph.nodes[0].note, '');
  assert.equal(history.canUndo(), false);
  assert.equal(history.redo(graph), true);
  assert.equal(graph.nodes[0].note, note.value);
});

test('IME candidate confirmation never finishes editing or saves partial phonetics', () => {
  for (const field of ['label', 'note']) {
    const { state, graph, name, note } = fixture();
    const input = field === 'label' ? name : note;
    const before = graph.nodes[0][field];
    input.focus();
    input.send('compositionstart');
    input.type('chuang');
    const confirming = input.send('keydown', { key: 'Enter', isComposing: true, keyCode: 229 });
    assert.equal(confirming.defaultPrevented, false);
    assert.equal(input.blurs, 0);
    assert.equal(graph.nodes[0][field], before);
    input.value = '窗边';
    input.send('compositionend');
    input.send('input'); // Browsers may emit a trailing input after compositionend.
    assert.equal(graph.nodes[0][field], '窗边');
    assert.equal(state.updates.length, 1);
    input.send('keydown', { key: 'Enter', keyCode: 229 });
    assert.equal(input.blurs, 0);
  }
});

test('Enter creates note paragraphs; Ctrl or Command Enter finishes, and names finish with Enter', () => {
  for (const modifier of ['ctrlKey', 'metaKey']) {
    const { name, note } = fixture();
    note.focus();
    note.type('第一行');
    assert.equal(note.send('keydown', { key: 'Enter' }).defaultPrevented, false);
    assert.equal(note.blurs, 0);
    assert.equal(note.send('keydown', { key: 'Enter', [modifier]: true }).defaultPrevented, true);
    assert.equal(note.blurs, 1);
    name.focus();
    name.type('窗边');
    assert.equal(name.send('keydown', { key: 'Enter' }).defaultPrevented, true);
    assert.equal(name.blurs, 1);
  }
});

test('text sessions reject stale selections, graph switches, undo replacements and read-only changes', () => {
  for (const mode of ['selection', 'graph', 'undo', 'readonly', 'removed']) {
    const { state, graph, note, history } = fixture();
    note.focus();
    if (mode === 'selection') state.selected = graph.nodes[1];
    if (mode === 'graph') { state.graph = structuredClone(graph); state.selected = state.graph.nodes[0]; }
    if (mode === 'undo') { history.pushSnapshot(graph); history.undo(graph); state.selected = graph.nodes[0]; }
    if (mode === 'readonly') state.mutable = false;
    if (mode === 'removed') graph.nodes.shift();
    const before = structuredClone(graph), current = structuredClone(state.graph);
    note.type('不应写入新选择');
    note.blur();
    assert.deepEqual(graph, before, mode);
    assert.deepEqual(state.graph, current, mode);
    assert.deepEqual(state.updates, [], mode);
  }
});

test('moving to another field starts a separate undo step and read-only focus cannot begin', () => {
  const { state, graph, name, note, history } = fixture();
  name.focus(); name.type('窗边的光'); name.blur();
  note.focus(); note.type('下午的雨'); note.blur();
  history.undo(graph);
  assert.equal(graph.nodes[0].label, '窗边的光');
  assert.equal(graph.nodes[0].note, '');
  history.undo(graph);
  assert.equal(graph.nodes[0].label, '阳光');
  assert.equal(history.canUndo(), false);
  state.selected = graph.nodes[0]; state.mutable = false;
  name.focus(); name.type('只读'); name.blur();
  assert.equal(graph.nodes[0].label, '阳光');
  assert.equal(history.canUndo(), false);
});

function closure(name, context) {
  let initializer;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name) initializer = node.initializer;
    if (!initializer) ts.forEachChild(node, visit);
  };
  visit(file);
  assert.ok(initializer, name);
  return new Function('context', `with (context) { ${compile(`const handler = ${initializer.getText(file)};`)}\nreturn handler; }`)(context);
}

function formFixture() {
  const node = { id: 'a', label: '窗边', note: '正文\n', headingLevel: 6 };
  const context = {
    ctx: { graph: { nodes: [node], edges: [], groups: [] }, triggerSave() { context.saved++; }, draw() {}, syncGraphToOtherPanes() {} },
    getSelNode: () => context.selected, getSelEdge: () => null, getSelGroup: () => null,
    getSimulation: () => null, isStructureNode: () => false, getConfiguredNodeRadius, draw() {},
    selected: 'a', saved: 0, displayedGraph: null, displayedItem: null, propertyEdit: null,
    formBaseline: new Map(), touchedControls: new Set(), inheritedColorPickers: new Set(), setGraphColorOverride,
    nCol: { value: '#000000' }, nMediaType: { value: '' }, nMediaUrl: { value: '' },
    radModeSelect: { value: 'level' }, radLevelSlider: { value: '6' }, nRad: { value: '7' },
  };
  context.controlValue = closure('controlValue', context);
  context.changed = closure('changed', context);
  context.beginPropertyEdit = closure('beginPropertyEdit', context);
  context.savePropertyUndo = closure('savePropertyUndo', context);
  context.commitPickerColor = closure('commitPickerColor', context);
  context.rememberForm = closure('rememberForm', context);
  context.rememberForm(node, ['nCol', 'nMediaType', 'nMediaUrl', 'radModeSelect', 'radLevelSlider', 'nRad'].map(key => context[key]));
  context.saveCurrent = closure('saveCurrent', context);
  return { node, context };
}

test('attachment input reaches its exact node before an immediate selection switch', () => {
  const { node, context } = formFixture();
  const input = new TextInput();
  context.nMediaUrl = input;
  context.formBaseline.set(input, '');
  closure('bindAutoSave', context)(input);
  input.focus(); input.type('final-photo.png');
  context.selected = 'b';
  context.displayedItem = { id: 'b' };
  input.blur();
  assert.equal(node.mediaUrl, 'final-photo.png');
  assert.equal(context.displayedItem.mediaUrl, undefined);
});

test('leaving an untouched inspector preserves inherited theme colors and exact text', async () => {
  const { node, context } = formFixture();
  const before = structuredClone(node);
  await context.saveCurrent();
  assert.deepEqual(node, before);
  assert.equal(context.saved, 0);
  context.nMediaUrl.value = 'photo.png';
  context.nMediaType.value = 'image';
  await context.saveCurrent();
  assert.deepEqual(node, { ...before, mediaUrl: 'photo.png', mediaType: 'image' });
  assert.equal(node.color, undefined);
  assert.equal(node.radiusMode, undefined);
  assert.equal(context.saved, 1);
  await context.saveCurrent();
  assert.equal(context.saved, 1);
});

test('inspector form saves reject replaced nodes and do not overwrite text during composition', async () => {
  const { node, context } = formFixture();
  context.nName = { value: 'chuang' };
  context.nNote = { value: 'yu' };
  context.nCol.value = '#a8563e';
  await context.saveCurrent();
  assert.equal(node.label, '窗边');
  assert.equal(node.note, '正文\n');
  const replacement = { ...node, note: '另一个版本' };
  context.ctx.graph.nodes[0] = replacement;
  context.nMediaUrl.value = 'stale.png';
  await context.saveCurrent();
  assert.equal(replacement.mediaUrl, undefined);
  assert.equal(context.saved, 1);
});

test('property text composes safely and commits one undo step before switching selection', () => {
  const { node, context } = formFixture(), history = new UndoManager();
  context.ctx.saveUndo = () => history.pushSnapshot(context.ctx.graph);
  const input = new TextInput();
  context.nMediaUrl = input;
  context.formBaseline.set(input, '');
  closure('bindAutoSave', context)(input);
  input.focus();
  input.send('compositionstart'); input.type('wen');
  assert.equal(node.mediaUrl, undefined);
  input.value = '文档'; input.send('compositionend');
  input.type('文档.md'); input.send('change'); input.blur();
  assert.equal(node.mediaUrl, '文档.md');
  assert.equal(context.saved, 2);
  history.undo(context.ctx.graph);
  assert.equal(context.ctx.graph.nodes[0].mediaUrl, undefined);
  assert.equal(history.canUndo(), false);
});

test('late property events reject graph switches, replaced objects, new selection and readonly state', () => {
  for (const mode of ['graph', 'object', 'selection', 'readonly']) {
    const { node, context } = formFixture();
    const input = new TextInput();
    context.nMediaUrl = input; context.formBaseline.set(input, '');
    closure('bindAutoSave', context)(input);
    input.focus(); input.send('compositionstart'); input.type('pending');
    if (mode === 'graph') context.ctx.graph = structuredClone(context.ctx.graph);
    if (mode === 'object') context.ctx.graph.nodes[0] = { ...node };
    if (mode === 'selection') {
      context.selected = 'b'; context.displayedItem = { id: 'b' };
      context.ctx.graph.nodes.push(context.displayedItem);
    }
    if (mode === 'readonly') context.ctx.canMutate = () => false;
    input.value = '迟到.md'; input.send('compositionend'); input.send('change'); input.blur();
    assert.equal(context.saved, 0, mode);
    assert.equal(node.mediaUrl, undefined, mode);
    assert.ok(context.ctx.graph.nodes.every(node => node.mediaUrl === undefined), mode);
  }
});

test('a continuous custom-size edit is one undo step and keeps inherited colors', async () => {
  const { node, context } = formFixture(), history = new UndoManager();
  const before = structuredClone(context.ctx.graph);
  context.ctx.saveUndo = () => history.pushSnapshot(context.ctx.graph);
  context.beginPropertyEdit();
  context.radModeSelect.value = 'custom'; context.nRad.value = '24';
  await context.saveCurrent();
  context.nRad.value = '32'; await context.saveCurrent();
  assert.equal(node.radius, 32);
  assert.equal(node.radiusMode, 'custom');
  assert.equal(node.headingLevel, undefined);
  assert.equal(node.color, undefined);
  history.undo(context.ctx.graph);
  assert.deepEqual(context.ctx.graph, before);
  assert.equal(history.canUndo(), false);
  history.redo(context.ctx.graph);
  assert.equal(context.ctx.graph.nodes[0].radius, 32);
});

test('finishing a custom size normalizes invalid input within the inspector limits', () => {
  for (const [input, expected] of [['100', 45], ['-4', 5], ['', 9], ['NaN', 9]]) {
    const { node, context } = formFixture();
    context.radModeSelect.value = 'custom'; context.nRad.value = input;
    closure('finishCustomRadius', context)();
    assert.equal(node.radius, expected);
    assert.equal(context.nRad.value, String(expected));
    assert.equal(context.changed(context.nRad), false);
  }
});

test('explicit black and returning to theme color each remain undoable inspector edits', async () => {
  const { node, context } = formFixture(), history = new UndoManager();
  context.ctx.saveUndo = () => history.pushSnapshot(context.ctx.graph);
  context.beginPropertyEdit();
  context.touchedControls.add(context.nCol); // Choosing the same native value is still an explicit choice.
  await context.saveCurrent();
  assert.equal(node.color, '#000000');
  assert.equal(node.colorMode, 'custom');
  context.beginPropertyEdit();
  context.inheritedColorPickers.add(context.nCol);
  context.nCol.value = '#a8563e'; context.touchedControls.add(context.nCol);
  await context.saveCurrent();
  assert.equal(node.color, undefined);
  assert.equal(node.colorMode, undefined);
  history.undo(context.ctx.graph);
  assert.equal(context.ctx.graph.nodes[0].color, '#000000');
  assert.equal(context.ctx.graph.nodes[0].colorMode, 'custom');
  history.redo(context.ctx.graph);
  assert.equal(context.ctx.graph.nodes[0].color, undefined);
});

test('native color input commits the explicit sentinel before an immediate selection switch', () => {
  const { node, context } = formFixture(), history = new UndoManager();
  const picker = new TextInput(); picker.type = 'color'; picker.value = '#000000';
  context.nCol = picker; context.formBaseline.set(picker, picker.value);
  context.inheritedColorPickers.add(picker);
  context.ctx.saveUndo = () => history.pushSnapshot(context.ctx.graph);
  // The palette's input listener is registered before the persistence listener.
  picker.addEventListener('input', () => {
    context.inheritedColorPickers.delete(picker); context.touchedControls.add(picker);
  });
  closure('bindAutoSave', context)(picker);
  context.beginPropertyEdit(); picker.send('click'); picker.send('input');
  assert.equal(node.color, '#000000');
  assert.equal(node.colorMode, 'custom');
  context.selected = 'b'; context.displayedItem = { id: 'b' };
  picker.send('change'); picker.blur();
  assert.equal(context.saved, 1);
  history.undo(context.ctx.graph);
  assert.equal(context.ctx.graph.nodes[0].color, undefined);
  assert.equal(history.canUndo(), false);
});
