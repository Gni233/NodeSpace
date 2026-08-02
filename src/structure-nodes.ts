import type { GraphData } from './data/storage';
import { assignCreatedOrder } from './node-order';

export interface StructureNodeData {
  memberIds: string[];
  collapsed: boolean;
  purpose?: string;
  summary?: string;
}

export interface StructureProjection {
  nodes: any[];
  edges: any[];
  hiddenNodeIds: Set<string>;
}

export interface StructureProxyNode {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly _structureInteriorProxy: true;
  readonly _externalNodeId: string;
}

export interface StructureProxyEdge {
  readonly source: string;
  readonly target: string;
  readonly _originalIndex: number;
  readonly _structureInteriorProxy: true;
  readonly _externalNodeId: string;
  readonly _direction: 'outbound' | 'inbound';
  readonly originalEdge: any;
}

export interface DirectStructureEdge {
  readonly edge: any;
  readonly originalIndex: number;
  readonly sourceId: string;
  readonly targetId: string;
}

export interface StructureInteriorProjection {
  readonly structureId: string;
  /** Original, valid ordinary-node objects belonging to the structure. */
  readonly memberNodes: readonly any[];
  /** Original edge objects whose two endpoints are members. */
  readonly internalEdges: readonly any[];
  /** Immutable stand-ins for real nodes outside the structure, including structures. */
  readonly externalProxyNodes: readonly StructureProxyNode[];
  /** Immutable edge views from a member to an external proxy. */
  readonly externalProxyEdges: readonly StructureProxyEdge[];
  readonly metadata: Readonly<{
    memberIds: readonly string[];
    invalidMemberIds: readonly string[];
    externalNodeIds: readonly string[];
    boundaryEdgeIndexes: readonly number[];
    directStructureEdges: readonly DirectStructureEdge[];
  }>;
}

export interface StructureNormalizationResult {
  readonly dissolvedStructureIds: readonly string[];
  /** Invalid structures retained because a persistent direct edge protects them. */
  readonly protectedStructureIds: readonly string[];
}

export const isStructureNode = (node: any): boolean =>
  Array.isArray(node?.structure?.memberIds);

const endpointId = (endpoint: any): string | undefined =>
  typeof endpoint === 'object' ? endpoint?.id : endpoint;

const graphNodes = (graph: GraphData): any[] => Array.isArray(graph.nodes) ? graph.nodes : [];
const graphEdges = (graph: GraphData): any[] => Array.isArray(graph.edges) ? graph.edges : [];

export function getDirectStructureEdges(graph: GraphData, structureId: string): DirectStructureEdge[] {
  return graphEdges(graph).flatMap((edge, originalIndex) => {
    if (edge?._structureMembership) return [];
    const sourceId = endpointId(edge?.source);
    const targetId = endpointId(edge?.target);
    return sourceId === structureId || targetId === structureId
      ? [{ edge, originalIndex, sourceId: sourceId ?? '', targetId: targetId ?? '' }]
      : [];
  });
}

export function canDissolveStructure(graph: GraphData, structureId: string): boolean {
  const structureNode = graphNodes(graph).find(node => node?.id === structureId);
  return isStructureNode(structureNode) && getDirectStructureEdges(graph, structureId).length === 0;
}

/**
 * Restores the flat, non-nested structure invariant after an external edit.
 * Structures are considered in graph order, so the first valid structure owns
 * a shared member. Invalid structures with direct persistent edges are retained:
 * deleting one would discard an intentional relationship or require unsafe rewiring.
 */
