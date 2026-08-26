import type { GraphData } from '../data/storage';
import type { LayoutController } from '../layout-controller';

export type SemanticLayoutStrategy = 'layered' | 'radial' | 'semantic' | 'isolated';
export type SemanticCardKind = 'note' | 'fragment' | 'question' | 'task' | 'private';
export type SemanticCardForm = 'card' | 'node';
export type SemanticEchoKind = 'lexical' | 'embedding' | 'hybrid';

export interface SemanticCardMetrics {
  width: number;
  height: number;
  titleLines: number;
  excerpt: string;
  kind: SemanticCardKind;
  form: SemanticCardForm;
  /** Original hierarchy radius retained when a card contracts back into a node. */
  nodeRadius?: number;
}

/** A transient, explainable resemblance. It is never written back as a real edge. */
export interface SemanticEcho {
  source: string;
  target: string;
  score: number;
  kind: SemanticEchoKind;
  reason: string;
  terms: string[];
}

export interface SemanticLayoutPosition {
  x: number;
  y: number;
  component: number;
  rank: number;
  strategy: SemanticLayoutStrategy;
  pinned: boolean;
  card: SemanticCardMetrics;
}

export interface SemanticRegion {
  id: string;
  label: string;
  nodeIds: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  colorIndex: number;
  cohesion: number;
  /** Broad domains contain topic regions; legacy data without this field is a domain. */
  level?: 'domain' | 'topic';
  parentId?: string;
}

export interface SemanticLayoutResult {
  positions: Map<string, SemanticLayoutPosition>;
  regions: SemanticRegion[];
  componentCount: number;
  semanticEdgeCount: number;
  echoes: SemanticEcho[];
}

export type SemanticLayoutSource = 'lexical' | 'dense';

/**
 * A compact memory of layouts produced by the compositor itself. It deliberately
 * does not read freehand node coordinates, so dragging a card never becomes a
 * hidden semantic instruction.
 */
export interface SemanticLayoutMemoryNode {
  x: number;
  y: number;
  fingerprint: string;
  componentKey: string;
  stability: number;
  /** Optional for compatibility with layout memories created before node/card morphing. */
  form?: SemanticCardForm;
}

export interface SemanticLayoutMemory {
  version: 1;
  source: SemanticLayoutSource;
  nodes: Record<string, SemanticLayoutMemoryNode>;
}

export interface SemanticLayoutStabilization {
  result: SemanticLayoutResult;
  memory: SemanticLayoutMemory;
  changedNodeIds: string[];
  newNodeIds: string[];
  movedNodeIds: string[];
  globalReframe: boolean;
}

export interface SemanticLayoutOptions {
  levelSpacing?: number;
  nodeSpacing?: number;
  componentGap?: number;
  semanticNeighborLimit?: number;
  semanticThreshold?: number;
  /** Optional vectors supplied by a local embedding model. Lexical analysis remains the fallback. */
  semanticVectors?: ReadonlyMap<string, readonly number[]>;
  /** Cards listed here are composed and rendered as compact nodes. */
  collapsedNodeIds?: ReadonlySet<string>;
}

const DEFAULTS = {
  levelSpacing: 300,
  nodeSpacing: 34,
  componentGap: 90,
  semanticNeighborLimit: 3,
  semanticThreshold: 0.09,
};

const STOP_WORDS = new Set([
  '一个', '一些', '这个', '那个', '这些', '那些', '然后', '但是', '因为', '所以', '如果', '以及', '或者',
  '就是', '还是', '可以', '可能', '应该', '需要', '感觉', '觉得', '其实', '已经', '没有', '不是', '什么',
  '怎么', '如何', '东西', '事情', '时候', '比较', '非常', '这样', '那样', '自己', '我们', '你们', '他们',
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'into', 'about', 'then', 'than', 'todo',
]);

