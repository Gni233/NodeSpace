export interface Transform {
  x: number;
  y: number;
  k: number;
}

export function getVisibleBounds(gw: number, gh: number, transform: Transform) {
  const minX = (-transform.x) / transform.k;
  const maxX = (gw - transform.x) / transform.k;
  const minY = (-transform.y) / transform.k;
  const maxY = (gh - transform.y) / transform.k;
  return { minX, maxX, minY, maxY };
}

export function canvasPoint(
  e: MouseEvent | PointerEvent | { clientX: number; clientY: number },
  canvas: HTMLCanvasElement,
  transform: Transform
): [number, number] {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left - transform.x) / transform.k;
  const y = (e.clientY - rect.top - transform.y) / transform.k;
  return [x, y];
}

export function hitTestNode(x: number, y: number, nodes: any[], expand: number = 0): any | null {
  for (const n of nodes) {
    const r = (n.radius || 9) + expand;
    const dx = n.x - x, dy = n.y - y;
    if (dx * dx + dy * dy <= r * r) return n;
  }
  return null;
}

export function hitTestEdge(x: number, y: number, edges: any[], nodes: any[], expand: number = 0): number | null {
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    const s = nodes.find(n => n.id === (typeof e.source === 'object' ? e.source.id : e.source));
    const t = nodes.find(n => n.id === (typeof e.target === 'object' ? e.target.id : e.target));
    if (!s || !t) continue;
    const dx = t.x - s.x, dy = t.y - s.y;
    const len2 = dx * dx + dy * dy;
    let tProj = ((x - s.x) * dx + (y - s.y) * dy) / len2;
    tProj = Math.max(0, Math.min(1, tProj));
    const projX = s.x + tProj * dx;
    const projY = s.y + tProj * dy;
    const dist2 = (x - projX) ** 2 + (y - projY) ** 2;
    if (dist2 <= (expand + 3) ** 2) return i;
  }
  return null;
}

export function hitTestGroup(x: number, y: number, groups: any[], nodes: any[]): any | null {
  for (const g of groups) {
    if (g.displayMode === 'none') continue;
    const members = nodes.filter(n => (n.tags || []).includes(g.label));
    if (members.length === 0) continue;
    if (g.displayMode === 'fluid') {
      const fluidRadiusFactor = g.fluidRadius || 3;
      for (const m of members) {
        const r = (m.radius || 9) * fluidRadiusFactor;
        const dx = m.x - x, dy = m.y - y;
        if (dx * dx + dy * dy <= r * r) return g;
      }
      continue;
    }
    const region = getGroupRegion(members, g.displayMode);
    if (!region) continue;
    if (region.contains(x, y)) return g;
  }
  return null;
}

export function getGroupRegion(members: any[], mode: string) {
  if (mode === 'fluid') return null;
  if (mode === 'blob') return getGroupRegion(members, 'polygon');
  if (mode === 'rect') {
    const xs = members.map(n => n.x);
    const ys = members.map(n => n.y);
    const minX = Math.min(...xs) - 10;
    const maxX = Math.max(...xs) + 10;
    const minY = Math.min(...ys) - 10;
    const maxY = Math.max(...ys) + 10;
    return {
      verts: () => [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]],
      center: () => [(minX + maxX) / 2, (minY + maxY) / 2],
      contains: (x: number, y: number) => x >= minX && x <= maxX && y >= minY && y <= maxY,
      closest: (px: number, py: number) => {
        const cx = Math.max(minX, Math.min(maxX, px));
        const cy = Math.max(minY, Math.min(maxY, py));
        return [cx, cy];
      }
    };
  }
  // polygon or polygon-compact
  const points = members.map(n => ({ x: n.x, y: n.y }));
  const hull = convexHull(points);
  if (hull.length < 3) return null;
  const maxRadius = Math.max(...members.map(n => n.radius || 9));
  const expand = maxRadius;

  const closestPointOnPolygon = (px: number, py: number) => {
    let minDist = Infinity;
    let cx = 0, cy = 0;
    for (let i = 0; i < hull.length; i++) {
      const j = (i + 1) % hull.length;
      const x1 = hull[i].x, y1 = hull[i].y;
      const x2 = hull[j].x, y2 = hull[j].y;
      const dx = x2 - x1, dy = y2 - y1;
      const len2 = dx * dx + dy * dy;
      let t = ((px - x1) * dx + (py - y1) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const projX = x1 + t * dx;
      const projY = y1 + t * dy;
      const dist2 = (px - projX) ** 2 + (py - projY) ** 2;
      if (dist2 < minDist) {
        minDist = dist2;
        cx = projX;
        cy = projY;
      }
    }
    return [cx, cy];
  };

  return {
    verts: () => hull.map(p => [p.x, p.y]),
    center: () => {
      const cx = hull.reduce((s, p) => s + p.x, 0) / hull.length;
      const cy = hull.reduce((s, p) => s + p.y, 0) / hull.length;
      return [cx, cy];
    },
    contains: (x: number, y: number) => {
      if (pointInPolygon(x, y, hull)) return true;
      if (expand > 0) {
        const [cx, cy] = closestPointOnPolygon(x, y);
        return (x - cx) ** 2 + (y - cy) ** 2 <= expand ** 2;
      }
      return false;
    },
    closest: (px: number, py: number) => {
      const [cx, cy] = closestPointOnPolygon(px, py);
      if (expand > 0) {
        const dist2 = (px - cx) ** 2 + (py - cy) ** 2;
        if (dist2 <= expand ** 2) {
          return [px, py];
        }
      }
      return [cx, cy];
    }
  };
}

function convexHull(points: { x: number; y: number }[]) {
  const sorted = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length <= 2) return sorted;
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

function cross(o: any, a: any, b: any) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function pointInPolygon(x: number, y: number, polygon: { x: number; y: number }[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