export function normalizeStructureRelations(graph: GraphData): StructureNormalizationResult {
  graph.nodes ||= [];
  graph.edges ||= [];

  const ordinaryNodeIds = new Set<string>();
  const structures = graph.nodes.filter(isStructureNode);
  for (const node of graph.nodes) {
    delete node.structureParentId;
    if (!isStructureNode(node) && typeof node.id === 'string') ordinaryNodeIds.add(node.id);
  }

  const claimedMemberIds = new Set<string>();
  const validMembersByStructure = new Map<any, string[]>();
  for (const structureNode of structures) {
    const seenMemberIds = new Set<string>();
    const memberIds = structureNode.structure.memberIds.filter((memberId: unknown): memberId is string => {
      if (typeof memberId !== 'string' || seenMemberIds.has(memberId) || claimedMemberIds.has(memberId)) return false;
      if (!ordinaryNodeIds.has(memberId)) return false;
      seenMemberIds.add(memberId);
      return true;
    });
    structureNode.structure.memberIds = memberIds;
    if (memberIds.length >= 2) {
      validMembersByStructure.set(structureNode, memberIds);
      memberIds.forEach((memberId: string) => claimedMemberIds.add(memberId));
    }
  }

  const dissolvedStructureIds: string[] = [];
  const protectedStructureIds: string[] = [];
  for (const structureNode of structures) {
    if (!graph.nodes.includes(structureNode)) continue;
    const memberIds = validMembersByStructure.get(structureNode);
    if (!memberIds) {
      if (dissolveStructureNode(graph, structureNode.id)) dissolvedStructureIds.push(structureNode.id);
      else protectedStructureIds.push(structureNode.id);
      continue;
    }
    for (const memberId of memberIds) {
      const member = graph.nodes.find(node => node.id === memberId && !isStructureNode(node));
      if (member) member.structureParentId = structureNode.id;
    }
  }
  return { dissolvedStructureIds, protectedStructureIds };
}

function validStructureMembers(graph: GraphData, structureNode: any): { memberIds: string[]; invalidMemberIds: string[] } {
  const ordinaryNodes = new Map(
    graphNodes(graph)
      .filter(node => !isStructureNode(node) && typeof node?.id === 'string')
      .map(node => [node.id, node]),
  );
  const seen = new Set<string>();
  const memberIds: string[] = [];
  const invalidMemberIds: string[] = [];
  for (const memberId of structureNode.structure.memberIds) {
    if (typeof memberId !== 'string' || seen.has(memberId) || !ordinaryNodes.has(memberId)) {
      invalidMemberIds.push(typeof memberId === 'string' ? memberId : String(memberId));
      continue;
    }
    seen.add(memberId);
    memberIds.push(memberId);
  }
  return { memberIds, invalidMemberIds };
}

/**
 * Builds a V1, one-level read-only view of a structure's members and boundary.
 * It never changes graph nodes, edges, or their endpoints.
 */
export function getStructureInteriorProjection(graph: GraphData, structureId: string): StructureInteriorProjection | null {
  const structureNode = graphNodes(graph).find(node => node?.id === structureId);
  if (!isStructureNode(structureNode)) return null;

  const { memberIds, invalidMemberIds } = validStructureMembers(graph, structureNode);
  const memberIdSet = new Set(memberIds);
  const ordinaryNodesById = new Map(
    graphNodes(graph)
      .filter(node => !isStructureNode(node) && typeof node?.id === 'string')
      .map(node => [node.id, node]),
  );
  // Interior members remain ordinary nodes, but boundary endpoints can be any
  // real graph node. Structures are represented only by this proxy and never
  // recursively expanded.
  const graphNodesById = new Map(
    graphNodes(graph)
      .filter(node => typeof node?.id === 'string')
      .map(node => [node.id, node]),
  );
  const memberNodes = memberIds.map(memberId => ordinaryNodesById.get(memberId)!);
  const internalEdges: any[] = [];
  const boundaryEdges: Array<{ edge: any; originalIndex: number; memberId: string; externalId: string; direction: 'outbound' | 'inbound' }> = [];

  graphEdges(graph).forEach((edge, originalIndex) => {
    const sourceId = endpointId(edge?.source);
    const targetId = endpointId(edge?.target);
    const sourceIsMember = sourceId !== undefined && memberIdSet.has(sourceId);
    const targetIsMember = targetId !== undefined && memberIdSet.has(targetId);
    if (sourceIsMember && targetIsMember) {
      internalEdges.push(edge);
      return;
    }
    if (sourceIsMember === targetIsMember) return;
    const externalId = sourceIsMember ? targetId : sourceId;
    if (typeof externalId !== 'string' || !graphNodesById.has(externalId)) return;
    boundaryEdges.push({
      edge,
      originalIndex,
      memberId: sourceIsMember ? sourceId! : targetId!,
      externalId,
      direction: sourceIsMember ? 'outbound' : 'inbound',
    });
  });

  const realNodeIds = new Set(graphNodes(graph).map(node => node?.id).filter((id): id is string => typeof id === 'string'));
  const proxyIdByExternalId = new Map<string, string>();
  for (const externalId of [...new Set(boundaryEdges.map(item => item.externalId))]) {
    const encodedExternalId = encodeURIComponent(externalId);
    const baseId = `__structure_proxy__${encodeURIComponent(structureId)}__${encodedExternalId}`;
    let proxyId = baseId;
    let suffix = 1;
    while (realNodeIds.has(proxyId) || [...proxyIdByExternalId.values()].includes(proxyId)) proxyId = `${baseId}__${suffix++}`;
    proxyIdByExternalId.set(externalId, proxyId);
  }

  const externalProxyNodes = [...proxyIdByExternalId].map(([externalId, id]) => {
    const externalNode = graphNodesById.get(externalId)!;
    return Object.freeze({
      id,
      label: typeof externalNode.label === 'string' ? externalNode.label : externalId,
      x: Number.isFinite(externalNode.x) ? externalNode.x : 0,
      y: Number.isFinite(externalNode.y) ? externalNode.y : 0,
      _structureInteriorProxy: true as const,
      _externalNodeId: externalId,
    });
  });
  const externalProxyEdges = boundaryEdges.map(({ edge, originalIndex, memberId, externalId, direction }) => Object.freeze({
    ...edge,
    source: direction === 'outbound' ? memberId : proxyIdByExternalId.get(externalId)!,
    target: direction === 'outbound' ? proxyIdByExternalId.get(externalId)! : memberId,
    _originalIndex: originalIndex,
    _structureInteriorProxy: true as const,
    _externalNodeId: externalId,
    _direction: direction,
    originalEdge: edge,
  }));
  const directStructureEdges = getDirectStructureEdges(graph, structureId);

  return Object.freeze({
    structureId,
    memberNodes: Object.freeze(memberNodes),
    internalEdges: Object.freeze(internalEdges),
    externalProxyNodes: Object.freeze(externalProxyNodes),
    externalProxyEdges: Object.freeze(externalProxyEdges),
    metadata: Object.freeze({
      memberIds: Object.freeze(memberIds),
      invalidMemberIds: Object.freeze(invalidMemberIds),
      externalNodeIds: Object.freeze([...proxyIdByExternalId.keys()]),
      boundaryEdgeIndexes: Object.freeze(boundaryEdges.map(item => item.originalIndex)),
      directStructureEdges: Object.freeze(directStructureEdges),
    }),
  });
}

