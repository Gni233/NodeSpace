import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function importTypeScriptModule(filePath) {
  let source = await import('node:fs/promises').then(fs => fs.readFile(filePath, 'utf8'));
  if (filePath.endsWith(`${path.sep}vault.ts`)) {
    const dependencySource = await readFile(path.join(root, 'src', 'obsidian-links.ts'), 'utf8');
    const dependencyOutput = ts.transpileModule(dependencySource, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const dependencyUrl = `data:text/javascript;base64,${Buffer.from(dependencyOutput).toString('base64')}`;
    source = source.replace(/(['"])\.\/obsidian-links\1/g, JSON.stringify(dependencyUrl));
  }
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

test('vault scan uses ./NodeSpace for a new Obsidian Vault', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nodespace-vault-'));
  try {
    await mkdir(path.join(directory, '.obsidian'));
    await mkdir(path.join(directory, '.history'));
    await mkdir(path.join(directory, '课程'));
    await mkdir(path.join(directory, 'NodeSpace'));
    await writeFile(path.join(directory, '课程', '概率论.md'), '# 概率论\n\n## 随机变量\n内容', 'utf8');
    await writeFile(path.join(directory, '课程', '讲解.mp3'), 'audio');
    await writeFile(path.join(directory, 'NodeSpace', '课程图.json'), '{"nodes":[],"edges":[],"groups":[]}');
    await writeFile(path.join(directory, 'settings.json'), '{}');
    await writeFile(path.join(directory, '.history', '旧稿.md'), '# 不应出现');

    const { scanVault } = require(path.join(root, 'electron', 'vault-service.cjs'));
    const index = scanVault(directory);
    assert.equal(index.isObsidianVault, true);
    assert.equal(index.graphRootPath, path.join(directory, 'NodeSpace'));
    assert.equal(index.graphRootRelative, 'NodeSpace');
    assert.equal(index.graphRootSource, 'default');
    assert.deepEqual(index.stats, { notes: 1, attachments: 1, graphs: 1, headings: 2 });
    assert.equal(index.notes[0].path, '课程/概率论.md');
    assert.equal(index.notes[0].title, '概率论');
    assert.equal(index.attachments[0].kind, 'audio');
    assert.equal(index.graphs[0].path, 'NodeSpace/课程图.json');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('vault scan accepts a user-selected graph folder and preserves the legacy folder once', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nodespace-vault-folder-'));
  try {
    await mkdir(path.join(directory, '.obsidian'));
    await mkdir(path.join(directory, '我的图'));
    await writeFile(path.join(directory, '我的图', '自选.json'), '{"nodes":[],"edges":[],"groups":[]}');
    const { scanVault } = require(path.join(root, 'electron', 'vault-service.cjs'));

    const selected = scanVault(directory, './我的图');
    assert.equal(selected.graphRootRelative, '我的图');
    assert.equal(selected.graphRootSource, 'configured');
    assert.equal(selected.graphs[0].path, '我的图/自选.json');

    await mkdir(path.join(directory, 'Graph233'));
    const legacy = scanVault(directory);
    assert.equal(legacy.graphRootRelative, 'Graph233');
    assert.equal(legacy.graphRootSource, 'legacy');
    assert.throws(() => scanVault(directory, '../外部'), /必须位于当前资料库内|不能包含/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('short Markdown remains one source card and never becomes writable graph data', async () => {
  const { isVaultTabId, markdownToGraph, vaultDisplayName, vaultPathFromTabId, vaultTabId } = await importTypeScriptModule(
    path.join(root, 'src', 'vault.ts'),
  );
  const tab = vaultTabId('随笔/今天.md');
  const graph = markdownToGraph('随笔/今天.md', '# 今天\n\n突然想到一个点子。');
  assert.equal(isVaultTabId(tab), true);
  assert.equal(vaultPathFromTabId(tab), '随笔/今天.md');
  assert.equal(vaultDisplayName(tab), '今天');
  assert.equal(graph.nodes.length, 1);
  assert.equal(graph.nodes[0].mediaType, 'md');
  assert.equal(graph.nodes[0].sourceRef.path, '随笔/今天.md');
  assert.equal(graph.settings.sourceMode, 'vault-readonly');
  assert.equal(graph.settings.semanticCardDensity, 'full');
});

test('long Markdown becomes a bounded heading hierarchy with source locations', async () => {
  const { markdownToGraph, parseMarkdownSections } = await importTypeScriptModule(
    path.join(root, 'src', 'vault.ts'),
  );
  const markdown = [
    '# 人工智能',
    '课程总览。'.repeat(500),
    '```md',
    '## 代码里的标题不算',
    '```',
    '## 机器学习',
    '梯度下降和反向传播。',
    '### 优化',
    '学习率。',
    '## 计算机视觉',
    '卷积与图像。',
  ].join('\n');
  const sections = parseMarkdownSections(markdown);
  assert.deepEqual(sections.map(section => section.title), ['人工智能', '机器学习', '优化', '计算机视觉']);
  const graph = markdownToGraph('课程/人工智能.md', markdown);
  assert.equal(graph.nodes.length, 5);
  assert.equal(graph.edges.length, 4);
  const machineLearning = graph.nodes.find(node => node.label === '机器学习');
  const optimization = graph.nodes.find(node => node.label === '优化');
  const mlEdge = graph.edges.find(edge => edge.target === machineLearning.id);
  const optimizationEdge = graph.edges.find(edge => edge.target === optimization.id);
  assert.equal(mlEdge.kind, 'hierarchy');
  assert.equal(optimizationEdge.source, machineLearning.id);
  assert.ok(machineLearning.sourceRef.line > 1);
  assert.equal(optimization.sourceRef.headingPath, '人工智能#机器学习#优化');
  assert.equal(graph.settings.sourceMode, 'vault-readonly');
});

test('very large outlines are capped and media files become integrated source cards', async () => {
  const { attachmentToGraph, markdownToGraph } = await importTypeScriptModule(
    path.join(root, 'src', 'vault.ts'),
  );
  const markdown = Array.from({ length: 240 }, (_, index) => `## 小节 ${index + 1}\n内容 ${index + 1}`).join('\n');
  const documentGraph = markdownToGraph('大纲.md', markdown);
  assert.equal(documentGraph.nodes.length, 182);
  assert.match(documentGraph.nodes.at(-1).label, /另有 60 个小节/);
  const pdfGraph = attachmentToGraph('资料/论文.pdf', 'D:\\Vault\\资料\\论文.pdf', 'pdf');
  assert.equal(pdfGraph.nodes[0].mediaType, 'pdf');
  assert.equal(pdfGraph.nodes[0].sourceRef.kind, 'pdf');
  assert.equal(pdfGraph.settings.sourceMode, 'vault-readonly');
});

test('desktop wiring keeps the Vault root and graph storage root separate', async () => {
  const { readFile } = await import('node:fs/promises');
  const main = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');
  const electron = await readFile(path.join(root, 'electron', 'main.cjs'), 'utf8');
  const preload = await readFile(path.join(root, 'electron', 'preload.cjs'), 'utf8');
  const sidebar = await readFile(path.join(root, 'src', 'ui-sidebar.ts'), 'utf8');
  const vite = await readFile(path.join(root, 'vite.config.ts'), 'utf8');
  const mcp = await readFile(path.join(root, 'mcp-server', 'server.js'), 'utf8');
  assert.match(main, /graphStorageMountPath/);
  assert.match(main, /markdownToGraph/);
  assert.match(main, /sourceMode === 'vault-readonly'/);
  assert.match(electron, /vault-scan/);
  assert.match(electron, /vault-open-in-obsidian/);
  assert.match(preload, /onVaultFileChange/);
  assert.match(sidebar, /Obsidian 资料库/);
  assert.match(vite, /resolveGraphDirectory\(config\.folderPath, config\.graphFolderRelative\)/);
  assert.match(mcp, /resolveGraphDirectory\(config\.folderPath, config\.graphFolderRelative\)/);
  assert.doesNotMatch(vite, /path\.join\(config\.folderPath, 'Graph233'\)/);
  assert.doesNotMatch(mcp, /join\(config\.folderPath, 'Graph233'\)/);
});

test('Vault projections inherit user appearance defaults without surrendering projection layout', async () => {
  const { applyVaultProjectionDefaults } = await importTypeScriptModule(
    path.join(root, 'src', 'vault-defaults.ts'),
  );
  const graph = applyVaultProjectionDefaults(
    { nodes: [], edges: [], groups: [], settings: { layoutMode: 'auto', semanticCardDensity: 'full', sourceMode: 'vault-readonly' } },
    { graphTheme: 'nord-dark', fontFamily: 'serif', nodeColorStyle: 'uniform', gridVis: true },
    { graphTheme: 'atom-light', fontFamily: 'system-ui', nodeColorStyle: 'spectrum-narrow', gridVis: false, layoutMode: 'force' },
  );
  assert.equal(graph.settings.graphTheme, 'atom-light');
  assert.equal(graph.settings.fontFamily, 'system-ui');
  assert.equal(graph.settings.nodeColorStyle, 'spectrum-narrow');
  assert.equal(graph.settings.gridVis, false);
  assert.equal(graph.settings.layoutMode, 'auto');
  assert.equal(graph.settings.sourceMode, 'vault-readonly');
});

test('Vault card titles remain authoritative when layout views contain only internal ids', async () => {
  const { resolveNodeDisplayLabel } = await importTypeScriptModule(
    path.join(root, 'src', 'node-display.ts'),
  );
  const internalId = 'vault_adj45do';
  const graphNodes = new Map([[internalId, { id: internalId, label: '注意力机制' }]]);

  assert.equal(resolveNodeDisplayLabel({ id: internalId, x: 12, y: 24 }, graphNodes), '注意力机制');
  assert.equal(resolveNodeDisplayLabel({ id: internalId, label: '临时标题' }, graphNodes), '注意力机制');
  assert.equal(resolveNodeDisplayLabel(
    { id: internalId },
    new Map([[internalId, { id: internalId, label: internalId, sourceRef: { displayLabel: '注意力机制', path: '课程/人工智能.md' } }]]),
  ), '注意力机制');
  assert.equal(resolveNodeDisplayLabel({ id: 'n_1', label: '普通节点' }, new Map()), '普通节点');
  assert.equal(resolveNodeDisplayLabel({ id: 'n_2' }, new Map()), 'n_2');
});

test('Vault projections cannot be renamed by the legacy inspector and saved folders restore access first', async () => {
  const [main, editor, electron] = await Promise.all([
    readFile(path.join(root, 'src', 'main.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'ui-edit.ts'), 'utf8'),
    readFile(path.join(root, 'electron', 'main.cjs'), 'utf8'),
  ]);
  assert.match(editor, /if \(ctx\.canMutate\?\.\(\) === false\) return;/);
  assert.match(main, /canMutate: \(\) => paneRuntimeGraph\(focusedPaneState\(\)\)\.settings\?\.sourceMode !== 'vault-readonly'/);
  const tapStart = main.indexOf('onTap: (x: number, y: number, nodeId?: string)');
  const vaultTap = main.slice(tapStart, main.indexOf('fillNode,', tapStart));
  assert.ok(vaultTap.indexOf('if (isVaultProjection())') < vaultTap.indexOf('saveCurrent()'));
  const restoreStart = main.indexOf('const permission = savedPath');
  const restore = main.slice(restoreStart, main.indexOf('} else {', restoreStart));
  assert.ok(restore.indexOf('addAllowedDir') < restore.indexOf('exists(savedPath)'));
  assert.match(electron, /restoreConfiguredFolderAccess\(\);\s*\n\s*createWindow\(\)/);
});

test('closing a Vault source card clears expanded state and cannot click through', async () => {
  const [main, media] = await Promise.all([
    readFile(path.join(root, 'src', 'main.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'media-nodes.ts'), 'utf8'),
  ]);
  assert.match(main, /manuallyOpenedMediaIds\.delete\(node\.id\)/);
  assert.match(main, /resolveNodeDisplayLabel\(n, graphNodeById\)/);
  assert.match(media, /event\.stopPropagation\(\)/);
  assert.match(media, /onClose\?\.\(\)/);
});
