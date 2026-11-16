import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const ts = createRequire(import.meta.url)('typescript');
const source = file => readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
const moduleUrl = text => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(text, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64');

const links = moduleUrl(await source('obsidian-links.ts'));
const vault = moduleUrl((await source('vault.ts')).replace("'./obsidian-links'", JSON.stringify(links)));
const { parseMarkdownSections } = await import(vault);
const { readMarkdownProjection, replaceMarkdownProjection } = await import(
  moduleUrl((await source('markdown-projection-edit.ts')).replace("'./vault'", JSON.stringify(vault))),
);

test('the document introductory edit preserves a BOM, frontmatter, code fences and every later section', () => {
  const preamble = '\uFEFF---\r\ntitle: 课程\r\n# 这是 YAML 注释\r\n...\r\n';
  const prose = '引言\r\n\r\n````md\r\n# 围栏中的标题\r\n```\r\n# 短标记没有关闭围栏\r\n~~~\r\n# 另一种标记没有关闭围栏\r\n````\r\n';
  const chapters = '# 第一章\r\n内容\r\n## 内部小节\r\n结语';
  const markdown = preamble + prose + chapters;
  assert.deepEqual(parseMarkdownSections(markdown).map(({ title, line }) => [title, line]), [['第一章', 14], ['内部小节', 16]]);

  const target = { kind: 'document' };
  assert.deepEqual(readMarkdownProjection(markdown, target), { body: prose });
  assert.equal(replaceMarkdownProjection(markdown, target, { body: '新引言\n另一行' }),
    preamble + '新引言\r\n另一行\r\n' + chapters);
  assert.equal(replaceMarkdownProjection(markdown, target, { title: '不能重命名文件' }), null);
});

test('editing a heading and its own body preserves ATX tokens, indentation, CRLF, child headings and siblings', () => {
  const before = '# 前言\r\n前言内容\r\n';
  const section = '  ##\t章节 #号\t ### \t\r\n旧内容\r\n\r\n';
  const after = '### 子节\r\n子节正文\r\n## 后一节\r\n后一节正文\r\n';
  const original = before + section + after;
  const target = { kind: 'section', heading: '章节 #号', headingPath: '前言#章节 #号', line: 3 };
  assert.deepEqual(readMarkdownProjection(original, target), { title: '章节 #号', body: '旧内容\r\n\r\n' });
  assert.equal(replaceMarkdownProjection(original, target, { title: '新题', body: '替换一\n替换二' }),
    before + '  ##\t新题\t ### \t\r\n替换一\r\n替换二\r\n' + after);
  assert.equal(replaceMarkdownProjection(original, target, { title: '新题\n# 注入另一个标题' }), null);
  assert.equal(replaceMarkdownProjection(original, target, { body: '' }), before + '  ##\t章节 #号\t ### \t\r\n' + after);
});

test('repeat titles resolve under different parents but identical ancestry cannot be edited by a stale line', () => {
  const original = '# 甲\n## 同名\n甲节\n# 乙\n## 同名\n乙节\n';
  const target = { kind: 'section', heading: '同名', headingPath: '乙#同名', line: 2 };
  assert.deepEqual(readMarkdownProjection(original, target), { title: '同名', body: '乙节\n' });
  assert.equal(replaceMarkdownProjection(original, target, { body: '乙节替换' }),
    '# 甲\n## 同名\n甲节\n# 乙\n## 同名\n乙节替换');
  const ambiguous = original + '## 同名\n同父同名\n';
  assert.equal(readMarkdownProjection(ambiguous, { ...target, line: 5 }), null);
  assert.equal(replaceMarkdownProjection(ambiguous, target, { body: '不写入' }), null);
  assert.equal(readMarkdownProjection(original, { kind: 'section', heading: '同名' }), null);
  assert.equal(readMarkdownProjection(original, { ...target, headingPath: '丙#同名' }), null);
});

test('whole-body document editing supports single-card projections and only exposes text after frontmatter', () => {
  const frontmatter = '---\r\ntitle: 真实笔记\r\n---\r\n';
  const body = '# 第一节\r\n内容';
  const original = frontmatter + body;
  const target = { kind: 'document', wholeBody: true };
  assert.deepEqual(readMarkdownProjection(original, target), { body });
  assert.equal(replaceMarkdownProjection(original, target, { body: '# 新标题\n新内容' }), frontmatter + '# 新标题\r\n新内容');
  assert.equal(replaceMarkdownProjection(original, { kind: 'document' }, { body: '前置内容' }), frontmatter + '前置内容\r\n' + body);
  assert.equal(replaceMarkdownProjection('\uFEFF仅正文', { kind: 'document' }, { body: '新正文' }), '\uFEFF新正文');
});

test('adding body after an unterminated last heading or frontmatter retains valid line boundaries', () => {
  assert.equal(replaceMarkdownProjection('# 唯一标题', { kind: 'section', heading: '唯一标题' }, { title: '新题', body: '正文' }), '# 新题\n正文');
  assert.equal(replaceMarkdownProjection('---\r\ntitle: YAML\r\n---', { kind: 'document' }, { body: '文档正文' }), '---\r\ntitle: YAML\r\n---\r\n文档正文');
  const mixed = '# 第一节\r\n混合\n换行\r\n';
  assert.equal(replaceMarkdownProjection(mixed, { kind: 'section', heading: '第一节' }, { body: '混合\n换行\n' }), mixed);
});
