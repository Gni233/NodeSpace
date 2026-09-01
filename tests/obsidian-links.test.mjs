import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataModule = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

async function transpile(relativePath) {
  const source = await readFile(path.join(root, relativePath), 'utf8');
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

async function loadLinks() {
  return import(dataModule(await transpile('src/obsidian-links.ts')));
}

async function loadVault() {
  const linksUrl = dataModule(await transpile('src/obsidian-links.ts'));
  let source = await readFile(path.join(root, 'src', 'vault.ts'), 'utf8');
  source = source.replace(/(['"])\.\/obsidian-links\1/g, JSON.stringify(linksUrl));
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(dataModule(output));
}

const note = (pathName, title, links = [], excerpt = `${title} 的正文摘要`) => ({
  path: pathName,
  name: pathName.split('/').at(-1),
  kind: 'markdown',
  size: 100,
  mtime: 1,
  title,
  excerpt,
  links,
});

test('Obsidian parser keeps concrete links and ignores examples, metadata, and external URLs', async () => {
  const { extractObsidianLinks } = await loadLinks();
  const markdown = [
    '---',
    'related: "[[Frontmatter only]]"',
    '---',
    '# 观察',
    '[[课程/注意力#查询矩阵|注意力小节]] 与 ![[图像.png|320]]',
    '[相对笔记](../想法%20库/点子.md#细节) 以及 [网页](https://example.com)',
    '`[[inline code]]`',
    '```md',
    '[[fenced code]]',
    '```',
    '[[目标#^quote-of-the-day]]',
    '[[## 全库标题搜索]]',
  ].join('\n');
  const links = extractObsidianLinks(markdown);
  assert.equal(links.length, 5);
  assert.deepEqual(links.slice(0, 4).map(link => [link.syntax, link.disposition, link.target, link.heading, link.block, link.alias]), [
    ['wikilink', 'link', '课程/注意力', '查询矩阵', undefined, '注意力小节'],
    ['wikilink', 'embed', '图像.png', undefined, undefined, '320'],
    ['markdown', 'link', '../想法 库/点子.md', '细节', undefined, '相对笔记'],
    ['wikilink', 'link', '目标', undefined, 'quote-of-the-day', undefined],
  ]);
  assert.equal(links.at(-1).search, true);
  assert.ok(links.every(link => link.sourceHeading === '观察'));
});

test('resolution prefers explicit and same-folder canonical files without guessing ambiguous names', async () => {
  const { extractObsidianLinks, resolveObsidianLink } = await loadLinks();
  const index = {
    notes: [
      note('课程/当前.md', '当前'),
      note('课程/注意力.md', '注意力机制', [], '',),
      note('随笔/注意力.md', '另一份注意力'),
      { ...note('术语/Transformer.md', 'Transformer'), aliases: ['变换器'] },
    ],
    attachments: [{ path: '附件/结构图.png', name: '结构图.png', kind: 'image', size: 12, mtime: 1 }],
    graphs: [],
  };
  const occurrences = extractObsidianLinks('[[注意力]]\n[[随笔/注意力]]\n[[变换器]]\n[[结构图.png]]\n[[不存在]]');
  assert.equal(resolveObsidianLink(index, '课程/当前.md', occurrences[0]).resource.path, '课程/注意力.md');
  assert.equal(resolveObsidianLink(index, '课程/当前.md', occurrences[1]).resource.path, '随笔/注意力.md');
  assert.equal(resolveObsidianLink(index, '课程/当前.md', occurrences[2]).resource.path, '术语/Transformer.md');
  assert.equal(resolveObsidianLink(index, '课程/当前.md', occurrences[3]).resource.path, '附件/结构图.png');
  assert.equal(resolveObsidianLink(index, '课程/当前.md', occurrences[4]).status, 'missing');

  const ambiguous = { ...index, notes: index.notes.filter(item => item.path !== '课程/注意力.md') };
  ambiguous.notes.push(note('资料/注意力.md', '注意力资料'));
  assert.equal(resolveObsidianLink(ambiguous, '课程/当前.md', occurrences[0]).status, 'ambiguous');
});

test('backlinks and addressable blocks retain source context', async () => {
  const { extractObsidianBlocks, extractObsidianLinks, obsidianBacklinksForPath } = await loadLinks();
  const target = note('知识/目标.md', '目标');
  const first = note('来源一.md', '来源一', extractObsidianLinks('# 推导\n[[知识/目标#结论]]'));
  const second = note('来源二.md', '来源二', extractObsidianLinks('![[目标#^quote-id]]'));
  const index = { notes: [target, first, second], attachments: [], graphs: [] };
  const backlinks = obsidianBacklinksForPath(index, target.path);
  const backlinkBySource = Object.fromEntries(backlinks.map(item => [item.source.title, [item.occurrence.heading, item.occurrence.block]]));
  assert.deepEqual(backlinkBySource, {
    来源一: ['结论', undefined],
    来源二: [undefined, 'quote-id'],
  });
  const blocks = extractObsidianBlocks('# 片段\n\n一段可引用的观察。 ^quote-id\n\n- 第一项\n- 第二项\n\n^list-id');
  assert.deepEqual(blocks.map(block => [block.id, block.text, block.sourceHeading]), [
    ['quote-id', '一段可引用的观察。', '片段'],
    ['list-id', '第一项 第二项', '片段'],
  ]);
});

test('Markdown projection creates previewable canonical outlinks, backlinks, embeds, and explicit failures', async () => {
  const [links, vault] = await Promise.all([loadLinks(), loadVault()]);
  const markdown = '# 当前\n\n## 推导\n参见 [[目标#结论]]、![[结构图.png]] 和 [[尚未写下]]。';
  const current = note('课程/当前.md', '当前', links.extractObsidianLinks(markdown), '当前摘要');
  const target = note('知识/目标.md', '目标', [], '结论来自一组可验证的观察。');
  const source = note('随笔/来源.md', '来源', links.extractObsidianLinks('# 回看\n[[课程/当前#推导]]'), '这是一个反向链接来源。');
  const image = { path: '附件/结构图.png', name: '结构图.png', kind: 'image', size: 30, mtime: 2 };
  const index = {
    rootPath: 'D:\\Vault', name: 'Vault', isObsidianVault: true,
    graphRootPath: 'D:\\Vault\\Graph233', graphRootRelative: 'Graph233',
    notes: [current, target, source], attachments: [image], graphs: [],
    stats: { notes: 3, attachments: 1, graphs: 0, headings: 4 },
  };
  const graph = vault.markdownToGraph(current.path, markdown, current, index, index.rootPath);
  const targetCard = graph.nodes.find(node => node.resourceRef?.path === target.path);
  const backlinkCard = graph.nodes.find(node => node.resourceRef?.path === source.path);
  const embedCard = graph.nodes.find(node => node.resourceRef?.path === image.path);
  const missingCard = graph.nodes.find(node => node._obsidianLinkStatus === 'missing');
  assert.equal(targetCard.resourceRef.heading, '结论');
  assert.match(targetCard._resourceReferencePreview, /可验证/);
  assert.equal(backlinkCard.resourceRef.heading, '回看');
  assert.equal(embedCard.mediaType, 'image');
  assert.match(missingCard.note, /重新扫描后可自动恢复/);
  assert.ok(graph.edges.some(edge => edge.kind === 'obsidian-link'));
  assert.ok(graph.edges.some(edge => edge.kind === 'obsidian-embed'));
  assert.ok(graph.edges.some(edge => edge.kind === 'obsidian-backlink'));
  assert.ok(graph.edges.some(edge => edge.kind === 'obsidian-missing' && edge.lineStyle === 'dash-2'));
  assert.deepEqual(graph.settings.obsidianLinkSummary, { outgoing: 3, backlinks: 1, unresolved: 1 });
  assert.ok(graph.nodes.some(node => node.sourceRef?.heading === '推导'));
});

test('scanner captures lightweight excerpts and the same concrete link metadata in one read pass', () => {
  const { extractObsidianLinks, markdownExcerpt } = require(path.join(root, 'electron', 'vault-service.cjs'));
  const markdown = '# 标题\n\n正文说明 [[目标#小节|显示名]]。\n\n```\n[[不是链接]]\n```';
  assert.deepEqual(extractObsidianLinks(markdown).map(link => [link.target, link.heading, link.alias]), [
    ['目标', '小节', '显示名'],
  ]);
  assert.match(markdownExcerpt(markdown), /正文说明/);
  assert.doesNotMatch(markdownExcerpt(markdown), /不是链接/);
});

test('explicit Obsidian relationships have their own authoritative visual grammar and continuous doorway', async () => {
  const grammarSource = await readFile(path.join(root, 'src', 'semantic-edge-grammar.ts'), 'utf8');
  const main = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');
  assert.match(grammarSource, /role: 'reference'/);
  assert.match(grammarSource, /REFERENCE_KIND/);
  assert.match(main, /captureVaultReferenceTransition/);
  assert.match(main, /↗ 引用/);
  assert.match(main, /比算法观察到的相似关系更权威/);
  assert.match(main, /node\?\._obsidianLinkRole[\s\S]*?playSpacePortalEntryTransition/);
  assert.match(main, /reference\.block \? `\^\$\{reference\.block\}` : reference\.heading/);
  assert.match(main, /if \(isVaultLocationTabId\(runtime\.fileName\)\) affectedTabs\.add\(runtime\.fileName\)/);
});
