import { CardGridState, Card, CardSource } from './types';

/** 查找连通分量 */
export function findComponents(nodes: any[], edges: any[]): string[][] {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);

  const edgeIds = (e: any): [string, string] => {
    const s = typeof e.source === 'object' ? e.source.id : e.source;
    const t = typeof e.target === 'object' ? e.target.id : e.target;
    return [s, t];
  };

  for (const e of edges) {
    const [s, t] = edgeIds(e);
    if (adj.has(s) && adj.get(s)!.indexOf(t) === -1) adj.get(s)!.push(t);
    if (adj.has(t) && adj.get(t)!.indexOf(s) === -1) adj.get(t)!.push(s);
  }

  const visited = new Set<string>();
  const comps: string[][] = [];
  for (const n of nodes) {
    if (visited.has(n.id)) continue;
    const comp: string[] = [];
    const q = [n.id];
    visited.add(n.id);
    while (q.length) {
      const cur = q.shift()!;
      comp.push(cur);
      for (const nb of adj.get(cur) || []) {
        if (!visited.has(nb)) { visited.add(nb); q.push(nb); }
      }
    }
    comps.push(comp);
  }
  return comps;
}

/** 创建默认状态 */
export function createCardGridState(cardSource: CardSource = 'components'): CardGridState {
  return {
    cards: [],
    selectedCardId: null,
    swapSource: null,
    swapTarget: null,
    borderStyle: 'straight',
    gap: 8,
    cardSource,
  };
}

/**
 * 增量同步卡片列表。
 * - 已有卡片保留 treemapOrder（优先使用 savedOrders 中持久化的值）
 * - 新卡片追加到末尾，treemapOrder 递增
 * - 消失的连通分量（节点被删完）移除对应卡片
 */
export function syncCards(
  state: CardGridState,
  components: string[][],
  creationOrder: Map<string, number>,
  savedOrders?: Record<string, number> | null,
): Card[] {
  // 按创建时间排序组件（旧的在前面）
  const ordered = components.map(comp => {
    const minOrder = Math.min(...comp.map(id => creationOrder.get(id) ?? Infinity));
    return { comp, order: isFinite(minOrder) ? minOrder : Infinity };
  });
  ordered.sort((a, b) => a.order - b.order);

  // 保留已有卡片的状态
  const oldByCardId = new Map<string, Card>();
  for (const c of state.cards) {
    oldByCardId.set(c.id, c);
  }

  // 计算新的最大 treemapOrder（优先用内存中的，其次用持久化的）
  let maxOrder = 0;
  for (const c of state.cards) {
    if (c.treemapOrder > maxOrder) maxOrder = c.treemapOrder;
  }
  if (savedOrders) {
    for (const v of Object.values(savedOrders)) {
      if (v > maxOrder) maxOrder = v;
    }
  }

  const newCards: Card[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const { comp } = ordered[i];
    const cardId = comp.join('|');
    const old = oldByCardId.get(cardId);
    if (old) {
      old.nodeIds = comp;
      newCards.push(old);
    } else {
      // 新卡片：优先用持久化的 order，否则自增
      const order = savedOrders?.[cardId] ?? ++maxOrder;
      if (order > maxOrder) maxOrder = order;
      newCards.push({
        id: cardId,
        nodeIds: comp,
        x: 0, y: 0,
        w: 200, h: 160,
        padding: 28,
        treemapOrder: order,
      });
    }
  }

  // 清理选中（如果卡片已不存在）
  if (state.selectedCardId && !newCards.find(c => c.id === state.selectedCardId)) {
    state.selectedCardId = null;
  }

  return newCards;
}

/**
 * 同步分组卡片：从标签分组重新生成卡片，保留已有卡片的 treemapOrder。
 */
export function syncGroupCards(
  state: CardGridState,
  newCards: Card[],
  savedOrders?: Record<string, number> | null,
): Card[] {
  const oldByCardId = new Map<string, Card>();
  for (const c of state.cards) {
    oldByCardId.set(c.id, c);
  }

  // 恢复已有卡片的 treemapOrder + 坐标 + 尺寸
  const result: Card[] = [];
  for (const nc of newCards) {
    const old = oldByCardId.get(nc.id);
    if (old) {
      nc.treemapOrder = savedOrders?.[nc.id] ?? old.treemapOrder;
      nc.x = old.x;
      nc.y = old.y;
      nc.w = old.w;
      nc.h = old.h;
    } else if (savedOrders?.[nc.id] != null) {
      nc.treemapOrder = savedOrders[nc.id];
    }
    result.push(nc);
  }

  if (state.selectedCardId && !result.find(c => c.id === state.selectedCardId)) {
    state.selectedCardId = null;
  }

  return result;
}
