import type { GraphData } from './data/storage';

export interface WorkbenchCover {
  points: Array<{ id: string | null; x: number; y: number; level: number }>;
  links: Array<{ source: string; target: string; x1: number; y1: number; x2: number; y2: number }>;
  nodeCount: number;
  edgeCount: number;
}

const MAX_POINTS = 54;
const MAX_LINKS = 80;
const NODE_SAMPLE = 2048;
const EDGE_SAMPLE = 4096;
const ANCHOR_LINKS = 9;
const COVER_RADIUS = 0.4;

type Position = { x: number; y: number };
type Candidate = { id: string | null; level: number };
type Link = { source: string; target: string };

function graphId(value: unknown): string | null {
  if (typeof value === 'string') return value || null;
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : null;
}

function endpointId(value: unknown): string | null {
  return graphId(value && typeof value === 'object' && 'id' in value ? value.id : value);
}

function readCandidate(value: unknown): Candidate | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { id, headingLevel } = value as Record<string, unknown>;
  const level = typeof headingLevel === 'number' && Number.isFinite(headingLevel)
    ? Math.min(6, Math.max(1, Math.round(headingLevel))) : 4;
  return { id: graphId(id), level };
}

function sample<T>(items: readonly T[], limit: number): T[] {
  if (items.length <= limit) return [...items];
  if (limit === 1) return [items[Math.floor(items.length / 2)]];
  return Array.from({ length: limit }, (_, index) => items[Math.floor(index * (items.length - 1) / (limit - 1))]);
}

function collectLinks(edges: unknown[]): Link[] {
  const links: Link[] = [];
  for (const edge of sample(edges, EDGE_SAMPLE)) {
    if (!edge || typeof edge !== 'object') continue;
    const source = endpointId((edge as Record<string, unknown>).source);
    const target = endpointId((edge as Record<string, unknown>).target);
    if (source !== null && target !== null && source !== target) links.push({ source, target });
  }
  return links;
}

function collectCandidates(nodes: unknown[], anchors: Link[]): Candidate[] {
  const candidates: Candidate[] = [];
  const included = new Set<string>();
  const add = (candidate: Candidate | null) => {
    if (!candidate || (candidate.id !== null && included.has(candidate.id))) return;
    candidates.push(candidate);
    if (candidate.id !== null) included.add(candidate.id);
  };
  for (const node of sample(nodes, NODE_SAMPLE)) add(readCandidate(node));
  if (nodes.length <= NODE_SAMPLE) return candidates;

  // Keep a few actual connections even when sampling a large graph misses their endpoints.
  const wanted = new Set(anchors.flatMap(link => [link.source, link.target]).filter(id => !included.has(id)));
  for (let index = 0; index < nodes.length && wanted.size > 0; index++) {
    const node = nodes[index];
    if (!node || typeof node !== 'object') continue;
    const id = graphId((node as Record<string, unknown>).id);
    if (id !== null && wanted.delete(id)) add(readCandidate(node));
  }
  return candidates;
}

function chooseCandidates(candidates: Candidate[], links: Link[]): Candidate[] {
  if (candidates.length <= MAX_POINTS) return candidates;
  const byId = new Map(candidates.flatMap(candidate => candidate.id === null ? [] : [[candidate.id, candidate] as const]));
  const selected = new Set<Candidate>();
  for (const link of links) {
    const source = byId.get(link.source), target = byId.get(link.target);
    if (source && target) { selected.add(source); selected.add(target); }
  }
  const remaining = candidates.filter(candidate => !selected.has(candidate));
  return [...selected, ...sample(remaining, MAX_POINTS - selected.size)];
}

function layoutCoverPoints(candidates: Candidate[]): Map<Candidate, Position> {
  const byLevel = [...candidates].sort((left, right) => left.level - right.level);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  return new Map(byLevel.map((candidate, index) => {
    const radius = COVER_RADIUS * Math.sqrt(index / Math.max(1, byLevel.length - 1));
    const angle = index * goldenAngle;
    return [candidate, { x: 0.5 + radius * Math.cos(angle), y: 0.5 + radius * Math.sin(angle) }];
  }));
}

/** Build a stable thumbnail from the graph's nodes and links, independent of its canvas layout. */
export function buildWorkbenchCover(graph: GraphData): WorkbenchCover {
  const nodes: unknown[] = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges: unknown[] = Array.isArray(graph?.edges) ? graph.edges : [];
  const availableLinks = collectLinks(edges);
  const anchorLinks = sample(availableLinks, ANCHOR_LINKS);
  const candidates = collectCandidates(nodes, anchorLinks);
  const chosen = chooseCandidates(candidates, anchorLinks);
  const positions = layoutCoverPoints(chosen);
  const byId = new Map<string, Position>();
  const points = chosen.map(candidate => {
    const point = { id: candidate.id, ...positions.get(candidate)!, level: candidate.level };
    if (candidate.id !== null) byId.set(candidate.id, point);
    return point;
  });

  const links: WorkbenchCover['links'] = [];
  const seen = new Set<string>();
  for (const { source, target } of availableLinks) {
    const first = byId.get(source), second = byId.get(target);
    if (!first || !second) continue;
    const key = JSON.stringify(source < target ? [source, target] : [target, source]);
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ source, target, x1: first.x, y1: first.y, x2: second.x, y2: second.y });
    if (links.length === MAX_LINKS) break;
  }
  return { points, links, nodeCount: nodes.length, edgeCount: edges.length };
}