const PRIVATE_PATTERN = /(?:密码|口令|验证码|恢复码|助记词|私钥|api\s*[_-]?key|access\s*[_-]?token|secret|password|passwd)/i;
const TASK_PATTERN = /(?:^|[\s【\[])(?:todo|待办|提醒|记得|别忘了|完成后|截止|ddl|\[[ x]\])|(?:今天|明天|周[一二三四五六日天]|星期[一二三四五六日天]|月底|下周).{0,10}(?:交|买|回|发|做|完成|预约|提交)/i;

export function isSensitiveSemanticText(value: unknown): boolean {
  return PRIVATE_PATTERN.test(String(value ?? ''));
}

const endpointId = (endpoint: any): string =>
  String(endpoint && typeof endpoint === 'object' ? endpoint.id : endpoint);

const finite = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const nodeOrder = (node: any, sourceIndex: number): number => {
  const value = node.createdOrder ?? node.createdAt ?? node.order;
  return typeof value === 'number' && Number.isFinite(value) ? value : sourceIndex;
};

const relationKind = (edge: any): string =>
  String(edge.kind ?? edge.relationType ?? edge.semanticType ?? '').trim().toLowerCase();

const isDirectedRelation = (edge: any): boolean => {
  if (edge._structureMembership) return true;
  if (edge.arrow === true || edge.directed === true) return true;
  return /^(hierarchy|parent|child|contains|membership|dependency|depends|sequence|flow)$/.test(relationKind(edge));
};

function stableHash(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeText(value: unknown): string {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/https?:\/\/\S+/g, ' URL ');
}

let zhSegmenter: any | null | undefined;
function segmentWords(text: string): string[] {
  if (zhSegmenter === undefined) {
    try {
      const Segmenter = (Intl as any).Segmenter;
      zhSegmenter = Segmenter ? new Segmenter('zh-CN', { granularity: 'word' }) : null;
    } catch {
      zhSegmenter = null;
    }
  }
  if (!zhSegmenter) return [];
  const words: string[] = [];
  for (const part of zhSegmenter.segment(text)) {
    const word = String(part.segment || '').trim();
    if (!part.isWordLike || word.length < 2 || STOP_WORDS.has(word)) continue;
    words.push(word);
  }
  return words;
}

/** Local, deterministic tokenizer used when no embedding provider is available. */
export function tokenizeSemanticText(value: unknown): string[] {
  const text = normalizeText(value);
  const tokens: string[] = [];
  for (const word of segmentWords(text)) tokens.push(`w:${word}`);
  for (const word of text.match(/[a-z][a-z0-9_+-]{1,31}/g) || []) {
    if (!STOP_WORDS.has(word)) tokens.push(`w:${word}`);
  }
  // Character bigrams preserve useful Chinese overlap even when platform word
  // segmentation differs. They are down-weighted later and never shown first.
  for (const run of text.match(/[\u3400-\u9fff]{2,}/g) || []) {
    for (let index = 0; index < run.length - 1; index++) {
      const gram = run.slice(index, index + 2);
      if (!STOP_WORDS.has(gram)) tokens.push(`c:${gram}`);
    }
  }
  return tokens;
}

function cardKind(node: any, text: string): SemanticCardKind {
  if (PRIVATE_PATTERN.test(text)) return 'private';
  if (TASK_PATTERN.test(text)) return 'task';
  if (/[?？]\s*$/.test(text) || /^(?:为什么|为何|怎么|如何|是否|能不能)/.test(text.trim())) return 'question';
  if (text.replace(/\s/g, '').length <= 18 && !String(node.note || '').trim()) return 'fragment';
  return 'note';
}

function truncateExcerpt(text: string, limit: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
}

function computeCardMetrics(node: any, collapsed = false): SemanticCardMetrics {
  const label = String(node.label || node.id || '').trim();
  const note = String(node.note || '').trim();
  const combined = `${label}\n${note}`.trim();
  const kind = cardKind(node, combined);
  if (collapsed) {
    const level = clamp(Math.round(finite(node.headingLevel, 6)), 1, 6);
    const nodeRadius = [22, 19, 16, 13, 10, 7][level - 1];
    // The circle contracts to the legacy hierarchy radius, while its compact
    // title still owns enough layout space to avoid the label collisions that
    // a force-directed view could tolerate but a composed view should not.
    const visibleTitleLength = Math.min(9, Math.max(1, Array.from(label).length));
    const width = Math.max(nodeRadius * 2 + 8, visibleTitleLength * 15 + 10);
    const height = Math.max(nodeRadius * 2 + 8, (nodeRadius + 22) * 2);
    return { width, height, titleLines: 1, excerpt: '', kind, form: 'node', nodeRadius };
  }
  const titleLength = Math.max(4, label.replace(/\s/g, '').length);
  const width = clamp(158 + Math.sqrt(titleLength) * 13 + Math.min(34, note.length * 0.18), 172, 246);
  const titleCapacity = Math.max(8, Math.floor((width - 48) / 16));
  const titleLines = clamp(Math.ceil(titleLength / titleCapacity), 1, 2);
  const availableChars = Math.max(11, Math.floor((width - 30) / 13));
  const excerpt = kind === 'private' ? '敏感内容不参与语义分析' : truncateExcerpt(note, availableChars * 3);
  const bodyLines = excerpt ? clamp(Math.ceil(excerpt.length / availableChars), 1, 3) : 0;
  const height = clamp(58 + (titleLines - 1) * 19 + bodyLines * 18 + (kind === 'task' ? 5 : 0), 64, 145);
  return { width: Math.round(width), height: Math.round(height), titleLines, excerpt, kind, form: 'card' };
}

interface IndexedNode {
  node: any;
  id: string;
  sourceIndex: number;
  order: number;
  card: SemanticCardMetrics;
}

interface TextProfile {
  id: string;
  sensitive: boolean;
  weights: Map<string, number>;
  topTerms: string[];
}

interface SemanticAffinity {
  source: string;
  target: string;
  similarity: number;
  lexicalSimilarity: number;
  denseSimilarity: number;
  /** Both endpoints selected each other as locally useful neighbors. */
  mutual: boolean;
}

interface TextAnalysis {
  profiles: Map<string, TextProfile>;
  affinities: SemanticAffinity[];
}

function cosineDense(a: readonly number[] | undefined, b: readonly number[] | undefined): number {
  if (!a || !b || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0, aa = 0, bb = 0;
  for (let index = 0; index < a.length; index++) {
    const av = finite(a[index]);
    const bv = finite(b[index]);
    dot += av * bv;
    aa += av * av;
    bb += bv * bv;
  }
  return aa > 0 && bb > 0 ? dot / Math.sqrt(aa * bb) : 0;
}

function buildTextAnalysis(
  indexed: IndexedNode[],
  edges: any[],
  options: Required<Omit<SemanticLayoutOptions, 'semanticVectors' | 'collapsedNodeIds'>> & Pick<SemanticLayoutOptions, 'semanticVectors'>,
): TextAnalysis {
  const edgeTextByNode = new Map(indexed.map(item => [item.id, [] as string[]]));
  for (const edge of edges) {
    const text = `${edge.label || ''} ${relationKind(edge)}`.trim();
    if (!text) continue;
    edgeTextByNode.get(endpointId(edge.source))?.push(text);
    edgeTextByNode.get(endpointId(edge.target))?.push(text);
  }

  const countsById = new Map<string, Map<string, number>>();
  const documentFrequency = new Map<string, number>();
  for (const item of indexed) {
    const raw = `${item.node.label || ''}\n${item.node.note || ''}\n${(item.node.tags || []).join(' ')}\n${(edgeTextByNode.get(item.id) || []).join(' ')}`;
    const sensitive = PRIVATE_PATTERN.test(raw);
    const safeText = sensitive ? String(item.node.label || '') : raw;
    const counts = new Map<string, number>();
    for (const token of tokenizeSemanticText(safeText)) counts.set(token, (counts.get(token) || 0) + 1);
    countsById.set(item.id, counts);
    for (const token of counts.keys()) documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
  }

  const profiles = new Map<string, TextProfile>();
  const count = Math.max(1, indexed.length);
  for (const item of indexed) {
    const counts = countsById.get(item.id)!;
    const weights = new Map<string, number>();
    let norm = 0;
    for (const [token, frequency] of counts) {
      const df = documentFrequency.get(token) || 1;
      const idf = Math.log(1 + (count + 0.5) / (df + 0.5));
      const familyWeight = token.startsWith('w:') ? 1 : 0.38;
      const weight = (1 + Math.log(frequency)) * idf * familyWeight;
      weights.set(token, weight);
      norm += weight * weight;
    }
    const scale = norm > 0 ? 1 / Math.sqrt(norm) : 0;
    for (const [token, weight] of weights) weights.set(token, weight * scale);
    const topTerms = [...weights]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([token]) => token)
      .filter(token => token.startsWith('w:'))
      .slice(0, 8);
    profiles.set(item.id, {
      id: item.id,
      sensitive: PRIVATE_PATTERN.test(`${item.node.label || ''}\n${item.node.note || ''}`),
      weights,
      topTerms,
    });
  }

  const postings = new Map<string, { id: string; weight: number }[]>();
  for (const profile of profiles.values()) {
    if (profile.sensitive) continue;
    for (const [token, weight] of profile.weights) {
      if (!postings.has(token)) postings.set(token, []);
      postings.get(token)!.push({ id: profile.id, weight });
    }
  }
  const pairScores = new Map<string, number>();
  const pairKey = (a: string, b: string) => a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
  for (const list of postings.values()) {
    // Very frequent terms are weak evidence and create quadratic pair tables.
    // This cap is what keeps a large single-file notebook comfortably local.
    if (list.length > Math.max(72, indexed.length * 0.18)) continue;
    for (let left = 0; left < list.length; left++) {
      for (let right = left + 1; right < list.length; right++) {
        const key = pairKey(list[left].id, list[right].id);
        pairScores.set(key, (pairScores.get(key) || 0) + list[left].weight * list[right].weight);
      }
    }
  }

  const lexicalScores = new Map(pairScores);
  const denseScores = new Map<string, number>();

  if (options.semanticVectors && indexed.length <= 600) {
    for (let left = 0; left < indexed.length; left++) {
      for (let right = left + 1; right < indexed.length; right++) {
        const a = indexed[left].id, b = indexed[right].id;
        if (profiles.get(a)?.sensitive || profiles.get(b)?.sensitive) continue;
        const dense = Math.max(0, cosineDense(options.semanticVectors.get(a), options.semanticVectors.get(b)));
        // Small embedding models have a noticeable positive cosine baseline for
        // unrelated short notes. Remove it before blending so "both are Chinese
        // sentences" does not become a visual relationship.
        const denseSignal = clamp((dense - 0.28) / 0.62, 0, 1);
        if (denseSignal <= 0) continue;
        const key = pairKey(a, b);
        denseScores.set(key, denseSignal);
        const lexical = pairScores.get(key) || 0;
        pairScores.set(key, lexical > 0 ? lexical * 0.36 + denseSignal * 0.64 : denseSignal * 0.72);
      }
    }
  }

  const neighbors = new Map(indexed.map(item => [item.id, [] as { id: string; score: number }[]]));
  for (const [key, score] of pairScores) {
    if (score < options.semanticThreshold) continue;
    const [a, b] = key.split('\u0000');
    neighbors.get(a)?.push({ id: b, score });
    neighbors.get(b)?.push({ id: a, score });
  }
  for (const list of neighbors.values()) list.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const chosen = new Map<string, Set<string>>();
  for (const [id, list] of neighbors) {
    const best = list[0]?.score || 0;
    const floor = Math.max(options.semanticThreshold, best * 0.56);
    chosen.set(id, new Set(list.filter(item => item.score >= floor).slice(0, options.semanticNeighborLimit).map(item => item.id)));
  }
  const affinities: SemanticAffinity[] = [];
  for (const [key, similarity] of pairScores) {
    const [source, target] = key.split('\u0000');
    const mutual = chosen.get(source)?.has(target) && chosen.get(target)?.has(source);
    if (!mutual && similarity < 0.34) continue;
    affinities.push({
      source,
      target,
      similarity,
      lexicalSimilarity: lexicalScores.get(key) || 0,
      denseSimilarity: denseScores.get(key) || 0,
      mutual: !!mutual,
    });
  }
  affinities.sort((a, b) => b.similarity - a.similarity || `${a.source}:${a.target}`.localeCompare(`${b.source}:${b.target}`));
  return { profiles, affinities };
}

interface ComponentLayout {
  ids: string[];
  local: Map<string, { x: number; y: number; rank: number }>;
  strategy: SemanticLayoutStrategy;
  minOrder: number;
  width: number;
  height: number;
  minX: number;
  minY: number;
  cohesion: number;
  domain?: number;
}

function computeBounds(ids: string[], local: Map<string, { x: number; y: number }>, byId: Map<string, IndexedNode>) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of ids) {
    const point = local.get(id)!;
    const card = byId.get(id)!.card;
    minX = Math.min(minX, point.x - card.width / 2);
    minY = Math.min(minY, point.y - card.height / 2);
    maxX = Math.max(maxX, point.x + card.width / 2);
    maxY = Math.max(maxY, point.y + card.height / 2);
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, width: 1, height: 1 };
  return { minX, minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

function chooseRoot(ids: string[], adjacency: Map<string, Set<string>>, incoming: Map<string, number>, byId: Map<string, IndexedNode>): string {
  return [...ids].sort((a, b) => {
    const an = byId.get(a)!;
    const bn = byId.get(b)!;
    const ah = finite(an.node.headingLevel, 6);
    const bh = finite(bn.node.headingLevel, 6);
    const ai = incoming.get(a) || 0;
    const bi = incoming.get(b) || 0;
    const ad = adjacency.get(a)?.size || 0;
    const bd = adjacency.get(b)?.size || 0;
    return ah - bh || ai - bi || bd - ad || an.order - bn.order || a.localeCompare(b);
  })[0];
}

function ranksFromRoot(root: string, ids: string[], adjacency: Map<string, Set<string>>): Map<string, number> {
  const ranks = new Map<string, number>([[root, 0]]);
  const queue = [root];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    const nextRank = (ranks.get(current) || 0) + 1;
    for (const neighbor of adjacency.get(current) || []) {
      if (ranks.has(neighbor)) continue;
      ranks.set(neighbor, nextRank);
      queue.push(neighbor);
    }
  }
  for (const id of ids) if (!ranks.has(id)) ranks.set(id, 0);
  return ranks;
}

