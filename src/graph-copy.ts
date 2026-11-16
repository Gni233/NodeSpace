import type { GraphData } from './data/storage';
import { createNodeIds } from './node-order';
import { sanitizeCopiedNode } from './structure-nodes';

const endpointId = (value: any): string => String(value && typeof value === 'object' ? value.id : value);
const coordinate = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? value : 0;

/** Prepare a copy without mutating the source, destination, or clipboard. */
export function prepareGraphCopy(
  destination: GraphData,
  clipboard: { nodes: any[]; edges: any[] },
  center: { x: number; y: number },
): { nodes: any[]; edges: any[] } {
  if (!clipboard.nodes.length) return { nodes: [], edges: [] };
  const ids = clipboard.nodes.map(node => String(node.id));
  if (new Set(ids).size !== ids.length) throw new Error('Clipboard contains duplicate node identities');
  const offset = {
    x: coordinate(center.x) - clipboard.nodes.reduce((sum, node) => sum + coordinate(node.x), 0) / ids.length,
    y: coordinate(center.y) - clipboard.nodes.reduce((sum, node) => sum + coordinate(node.y), 0) / ids.length,
  };
  const freshIds = createNodeIds(destination.nodes, ids.length);
  const idMap = new Map(ids.map((id, index) => [id, freshIds[index]]));
  const ordered = clipboard.nodes.map((node, index) => ({ node, index }))
    .sort((a, b) => {
      const order = (node: any) => Number.isSafeInteger(node.createdOrder) && node.createdOrder >= 0 ? node.createdOrder : Infinity;
      return order(a.node) - order(b.node) || a.index - b.index;
    });
  const nodes = ordered.map(({ node }) => ({
    ...sanitizeCopiedNode(node), id: idMap.get(String(node.id))!,
    x: coordinate(node.x) + offset.x, y: coordinate(node.y) + offset.y,
    fx: null, fy: null, fixed: false, _isNew: true,
  }));
  const edges = clipboard.edges.flatMap(edge => {
    const source = idMap.get(endpointId(edge.source)), target = idMap.get(endpointId(edge.target));
    return source && target ? [{ ...JSON.parse(JSON.stringify({ ...edge, source, target })), source, target }] : [];
  });
  return { nodes, edges };
}
