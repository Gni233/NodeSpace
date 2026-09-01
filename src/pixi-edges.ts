import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { GraphData } from './data/storage';
import { WORLD_TEXT_SAMPLING } from './pixi-text-quality';
import {
  buildSemanticEdgeRoute,
  inferSemanticEdgeGrammar,
  sampleSemanticEdgeRoute,
  semanticEdgeDisclosure,
  semanticEdgePoint,
  semanticEdgeTangent,
  type EdgePoint,
  type SemanticEdgeRoute,
  type SemanticEdgeRole,
} from './semantic-edge-grammar';

const DASH_PATTERNS: Record<string, [number, number]> = {
  solid: [0, 0],
  'dash-2': [2, 5],
  'dash-4': [4, 6],
  'dash-8': [8, 6],
  dot: [2, 8],
  'dot-dense': [2, 4],
};

function drawDashedPolyline(g: Graphics, points: readonly EdgePoint[], dashLen: number, gapLen: number, width: number, color: string, alpha: number) {
  let on = true;
  let phaseRemaining = dashLen;
  for (let index = 1; index < points.length; index++) {
    let from = points[index - 1];
    const to = points[index];
    let dx = to.x - from.x, dy = to.y - from.y;
    let remaining = Math.hypot(dx, dy);
    while (remaining > 1e-4) {
      const take = Math.min(remaining, phaseRemaining);
      const ratio = take / remaining;
      const next = { x: from.x + dx * ratio, y: from.y + dy * ratio };
      if (on) g.moveTo(from.x, from.y).lineTo(next.x, next.y).stroke({ color, width, alpha, cap: 'round' });
      from = next;
      remaining -= take;
      phaseRemaining -= take;
      if (phaseRemaining <= 1e-4) {
        on = !on;
        phaseRemaining = on ? dashLen : gapLen;
      }
      dx = to.x - from.x;
      dy = to.y - from.y;
    }
  }
}

function drawSolidRoute(g: Graphics, route: SemanticEdgeRoute, width: number, color: string, alpha: number) {
  g.moveTo(route.start.x, route.start.y);
  if (route.kind === 'quadratic') g.quadraticCurveTo(route.control.x, route.control.y, route.end.x, route.end.y);
  else if (route.kind === 'cubic') g.bezierCurveTo(route.control1.x, route.control1.y, route.control2.x, route.control2.y, route.end.x, route.end.y);
  else g.lineTo(route.end.x, route.end.y);
  g.stroke({ color, width, alpha, cap: 'round', join: 'round' });
}

function semanticDefaultColor(role: SemanticEdgeRole): string {
  if (role === 'structure') return '#4F8F7D';
  if (role === 'directional') return '#B97846';
  if (role === 'reference') return '#6F73B8';
  return '#71838F';
}

