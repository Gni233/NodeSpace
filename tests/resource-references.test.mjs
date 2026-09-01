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

async function loadModules() {
  const linksSource = await readFile(path.join(root, 'src', 'obsidian-links.ts'), 'utf8');
  const linksOutput = ts.transpileModule(linksSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const linksUrl = dataModule(linksOutput);
  let vaultSource = await readFile(path.join(root, 'src', 'vault.ts'), 'utf8');
  vaultSource = vaultSource.replace(/(['"])\.\/obsidian-links\1/g, JSON.stringify(linksUrl));
  const vaultOutput = ts.transpileModule(vaultSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const vaultUrl = dataModule(vaultOutput);
  const source = await readFile(path.join(root, 'src', 'resource-references.ts'), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(/(['"])\.\/vault\1/g, JSON.stringify(vaultUrl));
  return {
    vault: await import(vaultUrl),
    references: await import(dataModule(output)),
  };
}

const index = {
  rootPath: 'D:\\Gni233_vault',
  name: 'Gni233_vault',
  isObsidianVault: true,
  graphRootPath: 'D:\\Gni233_vault\\Graph233',
  graphRootRelative: 'Graph233',
  notes: [
    { path: '课程/人工智能/注意力.md', name: '注意力.md', kind: 'markdown', size: 120, mtime: 8, title: '注意力机制' },
  ],
  attachments: [
    { path: '附件/示意图.png', name: '示意图.png', kind: 'image', size: 48, mtime: 9 },
  ],
  graphs: [
    { path: 'Graph233/课程图.json', name: '课程图.json', kind: 'graph', size: 30, mtime: 10 },
  ],
  stats: { notes: 1, attachments: 1, graphs: 1, headings: 4 },
};

test('reference cards persist pointers rather than copied source content', async () => {
  const { references } = await loadModules();
  const reference = references.resourceReferenceForPath(index, '课程/人工智能/注意力.md');
  const node = references.createResourceReferenceNode(
    { label: '注意力机制', note: '课程笔记摘要', tags: ['AI'] },
    reference,
    { x: 40, y: 80 },
    'ref_1',
  );
  assert.equal(node.resourceRef.provider, 'vault');
  assert.equal(node.resourceRef.path, '课程/人工智能/注意力.md');
  assert.deepEqual(node.resourceRef.fingerprint, { size: 120, mtime: 8 });
  assert.equal(node.note, '课程笔记摘要');
  assert.deepEqual(node.tags, ['AI', '引用']);
  assert.equal(node.sourceRef, undefined);
});

test('reference card faces use transient source excerpts and never fall back to file paths', async () => {
  const { references } = await loadModules();
  const reference = references.resourceReferenceForPath(index, '课程/人工智能/注意力.md');
  const node = references.createResourceReferenceNode({}, reference, { x: 0, y: 0 }, 'ref_preview');
  assert.equal(node.note, '');
  assert.equal(node._resourceReferencePreview, '');
  assert.ok(!JSON.stringify(node).includes('引用 · 课程/人工智能/注意力.md'));

  const excerpt = references.markdownResourceReferenceExcerpt([
    '---',
    'aliases: [Attention]',
    '---',
    '# 注意力机制',
    '',
    '注意力会根据查询与键的相关程度，为不同的值分配权重。',
    '',
    '参见 [Transformer](https://example.com/private/path) 和 [[课程/深度学习|深度学习]]。',
  ].join('\n'), reference, 180);
  assert.match(excerpt, /为不同的值分配权重/);
  assert.match(excerpt, /Transformer/);
  assert.match(excerpt, /深度学习/);
  assert.doesNotMatch(excerpt, /example\.com|课程\//);
});

test('moved resources repair by stable lightweight fingerprint and preserve a custom wrapper label', async () => {
  const { references } = await loadModules();
  const graph = { nodes: [{
    id: 'ref_1',
    label: '我自己的卡片名',
    resourceRef: {
      provider: 'vault', version: 1, kind: 'markdown', path: '旧目录/注意力.md',
      displayLabel: '注意力机制', fingerprint: { size: 120, mtime: 8 },
    },
  }], edges: [], groups: [] };
  const report = references.reconcileGraphResourceReferences(graph, index, index.rootPath);
  assert.deepEqual(report, { checked: 1, repaired: 1, broken: 0, cleaned: 0 });
  assert.equal(graph.nodes[0].resourceRef.path, '课程/人工智能/注意力.md');
  assert.equal(graph.nodes[0].label, '我自己的卡片名');
  assert.equal(graph.nodes[0]._resourceReferenceStatus, 'ok');
  assert.equal(graph.nodes[0]._resourceReferencePreview, undefined);
});

test('loading copy is never accepted as reference content', async () => {
  const { references } = await loadModules();
  assert.equal(references.isResourceReferenceLoadingPreview('正在读取笔记内容…'), true);
  assert.equal(references.isResourceReferenceLoadingPreview('正在读取“注意力”小节…'), true);
  assert.equal(references.isResourceReferenceLoadingPreview('注意力会根据查询分配权重'), false);

  const reference = references.resourceReferenceForPath(index, '课程/人工智能/注意力.md');
  const fallback = references.resourceReferenceCardFallback(reference, index);
  assert.doesNotMatch(fallback, /正在读取/);

  const graph = { nodes: [{
    id: 'legacy_loading',
    label: '注意力机制',
    _resourceReferencePreview: '正在读取笔记内容…',
    resourceRef: reference,
  }], edges: [], groups: [] };
  references.reconcileGraphResourceReferences(graph, index, index.rootPath);
  assert.equal(graph.nodes[0]._resourceReferencePreview, undefined);
});

test('missing and ambiguous targets stay visibly broken instead of being guessed', async () => {
  const { references } = await loadModules();
  const graph = { nodes: [{
    id: 'ref_missing', label: '找不到',
    resourceRef: { provider: 'vault', version: 1, kind: 'pdf', path: '论文/失踪.pdf', displayLabel: '失踪' },
  }], edges: [], groups: [] };
  const report = references.reconcileGraphResourceReferences(graph, index, index.rootPath);
  assert.equal(report.broken, 1);
  assert.equal(graph.nodes[0]._resourceReferenceStatus, 'broken');
  assert.equal(graph.nodes[0].resourceRef.path, '论文/失踪.pdf');
});

test('legacy generated path notes are removed without touching user-written wrapper notes', async () => {
  const { references } = await loadModules();
  const generated = {
    id: 'generated',
    note: 'Markdown · 课程/人工智能/注意力.md',
    resourceRef: { provider: 'vault', version: 1, kind: 'markdown', path: '课程/人工智能/注意力.md' },
  };
  const custom = {
    id: 'custom',
    note: '这张引用对期末复习很重要',
    resourceRef: { provider: 'vault', version: 1, kind: 'markdown', path: '课程/人工智能/注意力.md' },
  };
  const graph = { nodes: [generated, custom], edges: [], groups: [] };
  const report = references.reconcileGraphResourceReferences(graph, index, index.rootPath);
  assert.equal(report.cleaned, 1);
  assert.equal(generated.note, '');
  assert.equal(custom.note, '这张引用对期末复习很重要');
});

test('folder previews and graph path rewrites keep references lightweight', async () => {
  const { references } = await loadModules();
  const folder = references.resourceReferenceForPath(index, '课程', 'folder');
  const preview = references.resourceReferencePreviewMarkdown(folder, index);
  assert.match(preview, /人工智能/);
  assert.doesNotMatch(preview, /路径：/);
  const cardPreview = references.resourceReferenceCardFallback(folder, index);
  assert.match(cardPreview, /人工智能/);
  assert.doesNotMatch(cardPreview, /课程\//);

  const graph = { nodes: [{
    id: 'graph_ref',
    resourceRef: { provider: 'vault', version: 1, kind: 'graph', path: 'Graph233/旧图.json' },
  }], edges: [], groups: [] };
  assert.equal(references.rewriteGraphResourceReferencePaths(graph, 'Graph233/旧图.json', 'Graph233/新图.json'), 1);
  assert.equal(graph.nodes[0].resourceRef.path, 'Graph233/新图.json');
});

test('desktop wiring exposes place, preview, enter, return, collapse, and broken-reference feedback', async () => {
  const [main, sidebar, navigation, pixi, css] = await Promise.all([
    readFile(path.join(root, 'src', 'main.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'ui-sidebar.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'vault-navigation.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'pixi-nodes.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'workspace-ui.css'), 'utf8'),
  ]);
  assert.match(main, /placeResourceReferenceInGraph/);
  assert.match(main, /showReferencePreview/);
  assert.match(main, /openResourceReferenceTarget/);
  assert.match(main, /returnFromResourceReference/);
  assert.match(main, /semanticCardForms:[\s\S]*?\[node\.id\]: 'card'/);
  assert.match(main, /hydrateGraphResourceReferencePreviews/);
  assert.match(main, /ensureGraphResourceReferencePreviews/);
  assert.match(main, /readVaultTextForPreview/);
  assert.match(main, /vaultIndex\?\.rootPath \|\| fileSystemMountPath/);
  assert.match(main, /markdownResourceReferenceExcerpt/);
  assert.match(main, /resourceReferencePreviewCache\.delete\(key\)/);
  assert.match(main, /引用失效/);
  assert.match(sidebar, /作为引用放入图/);
  assert.match(navigation, /ReferenceJourney/);
  assert.match(pixi, /resourceReferenceStatus/);
  assert.match(pixi, /state\.resourceReferencePreview \|\| card\.excerpt/);
  assert.match(css, /is-reference-return/);
});
