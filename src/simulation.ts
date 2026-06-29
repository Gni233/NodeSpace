import * as d3 from 'd3';
import { GraphData } from "./data/storage";
import { getGroupRegion } from "./geometry/hit";

export function initSimulation(
  graph: GraphData,
  params: {
    gw: number;
    gh: number;
    linkDist: number;
    linkStr: number;
    charge: number;
    centerS: number;
    collideR: number;
    groupBound: number;
    onTick: () => void;
    /** 排除的节点 ID 集合（折叠/搜索隐藏的节点不参与力学） */
    excludeNodeIds?: Set<string>;
  }
) {
  const { gw, gh, linkDist, linkStr, charge, centerS, collideR, groupBound, onTick, excludeNodeIds } = params;

  // 克隆节点（排除隐藏节点），并强制应用固定坐标
  const nodes = graph.nodes
    .filter(n => !excludeNodeIds?.has(n.id))
    .map(n => {
      const node = { ...n };
      if (n.fixed && n.x != null && n.y != null) {
        node.x = n.x;
        node.y = n.y;
        node.fx = n.x;
        node.fy = n.y;
      }
      return node;
    });

  // 虚线和冲突边不参与力学计算；排除涉及隐藏节点的边
  const simulationEdges = graph.edges
    .filter(e => {
      if ((e.lineStyle || 'solid') !== 'solid' || (e as any)._conflict || (e as any)._dyingAt) return false;
      const src = typeof e.source === 'object' ? e.source.id : e.source;
      const tgt = typeof e.target === 'object' ? e.target.id : e.target;
      if (excludeNodeIds?.has(src) || excludeNodeIds?.has(tgt)) return false;
      return true;
    })
    .map(e => ({ ...e, lineStyle: 'solid' }));

  const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(simulationEdges).id((d: any) => d.id).distance(linkDist).strength(linkStr))
    .force("charge", d3.forceManyBody().strength(charge))
    .force("center", d3.forceCenter(0, 0))
    .force("collide", d3.forceCollide(collideR))
    .force("radial", d3.forceRadial(0).x(0).y(0).strength(centerS))
    .alpha(1)
    .on("tick", onTick);

  // 固定节点：消除力场影响，仅保留相互排斥距离防止重叠
  simulation.force("fix-collide", () => {
    const allNodes = simulation.nodes() as any[];
    const fixedNodes = allNodes.filter(n => n.fx != null);
    // 固定节点之间最小排斥距离
    const minDist = 20;
    for (let i = 0; i < fixedNodes.length; i++) {
      for (let j = i + 1; j < fixedNodes.length; j++) {
        const a = fixedNodes[i], b = fixedNodes[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist && dist > 0.001) {
          const push = (minDist - dist) / dist * 0.5;
          a.x -= dx * push; a.y -= dy * push;
          b.x += dx * push; b.y += dy * push;
          a.fx = a.x; a.fy = a.y;
          b.fx = b.x; b.fy = b.y;
        }
      }
    }
    // 固定节点归零速度，不受力场影响
    for (const n of fixedNodes) {
      n.vx = 0; n.vy = 0;
    }
  });

  // 集合边界力
  simulation.nodes().forEach((n: any) => {
    const gs = graph.groups.filter(g => g.displayMode !== 'none' && (n.tags || []).includes(g.label));
    for (const g of gs) {
      const members = simulation.nodes().filter((sn: any) => (sn.tags || []).includes(g.label));
      if (members.length > 1) {
        const region = getGroupRegion(members, g.displayMode);
        if (region) {
          const [cx, cy] = region.closest(n.x, n.y);
          const dx = n.x - cx, dy = n.y - cy;
          if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 1) continue;
            n.vx -= (dx / dist) * groupBound * 0.01;
            n.vy -= (dy / dist) * groupBound * 0.01;
          }
        }
      }
    }
  });

  return simulation;
}

export function createGroupForce(
  simulation: any,
  graph: GraphData,
  groupBound: number
) {
  // 已集成在 initSimulation 中
}
