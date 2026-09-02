import { Card, CardGridState, CardSource } from './types';
import { isNodeInGroup, isStructureCollection } from '../group-membership';

// ---- 连通分量查找 ----

/** BFS 查找所有连通分量 */
export function findComponents(nodes: any[], edges: any[]): string[][] {
  const adj = new Map<string, Set<string>>();
  for (const n of nodes) adj.set(n.id, new Set());

  for (const e of edges) {
    const s = typeof e.source === 'object' ? e.source.id : e.source;
    const t = typeof e.target === 'object' ? e.target.id : e.target;
    adj.get(s)?.add(t);
    adj.get(t)?.add(s);
  }

  const visited = new Set<string>();
  const comps: string[][] = [];
  for (const n of nodes) {
    if (visited.has(n.id)) continue;
    const comp: string[] = [];
    const q = [n.id];
    let head = 0;
    visited.add(n.id);
    while (head < q.length) {
      const cur = q[head++];
      comp.push(cur);
      for (const nb of adj.get(cur) || []) {
        if (!visited.has(nb)) { visited.add(nb); q.push(nb); }
      }
    }
    comps.push(comp);
  }
  return comps;
}

// ---- 标签分组 ----

/**
 * 从图数据的 groups 构建卡片列表。
 * @param graph 图数据
 * @param allGroups true=全分类模式，false=仅 displayMode !== 'none' 的组
 */
export function buildGroupCards(graph: any, allGroups: boolean, visibleNodes?: any[]): Card[] {
  const nodes: any[] = visibleNodes ?? graph.nodes ?? [];
  const groups: any[] = allGroups
    ? (graph.groups || [])
    : (graph.groups || []).filter((g: any) => g.displayMode !== 'none' || isStructureCollection(g));
  const groupNodes = new Map<string, any[]>();
  const conflictNodes: any[] = [];
  const noGroupNodes: any[] = [];

  for (const n of nodes) {
    const matchGroups = groups.filter((g: any) => isNodeInGroup(n, g));
    if (matchGroups.length === 0) {
      noGroupNodes.push(n);
    } else if (matchGroups.length === 1) {
      const gid = matchGroups[0].id;
      if (!groupNodes.has(gid)) groupNodes.set(gid, []);
      groupNodes.get(gid)!.push(n);
    } else {
      conflictNodes.push(n);
    }
  }

  const cards: Card[] = [];
  let order = 0;
  const padding = 28;

  for (const g of groups) {
    const gn = groupNodes.get(g.id) || [];
    if (gn.length === 0) continue;
    cards.push({
      id: `group:${g.id}`,
      nodeIds: gn.map(n => n.id),
      x: 0, y: 0, w: 200, h: 160,
      padding,
      order: order++,
      label: g.label,
      color: g.color || '#5B8FF9',
      viewScale: 1, viewOffsetX: 0, viewOffsetY: 0,
    });
  }

  if (noGroupNodes.length > 0) {
    cards.push({
      id: 'group:__nogroup__',
      nodeIds: noGroupNodes.map(n => n.id),
      x: 0, y: 0, w: 200, h: 160,
      padding,
      order: order++,
      label: '未分类',
      color: '#888888',
      viewScale: 1, viewOffsetX: 0, viewOffsetY: 0,
    });
  }

  if (conflictNodes.length > 0) {
    cards.push({
      id: 'group:__conflict__',
      nodeIds: conflictNodes.map(n => n.id),
      x: 0, y: 0, w: 200, h: 160,
      padding,
      order: order++,
      label: '冲突',
      color: '#CC4400',
      viewScale: 1, viewOffsetX: 0, viewOffsetY: 0,
    });
  }

  return cards;
}

// ---- 增量同步 ----

/**
 * 创建默认的空状态
 */
