import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const ts = createRequire(import.meta.url)('typescript');
const source = ts.createSourceFile('ui-edit.ts', await readFile(new URL('../src/ui-edit.ts', import.meta.url), 'utf8'), ts.ScriptTarget.ES2022, true);
function closure(name, context) {
  let body;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) body = node.initializer;
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && node.left.getText(source) === name) body = node.right;
    if (!body) ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(body, name);
  const output = ts.transpileModule(`const handler = ${body.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function('context', `with (context) { ${output}\nreturn handler; }`)(context);
}
function fixture() {
  const n = { id: 'a', tags: [] }, graph = { nodes: [n] };
  let resolvePrompt;
  const state = {
    n, tagGraph: graph, selected: 'a', mutable: true, _cleanedUp: false, undos: 0, saves: 0, refreshes: 0,
    addTagBtn: { isConnected: false },
    ctx: { graph, canMutate: () => state.mutable, saveUndo: () => state.undos++ },
    getSelNode: () => state.selected,
    safePrompt: () => new Promise(resolve => { resolvePrompt = resolve; }),
    triggerSave: () => state.saves++, draw() {}, refreshTagPills: () => state.refreshes++,
  };
  state.canEditTags = closure('canEditTags', state);
  return { state, add: closure('addTagBtn.onclick', state), answer: value => resolvePrompt(value) };
}

test('tag prompt saves a trimmed label with one undo and does not duplicate existing tags', async () => {
  const { state, add, answer } = fixture();
  const first = add(); answer('  阅读  '); await first;
  assert.deepEqual(state.n.tags, ['阅读']);
  assert.equal(state.undos, 1);
  assert.equal(state.saves, 1);
  const second = add(); answer('阅读'); await second;
  assert.equal(state.undos, 1);
  assert.equal(state.saves, 1);
});

const focusDeclaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'captureInspectorControlFocus');
const focusOutput = ts.transpileModule(focusDeclaration.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { captureInspectorControlFocus } = await import(`data:text/javascript;base64,${Buffer.from(focusOutput).toString('base64')}`);

function focusFixture() {
  const doc = { body: {}, activeElement: null };
  const control = key => ({ dataset: { focusKey: key }, focus(options) { this.options = options; doc.activeElement = this; } });
  const root = { ownerDocument: doc, isConnected: true, controls: [], querySelectorAll() { return this.controls; } };
  root.controls = ['open:a', 'remove:a', 'open:b', 'remove:b', 'add'].map(control);
  return { doc, root, control };
}

test('tag rebuilding restores matching control without scrolling and removal continues at the next tag', () => {
  const { doc, root, control } = focusFixture();
  doc.activeElement = root.controls[4];
  const restore = captureInspectorControlFocus(root);
  root.controls = ['open:a', 'remove:a', 'open:b', 'remove:b', 'open:c', 'remove:c', 'add'].map(control);
  doc.activeElement = doc.body;
  restore();
  assert.equal(doc.activeElement.dataset.focusKey, 'add');
  assert.deepEqual(doc.activeElement.options, { preventScroll: true });
  doc.activeElement = root.controls[1];
  const afterRemoval = captureInspectorControlFocus(root);
  root.controls = ['open:b', 'remove:b', 'add'].map(control);
  doc.activeElement = doc.body;
  afterRemoval();
  assert.equal(doc.activeElement.dataset.focusKey, 'remove:b');
});

test('tag refresh cannot steal focus from another editor or disconnected panel', () => {
  for (const mode of ['other-control', 'disconnected', 'outside']) {
    const { doc, root, control } = focusFixture();
    doc.activeElement = mode === 'outside' ? control('outside') : root.controls[0];
    const restore = captureInspectorControlFocus(root);
    root.controls = ['add'].map(control);
    if (mode === 'other-control') doc.activeElement = control('note');
    else doc.activeElement = doc.body;
    if (mode === 'disconnected') root.isConnected = false;
    const before = doc.activeElement;
    restore();
    assert.equal(doc.activeElement, before, mode);
  }
});

test('a pending tag prompt cannot write after selection, graph, identity or read-only changes', async () => {
  for (const mode of ['selection', 'graph', 'identity', 'readonly', 'destroyed']) {
    const { state, add, answer } = fixture();
    const pending = add();
    if (mode === 'selection') state.selected = 'b';
    if (mode === 'graph') state.ctx.graph = { nodes: [state.n] };
    if (mode === 'identity') state.ctx.graph.nodes[0] = { id: 'a', tags: [] };
    if (mode === 'readonly') state.mutable = false;
    if (mode === 'destroyed') state._cleanedUp = true;
    answer('阅读'); await pending;
    assert.deepEqual(state.n.tags, [], mode);
    assert.equal(state.undos + state.saves + state.refreshes, 0, mode);
  }
});

test('a file picker cannot return into a destroyed editor', () => {
  const fileNode = { id: 'a' }, fileGraph = { nodes: [] };
  fileGraph.nodes.push(fileNode);
  const context = { fileNode, fileGraph, displayedItem: fileNode, _cleanedUp: false,
    fileGeneration: 1, mediaPickGeneration: 1,
    ctx: { graph: fileGraph }, getSelNode: () => 'a' };
  const canImport = closure('canImport', context);
  assert.equal(canImport(), true);
  context._cleanedUp = true;
  assert.equal(canImport(), false);
});

function filePickerFixture() {
  const fileNode = { id: 'a' }, fileGraph = { nodes: [fileNode] };
  let resolveRead;
  const input = { files: [{ name: '雨声.md' }], click() {} };
  const state = { fileNode, fileGraph, displayedItem: fileNode, _cleanedUp: false, selected: 'a', mutable: true,
    mediaPickGeneration: 0,
    saves: 0, begins: 0, releases: 0, syncs: 0, errors: [],
    document: { createElement: () => input }, MEDIA_FILE_ACCEPT: '.md',
    ctx: { graph: fileGraph, canMutate: () => state.mutable, reportImportError: message => state.errors.push(message) },
    getSelNode: () => state.selected, nMediaUrl: { value: '' }, nMediaType: { value: '' },
    readBrowserMediaSources: () => new Promise(resolve => { resolveRead = resolve; }),
    releaseMediaSources: sources => { for (const source of sources) source.release?.(); },
    beginPropertyEdit: () => state.begins++, syncMediaFields: () => state.syncs++,
    saveCurrent: async () => { state.saves++; fileNode.mediaUrl = state.nMediaUrl.value; fileNode.mediaType = state.nMediaType.value; },
  };
  return { state, input, open: closure('nFileBtn.onclick', state), answer() {
    resolveRead({ sources: [{ name: '雨声.md', type: 'md', value: '# 雨声\n\n  尾空格  ', release: () => state.releases++ }] });
  } };
}

test('the inspector file picker saves actual contents with one property edit', async () => {
  const { state, input, open, answer } = filePickerFixture();
  await open(); const reading = input.onchange(); answer(); await reading;
  assert.equal(state.fileNode.mediaUrl, '# 雨声\n\n  尾空格  ');
  assert.equal(state.fileNode.mediaType, 'md');
  assert.equal(state.begins, 1); assert.equal(state.saves, 1); assert.equal(state.syncs, 1);
  assert.equal(state.releases, 0);
});

test('a file read cannot overwrite a changed inspector, source or read-only node', async () => {
  for (const mode of ['selection', 'graph', 'identity', 'readonly', 'projection', 'destroyed', 'new-picker']) {
    const { state, input, open, answer } = filePickerFixture();
    await open(); const reading = input.onchange();
    if (mode === 'selection') state.selected = 'b';
    if (mode === 'graph') state.ctx.graph = { nodes: [state.fileNode] };
    if (mode === 'identity') state.ctx.graph.nodes[0] = { id: 'a' };
    if (mode === 'readonly') state.mutable = false;
    if (mode === 'projection') state.fileGraph.settings = { sourceMode: 'vault-readonly' };
    if (mode === 'destroyed') state._cleanedUp = true;
    if (mode === 'new-picker') state.mediaPickGeneration++;
    answer(); await reading;
    assert.equal(state.fileNode.mediaUrl, undefined, mode);
    assert.equal(state.saves + state.begins + state.syncs, 0, mode); assert.equal(state.releases, 1, mode);
  }
});

test('collection appearance controls follow mode changes and explain hidden outlines accurately', () => {
  const context = {
    gMode: { value: 'none' }, groupNodeColorMode: { value: 'off' },
    fluidRadiusRow: { style: {} }, fluidOpacityRow: { style: {} },
    gNodeColorPickerRow: { style: {} }, gHint: { style: {}, textContent: '' },
  };
  const sync = closure('syncGroupAppearance', context);
  sync();
  assert.equal(context.gHint.style.display, 'block');
  assert.doesNotMatch(context.gHint.textContent, /自动切换/);
  assert.equal(context.gNodeColorPickerRow.style.display, 'none');
  context.gMode.value = 'fluid'; context.groupNodeColorMode.value = 'edge'; sync();
  assert.equal(context.gHint.style.display, 'none');
  assert.equal(context.fluidRadiusRow.style.display, 'block');
  assert.equal(context.fluidOpacityRow.style.display, 'block');
  assert.equal(context.gNodeColorPickerRow.style.display, 'block');
  context.gMode.value = 'rect'; sync();
  assert.equal(context.fluidRadiusRow.style.display, 'none');
});

test('structure-owned collections cannot be deleted through the editor handler', () => {
  const group = { id: 'g', collectionKind: 'structure' }, graph = { groups: [] };
  graph.groups.push(group);
  let deletes = 0;
  const context = { ctx: { graph, deleteGroup() { deletes++; } }, getSelGroup: () => 'g',
    displayedGraph: graph, displayedItem: group, isStructureCollection: g => g.collectionKind === 'structure', clearEd() {} };
  closure('groupDelBtn.onclick', context)();
  assert.equal(deletes, 0);
});
