import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mediaAssetsModuleUrl } from './helpers/media-import-module.mjs';
const { BrowserAttachmentStore, isStoredAttachment } = await import(mediaAssetsModuleUrl);

// Platform boundary: requests succeed before their enclosing transaction commits.
function memoryDatabase() {
  const files = new Map(), transactions = [];
  let opens = 0, blocked = false, failNext = false, holdCommit = false;
  const db = {
    objectStoreNames: { contains: () => true }, close() {},
    transaction(_name, mode) {
      const tx = { mode, error: null, abort() { queueMicrotask(() => tx.onabort?.()); }, objectStore() { return store; } };
      transactions.push(tx);
      const request = operation => {
        const req = { result: undefined, error: null };
        queueMicrotask(() => {
          if (failNext) { failNext = false; tx.error = new Error('Quota exceeded'); tx.onabort?.(); return; }
          operation(req); req.onsuccess?.();
          if (!holdCommit) queueMicrotask(() => tx.oncomplete?.());
        });
        return req;
      };
      const store = {
        put: (blob, key) => request(req => { files.set(key, blob); req.result = key; }),
        get: key => request(req => { req.result = files.get(key); }),
        delete: key => request(() => files.delete(key)),
      };
      return tx;
    },
  };
  const factory = { open() {
    opens++;
    const req = { result: db };
    queueMicrotask(() => blocked ? req.onblocked?.() : req.onsuccess?.());
    return req;
  } };
  return { factory, files, transactions, get opens() { return opens; }, set blocked(value) { blocked = value; }, set failNext(value) { failNext = value; }, set holdCommit(value) { holdCommit = value; }, db };
}

test('binary attachments persist independently of graph JSON and can be read by a new store', async () => {
  const memory = memoryDatabase(), first = new BrowserAttachmentStore(() => memory.factory);
  const blob = new Blob(['not stored in graph JSON'], { type: 'image/svg+xml' });
  const [a, b] = await Promise.all([first.save(blob), first.save(new Blob(['sound']))]);
  assert.equal(isStoredAttachment(a.value), true); assert.notEqual(a.value, b.value);
  assert.equal(memory.opens, 1);
  const reopened = new BrowserAttachmentStore(() => memory.factory);
  const read = await reopened.read(a.value);
  assert.equal(await read.text(), 'not stored in graph JSON'); assert.equal(read.type, blob.type);
  assert.equal(memory.opens, 2);
  a.release(); a.release();
  await new Promise(setImmediate);
  assert.equal(memory.files.size, 1);
  await assert.rejects(reopened.read(a.value), /missing/);
  assert.equal(await (await reopened.read(b.value)).text(), 'sound');
});

test('attachment preparation waits for the actual IndexedDB transaction commit', async () => {
  const memory = memoryDatabase(), store = new BrowserAttachmentStore(() => memory.factory);
  memory.holdCommit = true;
  let prepared = false;
  const saving = store.save(new Blob(['pending'])).then(value => { prepared = true; return value; });
  await new Promise(setImmediate);
  assert.equal(prepared, false);
  memory.transactions[0].oncomplete();
  assert.equal(isStoredAttachment((await saving).value), true);
  assert.equal(prepared, true);
});

test('quota and blocked database failures reject imports and permit a later retry', async () => {
  const memory = memoryDatabase(), store = new BrowserAttachmentStore(() => memory.factory);
  memory.blocked = true;
  await assert.rejects(store.save(new Blob(['x'])), /busy/);
  memory.blocked = false; memory.failNext = true;
  await assert.rejects(store.save(new Blob(['x'])), /Quota/);
  assert.equal(memory.files.size, 0);
  const prepared = await store.save(new Blob(['retry']));
  assert.equal(await (await store.read(prepared.value)).text(), 'retry');
});

test('version changes close stale connections and malformed references never access storage', async () => {
  const memory = memoryDatabase(), store = new BrowserAttachmentStore(() => memory.factory);
  await assert.rejects(store.read('https://example.test/file'), /Invalid/);
  assert.equal(memory.opens, 0);
  const prepared = await store.save(new Blob(['x']));
  memory.db.onversionchange();
  assert.equal(await (await store.read(prepared.value)).text(), 'x');
  assert.equal(memory.opens, 2);
});
