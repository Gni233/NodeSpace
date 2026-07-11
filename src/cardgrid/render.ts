import { Container, Graphics, Text } from 'pixi.js';
import { CardGridState, Card } from './types';

const LABEL_FONT = 'system-ui, -apple-system, sans-serif';
const LABEL_RESOLUTION = Math.max(3, (window.devicePixelRatio || 1) * 2);

function cardColorHex(card: Card): number {
  if (card.color) {
    return parseInt(card.color.replace('#', ''), 16);
  }
  return 0x666666;
}

export function renderCards(layer: Container, state: CardGridState, accentColor: number): void {
  const rd = state.borderStyle === 'rounded';

  // 卡片框线
  let cg = (layer as any)._cardGfx as Graphics | null;
  if (!cg || cg.destroyed) { cg = new Graphics(); (layer as any)._cardGfx = cg; layer.addChild(cg); }
  cg.clear();
  for (const c of state.cards) {
    const isSource = state.swapSource === c.id;
    if (isSource) continue;
    const color = cardColorHex(c);
    if (rd) cg.roundRect(c.x, c.y, c.w, c.h, 8).stroke({ color, width: 1.5, alpha: 0.4 });
    else cg.rect(c.x, c.y, c.w, c.h).stroke({ color, width: 1.5, alpha: 0.4 });
  }

  // 标签文字
  let labels = (layer as any)._cardLabels as Map<string, Text> | undefined;
  if (!labels) {
    labels = new Map();
    (layer as any)._cardLabels = labels;
  }
  const activeLabelIds = new Set<string>();
  for (const c of state.cards) {
    if (!c.label || state.swapSource === c.id) continue;
    activeLabelIds.add(c.id);
    let label = labels.get(c.id);
    if (!label || label.destroyed) {
      label = new Text({
        text: c.label,
        resolution: LABEL_RESOLUTION,
        style: {
          fontFamily: LABEL_FONT,
          fontSize: 13,
          fill: c.color || '#888888',
          align: 'center',
          letterSpacing: 1,
        } as any,
      });
      label.anchor.set(0.5, 0);
      layer.addChild(label);
      labels.set(c.id, label);
    }
    label.text = c.label;
    label.position.set(c.x + c.w / 2, c.y + 8);
    label.visible = true;
  }
  // 隐藏已删除卡片的 label
  for (const [id, label] of labels) {
    if (!activeLabelIds.has(id)) {
      label.visible = false;
      layer.removeChild(label);
      labels.delete(id);
    }
  }

  // 选中高亮（跟随主题强调色，圆角）
  let sel = (layer as any)._cardSelGfx as Graphics | null;
  if (!sel || sel.destroyed) { sel = new Graphics(); (layer as any)._cardSelGfx = sel; layer.addChild(sel); }
  sel.clear();
  if (state.selectedCardId) {
    const c = state.cards.find(x => x.id === state.selectedCardId);
    if (c) sel.roundRect(c.x - 2, c.y - 2, c.w + 4, c.h + 4, 10)
      .stroke({ color: accentColor, width: 3, alpha: 0.75 });
  }

  // 拖拽交换高亮
  let targetHL = (layer as any)._cardSwapTarget as Graphics | null;
  if (state.swapTarget) {
    const c = state.cards.find(x => x.id === state.swapTarget);
    if (c) {
      if (!targetHL || targetHL.destroyed) { targetHL = new Graphics(); (layer as any)._cardSwapTarget = targetHL; layer.addChild(targetHL); }
      targetHL.clear();
      targetHL.roundRect(c.x - 3, c.y - 3, c.w + 6, c.h + 6, 10)
        .stroke({ color: accentColor, width: 3, alpha: 0.5 });
    }
  } else {
    if (targetHL && !targetHL.destroyed) { targetHL.clear(); layer.removeChild(targetHL); (layer as any)._cardSwapTarget = null; }
  }

  // 拖拽源虚影
  let gh = (layer as any)._cardGhost as Graphics | null;
  if (state.swapSource) {
    const c = state.cards.find(x => x.id === state.swapSource);
    if (c) {
      if (!gh || gh.destroyed) { gh = new Graphics(); (layer as any)._cardGhost = gh; layer.addChild(gh); }
      gh.clear();
      gh.roundRect(c.x, c.y, c.w, c.h, 8)
        .stroke({ color: accentColor, width: 2, alpha: 0.3, alignment: 0 })
        .fill({ color: accentColor, alpha: 0.08 });
    }
  } else {
    if (gh && !gh.destroyed) { gh.clear(); layer.removeChild(gh); (layer as any)._cardGhost = null; }
  }
}

export function clearCards(layer: Container): void {
  const labels = (layer as any)._cardLabels as Map<string, Text> | undefined;
  if (labels) {
    for (const label of labels.values()) {
      if (!label.destroyed) { label.visible = false; layer.removeChild(label); label.destroy(); }
    }
    labels.clear();
    (layer as any)._cardLabels = null;
  }
  for (const k of ['_cardGfx', '_cardSelGfx', '_cardGhost', '_cardSwapTarget']) {
    const g = (layer as any)[k] as Graphics | null;
    if (g && !g.destroyed) { g.clear(); layer.removeChild(g); (layer as any)[k] = null; }
  }
}
