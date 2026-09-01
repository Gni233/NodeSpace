import { semanticZoomProfile } from './semantic-zoom';

export type SemanticEdgeRole = 'explicit' | 'structure' | 'directional' | 'reference';

export interface SemanticEdgeGrammar {
  role: SemanticEdgeRole;
  /** True when the visual role came only from wording rather than an edge field. */
  tentative: boolean;
  cue: string;
}

export interface EdgePoint {
  x: number;
  y: number;
}

export type SemanticEdgeRoute =
  | { kind: 'line'; start: EdgePoint; end: EdgePoint }
  | { kind: 'quadratic'; start: EdgePoint; control: EdgePoint; end: EdgePoint }
  | { kind: 'cubic'; start: EdgePoint; control1: EdgePoint; control2: EdgePoint; end: EdgePoint };

export interface SemanticEdgeDisclosure {
  alphaMultiplier: number;
  widthMultiplier: number;
  showLabel: boolean;
  labelAlpha: number;
}

const STRUCTURE_KIND = /^(?:hierarchy|parent|child|contains|containment|membership|part|structure|tree)$/i;
const STRUCTURE_WORDING = /(?:层级|父级|子级|包含|属于|隶属|构成|组成|上位|下位|part\s+of|belongs?\s+to|contains?)/i;
const DIRECTION_KIND = /^(?:cause|causal|dependency|depends|sequence|flow|next|lead|support|contrast|response)$/i;
const DIRECTION_WORDING = /(?:导致|决定|引发|产生|因此|所以|因为|依赖|先于|随后|之后|然后|下一步|促进|阻碍|支持|反驳|回应|cause|lead(?:s)?\s+to|depend(?:s)?\s+on|because|therefore|then|next|before|after)/i;
const REFERENCE_KIND = /^(?:obsidian-link|obsidian-embed|obsidian-backlink|obsidian-missing|cross-space-context|reference|backlink|embed)$/i;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function edgeField(edge: any): string {
  return String(edge?.kind ?? edge?.relationType ?? edge?.semanticType ?? '').trim();
}

/**
 * Classify only the visual grammar of an existing edge. It never creates a
 * relationship or writes an inferred type back into graph data.
 */
export function inferSemanticEdgeGrammar(edge: any): SemanticEdgeGrammar {
  const declared = edgeField(edge);
  const label = String(edge?.label ?? '').trim();
  if (edge?._obsidianLink || REFERENCE_KIND.test(declared)) {
    return { role: 'reference', tentative: false, cue: declared || 'obsidian-link' };
  }
  if (edge?._structureMembership || STRUCTURE_KIND.test(declared)) {
    return { role: 'structure', tentative: false, cue: declared || 'structure' };
  }
  if (DIRECTION_KIND.test(declared) || edge?.arrow === true) {
    return { role: 'directional', tentative: false, cue: declared || 'arrow' };
  }
  if (STRUCTURE_WORDING.test(label)) {
    return { role: 'structure', tentative: true, cue: label };
  }
  if (DIRECTION_WORDING.test(label)) {
    return { role: 'directional', tentative: true, cue: label };
  }
  return { role: 'explicit', tentative: false, cue: label || 'explicit' };
}

/** Stable route families: facts breathe, direction bends, structure flows as a trunk. */
export function buildSemanticEdgeRoute(
  start: EdgePoint,
  end: EdgePoint,
  grammar: SemanticEdgeGrammar,
  stableKey = '',
): SemanticEdgeRoute {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 2) return { kind: 'line', start, end };

  const normalX = -dy / length;
  const normalY = dx / length;
  const hash = stableHash(stableKey);
  const sign = hash % 2 === 0 ? 1 : -1;
  // A small deterministic variation stops adjacent relations from looking like
  // copies while keeping every route stable across renders and sessions.
  const variation = 0.92 + ((hash >>> 1) % 5) * 0.04;

  if (grammar.role === 'reference') {
    if (length < 24) return { kind: 'line', start, end };
    const bend = clamp(length * (grammar.cue === 'obsidian-embed' ? 0.1 : 0.078), 8, 32) * sign * variation;
    return {
      kind: 'cubic',
      start,
      control1: {
        x: start.x + dx * 0.28 + normalX * bend,
        y: start.y + dy * 0.28 + normalY * bend,
      },
      control2: {
        x: start.x + dx * 0.72 + normalX * bend * 0.72,
        y: start.y + dy * 0.72 + normalY * bend * 0.72,
      },
      end,
    };
  }

  if (grammar.role === 'explicit') {
    // Only truly tiny gaps stay straight. A shallow cubic gives ordinary,
    // user-authored relations a calm visual rhythm without implying direction.
    if (length < 24) return { kind: 'line', start, end };
    const bend = clamp(length * 0.065, 6, 24) * sign * variation;
    return {
      kind: 'cubic',
      start,
      control1: {
        x: start.x + dx * 0.3 + normalX * bend,
        y: start.y + dy * 0.3 + normalY * bend,
      },
      control2: {
        x: start.x + dx * 0.7 + normalX * bend,
        y: start.y + dy * 0.7 + normalY * bend,
      },
      end,
    };
  }

  if (grammar.role === 'structure') {
    if (Math.abs(dy) >= Math.abs(dx)) {
      return {
        kind: 'cubic',
        start,
        control1: { x: start.x, y: start.y + dy * 0.46 },
        control2: { x: end.x, y: end.y - dy * 0.46 },
        end,
      };
    }
    return {
      kind: 'cubic',
      start,
      control1: { x: start.x + dx * 0.46, y: start.y },
      control2: { x: end.x - dx * 0.46, y: end.y },
      end,
    };
  }

  // Direction is intentionally more curved than an undirected fact. This
  // remains restrained at card scale but is still legible when zoomed out.
  if (length < 24) return { kind: 'line', start, end };
  const bend = clamp(length * 0.12, 10, 42) * sign * variation;
  return {
    kind: 'quadratic',
    start,
    control: {
      x: (start.x + end.x) / 2 + normalX * bend,
      y: (start.y + end.y) / 2 + normalY * bend,
    },
    end,
  };
}

