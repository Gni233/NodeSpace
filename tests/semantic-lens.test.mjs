import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadLens() {
  const source = await readFile(path.join(root, 'src', 'semantic-lens.ts'), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

const nodes = Array.from({ length: 12 }, (_, index) => ({
  id: `n${index}`,
  label: index === 0 ? '核心概念' : `随笔 ${index}`,
  note: index % 3 === 0 ? '一段较完整的观察和推理内容'.repeat(index + 1) : '',
  headingLevel: index === 0 ? 1 : index < 4 ? 3 : 5,
  createdOrder: index,
}));

test('semantic lens zoom bands use hysteresis instead of flickering at one threshold', async () => {
  const { resolveSemanticLensBand } = await loadLens();
  assert.equal(resolveSemanticLensBand(0.5), 'overview');
  assert.equal(resolveSemanticLensBand(0.6, 'overview'), 'overview');
  assert.equal(resolveSemanticLensBand(0.65, 'overview'), 'balanced');
  assert.equal(resolveSemanticLensBand(1.08, 'balanced'), 'balanced');
  assert.equal(resolveSemanticLensBand(1.13, 'balanced'), 'reading');
  assert.equal(resolveSemanticLensBand(0.9, 'reading'), 'reading');
  assert.equal(resolveSemanticLensBand(0.85, 'reading'), 'balanced');
});

test('adaptive lens prioritizes focus, explicit neighbors, and semantic echoes within a budget', async () => {
  const { computeSemanticLens } = await loadLens();
  const edges = [{ source: 'n4', target: 'n5' }];
  const echoes = [{ source: 'n4', target: 'n7', score: 0.82, kind: 'hybrid', reason: '共同线索', terms: [] }];
  const decision = computeSemanticLens({
    nodes,
    edges,
    echoes,
    density: 'mixed',
    zoom: 0.75,
    viewportWidth: 960,
    viewportHeight: 640,
    focusNodeId: 'n4',
  });
  assert.equal(decision.band, 'balanced');
  assert.ok(decision.expandedNodeIdsSet.has('n4'));
  assert.ok(decision.expandedNodeIdsSet.has('n5'));
  assert.ok(decision.expandedNodeIdsSet.has('n7'));
  assert.equal(decision.expandedNodeIds.length, decision.budget);
  assert.equal(decision.collapsedNodeIds.size + decision.expandedNodeIds.length, nodes.length);
});

test('manual forms remain authoritative while map stays an absolute overview', async () => {
  const { computeSemanticLens } = await loadLens();
  const source = JSON.parse(JSON.stringify(nodes));
  const before = JSON.stringify(source);
  const adaptive = computeSemanticLens({
    nodes: source,
    density: 'mixed',
    zoom: 0.3,
    manualForms: { n0: 'node', n11: 'card' },
  });
  assert.equal(adaptive.expandedNodeIdsSet.has('n0'), false);
  assert.equal(adaptive.expandedNodeIdsSet.has('n11'), true);

  const reading = computeSemanticLens({ nodes: source, density: 'full', manualForms: { n0: 'node' } });
  assert.equal(reading.expandedNodeIds.length, source.length - 1);
  const map = computeSemanticLens({ nodes: source, density: 'nodes', manualForms: { n11: 'card' } });
  assert.deepEqual(map.expandedNodeIds, []);
  assert.equal(JSON.stringify(source), before);
});

test('previous cards get stability without overriding a new focus', async () => {
  const { computeSemanticLens } = await loadLens();
  const first = computeSemanticLens({ nodes, density: 'mixed', zoom: 0.75, focusNodeId: 'n1' });
  const second = computeSemanticLens({ nodes, density: 'mixed', zoom: 0.76, focusNodeId: 'n10', previous: first });
  assert.equal(second.band, first.band);
  assert.ok(second.expandedNodeIdsSet.has('n10'));
  assert.equal(second.expandedNodeIds.length, second.budget);
});
