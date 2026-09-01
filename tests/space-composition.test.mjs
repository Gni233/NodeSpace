import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadModule() {
  const source = await readFile(path.join(root, 'src', 'space-composition.ts'), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

const sourceGraph = () => ({
  nodes: [
    { id: 'a', label: '注意力机制', note: '查询与键共同决定对值的关注权重', tags: ['AI'], x: 0, y: 0 },
    { id: 'b', label: '期末复习', note: '重看课件', x: 120, y: 20 },
    { id: 'c', label: '买牛奶', note: '', x: 20, y: 130 },
  ],
  edges: [
    { source: 'a', target: 'b', label: '用于' },
    { source: 'a', target: 'c', label: '无关' },
  ],
  groups: [],
  settings: {},
});

test('the same canonical node can have independent occurrences in many spaces', async () => {
  const model = await loadModule();
  const source = sourceGraph().nodes[0];
  const reference = model.createNodeSpaceReference('课程/人工智能.json', source);
  const left = model.createSpaceReferenceNode(reference, source, { x: 10, y: 20 }, 'left');
  const right = model.createSpaceReferenceNode(reference, source, { x: 800, y: -40 }, 'right');
  assert.equal(model.spaceReferenceKey(left.spaceRef), model.spaceReferenceKey(right.spaceRef));
  assert.notEqual(left.id, right.id);
  assert.deepEqual([left.x, left.y], [10, 20]);
  assert.deepEqual([right.x, right.y], [800, -40]);
  assert.equal(left.note, '');
  assert.equal(left.spaceRef.nodeId, 'a');
});

test('a saved fragment remains a live subset with only internal relations', async () => {
  const model = await loadModule();
  const graph = sourceGraph();
  const fragment = model.createSpaceFragment(graph, ['a', 'b', 'missing', 'a'], '注意力复习', { id: 'frag_1', now: 42 });
  assert.deepEqual(fragment.nodeIds, ['a', 'b']);
  assert.equal(graph.settings.spaceFragments.frag_1.createdAt, 42);

  const reference = model.createFragmentSpaceReference('课程/人工智能.json', fragment);
  const resolved = model.resolveSpaceReference(reference, graph);
  assert.equal(resolved.status, 'ok');
  assert.deepEqual(resolved.nodeIds, ['a', 'b']);
  assert.equal(resolved.edges.length, 1);
  assert.match(resolved.preview, /2 个节点 · 1 条线/);
  assert.equal(resolved.miniMap.points.length, 2);
  assert.equal(resolved.miniMap.points[0].label, '注意力机制');
});

test('whole-space and node portals resolve into path-free, transient card summaries', async () => {
  const model = await loadModule();
  const graph = sourceGraph();
  const portalRef = model.createWholeSpaceReference('课程/人工智能.json');
  const portal = model.createSpaceReferenceNode(portalRef, {}, { x: 0, y: 0 }, 'portal');
  model.hydrateSpaceReferenceNode(portal, model.resolveSpaceReference(portalRef, graph));
  assert.equal(portal._spaceReferenceStatus, 'ok');
  assert.match(portal._spaceReferencePreview, /3 个节点 · 2 条线/);
  assert.doesNotMatch(portal._spaceReferencePreview, /课程\//);

  const nodeRef = model.createNodeSpaceReference('课程/人工智能.json', graph.nodes[0]);
  const occurrence = model.createSpaceReferenceNode(nodeRef, graph.nodes[0], { x: 0, y: 0 }, 'occurrence');
  graph.nodes[0].note = '源内容已经变化';
  model.hydrateSpaceReferenceNode(occurrence, model.resolveSpaceReference(nodeRef, graph));
  assert.equal(occurrence._spaceReferencePreview, '源内容已经变化');
  assert.equal(occurrence.note, '');
});

test('missing targets are explicit and navigation cycles are guarded', async () => {
  const model = await loadModule();
  const missing = model.createNodeSpaceReference('知识.json', { id: 'gone', label: '失踪节点' });
  const resolved = model.resolveSpaceReference(missing, sourceGraph());
  assert.equal(resolved.status, 'broken');
  assert.match(resolved.preview, /不可用/);
  assert.equal(model.navigationWouldCycle(['主页.json', '课程/人工智能.json'], '课程\\人工智能.json'), true);
  assert.equal(model.navigationWouldCycle(['主页.json'], '灵感.json'), false);
});

test('renaming a graph or graph folder rewrites node and relation pointers', async () => {
  const model = await loadModule();
  const graph = {
    nodes: [{ id: 'portal', spaceRef: model.createWholeSpaceReference('课程/人工智能.json') }],
    edges: [{ source: 'x', target: 'y', spaceRelationRef: { provider: 'nodespace', version: 1, graph: '课程/人工智能.json' } }],
    groups: [],
  };
  assert.equal(model.rewriteSpaceReferenceGraphIds(graph, '课程', '归档/课程'), 2);
  assert.equal(graph.nodes[0].spaceRef.graph, '归档/课程/人工智能.json');
  assert.equal(graph.edges[0].spaceRelationRef.graph, '归档/课程/人工智能.json');
});

test('desktop wiring exposes share, fragment, portal, preview, nested return, and local occurrence semantics', async () => {
  const [main, pixi, semantic, storage, pane] = await Promise.all([
    readFile(path.join(root, 'src', 'main.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'pixi-nodes.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'layouts', 'semantic.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'data', 'storage.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'pane-state.ts'), 'utf8'),
  ]);
  assert.match(main, /共享所选到其他空间/);
  assert.match(main, /将所选作为整体入口/);
  assert.match(main, /将当前空间作为入口/);
  assert.match(main, /placeSpaceReferencesInGraph/);
  assert.match(main, /showSpaceReferencePreview/);
  assert.match(main, /openSpaceReferenceTarget/);
  assert.match(main, /referenceJourneys = new Map<number, ReferenceJourneyState\[\]>/);
  assert.match(main, /referenceNavigationInFlight = new Set<number>/);
  assert.match(main, /!referenceNavigationInFlight\.has\(focusedPaneIndex\)/);
  assert.match(main, /从当前空间移除/);
  assert.match(main, /可拖动、连线或删除，双击进入本体编辑/);
  assert.match(main, /navigationWouldCycle/);
  assert.match(pixi, /spaceReferenceMiniMap/);
  assert.match(pixi, /resourceKind === 'space' \|\| resourceKind === 'fragment'/);
  assert.match(semantic, /_spaceReferencePreview/);
  assert.match(storage, /spaceFragments\?: Record<string, SpaceFragmentDefinition>/);
  assert.match(pane, /spaceFocusNodeIds: string\[\] \| null/);
});
