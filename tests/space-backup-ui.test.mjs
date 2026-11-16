import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const ts = createRequire(import.meta.url)('typescript');
const source = await readFile(new URL('../src/space-backup-ui.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { backupFileStem, findRestoreCopyPath, describeBackupContents } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const safSource = ts.createSourceFile('saf-bridge.ts', await readFile(new URL('../src/saf-bridge.ts', import.meta.url), 'utf8'),
  ts.ScriptTarget.ES2022, true);
const saveBackupSource = safSource.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'safSaveBackup');
const saveBackupCode = ts.transpileModule(saveBackupSource.getText(safSource).replace('export ', ''),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const createNativeExport = new Function('Filesystem', 'plugin', 'Directory', 'Encoding', 'crypto', `${saveBackupCode}\nreturn safSaveBackup;`);

test('backup filenames retain readable names without carrying paths, control characters or reserved Windows names', () => {
  assert.equal(backupFileStem('纸白手记.json'), '纸白手记');
  assert.equal(backupFileStem('E:\\..\\原笔记／光\u202e?.json'), 'E .. 原笔记／光');
  assert.equal(backupFileStem('../..//'), '未命名空间');
  assert.equal(backupFileStem('COM1.附注.json'), '空间 COM1.附注');
  const long = backupFileStem('🌿'.repeat(90));
  assert.equal([...long].length, 56);
  assert.ok(Buffer.byteLength(long + '.nodespace-backup.json') < 255);
});

test('restoring skips open/recoverable titles and occupied files without treating read failures as available', async () => {
  const reads = [];
  const path = await findRestoreCopyPath('手记.json', { async readFile(candidate) {
    reads.push(candidate);
    return { ok: true, value: reads.length === 1 ? '' : null };
  } }, candidate => candidate === '手记（恢复）.json');
  assert.equal(path, '手记（恢复） 3.json');
  assert.deepEqual(reads, ['手记（恢复） 2.json', '手记（恢复） 3.json']);
  await assert.rejects(findRestoreCopyPath('手记', { async readFile() { return { ok: false, error: 'permission denied' }; } }), /无法检查/);
});

test('backup summaries distinguish bundled files from missing or external items', () => {
  const summary = { bundledAttachments: 3, missingAttachments: 1, externalMedia: 1, vaultReferences: 2, spaceReferences: 3 };
  assert.equal(describeBackupContents(summary), '3 个随包附件，1 个找不到原文件的附件，6 条需重新关联的外部引用');
  assert.equal(describeBackupContents({ ...summary, missingAttachments: 0, externalMedia: 0, vaultReferences: 0, spaceReferences: 0 }), '3 个随包附件');
});

test('Android backup export stages exact UTF-8 and cleans its cache for success, cancellation and write failure', async () => {
  const text = 'a'.repeat(1024 * 1024 - 1) + '🌿和纸';
  const fileName = '纸白手记.nodespace-backup.json';
  for (const outcome of ['saved', 'cancelled', 'failed']) {
    const directory = 'CACHE';
    const expectedPath = 'nodespace-backup-test-id.json';
    let cached = [], removed = false;
    const filesystem = {
      async writeFile(file) { assert.equal(file.directory, directory); assert.equal(file.path, expectedPath); cached = [Buffer.from(file.data)]; },
      async appendFile(file) { assert.equal(file.encoding, 'utf8'); cached.push(Buffer.from(file.data)); },
      async deleteFile(file) { assert.equal(file.path, expectedPath); removed = true; },
    };
    const safeSave = createNativeExport(filesystem, () => ({ async saveBackup(target) {
      assert.deepEqual(target, { fileName, cacheName: expectedPath });
      assert.equal(Buffer.concat(cached).toString('utf8'), text);
      if (outcome === 'failed') throw new Error('provider write failed');
      return { saved: outcome === 'saved' };
    } }), { Cache: directory }, { UTF8: 'utf8' }, { randomUUID: () => 'test-id' });
    if (outcome === 'failed') await assert.rejects(safeSave(fileName, text), /provider write failed/);
    else assert.equal(await safeSave(fileName, text), outcome === 'saved');
    assert.equal(removed, true, outcome);
  }
});
