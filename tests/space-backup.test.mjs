import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { mediaAssetsModuleUrl } from './helpers/media-import-module.mjs';

const ts = createRequire(import.meta.url)('typescript');
const source = name => readFile(new URL(`../src/${name}.ts`, import.meta.url), 'utf8');
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64');
const snapshotModule = moduleUrl(await source('graph-snapshot'));
const { createSpaceBackup, inspectSpaceBackup, restoreSpaceBackup } = await import(moduleUrl((await source('space-backup'))
  .replace("'./media-assets'", JSON.stringify(mediaAssetsModuleUrl))
  .replace("'./graph-snapshot'", JSON.stringify(snapshotModule))));
const { MissingBrowserAttachmentError } = await import(mediaAssetsModuleUrl);

const attachment = key => `nodespace-attachment:${key}`;
const photo = (id, key) => ({ id, label: id, mediaType: 'image', mediaUrl: attachment(key) });
const graphWith = nodes => ({ nodes, edges: [], groups: [] });
const spaceRef = (graph, nodeId) => ({ provider: 'nodespace', version: 1, kind: 'node', graph, nodeId });

test('captures a graph snapshot, preserves settings and restores one fresh ID for shared bytes', async () => {
  const bytes = Uint8Array.from({ length: 30000 }, (_, i) => i % 256);
  const graph = graphWith([photo('one', 'old'), photo('two', 'old'), { id: 'doc', mediaType: 'md', mediaUrl: '# 手记' }]);
  graph.edges.push({ source: graph.nodes[0], target: 'two', label: '相连' });
  graph.groups.push({ id: 'group', label: '集' });
  graph.nodes[0]._runtime = 7;
  graph.settings = { graphTheme: 'paper-light', gridVis: true, expandedMedia: ['one'] };
  const reads = [];
  const pending = createSpaceBackup({ name: '日记✨', graph }, {
    readAttachment: async reference => { reads.push(reference); return new Blob([bytes], { type: 'image/png' }); },
  });
  graph.nodes[0].label = 'edited during export';
  const { text, summary } = await pending;
  assert.deepEqual(reads, [attachment('old')]);
  assert.equal(summary.bundledAttachments, 1);
  assert.deepEqual(inspectSpaceBackup(text), { name: '日记✨', summary });
  let saved;
  const result = await restoreSpaceBackup(text, {
    async saveAttachment(blob) {
      assert.equal(blob.type, 'image/png');
      assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
      return { value: attachment('new'), release: () => assert.fail('attachment belongs to committed graph') };
    },
    async saveGraph(restored) { saved = restored; },
  });
  assert.deepEqual(result, { name: '日记✨', summary });
  assert.deepEqual(saved.edges, [{ source: 'one', target: 'two', label: '相连' }]);
  assert.deepEqual(saved.settings, { graphTheme: 'paper-light', gridVis: true });
  assert.deepEqual(saved.groups, graph.groups);
  assert.equal(saved.nodes[0].label, 'one');
  assert.equal(saved.nodes[0]._runtime, undefined);
  assert.equal(graph.nodes[0]._runtime, 7);
  assert.equal(graph.nodes[0].mediaUrl, attachment('old'));
  assert.equal(saved.nodes[0].mediaUrl, attachment('new'));
  assert.equal(saved.nodes[1].mediaUrl, attachment('new'));
  assert.equal(saved.nodes[2].mediaUrl, '# 手记');
});

test('keeps unavailable content inert while retaining its original references and local portal targets', async () => {
  const graph = graphWith([
    photo('lost', 'missing'), photo('same', 'missing'),
    { id: 'external', mediaType: 'pdf', mediaUrl: 'https://example.test/file.pdf', hyperlink: 'https://example.test/page' },
    { id: 'vault', resourceRef: { provider: 'vault', path: '../secret.md' } },
    { id: 'self', spaceRef: spaceRef('source.json', 'external') },
    { id: 'cross', spaceRef: spaceRef('../private.json', 'private'), hyperlink: 'javascript:alert(1)' },
  ]);
  const { text, summary } = await createSpaceBackup({ name: 'Source', graphId: 'source.json', graph }, {
    async readAttachment(reference) {
      assert.equal(reference, attachment('missing'));
      throw new MissingBrowserAttachmentError();
    },
  });
  assert.deepEqual(summary, { bundledAttachments: 0, missingAttachments: 1, externalMedia: 1, vaultReferences: 1, spaceReferences: 1 });
  let restored;
  await restoreSpaceBackup(text, {
    restoredGraphId: 'copies/restored.json',
    saveAttachment: () => assert.fail('missing references are never loaded or created'),
    async saveGraph(value) { restored = value; },
  });
  const [missing, same, external, vault, self, cross] = restored.nodes;
  assert.equal(missing.mediaUrl, undefined);
  assert.deepEqual(missing.backupReferences, same.backupReferences);
  assert.equal(missing.backupReferences.missingAttachment.reference, attachment('missing'));
  assert.equal(external.mediaType, undefined);
  assert.equal(external.backupReferences.media.reference, 'https://example.test/file.pdf');
  assert.equal(external.hyperlink, 'https://example.test/page');
  assert.equal(vault.resourceRef, undefined);
  assert.equal(vault.backupReferences.vault.resourceRef.path, '../secret.md');
  assert.equal(self.spaceRef.graph, 'copies/restored.json');
  assert.equal(cross.spaceRef, undefined);
  assert.equal(cross.backupReferences.space.graph, '../private.json');
  assert.equal(cross.hyperlink, undefined);
  const reExport = await createSpaceBackup({ name: 'Copy', graphId: 'copies/restored.json', graph: restored });
  assert.deepEqual(reExport.summary, summary);
});

