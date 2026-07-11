import { Container, Graphics, Text } from 'pixi.js';

/** 一个卡片 = 一个连通分量或一个标签分组 */
export interface Card {
  id: string;
  /** 此卡片包含的节点 ID */
  nodeIds: string[];
  /** 屏幕坐标位置（由 treemap 决定） */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 卡片内的内边距 */
  padding: number;
  /** treemap 排序位置（越小越靠前，决定布局中的相对位置） */
  treemapOrder: number;
  /** 卡片标签（分类模式显示组名） */
  label?: string;
  /** 卡片颜色（分类模式使用组颜色） */
  color?: string;
}

/** 卡片来源类型 */
export type CardSource = 'components' | 'groups';

/** 卡片网格全局状态 */
export interface CardGridState {
  cards: Card[];
  selectedCardId: string | null;
  /** 拖拽交换：源卡片 ID */
  swapSource: string | null;
  /** 拖拽交换：悬停目标卡片 ID */
  swapTarget: string | null;
  /** 边框风格 */
  borderStyle: 'straight' | 'rounded';
  /** 卡片间隙 */
  gap: number;
  /** 卡片来源类型 */
  cardSource: CardSource;
}

/** 渲染用的缓存 */
export interface CardGfxCache {
  gfx: Graphics | null;
  selGfx: Graphics | null;
  ghostGfx: Graphics | null;
  swapTargetGfx: Graphics | null;
  labels: Map<string, Text>;
}