function verticalCenters(ids: string[], byId: Map<string, IndexedNode>, gap: number): Map<string, number> {
  const total = ids.reduce((sum, id) => sum + byId.get(id)!.card.height, 0) + Math.max(0, ids.length - 1) * gap;
  const centers = new Map<string, number>();
  let cursor = -total / 2;
  for (const id of ids) {
    const height = byId.get(id)!.card.height;
    centers.set(id, cursor + height / 2);
    cursor += height + gap;
  }
  return centers;
}

function semanticSeriation(ids: string[], affinities: SemanticAffinity[], byId: Map<string, IndexedNode>): string[] {
  const score = new Map(ids.map(id => [id, 0]));
  const pair = new Map<string, number>();
  const key = (a: string, b: string) => a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
  for (const affinity of affinities) {
    if (!score.has(affinity.source) || !score.has(affinity.target)) continue;
    score.set(affinity.source, (score.get(affinity.source) || 0) + affinity.similarity);
    score.set(affinity.target, (score.get(affinity.target) || 0) + affinity.similarity);
    pair.set(key(affinity.source, affinity.target), affinity.similarity);
  }
  const remaining = new Set(ids);
  const first = [...ids].sort((a, b) => (score.get(b) || 0) - (score.get(a) || 0)
    || byId.get(a)!.order - byId.get(b)!.order || a.localeCompare(b))[0];
  const ordered = [first];
  remaining.delete(first);
  while (remaining.size > 0) {
    const previous = ordered[ordered.length - 1];
    const next = [...remaining].sort((a, b) => (pair.get(key(previous, b)) || 0) - (pair.get(key(previous, a)) || 0)
      || (score.get(b) || 0) - (score.get(a) || 0)
      || byId.get(a)!.order - byId.get(b)!.order || a.localeCompare(b))[0];
    ordered.push(next);
    remaining.delete(next);
  }
  return ordered;
}

function layoutSemanticGrid(ids: string[], ordered: string[], byId: Map<string, IndexedNode>, gap: number) {
  const columns = Math.max(1, Math.ceil(Math.sqrt(ids.length * 1.35)));
  const rows = Math.ceil(ids.length / columns);
  const columnWidths = Array.from({ length: columns }, () => 0);
  const rowHeights = Array.from({ length: rows }, () => 0);
  ordered.forEach((id, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const card = byId.get(id)!.card;
    columnWidths[column] = Math.max(columnWidths[column], card.width);
    rowHeights[row] = Math.max(rowHeights[row], card.height);
  });
  const columnX: number[] = [];
  const rowY: number[] = [];
  let cursorX = 0;
  for (const width of columnWidths) { columnX.push(cursorX + width / 2); cursorX += width + gap; }
  let cursorY = 0;
  for (const height of rowHeights) { rowY.push(cursorY + height / 2); cursorY += height + gap; }
  const totalWidth = Math.max(0, cursorX - gap);
  const totalHeight = Math.max(0, cursorY - gap);
  const local = new Map<string, { x: number; y: number; rank: number }>();
  ordered.forEach((id, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const visualColumn = row % 2 === 0 ? column : columns - 1 - column;
    local.set(id, { x: columnX[visualColumn] - totalWidth / 2, y: rowY[row] - totalHeight / 2, rank: row });
  });
  return local;
}

