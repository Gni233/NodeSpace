import { Container, Graphics, Text } from 'pixi.js';
import { Card, CardGridState } from './types';

const LABEL_FONT = 'system-ui, -apple-system, sans-serif';
// Text at 2–3× remains crisp on phone DPRs; the old 3–8× textures consumed
// disproportionate mobile GPU memory and made a stable 60fps dock impossible.
const DPR = Math.min(3, Math.max(2, window.devicePixelRatio || 1));

/** 存储于 Container 上的符号键，用于 clearCards 兼容性 */
const GFX_KEY = Symbol.for('cardGridGfx');

/** 卡片渲染的图形对象集合 */
class CardGfx {
  border: Graphics;
  selection: Graphics;
  ghost: Graphics;
  swapTarget: Graphics;
  labels: Map<string, Text>;

  constructor() {
    this.border = new Graphics();
    this.selection = new Graphics();
    this.ghost = new Graphics();
    this.swapTarget = new Graphics();
    this.labels = new Map();
  }

  /** 将图形对象添加到指定 layer */
  attach(layer: Container): void {
    layer.addChild(this.border);
    layer.addChild(this.selection);
    layer.addChild(this.swapTarget);
    layer.addChild(this.ghost);
    (layer as any)[GFX_KEY] = this;
  }

  /** 清理并移除所有图形对象 */
  dispose(layer: Container): void {
    for (const gfx of [this.border, this.selection, this.ghost, this.swapTarget]) {
      if (gfx.parent) layer.removeChild(gfx);
      gfx.destroy();
    }
    for (const [, text] of this.labels) {
      text.visible = false;
      if (text.parent) text.parent.removeChild(text);
      text.destroy();
    }
    this.labels.clear();
    delete (layer as any)[GFX_KEY];
  }
}

function cardColorHex(card: Card): number {
  if (card.color) return parseInt(card.color.replace('#', ''), 16);
  return 0x666666;
}

/**
 * 渲染所有卡片边框、标签、选中高亮、拖拽虚影。
 */
export function renderCards(
  layer: Container,
  state: CardGridState,
  accentColor: number,
): void {
  // 获取或创建渲染状态
  let gfx = (layer as any)[GFX_KEY] as CardGfx | undefined;
  if (!gfx || gfx.border.destroyed) {
    gfx = new CardGfx();
    gfx.attach(layer);
  }

  const rd = state.borderStyle === 'rounded';

  // 1. 蒙德里安式卡片：矩形色面 + 明确分割线 + 顶部拖动手柄。
  gfx.border.clear();
  for (const c of state.cards) {
    if (c.id === state.dragSourceId) continue;
    const color = cardColorHex(c);
    if (rd) {
      gfx.border.roundRect(c.x, c.y, c.w, c.h, 8)
        .fill({ color, alpha: 0.035 })
        .stroke({ color, width: 3, alpha: 0.62 });
    } else {
      gfx.border.rect(c.x, c.y, c.w, c.h)
        .fill({ color, alpha: 0.035 })
        .stroke({ color, width: 3, alpha: 0.62 });
    }
    const headerH = Math.min(28, c.h);
    gfx.border.rect(c.x, c.y, c.w, headerH).fill({ color, alpha: 0.075 });
    if (c.w >= 36 && c.h >= 18) {
      for (let i = 0; i < 3; i++) {
        gfx.border.circle(c.x + 10 + i * 6, c.y + Math.min(14, headerH / 2), 1.4).fill({ color, alpha: 0.7 });
      }
    }
  }

  // 2. 标签文字
  const activeIds = new Set<string>();
  for (const c of state.cards) {
    if (c.id === state.dragSourceId || c.w < 72 || c.h < 24) continue;
    activeIds.add(c.id);
    const baseLabel = c.label || `${c.nodeIds.length} 个节点`;
    const viewLabel = Math.abs(c.viewScale - 1) > 0.02 ? `  ${Math.round(c.viewScale * 100)}%` : '';

    let label = gfx.labels.get(c.id);
    if (!label || label.destroyed) {
      label = new Text({
        text: baseLabel + viewLabel,
        resolution: DPR,
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
      gfx.labels.set(c.id, label);
    }
    label.text = baseLabel + viewLabel;
    label.position.set(c.x + c.w / 2, c.y + 8);
    label.visible = true;
  }
  // 清理消失卡片的 label
  for (const [id, label] of gfx.labels) {
    if (!activeIds.has(id)) {
      label.visible = false;
      if (label.parent) label.parent.removeChild(label);
      label.destroy();
      gfx.labels.delete(id);
    }
  }

  // 3. 选中高亮
  gfx.selection.clear();
  if (state.selectedCardId) {
    const c = state.cards.find(x => x.id === state.selectedCardId);
    if (c) {
      gfx.selection
        .roundRect(c.x - 2, c.y - 2, c.w + 4, c.h + 4, 10)
        .stroke({ color: accentColor, width: 3, alpha: 0.75 });
    }
  }

  // 4. 拖拽源虚影
  gfx.ghost.clear();
  if (state.dragSourceId) {
    const c = state.cards.find(x => x.id === state.dragSourceId);
    if (c) {
      gfx.ghost
        .roundRect(c.x, c.y, c.w, c.h, 8)
        .stroke({ color: accentColor, width: 2, alpha: 0.3, alignment: 0 })
        .fill({ color: accentColor, alpha: 0.08 });
    }
    gfx.ghost.visible = true;
  } else {
    gfx.ghost.visible = false;
  }

  // 5. 拖拽目标高亮
  gfx.swapTarget.clear();
  if (state.dragTargetId) {
    const c = state.cards.find(x => x.id === state.dragTargetId);
    if (c) {
      gfx.swapTarget
        .roundRect(c.x - 3, c.y - 3, c.w + 6, c.h + 6, 10)
        .stroke({ color: accentColor, width: 3, alpha: 0.5 });
    }
    gfx.swapTarget.visible = true;
  } else {
    gfx.swapTarget.visible = false;
  }
}

/**
 * 清理卡片层。main.ts 直接导入此函数。
 * 通过 Symbol 查找 CardGfx 实例，干净地销毁所有图形对象。
 */
export function clearCards(layer: Container): void {
  const gfx = (layer as any)[GFX_KEY] as CardGfx | undefined;
  if (gfx) {
    gfx.dispose(layer);
    return;
  }
  // 兜底：清理旧的魔法属性（transition period）
  const legacyLabels = (layer as any)._cardLabels as Map<string, Text> | undefined;
  if (legacyLabels) {
    for (const label of legacyLabels.values()) {
      if (!label.destroyed) { label.visible = false; layer.removeChild(label); label.destroy(); }
    }
    legacyLabels.clear();
    (layer as any)._cardLabels = null;
  }
  for (const k of ['_cardGfx', '_cardSelGfx', '_cardGhost', '_cardSwapTarget']) {
    const g = (layer as any)[k] as Graphics | null;
    if (g && !g.destroyed) {
      if (g.parent) g.parent.removeChild(g);
      g.destroy();
    }
    (layer as any)[k] = null;
  }
}
