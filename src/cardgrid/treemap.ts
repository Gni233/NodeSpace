import * as d3 from 'd3';
import { Card } from './types';

interface TreemapDatum {
  card: Card;
  area: number;
}

/**
 * 蒙德里安风格 treemap 排布卡片。
 * 使用 D3 内置 squarified treemap：面积按节点数量分配，形状由位置动态决定。
 * 铺满整个屏幕区域。
 */
export function layoutCards(
  cards: Card[], screenW: number, screenH: number, gap: number,
  originX = 0, originY = 0,
): void {
  if (cards.length === 0 || screenW <= 0 || screenH <= 0) return;

  // D3 treemap 需要 hierarchy 结构，用 card 作为叶子数据
  const children: TreemapDatum[] = cards.map(c => ({
    card: c,
    area: Math.max(1, c.areaWeight ?? c.nodeIds.length),
  }));

  const root = d3
    .hierarchy<TreemapDatum>({ children } as any)
    .sum(d => d.area)
    // Card order is user-controlled by drag-and-drop. Sorting by area here made
    // swaps appear to succeed while the next layout silently undid them.
    .sort((a, b) => (a.data.card?.order ?? 0) - (b.data.card?.order ?? 0));

  const layout = d3.treemap<TreemapDatum>()
    .size([screenW, screenH])
    .paddingInner(gap / 2)
    .paddingOuter(gap / 2)
    .tile(d3.treemapResquarify)
    (root);

  // 将 treemap 结果写回 Card 对象（d3.treemap 在节点上动态添加 x0/y0/x1/y1）
  for (const leaf of layout.leaves()) {
    const rect = leaf as unknown as { x0: number; y0: number; x1: number; y1: number; data: TreemapDatum };
    const c = rect.data.card;
    const nextX = originX + rect.x0;
    const nextY = originY + rect.y0;
    const nextW = Math.max(0, rect.x1 - rect.x0);
    const nextH = Math.max(0, rect.y1 - rect.y0);
    c.targetX = nextX;
    c.targetY = nextY;
    c.targetW = nextW;
    c.targetH = nextH;
    if (!c.layoutReady) {
      c.x = nextX;
      c.y = nextY;
      c.w = nextW;
      c.h = nextH;
      c.layoutReady = true;
    }
  }
}

/**
 * 将卡片的屏幕坐标矩形转为世界坐标矩形（用于仿真边界力）
 */
export function cardWorldBox(
  card: Card,
  viewport: { toWorld: (sx: number, sy: number) => { x: number; y: number } } | null,
): { x: number; y: number; w: number; h: number } | null {
  if (!viewport) return null;
  const screen = cardContentScreenBox(card);
  const tl = viewport.toWorld(screen.x, screen.y);
  const br = viewport.toWorld(screen.x + screen.w, screen.y + screen.h);
  return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
}

export function cardContentScreenBox(card: Card): { x: number; y: number; w: number; h: number } {
  const responsivePad = Math.max(5, Math.min(card.padding, Math.min(card.w, card.h) * 0.08));
  const left = Math.min(responsivePad, Math.max(0, card.w / 2 - 2));
  const right = left;
  const top = Math.min(Math.max(30, responsivePad), Math.max(0, card.h / 2 - 2));
  const bottom = Math.min(responsivePad, Math.max(0, card.h / 2 - 2));
  return {
    x: card.x + left,
    y: card.y + top,
    w: Math.max(4, card.w - left - right),
    h: Math.max(4, card.h - top - bottom),
  };
}
