import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const { scanVault } = require('../electron/vault-service.cjs');
const read = name => readFile(new URL(`../src/${name}`, import.meta.url), 'utf8');
const url = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64');
const linksUrl = url(await read('obsidian-links.ts'));
const vaultUrl = url((await read('vault.ts')).replace("'./obsidian-links'", JSON.stringify(linksUrl)));
const { getVaultWallFolder } = await import(url((await read('vault-wall.ts')).replace("'./vault'", JSON.stringify(vaultUrl))));

test('the scanned Vault wall opens actual children one level at a time and preserves empty directories', async t => {
  const temporary = path.resolve(tmpdir());
  const directory = await mkdtemp(path.join(temporary, 'nodespace-vault-wall-'));
  assert.equal(path.dirname(directory), temporary);
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, '.obsidian'));
  await mkdir(path.join(directory, '资料', '空目录'), { recursive: true });
  await mkdir(path.join(directory, 'NodeSpace', '子组'), { recursive: true });
  await writeFile(path.join(directory, '资料', '笔记.md'), '# 第一章\n正文');
  await writeFile(path.join(directory, '资料', '图片.png'), 'image fixture');
  await writeFile(path.join(directory, 'NodeSpace', '子组', '样图.json'), '{}');
  await writeFile(path.join(directory, '资料', '不是图.json'), '{}');
  await writeFile(path.join(directory, '索引.md'), '# 另一个标题');

  const index = scanVault(directory);
  assert.deepEqual([...index.directories].sort(), ['NodeSpace', 'NodeSpace/子组', '资料', '资料/空目录'].sort());
  const root = getVaultWallFolder(index);
  assert.equal(root.parentPath, null);
  assert.equal(root.title, path.basename(directory));
  assert.deepEqual(root.entries.map(({ kind, path }) => [kind, path]), [
    ['folder', '资料'], ['folder', 'NodeSpace'], ['markdown', '索引.md'],
  ]);

  const section = getVaultWallFolder(index, '资料\\');
  assert.equal(section.parentPath, '');
  assert.equal(section.parentTitle, root.title);
  assert.deepEqual(section.entries.map(({ kind, title, id }) => [kind, title, id]), [
    ['folder', '空目录', 'vault-space:资料/空目录'],
    ['markdown', '笔记', 'vault:资料/笔记.md'],
    ['image', '图片', 'vault:资料/图片.png'],
  ]);
  const empty = getVaultWallFolder(index, '资料/空目录');
  assert.deepEqual(empty, { path: '资料/空目录', parentPath: '资料', title: '空目录', parentTitle: '资料', entries: [] });
  assert.equal(getVaultWallFolder(index, '资料/笔记.md'), null);
  assert.equal(getVaultWallFolder(index, '资料/../NodeSpace'), null);
  assert.equal(getVaultWallFolder(index, '.obsidian'), null);

  const graphs = getVaultWallFolder(index, 'NodeSpace/子组');
  assert.equal(graphs.parentPath, 'NodeSpace');
  assert.deepEqual(graphs.entries.map(({ id, title, kind }) => [id, title, kind]), [['子组/样图.json', '样图', 'graph']]);
  assert.deepEqual(getVaultWallFolder(index, 'NodeSpace/子组', { omitGraphIds: new Set(['子组/样图.json']) }).entries, []);
});

test('legacy indexes infer parent folders from paths and deduplicate graph cards by canonical adapter ID', () => {
  const graph = { path: '组/作品.json', name: '作品.json', kind: 'graph' };
  const index = {
    name: 'Vault', graphRootRelative: '',
    notes: [{ path: '组/深层/笔记.md', name: '笔记.md', kind: 'markdown', title: '另一个标题' }],
    attachments: [], graphs: [graph, graph, { ...graph, path: '首页.json', name: '首页.json' }],
  };
  const root = getVaultWallFolder(index, '', { omitGraphIds: new Set(['首页.json']) });
  assert.deepEqual(root.entries.map(entry => entry.id), ['vault-space:组']);
  const folder = getVaultWallFolder(index, '组');
  assert.deepEqual(folder.entries.map(entry => entry.id), ['vault-space:组/深层', '组/作品.json']);
  assert.equal(getVaultWallFolder(index, '组/不存在'), null);
});
