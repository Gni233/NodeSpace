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

async function loadVaultModules() {
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
  const navigationSource = await readFile(path.join(root, 'src', 'vault-navigation.ts'), 'utf8');
  const navigationOutput = ts.transpileModule(navigationSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(/(['"])\.\/vault\1/g, JSON.stringify(vaultUrl));
  return {
    vault: await import(vaultUrl),
    navigation: await import(dataModule(navigationOutput)),
  };
}

const index = {
  rootPath: 'D:\\Gni233_vault',
  name: 'Gni233_vault',
  isObsidianVault: true,
  graphRootPath: 'D:\\Gni233_vault\\Graph233',
  graphRootRelative: 'Graph233',
  notes: [
    { path: '课程/人工智能/注意力.md', name: '注意力.md', kind: 'markdown', size: 100, mtime: 1, title: '注意力机制', headingCount: 4, charCount: 1200 },
    { path: '课程/数据结构.md', name: '数据结构.md', kind: 'markdown', size: 100, mtime: 1, title: '数据结构', headingCount: 8, charCount: 2400 },
    { path: '随笔.md', name: '随笔.md', kind: 'markdown', size: 50, mtime: 1, title: '随笔' },
  ],
  attachments: [
    { path: '课程/人工智能/示意图.png', name: '示意图.png', kind: 'image', size: 20, mtime: 1 },
  ],
  graphs: [
    { path: 'Graph233/课程图.json', name: '课程图.json', kind: 'graph', size: 30, mtime: 1 },
  ],
  stats: { notes: 3, attachments: 1, graphs: 1, headings: 12 },
};

test('Vault folders are deterministic read-only projections of direct children', async () => {
  const { vault } = await loadVaultModules();
  const rootChildren = vault.vaultFolderResources(index, '');
  assert.deepEqual(rootChildren.map(child => [child.name, child.kind]), [
    ['课程', 'folder'], ['Graph233', 'folder'], ['随笔.md', 'markdown'],
  ]);
  assert.equal(rootChildren.find(child => child.name === '课程').resourceCount, 3);

  const course = vault.vaultFolderToGraph(index, '课程', index.rootPath);
  const secondPass = vault.vaultFolderToGraph(index, '课程', index.rootPath);
  assert.deepEqual(course.nodes.map(node => node.label), ['人工智能', '数据结构']);
  assert.deepEqual(course.nodes.map(node => node.id), secondPass.nodes.map(node => node.id));
  assert.equal(course.nodes[0].sourceRef.kind, 'folder');
  assert.equal(course.nodes[1].sourceRef.kind, 'markdown');
  assert.equal(course.settings.sourceMode, 'vault-readonly');
  assert.equal(course.settings.vaultSpacePath, '课程');
});

test('Vault location ids and breadcrumbs move between root, folders, and source files', async () => {
  const { vault, navigation } = await loadVaultModules();
  const folderTab = vault.vaultSpaceTabId('课程/人工智能');
  const noteTab = vault.vaultTabId('课程/人工智能/注意力.md');
  assert.equal(vault.isVaultLocationTabId(folderTab), true);
  assert.equal(vault.vaultSpacePathFromTabId(folderTab), '课程/人工智能');
  assert.equal(vault.vaultDisplayName(folderTab), '人工智能');
  assert.equal(vault.vaultGraphFileName(index, 'Graph233/课程图.json'), '课程图.json');

  assert.deepEqual(navigation.vaultLocationCrumbs(index, noteTab).map(crumb => [crumb.label, crumb.current]), [
    ['Gni233_vault', false], ['课程', false], ['人工智能', false], ['注意力机制', true],
  ]);
  assert.deepEqual(navigation.vaultLocationCrumbs(index, folderTab).map(crumb => crumb.label), [
    'Gni233_vault', '课程', '人工智能',
  ]);
});

test('Vault viewport memory is local UI state and ignores ordinary graph tabs', async () => {
  const { vault, navigation } = await loadVaultModules();
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const memory = new navigation.VaultViewportMemory(storage);
  const tab = vault.vaultSpaceTabId('课程');
  memory.save(tab, { centerX: 120, centerY: -30, scale: 0.42 });
  assert.deepEqual(memory.load(tab), { centerX: 120, centerY: -30, scale: 0.42, touchedAt: memory.load(tab).touchedAt });
  memory.save('普通图.json', { centerX: 1, centerY: 2, scale: 3 });
  assert.equal(memory.load('普通图.json'), null);
});

test('desktop wiring makes read-only Vault cards enterable and keeps breadcrumb responsive', async () => {
  const [main, events, sidebar, css] = await Promise.all([
    readFile(path.join(root, 'src', 'main.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'ui-events.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'ui-sidebar.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'workspace-ui.css'), 'utf8'),
  ]);
  assert.match(main, /openVaultProjectionTarget/);
  assert.match(main, /vaultGraphFileName/);
  assert.match(main, /restoreVaultViewportForPane/);
  assert.match(main, /if \(isVaultLocationTabId\(fileName\)\) return true/);
  assert.match(events, /canDoubleClickReadOnlyNode/);
  assert.match(sidebar, /onSelectVaultFolder/);
  assert.match(sidebar, /双击进入空间/);
  assert.match(css, /\.fg-vault-space-breadcrumb/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.fg-vault-space-context/);
  assert.match(css, /\.fg-media-reader \{ top: var\(--fg-floating-top-bottom, 58px\)/);
});