function layoutComponent(
  ids: string[],
  componentEdges: any[],
  componentAffinities: SemanticAffinity[],
  explicitAdjacency: Map<string, Set<string>>,
  incoming: Map<string, number>,
  byId: Map<string, IndexedNode>,
  options: Required<Omit<SemanticLayoutOptions, 'semanticVectors' | 'collapsedNodeIds'>>,
): ComponentLayout {
  const minOrder = Math.min(...ids.map(id => byId.get(id)!.order));
  const cohesion = componentAffinities.length
    ? componentAffinities.reduce((sum, affinity) => sum + affinity.similarity, 0) / componentAffinities.length
    : 0;
  if (ids.length === 1) {
    const local = new Map([[ids[0], { x: 0, y: 0, rank: 0 }]]);
    return { ids, local, strategy: 'isolated', minOrder, cohesion, ...computeBounds(ids, local, byId) };
  }

  if (componentEdges.length === 0) {
    const ordered = semanticSeriation(ids, componentAffinities, byId);
    const local = layoutSemanticGrid(ids, ordered, byId, Math.max(26, options.nodeSpacing));
    return { ids, local, strategy: 'semantic', minOrder, cohesion, ...computeBounds(ids, local, byId) };
  }

  const root = chooseRoot(ids, explicitAdjacency, incoming, byId);
  const bfsRanks = ranksFromRoot(root, ids, explicitAdjacency);
  const headingValues = ids.map(id => finite(byId.get(id)!.node.headingLevel, 6));
  const minHeading = Math.min(...headingValues);
  const headingVaries = Math.max(...headingValues) > minHeading;
  const rankableEdges = componentEdges.filter(edge => {
    if (isDirectedRelation(edge)) return true;
    const source = byId.get(endpointId(edge.source))?.node;
    const target = byId.get(endpointId(edge.target))?.node;
    return source && target && source.headingLevel !== target.headingLevel;
  }).length;
  const layered = componentEdges.some(isDirectedRelation)
    || (headingVaries && rankableEdges >= Math.max(1, componentEdges.length * 0.6));
  const strategy: SemanticLayoutStrategy = layered ? 'layered' : 'radial';
  const ranks = new Map<string, number>();
  for (const id of ids) {
    const node = byId.get(id)!.node;
    ranks.set(id, layered && headingVaries
      ? Math.max(0, finite(node.headingLevel, minHeading) - minHeading)
      : (bfsRanks.get(id) || 0));
  }

  const byRank = new Map<number, string[]>();
  for (const id of ids) {
    const rank = ranks.get(id) || 0;
    if (!byRank.has(rank)) byRank.set(rank, []);
    byRank.get(rank)!.push(id);
  }
  for (const rankIds of byRank.values()) {
    rankIds.sort((a, b) => byId.get(a)!.order - byId.get(b)!.order || a.localeCompare(b));
  }

  const local = new Map<string, { x: number; y: number; rank: number }>();
  if (layered) {
    const orderedRanks = [...byRank.keys()].sort((a, b) => a - b);
    const rankWidths = orderedRanks.map(rank => Math.max(...byRank.get(rank)!.map(id => byId.get(id)!.card.width)));
    const rankX = new Map<number, number>();
    let cursor = 0;
    orderedRanks.forEach((rank, index) => {
      rankX.set(rank, cursor + rankWidths[index] / 2);
      cursor += rankWidths[index] + Math.max(58, options.levelSpacing - 220);
    });
    const totalWidth = Math.max(0, cursor - Math.max(58, options.levelSpacing - 220));
    for (const rank of orderedRanks) {
      const rankIds = byRank.get(rank)!;
      const ys = verticalCenters(rankIds, byId, Math.max(24, options.nodeSpacing));
      for (const id of rankIds) local.set(id, { x: rankX.get(rank)! - totalWidth / 2, y: ys.get(id)!, rank });
    }
  } else {
    local.set(root, { x: 0, y: 0, rank: 0 });
    for (const [rank, rankIds] of [...byRank].sort((a, b) => a[0] - b[0])) {
      const members = rankIds.filter(id => id !== root);
      if (members.length === 0) continue;
      const maxDiagonal = Math.max(...members.map(id => Math.hypot(byId.get(id)!.card.width, byId.get(id)!.card.height)));
      const radius = Math.max(options.levelSpacing, (members.length * (maxDiagonal + options.nodeSpacing)) / (2 * Math.PI));
      members.forEach((id, index) => {
        const angle = index / members.length * Math.PI * 2 - Math.PI / 2;
        local.set(id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, rank });
      });
    }
  }
  return { ids, local, strategy, minOrder, cohesion, ...computeBounds(ids, local, byId) };
}

/**
 * Splits a broad connected domain into locally cohesive topics. Connected
 * components are deliberately not enough here: one bridge such as
 * “machine-learning → artificial-intelligence → computer-vision” would merge
 * every course. Topic edges therefore need reciprocal/local evidence, while
 * explicit containment remains authoritative.
 */
