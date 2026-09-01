import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadEditorModule() {
  const source = await readFile(path.join(root, 'src', 'markdown-source-editor.ts'), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
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
  session.acceptSaved();
  assert.equal(session.dirty, false);
  assert.equal(session.conflicted, false);
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

test('preview escapes source HTML and refuses executable link schemes', async () => {
  const { renderMarkdownSourcePreview } = await loadEditorModule();
  const html = renderMarkdownSourcePreview('# 标题\n<script>alert(1)</script>\n[危险](javascript:alert(1))\n[安全](https://example.com)');
  assert.doesNotMatch(html, /<script>|href="javascript:/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /href="https:\/\/example\.com"/);
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
