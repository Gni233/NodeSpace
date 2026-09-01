import type { GraphData } from './data/storage';
import type { SemanticEcho } from './layouts/semantic';

export type LocalContextRelation = 'self' | 'outgoing' | 'incoming' | 'linked' | 'semantic';

export interface LocalContextMember {
  id: string;
  parentId: string | null;
  depth: number;
  relation: LocalContextRelation;
  reason: string;
  score: number;
}

export interface LocalContextStep {
  centerId: string;
  addedIds: string[];
}

/** Pane-local observation state. It is deliberately absent from GraphSettings. */
export interface LocalContextState {
  rootId: string;
  currentId: string;
  path: string[];
  members: LocalContextMember[];
  steps: LocalContextStep[];
  omittedCount: number;
  explicitCount: number;
  semanticCount: number;
  /** Human-readable remote sources currently borrowed into this local view. */
  crossSpaceLabels: string[];
}

export interface LocalContextOptions {
  maxPerStep?: number;
  maxMembers?: number;
  maxDepth?: number;
}

interface Candidate {
  id: string;
  relation: Exclude<LocalContextRelation, 'self'>;
  reason: string;
  score: number;
  order: number;
}

const DEFAULTS: Required<LocalContextOptions> = {
  maxPerStep: 6,
  maxMembers: 20,
  maxDepth: 4,
};

const endpointId = (value: any): string => String(value && typeof value === 'object' ? value.id : value);
const compact = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();

function explicitEdgeScore(edge: any): number {
  if (edge?._obsidianLink) return edge?._obsidianLink?.embed || edge?.relationType === 'obsidian-embed' ? 148 : 142;
  if (edge?.spaceRelationRef) return 138;
  if (edge?._headingHierarchy || /heading|hierarchy|parent|child/i.test(String(edge?.relationType || edge?.kind || ''))) return 132;
  if (edge?.arrow || edge?.directed) return 118;
  return 110;
}

function explicitEdgeReason(edge: any, relation: Candidate['relation']): string {
  const label = compact(edge?.label);
  if (label) return label;
  if (edge?._obsidianLink) {
    if (edge?._obsidianLink?.embed || edge?.relationType === 'obsidian-embed') return '嵌入内容';
    return relation === 'incoming' ? '反向引用' : '显式引用';
  }
  if (edge?.spaceRelationRef) return '跨空间共享';
  if (edge?._headingHierarchy || /heading|hierarchy|parent|child/i.test(String(edge?.relationType || edge?.kind || ''))) {
    return relation === 'incoming' ? '所属结构' : '下级内容';
  }
  return relation === 'incoming' ? '指向这里' : relation === 'outgoing' ? '从这里出发' : '直接相连';
}

function isDirectedEdge(edge: any): boolean {
  return Boolean(
    edge?.arrow
    || edge?.directed
    || edge?._obsidianLink
    || edge?.spaceRelationRef
    || edge?._headingHierarchy
    || /reference|link|embed|backlink|hierarchy|parent|child|directed/i.test(String(edge?.relationType || edge?.kind || '')),
  );
}

function candidatesFor(
  graph: GraphData,
  echoes: readonly SemanticEcho[],
  centerId: string,
): Candidate[] {
  const alive = new Set((graph.nodes || []).map(node => String(node.id)));
  const candidates = new Map<string, Candidate>();
  let order = 0;
  for (const edge of graph.edges || []) {
    const source = endpointId(edge.source), target = endpointId(edge.target);
    if (source !== centerId && target !== centerId) { order += 1; continue; }
    const otherId = source === centerId ? target : source;
    if (!alive.has(otherId) || otherId === centerId) { order += 1; continue; }
    const directed = isDirectedEdge(edge);
    const relation: Candidate['relation'] = !directed
      ? 'linked'
      : source === centerId ? 'outgoing' : 'incoming';
    const candidate = {
      id: otherId,
      relation,
      reason: explicitEdgeReason(edge, relation),
      score: explicitEdgeScore(edge),
      order,
    };
    const previous = candidates.get(otherId);
    if (!previous || candidate.score > previous.score) candidates.set(otherId, candidate);
    order += 1;
  }

  for (const echo of echoes || []) {
    const otherId = echo.source === centerId ? echo.target : echo.target === centerId ? echo.source : '';
    if (!otherId || !alive.has(otherId) || otherId === centerId || candidates.has(otherId)) continue;
    candidates.set(otherId, {
      id: otherId,
      relation: 'semantic',
      reason: compact(echo.reason) || '内容呼应',
      score: 24 + Math.max(0, Math.min(1, Number(echo.score) || 0)) * 46,
      order: order++,
    });
  }

  const relationOrder: Record<Candidate['relation'], number> = {
    outgoing: 0,
    incoming: 1,
    linked: 2,
    semantic: 3,
  };
  return [...candidates.values()].sort((left, right) =>
    right.score - left.score
    || relationOrder[left.relation] - relationOrder[right.relation]
    || left.order - right.order
    || left.id.localeCompare(right.id));
}

