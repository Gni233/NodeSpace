import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { GraphData } from './data/storage';

const DASH_PATTERNS: Record<string, [number, number]> = {
  solid: [0, 0],
  'dash-2': [2, 5],
  'dash-4': [4, 6],
  'dash-8': [8, 6],
  dot: [2, 8],
  'dot-dense': [2, 4],
};

function drawDashed(g: Graphics, x1: number, y1: number, x2: number, y2: number, dashLen: number, gapLen: number, width: number, color: string, alpha: number) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;
  const ux = dx / len, uy = dy / len;
  let drawn = 0;
  let on = true;
  while (drawn < len) {
    const seg = on ? Math.min(dashLen, len - drawn) : Math.min(gapLen, len - drawn);
    const sx = x1 + ux * drawn, sy = y1 + uy * drawn;
    drawn += seg;
    const ex = x1 + ux * drawn, ey = y1 + uy * drawn;
    if (on) g.moveTo(sx, sy).lineTo(ex, ey).stroke({ color, width, alpha });
    on = !on;
  }
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
  if (n.radiusMode === 'custom' || (!n.radiusMode && n.radius)) return n.radius || 9;
  return LEVEL_RADII[(n.headingLevel || 6) - 1] || 9;
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
  }
) {
  const { hiddenNodes, focusNeighborIds, focusEdgeIndices, collapsedEdgeIndices, alpha = 0.6, selectedEdgeIndex, boxSelectedEdgeIndices, collapseEdgeFade, nodeColorMap, edgeColorGradient, edgeWidthByLevel } = opts;
  const isFocusActive = focusNeighborIds && focusNeighborIds.size > 0;
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

  graph.edges.forEach((e, idx) => {
    if (collapsedEdgeIndices?.has(idx)) return;
    const s = nodeMap.get(typeof e.source === 'object' ? e.source.id : e.source);
    const t = nodeMap.get(typeof e.target === 'object' ? e.target.id : e.target);
    if (!s || !t) return;
    if (hiddenNodes.has(s.id) || hiddenNodes.has(t.id)) return;

    let edgeAlpha = alpha;
    if (isFocusActive) {
      edgeAlpha = focusEdgeIndices?.has(idx) ? 0.8 : 0.12;
    }
    const fadeM = collapseEdgeFade?.get(idx);
    if (fadeM != null) { edgeAlpha *= fadeM; }
    if ((e as any)._createdAt) {
      edgeAlpha *= Math.min(1, (performance.now() - (e as any)._createdAt) / 300);
    }
    if ((e as any)._dyingAt) {
      edgeAlpha *= Math.max(0, 1 - (performance.now() - (e as any)._dyingAt) / 350);
    }

    const isSelected = selectedEdgeIndex === idx;
    const isBoxSelected = boxSelectedEdgeIndices?.has(idx) ?? false;

    const conflict = e._conflict === true;
    const userDashed = (e.lineStyle || 'solid') !== 'solid';
    const baseColor = (conflict && !userDashed) ? '#DD7733' : (e.color || '#BFBFBF');
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
    const sr = getNodeVisualRadius(s);
    const tr = getNodeVisualRadius(t);
    const sx2 = s.x + ux2 * (sr + 1);
    const sy2 = s.y + uy2 * (sr + 1);
    const tx2 = t.x - ux2 * (e.arrow ? tr + 7 : tr + 1);
    const ty2 = t.y - uy2 * (e.arrow ? tr + 7 : tr + 1);

    const drawTo = (target: Graphics, width: number, col: string, a: number) => {
      if (dashLen === 0) {
        target.moveTo(sx2, sy2).lineTo(tx2, ty2).stroke({ color: col, width, alpha: a });
      } else {
        drawDashed(target, sx2, sy2, tx2, ty2, dashLen, gapLen, width, col, a);
      }
    };

    // 渐变连线：分段绘制（使用半径偏移端点）
    if (needsGradient) {
      for (let i = 0; i < gradientSegments; i++) {
        const t0 = i / gradientSegments;
        const t1 = (i + 1) / gradientSegments;
        const sx3 = sx2 + (tx2 - sx2) * t0;
        const sy3 = sy2 + (ty2 - sy2) * t0;
        const ex3 = sx2 + (tx2 - sx2) * t1;
        const ey3 = sy2 + (ty2 - sy2) * t1;
        const col = lerpColor(sColor, tColor, t0);
        const colHex = '#' + col.toString(16).padStart(6, '0');
        const w = sw2 + (tw2 - sw2) * t0;
        if (dashLen === 0) {
          g.moveTo(sx3, sy3).lineTo(ex3, ey3).stroke({ color: colHex, width: w, alpha: edgeAlpha });
        } else {
          drawDashed(g, sx3, sy3, ex3, ey3, dashLen, gapLen, w, colHex, edgeAlpha);
        }
      }
    } else {
      drawTo(g, 1.5, baseColor, edgeAlpha);
    }

    // 发光保持单色（不做渐变）
    if (isSelected) {
      drawTo(glowG, 3.5, baseColor, 0.28);
      drawTo(glowG, 2, baseColor, 0.18);
    } else if (isBoxSelected) {
      drawTo(glowG, 2.5, baseColor, 0.2);
      drawTo(glowG, 1.5, baseColor, 0.12);
    }

    if (e.arrow) {
      if (len2 < 1) return;
      const ax = t.x - ux2 * (tr + 6), ay = t.y - uy2 * (tr + 6);
      const size = 6;
      const arrowColor = useGradient ? '#' + tColor.toString(16).padStart(6, '0') : baseColor;
      g.moveTo(ax, ay)
       .lineTo(ax - ux2 * size + uy2 * size * 0.5, ay - uy2 * size - ux2 * size * 0.5)
       .lineTo(ax - ux2 * size - uy2 * size * 0.5, ay - uy2 * size + ux2 * size * 0.5)
       .closePath()
       .fill({ color: arrowColor, alpha: edgeAlpha });
    }
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
  graph.edges.forEach((e, idx) => {
    if (!e.label) return;
    const srcId = typeof e.source === 'object' ? e.source.id : e.source;
    const tgtId = typeof e.target === 'object' ? e.target.id : e.target;
    const s = nodeMap.get(srcId);
    const t = nodeMap.get(tgtId);
    if (!s || !t) return;
    const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2 - 6;
    let label = labelCache!.get(idx);
    // 缓存对象可能已被外层 destroy 销毁，检查 validity
    if (!label || !label.position) {
      label = new Text({ text: e.label, style: labelStyle });
      label.anchor.set(0.5, 1);
      edgeLayer.addChild(label);
      labelCache!.set(idx, label);
    }
    label.text = e.label;
    label.position.set(mx, my);
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
