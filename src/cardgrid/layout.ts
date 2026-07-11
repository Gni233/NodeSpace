import * as d3 from 'd3';
import { Card } from './types';

// ---- Squarified Treemap ----

interface TreemapItem { id: number; area: number; x?: number; y?: number; w?: number; h?: number; cardId?: string; }
type Rect = { x: number; y: number; w: number; h: number };

function worst(row: TreemapItem[], longSide: number): number {
  if (row.length === 0) return Infinity;
  const s = row.reduce((sum, r) => sum + r.area, 0);
  if (s === 0) return Infinity;
  let max = 0;
  for (const r of row) {
    const varDim = (r.area / s) * longSide;
    const shortDim = s / longSide;
    const ar = Math.max(varDim / shortDim, shortDim / varDim);
    if (ar > max) max = ar;
  }
  return max;
}

function placeRow(row: TreemapItem[], rect: Rect, out: TreemapItem[]): Rect {
  const rowArea = row.reduce((sum, r) => sum + r.area, 0);
  const { x, y, w, h } = rect;
  if (w >= h) {
    const rh = rowArea / w;
    let ox = x;
    for (const it of row) {
      const iw = (it.area / rowArea) * w;
      it.x = ox; it.y = y; it.w = iw; it.h = rh; ox += iw; out.push(it);
    }
    return { x, y: y + rh, w, h: h - rh };
  } else {
    const rw = rowArea / h;
    let oy = y;
    for (const it of row) {
      const ih = (it.area / rowArea) * h;
      it.x = x; it.y = oy; it.w = rw; it.h = ih; oy += ih; out.push(it);
    }
    return { x: x + rw, y, w: w - rw, h };
  }
}

function squarifyTreemap(items: TreemapItem[], rect: Rect): TreemapItem[] {
  if (items.length === 0 || rect.w <= 0 || rect.h <= 0) return [];
  const out: TreemapItem[] = [];
  let cur = rect;
  let i = 0;
  while (i < items.length) {
    const longSide = Math.max(cur.w, cur.h);
    const row: TreemapItem[] = [];
    do { row.push(items[i]); i++; }
    while (i < items.length && worst(row, longSide) >= worst([...row, items[i]], longSide));
    cur = placeRow(row, cur, out);
  }
  return out;
}

// ---- Public API ----

/**
 * 蒙德里安 treemap 排布卡片。
 * 按 treemapOrder 升序 → squarified treemap → 写回屏幕坐标。
 * 始终铺满屏幕区域。
 */
export function packGrid(cards: Card[], screenW: number, screenH: number, gap: number): void {
  const N = cards.length;
  if (N === 0 || screenW <= 0 || screenH <= 0) return;

  // 按 treemapOrder 排序
  const sorted = cards.map((card, i) => ({ card, idx: i }));
  sorted.sort((a, b) => a.card.treemapOrder - b.card.treemapOrder);

  const items: TreemapItem[] = sorted.map(({ card }) => ({
    id: card.treemapOrder,
    area: Math.max(1, card.nodeIds.length) * 10000,
    cardId: card.id,
  }));

  const totalRaw = items.reduce((s, it) => s + it.area, 0);
  const vpArea = screenW * screenH;
  const scale = vpArea / totalRaw;
  for (const it of items) it.area *= scale;

  const rect: Rect = {
    x: 0,
    y: 0,
    w: screenW,
    h: screenH,
  };

  const packed = squarifyTreemap(items, rect);

  for (let i = 0; i < sorted.length; i++) {
    const p = packed[i];
    const { card } = sorted[i];
    if (!p || p.x == null) continue;
    card.x = p.x! + gap / 2;
    card.y = p.y! + gap / 2;
    card.w = p.w! - gap;
    card.h = p.h! - gap;
  }
}

/**
 * 在卡内运行迷你 d3 force sim，排开节点。
 * 需要 viewport 变换参数把屏幕坐标的卡片边界转成世界坐标。
 */
export function layoutNodesInCard(
  card: Card,
  nodeMap: Map<string, any>,
  edges: any[],
  viewport: { toWorld: (sx: number, sy: number) => { x: number; y: number }; scale: { x: number; y: number } },
): void {
  const pad = card.padding;

  // 屏幕坐标 → 世界坐标
  const tl = viewport.toWorld(card.x + pad, card.y + pad);
  const br = viewport.toWorld(card.x + card.w - pad, card.y + card.h - pad);
  const box = { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
  if (box.w <= 20 || box.h <= 20 || card.nodeIds.length === 0) return;

  const compSet = new Set(card.nodeIds);
  const simNodes: any[] = [];
  for (let i = 0; i < card.nodeIds.length; i++) {
    const id = card.nodeIds[i];
    const n = nodeMap.get(id);
    if (!n) continue;
    const a = (i * 2.39996 + 0.5) % (Math.PI * 2);
    simNodes.push({
      id, x: box.x + box.w / 2 + Math.cos(a) * 5,
      y: box.y + box.h / 2 + Math.sin(a) * 5,
      r: (n?.radius ?? 14) + 6,
    });
  }
  if (simNodes.length === 0) return;

  const simEdges: any[] = [];
  for (const e of edges) {
    const s = typeof e.source === 'object' ? e.source.id : e.source;
    const t = typeof e.target === 'object' ? e.target.id : e.target;
    if (compSet.has(s) && compSet.has(t)) simEdges.push({ source: s, target: t });
  }

  const sim = d3.forceSimulation(simNodes)
    .force('cent', d3.forceCenter(box.x + box.w / 2, box.y + box.h / 2).strength(0.03))
    .force('coll', d3.forceCollide().radius((d: any) => d.r + 2).strength(1))
    .force('bnd', () => {
      for (const sn of simNodes) {
        if (sn.x - sn.r < box.x) sn.x = box.x + sn.r;
        else if (sn.x + sn.r > box.x + box.w) sn.x = box.x + box.w - sn.r;
        if (sn.y - sn.r < box.y) sn.y = box.y + sn.r;
        else if (sn.y + sn.r > box.y + box.h) sn.y = box.y + box.h - sn.r;
      }
    });

  if (simEdges.length > 0)
    sim.force('lnk', d3.forceLink(simEdges).id((d: any) => d.id).distance(40).strength(0.2));

  sim.stop();
  for (let i = 0; i < 100; i++) { sim.tick(); if (sim.alpha() < 0.001) break; }
  for (const sn of simNodes) {
    const n = nodeMap.get(sn.id);
    if (n) { (n as any)._cardX = sn.x; (n as any)._cardY = sn.y; }
  }
  sim.stop();
}