function normalizePath(graph: GraphData, requestedPath: readonly string[], maxDepth: number): string[] {
  const alive = new Set((graph.nodes || []).map(node => String(node.id)));
  const path: string[] = [];
  for (const rawId of requestedPath) {
    const id = String(rawId);
    if (!alive.has(id) || path.includes(id)) continue;
    path.push(id);
    if (path.length >= maxDepth) break;
  }
  return path;
}

/** Rebuild from the path so Back is exact and never accumulates stale members. */
export function buildLocalContext(
  graph: GraphData,
  echoes: readonly SemanticEcho[],
  requestedPath: readonly string[],
  options: LocalContextOptions = {},
): LocalContextState | null {
  const limits = { ...DEFAULTS, ...options };
  const path = normalizePath(graph, requestedPath, Math.max(1, limits.maxDepth));
  if (path.length === 0) return null;

  const included = new Set<string>(path);
  const members = new Map<string, LocalContextMember>();
  members.set(path[0], {
    id: path[0], parentId: null, depth: 0, relation: 'self', reason: '观察起点', score: Number.POSITIVE_INFINITY,
  });
  const steps: LocalContextStep[] = [];
  let omittedCount = 0;

  path.forEach((centerId, pathIndex) => {
    if (!members.has(centerId)) {
      members.set(centerId, {
        id: centerId,
        parentId: path[pathIndex - 1] || null,
        depth: pathIndex,
        relation: 'linked',
        reason: '继续观察',
        score: 150,
      });
    }
    const allCandidates = candidatesFor(graph, echoes, centerId);
    const nextPathId = path[pathIndex + 1];
    if (nextPathId && !members.has(nextPathId)) {
      const pathCandidate = allCandidates.find(candidate => candidate.id === nextPathId);
      members.set(nextPathId, {
        id: nextPathId,
        parentId: centerId,
        depth: pathIndex + 1,
        relation: pathCandidate?.relation || 'linked',
        reason: pathCandidate?.reason || '继续观察',
        score: pathCandidate?.score || 150,
      });
    }
    const available = Math.max(0, limits.maxMembers - included.size);
    const candidates = allCandidates.filter(candidate => !included.has(candidate.id));
    const selected = candidates.slice(0, Math.min(limits.maxPerStep, available));
    omittedCount += Math.max(0, candidates.length - selected.length);
    const addedIds: string[] = [];
    for (const candidate of selected) {
      included.add(candidate.id);
      addedIds.push(candidate.id);
      members.set(candidate.id, {
        id: candidate.id,
        parentId: centerId,
        depth: pathIndex + 1,
        relation: candidate.relation,
        reason: candidate.reason,
        score: candidate.score,
      });
    }
    steps.push({ centerId, addedIds });
  });

  const orderedMembers = [...members.values()].sort((left, right) =>
    left.depth - right.depth || right.score - left.score || left.id.localeCompare(right.id));
  const nodeById = new Map((graph.nodes || []).map(node => [String(node.id), node]));
  const crossSpaceLabels = [...new Set(orderedMembers.flatMap(member => {
    const label = String(nodeById.get(member.id)?._localContextProxy?.sourceLabel || '').trim();
    return label ? [label] : [];
  }))];
  return {
    rootId: path[0],
    currentId: path[path.length - 1],
    path,
    members: orderedMembers,
    steps,
    omittedCount,
    explicitCount: orderedMembers.filter(member => member.relation !== 'self' && member.relation !== 'semantic').length,
    semanticCount: orderedMembers.filter(member => member.relation === 'semantic').length,
    crossSpaceLabels,
  };
}

export function startLocalContext(
  graph: GraphData,
  echoes: readonly SemanticEcho[],
  rootId: string,
  options?: LocalContextOptions,
): LocalContextState | null {
  return buildLocalContext(graph, echoes, [rootId], options);
}

export function extendLocalContext(
  graph: GraphData,
  echoes: readonly SemanticEcho[],
  state: LocalContextState,
  targetId: string,
  options: LocalContextOptions = {},
): LocalContextState | null {
  const id = String(targetId);
  const pathIndex = state.path.indexOf(id);
  if (pathIndex >= 0) return buildLocalContext(graph, echoes, state.path.slice(0, pathIndex + 1), options);
  if (!state.members.some(member => member.id === id)) return startLocalContext(graph, echoes, id, options);
  return buildLocalContext(graph, echoes, [...state.path, id], options);
}

export function backLocalContext(
  graph: GraphData,
  echoes: readonly SemanticEcho[],
  state: LocalContextState,
  options?: LocalContextOptions,
): LocalContextState | null {
  if (state.path.length <= 1) return null;
  return buildLocalContext(graph, echoes, state.path.slice(0, -1), options);
}

export function localContextMemberIds(state: LocalContextState | null | undefined): Set<string> {
  return new Set((state?.members || []).map(member => member.id));
}

export function localContextInternalEdgeIndexes(graph: GraphData, state: LocalContextState): Set<number> {
  const memberIds = localContextMemberIds(state);
  const indexes = new Set<number>();
  (graph.edges || []).forEach((edge, index) => {
    if (memberIds.has(endpointId(edge.source)) && memberIds.has(endpointId(edge.target))) indexes.add(index);
  });
  return indexes;
}
