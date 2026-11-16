import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
const ts = createRequire(import.meta.url)('typescript');
const source = ts.createSourceFile('media-nodes.ts', await readFile(new URL('../src/media-nodes.ts', import.meta.url), 'utf8'), ts.ScriptTarget.ES2022, true);
const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'toFileUrl');
const output = ts.transpileModule(fn.getText(source), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { toFileUrl } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);

test('local media paths preserve literal spaces, percent signs, hash and Unicode filenames', () => {
  assert.equal(toFileUrl('C:\\Notes\\雨 #100%.pdf'), 'file:///c:/Notes/%E9%9B%A8%20%23100%25.pdf');
  assert.equal(toFileUrl('d:/Notes/a%20b.png'), 'file:///d:/Notes/a%2520b.png');
  assert.equal(toFileUrl('/home/user/雨 ?#100%.mp4'), 'file:///home/user/%E9%9B%A8%20%3F%23100%25.mp4');
  assert.equal(toFileUrl('\\\\server\\share\\雨 #100%.pdf'), 'file://server/share/%E9%9B%A8%20%23100%25.pdf');
});

test('existing web, blob, attachment and already encoded file references are unchanged', () => {
  for (const url of ['https://example.test/a?q=rain#chapter', 'blob:https://example.test/uuid',
    'nodespace-attachment:uuid', 'file:///c:/Notes/a%20b.pdf#page=2', 'data:image/png;base64,AAAA']) assert.equal(toFileUrl(url), url);
});