function partitionSemanticTopics(
  ids: readonly string[],
  affinities: readonly SemanticAffinity[],
  edges: readonly any[],
  byId: ReadonlyMap<string, IndexedNode>,
  options: Required<Omit<SemanticLayoutOptions, 'semanticVectors' | 'collapsedNodeIds'>>,
): string[][] {
  const orderedIds = [...ids].sort((a, b) => byId.get(a)!.order - byId.get(b)!.order || a.localeCompare(b));
  if (orderedIds.length < 4) return [orderedIds];
  const idSet = new Set(orderedIds);
  const localAffinities = affinities.filter(affinity => idSet.has(affinity.source) && idSet.has(affinity.target));
  if (localAffinities.length === 0) return [orderedIds];

  const parent = new Map(orderedIds.map(id => [id, id]));
  const find = (id: string): string => {
    let root = parent.get(id) || id;
    while ((parent.get(root) || root) !== root) root = parent.get(root)!;
    let current = id;
    while ((parent.get(current) || current) !== root) {
      const next = parent.get(current)!;
      parent.set(current, root);
      current = next;
    }
    return root;
  };
  const unite = (a: string, b: string) => {
    const rootA = find(a), rootB = find(b);
    if (rootA === rootB) return;
    const first = byId.get(rootA)!.order <= byId.get(rootB)!.order ? rootA : rootB;
    parent.set(first === rootA ? rootB : rootA, first);
  };

  const neighborLists = new Map(orderedIds.map(id => [id, [] as { id: string; score: number }[]]));
  for (const affinity of localAffinities) {
    neighborLists.get(affinity.source)!.push({ id: affinity.target, score: affinity.similarity });
    neighborLists.get(affinity.target)!.push({ id: affinity.source, score: affinity.similarity });
  }
  for (const list of neighborLists.values()) list.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const nearest = new Map([...neighborLists].map(([id, list]) => [id, list.slice(0, options.semanticNeighborLimit)]));

  for (const affinity of localAffinities) {
    const sourceNeighbors = nearest.get(affinity.source) || [];
    const targetNeighbors = nearest.get(affinity.target) || [];
    const sourceRank = sourceNeighbors.findIndex(item => item.id === affinity.target);
    const targetRank = targetNeighbors.findIndex(item => item.id === affinity.source);
    const bestFloor = Math.max(1e-6, Math.min(sourceNeighbors[0]?.score || 0, targetNeighbors[0]?.score || 0));
    const relativeStrength = affinity.similarity / bestFloor;
    const sourceSet = new Set(sourceNeighbors.map(item => item.id));
    const sharedNeighbors = targetNeighbors.filter(item => sourceSet.has(item.id)).length;
    const reciprocalBest = sourceRank === 0 && targetRank === 0;
    const highConfidence = affinity.similarity >= Math.max(0.22, options.semanticThreshold * 2.8);
    const reciprocalLocal = affinity.mutual
      && sourceRank >= 0 && sourceRank < 2
      && targetRank >= 0 && targetRank < 2
      && relativeStrength >= 0.76
      && (sharedNeighbors > 0 || reciprocalBest || highConfidence);
    const triangulated = sharedNeighbors >= 2 && relativeStrength >= 0.66;
    if (reciprocalLocal || triangulated) unite(affinity.source, affinity.target);
  }

  // A declared container is a real hierarchy. Ordinary and dependency edges
  // may cross courses, so they remain visible relations without gluing topics.
  for (const edge of edges) {
    const source = endpointId(edge.source), target = endpointId(edge.target);
    if (!idSet.has(source) || !idSet.has(target)) continue;
    const containment = !!edge._structureMembership
      || /^(hierarchy|parent|child|contains|membership)$/.test(relationKind(edge));
    if (containment) unite(source, target);
  }
  for (const id of orderedIds) {
    const structureParent = byId.get(id)?.node?.structureParentId;
    if (structureParent != null && idSet.has(String(structureParent))) unite(id, String(structureParent));
  }

  const grouped = new Map<string, string[]>();
  for (const id of orderedIds) {
    const root = find(id);
    if (!grouped.has(root)) grouped.set(root, []);
    grouped.get(root)!.push(id);
  }
  const groups = [...grouped.values()].sort((a, b) => byId.get(a[0])!.order - byId.get(b[0])!.order || a[0].localeCompare(b[0]));
  if (groups.length <= 1) return [orderedIds];
  const substantive = groups.filter(group => group.length >= 2);
  const largest = Math.max(...groups.map(group => group.length));
  const supported = substantive.length >= 2 || largest <= orderedIds.length * 0.78;
  return supported ? groups : [orderedIds];
}

function resolveOverlaps(
  positions: Map<string, SemanticLayoutPosition>,
  ordered: IndexedNode[],
  placementPriority?: ReadonlyMap<string, number>,
): void {
  type Placed = { id: string; x: number; y: number; width: number; height: number };
  const cellSize = 150;
  const spatial = new Map<string, Placed[]>();
  const cellsFor = (x: number, y: number, width: number, height: number) => {
    const cells: string[] = [];
    const minX = Math.floor((x - width / 2) / cellSize), maxX = Math.floor((x + width / 2) / cellSize);
    const minY = Math.floor((y - height / 2) / cellSize), maxY = Math.floor((y + height / 2) / cellSize);
    for (let cx = minX; cx <= maxX; cx++) for (let cy = minY; cy <= maxY; cy++) cells.push(`${cx},${cy}`);
    return cells;
  };
  const collides = (candidate: Placed) => {
    const seen = new Set<string>();
    for (const key of cellsFor(candidate.x, candidate.y, candidate.width, candidate.height)) {
      for (const other of spatial.get(key) || []) {
        if (seen.has(other.id)) continue;
        seen.add(other.id);
        if (Math.abs(candidate.x - other.x) < (candidate.width + other.width) / 2 + 12
          && Math.abs(candidate.y - other.y) < (candidate.height + other.height) / 2 + 12) return true;
      }
    }
    return false;
  };
  const add = (placed: Placed) => {
    for (const key of cellsFor(placed.x, placed.y, placed.width, placed.height)) {
      if (!spatial.has(key)) spatial.set(key, []);
      spatial.get(key)!.push(placed);
    }
  };
  const source = [...ordered].sort((a, b) => Number(positions.get(b.id)?.pinned) - Number(positions.get(a.id)?.pinned)
    || (placementPriority?.get(a.id) ?? 0) - (placementPriority?.get(b.id) ?? 0)
    || a.order - b.order || a.id.localeCompare(b.id));
  for (const item of source) {
    const point = positions.get(item.id);
    if (!point) continue;
    const candidate: Placed = { id: item.id, x: point.x, y: point.y, width: point.card.width, height: point.card.height };
    if (!point.pinned && collides(candidate)) {
      const startX = candidate.x, startY = candidate.y;
      outer: for (let ring = 1; ring <= 28; ring++) {
        const samples = Math.max(12, ring * 10);
        for (let sample = 0; sample < samples; sample++) {
          const angle = sample / samples * Math.PI * 2;
          candidate.x = startX + Math.cos(angle) * ring * 38;
          candidate.y = startY + Math.sin(angle) * ring * 38;
          if (!collides(candidate)) break outer;
        }
      }
      point.x = candidate.x;
      point.y = candidate.y;
    }
    add(candidate);
  }
}

function regionLabel(ids: string[], profiles: Map<string, TextProfile>): string {
  const scores = new Map<string, number>();
  for (const id of ids) {
    const profile = profiles.get(id);
    for (const token of profile?.topTerms || []) scores.set(token, (scores.get(token) || 0) + (profile?.weights.get(token) || 0));
  }
  const selected: string[] = [];
  for (const [token] of [...scores].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    const text = token.slice(2);
    if (text.length < 2 || selected.some(existing => existing.includes(text) || text.includes(existing))) continue;
    selected.push(text);
    if (selected.length === 2) break;
  }
  return selected.join(' · ');
}

function resizeRegions(
  regions: readonly SemanticRegion[],
  positions: ReadonlyMap<string, SemanticLayoutPosition>,
): SemanticRegion[] {
  return regions.flatMap(region => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id of region.nodeIds) {
      const point = positions.get(id);
      if (!point) continue;
      minX = Math.min(minX, point.x - point.card.width / 2);
      minY = Math.min(minY, point.y - point.card.height / 2);
      maxX = Math.max(maxX, point.x + point.card.width / 2);
      maxY = Math.max(maxY, point.y + point.card.height / 2);
    }
    if (!Number.isFinite(minX)) return [];
    const topic = region.level === 'topic';
    const paddingX = topic ? 28 : 42;
    const paddingTop = topic ? 44 : 56;
    const paddingBottom = topic ? 26 : 38;
    return [{
      ...region,
      x: minX - paddingX,
      y: minY - paddingTop,
      width: maxX - minX + paddingX * 2,
      height: maxY - minY + paddingTop + paddingBottom,
    }];
  });
}

