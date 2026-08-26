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
  const vaultSource = await readFile(path.join(root, 'src', 'vault.ts'), 'utf8');
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
  assert.deepEqual(report, { checked: 1, repaired: 1, broken: 0 });
  assert.equal(graph.nodes[0].resourceRef.path, '课程/人工智能/注意力.md');
  assert.equal(graph.nodes[0].label, '我自己的卡片名');
  assert.equal(graph.nodes[0]._resourceReferenceStatus, 'ok');
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

test('folder previews and graph path rewrites keep references lightweight', async () => {
  const { references } = await loadModules();
  const folder = references.resourceReferenceForPath(index, '课程', 'folder');
  const preview = references.resourceReferencePreviewMarkdown(folder, index);
  assert.match(preview, /人工智能/);

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
  assert.match(main, /引用失效/);
  assert.match(sidebar, /作为引用放入图/);
  assert.match(navigation, /ReferenceJourney/);
  assert.match(pixi, /resourceReferenceStatus/);
  assert.match(css, /is-reference-return/);
});
