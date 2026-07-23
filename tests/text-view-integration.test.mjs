import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function transpiledModule(filePath, replacements = new Map()) {
  let source = await readFile(filePath, 'utf8');
  for (const [specifier, url] of replacements) {
    source = source.replaceAll(`from '${specifier}'`, `from '${url}'`);
    source = source.replaceAll(`from "${specifier}"`, `from '${url}'`);
  }
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
}

async function loadRuntime() {
  const graphRuntimeUrl = await transpiledModule(path.join(root, 'src', 'graph-runtime.ts'));
  return import(graphRuntimeUrl);
}

async function loadEditorController() {
  const sourceRoot = path.join(root, 'src', 'text-view');
  const files = ['types.ts', 'syntax.ts', 'properties.ts', 'aliases.ts', 'parser.ts', 'compiler.ts', 'printer.ts', 'editor.ts'];
  const urls = new Map();
  for (const file of files) {
    const replacements = new Map();
    for (const [prior, url] of urls) replacements.set(`./${prior.replace(/\.ts$/, '')}`, url);
    urls.set(file, await transpiledModule(path.join(sourceRoot, file), replacements));
  }
  return import(urls.get('editor.ts'));
}

const { GraphRuntime } = await loadRuntime();
const { TextViewEditorController } = await loadEditorController();

test('shared runtime text lock stops simulation and blocks other pane owners', () => {
  let stops = 0;
  const owner = {};
  const otherPane = {};
  const runtime = new GraphRuntime('folder/图.json', { nodes: [], edges: [], groups: [] }, null);
  runtime.simManager = { getSim: () => ({ stop: () => { stops++; } }) };
  runtime.attach(owner);
  runtime.attach(otherPane);

  assert.equal(runtime.beginTextEdit(owner), true);
  assert.equal(stops, 1);
  assert.equal(runtime.textEditActive, true);
  assert.equal(runtime.canInteract(owner), true);
  assert.equal(runtime.canInteract(otherPane), false);
  assert.equal(runtime.beginTextEdit(otherPane), false);

  runtime.endTextEdit(owner);
  assert.equal(runtime.textEditActive, false);
  assert.equal(runtime.canInteract(otherPane), true);
});

test('successful exit applies in place once, repairs order, rebuilds, dirties, and resumes', async () => {
  const graph = {
    nodes: [{ id: 'kept', label: '保留', x: 3, y: 4, createdOrder: 8 }],
    edges: [],
    groups: [],
    settings: { charge: -100 },
  };
  const refs = { graph, nodes: graph.nodes, edges: graph.edges, groups: graph.groups };
  const calls = { pause: 0, resume: 0, undo: 0, rebuild: 0, dirty: 0, draw: 0, save: 0 };
  const controller = new TextViewEditorController({
    getGraph: () => graph,
    getGraphName: () => 'folder/图',
    pauseSimulation: () => { calls.pause++; },
    resumeSimulation: () => { calls.resume++; },
    applyGraph: compiled => {
      calls.undo++;
      graph.nodes.length = 0;
      graph.nodes.push(...compiled.nodes);
      graph.nodes.forEach((node, index) => {
        if (!Number.isSafeInteger(node.createdOrder) || node.createdOrder < 0) node.createdOrder = index;
      });
      graph.edges.length = 0;
      graph.edges.push(...compiled.edges);
      graph.groups.length = 0;
      graph.groups.push(...compiled.groups);
      graph.settings = compiled.settings;
      calls.rebuild++;
    },
    markDirty: () => { calls.dirty++; calls.save++; },
    draw: () => { calls.draw++; },
  });

  controller.enter();
  controller.setSource('folder/图\n保留@kept\n新增@new');
  assert.equal(await controller.requestExit(), true);

  assert.equal(refs.graph, graph);
  assert.equal(refs.nodes, graph.nodes);
  assert.equal(refs.edges, graph.edges);
  assert.equal(refs.groups, graph.groups);
  assert.deepEqual(graph.nodes.map(node => node.label), ['保留', '新增']);
  assert.ok(graph.nodes.every(node => Number.isSafeInteger(node.createdOrder)));
  assert.deepEqual(calls, { pause: 1, resume: 1, undo: 1, rebuild: 1, dirty: 1, draw: 1, save: 1 });
});

test('main wiring exposes text view per pane and protects drafts and render work', async () => {
  const main = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');
  const editor = await readFile(path.join(root, 'src', 'text-view', 'editor.ts'), 'utf8');
  const paneState = await readFile(path.join(root, 'src', 'pane-state.ts'), 'utf8');

  assert.match(main, /textViewPill\.textContent = '文字视图'/);
  assert.match(main, /mountTextEditor\(pane0\)/);
  assert.match(main, /mountTextEditor\(pane1\)/);
  assert.match(main, /mountTextEditor\(np\)/);
  assert.match(main, /textEditors\.get\(np\)\?\.dispose\(\)/);
  assert.match(main, /if \(pane0St\.textViewActive\) return/);
  assert.match(main, /!px \|\| !sm \|\| pi\.textViewActive/);
  assert.match(main, /blockForTextDraft\('切换文件'\)/);
  assert.match(main, /blockForTextDraft\('关闭标签或窗格'\)/);
  assert.match(main, /blockExternalForTextDraft\(graphName\)/);
  assert.match(main, /if \(hasActiveTextDraft\(\)\)/);
  assert.match(main, /repairGraphCreatedOrders\(compiled\)/);
  assert.match(main, /runtime\.graph\.nodes\.length = 0/);
  assert.match(main, /reinitializeRuntimeViews\(runtime\)/);
  assert.match(main, /scheduleSaveForPane\(owner\)/);
  assert.match(editor, /UNSUPPORTED_GRAPH_NAME/);
  assert.match(editor, /fg-text-view-emergency-draft:/);
  assert.match(editor, /sessionStorage\.setItem\(draftKey\(\)/);
  assert.match(paneState, /textViewActive: boolean/);
});
