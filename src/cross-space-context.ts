import type { GraphData } from './data/storage';

export type CrossSpaceSourceKind = 'nodespace' | 'vault';

export interface CrossSpaceTarget {
  sourceKey: string;
  sourceKind: CrossSpaceSourceKind;
  sourceLabel: string;
  sourceGraph: string;
  graph: GraphData;
  anchorNodeId?: string | null;
}

export interface CrossSpaceProxySource {
  sourceKey: string;
  sourceKind: CrossSpaceSourceKind;
  sourceLabel: string;
  sourceGraph: string;
  canonicalNodeId: string;
}

export interface CrossSpaceBranch {
  id: string;
  entryNodeId: string;
  anchorProxyId: string;
  sourceKey: string;
  sourceLabel: string;
  proxyNodes: any[];
  proxyEdges: any[];
  bridgeEdge: any;
  omittedCount: number;
}

export interface CrossSpaceContextProjection {
  graph: GraphData;
  branches: CrossSpaceBranch[];
  proxyNodeIds: Set<string>;
  proxyEdgeIndexes: Set<number>;
}

const endpointId = (value: any): string => String(value && typeof value === 'object' ? value.id : value);
const compact = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();

function stableHash(value: string): string {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0) || 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function crossSpaceProxyId(sourceKey: string, canonicalNodeId: string): string {
  return `local_proxy_${stableHash(sourceKey)}_${stableHash(canonicalNodeId)}`;
}

export function crossSpaceCanonicalKey(node: any): string | null {
  const source = node?._localContextProxy as CrossSpaceProxySource | undefined;
  return source ? `${source.sourceKey}::${source.canonicalNodeId}` : null;
}

export function isCrossSpaceProxyNode(node: any): boolean {
  return Boolean(node?._localContextProxy?.sourceKey && node?._localContextProxy?.canonicalNodeId);
}

export function isCrossSpaceProxyEdge(edge: any): boolean {
  return Boolean(edge?._localContextProxyEdge || edge?._localContextCrossSpace);
}

function nodeOrder(node: any, sourceIndex: number, degree: number): [number, number, number, string] {
  return [
    Math.max(1, Math.min(6, Number(node?.headingLevel) || 6)),
    -degree,
    Number.isSafeInteger(node?.createdOrder) ? Number(node.createdOrder) : sourceIndex,
    String(node?.id || ''),
  ];
}

const compareOrder = (left: [number, number, number, string], right: [number, number, number, string]): number =>
  left[0] - right[0] || left[1] - right[1] || left[2] - right[2] || left[3].localeCompare(right[3]);

export function selectCrossSpaceNeighborhood(
  graph: GraphData,
  requestedAnchorId?: string | null,
  limit = 6,
): { nodes: any[]; edges: any[]; anchorNodeId: string | null; omittedCount: number } {
  const nodes = graph.nodes || [];
  if (nodes.length === 0 || limit <= 0) return { nodes: [], edges: [], anchorNodeId: null, omittedCount: nodes.length };
  const byId = new Map(nodes.map(node => [String(node.id), node]));
  const adjacency = new Map(nodes.map(node => [String(node.id), new Set<string>()]));
  for (const edge of graph.edges || []) {
    const source = endpointId(edge.source), target = endpointId(edge.target);
    if (!byId.has(source) || !byId.has(target) || source === target) continue;
    adjacency.get(source)!.add(target);
    adjacency.get(target)!.add(source);
  }
  const sourceIndex = new Map(nodes.map((node, index) => [String(node.id), index]));
  const ranked = [...nodes].sort((left, right) => compareOrder(
    nodeOrder(left, sourceIndex.get(String(left.id)) || 0, adjacency.get(String(left.id))?.size || 0),
    nodeOrder(right, sourceIndex.get(String(right.id)) || 0, adjacency.get(String(right.id))?.size || 0),
  ));
  const anchorNodeId = requestedAnchorId && byId.has(String(requestedAnchorId))
    ? String(requestedAnchorId)
    : String(ranked[0]?.id || '');
  if (!anchorNodeId) return { nodes: [], edges: [], anchorNodeId: null, omittedCount: nodes.length };

  const selectedIds: string[] = [];
  const selected = new Set<string>();
  const queue = [anchorNodeId];
  selected.add(anchorNodeId);
  while (queue.length > 0 && selectedIds.length < limit) {
    const current = queue.shift()!;
    selectedIds.push(current);
    const neighbors = [...(adjacency.get(current) || [])].sort((left, right) => compareOrder(
      nodeOrder(byId.get(left), sourceIndex.get(left) || 0, adjacency.get(left)?.size || 0),
      nodeOrder(byId.get(right), sourceIndex.get(right) || 0, adjacency.get(right)?.size || 0),
    ));
    for (const neighbor of neighbors) {
      if (selected.has(neighbor)) continue;
      selected.add(neighbor);
      queue.push(neighbor);
    }
  }
  if (selectedIds.length < limit) {
    for (const candidate of ranked) {
      const id = String(candidate.id);
      if (selectedIds.includes(id)) continue;
      selectedIds.push(id);
      if (selectedIds.length >= limit) break;
    }
  }
  const visible = new Set(selectedIds);
  return {
    nodes: selectedIds.map(id => byId.get(id)).filter(Boolean),
    edges: (graph.edges || []).filter(edge => visible.has(endpointId(edge.source)) && visible.has(endpointId(edge.target))),
    anchorNodeId,
    omittedCount: Math.max(0, nodes.length - selectedIds.length),
  };
}

