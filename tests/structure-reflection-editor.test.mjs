import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function importEditor() {
  let source = await readFile(path.join(root, 'src', 'ui-edit.ts'), 'utf8');
  let structureSource = await readFile(path.join(root, 'src', 'structure-nodes.ts'), 'utf8');
  const nodeOrderSource = await readFile(path.join(root, 'src', 'node-order.ts'), 'utf8');
  const nodeOrderOutput = ts.transpileModule(nodeOrderSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const nodeOrderUrl = `data:text/javascript;base64,${Buffer.from(nodeOrderOutput).toString('base64')}`;
  structureSource = structureSource.replace("from './node-order'", `from '${nodeOrderUrl}'`);
  const structureOutput = ts.transpileModule(structureSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const structureUrl = `data:text/javascript;base64,${Buffer.from(structureOutput).toString('base64')}`;
  source = source.replace("from './structure-nodes'", `from '${structureUrl}'`);
  source = source.replace(/import .*? from "\.\/utils\/color";\r?\n/, '');
  source = source.replace(/import .*? from "\.\/data\/storage";\r?\n/, '');
  source = source.replace(/import .*? from '\.\/dialog';\r?\n/, '');
  source = source.replace(/import .*? from '\.\/toast';\r?\n/, '');
  source = source.replace(/import .*? from "\.\/layout-constants";\r?\n/, '');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

const { createStructureReflectionEditor } = await importEditor();

test('structure reflection updates live with one undo snapshot per field edit', () => {
  const structure = { id: 's', structure: { memberIds: ['a', 'b'], collapsed: true } };
  const graph = { nodes: [structure], edges: [], groups: [] };
  const state = { selected: structure, undo: 0, saves: 0, syncs: 0, draws: 0 };
  const editor = createStructureReflectionEditor({
    getGraph: () => graph,
    getSelectedNode: () => state.selected,
    saveUndo: () => { state.undo += 1; },
    triggerSave: () => { state.saves += 1; },
    syncGraphToOtherPanes: () => { state.syncs += 1; },
    draw: () => { state.draws += 1; },
  });

  editor.begin('purpose');
  assert.equal(editor.update('purpose', '整理研究路径'), true);
  assert.equal(editor.update('purpose', '整理研究路径与证据'), true);
  assert.equal(editor.update('purpose', '整理研究路径与证据'), false);
  editor.end();
  editor.begin('purpose');
  editor.update('purpose', '形成可执行计划');

  assert.equal(structure.structure.purpose, '形成可执行计划');
  assert.equal(structure.structure.collapsed, true);
  assert.deepEqual(structure.structure.memberIds, ['a', 'b']);
  assert.equal(state.undo, 2);
  assert.equal(state.saves, 3);
  assert.equal(state.syncs, 3);
  assert.equal(state.draws, 3);
});

test('reflection editor rejects ordinary nodes and stale edits after selection changes', () => {
  const structure = { id: 's', structure: { memberIds: [], collapsed: false } };
  const ordinary = { id: 'n', label: 'ordinary' };
  const graph = { nodes: [structure, ordinary], edges: [], groups: [] };
  let selected = structure;
  let undo = 0;
  const editor = createStructureReflectionEditor({
    getGraph: () => graph,
    getSelectedNode: () => selected,
    saveUndo: () => { undo += 1; },
    triggerSave: () => {},
    draw: () => {},
  });

  editor.begin('summary');
  selected = ordinary;
  assert.equal(editor.update('summary', 'must not leak'), false);
  assert.equal(ordinary.structure, undefined);
  assert.equal(undo, 0);

  selected = structure;
  assert.equal(editor.update('summary', 'stale edit must not apply'), false);
  editor.begin('summary');
  assert.equal(editor.update('summary', '当前总结'), true);
  assert.equal(structure.structure.summary, '当前总结');
  assert.equal(undo, 1);
});

test('reflection editor rejects stale blur updates after switching graphs with the same structure ID', () => {
  const first = { id: 's', structure: { memberIds: ['a', 'b'], collapsed: true } };
  const second = { id: 's', structure: { memberIds: ['c', 'd'], collapsed: false } };
  const graphs = [
    { nodes: [first], edges: [], groups: [] },
    { nodes: [second], edges: [], groups: [] },
  ];
  let graphIndex = 0;
  let undo = 0;
  const editor = createStructureReflectionEditor({
    getGraph: () => graphs[graphIndex],
    getSelectedNode: () => graphs[graphIndex].nodes[0],
    saveUndo: () => { undo += 1; },
    triggerSave: () => {},
    draw: () => {},
  });

  editor.begin('purpose');
  graphIndex = 1;
  assert.equal(editor.update('purpose', 'stale blur value'), false);
  assert.equal(first.structure.purpose, undefined);
  assert.equal(second.structure.purpose, undefined);
  assert.equal(undo, 0);
});

test('editor wires structure-only fields and IME-safe input lifecycle', async () => {
  const source = await readFile(path.join(root, 'src', 'ui-edit.ts'), 'utf8');

  assert.match(source, /makeRow\(structureReflection, '结构目的', purpose\)/);
  assert.match(source, /makeRow\(structureReflection, '当前总结', summary\)/);
  assert.match(source, /structureReflection\.style\.display = structureNode \? 'flex' : 'none'/);
  assert.match(source, /compositionstart/);
  assert.match(source, /compositionend/);
  assert.match(source, /structureReflectionEditor\.end\(\)/);
  assert.match(source, /radModeSelect\.disabled = structureNode/);
  assert.match(source, /n\.radiusMode = structureNode \? 'level'/);
});