test('rejects invalid manifests, graphs and active documents before either storage operation', async () => {
  const { text } = await createSpaceBackup({ name: 'Example', graph: graphWith([photo('one', 'old')]) }, {
    readAttachment: async () => new Blob(['image'], { type: 'image/png' }),
  });
  const cases = [
    file => { file.version++; },
    file => { file.graph.nodes.push({ id: 'one' }); },
    file => { file.graph.edges.push({ source: 'one', target: 'absent' }); },
    file => { file.graph.nodes[0].note = []; },
    file => { file.graph.nodes[0].tags = [7]; },
    file => { file.graph.settings = { graphTheme: 'constructor' }; },
    file => { file.graph.settings = { sourceMode: 'vault-readonly' }; },
    file => { file.graph.settings = JSON.parse('{"__proto__":{"polluted":true}}'); },
    file => { file.attachments[0].data = 'AAAA===A'; },
    file => { file.attachments[0].reference = attachment('unused'); },
    file => { file.attachments = []; },
    file => { file.graph.nodes[0].mediaType = 'pdf'; file.attachments[0].mime = 'text/html'; },
    file => { file.graph.nodes[0].mediaType = 'pdf'; file.attachments[0].mime = 'application/pdf'; },
  ];
  for (const mutate of cases) {
    const file = JSON.parse(text);
    mutate(file);
    const invalid = JSON.stringify(file);
    assert.throws(() => inspectSpaceBackup(invalid));
    let writes = 0;
    await assert.rejects(restoreSpaceBackup(invalid, { saveGraph: async () => { writes++; }, saveAttachment: async () => { writes++; } }));
    assert.equal(writes, 0);
  }
  assert.equal(Object.prototype.polluted, undefined);
});

test('rolls back committed attachment writes when an attachment or graph write fails', async () => {
  const { text } = await createSpaceBackup({ name: 'Example', graph: graphWith([photo('one', 'old-a'), photo('two', 'old-b')]) }, {
    readAttachment: async () => new Blob(['image'], { type: 'image/png' }),
  });
  for (const failGraph of [false, true]) {
    const kept = new Set();
    let saves = 0, graphSaves = 0;
    await assert.rejects(restoreSpaceBackup(text, {
      async saveAttachment() {
        const value = attachment(`new-${++saves}`);
        if (!failGraph && saves === 2) throw new Error('attachment quota');
        kept.add(value);
        return { value, release: async () => { await new Promise(setImmediate); kept.delete(value); } };
      },
      async saveGraph() { graphSaves++; throw new Error('graph quota'); },
    }), failGraph ? /graph quota/ : /attachment quota/);
    assert.equal(kept.size, 0);
    assert.equal(graphSaves, failGraph ? 1 : 0);
  }
});

test('bundles browser PDFs with a PDF-safe content type', async () => {
  const bytes = '%PDF-1.7\nexample';
  const graph = graphWith([{ id: 'pdf', mediaType: 'pdf', mediaUrl: attachment('old-pdf') }]);
  const { text } = await createSpaceBackup({ name: 'Example', graph }, {
    readAttachment: async () => new Blob([bytes]),
  });
  await restoreSpaceBackup(text, {
    async saveAttachment(blob) {
      assert.equal(blob.type, 'application/pdf');
      assert.equal(await blob.text(), bytes);
      return { value: attachment('new-pdf'), release: () => {} };
    },
    async saveGraph(restored) { assert.equal(restored.nodes[0].mediaUrl, attachment('new-pdf')); },
  });
});

test('rejects oversized attachments before reading their bytes and reports non-missing storage errors', async () => {
  const input = { name: 'Example', graph: graphWith([photo('one', 'old')]) };
  class OversizedAttachment extends Blob {
    get size() { return 25 * 1024 ** 2 + 1; }
    async arrayBuffer() { assert.fail('oversized attachments should not be read'); }
  }
  await assert.rejects(createSpaceBackup(input, { readAttachment: async () => new OversizedAttachment() }), /25 MiB/);
  await assert.rejects(createSpaceBackup(input, { readAttachment: async () => { throw new Error('database unavailable'); } }), /database unavailable/);
});