function cloneProxyNode(node: any, target: CrossSpaceTarget, entryNode: any, index: number, count: number): any {
  const canonicalNodeId = String(node.id);
  const proxyId = crossSpaceProxyId(target.sourceKey, canonicalNodeId);
  const angle = count <= 1 ? 0 : ((index / count) * Math.PI * 2) - Math.PI / 2;
  const radius = count <= 1 ? 260 : 250 + Math.floor(index / 6) * 120;
  const clone = JSON.parse(JSON.stringify(node));
  delete clone.fx;
  delete clone.fy;
  delete clone.fixed;
  delete clone.structureParentId;
  delete clone.structure;
  clone.id = proxyId;
  clone.x = (Number(entryNode?.x) || 0) + Math.cos(angle) * radius;
  clone.y = (Number(entryNode?.y) || 0) + Math.sin(angle) * radius;
  clone.tags = ['跨空间'];
  clone._sourceTags = Array.isArray(node?.tags) ? [...node.tags] : [];
  clone._localContextProxy = {
    sourceKey: target.sourceKey,
    sourceKind: target.sourceKind,
    sourceLabel: target.sourceLabel,
    sourceGraph: target.sourceGraph,
    canonicalNodeId,
  } satisfies CrossSpaceProxySource;
  clone._isNew = true;
  return clone;
}

export function createCrossSpaceBranch(
  entryNode: any,
  target: CrossSpaceTarget,
  limit = 6,
): CrossSpaceBranch | null {
  if (!entryNode?.id || !target.sourceKey || !target.graph) return null;
  const selected = selectCrossSpaceNeighborhood(target.graph, target.anchorNodeId, limit);
  if (!selected.anchorNodeId || selected.nodes.length === 0) return null;
  const proxyNodes = selected.nodes.map((node, index) => cloneProxyNode(node, target, entryNode, index, selected.nodes.length));
  const proxyByCanonicalId = new Map(proxyNodes.map(node => [node._localContextProxy.canonicalNodeId, node.id]));
  const proxyEdges = selected.edges.flatMap((edge, index) => {
    const source = proxyByCanonicalId.get(endpointId(edge.source));
    const targetId = proxyByCanonicalId.get(endpointId(edge.target));
    if (!source || !targetId) return [];
    const clone = JSON.parse(JSON.stringify(edge));
    clone.source = source;
    clone.target = targetId;
    clone._localContextProxyEdge = true;
    clone._localContextSourceKey = target.sourceKey;
    clone._localContextEdgeKey = `${target.sourceKey}:${index}:${source}:${targetId}`;
    return [clone];
  });
  const anchorProxyId = crossSpaceProxyId(target.sourceKey, selected.anchorNodeId);
  const id = `cross_branch_${stableHash(`${entryNode.id}:${target.sourceKey}:${selected.anchorNodeId}`)}`;
  return {
    id,
    entryNodeId: String(entryNode.id),
    anchorProxyId,
    sourceKey: target.sourceKey,
    sourceLabel: compact(target.sourceLabel) || '另一个空间',
    proxyNodes,
    proxyEdges,
    bridgeEdge: {
      source: String(entryNode.id),
      target: anchorProxyId,
      label: `展开至 ${compact(target.sourceLabel) || '另一个空间'}`,
      arrow: true,
      lineStyle: 'dash-4',
      relationType: 'cross-space-context',
      _localContextCrossSpace: true,
      _localContextProxyEdge: true,
      _localContextBranchId: id,
    },
    omittedCount: selected.omittedCount,
  };
}

export function composeCrossSpaceProjection(
  baseGraph: GraphData,
  requestedBranches: readonly CrossSpaceBranch[],
): CrossSpaceContextProjection {
  const branches: CrossSpaceBranch[] = [];
  const branchIds = new Set<string>();
  for (const branch of requestedBranches) {
    if (!branch || branchIds.has(branch.id)) continue;
    branchIds.add(branch.id);
    branches.push(branch);
  }
  const nodes = [...(baseGraph.nodes || [])];
  const nodeIds = new Set(nodes.map(node => String(node.id)));
  const proxyNodeIds = new Set<string>();
  for (const branch of branches) {
    for (const node of branch.proxyNodes) {
      const id = String(node.id);
      proxyNodeIds.add(id);
      if (nodeIds.has(id)) continue;
      nodeIds.add(id);
      nodes.push(node);
    }
  }

  const edges = [...(baseGraph.edges || [])];
  const edgeKeys = new Set(edges.map(edge => `${endpointId(edge.source)}\u0000${endpointId(edge.target)}\u0000${compact(edge.label)}`));
  const appendEdge = (edge: any) => {
    const source = endpointId(edge.source), target = endpointId(edge.target);
    if (!nodeIds.has(source) || !nodeIds.has(target)) return;
    const key = edge._localContextEdgeKey || `${source}\u0000${target}\u0000${compact(edge.label)}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push(edge);
  };
  for (const branch of branches) {
    branch.proxyEdges.forEach(appendEdge);
    appendEdge(branch.bridgeEdge);
  }
  const proxyEdgeIndexes = new Set<number>();
  edges.forEach((edge, index) => { if (isCrossSpaceProxyEdge(edge)) proxyEdgeIndexes.add(index); });
  return {
    graph: {
      nodes,
      edges,
      groups: [...(baseGraph.groups || [])],
      settings: {
        ...(baseGraph.settings || {}),
        semanticLayoutMemory: undefined,
      } as GraphData['settings'],
    },
    branches,
    proxyNodeIds,
    proxyEdgeIndexes,
  };
}

export function retainCrossSpaceBranches(
  branches: readonly CrossSpaceBranch[],
  activePath: readonly string[],
): CrossSpaceBranch[] {
  const active = new Set(activePath.map(String));
  return branches.filter(branch => active.has(branch.anchorProxyId));
}

