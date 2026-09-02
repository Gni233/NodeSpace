import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('welcome spaces teach capture-first use instead of the legacy force-graph model', async () => {
  const start = JSON.parse(await readFile(path.join(root, 'src', 'data', 'builtin', 'start.json'), 'utf8'));
  const guide = JSON.parse(await readFile(path.join(root, 'src', 'data', 'builtin', 'readme.json'), 'utf8'));

  assert.equal(start.settings.layoutMode, 'auto');
  assert.ok(start.nodes.some(node => node.label === '先记下来' && node.note.includes('+ 记录')));
  assert.ok(start.nodes.some(node => node.label === '不用先整理'));
  assert.ok(start.nodes.some(node => node.note.includes('卡片与节点是同一条内容')));
  assert.ok(guide.nodes.some(node => node.label === '内容与视图分开'));
  assert.ok(guide.nodes.some(node => node.label === '当前自动整理的边界'));
  assert.doesNotMatch(JSON.stringify(guide), /数据→d3-force力学模拟/);
});

test('project description states the current product boundary and keeps future cognition replaceable', async () => {
  const readme = await readFile(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /记录优先/);
  assert.match(readme, /内容与视图分离/);
  assert.match(readme, /推断不改写事实/);
  assert.match(readme, /当前自动整理系统不是“认知核心”/);
});
