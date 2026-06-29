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

/** 画虚线 */
function drawDashed(g: Graphics, x1: number, y1: number, x2: number, y2: number, dashLen: number, gapLen: number) {
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
    if (on) g.moveTo(sx, sy).lineTo(ex, ey);
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

const LEVEL_WIDTHS = [5, 4, 3, 2.5, 2, 1.5]; // headingLevel 1~6
const LEVEL_RADII  = [22, 19, 16, 13, 10, 7]; // headingLevel 1~6
const GRADIENT_SEGMENTS = 8;

/** 根据节点 headingLevel / radius / radiusMode 计算实际视觉半径 */
function getNodeVisualRadius(n: any): number {
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
  edgeLayer.removeChildren();
  const { hiddenNodes, focusNeighborIds, focusEdgeIndices, collapsedEdgeIndices, alpha = 0.6, selectedEdgeIndex, boxSelectedEdgeIndices, collapseEdgeFade, nodeColorMap, edgeColorGradient, edgeWidthByLevel } = opts;
  const isFocusActive = focusNeighborIds && focusNeighborIds.size > 0;
  const useGradient = edgeColorGradient && nodeColorMap;
  const useWidthLvl = edgeWidthByLevel;

  const g = new Graphics();
  const glowG = new Graphics();
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

    // 按节点视觉半径偏移起止点，避免线段穿过节点
    const sdx = t.x - s.x, sdy = t.y - s.y;
    const slen = Math.sqrt(sdx * sdx + sdy * sdy);
    const sux = slen > 0 ? sdx / slen : 0, suy = slen > 0 ? sdy / slen : 0;
    const sr = getNodeVisualRadius(s) + 1; // 源端偏移 = 视觉半径 + 1px 间距
    const tr = e.arrow ? getNodeVisualRadius(t) + 1 : 1; // 目标端偏移 = 有箭头时留出空间
    const x1 = s.x + sux * sr, y1 = s.y + suy * sr;
    const x2 = t.x - sux * tr, y2 = t.y - suy * tr;

    const drawTo = (target: Graphics, width: number, col: string, a: number) => {
      if (dashLen === 0) {
        target.moveTo(x1, y1).lineTo(x2, y2).stroke({ color: col, width, alpha: a });
      } else {
        drawDashed(target, x1, y1, x2, y2, dashLen, gapLen);
        target.stroke({ color: col, width, alpha: a });
      }
    };

    // 渐变连线：分段绘制
    if (needsGradient) {
      for (let i = 0; i < gradientSegments; i++) {
        const t0 = i / gradientSegments;
        const t1 = (i + 1) / gradientSegments;
        const sx = x1 + (x2 - x1) * t0;
        const sy = y1 + (y2 - y1) * t0;
        const ex = x1 + (x2 - x1) * t1;
        const ey = y1 + (y2 - y1) * t1;
        const col = lerpColor(sColor, tColor, t0);
        const colHex = '#' + col.toString(16).padStart(6, '0');
        const w = sw2 + (tw2 - sw2) * t0;
        if (dashLen === 0) {
          g.moveTo(sx, sy).lineTo(ex, ey).stroke({ color: colHex, width: w, alpha: edgeAlpha });
        } else {
          drawDashed(g, sx, sy, ex, ey, dashLen, gapLen);
          g.stroke({ color: colHex, width: w, alpha: edgeAlpha });
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
      const tvisR = getNodeVisualRadius(t);
      const ax = t.x - sux * tvisR, ay = t.y - suy * tvisR;
      const size = 6;
      const arrowColor = useGradient ? '#' + tColor.toString(16).padStart(6, '0') : baseColor;
      g.moveTo(ax, ay)
       .lineTo(ax - sux * size + suy * size * 0.5, ay - suy * size - sux * size * 0.5)
       .lineTo(ax - sux * size - suy * size * 0.5, ay - suy * size + sux * size * 0.5)
       .closePath()
       .fill({ color: arrowColor, alpha: edgeAlpha });
    }
  });

  edgeLayer.addChild(glowG);
  edgeLayer.addChild(g);

  // 绘制有 label 的边中点文字
  const labelStyle = new TextStyle({ fontSize: 11, fill: '#aaaaaa', fontFamily: 'var(--fg-font-family,"SiYuan Songti",serif)' });
  graph.edges.forEach((e) => {
    if (!e.label) return;
    const s = nodeMap.get(typeof e.source === 'object' ? e.source.id : e.source);
    const t = nodeMap.get(typeof e.target === 'object' ? e.target.id : e.target);
    if (!s || !t) return;
    const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2 - 6;
    const label = new Text({ text: e.label, style: labelStyle });
    label.anchor.set(0.5, 1);
    label.position.set(mx, my);
    edgeLayer.addChild(label);
  });
}
