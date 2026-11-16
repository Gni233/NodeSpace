import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createServer } from 'vite';

test('Vite graph reads only files inside the configured graph directory', async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), 'nodespace-vite-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const graphRoot = join(fixture, 'graphs');
  const neighbor = join(fixture, 'graphs-neighbor');
  await Promise.all([mkdir(graphRoot), mkdir(neighbor)]);
  const graphName = '测试 # 1%';
  const graph = { nodes: [], edges: [], groups: [] };
  await Promise.all([
    writeFile(join(graphRoot, graphName + '.json'), JSON.stringify(graph)),
    writeFile(join(neighbor, 'outside.json'), '{"outside":true}'),
    symlink(neighbor, join(graphRoot, 'link.json'), 'junction'),
  ]);

  const originalDataDir = process.env.NODESPACE_DATA_DIR;
  process.env.NODESPACE_DATA_DIR = graphRoot;
  let server;
  try {
    server = await createServer({
      server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false },
    });
  } finally {
    if (originalDataDir === undefined) delete process.env.NODESPACE_DATA_DIR;
    else process.env.NODESPACE_DATA_DIR = originalDataDir;
  }

  try {
    await server.listen(0);
    const { port } = server.httpServer.address();
    const request = name => fetch(`http://127.0.0.1:${port}/api/graph/${name}`);
    const valid = await request(encodeURIComponent(graphName) + '.json?cache=1');
    assert.equal(valid.status, 200);
    assert.deepEqual(await valid.json(), graph);
    for (const [name, status] of [
      ['missing', 404],
      ['%ZZ', 400],
      ['..%2fgraphs-neighbor%2foutside', 403],
      ['..%5cgraphs-neighbor%5coutside', 403],
      ['link', 403],
    ]) {
      const response = await request(name);
      assert.equal(response.status, status, name);
      await response.json();
    }
  } finally {
    await server.close();
  }
});