function componentKey(ids: readonly string[], indexedById: ReadonlyMap<string, IndexedNode>): string {
  const anchor = [...ids].sort((a, b) => {
    const left = indexedById.get(a), right = indexedById.get(b);
    return (left?.order ?? 0) - (right?.order ?? 0) || a.localeCompare(b);
  })[0] || 'empty';
  return `c-${stableHash(anchor).toString(36)}`;
}

function semanticFingerprints(graph: GraphData): Map<string, string> {
  const relations = new Map((graph.nodes || []).map(node => [String(node.id), [] as string[]]));
  for (const edge of graph.edges || []) {
    const source = endpointId(edge.source), target = endpointId(edge.target);
    if (!relations.has(source) || !relations.has(target)) continue;
    const detail = `${relationKind(edge)}:${String(edge.label || '')}:${isDirectedRelation(edge) ? 1 : 0}`;
    relations.get(source)!.push(`out:${target}:${detail}`);
    relations.get(target)!.push(`in:${source}:${detail}`);
  }
  const fingerprints = new Map<string, string>();
  for (const node of graph.nodes || []) {
    const id = String(node.id);
    const value = JSON.stringify({
      label: String(node.label || ''),
      note: String(node.note || ''),
      tags: [...(node.tags || [])].map(String).sort(),
      headingLevel: node.headingLevel ?? null,
      structureParentId: node.structureParentId == null ? null : String(node.structureParentId),
      fixed: !!node.fixed,
      relations: (relations.get(id) || []).sort(),
    });
    fingerprints.set(id, stableHash(value).toString(36));
  }
  return fingerprints;
}

/**
 * Deterministic semantic compositor. Explicit edges are authoritative; content
 * creates only hidden affinities used for grouping and composition.
 */
export function computeSemanticLayout(graph: GraphData, options?: SemanticLayoutOptions): SemanticLayoutResult {
  const opts = { ...DEFAULTS, ...options };
  const indexed = (graph.nodes || []).map((node, sourceIndex): IndexedNode => ({
    node,
    id: String(node.id),
    sourceIndex,
    order: nodeOrder(node, sourceIndex),
    card: computeCardMetrics(node, options?.collapsedNodeIds?.has(String(node.id)) || false),
  }));
  const byId = new Map(indexed.map(item => [item.id, item]));
  const explicitAdjacency = new Map(indexed.map(item => [item.id, new Set<string>()]));
  const adjacency = new Map(indexed.map(item => [item.id, new Set<string>()]));
  const incoming = new Map(indexed.map(item => [item.id, 0]));
  const validEdges: any[] = [];
  for (const edge of graph.edges || []) {
    const source = endpointId(edge.source), target = endpointId(edge.target);
    if (!byId.has(source) || !byId.has(target) || source === target) continue;
    explicitAdjacency.get(source)!.add(target); explicitAdjacency.get(target)!.add(source);
    adjacency.get(source)!.add(target); adjacency.get(target)!.add(source);
    if (isDirectedRelation(edge)) incoming.set(target, (incoming.get(target) || 0) + 1);
    validEdges.push(edge);
  }
  for (const item of indexed) {
    const parent = item.node.structureParentId;
    if (!parent || !byId.has(String(parent))) continue;
    explicitAdjacency.get(item.id)!.add(String(parent)); explicitAdjacency.get(String(parent))!.add(item.id);
    adjacency.get(item.id)!.add(String(parent)); adjacency.get(String(parent))!.add(item.id);
    incoming.set(item.id, (incoming.get(item.id) || 0) + 1);
  }

  const analysis = buildTextAnalysis(indexed, validEdges, opts);
  for (const affinity of analysis.affinities) {
    adjacency.get(affinity.source)?.add(affinity.target);
    adjacency.get(affinity.target)?.add(affinity.source);
  }

  const visited = new Set<string>();
  const components: string[][] = [];
  for (const item of [...indexed].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))) {
    if (visited.has(item.id)) continue;
    const ids: string[] = [];
    const queue = [item.id];
    visited.add(item.id);
    let head = 0;
    while (head < queue.length) {
      const current = queue[head++];
      ids.push(current);
      for (const neighbor of adjacency.get(current) || []) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
    components.push(ids);
  }

  const domainById = new Map<string, number>();
  components.forEach((ids, domain) => ids.forEach(id => domainById.set(id, domain)));
  const topicGroupsByDomain = components.map((ids, domain) => partitionSemanticTopics(
    ids,
    analysis.affinities,
    validEdges.filter(edge => domainById.get(endpointId(edge.source)) === domain
      && domainById.get(endpointId(edge.target)) === domain),
    byId,
    opts,
  ));
  const layouts: ComponentLayout[] = [];
  topicGroupsByDomain.forEach((groups, domain) => {
    for (const ids of groups) {
      const topicIds = new Set(ids);
      const componentEdges = validEdges.filter(edge => topicIds.has(endpointId(edge.source)) && topicIds.has(endpointId(edge.target)));
      const topicAffinities = analysis.affinities.filter(edge => topicIds.has(edge.source) && topicIds.has(edge.target));
      const scopedExplicitAdjacency = new Map(ids.map(id => [
        id,
        new Set([...(explicitAdjacency.get(id) || [])].filter(neighbor => topicIds.has(neighbor))),
      ]));
      layouts.push({
        ...layoutComponent(ids, componentEdges, topicAffinities, scopedExplicitAdjacency, incoming, byId, opts),
        domain,
      });
    }
  });
  layouts.sort((a, b) => (a.domain ?? 0) - (b.domain ?? 0)
    || a.minOrder - b.minOrder || a.ids[0].localeCompare(b.ids[0]));

  const totalArea = layouts.reduce((sum, layout) => sum + (layout.width + opts.componentGap) * (layout.height + opts.componentGap), 0);
  // Keep the composition close to the aspect ratio of the usable canvas. A
  // very wide shelf looks tidy in world coordinates but forces note text to be
  // microscopic once the sidebar and toolbar are accounted for.
  const rowLimit = Math.max(720, Math.sqrt(totalArea) * 1.14);
  const origins = new Map<ComponentLayout, { x: number; y: number }>();
  let cursorX = 0, cursorY = 0, rowHeight = 0, packedWidth = 0;
  let previousDomain: number | undefined;
  for (const layout of layouts) {
    let domainGap = cursorX > 0 && previousDomain !== undefined && layout.domain !== previousDomain
      ? opts.componentGap * 0.7
      : 0;
    if (cursorX > 0 && cursorX + domainGap + layout.width > rowLimit) {
      cursorX = 0;
      cursorY += rowHeight + opts.componentGap * (layout.domain !== previousDomain ? 1.2 : 1);
      rowHeight = 0;
      domainGap = 0;
    }
    cursorX += domainGap;
    origins.set(layout, { x: cursorX - layout.minX, y: cursorY - layout.minY });
    cursorX += layout.width + opts.componentGap;
    rowHeight = Math.max(rowHeight, layout.height);
    packedWidth = Math.max(packedWidth, cursorX - opts.componentGap);
    previousDomain = layout.domain;
  }
  const packedHeight = cursorY + rowHeight;
  const positions = new Map<string, SemanticLayoutPosition>();
  layouts.forEach((layout, component) => {
    const origin = origins.get(layout)!;
    const pinned = layout.ids.filter(id => byId.get(id)!.node.fixed
      && Number.isFinite(byId.get(id)!.node.x) && Number.isFinite(byId.get(id)!.node.y));
    let anchorX = origin.x - packedWidth / 2;
    let anchorY = origin.y - packedHeight / 2;
    if (pinned.length > 0) {
      const anchorId = pinned.sort((a, b) => byId.get(a)!.order - byId.get(b)!.order)[0];
      const local = layout.local.get(anchorId)!;
      const node = byId.get(anchorId)!.node;
      anchorX = node.x - local.x;
      anchorY = node.y - local.y;
    }
    for (const id of layout.ids) {
      const local = layout.local.get(id)!;
      const item = byId.get(id)!;
      const isPinned = item.node.fixed && Number.isFinite(item.node.x) && Number.isFinite(item.node.y);
      positions.set(id, {
        x: isPinned ? item.node.x : anchorX + local.x,
        y: isPinned ? item.node.y : anchorY + local.y,
        component,
        rank: local.rank,
        strategy: layout.strategy,
        pinned: isPinned,
        card: item.card,
      });
    }
  });
  resolveOverlaps(positions, indexed);

  const domainRegions: SemanticRegion[] = components.flatMap((ids, domain) => {
    if (ids.length < 2) return [];
    const key = componentKey(ids, byId);
    const domainAffinities = analysis.affinities.filter(affinity => domainById.get(affinity.source) === domain
      && domainById.get(affinity.target) === domain);
    const cohesion = domainAffinities.length
      ? domainAffinities.reduce((sum, affinity) => sum + affinity.similarity, 0) / domainAffinities.length
      : 0;
    return [{
      id: `semantic-region-${key}`,
      label: regionLabel(ids, analysis.profiles),
      nodeIds: [...ids],
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      colorIndex: stableHash(key) % 7,
      cohesion,
      level: 'domain' as const,
    }];
  });
  const domainRegionByIndex = new Map(domainRegions.map(region => [domainById.get(region.nodeIds[0])!, region]));
  const topicRegions: SemanticRegion[] = layouts.flatMap(layout => {
    const domain = layout.domain ?? 0;
    if ((topicGroupsByDomain[domain]?.length || 0) <= 1 || layout.ids.length < 2) return [];
    const parentRegion = domainRegionByIndex.get(domain);
    if (!parentRegion) return [];
    const key = componentKey(layout.ids, byId);
    return [{
      id: `${parentRegion.id}-topic-${key}`,
      parentId: parentRegion.id,
      label: regionLabel(layout.ids, analysis.profiles),
      nodeIds: [...layout.ids],
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      colorIndex: (parentRegion.colorIndex + 1 + stableHash(key) % 3) % 7,
      cohesion: layout.cohesion,
      level: 'topic' as const,
    }];
  });
  const regions = [...domainRegions, ...topicRegions];
  const echoes: SemanticEcho[] = analysis.affinities.flatMap(affinity => {
    if (explicitAdjacency.get(affinity.source)?.has(affinity.target)) return [];
    const sourceProfile = analysis.profiles.get(affinity.source);
    const targetProfile = analysis.profiles.get(affinity.target);
    const targetWeights = targetProfile?.weights || new Map<string, number>();
    const terms = [...(sourceProfile?.weights || new Map<string, number>())]
      .filter(([term]) => (term.startsWith('w:') || term.startsWith('c:')) && targetWeights.has(term))
      .sort((a, b) => (b[1] * (targetWeights.get(b[0]) || 0)) - (a[1] * (targetWeights.get(a[0]) || 0)))
      .map(([term]) => term.replace(/^[wc]:/, ''))
      .filter((term, index, all) => all.indexOf(term) === index)
      .slice(0, 3);
    const hasLexical = affinity.lexicalSimilarity >= Math.max(0.035, opts.semanticThreshold * 0.45);
    const hasDense = affinity.denseSimilarity > 0;
    const kind: SemanticEchoKind = hasLexical && hasDense ? 'hybrid' : hasDense ? 'embedding' : 'lexical';
    const reason = terms.length > 0
      ? `共同线索 · ${terms.join(' / ')}`
      : kind === 'hybrid'
        ? '文字线索与语义都接近'
        : kind === 'embedding'
          ? '语义向量近邻'
          : '文字脉络相近';
    return [{
      source: affinity.source,
      target: affinity.target,
      score: affinity.similarity,
      kind,
      reason,
      terms,
    }];
  }).sort((a, b) => b.score - a.score || `${a.source}:${a.target}`.localeCompare(`${b.source}:${b.target}`));
  return {
    positions,
    regions: resizeRegions(regions, positions),
    componentCount: layouts.length,
    semanticEdgeCount: analysis.affinities.length,
    echoes,
  };
}

