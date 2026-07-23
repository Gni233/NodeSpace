import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(root, 'src', 'text-view');

async function loadTextView() {
  const files = ['types.ts', 'syntax.ts', 'properties.ts', 'aliases.ts', 'parser.ts', 'compiler.ts', 'printer.ts', 'index.ts'];
  const urls = new Map();
  for (const file of files) {
    let source = await readFile(path.join(sourceRoot, file), 'utf8');
    for (const [prior, url] of urls) {
      const specifier = `./${prior.replace(/\.ts$/, '')}`;
      source = source.replaceAll(`from '${specifier}'`, `from '${url}'`);
      source = source.replaceAll(`from "${specifier}"`, `from '${url}'`);
    }
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    urls.set(file, `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
  }
  return import(urls.get('index.ts'));
}

const api = await loadTextView();

test('scanner handles quotes, escapes, comments, and preserves spaces beyond the first separator pair', () => {
  const scanned = api.scanLine('名字    三级  "含  双空格 ## 与 \\"引号\\""  ## 注释', 7);
  assert.deepEqual(scanned.fields.map(field => field.value), ['名字', '  三级', '含  双空格 ## 与 "引号"']);
  assert.deepEqual(scanned.fields[1].range.start, { line: 7, column: 5 });
  assert.equal(scanned.diagnostics.length, 0);
});

test('parser applies deterministic note and edge label rules and reports extra unknown fields', () => {
  const parsed = api.parseTextGraph(`示例图\n甲@a  一段笔记  三级\n乙@b\n-  甲@a  乙@b  关系  箭头\n集合@g  流体 {甲@a  乙@b}\n设置\n连线距离  42`);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ast.name, '示例图');
  assert.equal(parsed.ast.nodes[0].note, '一段笔记');
  assert.equal(parsed.ast.nodes[0].properties[0].key, 'headingLevel');
  assert.equal(parsed.ast.edges[0].label, '关系');
  assert.equal(parsed.ast.groups[0].members.length, 2);
  assert.equal(parsed.ast.settings[0].key, 'linkDist');
  assert.equal(parsed.ast.settings[0].value, 42);

  const quotedKeywords = api.parseTextGraph('图\n"设置"\n"-"');
  assert.equal(quotedKeywords.ok, true);
  assert.deepEqual(quotedKeywords.ast.nodes.map(node => node.label), ['设置', '-']);

  const invalid = api.parseTextGraph('图\n节点  第一段  第二段');
  assert.equal(invalid.ok, false);
  assert.equal(invalid.diagnostics[0].code, 'INVALID_PROPERTY');
  assert.deepEqual(invalid.diagnostics[0].range.start, { line: 2, column: 10 });
});

test('compiler resolves aliases, rejects ambiguous labels, and never returns a modified graph on errors', () => {
  const original = { nodes: [{ id: 'keep', label: '原名', x: 12, y: 18, createdOrder: 3 }], edges: [], groups: [] };
  const bad = api.compileTextGraph('图\n同名@a\n同名@b\n-  同名  同名', original);
  assert.equal(bad.ok, false);
  assert.equal(bad.graph, undefined);
  assert.equal(original.nodes[0].label, '原名');
  assert.equal(bad.diagnostics.filter(item => item.code === 'AMBIGUOUS_REFERENCE').length, 2);

  const good = api.compileTextGraph('图\n同名@a\n同名@b\n-  同名@a  同名@b', original);
  assert.equal(good.ok, true);
  assert.deepEqual(good.graph.edges[0], {
    source: 'a', target: 'b', label: '', color: '#BFBFBF', arrow: false,
  });
});

test('overlay preserves matching entity metadata and removes omitted semantic entities', () => {
  const original = {
    nodes: [
      { id: 'a', label: '旧甲', x: 10, y: 20, fx: 10, createdOrder: 7, custom: { nested: true }, color: '#f00', tags: ['旧组'] },
      { id: 'b', label: '乙', x: 30, y: 40, createdOrder: 8, collapsed: true },
      { id: 'gone', label: '删除', x: 1, y: 2 },
    ],
    edges: [{ source: 'a', target: 'b', label: '旧边', customEdge: { width: 2 } }],
    groups: [{ id: 'g', label: '旧组', customGroup: { shape: 'x' } }],
    topLevelUnknown: { kept: true },
  };
  const text = '图\n新甲@a  新笔记\n乙@b\n-  新甲@a  乙@b  旧边\n新组@g {新甲@a}';
  const result = api.compileTextGraph(text, original);
  assert.equal(result.ok, true);
  assert.equal(result.graphName, '图');
  assert.equal(result.graph.nodes.length, 2);
  assert.deepEqual(result.graph.nodes[0].custom, { nested: true });
  assert.equal(result.graph.nodes[0].x, 10);
  assert.equal(result.graph.nodes[0].createdOrder, 7);
  assert.equal(result.graph.nodes[0].note, '新笔记');
  assert.equal(result.graph.nodes[0].color, undefined);
  assert.equal(result.graph.nodes[1].collapsed, undefined);
  assert.deepEqual(result.graph.edges[0].customEdge, { width: 2 });
  assert.deepEqual(result.graph.groups[0].customGroup, { shape: 'x' });
  assert.deepEqual(result.graph.nodes[0].tags, ['新组']);
  assert.deepEqual(result.graph.nodes[1].tags, []);
  assert.deepEqual(result.graph.topLevelUnknown, { kept: true });
});

test('printer explicitly round-trips unknown and nested semantic fields with stable aliases', () => {
  const graph = {
    nodes: [
      { id: 'node id/1', label: '甲  节点', note: '内容 ## 保留', x: 9, y: 8, createdOrder: 4, structure: { memberIds: ['b'], collapsed: true }, custom: ['x', { y: 2 }], tags: ['集合'] },
      { id: 'b', label: '乙', x: 3, y: 4, createdOrder: 5, tags: ['集合'] },
    ],
    edges: [{ source: 'node id/1', target: 'b', label: '连接', metadata: { score: 1 } }],
    groups: [{ id: 'group/id', label: '集合', customGroup: { alpha: 0.2 } }],
    settings: { linkDist: 30, cardViews: { card: { scale: 2, offsetX: 1, offsetY: 3 } }, unknownSetting: ['a'] },
  };
  const first = api.printTextGraph(graph, { graphName: '往返图' });
  const second = api.printTextGraph(graph, { graphName: '往返图' });
  assert.equal(first, second);
  assert.match(first, /structure=\{"memberIds":\["b"\],"collapsed":true\}/);
  assert.match(first, /customGroup=\{"alpha":0\.2\}/);
  assert.match(first, /卡片视图  \{"card":\{"scale":2,"offsetX":1,"offsetY":3\}\}/);

  const compiled = api.compileTextGraph(first, graph);
  assert.equal(compiled.ok, true, compiled.diagnostics.map(item => item.message).join('\n'));
  assert.deepEqual(compiled.graph.nodes[0].structure, graph.nodes[0].structure);
  assert.deepEqual(compiled.graph.nodes[0].custom, graph.nodes[0].custom);
  assert.deepEqual(compiled.graph.edges[0].metadata, graph.edges[0].metadata);
  assert.deepEqual(compiled.graph.groups[0].customGroup, graph.groups[0].customGroup);
  assert.deepEqual(compiled.graph.settings, graph.settings);
});

test('explicit content fields preserve values that resemble inferred properties', () => {
  const graph = {
    nodes: [{ id: 'a', label: '节点', content: '三级', x: 0, y: 0 }],
    edges: [{ source: 'a', target: 'a', label: '箭头' }],
    groups: [],
  };
  const text = api.printTextGraph(graph, '图');
  assert.match(text, /content="三级"/);
  assert.match(text, /label="箭头"/);
  const result = api.compileTextGraph(text, graph);
  assert.equal(result.ok, true);
  assert.equal(result.graph.nodes[0].content, '三级');
  assert.equal(result.graph.edges[0].label, '箭头');
});

test('invalid JSON and malformed syntax carry one-based line and column diagnostics', () => {
  const result = api.compileTextGraph('图\n节点  custom={bad}\n-  节点\n未闭合 {节点');
  assert.equal(result.ok, false);
  const json = result.diagnostics.find(item => item.code === 'INVALID_JSON');
  const edge = result.diagnostics.find(item => item.code === 'INVALID_EDGE');
  const brace = result.diagnostics.find(item => item.code === 'UNCLOSED_BRACE');
  assert.deepEqual(json.range.start, { line: 2, column: 5 });
  assert.deepEqual(edge.range.start, { line: 3, column: 1 });
  assert.deepEqual(brace.range.start, { line: 4, column: 5 });
});
