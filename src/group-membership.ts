import type { GraphData } from './data/storage';

export const isStructureCollection = (group: any): boolean =>
  group?.collectionKind === 'structure' && typeof group?.structureId === 'string';

export function structureCollectionFor(graph: GraphData, structureId: string): any | undefined {
  return (graph.groups || []).find(group =>
    isStructureCollection(group) && group.structureId === structureId,
  );
}

export function isNodeInGroup(node: any, group: any): boolean {
  if (isStructureCollection(group)) return node?.structureParentId === group.structureId;
  return Array.isArray(node?.tags) && node.tags.includes(group?.label);
}

export function groupMembers(graph: GraphData, group: any, nodes: any[] = graph.nodes || []): any[] {
  return nodes.filter(node => isNodeInGroup(node, group));
}

/** Structure membership is exposed as a computed tag, while user tags remain untouched. */
export function effectiveNodeTags(graph: GraphData, node: any): string[] {
  const tags: string[] = Array.isArray(node?.tags) ? node.tags.map((tag: unknown) => String(tag)) : [];
  const parentId = typeof node?.structureParentId === 'string' ? node.structureParentId : null;
  if (parentId) {
    const structure = (graph.nodes || []).find(candidate => candidate?.id === parentId);
    const label = String(structure?.label || '').trim();
    if (label) tags.push(label);
  }
  return [...new Set<string>(tags)];
}
