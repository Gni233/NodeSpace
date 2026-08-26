/**
 * Minimal simulation-compatible view over already-positioned nodes.
 *
 * Rendering and interaction code historically consume the small public surface
 * of d3-force. Auto layout does not need forces, timers, link arrays, or
 * velocity integration, so this facade keeps those call sites working without
 * retaining a d3 simulation.
 */
export interface StaticSimulation {
  readonly __static: true;
  nodes(): any[];
  nodes(next: any[]): StaticSimulation;
  alpha(): number;
  alpha(value: number): StaticSimulation;
  alphaTarget(): number;
  alphaTarget(value: number): StaticSimulation;
  force(name: string): undefined;
  force(name: string, value: unknown): StaticSimulation;
  restart(): StaticSimulation;
  stop(): StaticSimulation;
  tick(iterations?: number): StaticSimulation;
  on(name: string, listener?: unknown): StaticSimulation;
  find(x: number, y: number, radius?: number): any | undefined;
}

export function createStaticSimulation(initialNodes: any[]): StaticSimulation {
  let currentNodes = initialNodes;
  const simulation: StaticSimulation = {
    __static: true,
    nodes(next?: any[]): any {
      if (next === undefined) return currentNodes;
      currentNodes = next;
      return simulation;
    },
    alpha(value?: number): any {
      return value === undefined ? 0 : simulation;
    },
    alphaTarget(value?: number): any {
      return value === undefined ? 0 : simulation;
    },
    force(_name: string, value?: unknown): any {
      return value === undefined ? undefined : simulation;
    },
    restart: () => simulation,
    stop: () => simulation,
    tick: () => simulation,
    on: () => simulation,
    find(x: number, y: number, radius = Infinity) {
      let nearest: any | undefined;
      let bestSquared = radius * radius;
      for (const node of currentNodes) {
        const dx = Number(node.x) - x;
        const dy = Number(node.y) - y;
        const squared = dx * dx + dy * dy;
        if (!Number.isFinite(squared) || squared > bestSquared) continue;
        nearest = node;
        bestSquared = squared;
      }
      return nearest;
    },
  };
  return simulation;
}

export function isStaticSimulation(value: unknown): value is StaticSimulation {
  return !!value && (value as StaticSimulation).__static === true;
}
