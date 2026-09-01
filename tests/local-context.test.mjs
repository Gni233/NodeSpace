import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadLocalContext() {
  const source = await readFile(path.join(root, 'src', 'local-context.ts'), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

const node = id => ({ id, label: id.toUpperCase(), note: `${id} content` });

test('local context prefers authoritative edges and retains direction', async () => {
  const { startLocalContext } = await loadLocalContext();
  const graph = {
    nodes: ['root', 'out', 'in', 'plain', 'echo'].map(node),
    edges: [
      { source: 'root', target: 'out', arrow: true, label: '引向' },
      { source: 'in', target: 'root', _obsidianLink: true },
      { source: 'root', target: 'plain' },
    ],
    groups: [],
  };
  const echoes = [{ source: 'root', target: 'echo', score: 0.98, reason: '共同词语', kind: 'lexical', terms: [] }];
  const state = startLocalContext(graph, echoes, 'root', { maxPerStep: 4 });
  assert.ok(state);
  assert.deepEqual(state.members.map(member => member.id), ['root', 'in', 'out', 'plain', 'echo']);
  assert.equal(state.members.find(member => member.id === 'out').relation, 'outgoing');
  assert.equal(state.members.find(member => member.id === 'in').relation, 'incoming');
  assert.equal(state.members.find(member => member.id === 'plain').relation, 'linked');
  assert.equal(state.members.find(member => member.id === 'echo').relation, 'semantic');
  assert.equal(state.explicitCount, 3);
  assert.equal(state.semanticCount, 1);
  assert.deepEqual(state.crossSpaceLabels, []);
});

test('local context reports borrowed sources without writing them into graph settings', async () => {
  const { startLocalContext } = await loadLocalContext();
  const graph = {
    nodes: [
      node('entry'),
      { ...node('remote'), _localContextProxy: { sourceKey: 'vault:note', sourceLabel: '课程笔记', canonicalNodeId: 'heading-1' } },
    ],
    edges: [{ source: 'entry', target: 'remote', relationType: 'cross-space-context', arrow: true }],
    groups: [],
    settings: { layoutMode: 'auto' },
  };
  const state = startLocalContext(graph, [], 'entry');
  assert.deepEqual(state.crossSpaceLabels, ['课程笔记']);
  assert.deepEqual(graph.settings, { layoutMode: 'auto' });
});

test('continuing from a visible card adds one bounded layer and Back is exact', async () => {
  const { startLocalContext, extendLocalContext, backLocalContext } = await loadLocalContext();
  const graph = {
    nodes: ['root', 'a', 'b', 'a1', 'a2', 'far'].map(node),
    edges: [
      { source: 'root', target: 'a', arrow: true },
      { source: 'root', target: 'b', arrow: true },
      { source: 'a', target: 'a1', arrow: true },
      { source: 'a', target: 'a2', arrow: true },
      { source: 'a2', target: 'far', arrow: true },
    ],
    groups: [],
  };
  const first = startLocalContext(graph, [], 'root');
  const second = extendLocalContext(graph, [], first, 'a');
  assert.deepEqual(second.path, ['root', 'a']);
  assert.equal(second.members.find(member => member.id === 'a').relation, 'outgoing');
  assert.equal(second.members.find(member => member.id === 'a').reason, '从这里出发');
  assert.ok(second.members.some(member => member.id === 'a1' && member.parentId === 'a'));
  assert.ok(second.members.some(member => member.id === 'a2' && member.parentId === 'a'));
  assert.equal(second.members.some(member => member.id === 'far'), false);
  const restored = backLocalContext(graph, [], second);
  assert.deepEqual(restored.path, ['root']);
  assert.deepEqual(restored.members.map(member => member.id), first.members.map(member => member.id));
});

test('local context caps breadth, total members, and path depth', async () => {
  const { startLocalContext, extendLocalContext } = await loadLocalContext();
  const ids = ['root', ...Array.from({ length: 12 }, (_, index) => `n${index}`)];
  const graph = {
    nodes: ids.map(node),
    edges: ids.slice(1).map((id, index) => ({ source: index === 0 ? 'root' : `n${index - 1}`, target: id, arrow: true })),
    groups: [],
  };
  const options = { maxPerStep: 2, maxMembers: 5, maxDepth: 3 };
  let state = startLocalContext(graph, [], 'root', options);
  state = extendLocalContext(graph, [], state, 'n0', options);
  state = extendLocalContext(graph, [], state, 'n1', options);
  const capped = extendLocalContext(graph, [], state, 'n2', options);
  assert.ok(capped.members.length <= 5);
  assert.ok(capped.path.length <= 3);
  assert.ok(capped.omittedCount >= 0);
});

test('local context remains pane view state and is wired through layout, navigation, and rendering', async () => {
  const [main, pane, storage, pixi, css] = await Promise.all([
    readFile(path.join(root, 'src', 'main.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'pane-state.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'data', 'storage.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'pixi-semantic-scene.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'workspace-ui.css'), 'utf8'),
  ]);
  assert.match(pane, /localContext: LocalContextState \| null/);
  assert.doesNotMatch(storage, /localContext/);
  assert.match(main, /for \(const member of localContext\?\.members \|\| \[\]\) localContextForms\[member\.id\] = 'card'/);
  assert.match(main, /openLocalContextForPane\(pane, id\)/);
  assert.match(main, /从这里继续展开上下文/);
  assert.match(main, /localContextInternalEdgeIndexes/);
  assert.match(main, /expandCrossSpaceLocalContextForPane/);
  assert.match(main, /isCrossSpaceProxyNode\(effectiveNode\(id\)\)/);
  assert.match(main, /function applyPrimaryPaneSettings\(settings\?: Partial<GraphSettings> \| null\)[\s\S]*?const s = \{ \.\.\.DEFAULT_SETTINGS, \.\.\.\(settings \|\| \{\}\) \}/);
  assert.match(pixi, /options\.localContext\.path/);
  assert.match(css, /\.fg-local-context-nav/);
  assert.match(css, /var\(--fg-text/);
});