export function getStructureProjection(graph: GraphData): StructureProjection {
  const graphNodes = graph.nodes || [];
  const structures: any[] = [];
  for (const node of graphNodes) {
    if (isStructureNode(node)) structures.push(node);
  }
  if (structures.length === 0) {
    return { nodes: graphNodes, edges: graph.edges || [], hiddenNodeIds: new Set() };
  }

  const nodeIds = new Set(graphNodes.map(node => node.id));
  const ordinaryNodeIds = new Set(graphNodes.filter(node => !isStructureNode(node)).map(node => node.id));
  const validMembers = (structureNode: any) => {
    const seen = new Set<string>();
    return structureNode.structure.memberIds.filter((memberId: unknown): memberId is string =>
      typeof memberId === 'string' && memberId !== structureNode.id && ordinaryNodeIds.has(memberId) && !seen.has(memberId) && !!seen.add(memberId),
    );
  };
  const collapsedParentByMember = new Map<string, string>();
  const hiddenNodeIds = new Set<string>();
  const expandedMembers = new Map<any, string[]>();

  for (const structureNode of structures) {
    const memberIds = validMembers(structureNode);
    if (structureNode.structure.collapsed) {
      if (memberIds.length < 2) continue;
      for (const memberId of memberIds) {
        collapsedParentByMember.set(memberId, structureNode.id);
        hiddenNodeIds.add(memberId);
      }
    } else if (memberIds.length > 0) {
      expandedMembers.set(structureNode, memberIds);
    }
  }

  if (hiddenNodeIds.size === 0 && expandedMembers.size === 0) {
    return { nodes: graphNodes, edges: graph.edges || [], hiddenNodeIds };
  }

  const nodes = hiddenNodeIds.size === 0 ? graphNodes : graphNodes.filter(node => !hiddenNodeIds.has(node.id));
  const edges: any[] = [];
  (graph.edges || []).forEach((edge: any, originalIndex: number) => {
    const originalSource = endpointId(edge.source);
    const originalTarget = endpointId(edge.target);
    if (typeof originalSource !== 'string' || typeof originalTarget !== 'string') return;
    const source = collapsedParentByMember.get(originalSource) ?? originalSource;
    const target = collapsedParentByMember.get(originalTarget) ?? originalTarget;
    if (source === target || !nodeIds.has(source) || !nodeIds.has(target)) return;
    if (source === originalSource && target === originalTarget) {
      edges.push(edge);
    } else {
      edges.push({ ...edge, source, target, _originalIndex: originalIndex });
    }
  });

  for (const [structureNode, memberIds] of expandedMembers) {
    for (const memberId of memberIds) {
      edges.push({
        source: structureNode.id,
        target: memberId,
        label: '',
        color: structureNode.color || '#7C8AA5',
        lineStyle: 'dash-2',
        arrow: false,
        _structureMembership: true,
      });
    }
  }

  return { nodes, edges, hiddenNodeIds };
}

