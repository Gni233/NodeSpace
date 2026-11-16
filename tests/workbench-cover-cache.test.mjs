import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const ts = createRequire(import.meta.url)('typescript');
const source = await readFile(new URL('../src/workbench-cover-cache.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { createWorkbenchCoverCache } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

const key = { scope: 'vault-a', id: '图.json', version: 'mtime:5', theme: 'dark' };
const cover = { points: [{ id: 'point', x: .2, y: .7, level: 1 }], links: [], nodeCount: 1, edgeCount: 0 };

function indexedStore() {
  const values = new Map();
  const database = {
    close() {},
    transaction() {
      let pending = 0;
      const tx = { objectStore: () => store };
      const request = operation => {
        const result = {};
        pending++;
        queueMicrotask(() => {
          result.result = operation();
          result.onsuccess?.();
          if (--pending === 0) queueMicrotask(() => tx.oncomplete?.());
        });
        return result;
      };
      const store = {
        get: name => request(() => structuredClone(values.get(name))),
        put: record => request(() => values.set(record.key, structuredClone(record))),
        delete: name => request(() => values.delete(name)),
        index: () => ({ getAllKeys: () => request(() => [...values.values()]
          .sort((left, right) => left.savedAt - right.savedAt).map(record => record.key)) }),
      };
      return tx;
    },
  };
  const factory = { open() {
    const request = { result: database };
    queueMicrotask(() => request.onsuccess?.());
    return request;
  } };
  return { factory, values };
}

test('the exact cover is available immediately and persists independently across new cache instances', async () => {
  const { factory, values } = indexedStore();
  const first = createWorkbenchCoverCache({ factory: () => factory });
  assert.equal(first.set(key, cover), undefined);
  assert.equal(values.size, 0);
  assert.deepEqual(await first.get(key), cover);
  await first.flush();
  const reopened = createWorkbenchCoverCache({ factory: () => factory });
  assert.deepEqual(await reopened.get(key), cover);
  for (const change of [{ scope: 'vault-b' }, { id: 'other.json' }, { version: 'mtime:6' }, { theme: 'paper' }]) {
    assert.equal(await reopened.get({ ...key, ...change }), undefined);
  }
});

test('persisted previews are pruned to the configured capacity across separate batches', async () => {
  const { factory, values } = indexedStore();
  const options = { maxEntries: 2, factory: () => factory };
  const cache = createWorkbenchCoverCache(options);
  cache.set({ ...key, version: 1 }, 'one');
  cache.set({ ...key, version: 2 }, 'two');
  await cache.flush();
  cache.set({ ...key, version: 3 }, 'three');
  await cache.flush();
  assert.equal(values.size, 2);
  const reopened = createWorkbenchCoverCache(options);
  assert.equal(await reopened.get({ ...key, version: 1 }), undefined);
  assert.equal(await reopened.get({ ...key, version: 2 }), 'two');
  assert.equal(await reopened.get({ ...key, version: 3 }), 'three');
});

test('unavailable IndexedDB still provides a bounded least-recently-used memory cache', async () => {
  const cache = createWorkbenchCoverCache({ maxEntries: 2, factory: () => { throw new Error('unavailable'); } });
  const first = { ...key, version: 1 }, second = { ...key, version: 2 }, third = { ...key, version: 3 };
  cache.set(first, 'one');
  cache.set(second, 'two');
  assert.equal(await cache.get(first), 'one');
  cache.set(third, 'three');
  await cache.flush();
  assert.equal(await cache.get(second), undefined);
  assert.equal(await cache.get(first), 'one');
  assert.equal(await cache.get(third), 'three');
});
