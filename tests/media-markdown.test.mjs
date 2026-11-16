import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
const ts = createRequire(import.meta.url)('typescript');
const katex = createRequire(import.meta.url)('katex');
const mathSource = (await readFile(new URL('../src/markdown-math.ts', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const mathOutput = ts.transpileModule(mathSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const { findMarkdownMath, renderMathInMarkdown } = new Function('katex', `${mathOutput}\nreturn { findMarkdownMath, renderMathInMarkdown };`)(katex);
const source = ts.createSourceFile('media-nodes.ts', await readFile(new URL('../src/media-nodes.ts', import.meta.url), 'utf8'), ts.ScriptTarget.ES2022, true);
const functions = source.statements.filter(node => ts.isFunctionDeclaration(node)
  && ['renderMarkdown', 'renderMarkdownContent', 'inlineMarkdown', 'isSafeMarkdownLink', 'escapeAttr'].includes(node.name?.text));
const output = ts.transpileModule(functions.map(fn => fn.getText(source)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const render = new Function('renderMathInMarkdown', `${output}\nreturn renderMarkdown;`)(renderMathInMarkdown);

test('imported Markdown keeps safe links, formatting and text without creating executable attributes', () => {
  const html = render('# 雨\n\n**声音**与 `空白`\n- [原文](https://example.test/a?q=rain&lang=zh)\n[本节](#rain)');
  assert.match(html, /<h1[^>]*>雨<\/h1>/); assert.match(html, /<strong>声音<\/strong>/);
  assert.match(html, /<code[^>]*>空白<\/code>/); assert.match(html, /<li><a href="https:\/\/example.test\/a\?q=rain&amp;lang=zh"/);
  assert.match(html, /rel="noopener noreferrer"/); assert.match(html, /href="#rain"/);
  const injection = render('[引用](https://example.test/" onpointerenter="alert(1))\n<img src=x onerror=alert(1)>');
  assert.match(injection, /&quot; onpointerenter=&quot;/);
  assert.match(injection, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(injection, /<img|" onpointerenter="/);
});

test('script, data and file links remain plain text in imported notes', () => {
  for (const target of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,hello', 'file:///C:/secret', 'vbscript:msgbox(1)', 'java\tscript:alert(1)']) {
    assert.doesNotMatch(render(`[引用](${target})`), /<a /, target);
  }
});

test('Markdown headings keep their levels through H6', () => {
  const html = render('#### 概念\r\n##### **介质** #####\r\n###### 各反射光、透射光的复振幅\r\n普通内容');
  assert.match(html, /<h4>概念<\/h4>/);
  assert.match(html, /<h5><strong>介质<\/strong><\/h5>/);
  assert.match(html, /<h6>各反射光、透射光的复振幅<\/h6>/);
  assert.match(html, /<p[^>]*>普通内容<\/p>/);
});

test('inline and display math render through KaTeX without letting Markdown rewrite TeX', () => {
  const markdown = ['# 方程 $x_1$', String.raw`斜率 $\frac{dy}{dx}$`, '$$', String.raw`\int_0^1 x^2\,dx = \frac{1}{3}`, '$$'].join('\r\n');
  const expressions = findMarkdownMath(markdown);
  assert.deepEqual(expressions.map(({ formula, displayMode }) => [formula, displayMode]), [
    ['x_1', false], [String.raw`\frac{dy}{dx}`, false], [String.raw`\int_0^1 x^2\,dx = \frac{1}{3}`, true],
  ]);
  assert.equal(markdown.slice(expressions[0].from, expressions[0].to), '$x_1$');
  const html = render(markdown);
  assert.match(html, /<h1[^>]*>方程 <span class="katex">/);
  assert.match(html, /<span class="katex-display">/);
  assert.match(html, /<annotation encoding="application\/x-tex">\\frac\{dy\}\{dx\}<\/annotation>/);
});

test('currency, escaped dollars and code remain ordinary Markdown', () => {
  const markdown = [
    String.raw`价格为 $5 或 $7，也可写为 \$9。`,
    '`$notMath$` 和 [原文](https://example.test/$query$)',
    '```js',
    '$stillNotMath$ < 1',
    '```',
    '    $indentedCode$',
    '最后写 $x+1$，未配对的 $number 保留。',
  ].join('\n');
  assert.deepEqual(findMarkdownMath(markdown).map(math => math.formula), ['x+1']);
  const html = render(markdown);
  assert.match(html, /价格为 \$5 或 \$7，也可写为 \$9。/);
  assert.match(html, /<code[^>]*>\$notMath\$<\/code>/);
  assert.match(html, /<pre><code>\$stillNotMath\$ &lt; 1<\/code><\/pre>/);
  assert.match(html, /href="https:\/\/example\.test\/\$query\$"/);
  assert.equal((html.match(/class="katex"/g) || []).length, 1);
});

test('inline math errors stay visible and untrusted TeX cannot create a link', () => {
  const html = render(String.raw`$\badcommand{$` + '\n' + String.raw`$\href{javascript:alert(1)}{hello}$`);
  assert.match(html, /class="katex-error"/);
  assert.doesNotMatch(html, /<a |href="javascript:/);
});
