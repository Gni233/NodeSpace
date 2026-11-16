import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const ts = createRequire(import.meta.url)('typescript');
const source = await readFile(new URL('../src/workbench-history.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { createWorkbenchHistory } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('recent spaces track actual visits and filter current, missing and unvisited files', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const history = createWorkbenchHistory(storage);
  for (const id of ['one.json', 'gone.json', 'two.json', 'one.json', 'three.json']) history.visit(id);
  assert.deepEqual(history.list('three.json', ['two.json', 'one.json', 'three.json', 'unused.json']), ['one.json', 'two.json']);
});

test('startup preference is global while recent spaces are scoped to each library', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const first = createWorkbenchHistory(storage, 'library-a');
  assert.equal(first.showAtStartup, true);
  first.setShowAtStartup(false);
  first.visit('same-name.json');
  const second = createWorkbenchHistory(storage, 'library-b');
  assert.equal(second.showAtStartup, false);
  assert.deepEqual(second.list(null, ['same-name.json']), []);
  assert.deepEqual(createWorkbenchHistory(storage, 'library-a').list(null, ['same-name.json']), ['same-name.json']);
});
