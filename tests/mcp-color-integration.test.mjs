import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const server = fileURLToPath(new URL('../mcp-server/server.js', import.meta.url));
function request(directory, calls) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [server, '--dir', directory], { stdio: ['pipe', 'pipe', 'pipe'] });
    let pending = '', stderr = '';
    const responses = new Map();
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.stdout.on('data', chunk => {
      pending += chunk;
      let newline;
      while ((newline = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, newline); pending = pending.slice(newline + 1);
        if (line.trim()) { const response = JSON.parse(line); responses.set(response.id, response); }
      }
    });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(calls.map(call => responses.get(call.id))) : reject(new Error(stderr)));
    for (const call of calls) child.stdin.write(JSON.stringify(call) + '\n');
    child.stdin.end();
  });
}
const call = (id, name, args) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: { graph: 'colors', ...args } } });

test('MCP explicit color tools preserve black and grey, batch choices, defaults and theme resets', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'nodespace-color-contract-'));
  try {
    const graphPath = path.join(directory, 'colors.json');
    await writeFile(graphPath, JSON.stringify({
      nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B', color: '#000000', colorMode: 'custom' }, { id: 'c', label: 'C' }, { id: 'd', label: 'D' }],
      edges: [{ source: 'a', target: 'b' }, { source: 'b', target: 'c', color: '#BFBFBF' }, { source: 'c', target: 'd', color: '#E8684A', colorMode: 'custom' }],
      groups: [], settings: { graphTheme: 'paper-light' },
    }));
    const responses = await request(directory, [
      call(1, 'create_node', { label: 'Explicit Black', color: '#000000' }),
      call(2, 'create_nodes_batch', { nodes: [{ label: 'Batch Black', color: '#000000' }, { label: 'Batch Theme' }] }),
      call(3, 'create_edge', { source: 'a', target: 'c', color: '#BFBFBF' }),
      call(4, 'create_edges_batch', { edges: [{ source: 'a', target: 'd' }, { source: 'b', target: 'd', color: '#BFBFBF' }] }),
      call(5, 'update_node', { nodeId: 'a', color: '#000000' }),
      call(6, 'update_node', { nodeId: 'b', color: '' }),
      call(7, 'update_edge', { edgeIndex: 0, color: '#BFBFBF' }),
      call(8, 'update_edge', { edgeIndex: 2, color: '' }),
      call(9, 'update_nodes_batch', { ids: ['c'], setColor: '#000000' }),
    ]);
    for (const response of responses) {
      assert.ok(response?.result);
      assert.ok(!response.result.isError, JSON.stringify(response));
    }
    const stored = JSON.parse(await readFile(graphPath, 'utf8'));
    for (const node of stored.nodes.filter(node => ['a', 'c'].includes(node.id) || node.label.includes('Black'))) {
      assert.equal(node.color, '#000000'); assert.equal(node.colorMode, 'custom');
    }
    assert.equal(stored.nodes.find(node => node.id === 'b').colorMode, undefined);
    assert.equal(stored.nodes.find(node => node.id === 'b').color, '');
    assert.equal(stored.nodes.find(node => node.label === 'Batch Theme').colorMode, undefined);
    assert.equal(stored.edges[0].colorMode, 'custom');
    assert.equal(stored.edges[1].colorMode, undefined);
    assert.equal(stored.edges[2].colorMode, undefined);
    assert.equal(stored.edges[2].color, '');
    assert.equal(stored.edges[3].colorMode, 'custom');
    assert.equal(stored.edges[4].colorMode, undefined);
    assert.equal(stored.edges[5].colorMode, 'custom');
    assert.equal(stored.settings.graphTheme, 'paper-light');
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('nodespace-color-contract-'));
    await rm(directory, { recursive: true, force: true });
  }
});
