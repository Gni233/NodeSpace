import * as d3 from 'd3';
import { initSimulation } from "./simulation";
import { GraphData } from "./data/storage";
import { getStructureProjection } from './structure-nodes';
import { createStaticSimulation, isStaticSimulation } from './static-simulation';

export function createSimManager(
  graph: GraphData,
  getGw: () => number,
  getGh: () => number,
  getLinkDist: () => number,
  getLinkStr: () => number,
  getCharge: () => number,
  getCenterS: () => number,
  getCollideR: () => number,
  getGroupBound: () => number,
  getAlphaTarget: () => number,
  getHeatingTime: () => number,
  getExcludeNodeIds: () => Set<string> | undefined,
  onTick: () => void
) {
  let simulation: any = null;
  let heatTimer: any = null;
  let dragNodeId: string | null = null;
  let staticMode = false;

  const clearHeatTimer = () => {
    if (heatTimer) clearTimeout(heatTimer);
    heatTimer = null;
  };

  function initStatic(positionOverrides?: Map<string, { x: number; y: number }>) {
    staticMode = true;
    simulation?.stop?.();
    clearHeatTimer();
    const projection = getStructureProjection(graph);
    const excluded = new Set<string>([...(getExcludeNodeIds() ?? []), ...projection.hiddenNodeIds]);
    const visibleNodes = excluded.size === 0
      ? projection.nodes
      : projection.nodes.filter(node => !excluded.has(node.id));
    const nodes = !positionOverrides
      ? visibleNodes
      : visibleNodes.map(node => {
        const source = positionOverrides?.get(node.id);
        if (!source) return node;
        // During the short transition, inherit semantic/visual fields from the
        // graph node and own only mutable position state. A settled static view
        // uses graph nodes directly and allocates no per-node copies.
        const viewNode = Object.create(node);
        viewNode.x = source.x;
        viewNode.y = source.y;
        viewNode.fx = node.fixed ? source.x : null;
        viewNode.fy = node.fixed ? source.y : null;
        viewNode.fixed = !!node.fixed;
        return viewNode;
      });
    simulation = createStaticSimulation(nodes);
    return simulation;
  }

  function initSim() {
    if (staticMode) {
      initStatic();
      return;
    }
    if (simulation) simulation.stop();
    clearHeatTimer();
    const gw = getGw(), gh = getGh();
    simulation = initSimulation(graph, {
      gw, gh,
      linkDist: getLinkDist(),
      linkStr: getLinkStr(),
      charge: getCharge(),
      centerS: getCenterS(),
      collideR: getCollideR(),
      groupBound: getGroupBound(),
      excludeNodeIds: getExcludeNodeIds(),
      onTick: wrappedTick
    });
    simulation
      .alpha(1)
      .alphaTarget(getAlphaTarget())
      .restart();
    heatTimer = setTimeout(() => {
      if (simulation) simulation.alphaTarget(0);
      heatTimer = null;
    }, getHeatingTime() * 1000);
  }

  function setDragNode(id: string | null) {
    dragNodeId = id;
  }

  function getDragNode() {
    return dragNodeId;
  }

  const origOnTick = onTick;
  const wrappedTick = () => {
    if (dragNodeId && simulation) {
      const nodes = simulation.nodes();
      const dragNode = nodes.find((n: any) => n.id === dragNodeId);
      if (dragNode) {
        const VISCOUS_RADIUS = 150;
        const VISCOUS_STRENGTH = 0.015;
        for (const n of nodes) {
          if (n.id === dragNodeId || n.fx != null) continue;
          const dx = dragNode.x - n.x;
          const dy = dragNode.y - n.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < VISCOUS_RADIUS && dist > 1) {
            const force = VISCOUS_STRENGTH * (1 - dist / VISCOUS_RADIUS);
            n.vx += dx * force;
            n.vy += dy * force;
            n.vx -= n.vx * 0.02;
            n.vy -= n.vy * 0.02;
          }
        }
      }
    }
    origOnTick();
  };

  function updateCenter() {
    if (!simulation || isStaticSimulation(simulation)) return;
    const w = getGw(), h = getGh();
    simulation.force("center", d3.forceCenter(0, 0));
    simulation.force("radial", d3.forceRadial(0).x(0).y(0).strength(getCenterS()));
    simulation.alpha(0.3).restart();
  }

  function getSim() { return simulation; }

  function setStaticMode(value: boolean) {
    staticMode = value;
  }

  function isStaticMode() {
    return staticMode;
  }

  function dispose() {
    simulation?.stop?.();
    clearHeatTimer();
    simulation = null;
    dragNodeId = null;
  }

  return { initSim, initStatic, updateCenter, getSim, setStaticMode, isStaticMode, setDragNode, getDragNode, dispose };
}
