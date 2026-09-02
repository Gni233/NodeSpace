/** 卡片来源类型 */
export type CardSource = 'components' | 'groups' | 'category' | 'fullcat';

/** 一个卡片 = 一个连通分量或一个标签分组 */
export interface Card {
  id: string;
  /** 此卡片包含的节点 ID */
  nodeIds: string[];
  x: number;
  y: number;
  w: number;
  h: number;
  padding: number;
  /** treemap 排序位置（越小越靠前） */
  order: number;
  /** 阅读面积权重：节点数之外也考虑标题和正文体量。 */
  areaWeight?: number;
  /** 卡片标签（分类模式显示组名） */
  label?: string;
  /** 卡片颜色（分类模式使用组颜色） */
  color?: string;
  /** 平滑重排的目标矩形（屏幕坐标） */
  targetX?: number;
  targetY?: number;
  targetW?: number;
  targetH?: number;
  layoutReady?: boolean;
  /** 卡片内部独立视图状态 */
  viewScale: number;
  viewOffsetX: number;
  viewOffsetY: number;
}

/** 卡片网格全局状态 */
export interface CardGridState {
  cards: Card[];
  selectedCardId: string | null;
  /** 卡片来源类型 */
  source: CardSource;
  /** 边框风格 */
  borderStyle: 'straight' | 'rounded';
  /** 卡片间隙 */
  gap: number;
  /** 拖拽交换：源卡片 ID */
  dragSourceId: string | null;
  /** 拖拽交换：悬停目标卡片 ID */
  dragTargetId: string | null;
}
