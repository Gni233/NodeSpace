import type { GraphData } from './data/storage';

const endpointId = (endpoint: any): string | undefined =>
  typeof endpoint === 'object' ? endpoint?.id : endpoint;

/**
 * Returns the ordinary nodes hidden by the graph's collapsed hierarchy.
 * Structure projection and pane-only visibility (search, selection, etc.) are
 * intentionally excluded so a simulation always derives its exclusions from
 * its own graph.
 */
export function getCollapsedHierarchyHiddenNodeIds(graph: GraphData): Set<string> {
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  const nodesById = new Map<string, any>(
    nodes
      .filter((node: any) => typeof node?.id === 'string')
      .map((node: any) => [node.id, node]),
  );
  const collapsedNodeIds = new Set<string>(
    nodes
      .filter((node: any) => node?.collapsed && typeof node.id === 'string')
      .map((node: any) => node.id),
  );
  if (collapsedNodeIds.size === 0) return new Set();

  const nonCollapsedIncoming = new Set<string>();
  const hasCollapsedParent = new Set<string>();
  const hasAnyIncoming = new Set<string>();
  for (const edge of edges) {
    const sourceId = endpointId(edge?.source);
    const targetId = endpointId(edge?.target);
    if (typeof sourceId !== 'string' || typeof targetId !== 'string') continue;
    hasAnyIncoming.add(targetId);
    if (!collapsedNodeIds.has(sourceId)) {
      nonCollapsedIncoming.add(targetId);
    } else if (collapsedNodeIds.has(targetId)) {
      hasCollapsedParent.add(targetId);
    }
    // A collapsed source must not hide a higher-level target.
    if (collapsedNodeIds.has(sourceId) && !collapsedNodeIds.has(targetId)) {
      const sourceLevel = nodesById.get(sourceId)?.headingLevel || 6;
      const targetLevel = nodesById.get(targetId)?.headingLevel || 6;
      if (targetLevel < sourceLevel) nonCollapsedIncoming.add(targetId);
    }
  }

  const hiddenNodeIds = new Set<string>();
  for (const id of collapsedNodeIds) {
    if (hasCollapsedParent.has(id) && !nonCollapsedIncoming.has(id)) hiddenNodeIds.add(id);
  }
  for (const node of nodes) {
    const id = node?.id;
    if (typeof id !== 'string' || collapsedNodeIds.has(id)) continue;
    if (hasAnyIncoming.has(id) && !nonCollapsedIncoming.has(id)) hiddenNodeIds.add(id);
  }
  return hiddenNodeIds;
}
