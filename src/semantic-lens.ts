import type { SemanticEcho } from './layouts/semantic';

export type SemanticLensBand = 'overview' | 'balanced' | 'reading';
export type SemanticLensDensity = 'full' | 'mixed' | 'nodes';

export interface SemanticLensState {
  band: SemanticLensBand;
  budget: number;
  focusNodeId: string | null;
  expandedNodeIds: string[];
}

export interface SemanticLensOptions {
  nodes: readonly any[];
  edges?: readonly any[];
  echoes?: readonly SemanticEcho[];
  density?: SemanticLensDensity;
  zoom?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  focusNodeId?: string | null;
  previous?: SemanticLensState | null;
  manualForms?: Readonly<Record<string, 'card' | 'node'>>;
}

export interface SemanticLensDecision extends SemanticLensState {
  collapsedNodeIds: Set<string>;
  expandedNodeIdsSet: Set<string>;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const endpointId = (endpoint: any): string => String(endpoint && typeof endpoint === 'object' ? endpoint.id : endpoint);

/** Three zoom bands with asymmetric thresholds prevent wheel-end oscillation. */
export function resolveSemanticLensBand(
  zoom: number,
  previous?: SemanticLensBand | null,
): SemanticLensBand {
  const scale = Number.isFinite(zoom) ? zoom : 1;
  if (previous === 'overview') return scale >= 0.64 ? 'balanced' : 'overview';
  if (previous === 'reading') return scale < 0.86 ? 'balanced' : 'reading';
  if (previous === 'balanced') {
    if (scale < 0.43) return 'overview';
    if (scale >= 1.12) return 'reading';
    return 'balanced';
  }
  if (scale < 0.52) return 'overview';
  if (scale >= 1.02) return 'reading';
  return 'balanced';
}

function cardBudget(
  band: SemanticLensBand,
  nodeCount: number,
  width: number,
  height: number,
  hasFocus: boolean,
): number {
  const areaCapacity = clamp(Math.floor((Math.max(320, width) * Math.max(240, height)) / 108_000), 3, 18);
  const bandBudget = band === 'overview'
    ? Math.max(hasFocus ? 3 : 1, Math.round(areaCapacity * 0.42))
    : band === 'reading'
      ? Math.round(areaCapacity * 1.55)
      : areaCapacity;
  return clamp(bandBudget, 0, nodeCount);
}

function informationScore(node: any, degree: number, sourceIndex: number, total: number): number {
  const labelLength = Array.from(String(node.label || node.id || '')).length;
  const noteLength = Array.from(String(node.note || '')).length;
  const level = clamp(Number(node.headingLevel) || 6, 1, 6);
  const recency = total <= 1 ? 0 : sourceIndex / (total - 1);
  const text = `${node.label || ''}\n${node.note || ''}`;
  const actionable = /(?:todo|待办|提醒|记得|别忘了|[?？]\s*$)/i.test(text) ? 0.12 : 0;
  return Math.min(1, noteLength / 220) * 0.34
    + ((7 - level) / 6) * 0.24
    + Math.min(1, degree / 4) * 0.23
    + Math.min(1, labelLength / 28) * 0.08
    + recency * 0.07
    + (node.fixed ? 0.16 : 0)
    + actionable;
}

/**
 * Allocate a bounded set of readable cards. Explicit relationships are stronger
 * than semantic echoes; previous cards receive only a small hysteresis bonus.
 * The result is view state and never mutates graph data.
 */
export function computeSemanticLens(options: SemanticLensOptions): SemanticLensDecision {
  const nodes = options.nodes || [];
  const ids = nodes.map(node => String(node.id));
  const alive = new Set(ids);
  const density = options.density ?? 'mixed';
  const focusNodeId = options.focusNodeId && alive.has(String(options.focusNodeId))
    ? String(options.focusNodeId)
    : null;
  const band = resolveSemanticLensBand(options.zoom ?? 1, options.previous?.band);
  const budget = cardBudget(
    band,
    nodes.length,
    options.viewportWidth ?? 960,
    options.viewportHeight ?? 640,
    !!focusNodeId,
  );
  const manualForms = options.manualForms || {};
  const manualCards = new Set<string>();
  const manualNodes = new Set<string>();
  for (const [id, form] of Object.entries(manualForms)) {
    if (!alive.has(id)) continue;
    (form === 'card' ? manualCards : manualNodes).add(id);
  }

  const expanded = new Set<string>();
  if (density === 'full') {
    for (const id of ids) if (!manualNodes.has(id)) expanded.add(id);
  } else if (density === 'nodes') {
    // Map is an absolute overview command. Card preferences are retained in
    // settings and become active again after leaving map mode, but they do not
    // punch holes through the compact map itself.
  } else {
    const degree = new Map(ids.map(id => [id, 0]));
    const explicitNeighbors = new Map(ids.map(id => [id, new Set<string>()]));
    for (const edge of options.edges || []) {
      const source = endpointId(edge.source), target = endpointId(edge.target);
      if (!alive.has(source) || !alive.has(target) || source === target) continue;
      degree.set(source, (degree.get(source) || 0) + 1);
      degree.set(target, (degree.get(target) || 0) + 1);
      explicitNeighbors.get(source)!.add(target);
      explicitNeighbors.get(target)!.add(source);
    }
    const scores = new Map<string, number>();
    nodes.forEach((node, index) => {
      const id = String(node.id);
      scores.set(id, informationScore(node, degree.get(id) || 0, index, nodes.length));
    });
    for (const id of options.previous?.expandedNodeIds || []) {
      if (alive.has(id)) scores.set(id, (scores.get(id) || 0) + 0.18);
    }
    if (focusNodeId) {
      scores.set(focusNodeId, (scores.get(focusNodeId) || 0) + 10);
      for (const neighbor of explicitNeighbors.get(focusNodeId) || []) {
        scores.set(neighbor, (scores.get(neighbor) || 0) + 4);
      }
      for (const echo of options.echoes || []) {
        const other = echo.source === focusNodeId ? echo.target : echo.target === focusNodeId ? echo.source : null;
        if (!other || !alive.has(other)) continue;
        scores.set(other, (scores.get(other) || 0) + 1.7 + clamp(echo.score, 0, 1) * 1.3);
      }
    }
    const ranked = ids
      .filter(id => !manualNodes.has(id))
      .sort((a, b) => (scores.get(b) || 0) - (scores.get(a) || 0) || a.localeCompare(b));
    for (const id of manualCards) expanded.add(id);
    const targetCount = Math.max(budget, expanded.size);
    for (const id of ranked) {
      if (expanded.size >= targetCount) break;
      expanded.add(id);
    }
  }
  for (const id of manualNodes) expanded.delete(id);
  if (density !== 'nodes') for (const id of manualCards) expanded.add(id);

  const collapsedNodeIds = new Set(ids.filter(id => !expanded.has(id)));
  const expandedNodeIds = ids.filter(id => expanded.has(id));
  return {
    band,
    budget,
    focusNodeId,
    expandedNodeIds,
    expandedNodeIdsSet: expanded,
    collapsedNodeIds,
  };
}
