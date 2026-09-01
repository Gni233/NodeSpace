import type { GraphData } from './data/storage';

export type SpaceReferenceKind = 'node' | 'space' | 'fragment';

/** A saved, named view over part of a graph. The source nodes remain canonical. */
export interface SpaceFragmentDefinition {
  id: string;
  label: string;
  nodeIds: string[];
  createdAt: number;
  updatedAt: number;
}

/** A stable NodeSpace-native pointer. `graph` + `nodeId` is content identity. */
export interface SpaceReference {
  provider: 'nodespace';
  version: 1;
  kind: SpaceReferenceKind;
  graph: string;
  nodeId?: string;
  fragmentId?: string;
  displayLabel?: string;
}

export interface SpaceReferenceMiniMap {
  points: Array<{ id: string; x: number; y: number; label?: string; level?: number }>;
  edges: Array<{ source: string; target: string }>;
}

export interface ResolvedSpaceReference {
  status: 'ok' | 'broken';
  reference: SpaceReference;
  label: string;
  preview: string;
  nodeIds: string[];
  nodes: any[];
  edges: any[];
  miniMap: SpaceReferenceMiniMap;
}

const compactLine = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();

const excerpt = (value: unknown, limit = 260): string => {
  const text = compactLine(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
};

export function normalizeSpaceGraphId(value: unknown): string {
  return String(value ?? '').replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

export function spaceGraphLabel(graphId: string): string {
  const name = normalizeSpaceGraphId(graphId).split('/').pop() || '空间';
  return name.replace(/\.json$/i, '') || name;
}

export function isSpaceReferenceNode(node: any): node is { spaceRef: SpaceReference; [key: string]: any } {
  const reference = node?.spaceRef;
  if (!reference || reference.provider !== 'nodespace' || reference.version !== 1) return false;
  if (!['node', 'space', 'fragment'].includes(reference.kind)) return false;
  if (!normalizeSpaceGraphId(reference.graph)) return false;
  if (reference.kind === 'node') return typeof reference.nodeId === 'string' && Boolean(reference.nodeId);
  if (reference.kind === 'fragment') return typeof reference.fragmentId === 'string' && Boolean(reference.fragmentId);
  return true;
}

export function spaceReferenceKey(reference: SpaceReference): string {
  const tail = reference.kind === 'node'
    ? reference.nodeId || ''
    : reference.kind === 'fragment'
      ? reference.fragmentId || ''
      : '';
  return `${normalizeSpaceGraphId(reference.graph)}::${reference.kind}::${tail}`;
}

export function createNodeSpaceReference(graph: string, node: any): SpaceReference {
  return {
    provider: 'nodespace',
    version: 1,
    kind: 'node',
    graph: normalizeSpaceGraphId(graph),
    nodeId: String(node?.id || ''),
    displayLabel: compactLine(node?.label) || '节点',
  };
}

export function createWholeSpaceReference(graph: string, label = spaceGraphLabel(graph)): SpaceReference {
  return {
    provider: 'nodespace',
    version: 1,
    kind: 'space',
    graph: normalizeSpaceGraphId(graph),
    displayLabel: compactLine(label) || spaceGraphLabel(graph),
  };
}

export function createSpaceFragment(
  graph: GraphData,
  nodeIds: readonly string[],
  label = '',
  options: { id?: string; now?: number } = {},
): SpaceFragmentDefinition {
  const alive = new Set((graph.nodes || []).map(node => String(node.id)));
  const uniqueIds = [...new Set(nodeIds.map(String))].filter(id => alive.has(id));
  const now = options.now ?? Date.now();
  const id = options.id || `fragment_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const nodeLabels = uniqueIds
    .map(nodeId => graph.nodes.find(node => String(node.id) === nodeId)?.label)
    .map(compactLine)
    .filter(Boolean);
  const fragment: SpaceFragmentDefinition = {
    id,
    label: compactLine(label) || nodeLabels.slice(0, 2).join(' · ') || '空间片段',
    nodeIds: uniqueIds,
    createdAt: now,
    updatedAt: now,
  };
  const settings = (graph.settings ||= {} as NonNullable<GraphData['settings']>);
  settings.spaceFragments ||= {};
  settings.spaceFragments[id] = fragment;
  return fragment;
}

export function createFragmentSpaceReference(graph: string, fragment: SpaceFragmentDefinition): SpaceReference {
  return {
    provider: 'nodespace',
    version: 1,
    kind: 'fragment',
    graph: normalizeSpaceGraphId(graph),
    fragmentId: fragment.id,
    displayLabel: fragment.label,
  };
}

export function createSpaceReferenceNode(
  reference: SpaceReference,
  source: any,
  position: { x: number; y: number },
  id = `space_ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
): any {
  const kindLabel = reference.kind === 'node' ? '共享节点' : reference.kind === 'fragment' ? '空间片段' : '空间入口';
  return {
    id,
    label: compactLine(source?.label) || reference.displayLabel || spaceGraphLabel(reference.graph),
    headingLevel: Math.max(1, Math.min(6, Number(source?.headingLevel) || (reference.kind === 'node' ? 3 : 2))),
    tags: [...new Set([...(Array.isArray(source?.tags) ? source.tags.map(String) : []), kindLabel])],
    note: '',
    x: Number(position.x) || 0,
    y: Number(position.y) || 0,
    spaceRef: { ...reference },
    _spaceReferenceStatus: 'ok',
    _spaceReferencePreview: compactLine(source?._spaceReferencePreview || source?.note),
    _isNew: true,
  };
}

const edgeNodeId = (value: any): string => String(value?.id ?? value ?? '');

function miniMapFor(nodes: any[], edges: any[], limit = 24): SpaceReferenceMiniMap {
  const visible = nodes.slice(0, limit);
  if (visible.length === 0) return { points: [], edges: [] };
  const positioned = visible.every(node => Number.isFinite(Number(node.x)) && Number.isFinite(Number(node.y)));
  const raw = visible.map((node, index) => positioned
    ? { id: String(node.id), x: Number(node.x), y: Number(node.y), label: compactLine(node.label), level: Number(node.headingLevel) || 6 }
    : {
      id: String(node.id),
      x: Math.cos((index / Math.max(1, visible.length)) * Math.PI * 2),
      y: Math.sin((index / Math.max(1, visible.length)) * Math.PI * 2),
      label: compactLine(node.label),
      level: Number(node.headingLevel) || 6,
    });
  const xs = raw.map(point => point.x);
  const ys = raw.map(point => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const points = raw.map(point => ({
    id: point.id,
    x: (point.x - minX) / width,
    y: (point.y - minY) / height,
    label: point.label,
    level: point.level,
  }));
  const included = new Set(points.map(point => point.id));
  return {
    points,
    edges: (edges || []).map(edge => ({ source: edgeNodeId(edge.source), target: edgeNodeId(edge.target) }))
      .filter(edge => included.has(edge.source) && included.has(edge.target))
      .slice(0, limit * 2),
  };
}

function broken(reference: SpaceReference): ResolvedSpaceReference {
  return {
    status: 'broken',
    reference,
    label: reference.displayLabel || spaceGraphLabel(reference.graph),
    preview: reference.kind === 'node' ? '共享节点暂时不可用' : '空间入口暂时不可用',
    nodeIds: [],
    nodes: [],
    edges: [],
    miniMap: { points: [], edges: [] },
  };
}

/** Resolve a pointer against its source graph without copying canonical content. */
export function resolveSpaceReference(reference: SpaceReference, graph: GraphData | null): ResolvedSpaceReference {
  if (!graph) return broken(reference);
  let nodes: any[] = [];
  let edges: any[] = [];
  if (reference.kind === 'node') {
    const node = (graph.nodes || []).find(candidate => String(candidate.id) === String(reference.nodeId));
    if (!node) return broken(reference);
    nodes = [node];
  } else if (reference.kind === 'fragment') {
    const fragment = graph.settings?.spaceFragments?.[String(reference.fragmentId || '')];
    if (!fragment) return broken(reference);
    const wanted = new Set(fragment.nodeIds.map(String));
    nodes = (graph.nodes || []).filter(node => wanted.has(String(node.id)));
    const alive = new Set(nodes.map(node => String(node.id)));
    edges = (graph.edges || []).filter(edge => alive.has(edgeNodeId(edge.source)) && alive.has(edgeNodeId(edge.target)));
    if (nodes.length === 0 && fragment.nodeIds.length > 0) return broken(reference);
  } else {
    nodes = [...(graph.nodes || [])];
    edges = [...(graph.edges || [])];
  }

  const labels = nodes.map(node => compactLine(node.label)).filter(Boolean);
  const sourceNode = reference.kind === 'node' ? nodes[0] : null;
  const label = compactLine(sourceNode?.label)
    || (reference.kind === 'fragment'
      ? graph.settings?.spaceFragments?.[String(reference.fragmentId || '')]?.label
      : reference.displayLabel)
    || spaceGraphLabel(reference.graph);
  const nodePreview = excerpt(sourceNode?._resourceReferencePreview || sourceNode?.note);
  const overview = `${nodes.length} 个节点 · ${edges.length} 条线${labels.length ? ` · ${labels.slice(0, 5).join(' · ')}` : ''}`;
  return {
    status: 'ok',
    reference,
    label,
    preview: reference.kind === 'node' ? (nodePreview || '共享自另一个空间 · 双击进入本体') : excerpt(overview),
    nodeIds: nodes.map(node => String(node.id)),
    nodes,
    edges,
    miniMap: miniMapFor(nodes, edges),
  };
}

/** Apply source data as a disposable runtime cache. Snapshot serialization drops `_` fields. */
export function hydrateSpaceReferenceNode(node: any, resolved: ResolvedSpaceReference): void {
  if (!isSpaceReferenceNode(node)) return;
  node._spaceReferenceStatus = resolved.status;
  node._spaceReferencePreview = resolved.preview;
  node._spaceReferenceLabel = resolved.label;
  node._spaceReferenceNodeIds = resolved.nodeIds;
  node._spaceReferenceMiniMap = resolved.miniMap;
  if (resolved.status === 'ok' && node.spaceRef.kind === 'node' && resolved.nodes[0]) {
    const source = resolved.nodes[0];
    node._spaceReferenceSourceNode = source;
    node.label = compactLine(source.label) || node.label;
    node.tags = Array.isArray(source.tags)
      ? [...new Set([...source.tags.map(String), '共享节点'])]
      : ['共享节点'];
    node.headingLevel = Math.max(1, Math.min(6, Number(source.headingLevel) || Number(node.headingLevel) || 3));
  }
}

export function navigationWouldCycle(graphPath: readonly string[], targetGraph: string): boolean {
  const target = normalizeSpaceGraphId(targetGraph).toLocaleLowerCase('zh-CN');
  return graphPath.some(graph => normalizeSpaceGraphId(graph).toLocaleLowerCase('zh-CN') === target);
}

/** Keep live pointers valid when a graph or a containing graph folder is renamed. */
export function rewriteSpaceReferenceGraphIds(graph: GraphData, oldGraph: string, newGraph: string): number {
  const from = normalizeSpaceGraphId(oldGraph).replace(/\/$/, '');
  const to = normalizeSpaceGraphId(newGraph).replace(/\/$/, '');
  let changed = 0;
  for (const node of graph.nodes || []) {
    if (!isSpaceReferenceNode(node)) continue;
    const current = normalizeSpaceGraphId(node.spaceRef.graph);
    if (current !== from && !current.startsWith(`${from}/`)) continue;
    node.spaceRef.graph = `${to}${current.slice(from.length)}`;
    node._spaceReferenceStatus = 'ok';
    changed += 1;
  }
  for (const edge of graph.edges || []) {
    const reference = edge?.spaceRelationRef;
    if (!reference || reference.provider !== 'nodespace') continue;
    const current = normalizeSpaceGraphId(reference.graph);
    if (current !== from && !current.startsWith(`${from}/`)) continue;
    reference.graph = `${to}${current.slice(from.length)}`;
    changed += 1;
  }
  return changed;
}