/**
 * Pull an ideal semantic composition toward its own previous result. Components
 * keep their old centroid, stable cards act as anchors, and changed/new cards
 * absorb most collision correction. Manual graph x/y values are never read.
 */
export function stabilizeSemanticLayout(
  graph: GraphData,
  ideal: SemanticLayoutResult,
  previous: SemanticLayoutMemory | undefined,
  source: SemanticLayoutSource = 'lexical',
): SemanticLayoutStabilization {
  const indexed = (graph.nodes || []).map((node, sourceIndex): IndexedNode => ({
    node,
    id: String(node.id),
    sourceIndex,
    order: nodeOrder(node, sourceIndex),
    card: ideal.positions.get(String(node.id))?.card || computeCardMetrics(node),
  }));
  const indexedById = new Map(indexed.map(item => [item.id, item]));
  const fingerprints = semanticFingerprints(graph);
  const validPrevious = previous?.version === 1 ? previous : undefined;
  const previousNodes = validPrevious?.nodes || {};
  const currentIds = new Set(indexed.map(item => item.id));
  const newNodeIds = indexed.filter(item => !previousNodes[item.id]).map(item => item.id);
  const changedNodeIds = indexed.filter(item => {
    const entry = previousNodes[item.id];
    const formChanged = entry?.form === undefined
      ? item.card.form === 'node'
      : entry.form !== item.card.form;
    return !!entry && (entry.fingerprint !== fingerprints.get(item.id) || formChanged);
  }).map(item => item.id);
  const removedCount = Object.keys(previousNodes).filter(id => !currentIds.has(id)).length;
  const changeRatio = (newNodeIds.length + changedNodeIds.length + removedCount)
    / Math.max(1, indexed.length, Object.keys(previousNodes).length);

  const resultPositions = new Map<string, SemanticLayoutPosition>();
  for (const [id, point] of ideal.positions) resultPositions.set(id, { ...point, card: { ...point.card } });

  const componentIds = new Map<number, string[]>();
  for (const [id, point] of ideal.positions) {
    if (!componentIds.has(point.component)) componentIds.set(point.component, []);
    componentIds.get(point.component)!.push(id);
  }
  const componentKeys = new Map<number, string>();
  let membershipNoveltySum = 0;
  for (const [component, ids] of componentIds) {
    const key = componentKey(ids, indexedById);
    componentKeys.set(component, key);
    const previousKeyCounts = new Map<string, number>();
    for (const id of ids) {
      const previousKey = previousNodes[id]?.componentKey;
      if (previousKey) previousKeyCounts.set(previousKey, (previousKeyCounts.get(previousKey) || 0) + 1);
    }
    const dominantPreviousCount = Math.max(0, ...previousKeyCounts.values());
    membershipNoveltySum += Math.max(0, ids.length - dominantPreviousCount);
  }
  const membershipNovelty = membershipNoveltySum / Math.max(1, indexed.length);
  const globalReframe = !!validPrevious && Math.max(changeRatio, membershipNovelty) > 0.42;
  const sourceUpgrade = validPrevious?.source === 'lexical' && source === 'dense';

  if (validPrevious) {
    const changed = new Set(changedNodeIds);
    const fresh = new Set(newNodeIds);
    for (const [component, ids] of componentIds) {
      const retained = ids.filter(id => {
        const entry = previousNodes[id];
        return entry && Number.isFinite(entry.x) && Number.isFinite(entry.y);
      });
      if (retained.length === 0) continue;

      let oldCenterX = 0, oldCenterY = 0, idealCenterX = 0, idealCenterY = 0;
      for (const id of retained) {
        oldCenterX += previousNodes[id].x;
        oldCenterY += previousNodes[id].y;
        idealCenterX += ideal.positions.get(id)!.x;
        idealCenterY += ideal.positions.get(id)!.y;
      }
      oldCenterX /= retained.length; oldCenterY /= retained.length;
      idealCenterX /= retained.length; idealCenterY /= retained.length;
      const translateX = oldCenterX - idealCenterX;
      const translateY = oldCenterY - idealCenterY;
      const dominantCounts = new Map<string, number>();
      for (const id of retained) {
        const key = previousNodes[id].componentKey;
        dominantCounts.set(key, (dominantCounts.get(key) || 0) + 1);
      }
      const dominantCount = Math.max(0, ...dominantCounts.values());
      const componentNovelty = 1 - dominantCount / Math.max(1, ids.length);
      const localChangedRatio = ids.filter(id => changed.has(id) || fresh.has(id)).length / Math.max(1, ids.length);

      for (const id of ids) {
        const target = resultPositions.get(id)!;
        if (target.pinned) continue;
        const entry = previousNodes[id];
        if (!entry) {
          target.x += translateX;
          target.y += translateY;
          continue;
        }
        const stableBonus = Math.min(0.06, Math.max(0, entry.stability) * 0.006);
        let inertia = globalReframe
          ? 0.28
          : clamp(0.88 + stableBonus - componentNovelty * 0.42 - localChangedRatio * 0.24, 0.42, 0.94);
        if (changed.has(id)) inertia = Math.min(inertia, globalReframe ? 0.18 : 0.38);
        if (sourceUpgrade) inertia = Math.min(inertia, entry.stability <= 0 ? 0.2 : 0.68);
        const translatedX = target.x + translateX;
        const translatedY = target.y + translateY;
        target.x = entry.x * inertia + translatedX * (1 - inertia);
        target.y = entry.y * inertia + translatedY * (1 - inertia);
      }
    }

    const priority = new Map<string, number>();
    for (const item of indexed) {
      const entry = previousNodes[item.id];
      priority.set(item.id, !entry ? 3 : changed.has(item.id) ? 2 : entry.stability <= 0 ? 1 : 0);
    }
    resolveOverlaps(resultPositions, indexed, priority);
  }

  const memoryNodes: Record<string, SemanticLayoutMemoryNode> = {};
  const movedNodeIds: string[] = [];
  const changedSet = new Set(changedNodeIds);
  for (const item of indexed) {
    const point = resultPositions.get(item.id);
    if (!point) continue;
    const entry = previousNodes[item.id];
    const moved = !!entry && Math.hypot(point.x - entry.x, point.y - entry.y) > 0.75;
    if (moved) movedNodeIds.push(item.id);
    const sameStructure = entry?.componentKey === componentKeys.get(point.component);
    const nextStability = entry && !changedSet.has(item.id) && sameStructure && !moved
      ? Math.min(10, Math.max(0, entry.stability) + 1)
      : entry && !changedSet.has(item.id) && sameStructure
        ? Math.min(10, Math.max(0, entry.stability))
        : 0;
    memoryNodes[item.id] = {
      x: point.x,
      y: point.y,
      fingerprint: fingerprints.get(item.id) || '',
      componentKey: componentKeys.get(point.component) || `c-${stableHash(item.id).toString(36)}`,
      stability: nextStability,
      form: point.card.form,
    };
  }

  const result: SemanticLayoutResult = {
    ...ideal,
    positions: resultPositions,
    regions: resizeRegions(ideal.regions, resultPositions),
  };
  return {
    result,
    memory: { version: 1, source, nodes: memoryNodes },
    changedNodeIds,
    newNodeIds,
    movedNodeIds,
    globalReframe,
  };
}