export function createState(source: CardSource = 'components'): CardGridState {
  return {
    cards: [],
    selectedCardId: null,
    source,
    borderStyle: 'straight',
    gap: 8,
    dragSourceId: null,
    dragTargetId: null,
  };
}

/**
 * 增量同步连通分量卡片：保留已有 order，新卡片追加到末尾。
 */
export function syncComponentCards(
  prevCards: Card[],
  components: string[][],
  creationOrder: Map<string, number>,
  savedOrders?: Record<string, number> | null,
): Card[] {
  // 按创建时间排序
  const ordered = components.map(comp => {
    const minOrder = Math.min(...comp.map(id => creationOrder.get(id) ?? Infinity));
    return { comp, order: isFinite(minOrder) ? minOrder : Infinity };
  });
  ordered.sort((a, b) => a.order - b.order);

  const prevById = new Map(prevCards.map(c => [c.id, c]));

  // 计算最大 order
  let maxOrder = 0;
  for (const c of prevCards) {
    if (c.order > maxOrder) maxOrder = c.order;
  }
  if (savedOrders) {
    for (const v of Object.values(savedOrders)) {
      if (v > maxOrder) maxOrder = v;
    }
  }

  const result: Card[] = [];
  const claimedPreviousCards = new Set<string>();
  for (const { comp } of ordered) {
    const stableNodeIds = [...comp].sort();
    const cardId = JSON.stringify(stableNodeIds);
    const prev = prevById.get(cardId);
    if (prev) {
      prev.nodeIds = stableNodeIds;
      result.push(prev);
    } else {
      const memberIds = new Set(stableNodeIds);
      let ancestor: Card | undefined;
      let bestOverlap = 0;
      for (const candidate of prevCards) {
        const overlap = candidate.nodeIds.reduce((count, id) => count + (memberIds.has(id) ? 1 : 0), 0);
        if (overlap > bestOverlap) { bestOverlap = overlap; ancestor = candidate; }
      }
      const canKeepSlot = ancestor != null && !claimedPreviousCards.has(ancestor.id);
      if (canKeepSlot) claimedPreviousCards.add(ancestor!.id);
      const order = savedOrders?.[cardId] ?? (canKeepSlot ? ancestor!.order : ++maxOrder);
      if (order > maxOrder) maxOrder = order;
      result.push({
        id: cardId,
        nodeIds: stableNodeIds,
        x: ancestor?.x ?? 0,
        y: ancestor?.y ?? 0,
        w: ancestor?.w ?? 200,
        h: ancestor?.h ?? 160,
        padding: 28,
        order,
        layoutReady: ancestor?.layoutReady,
        viewScale: ancestor?.viewScale ?? 1,
        viewOffsetX: ancestor?.viewOffsetX ?? 0,
        viewOffsetY: ancestor?.viewOffsetY ?? 0,
      });
    }
  }

  return result;
}

/**
 * 增量同步分组卡片：保留已有卡片的 order/坐标/尺寸。
 */
export function syncGroupCards(
  prevCards: Card[],
  newCards: Card[],
  savedOrders?: Record<string, number> | null,
): Card[] {
  const prevById = new Map(prevCards.map(c => [c.id, c]));

  return newCards.map(nc => {
    const prev = prevById.get(nc.id);
    if (prev) {
      nc.order = savedOrders?.[nc.id] ?? prev.order;
      nc.x = prev.x;
      nc.y = prev.y;
      nc.w = prev.w;
      nc.h = prev.h;
      nc.targetX = prev.targetX;
      nc.targetY = prev.targetY;
      nc.targetW = prev.targetW;
      nc.targetH = prev.targetH;
      nc.layoutReady = prev.layoutReady;
      nc.viewScale = prev.viewScale;
      nc.viewOffsetX = prev.viewOffsetX;
      nc.viewOffsetY = prev.viewOffsetY;
    } else if (savedOrders?.[nc.id] != null) {
      nc.order = savedOrders[nc.id];
    }
    return nc;
  });
}
