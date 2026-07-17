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
    excludeNodeIds?: Set<string>;
    /** 中心点 x（默认 0） */
    centerX?: number;
    /** 中心点 y（默认 0） */
    centerY?: number;
    /** 矩形边界（仅卡片 sim 使用），节点接近边界时施加软弹簧力 */
    boundary?: { x: number; y: number; w: number; h: number };
  }
) {
  const { gw, gh, linkDist, linkStr, charge, centerS, collideR, groupBound, onTick, excludeNodeIds } = params;
  const cx = params.centerX ?? 0;
  const cy = params.centerY ?? 0;
  const bnd = params.boundary ?? null;

  const nodes = graph.nodes
    .filter(n => !excludeNodeIds?.has(n.id))
    .map(n => {
      const node = { ...n };
      if (n.fixed && n.x != null && n.y != null) {
        node.x = n.x; node.y = n.y; node.fx = n.x; node.fy = n.y;
      }
      if (typeof node.x !== 'number' || !isFinite(node.x)) node.x = (Math.random() - 0.5) * 200;
      if (typeof node.y !== 'number' || !isFinite(node.y)) node.y = (Math.random() - 0.5) * 200;
      return node;
    });

  const simulationEdges = graph.edges
    .filter(e => {
      if ((e.lineStyle || 'solid') !== 'solid' || (e as any)._conflict || (e as any)._dyingAt) return false;
      const src = typeof e.source === 'object' ? e.source.id : e.source;
      const tgt = typeof e.target === 'object' ? e.target.id : e.target;
      if (excludeNodeIds?.has(src) || excludeNodeIds?.has(tgt)) return false;
      return true;
    })
    .map(e => ({
      ...e,
      source: typeof e.source === 'object' ? (e.source as any).id ?? e.source : e.source,
      target: typeof e.target === 'object' ? (e.target as any).id ?? e.target : e.target,
      lineStyle: 'solid'
    }));

  const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(simulationEdges).id((d: any) => d.id).distance(linkDist).strength(linkStr))
    .force("charge", d3.forceManyBody().strength((d: any) => d.fixed ? 0 : charge))
    .force("center", d3.forceCenter(cx, cy))
    .force("collide", d3.forceCollide(collideR))
    .force("radial", d3.forceRadial(0).x(cx).y(cy).strength(centerS))
    .alpha(1)
    .on("tick", onTick);

  // 边界力：软弹簧，防止节点跑出卡片
  if (bnd) {
    simulation.force("bnd", () => {
      const stiff = 0.3;
      for (const n of simulation.nodes() as any) {
        if (n.fx != null || n.fy != null) continue;
        const r = (n.radius ?? n.r ?? 9);
        if (n.x - r < bnd.x) n.vx += stiff * (bnd.x - (n.x - r));
        else if (n.x + r > bnd.x + bnd.w) n.vx -= stiff * ((n.x + r) - (bnd.x + bnd.w));
        if (n.y - r < bnd.y) n.vy += stiff * (bnd.y - (n.y - r));
        else if (n.y + r > bnd.y + bnd.h) n.vy -= stiff * ((n.y + r) - (bnd.y + bnd.h));
      }
    });
  }

  simulation.force("fix-collide", () => {
    const allNodes = simulation.nodes() as any[];
    const fixedNodes = allNodes.filter(n => n.fx != null);
    const freeNodes = allNodes.filter(n => n.fx == null);
    for (const n of fixedNodes) { n.vx = 0; n.vy = 0; }
    if (fixedNodes.length === 0) return;
    const cellSize = 100;
    const grid = new Map<string, any[]>();
    const key = (x: number, y: number) => `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
    for (const n of fixedNodes) {
      const k = key(n.x, n.y);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k)!.push(n);
    }
    const cells = [...grid.keys()];
    for (const cell of cells) {
      const bucket = grid.get(cell)!;
      for (let i = 0; i < bucket.length; i++) {
        for (let j = i + 1; j < bucket.length; j++) {
          const a = bucket[i], b = bucket[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 20 && dist > 0.001) {
            const aFixed = a.fixed === true;
            const bFixed = b.fixed === true;
            if (aFixed && bFixed) continue;
            const push = (20 - dist) / dist * 0.5;
            if (!aFixed && !bFixed) {
              a.x -= dx * push; a.y -= dy * push;
              b.x += dx * push; b.y += dy * push;
              a.fx = a.x; a.fy = a.y;
              b.fx = b.x; b.fy = b.y;
            } else if (aFixed && !bFixed) {
              b.x += dx * push; b.y += dy * push;
              b.fx = b.x; b.fy = b.y;
            } else {
              a.x -= dx * push; a.y -= dy * push;
              a.fx = a.x; a.fy = a.y;
            }
          }
        }
      }
    }
    for (const free of freeNodes) {
      const ccx = Math.floor(free.x / cellSize);
      const ccy = Math.floor(free.y / cellSize);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const bucket = grid.get(`${ccx + dx},${ccy + dy}`);
          if (!bucket) continue;
          for (const fixed of bucket) {
            const dx2 = free.x - fixed.x, dy2 = free.y - fixed.y;
            const dist = Math.sqrt(dx2 * dx2 + dy2 * dy2);
            const minGap = (free.radius || 9) + (fixed.radius || 9) + 6;
            if (dist < minGap && dist > 0.001) {
              const push = (minGap - dist) / dist;
              free.vx += dx2 * push * 0.3;
              free.vy += dy2 * push * 0.3;
            }
          }
        }
      }
    }
  });

  simulation.nodes().forEach((n: any) => {
    const gs = graph.groups.filter(g => g.displayMode !== 'none' && (n.tags || []).includes(g.label));
    for (const g of gs) {
      const members = simulation.nodes().filter((sn: any) => (sn.tags || []).includes(g.label));
      if (members.length > 1) {
        const region = getGroupRegion(members, g.displayMode);
        if (region) {
          const [rcx, rcy] = region.closest(n.x, n.y);
          const dx = n.x - rcx, dy = n.y - rcy;
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