export function semanticGraphSignature(graph: GraphData): string {
  const nodes = (graph.nodes || []).map((node, index) => ({
    id: String(node.id),
    order: nodeOrder(node, index),
    label: String(node.label || ''),
    note: String(node.note || ''),
    headingLevel: node.headingLevel ?? null,
    tags: [...(node.tags || [])].sort(),
    structureParentId: node.structureParentId ?? null,
    fixed: !!node.fixed,
    x: node.fixed ? finite(node.x) : null,
    y: node.fixed ? finite(node.y) : null,
  })).sort((a, b) => a.id.localeCompare(b.id));
  const edges = (graph.edges || []).map(edge => ({
    source: endpointId(edge.source),
    target: endpointId(edge.target),
    label: String(edge.label || ''),
    kind: relationKind(edge),
    directed: isDirectedRelation(edge),
  })).sort((a, b) => `${a.source}:${a.target}:${a.kind}:${a.label}`.localeCompare(`${b.source}:${b.target}:${b.kind}:${b.label}`));
  return JSON.stringify({ nodes, edges });
}

/** Debounces semantic reflow, including edits that change card geometry or content affinity. */
export class SemanticLayoutController implements LayoutController {
  readonly mode = 'auto';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private active = true;
  private signature: string;

  constructor(
    private readonly getGraph: () => GraphData,
    private readonly apply: () => void,
    private readonly delay = 100,
  ) {
    this.signature = semanticGraphSignature(getGraph());
  }

  deactivate(): void {
    this.active = false;
    if (this.timer != null) clearTimeout(this.timer);
    this.timer = null;
  }

  onGraphChanged(): void {
    if (!this.active) return;
    const next = semanticGraphSignature(this.getGraph());
    if (next === this.signature) return;
    this.signature = next;
    if (this.timer != null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.active) this.apply();
    }, this.delay);
  }

  markApplied(): void {
    this.signature = semanticGraphSignature(this.getGraph());
  }
}
