import { Card } from './types';

/**
 * 从标签分组构建卡片列表。
 * @param graph 图数据（含 groups）
 * @param allGroups true=全分类模式（所有组），false=仅 displayMode != 'none' 的组
 * @returns 分组卡片列表（已按顺序分配 treemapOrder）
 */
export function buildGroupCards(graph: any, allGroups: boolean): Card[] {
  const nodes: any[] = graph.nodes || [];
  const groups: any[] = allGroups
    ? (graph.groups || [])
    : (graph.groups || []).filter((g: any) => g.displayMode !== 'none');
  if (groups.length === 0) return [];

  // 按标签分组
  const groupNodes = new Map<string, any[]>();
  const conflictNodes: any[] = [];
  const noGroupNodes: any[] = [];

  for (const n of nodes) {
    const tags: string[] = n.tags || [];
    const matchGroups = groups.filter((g: any) => tags.includes(g.label));
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

  // 按 groups 数组中的顺序创建卡片
  for (const g of groups) {
    const gn = groupNodes.get(g.id) || [];
    if (gn.length === 0) continue;
    const cardId = `group:${g.id}`;
    cards.push({
      id: cardId,
      nodeIds: gn.map(n => n.id),
      x: 0, y: 0,
      w: 200, h: 160,
      padding: 28,
      treemapOrder: order++,
      label: g.label,
      color: g.color || '#5B8FF9',
    });
  }

  // 未分类节点
  if (noGroupNodes.length > 0) {
    cards.push({
      id: 'group:__nogroup__',
      nodeIds: noGroupNodes.map(n => n.id),
      x: 0, y: 0,
      w: 200, h: 160,
      padding: 28,
      treemapOrder: order++,
      label: '未分类',
      color: '#888888',
    });
  }

  // 冲突节点（属于多个组）
  if (conflictNodes.length > 0) {
    cards.push({
      id: 'group:__conflict__',
      nodeIds: conflictNodes.map(n => n.id),
      x: 0, y: 0,
      w: 200, h: 160,
      padding: 28,
      treemapOrder: order++,
      label: '冲突',
      color: '#CC4400',
    });
  }

  return cards;
}
