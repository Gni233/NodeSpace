import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const { build } = require('esbuild');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let editorModule;
function loadEditorModule() {
  return editorModule ??= build({
    entryPoints: [path.join(root, 'src', 'markdown-source-editor.ts')],
    bundle: true, write: false, format: 'esm', platform: 'browser',
  }).then(({ outputFiles }) => import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`));
}

test('markdown edit sessions never overwrite a changed source silently', async () => {
  const { MarkdownEditSession } = await loadEditorModule();
  const session = new MarkdownEditSession('# 初稿\n正文');
  session.updateDraft('# 我的修改\n正文');

  assert.equal(session.dirty, true);
  assert.deepEqual(session.planSave('# 别处的修改\n正文'), {
    kind: 'conflict',
    diskContent: '# 别处的修改\n正文',
  });
  assert.equal(session.conflicted, true);
  assert.deepEqual(session.planSave('# 别处的修改\n正文', true), {
    kind: 'write',
    content: '# 我的修改\n正文',
  });
  session.acceptSaved('# 我的修改\n正文');
  assert.equal(session.dirty, false);
  assert.equal(session.conflicted, false);
});

async function createEditorFixture(t, dependencies) {
  const { createMarkdownSourceEditor } = await loadEditorModule();
  const controls = new Map();
  function element() {
    return {
      children: [], dataset: {}, classList: { add() {}, remove() {}, toggle() {} },
      appendChild(child) { this.children.push(child); },
      setAttribute() {}, focus() {}, setSelectionRange() {}, querySelectorAll: () => [],
      querySelector(selector) {
        if (!controls.has(selector)) controls.set(selector, element());
        return controls.get(selector);
      },
      addEventListener(type, callback) { this[type] = callback; },
    };
  }
  const oldDocument = globalThis.document;
  const oldFrame = globalThis.requestAnimationFrame;
  globalThis.document = { createElement: element };
  globalThis.requestAnimationFrame = callback => callback();
  t.after(() => { globalThis.document = oldDocument; globalThis.requestAnimationFrame = oldFrame; });
  const host = element();
  const editor = createMarkdownSourceEditor(host, dependencies);
  return { editor, controls, rootElement: host.children[0] };
}

test('closing a source edit explicitly releases its focused input', async t => {
  const { editor, controls, rootElement } = await createEditorFixture(t, {
    readFile: async () => '原文',
    writeFile: async () => ({ ok: true }),
    confirmDiscard: async () => true,
  });
  await editor.open({ path: 'notes/a.md', absolutePath: 'Vault/notes/a.md', title: 'A', editable: true });
  const input = controls.get('.ns-md-editor-textarea');
  document.activeElement = input;
  rootElement.contains = element => element === input;
  let blurred = false;
  input.blur = () => { blurred = true; document.activeElement = null; };
  assert.equal(await editor.requestClose(), true);
  assert.equal(blurred, true);
  assert.equal(editor.isOpen(), false);
});

test('typing during an in-flight original-file save keeps the newer text unsaved', async t => {
  const disk = new Map([['notes/a.md', '原文']]);
  let startWrite, release, announceSaved;
  const writing = new Promise(resolve => { startWrite = resolve; });
  const writeGate = new Promise(resolve => { release = resolve; });
  const saved = new Promise(resolve => { announceSaved = resolve; });
  const { editor, controls } = await createEditorFixture(t, {
    readFile: async target => disk.get(target.path),
    writeFile: async (target, content, expectedContent) => {
      assert.equal(expectedContent, '原文');
      startWrite();
      await writeGate;
      disk.set(target.path, content);
      return { ok: true };
    },
    confirmDiscard: async () => assert.fail('Closing an in-flight save must not ask to discard it'),
    onSaved: announceSaved,
  });
  await editor.open({ path: 'notes/a.md', absolutePath: 'Vault/notes/a.md', title: 'A', editable: true });
  const input = controls.get('.ns-md-editor-textarea');
  const saveButton = controls.get('.ns-md-editor-save');
  input.value = '准备保存的版本';
  input.input();
  saveButton.click();
  await writing;
  assert.equal(await editor.requestClose(), false);
  input.value = '保存时继续输入的版本';
  input.input();
  release();
  await saved;
  await Promise.resolve();

  assert.equal(disk.get('notes/a.md'), '准备保存的版本');
  assert.equal(input.value, '保存时继续输入的版本');
  assert.equal(editor.hasDraft(), true);
  assert.equal(saveButton.disabled, false);
});

test('a second disk change during confirmed overwrite keeps the newer draft and reports a conflict', async t => {
  let disk = '初稿';
  let releaseWrite;
  let writeStarted;
  let report;
  const started = new Promise(resolve => { writeStarted = resolve; });
  const gate = new Promise(resolve => { releaseWrite = resolve; });
  const firstConflict = new Promise(resolve => { report = resolve; });
  const notifications = [];
  let saved = 0;
  const { editor, controls } = await createEditorFixture(t, {
    readFile: async () => disk,
    writeFile: async (_target, content, expectedContent) => {
      assert.equal(content, '准备覆盖的草稿');
      assert.equal(expectedContent, '第一次外部修改');
      writeStarted();
      await gate;
      return { conflict: true, content: disk };
    },
    confirmDiscard: async () => false,
    notify: (_message, type) => {
      notifications.push(type);
      report(type);
    },
    onSaved: () => { saved++; },
  });
  await editor.open({ path: 'notes/a.md', absolutePath: 'Vault/notes/a.md', title: 'A', editable: true });
  const input = controls.get('.ns-md-editor-textarea');
  input.value = '准备覆盖的草稿';
  input.input();
  disk = '第一次外部修改';
  controls.get('.ns-md-editor-save').click();
  assert.equal(await firstConflict, 'warning');

  const nextConflict = new Promise(resolve => { report = resolve; });
  controls.get('[data-action="overwrite"]').click();
  await started;
  input.value = '保存期间继续编辑的草稿';
  input.input();
  // An editor may restore the initial content before the guarded write reaches disk.
  disk = '初稿';
  releaseWrite();
  assert.equal(await nextConflict, 'warning');
  assert.deepEqual(notifications, ['warning', 'warning']);
  assert.equal(saved, 0);
  assert.equal(disk, '初稿');
  assert.equal(input.value, '保存期间继续编辑的草稿');
  assert.equal(editor.hasDraft(), true);
  assert.equal(controls.get('.ns-md-editor-state').dataset.state, 'conflict');
});

test('returning to the gallery reuses the source-editor close policy', async t => {
  const main = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');
  const source = ts.createSourceFile('main.ts', main, ts.ScriptTarget.ES2022, true);
  let action;
  function visit(node) {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && node.left.getText(source) === 'showWorkbench') action = node.right.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(action);

  let confirmCount = 0;
  let respond;
  const { editor, controls } = await createEditorFixture(t, {
    readFile: async () => '# 原文',
    writeFile: () => assert.fail('Closing the source editor must not write to disk'),
    confirmDiscard: () => {
      confirmCount++;
      return new Promise(resolve => { respond = resolve; });
    },
  });
  const target = { path: 'notes/a.md', absolutePath: 'Vault/notes/a.md', title: 'A', editable: true };
  const calls = [];
  const context = {
    showingWorkbench: false,
    openingGraphFromWall: false,
    blockForTextDraft: () => false,
    markdownSourceEditor: editor,
    invalidateWorkbenchCovers() {},
    updateWorkbench() {},
    workbenchHome: {
      element: { open: false },
      setVisible(visible) {
        assert.equal(editor.isOpen(), false);
        this.element.open = visible;
        calls.push('gallery');
      },
    },
    refreshFileTree: async () => {},
    reportWorkbenchActionError: assert.fail,
  };
  const show = new Function('context', `with (context) { return ${action}; }`)(context);

  await editor.open(target);
  const input = controls.get('.ns-md-editor-textarea');
  input.value = '# 本地草稿';
  input.input();
  const cancel = show();
  await show();
  assert.equal(confirmCount, 1);
  assert.deepEqual(calls, []);
  respond(false);
  await cancel;
  assert.equal(input.value, '# 本地草稿');
  assert.equal(editor.hasDraft(), true);
  assert.equal(editor.isOpen(), true);

  const discard = show();
  respond(true);
  await discard;
  assert.deepEqual(calls, ['gallery']);
  assert.equal(editor.hasDraft(), false);
  assert.equal(editor.isOpen(), false);

  context.workbenchHome.element.open = false;
  await editor.open(target);
  await show();
  assert.equal(confirmCount, 2);
  assert.equal(editor.isOpen(), false);
  assert.deepEqual(calls, ['gallery', 'gallery']);
});

test('clean sessions can reload external changes without manufacturing a draft', async () => {
  const { MarkdownEditSession } = await loadEditorModule();
  const session = new MarkdownEditSession('旧内容');
  session.reload('新内容');
  assert.equal(session.draft, '新内容');
  assert.equal(session.baseContent, '新内容');
  assert.equal(session.dirty, false);
});

test('projected headings, repeated heading paths, blocks, and lines focus the source text', async () => {
  const { markdownFocusOffset } = await loadEditorModule();
  const markdown = [
    '# 课程',
    '开头',
    '## 绪论',
    '第一处',
    '# 项目',
    '## 绪论',
    '目标段落 ^focus-me',
  ].join('\n');
  assert.equal(markdown.slice(markdownFocusOffset(markdown, { headingPath: '项目#绪论' })).startsWith('## 绪论'), true);
  assert.equal(markdown.slice(markdownFocusOffset(markdown, { block: 'focus-me' })).startsWith('目标段落'), true);
  assert.equal(markdown.slice(markdownFocusOffset(markdown, { line: 4 })).startsWith('第一处'), true);
});

test('editing a projected section saves only its title and returns to the graph', async t => {
  const original = '---\r\ntitle: A\r\n---\r\n## 旧标题 ##\r\n\r\n原样保留\r\n';
  let disk = original;
  let onSaved;
  const saved = new Promise(resolve => { onSaved = resolve; });
  const { editor, controls } = await createEditorFixture(t, {
    readFile: async () => disk,
    writeFile: async (_, content, expected) => {
      assert.equal(expected, original);
      disk = content;
      return { ok: true };
    },
    confirmDiscard: async () => true,
    onSaved,
  });
  await editor.open({ path: 'A.md', absolutePath: '/vault/A.md', title: '旧标题', editable: true,
    projection: { field: 'title', target: { kind: 'section', heading: '旧标题' } },
  });
  const input = controls.get('.ns-md-editor-textarea');
  assert.equal(input.value, '旧标题');
  input.value = '新标题';
  input.input();
  controls.get('.ns-md-editor-save').click();
  await saved;
  assert.equal(disk, original.replace('旧标题', '新标题'));
  assert.equal(editor.isOpen(), false);
});

test('projected body editing keeps its local draft on an external change elsewhere in the file', async t => {
  let disk = '前言\n\n## 标题\n当前正文\n';
  let report;
  const warning = new Promise(resolve => { report = resolve; });
  const { editor, controls } = await createEditorFixture(t, {
    readFile: async () => disk,
    writeFile: async () => assert.fail('Conflicting projection must never write the source'),
    confirmDiscard: async () => false,
    notify: (_, type) => report(type),
  });
  await editor.open({ path: 'A.md', absolutePath: '/vault/A.md', title: '标题', editable: true,
    projection: { field: 'body', target: { kind: 'section', heading: '标题' } },
  });
  const input = controls.get('.ns-md-editor-textarea');
  input.value = '本地草稿\n';
  input.input();
  disk = disk.replace('前言', '外部修改过的前言');
  controls.get('.ns-md-editor-save').click();
  assert.equal(await warning, 'warning');
  assert.equal(input.value, '本地草稿\n');
  assert.equal(controls.get('[data-action="overwrite"]').hidden, true);
  assert.equal(editor.hasDraft(), true);
});

test('reloading a conflict keeps a draft until the user confirms discarding it', async t => {
  let disk = '最初原文';
  let discard = false;
  let reportReload;
  const reloaded = new Promise(resolve => { reportReload = resolve; });
  const { editor, controls } = await createEditorFixture(t, {
    readFile: async () => disk,
    writeFile: async () => assert.fail('Reload must not write to disk'),
    confirmDiscard: async () => discard,
    notify: (_, type) => { if (type === 'info') reportReload(); },
  });
  await editor.open({ path: 'A.md', absolutePath: '/vault/A.md', title: 'A', editable: true });
  const input = controls.get('.ns-md-editor-textarea');
  input.value = '本地草稿';
  input.input();
  disk = '外部修改';
  await editor.handleExternalChange('A.md');

  controls.get('[data-action="reload"]').click();
  await Promise.resolve();
  assert.equal(input.value, '本地草稿');
  assert.equal(editor.hasDraft(), true);

  discard = true;
  controls.get('[data-action="reload"]').click();
  await reloaded;
  assert.equal(input.value, disk);
  assert.equal(editor.hasDraft(), false);
});

test('a failed projection refresh reports a successful file write separately', async t => {
  let disk = '原文';
  const notices = [];
  let report;
  const refreshFailed = new Promise(resolve => { report = resolve; });
  const { editor, controls } = await createEditorFixture(t, {
    readFile: async () => disk,
    writeFile: async (_, content) => { disk = content; return { ok: true }; },
    confirmDiscard: async () => false,
    onSaved: async () => { throw Error('refresh failed'); },
    notify: (message, type) => {
      notices.push([message, type]);
      if (type !== 'success') report();
    },
  });
  await editor.open({ path: 'A.md', absolutePath: '/vault/A.md', title: 'A', editable: true });
  const input = controls.get('.ns-md-editor-textarea');
  input.value = '修改后';
  input.input();
  controls.get('.ns-md-editor-save').click();
  await refreshFailed;
  assert.equal(disk, '修改后');
  assert.equal(editor.hasDraft(), false);
  assert.deepEqual(notices.map(([, type]) => type), ['success', 'warning']);
  assert.match(notices[1][0], /原文已保存/);
});

test('desktop wiring opens Markdown sources in place while keeping spatial navigation available', async () => {
  const [main, styles] = await Promise.all([
    readFile(path.join(root, 'src', 'main.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'workspace-ui.css'), 'utf8'),
  ]);
  assert.match(main, /createMarkdownSourceEditor/);
  assert.match(main, /openMarkdownSourceEditor/);
  assert.match(main, /markdownSourceEditor\?\.handleExternalChange/);
  assert.match(main, /resourceReferencePreviewCache\.clear\(\)/);
  assert.match(main, /编辑 Markdown 原文/);
  assert.match(main, /进入 Markdown 空间/);
  assert.match(styles, /\.ns-md-editor/);
  assert.match(styles, /\.ns-md-editor-conflict/);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*?\.ns-md-editor/);
});
