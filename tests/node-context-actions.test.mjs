import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const ts = createRequire(import.meta.url)('typescript');
const source = await readFile(new URL('../src/node-context-actions.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const { nodeContextActions } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const command = label => ({ label, action() {} });

test('the node wheel promotes common actions once and keeps the rest reachable', () => {
  const edit = command('编辑');
  const add = command('新建子节点');
  const link = command('连线');
  const unpin = command('解除固定');
  const fold = command('折叠一级');
  const copy = command('创建副本');
  const deleteNode = command('删除');
  const share = { label: '共享到其他空间', children: [command('课程')] };
  const advanced = command('逐级折叠');
  const { commands, remaining } = nodeContextActions([
    edit, add, link, deleteNode, { separator: true }, { label: '更多', children: [unpin, fold, copy, share, advanced] },
  ]);
  assert.deepEqual(commands.map(({ item }) => item), [edit, add, link, unpin, fold]);
  assert.deepEqual(remaining, [deleteNode, copy, share, advanced]);
  assert.ok(commands.every(({ item }) => !remaining.includes(item)));
});

test('media nodes foreground their available player command and retain the editor', () => {
  const opening = command('打开');
  const edit = command('编辑');
  const { commands, remaining } = nodeContextActions([edit, opening, { label: '固定', disabled: true }]);
  assert.deepEqual(commands, [{ icon: 'open', item: opening }]);
  assert.equal(remaining[0], edit);
  assert.equal(remaining[1].disabled, true);
});
