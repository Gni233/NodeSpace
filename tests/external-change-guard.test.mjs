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

test('internal graph write guard consumes only the matching watcher echo', async () => {
  const { InternalGraphWriteGuard } = await importTypeScriptModule(
    path.join(root, 'src', 'external-change-guard.ts'),
  );
  const guard = new InternalGraphWriteGuard(1800);

  guard.mark('Course/AI.json', 1000);
  assert.equal(guard.shouldIgnore('course\\AI', 1700), true);
  assert.equal(guard.shouldIgnore('course/AI', 1750), false);
  assert.equal(guard.shouldIgnore('course/Other', 1750), false);
});

test('internal graph write guard expires without hiding a later external edit', async () => {
  const { InternalGraphWriteGuard } = await importTypeScriptModule(
    path.join(root, 'src', 'external-change-guard.ts'),
  );
  const guard = new InternalGraphWriteGuard(1800);

  guard.mark('notes.json', 1000);
  assert.equal(guard.shouldIgnore('notes', 3001), false);
});