export function createStructureNode(graph: GraphData, memberIds: string[], label: string): any {
  const uniqueIds = [...new Set(memberIds)];
  const members = uniqueIds
    .map(id => graph.nodes.find(node => node.id === id))
    .filter(Boolean);
  if (members.length < 2) throw new Error('至少需要两个节点');
  if (members.some(node => isStructureNode(node) || node.structureParentId)) {
    throw new Error('第一版暂不支持嵌套结构');
  }

  let id: string;
  do {
    id = `n_structure_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  } while (graph.nodes.some(node => node.id === id));

  const x = members.reduce((sum, node) => sum + (Number.isFinite(node.x) ? node.x : 0), 0) / members.length;
  const y = members.reduce((sum, node) => sum + (Number.isFinite(node.y) ? node.y : 0), 0) / members.length;
  const levels = members.map(node => node.headingLevel || 6);
  const commonTags = (members[0].tags || []).filter((tag: string) =>
    members.every(node => (node.tags || []).includes(tag)),
  );
  const structureNode = {
    id,
    label: label.trim() || `结构 (${members.length})`,
    x,
    y,
    headingLevel: Math.max(1, Math.min(...levels) - 1),
    radiusMode: 'custom',
    radius: Math.min(28, 14 + Math.sqrt(members.length) * 2.5),
    tags: commonTags,
    structure: { memberIds: members.map(node => node.id), collapsed: true } as StructureNodeData,
    _isNew: true,
  };
  assignCreatedOrder(structureNode, graph.nodes);

  for (const member of members) member.structureParentId = id;
  graph.nodes.push(structureNode);
  return structureNode;
}

export function setStructureCollapsed(graph: GraphData, structureId: string, collapsed: boolean): boolean {
  const structureNode = graph.nodes.find(node => node.id === structureId);
  if (!isStructureNode(structureNode)) return false;
  structureNode.structure.collapsed = collapsed;
  return true;
}

export function dissolveStructureNode(graph: GraphData, structureId: string): boolean {
  const index = graphNodes(graph).findIndex(node => node?.id === structureId);
  const structureNode = graph.nodes[index];
  // Check before every mutation: direct edges express a relationship to the
  // structure as a whole and cannot safely be assigned to an arbitrary member.
  if (index < 0 || !isStructureNode(structureNode) || !canDissolveStructure(graph, structureId)) return false;

  const memberIds = validStructureMembers(graph, structureNode).memberIds;
  const members = new Set(memberIds);
  for (const node of graph.nodes) {
    if (members.has(node.id) && node.structureParentId === structureId) delete node.structureParentId;
  }
  graph.nodes.splice(index, 1);
  return true;
}

export function sanitizeCopiedNode(node: any): any {
  const copy = JSON.parse(JSON.stringify(node));
  delete copy.structure;
  delete copy.structureParentId;
  delete copy.createdOrder;
  return copy;
}

export function detachNodeFromStructure(graph: GraphData, nodeId: string): void {
  const node = graph.nodes.find(candidate => candidate.id === nodeId);
  if (isStructureNode(node)) {
    for (const memberId of node.structure.memberIds) {
      const member = graph.nodes.find(candidate => candidate.id === memberId);
      if (member?.structureParentId === nodeId) delete member.structureParentId;
    }
    return;
  }
  const parentId = node?.structureParentId;
  if (!parentId) return;
  const parent = graph.nodes.find(candidate => candidate.id === parentId);
  if (isStructureNode(parent)) {
    parent.structure.memberIds = parent.structure.memberIds.filter((id: string) => id !== nodeId);
    if (parent.structure.memberIds.length < 2) dissolveStructureNode(graph, parentId);
  }
}