/** 在两颜色间线性插值 */
function lerpColor(c1: number, c2: number, t: number): number {
  const r = ((c1 >> 16) & 0xff) + (((c2 >> 16) & 0xff) - ((c1 >> 16) & 0xff)) * t;
  const g = ((c1 >> 8) & 0xff) + (((c2 >> 8) & 0xff) - ((c1 >> 8) & 0xff)) * t;
  const b = (c1 & 0xff) + ((c2 & 0xff) - (c1 & 0xff)) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

const LEVEL_RADII = [22, 19, 16, 13, 10, 7]; // headingLevel 1~6
const LEVEL_WIDTHS = [5, 4, 3, 2.5, 2, 1.5]; // headingLevel 1~6
const GRADIENT_SEGMENTS = 3;

export function getNodeVisualRadius(n: any): number {
  const card = n?._semanticCard;
  if (card && Number.isFinite(card.width) && Number.isFinite(card.height)) {
    if (card.form === 'node') return Number(card.nodeRadius) || card.width / 2;
    return Math.max(card.width, card.height) / 2;
  }
  if (n.radiusMode === 'custom' || (!n.radiusMode && n.radius)) return n.radius || 9;
  return LEVEL_RADII[(n.headingLevel || 6) - 1] || 9;
}

function boundaryDistance(node: any, ux: number, uy: number): number {
  const card = node?._semanticCard;
  if (!card || !Number.isFinite(card.width) || !Number.isFinite(card.height)) return getNodeVisualRadius(node);
  if (card.form === 'node') return Math.max(1, Number(card.nodeRadius) || card.width / 2);
  const halfWidth = Math.max(1, card.width / 2);
  const halfHeight = Math.max(1, card.height / 2);
  const tx = Math.abs(ux) > 1e-6 ? halfWidth / Math.abs(ux) : Infinity;
  const ty = Math.abs(uy) > 1e-6 ? halfHeight / Math.abs(uy) : Infinity;
  return Math.min(tx, ty);
}

export function updateEdges(
  edgeLayer: Container,
  graph: GraphData,
  nodes: any[],
  opts: {
    hiddenNodes: Set<string>;
    focusNeighborIds?: Set<string>;
    focusEdgeIndices?: Set<number>;
    collapsedEdgeIndices?: Set<number>;
    alpha?: number;
    selectedEdgeIndex?: number | null;
    boxSelectedEdgeIndices?: Set<number>;
    collapseEdgeFade?: Map<number, number>;
    nodeColorMap?: Map<string, number>;
    edgeColorGradient?: boolean;
    edgeWidthByLevel?: boolean;
    semanticMode?: boolean;
    semanticZoom?: number;
    semanticFocusNodeId?: string | null;
    semanticLabelBudget?: number;
  }
) {
  const { hiddenNodes, focusNeighborIds, focusEdgeIndices, collapsedEdgeIndices, alpha = 0.6, selectedEdgeIndex, boxSelectedEdgeIndices, collapseEdgeFade, nodeColorMap, edgeColorGradient, edgeWidthByLevel, semanticMode = false, semanticZoom = 1, semanticFocusNodeId = null, semanticLabelBudget } = opts;
  const isFocusActive = focusNeighborIds && focusNeighborIds.size > 0;
  const semanticFocusId = semanticMode && semanticFocusNodeId ? String(semanticFocusNodeId) : null;
  const useGradient = edgeColorGradient && nodeColorMap;
  const useWidthLvl = edgeWidthByLevel;

  // 复用 Graphics 对象，只 clear 内容（避免每帧 new Graphics 导致的 GC 堆积）
  let g = (edgeLayer as any)._lineGfx;
  if (!g || g.destroyed) { g = new Graphics(); (edgeLayer as any)._lineGfx = g; }
  let glowG = (edgeLayer as any)._glowGfx;
  if (!glowG || glowG.destroyed) { glowG = new Graphics(); (edgeLayer as any)._glowGfx = glowG; }
  g.clear(); glowG.clear();
  // 收集所有需要保留的对象（复用的 Graphics + 缓存的标签 Text）
  const preserve = new Set<any>([g, glowG, (edgeLayer as any)._linkGfx]);
  const cachedLabels = (edgeLayer as any)._labelCache as Map<number, Text> | undefined;
  if (cachedLabels) { for (const t of cachedLabels.values()) preserve.add(t); }
  for (const child of edgeLayer.children.slice()) {
    if (!preserve.has(child)) child.destroy({ children: true });
  }
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const renderedEdges = new Map<number, {
    route: SemanticEdgeRoute;
    labelAlpha: number;
    showLabel: boolean;
    color: string;
    labelPriority: number;
    mandatoryLabel: boolean;
  }>();

  graph.edges.forEach((e, idx) => {
    if (collapsedEdgeIndices?.has(idx)) return;
    const s = nodeMap.get(typeof e.source === 'object' ? e.source.id : e.source);
    const t = nodeMap.get(typeof e.target === 'object' ? e.target.id : e.target);
    if (!s || !t) return;
    if (hiddenNodes.has(s.id) || hiddenNodes.has(t.id)) return;

    const isSelected = selectedEdgeIndex === idx;
    const isBoxSelected = boxSelectedEdgeIndices?.has(idx) ?? false;
    const grammar = semanticMode
      ? inferSemanticEdgeGrammar(e)
      : { role: 'explicit' as const, tentative: false, cue: 'explicit' };
    const semanticIncident = !!semanticFocusId && (String(s.id) === semanticFocusId || String(t.id) === semanticFocusId);
    const focusedEdge = semanticIncident || !!focusEdgeIndices?.has(idx);
    const anyFocusActive = !!isFocusActive || !!semanticFocusId;
    const disclosure = semanticMode
      ? semanticEdgeDisclosure(grammar, semanticZoom, focusedEdge, anyFocusActive, isSelected || isBoxSelected)
      : { alphaMultiplier: 1, widthMultiplier: 1, showLabel: true, labelAlpha: 1 };

    let edgeAlpha = alpha;
    if (isFocusActive) edgeAlpha = focusEdgeIndices?.has(idx) ? 0.8 : 0.12;
    edgeAlpha *= disclosure.alphaMultiplier;
    const fadeM = collapseEdgeFade?.get(idx);
    if (fadeM != null) { edgeAlpha *= fadeM; }
    if ((e as any)._createdAt) {
      edgeAlpha *= Math.min(1, (performance.now() - (e as any)._createdAt) / 300);
    }
    if ((e as any)._dyingAt) {
      edgeAlpha *= Math.max(0, 1 - (performance.now() - (e as any)._dyingAt) / 350);
    }

    const conflict = e._conflict === true;
    const userDashed = (e.lineStyle || 'solid') !== 'solid';
    const storedColor = String(e.color || '').toUpperCase();
    const hasCustomColor = !!storedColor && storedColor !== '#BFBFBF' && storedColor !== '#BFBFBFFF';
    const baseColor = (conflict && !userDashed)
      ? '#DD7733'
      : semanticMode && !hasCustomColor
        ? semanticDefaultColor(grammar.role)
        : (e.color || '#BFBFBF');
    const baseColorNum = parseInt(baseColor.replace('#', ''), 16);
    const style: string = conflict ? 'dot' : (userDashed ? e.lineStyle! : 'solid');
    const [dashLen, gapLen] = DASH_PATTERNS[style] || DASH_PATTERNS.solid;

    // 渐变颜色：从源节点色到目标节点色
    const sColor = useGradient ? (nodeColorMap!.get(s.id) ?? baseColorNum) : baseColorNum;
    const tColor = useGradient ? (nodeColorMap!.get(t.id) ?? baseColorNum) : baseColorNum;

    // 渐变粗细：根据端点等级
    const sw2 = useWidthLvl ? (LEVEL_WIDTHS[(s.headingLevel || 6) - 1] || 1.5) : 1.5;
    const tw2 = useWidthLvl ? (LEVEL_WIDTHS[(t.headingLevel || 6) - 1] || 1.5) : 1.5;
    const needsGradient = useGradient || (useWidthLvl && Math.abs(sw2 - tw2) > 0.1);

    const gradientSegments = needsGradient ? GRADIENT_SEGMENTS : 1;

    const dx2 = t.x - s.x, dy2 = t.y - s.y;
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
    const ux2 = len2 > 1 ? dx2 / len2 : 0, uy2 = len2 > 1 ? dy2 / len2 : 0;
    const sr = boundaryDistance(s, ux2, uy2);
    const tr = boundaryDistance(t, ux2, uy2);
    const sx2 = s.x + ux2 * (sr + 1);
    const sy2 = s.y + uy2 * (sr + 1);
    const tx2 = t.x - ux2 * (e.arrow ? tr + 7 : tr + 1);
    const ty2 = t.y - uy2 * (e.arrow ? tr + 7 : tr + 1);
    const route = semanticMode
      ? buildSemanticEdgeRoute(
        { x: sx2, y: sy2 },
        { x: tx2, y: ty2 },
        grammar,
        `${String(s.id)}\u0000${String(t.id)}\u0000${String(e.label || '')}`,
      )
      : ({ kind: 'line', start: { x: sx2, y: sy2 }, end: { x: tx2, y: ty2 } } as SemanticEdgeRoute);

    const contentWidth = (1.35 + Math.min(0.9, String(e.label || '').trim().length * 0.025)) * disclosure.widthMultiplier;
    const drawTo = (target: Graphics, width: number, col: string, a: number) => {
      if (dashLen === 0) {
        drawSolidRoute(target, route, width, col, a);
      } else {
        drawDashedPolyline(target, sampleSemanticEdgeRoute(route, route.kind === 'line' ? 2 : 22), dashLen, gapLen, width, col, a);
      }
    };

    // A very soft under-stroke gives semantic solid routes some visual depth
    // on both light and dark themes without turning them into neon ribbons.
    if (semanticMode && dashLen === 0) {
      drawSolidRoute(glowG, route, contentWidth + 2.8, baseColor, edgeAlpha * 0.12);
    }

    // 渐变连线：分段绘制（使用半径偏移端点）
    if (needsGradient) {
      const points = sampleSemanticEdgeRoute(route, semanticMode && route.kind !== 'line' ? 24 : gradientSegments);
      for (let i = 0; i < points.length - 1; i++) {
        const t0 = i / (points.length - 1);
        const col = lerpColor(sColor, tColor, t0);
        const colHex = '#' + col.toString(16).padStart(6, '0');
        const w = sw2 + (tw2 - sw2) * t0;
        if (dashLen === 0) {
          g.moveTo(points[i].x, points[i].y).lineTo(points[i + 1].x, points[i + 1].y)
            .stroke({ color: colHex, width: w * disclosure.widthMultiplier, alpha: edgeAlpha, cap: 'round' });
        } else {
          drawDashedPolyline(g, [points[i], points[i + 1]], dashLen, gapLen, w * disclosure.widthMultiplier, colHex, edgeAlpha);
        }
      }
    } else {
      drawTo(g, contentWidth, baseColor, edgeAlpha);
    }

    // 发光保持单色（不做渐变）
    if (isSelected) {
      drawTo(glowG, 3.5, baseColor, 0.28);
      drawTo(glowG, 2, baseColor, 0.18);
    } else if (isBoxSelected) {
      drawTo(glowG, 2.5, baseColor, 0.2);
      drawTo(glowG, 1.5, baseColor, 0.12);
    }

    const tangent = semanticEdgeTangent(route, 1);
    const tangentLength = Math.hypot(tangent.x, tangent.y);
    const endUx = tangentLength > 1e-4 ? tangent.x / tangentLength : ux2;
    const endUy = tangentLength > 1e-4 ? tangent.y / tangentLength : uy2;
    if (e.arrow) {
      if (len2 < 1) return;
      const ax = route.end.x, ay = route.end.y;
      const size = 6;
      const arrowColor = useGradient ? '#' + tColor.toString(16).padStart(6, '0') : baseColor;
      g.moveTo(ax, ay)
       .lineTo(ax - endUx * size + endUy * size * 0.5, ay - endUy * size - endUx * size * 0.5)
       .lineTo(ax - endUx * size - endUy * size * 0.5, ay - endUy * size + endUx * size * 0.5)
       .closePath()
       .fill({ color: arrowColor, alpha: edgeAlpha });
    } else if (semanticMode && grammar.role === 'directional') {
      // Text-derived direction stays visibly tentative: an open mid-line chevron,
      // never a filled endpoint arrow that could be mistaken for graph data.
      const marker = semanticEdgePoint(route, 0.72);
      const markerTangent = semanticEdgeTangent(route, 0.72);
      const markerLength = Math.hypot(markerTangent.x, markerTangent.y) || 1;
      const mux = markerTangent.x / markerLength, muy = markerTangent.y / markerLength;
      const size = 4.2;
      g.moveTo(marker.x - mux * size + muy * size * 0.65, marker.y - muy * size - mux * size * 0.65)
        .lineTo(marker.x, marker.y)
        .lineTo(marker.x - mux * size - muy * size * 0.65, marker.y - muy * size + mux * size * 0.65)
        .stroke({ color: baseColor, width: 1.1, alpha: edgeAlpha * (grammar.tentative ? 0.72 : 0.9), cap: 'round', join: 'round' });
    } else if (semanticMode && grammar.role === 'structure') {
      g.circle(route.end.x, route.end.y, 2.1)
        .fill({ color: baseColor, alpha: edgeAlpha * (grammar.tentative ? 0.58 : 0.78) });
    }
    renderedEdges.set(idx, {
      route,
      labelAlpha: Math.min(1, edgeAlpha + 0.14) * disclosure.labelAlpha,
      showLabel: disclosure.showLabel,
      color: baseColor,
      labelPriority: (isSelected ? 1000 : isBoxSelected ? 900 : 0)
        + (focusedEdge ? 420 : 0)
        + (grammar.role === 'structure' ? 80 : grammar.role === 'reference' ? 68 : grammar.role === 'directional' ? 55 : 30)
        + Math.min(24, String(e.label || '').trim().length),
      mandatoryLabel: isSelected || isBoxSelected,
    });
  });

  edgeLayer.addChild(glowG);
  edgeLayer.addChild(g);

  // 边标签（复用 Text 对象，只更新位置和文字）
  const labelCache: Map<number, Text> = (edgeLayer as any)._labelCache || new Map();
  (edgeLayer as any)._labelCache = labelCache;
  const labelStyle = (edgeLayer as any)._labelStyle as TextStyle
    || new TextStyle({ fontSize: 11, fill: '#aaaaaa', fontFamily: 'var(--fg-font-family,"SiYuan Songti",serif)' });
  (edgeLayer as any)._labelStyle = labelStyle;
  const activeLabels = new Set<number>();
  const labelCandidates = graph.edges
    .map((edge, index) => ({ edge, index, rendered: renderedEdges.get(index) }))
    .filter(item => item.edge.label && item.rendered?.showLabel)
    .sort((a, b) => (b.rendered?.labelPriority || 0) - (a.rendered?.labelPriority || 0) || a.index - b.index);
  const mandatoryLabels = labelCandidates.filter(item => item.rendered?.mandatoryLabel);
  const labelLimit = semanticMode && Number.isFinite(semanticLabelBudget)
    ? Math.max(mandatoryLabels.length, Math.max(0, Math.floor(Number(semanticLabelBudget))))
    : labelCandidates.length;
  const visibleLabelIndices = new Set(labelCandidates.slice(0, labelLimit).map(item => item.index));
  graph.edges.forEach((e, idx) => {
    if (!e.label) return;
    const rendered = renderedEdges.get(idx);
    if (!rendered || !rendered.showLabel || !visibleLabelIndices.has(idx)) return;
    const midpoint = semanticEdgePoint(rendered.route, 0.5);
    const tangent = semanticEdgeTangent(rendered.route, 0.5);
    const tangentLength = Math.hypot(tangent.x, tangent.y) || 1;
    const offsetX = tangent.y / tangentLength * 7;
    const offsetY = -tangent.x / tangentLength * 7;
    let label = labelCache!.get(idx);
    // 缓存对象可能已被外层 destroy 销毁，检查 validity
    if (!label || !label.position) {
      label = new Text({ text: e.label, style: labelStyle, ...WORLD_TEXT_SAMPLING });
      label.anchor.set(0.5, 1);
      edgeLayer.addChild(label);
      labelCache!.set(idx, label);
    }
    label.text = e.label;
    label.position.set(midpoint.x + offsetX, midpoint.y + offsetY);
    label.alpha = rendered.labelAlpha;
    label.visible = true;
    activeLabels.add(idx);
  });
  // 清理不再有标签的旧 Text
  for (const [idx, label] of labelCache) {
    if (!activeLabels.has(idx)) {
      label.destroy({ children: true });
      labelCache!.delete(idx);
    }
  }
}
