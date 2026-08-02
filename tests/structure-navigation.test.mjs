import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadNavigationState() {
  const source = await readFile(path.join(root, 'src', 'structure-view.ts'), 'utf8');
  const file = ts.createSourceFile('structure-view.ts', source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const navigationClass = file.statements.find(statement =>
    ts.isClassDeclaration(statement) && statement.name?.text === 'StructureNavigationState');
  assert.ok(navigationClass);
  const output = ts.transpileModule(navigationClass.getText(file), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(/^class StructureNavigationState/m, 'export class StructureNavigationState');
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

test('structure navigation defaults to the graph root and exposes an immutable path snapshot', async () => {
  const { StructureNavigationState } = await loadNavigationState();
  const navigation = new StructureNavigationState();

  assert.equal(navigation.currentId, null);
  assert.deepEqual(navigation.path, []);
  const snapshot = navigation.path;
  assert.throws(() => snapshot.push('unexpected'), TypeError);
  assert.deepEqual(navigation.path, []);
});

test('V1 structure navigation accepts one unique structure and rejects depth overflow or cycles', async () => {
  const { StructureNavigationState } = await loadNavigationState();
  const navigation = new StructureNavigationState();

  assert.equal(navigation.enter('structure-a'), true);
  assert.equal(navigation.currentId, 'structure-a');
  assert.deepEqual(navigation.path, ['structure-a']);
  assert.equal(navigation.enter('structure-a'), false);
  assert.equal(navigation.enter('structure-b'), false);
  assert.deepEqual(navigation.path, ['structure-a']);
});

test('navigation exit APIs preserve stack semantics when deeper navigation is enabled', async () => {
  const { StructureNavigationState } = await loadNavigationState();
  const navigation = new StructureNavigationState({ maxDepth: 3 });

  assert.equal(navigation.enter('structure-a'), true);
  assert.equal(navigation.enter('structure-b'), true);
  assert.equal(navigation.enter('structure-c'), true);
  assert.equal(navigation.exitTo(0), true);
  assert.deepEqual(navigation.path, ['structure-a']);
  assert.equal(navigation.exitTo(-1), true);
  assert.equal(navigation.currentId, null);
  assert.equal(navigation.exit(), false);
  assert.equal(navigation.exitTo(0), false);
});

test('breadcrumb source remains pane-owned, initially hidden, and uses native buttons', async () => {
  const source = await readFile(path.join(root, 'src', 'structure-view.ts'), 'utf8');

  assert.match(source, /export function createStructureBreadcrumb\(/);
  assert.match(source, /element\.hidden = true/);
  assert.match(source, /document\.createElement\('button'\)/);
  assert.match(source, /callbacks\.exitTo\(index\)/);
  assert.match(source, /touch-action:manipulation/);
  assert.doesNotMatch(source, /document\.getElementById|querySelector|globalThis\./);
});

test('pane state keeps navigation separate from persisted graph state and collapsed maps', async () => {
  const source = await readFile(path.join(root, 'src', 'pane-state.ts'), 'utf8');

  assert.match(source, /structurePath: string\[\];/);
  assert.match(source, /structureView: PaneStructureView \| null;/);
  assert.match(source, /structureController: StructureNavigationState;/);
  assert.match(source, /disposeStructureBreadcrumb: \(\(\) => void\) \| null;/);
  assert.match(source, /structurePath: \[\],[\s\S]*?structureView: null,[\s\S]*?structureController: new StructureNavigationState\(\{ maxDepth: 1 \}\)/);
  assert.doesNotMatch(source, /collapsed(?:State|Map|ById)/i);
});
