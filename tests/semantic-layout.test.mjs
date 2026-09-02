import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function importTypeScriptModule(filePath) {
  const source = await readFile(filePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

const graph = (nodes, edges = [], groups = []) => ({ nodes, edges, groups });

test('semantic layout uses hierarchy and heading information for stable layers', async () => {
  const { computeSemanticLayout } = await importTypeScriptModule(
    path.join(root, 'src', 'layouts', 'semantic.ts'),
  );
  const data = graph([
    { id: 'root', headingLevel: 1, createdOrder: 0 },
    { id: 'topic', headingLevel: 2, createdOrder: 1 },
    { id: 'detail', headingLevel: 3, createdOrder: 2 },
  ], [
    { source: 'root', target: 'topic', kind: 'hierarchy' },
    { source: 'topic', target: 'detail', kind: 'hierarchy' },
  ]);

  const result = computeSemanticLayout(data);
  const rootPosition = result.positions.get('root');
  const topicPosition = result.positions.get('topic');
  const detailPosition = result.positions.get('detail');
  assert.equal(rootPosition.strategy, 'layered');
  assert.ok(rootPosition.x < topicPosition.x);
  assert.ok(topicPosition.x < detailPosition.x);
  assert.deepEqual([rootPosition.rank, topicPosition.rank, detailPosition.rank], [0, 1, 2]);
});

test('semantic layout is deterministic and uses topology for non-hierarchical graphs', async () => {
  const { computeSemanticLayout } = await importTypeScriptModule(
    path.join(root, 'src', 'layouts', 'semantic.ts'),
  );
  const data = graph([
    { id: 'a', createdOrder: 0 },
    { id: 'b', createdOrder: 1 },
    { id: 'c', createdOrder: 2 },
    { id: 'd', createdOrder: 3 },
  ], [
    { source: 'a', target: 'b' },
    { source: 'b', target: 'c' },
    { source: 'c', target: 'd' },
    { source: 'd', target: 'a' },
  ]);
  const first = computeSemanticLayout(data);
  const second = computeSemanticLayout(JSON.parse(JSON.stringify(data)));
  const pick = result => [...result.positions].map(([id, p]) => [id, p.x, p.y, p.rank, p.strategy]);
  assert.deepEqual(pick(first), pick(second));
  assert.equal(first.positions.get('a').strategy, 'radial');
});

test('semantic layout packs components, respects explicit pins, and ignores manual offsets', async () => {
  const { computeSemanticLayout } = await importTypeScriptModule(
    path.join(root, 'src', 'layouts', 'semantic.ts'),
  );
  const base = graph([
    { id: 'pin', headingLevel: 1, createdOrder: 0, fixed: true, x: 420, y: -180 },
    { id: 'child', headingLevel: 2, createdOrder: 1 },
    { id: 'island', createdOrder: 2 },
  ], [{ source: 'pin', target: 'child', kind: 'hierarchy' }]);
  const first = computeSemanticLayout(base);
  assert.equal(first.componentCount, 2);
  assert.deepEqual(
    [first.positions.get('pin').x, first.positions.get('pin').y, first.positions.get('pin').pinned],
    [420, -180, true],
  );
  const childBefore = first.positions.get('child');
  base.nodes[1].layout = { offsetX: 36, offsetY: -24 };
  base.nodes[1].x = 9000;
  base.nodes[1].y = -7000;
  const second = computeSemanticLayout(base);
  const childAfter = second.positions.get('child');
  assert.deepEqual([childAfter.x, childAfter.y], [childBefore.x, childBefore.y]);
  assert.ok(Math.hypot(
    second.positions.get('island').x - childAfter.x,
    second.positions.get('island').y - childAfter.y,
  ) > 40);
});

test('semantic signature ignores coordinates but reacts to content and structure', async () => {
  const { semanticGraphSignature, SemanticLayoutController } = await importTypeScriptModule(
    path.join(root, 'src', 'layouts', 'semantic.ts'),
  );
  const data = graph([{ id: 'a', x: 1, y: 2, note: 'before' }, { id: 'b' }]);
  const initial = semanticGraphSignature(data);
  data.nodes[0].x = 999;
  assert.equal(semanticGraphSignature(data), initial);
  data.nodes[0].note = 'after';
  data.nodes[0].label = 'renamed';
  assert.notEqual(semanticGraphSignature(data), initial);
  const afterContent = semanticGraphSignature(data);
  data.nodes[0].layout = { offsetX: 4 };
  assert.equal(semanticGraphSignature(data), afterContent);

  let applies = 0;
  const controller = new SemanticLayoutController(() => data, () => { applies++; }, 0);
  data.nodes[0].note = 'content only';
  controller.onGraphChanged();
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(applies, 1);
  data.edges.push({ source: 'a', target: 'b' });
  controller.onGraphChanged();
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(applies, 2);
  controller.deactivate();
  data.edges.length = 0;
  controller.onGraphChanged();
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(applies, 2);
});

test('resource cards compose from transient source previews instead of stored path notes', async () => {
  const { computeSemanticLayout, semanticGraphSignature } = await importTypeScriptModule(
    path.join(root, 'src', 'layouts', 'semantic.ts'),
  );
  const node = {
    id: 'reference',
    label: '注意力机制',
    note: 'Markdown · 课程/人工智能/注意力.md',
    resourceRef: { provider: 'vault', version: 1, kind: 'markdown', path: '课程/人工智能/注意力.md' },
    _resourceReferencePreview: '查询与键的相关程度决定不同值的注意力权重',
  };
  const data = graph([node]);
  const result = computeSemanticLayout(data);
  assert.match(result.positions.get('reference').card.excerpt, /注意力权重/);
  assert.doesNotMatch(result.positions.get('reference').card.excerpt, /课程\//);
  const before = semanticGraphSignature(data);
  node._resourceReferencePreview = '多头注意力观察多个表示子空间';
  assert.notEqual(semanticGraphSignature(data), before);
});

test('semantic content creates useful regions without user tags or explicit edges', async () => {
  const { computeSemanticLayout } = await importTypeScriptModule(
    path.join(root, 'src', 'layouts', 'semantic.ts'),
  );
  const data = graph([
    { id: 'bp', label: '反向传播', note: '链式法则计算神经网络的梯度' },
    { id: 'gd', label: '梯度下降', note: '利用梯度更新神经网络参数' },
    { id: 'cards', label: '自动排列卡片', note: '二维笔记画布自动组织节点' },
    { id: 'overlap', label: '布局避让', note: '图布局应减少卡片和节点重叠' },
    { id: 'todo', label: '周五提交课程作业', note: '记得发给老师' },
    { id: 'private', label: '密码备忘', note: '邮箱密码 abc123' },
  ]);
  const result = computeSemanticLayout(data);
  assert.equal(result.positions.get('bp').component, result.positions.get('gd').component);
  assert.equal(result.positions.get('cards').component, result.positions.get('overlap').component);
  assert.notEqual(result.positions.get('private').component, result.positions.get('bp').component);
  assert.equal(result.positions.get('todo').card.kind, 'task');
  assert.equal(result.positions.get('private').card.kind, 'private');
  assert.equal(result.positions.get('private').card.excerpt, '敏感内容不参与语义分析');
  assert.ok(result.regions.length >= 2);
  const learningEcho = result.echoes.find(echo => new Set([echo.source, echo.target]).has('bp')
    && new Set([echo.source, echo.target]).has('gd'));
  assert.ok(learningEcho);
  assert.ok(learningEcho.reason.length > 0);
  assert.ok(learningEcho.terms.includes('梯度') || learningEcho.reason.includes('语义'));
});

test('broad artificial-intelligence domain resolves into course-level topic regions', async () => {
  const { computeSemanticLayout } = await importTypeScriptModule(
    path.join(root, 'src', 'layouts', 'semantic.ts'),
  );
  const shared = '人工智能专业课程：';
  const data = graph([
    { id: 'ml1', label: '反向传播', note: `${shared}神经网络使用链式法则计算梯度` },
    { id: 'ml2', label: '梯度下降', note: `${shared}梯度优化模型参数与学习率` },
    { id: 'ml3', label: '激活函数', note: `${shared}神经网络梯度与非线性激活` },
    { id: 'cv1', label: '图像分类', note: `${shared}卷积提取图像特征完成分类` },
    { id: 'cv2', label: '图像分割', note: `${shared}计算机视觉处理像素区域` },
    { id: 'cv3', label: '卷积特征', note: `${shared}图像卷积与视觉特征表示` },
    { id: 'pr1', label: '随机变量', note: `${shared}概率分布的期望与方差` },
    { id: 'pr2', label: '条件概率', note: `${shared}贝叶斯公式与条件分布` },
    { id: 'pr3', label: '概率分布', note: `${shared}随机变量概率与方差` },
  ], [
    { source: 'ml1', target: 'ml2', label: '机器学习课程内部关系' },
    { source: 'ml2', target: 'ml3', label: '机器学习课程内部关系' },
    { source: 'ml2', target: 'cv1', label: '课程之间的应用联系' },
    { source: 'cv1', target: 'cv2', label: '视觉课程内部关系' },
    { source: 'cv2', target: 'cv3', label: '视觉课程内部关系' },
    { source: 'cv2', target: 'pr1', label: '课程之间的数学联系' },
    { source: 'pr1', target: 'pr2', label: '概率课程内部关系' },
    { source: 'pr2', target: 'pr3', label: '概率课程内部关系' },
  ]);

  const result = computeSemanticLayout(data);
  const domains = result.regions.filter(region => region.level === 'domain');
  const topics = result.regions.filter(region => region.level === 'topic');
  assert.equal(domains.length, 1);
  assert.equal(domains[0].nodeIds.length, 9);
  assert.ok(topics.length >= 3);
  assert.equal(result.positions.get('ml1').component, result.positions.get('ml2').component);
  assert.equal(result.positions.get('ml2').component, result.positions.get('ml3').component);
  assert.equal(result.positions.get('cv1').component, result.positions.get('cv2').component);
  assert.equal(result.positions.get('cv2').component, result.positions.get('cv3').component);
  assert.equal(result.positions.get('pr1').component, result.positions.get('pr2').component);
  assert.equal(result.positions.get('pr2').component, result.positions.get('pr3').component);
  assert.notEqual(result.positions.get('ml2').component, result.positions.get('cv1').component);
  assert.notEqual(result.positions.get('cv2').component, result.positions.get('pr1').component);
  assert.ok(topics.some(region => /学习|激活|梯度|神经网络|反向传播|激活函数|链式法则/.test(region.label)));
  assert.ok(topics.some(region => /图像|视觉|卷积/.test(region.label)));
  assert.ok(topics.some(region => /概率|随机变量|分布/.test(region.label)));
});

test('semantic echoes remain tentative and explicit edges take authority', async () => {
  const { computeSemanticLayout } = await importTypeScriptModule(
    path.join(root, 'src', 'layouts', 'semantic.ts'),
  );
  const data = graph([
    { id: 'a', label: '梯度下降学习率', note: '梯度决定参数更新方向' },
    { id: 'b', label: '反向传播梯度', note: '梯度通过链式法则传递' },
  ]);
  const tentative = computeSemanticLayout(data);
  assert.equal(tentative.echoes.length, 1);
  assert.equal(tentative.echoes[0].kind, 'lexical');
  data.edges.push({ source: 'a', target: 'b', label: '课程前置关系' });
  const explicit = computeSemanticLayout(data);
  assert.equal(explicit.echoes.length, 0);
});

test('semantic cards can collapse into compact nodes without overlap', async () => {
  const { computeSemanticLayout, stabilizeSemanticLayout } = await importTypeScriptModule(
    path.join(root, 'src', 'layouts', 'semantic.ts'),
  );
  const data = graph([
    { id: 'a', label: '短想法' },
    { id: 'b', label: '完整笔记', note: '这是一段需要保持展开阅读的正文内容' },
  ]);
  const collapsedNodeIds = new Set(['a']);
  const ideal = computeSemanticLayout(data, { collapsedNodeIds });
  assert.deepEqual(
    [
      ideal.positions.get('a').card.form,
      ideal.positions.get('a').card.width,
      ideal.positions.get('a').card.height,
      ideal.positions.get('a').card.nodeRadius,
    ],
    ['node', 55, 58, 7],
  );
  assert.equal(ideal.positions.get('b').card.form, 'card');
  const stable = stabilizeSemanticLayout(data, ideal, undefined);
  assert.equal(stable.memory.nodes.a.form, 'node');
  const a = stable.result.positions.get('a'), b = stable.result.positions.get('b');
  assert.ok(Math.abs(a.x - b.x) >= (a.card.width + b.card.width) / 2
    || Math.abs(a.y - b.y) >= (a.card.height + b.card.height) / 2);
});

test('optional dense vectors refine meaning while deterministic placement prevents card overlap', async () => {
  const { computeSemanticLayout } = await importTypeScriptModule(
    path.join(root, 'src', 'layouts', 'semantic.ts'),
  );
  const data = graph([
    { id: 'a', label: '甲', note: '完全不同的字面内容一' },
    { id: 'b', label: '乙', note: '另一段看似无关的文本二' },
    { id: 'c', label: '丙', note: '第三种没有词汇交集的记录' },
    { id: 'd', label: '丁', note: '第四种独立表达' },
  ]);
  const semanticVectors = new Map([
    ['a', [1, 0, 0]], ['b', [0.99, 0.02, 0]],
    ['c', [0, 1, 0]], ['d', [0, 0.99, 0.02]],
  ]);
  const result = computeSemanticLayout(data, { semanticVectors });
  assert.equal(result.positions.get('a').component, result.positions.get('b').component);
  assert.equal(result.positions.get('c').component, result.positions.get('d').component);
  assert.notEqual(result.positions.get('a').component, result.positions.get('c').component);

  const positions = [...result.positions.values()];
  for (let left = 0; left < positions.length; left++) {
    for (let right = left + 1; right < positions.length; right++) {
      const a = positions[left], b = positions[right];
      const separated = Math.abs(a.x - b.x) >= (a.card.width + b.card.width) / 2
        || Math.abs(a.y - b.y) >= (a.card.height + b.card.height) / 2;
      assert.equal(separated, true);
    }
  }
});

test('semantic layout memory is inertial, local, and never learns manual drag coordinates', async () => {
  const { computeSemanticLayout, stabilizeSemanticLayout } = await importTypeScriptModule(
    path.join(root, 'src', 'layouts', 'semantic.ts'),
  );
  const data = graph([
    { id: 'a1', label: '微积分导数', note: '课程知识点：链式法则', createdOrder: 0 },
    { id: 'a2', label: '梯度下降', note: '用导数更新模型参数', createdOrder: 1 },
    { id: 'a3', label: '反向传播', note: '神经网络中的梯度计算', createdOrder: 2 },
    { id: 'b1', label: '周末采购', note: '买牛奶和面包', createdOrder: 3 },
    { id: 'b2', label: '整理房间', note: '把书架上的杂物收好', createdOrder: 4 },
    { id: 'b3', label: '洗衣提醒', note: '周六清洗床单', createdOrder: 5 },
  ], [
    { source: 'a1', target: 'a2' }, { source: 'a2', target: 'a3' },
    { source: 'b1', target: 'b2' }, { source: 'b2', target: 'b3' },
  ]);
  const initial = stabilizeSemanticLayout(data, computeSemanticLayout(data), undefined);
  const original = new Map([...initial.result.positions].map(([id, point]) => [id, { x: point.x, y: point.y }]));

  // A freehand drag remains a temporary view operation; history is the source
  // of inertia, not graph node x/y.
  data.nodes[0].x = 9000;
  data.nodes[0].y = -7000;
  const afterDrag = stabilizeSemanticLayout(data, computeSemanticLayout(data), initial.memory);
  assert.ok(Math.hypot(
    afterDrag.result.positions.get('a1').x - original.get('a1').x,
    afterDrag.result.positions.get('a1').y - original.get('a1').y,
  ) < 0.01);
  assert.notEqual(afterDrag.memory.nodes.a1.x, 9000);
  assert.equal(afterDrag.memory.nodes.a1.stability, 1);

  data.nodes.push({
    id: 'a4', label: '学习率直觉', note: '梯度下降步长太大会震荡', createdOrder: 6,
  });
  data.edges.push({ source: 'a2', target: 'a4' });
  const newIdeal = computeSemanticLayout(data);
  const incremental = stabilizeSemanticLayout(data, newIdeal, afterDrag.memory);
  assert.deepEqual(incremental.newNodeIds, ['a4']);
  assert.equal(incremental.globalReframe, false);

  // The unrelated household region keeps its established geometry while the
  // new learning card finds space in the affected region.
  for (const id of ['b1', 'b2', 'b3']) {
    assert.ok(Math.hypot(
      incremental.result.positions.get(id).x - original.get(id).x,
      incremental.result.positions.get(id).y - original.get(id).y,
    ) < 1);
  }
  assert.ok(Math.hypot(
    incremental.result.positions.get('a4').x - incremental.result.positions.get('a2').x,
    incremental.result.positions.get('a4').y - incremental.result.positions.get('a2').y,
  ) < 700);

  const positions = [...incremental.result.positions.values()];
  for (let left = 0; left < positions.length; left++) {
    for (let right = left + 1; right < positions.length; right++) {
      const a = positions[left], b = positions[right];
      const separated = Math.abs(a.x - b.x) >= (a.card.width + b.card.width) / 2 + 11
        || Math.abs(a.y - b.y) >= (a.card.height + b.card.height) / 2 + 11;
      assert.equal(separated, true);
    }
  }
});

test('dense refinement can reposition provisional cards without a global reframe', async () => {
  const { computeSemanticLayout, stabilizeSemanticLayout } = await importTypeScriptModule(
    path.join(root, 'src', 'layouts', 'semantic.ts'),
  );
  const data = graph([
    { id: 'a', label: '窗台春风', note: '树叶轻轻摇晃', createdOrder: 0 },
    { id: 'b', label: '量子测量', note: '纠缠态发生坍缩', createdOrder: 1 },
    { id: 'c', label: '黄油烘焙', note: '控制面团含水比例', createdOrder: 2 },
  ]);
  const lexical = stabilizeSemanticLayout(data, computeSemanticLayout(data), undefined, 'lexical');
  const vectors = new Map([
    ['a', [1, 0]], ['b', [0.99, 0.01]], ['c', [0, 1]],
  ]);
  const dense = stabilizeSemanticLayout(data, computeSemanticLayout(data, { semanticVectors: vectors }), lexical.memory, 'dense');
  assert.equal(dense.memory.source, 'dense');
  assert.equal(dense.globalReframe, false);
  assert.ok(dense.movedNodeIds.length >= 1);
});

test('semantic layout memory survives a clean graph snapshot', async () => {
  const { serializeGraphSnapshot } = await importTypeScriptModule(
    path.join(root, 'src', 'graph-snapshot.ts'),
  );
  const memory = {
    version: 1,
    source: 'dense',
    nodes: {
      a: { x: 12, y: -8, fingerprint: 'fp', componentKey: 'c-a', stability: 4 },
    },
  };
  const snapshot = JSON.parse(serializeGraphSnapshot({
    nodes: [{ id: 'a', x: 999, _semanticCard: { width: 200 } }],
    edges: [],
    groups: [],
    settings: { semanticLayoutMemory: memory },
  }));
  assert.deepEqual(snapshot.settings.semanticLayoutMemory, memory);
  assert.equal(snapshot.nodes[0]._semanticCard, undefined);
});

test('application defaults to auto, opportunistically uses local Qwen, and keeps force optional', async () => {
  const main = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');
  const paneState = await readFile(path.join(root, 'src', 'pane-state.ts'), 'utf8');
  const mcp = await readFile(path.join(root, 'mcp-server', 'server.js'), 'utf8');
  const embeddings = await readFile(path.join(root, 'src', 'semantic-embeddings.ts'), 'utf8');
  assert.match(main, /layoutMode: 'auto'/);
  assert.match(paneState, /layoutMode: 'auto'/);
  assert.match(main, /mkPill\('自动整理', 'auto'/);
  assert.match(main, /mkPill\('自由（力导向）', 'force'/);
  assert.match(main, /computeSemanticLayout\(targetGraph, \{ semanticVectors, collapsedNodeIds \}\)/);
  assert.match(main, /stabilizeSemanticLayout/);
  assert.match(main, /semanticLayoutMemory/);
  assert.match(main, /LocalSemanticEmbeddingProvider/);
  assert.match(main, /自动整理.*张展开/);
  assert.doesNotMatch(main, /pill\.textContent = .*Qwen/);
  assert.match(main, /semanticCardDensity/);
  assert.match(main, /label: '自适应'/);
  assert.match(main, /computeSemanticLens/);
  assert.match(main, /refreshSemanticLensForPane/);
  assert.match(main, /收束为节点/);
  assert.match(main, /echoes: result\.echoes/);
  assert.match(embeddings, /127\.0\.0\.1:1234\/v1/);
  assert.match(embeddings, /qwen3\[-_ \]embedding/i);
  assert.match(embeddings, /isSensitiveSemanticText\(text\)/);
  const semanticSection = main.slice(
    main.indexOf('const applySemanticPositions'),
    main.indexOf('activateSemanticLayoutForPane ='),
  );
  assert.match(semanticSection, /targetSimManager\.initStatic/);
  assert.doesNotMatch(semanticSection, /targetSimManager\.initSim/);
  assert.match(semanticSection, /if \(fitAfter\)/);
  assert.doesNotMatch(semanticSection, /if \(!animate \|\| fitAfter\)/);
  assert.match(main, /applySemanticPositions\(targetPane, true, vectors, false, false\)/);
  assert.match(main, /returnToSemanticPosition/);
  assert.match(main, /activateSemanticLayoutForPane\(pi, true\)/);
  assert.doesNotMatch(main, /graphNode\.layout\s*=/);
  assert.doesNotMatch(mcp, /自动布局相对偏移/);
});
