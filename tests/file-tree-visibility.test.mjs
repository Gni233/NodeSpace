import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
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

test('internal reference preview fixtures stay out of the user space shelf', async () => {
  const { filterUserFacingGraphEntries } = await importTypeScriptModule(
    path.join(root, 'src', 'file-tree-visibility.ts'),
  );
  const result = filterUserFacingGraphEntries([
    { name: '__reference_preview.json', kind: 'file', children: [] },
    { name: '__reference_preview_v2', kind: 'file', children: [] },
    { name: '我的空间.json', kind: 'file', children: [] },
    {
      name: '课程',
      kind: 'directory',
      children: [
        { name: '__reference_preview_v7.json', kind: 'file', children: [] },
        { name: '机器学习.json', kind: 'file', children: [] },
      ],
    },
    {
      name: 'empty-internal',
      kind: 'directory',
      children: [{ name: '__reference_preview_v3.json', kind: 'file', children: [] }],
    },
  ]);

  assert.deepEqual(result.map(entry => entry.name), ['我的空间.json', '课程']);
  assert.deepEqual(result[1].children.map(entry => entry.name), ['机器学习.json']);
});
