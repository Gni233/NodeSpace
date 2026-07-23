import type { GraphData } from './data/storage';
import { assignCreatedOrder } from './node-order';

export interface StructureNodeData {
  memberIds: string[];
  collapsed: boolean;
}

export interface StructureProjection {
  nodes: any[];
  edges: any[];
  hiddenNodeIds: Set<string>;
}

export const isStructureNode = (node: any): boolean =>
  Array.isArray(node?.structure?.memberIds);

const endpointId = (endpoint: any): string =>
  typeof endpoint === 'object' ? endpoint.id : endpoint;

/**
 * Restores the flat, non-nested structure invariant after an external edit.
 * Structures are considered in graph order, so the first valid structure owns
 * a shared member. Invalid structures are dissolved without recursively
 * re-processing the graph.
 */
export function normalizeStructureRelations(graph: GraphData): void {
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

  for (const structureNode of structures) {
    if (!graph.nodes.includes(structureNode)) continue;
    const memberIds = validMembersByStructure.get(structureNode);
    if (!memberIds) {
      dissolveStructureNode(graph, structureNode.id);
      continue;
    }
    for (const memberId of memberIds) {
      const member = graph.nodes.find(node => node.id === memberId && !isStructureNode(node));
      if (member) member.structureParentId = structureNode.id;
    }
  }
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
  const index = graph.nodes.findIndex(node => node.id === structureId);
  const structureNode = graph.nodes[index];
  if (index < 0 || !isStructureNode(structureNode)) return false;
  const memberIds: string[] = structureNode.structure.memberIds.filter((memberId: string) =>
    graph.nodes.some(node => node.id === memberId),
  );
  const fallbackMemberId = memberIds[0] ?? null;
  const members = new Set<string>(memberIds);
  for (const node of graph.nodes) {
    if (members.has(node.id) && node.structureParentId === structureId) delete node.structureParentId;
  }
  graph.nodes.splice(index, 1);
  for (let edgeIndex = graph.edges.length - 1; edgeIndex >= 0; edgeIndex--) {
    const edge = graph.edges[edgeIndex];
    const source = endpointId(edge.source);
    const target = endpointId(edge.target);
    if (source !== structureId && target !== structureId) continue;
    if (!fallbackMemberId) {
      graph.edges.splice(edgeIndex, 1);
      continue;
    }
    edge.source = source === structureId ? fallbackMemberId : source;
    edge.target = target === structureId ? fallbackMemberId : target;
    if (edge.source === edge.target) graph.edges.splice(edgeIndex, 1);
  }
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
