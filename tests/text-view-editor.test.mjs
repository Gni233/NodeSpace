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

async function loadEditor() {
  const files = ['types.ts', 'syntax.ts', 'properties.ts', 'aliases.ts', 'parser.ts', 'compiler.ts', 'printer.ts', 'editor.ts'];
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
  return import(urls.get('editor.ts'));
}

const { TextViewEditorController } = await loadEditor();

function createHarness() {
  const calls = { getGraph: 0, pause: 0, resume: 0, dirty: 0, draw: 0, apply: [] };
  const graph = { nodes: [{ id: 'n1', label: '原节点', x: 1, y: 2 }], edges: [], groups: [] };
  const callbacks = {
    getGraph: () => { calls.getGraph++; return graph; },
    getGraphName: () => '原图',
    pauseSimulation: () => { calls.pause++; },
    resumeSimulation: () => { calls.resume++; },
    markDirty: () => { calls.dirty++; },
    draw: () => { calls.draw++; },
    applyGraph: (nextGraph, graphName) => { calls.apply.push({ nextGraph, graphName }); },
  };
  return { calls, graph, callbacks };
}

test('editor controller prints on entry and parses debounced input without applying', async () => {
  const { calls, callbacks } = createHarness();
  const controller = new TextViewEditorController(callbacks, {}, { debounceMs: 5 });

  controller.enter();
  assert.equal(controller.isActive(), true);
  assert.match(controller.getSource(), /^原图\n原节点@n1/m);
  assert.equal(calls.pause, 1);

  controller.setSource('原图\n-  缺少终点');
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(controller.getDiagnostics()[0].code, 'INVALID_EDGE');
  assert.equal(calls.apply.length, 0);

  assert.equal(calls.apply.length, 0);
  controller.dispose();
});

test('editor controller compiles only when exiting, blocks graph renames, and keeps text mode active after errors', async () => {
  const { calls, callbacks } = createHarness();
  let exitErrors = 0;
  const controller = new TextViewEditorController(callbacks, { onExitError: () => { exitErrors++; } });
  controller.enter();

  controller.setSource('原图\n-  缺少终点');
  assert.equal(await controller.requestExit(), false);
  assert.equal(controller.isActive(), true);
  assert.equal(exitErrors, 1);
  assert.equal(calls.apply.length, 0);
  assert.equal(calls.resume, 0);

  controller.setSource('编辑后图\n甲@a\n乙@b\n-  甲@a  乙@b');
  assert.equal(await controller.requestExit(), false);
  assert.equal(controller.isActive(), true);
  assert.equal(controller.getDiagnostics()[0].code, 'UNSUPPORTED_GRAPH_NAME');
  assert.equal(calls.apply.length, 0);
  assert.equal(calls.resume, 0);

  controller.setSource('原图\n甲@a\n乙@b\n-  甲@a  乙@b');
  assert.equal(await controller.requestExit(), true);
  assert.equal(controller.isActive(), false);
  assert.equal(calls.dirty, 1);
  assert.equal(calls.draw, 1);
  assert.equal(calls.resume, 1);
  assert.equal(calls.apply[0].graphName, '原图');
  assert.equal(calls.apply[0].nextGraph.nodes.length, 2);
});
