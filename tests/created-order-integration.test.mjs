import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { test } from 'node:test';

const root = 'D:/cc/workspace/nodespace';
const serverPath = path.join(root, 'mcp-server', 'server.js');

function requestMcp(directory, calls) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [serverPath, '--dir', directory], { stdio: ['pipe', 'pipe', 'pipe'] });
    const responses = new Map();
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.stdout.on('data', chunk => {
      for (const line of chunk.split('\n')) {
        if (!line.trim()) continue;
        const response = JSON.parse(line);
        if (response.id != null) responses.set(response.id, response);
      }
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`MCP exited ${code}: ${stderr}`));
      resolve(calls.map(call => responses.get(call.id)));
    });
    for (const call of calls) child.stdin.write(`${JSON.stringify(call)}\n`);
    child.stdin.end();
  });
}

function toolCall(id, name, args) {
  return { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } };
}

test('MCP repairs legacy orders on read and allocates fresh orders for creates', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'nodespace-created-order-'));
  try {
    const graphPath = path.join(directory, 'legacy.json');
    await writeFile(graphPath, JSON.stringify({
      nodes: [
        { id: 'first', label: 'First', createdOrder: 2 },
        { id: 'second', label: 'Second' },
        { id: 'duplicate', label: 'Duplicate', createdOrder: 2 },
      ],
      edges: [], groups: [], settings: {},
    }), 'utf8');

    const [readResponse, createResponse, batchResponse] = await requestMcp(directory, [
      toolCall(1, 'read_graph', { graph: 'legacy' }),
      toolCall(2, 'create_node', { graph: 'legacy', label: 'Created' }),
      toolCall(3, 'create_nodes_batch', { graph: 'legacy', nodes: [{ label: 'Batch A' }, { label: 'Batch B' }] }),
    ]);

    const readResult = JSON.parse(readResponse.result.content[0].text);
    const createResult = JSON.parse(createResponse.result.content[0].text);
    const batchResult = JSON.parse(batchResponse.result.content[0].text);
    assert.deepEqual(readResult.nodes.map(node => node.createdOrder), [2, 3, 4]);
    assert.equal(createResult.created.createdOrder, 5);
    assert.deepEqual(batchResult.created.map(node => node.createdOrder), [6, 7]);

    const stored = JSON.parse(await readFile(graphPath, 'utf8'));
    assert.deepEqual(stored.nodes.map(node => node.createdOrder), [2, 3, 4, 5, 6, 7]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('MCP copying discards source orders and gives every copy a new order', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'nodespace-created-order-copy-'));
  try {
    const graphPath = path.join(directory, 'copy.json');
    await writeFile(graphPath, JSON.stringify({
      nodes: [
        { id: 'a', label: 'A', x: 0, y: 0, createdOrder: 7 },
        { id: 'b', label: 'B', x: 1, y: 1, createdOrder: 3 },
      ],
      edges: [], groups: [], settings: {},
    }), 'utf8');

    const [response] = await requestMcp(directory, [
      toolCall(1, 'copy_nodes', { graph: 'copy', ids: ['a', 'b'] }),
    ]);
    const result = JSON.parse(response.result.content[0].text);
    assert.equal(result.copiedNodes, 2);

    const stored = JSON.parse(await readFile(graphPath, 'utf8'));
    assert.deepEqual(stored.nodes.slice(0, 2).map(node => node.createdOrder), [7, 3]);
    assert.deepEqual(stored.nodes.slice(2).map(node => node.createdOrder), [8, 9]);
    assert.equal(new Set(stored.nodes.map(node => node.createdOrder)).size, stored.nodes.length);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('MCP batch creation and copying reject createdOrder overflow', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'nodespace-created-order-overflow-'));
  try {
    const graphPath = path.join(directory, 'overflow.json');
    await writeFile(graphPath, JSON.stringify({
      nodes: [{ id: 'last', label: 'Last', createdOrder: Number.MAX_SAFE_INTEGER }],
      edges: [], groups: [], settings: {},
    }), 'utf8');

    const [batchResponse, copyResponse] = await requestMcp(directory, [
      toolCall(1, 'create_nodes_batch', { graph: 'overflow', nodes: [{ label: 'A' }, { label: 'B' }] }),
      toolCall(2, 'copy_nodes', { graph: 'overflow', ids: ['last'] }),
    ]);
    assert.equal(batchResponse.result.isError, true);
    assert.match(batchResponse.result.content[0].text, /createdOrder has reached the largest safe integer/);
    assert.equal(copyResponse.result.isError, true);
    assert.match(copyResponse.result.content[0].text, /createdOrder has reached the largest safe integer/);

    const stored = JSON.parse(await readFile(graphPath, 'utf8'));
    assert.deepEqual(stored.nodes.map(node => node.createdOrder), [Number.MAX_SAFE_INTEGER]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