export function semanticEdgePoint(route: SemanticEdgeRoute, progress: number): EdgePoint {
  const t = clamp(progress, 0, 1);
  const inverse = 1 - t;
  if (route.kind === 'line') {
    return {
      x: route.start.x + (route.end.x - route.start.x) * t,
      y: route.start.y + (route.end.y - route.start.y) * t,
    };
  }
  if (route.kind === 'quadratic') {
    return {
      x: inverse * inverse * route.start.x + 2 * inverse * t * route.control.x + t * t * route.end.x,
      y: inverse * inverse * route.start.y + 2 * inverse * t * route.control.y + t * t * route.end.y,
    };
  }
  return {
    x: inverse ** 3 * route.start.x
      + 3 * inverse * inverse * t * route.control1.x
      + 3 * inverse * t * t * route.control2.x
      + t ** 3 * route.end.x,
    y: inverse ** 3 * route.start.y
      + 3 * inverse * inverse * t * route.control1.y
      + 3 * inverse * t * t * route.control2.y
      + t ** 3 * route.end.y,
  };
}

export function semanticEdgeTangent(route: SemanticEdgeRoute, progress: number): EdgePoint {
  const t = clamp(progress, 0, 1);
  const inverse = 1 - t;
  if (route.kind === 'line') {
    return { x: route.end.x - route.start.x, y: route.end.y - route.start.y };
  }
  if (route.kind === 'quadratic') {
    return {
      x: 2 * inverse * (route.control.x - route.start.x) + 2 * t * (route.end.x - route.control.x),
      y: 2 * inverse * (route.control.y - route.start.y) + 2 * t * (route.end.y - route.control.y),
    };
  }
  return {
    x: 3 * inverse * inverse * (route.control1.x - route.start.x)
      + 6 * inverse * t * (route.control2.x - route.control1.x)
      + 3 * t * t * (route.end.x - route.control2.x),
    y: 3 * inverse * inverse * (route.control1.y - route.start.y)
      + 6 * inverse * t * (route.control2.y - route.control1.y)
      + 3 * t * t * (route.end.y - route.control2.y),
  };
}

export function sampleSemanticEdgeRoute(route: SemanticEdgeRoute, segments = 20): EdgePoint[] {
  const count = clamp(Math.round(segments), 2, 48);
  return Array.from({ length: count + 1 }, (_, index) => semanticEdgePoint(route, index / count));
}

export function semanticEdgePolyline(edge: any, source: any, target: any): EdgePoint[] {
  const sourceId = String(source?.id ?? edge?.source ?? 'source');
  const targetId = String(target?.id ?? edge?.target ?? 'target');
  const route = buildSemanticEdgeRoute(
    { x: Number(source?.x) || 0, y: Number(source?.y) || 0 },
    { x: Number(target?.x) || 0, y: Number(target?.y) || 0 },
    inferSemanticEdgeGrammar(edge),
    `${sourceId}\u0000${targetId}\u0000${String(edge?.label ?? '')}`,
  );
  return sampleSemanticEdgeRoute(route, route.kind === 'line' ? 2 : 18);
}

/** Zoom and focus affect visibility, but never the relationship classification. */
export function semanticEdgeDisclosure(
  grammar: SemanticEdgeGrammar,
  zoom: number,
  focused: boolean,
  focusActive: boolean,
  selected = false,
): SemanticEdgeDisclosure {
  const profile = semanticZoomProfile(zoom);
  if (selected) return { alphaMultiplier: 1.15, widthMultiplier: 1.24, showLabel: true, labelAlpha: 1 };
  const distantAlpha = grammar.role === 'structure' ? 0.95 : grammar.role === 'directional' ? 0.78 : grammar.role === 'reference' ? 0.66 : 0.54;
  let alphaMultiplier = distantAlpha + (1 - distantAlpha) * profile.edgeDetailAlpha;
  if (focusActive) alphaMultiplier *= focused ? 1.16 : grammar.role === 'structure' ? 0.22 : grammar.role === 'reference' ? 0.14 : 0.1;
  const roleWidth = grammar.role === 'structure' ? 1.2 : grammar.role === 'directional' ? 1.14 : grammar.role === 'reference' ? 1.1 : 1.05;
  const distantWidth = 1 + (1 - profile.edgeDetailAlpha) * 0.28;
  const labelAlpha = focused
    ? profile.focusedEdgeLabelAlpha
    : !focusActive
      ? profile.edgeLabelAlpha
      : 0;
  return {
    alphaMultiplier,
    widthMultiplier: roleWidth * distantWidth,
    showLabel: labelAlpha > 0.025,
    labelAlpha,
  };
}
