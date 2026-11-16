import type { GraphData } from './data/storage';

const endpointId = (endpoint: unknown): unknown =>
  endpoint && typeof endpoint === 'object' && 'id' in endpoint ? endpoint.id : endpoint;

interface HierarchyNode {
  collapsed: boolean;
  headingLevel: number;
}

type HierarchyLinks = Map<string, string[]>;

function appendLink(links: HierarchyLinks, from: string, to: string) {
  const targets = links.get(from);
  if (targets) targets.push(to);
  else links.set(from, [to]);
}

function hierarchyIndex(graph: GraphData) {
  const nodes = new Map<string, HierarchyNode>();
  for (const node of graph.nodes || []) {
    if (typeof node?.id !== 'string') continue;
    nodes.set(node.id, node);
  }
  const children: HierarchyLinks = new Map();
  const parents: HierarchyLinks = new Map();
  const references: HierarchyLinks = new Map();
  for (const edge of graph.edges || []) {
    if (edge?._dyingAt || edge?._structureMembership) continue;
    const source = endpointId(edge?.source);
    const target = endpointId(edge?.target);
    if (typeof source !== 'string' || typeof target !== 'string' || source === target) continue;
    const from = nodes.get(source), to = nodes.get(target);
    if (!from || !to) continue;
    if ((to.headingLevel || 6) < (from.headingLevel || 6)) {
      appendLink(references, source, target);
      continue;
    }
    appendLink(children, source, target);
    appendLink(parents, target, source);
  }
  return { nodes, children, parents, references };
}

function markReachable(roots: Iterable<string>, seen: Set<string>, neighbors: (id: string) => readonly string[]) {
  const queue: string[] = [];
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    queue.push(id);
  };
  for (const id of roots) visit(id);
  for (let index = 0; index < queue.length; index++) {
    for (const target of neighbors(queue[index])) visit(target);
  }
}

/** Keep cyclic entry groups visible, including graphs with no zero-indegree nodes. */
function hierarchyEntries(ids: string[], children: HierarchyLinks, parents: HierarchyLinks) {
  const roots = ids.filter(id => !parents.has(id));
  const next = (id: string) => children.get(id) ?? [];
  const reachable = new Set<string>();
  markReachable(roots, reachable, next);
  if (reachable.size === ids.length) return roots;
  const visited = new Set(reachable);
  const finished: string[] = [];

  // Visit unrooted components in reverse finishing order to identify their entries.
  for (const id of ids) {
    if (visited.has(id)) continue;
    const stack = [{ id, child: 0 }];
    visited.add(id);
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const target = next(frame.id)[frame.child++];
      if (target === undefined) {
        finished.push(frame.id);
        stack.pop();
      } else if (!visited.has(target)) {
        visited.add(target);
        stack.push({ id: target, child: 0 });
      }
    }
  }
  for (const id of finished.reverse()) {
    if (reachable.has(id)) continue;
    const entryGroup = new Set<string>();
    markReachable([id], entryGroup, node => (parents.get(node) ?? []).filter(parent => !reachable.has(parent)));
    for (const member of entryGroup) roots.push(member);
    markReachable(entryGroup, reachable, next);
  }
  return roots;
}

function hiddenNodes(index: ReturnType<typeof hierarchyIndex>, extraCollapsed?: string): Set<string> {
  const { nodes, children, parents, references } = index;
  const visible = new Set<string>();
  markReachable(hierarchyEntries([...nodes.keys()], children, parents), visible, id => {
    const links = references.get(id) ?? [];
    return nodes.get(id)?.collapsed || id === extraCollapsed ? links : [...(children.get(id) ?? []), ...links];
  });
  return new Set([...nodes.keys()].filter(id => !visible.has(id)));
}

/** Returns the descendants that no open path still reaches in this graph. */
export function getCollapsedHierarchyHiddenNodeIds(graph: GraphData): Set<string> {
  if (!(graph.nodes || []).some(node => node?.collapsed)) return new Set();
  return hiddenNodes(hierarchyIndex(graph));
}

export type HierarchyFoldAction = 'collapse' | 'collapseAll' | 'expand' | 'expandAll';

/** Plans only actual flag changes. Shared descendants stay open when folding the whole branch. */
export function getHierarchyFoldActions(graph: GraphData, rootId: string): Map<HierarchyFoldAction, string[]> {
  const index = hierarchyIndex(graph);
  const { nodes, children } = index;
  const root = nodes.get(rootId);
  const actions = new Map<HierarchyFoldAction, string[]>();
  if (!root || !children.has(rootId)) return actions;

  const depthById = new Map<string, number>([[rootId, 0]]);
  for (const [id, depth] of depthById) {
    for (const child of children.get(id) ?? []) {
      if (!depthById.has(child)) depthById.set(child, depth + 1);
    }
  }
  const collapsed = [...depthById.keys()].filter(id => nodes.get(id)?.collapsed);
  if (collapsed.length) {
    const nearestDepth = depthById.get(collapsed[0]);
    const firstLayer = collapsed.filter(id => depthById.get(id) === nearestDepth);
    actions.set('expand', firstLayer);
    if (firstLayer.length < collapsed.length) actions.set('expandAll', collapsed);
  }
  if (!root.collapsed) {
    const hidden = hiddenNodes(index, rootId);
    const deeper = [...depthById.keys()].filter(id => hidden.has(id) && children.has(id) && !nodes.get(id)?.collapsed);
    actions.set('collapse', [rootId]);
    if (deeper.length) actions.set('collapseAll', [rootId, ...deeper]);
  }
  return actions;
}
