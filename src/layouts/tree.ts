export interface TreeLayoutOptions {
  siblingGap?: number;
  levelGap?: number;
  componentGap?: number;
}

export interface TreeLayoutResult {
  positions: Map<string, { x: number; y: number; depth: number; component: number }>;
  parentByNode: Map<string, string>;
  treeEdgeIndices: Set<number>;
  crossEdgeIndices: Set<number>;
  rootIds: string[];
}

const endpointId = (endpoint: any): string =>
  String(endpoint && typeof endpoint === 'object' ? endpoint.id : endpoint);

const nodeRadius = (node: any): number => {
  if (Number.isFinite(node?.radius)) return Math.max(7, Number(node.radius));
  return [22, 19, 16, 13, 10, 7][Math.max(1, Math.min(6, Number(node?.headingLevel) || 6)) - 1];
};

const nodeOrder = (node: any, index: number): number => {
  const order = node?.createdOrder ?? node?.createdAt ?? node?.order;
  return Number.isFinite(order) ? Number(order) : index;
};

/** Linear-time, deterministic forest layout with collision-aware subtree widths. */
export function computeTreeLayout(nodes: any[], edges: any[], options: TreeLayoutOptions = {}): TreeLayoutResult {
  const siblingGap = options.siblingGap ?? 42;
  const levelGap = options.levelGap ?? 118;
  const componentGap = options.componentGap ?? 150;
  const byId = new Map(nodes.map(node => [String(node.id), node]));
  const sourceIndex = new Map(nodes.map((node, index) => [String(node.id), index]));
  const adjacency = new Map<string, { id: string; edgeIndex: number; outward: boolean }[]>();
  const degree = new Map<string, number>();
  const indegree = new Map<string, number>();
  for (const id of byId.keys()) { adjacency.set(id, []); degree.set(id, 0); indegree.set(id, 0); }
  edges.forEach((edge, edgeIndex) => {
    const source = endpointId(edge?.source), target = endpointId(edge?.target);
    if (!byId.has(source) || !byId.has(target) || source === target) return;
    adjacency.get(source)!.push({ id: target, edgeIndex, outward: true });
    adjacency.get(target)!.push({ id: source, edgeIndex, outward: false });
    degree.set(source, (degree.get(source) || 0) + 1);
    degree.set(target, (degree.get(target) || 0) + 1);
    if (edge?.arrow || /^(?:hierarchy|parent|contains|membership|dependency|sequence|flow)$/i.test(String(edge?.kind || edge?.relationType || ''))) {
      indegree.set(target, (indegree.get(target) || 0) + 1);
    }
  });

  const compareIds = (a: string, b: string): number => {
    const an = byId.get(a), bn = byId.get(b);
    const ah = Number(an?.headingLevel) || 6, bh = Number(bn?.headingLevel) || 6;
    return ah - bh || nodeOrder(an, sourceIndex.get(a) || 0) - nodeOrder(bn, sourceIndex.get(b) || 0) || a.localeCompare(b);
  };
  for (const links of adjacency.values()) links.sort((a, b) => compareIds(a.id, b.id));

  const remaining = new Set(byId.keys());
  const components: string[][] = [];
  while (remaining.size > 0) {
    const start = [...remaining].sort(compareIds)[0];
    const component: string[] = [];
    const queue = [start];
    remaining.delete(start);
    for (let head = 0; head < queue.length; head++) {
      const id = queue[head];
      component.push(id);
      for (const link of adjacency.get(id) || []) {
        if (!remaining.delete(link.id)) continue;
        queue.push(link.id);
      }
    }
    components.push(component);
  }

  const positions = new Map<string, { x: number; y: number; depth: number; component: number }>();
  const parentByNode = new Map<string, string>();
  const treeEdgeIndices = new Set<number>();
  const crossEdgeIndices = new Set<number>();
  const rootIds: string[] = [];
  const laidOut: { ids: string[]; width: number; height: number; positions: Map<string, { x: number; y: number; depth: number }> }[] = [];

  components.forEach((component, componentIndex) => {
    const componentSet = new Set(component);
    const root = [...component].sort((a, b) => {
      const an = byId.get(a), bn = byId.get(b);
      const aStructure = Array.isArray(an?.structure?.memberIds) ? 0 : 1;
      const bStructure = Array.isArray(bn?.structure?.memberIds) ? 0 : 1;
      return aStructure - bStructure
        || (indegree.get(a) || 0) - (indegree.get(b) || 0)
        || (Number(an?.headingLevel) || 6) - (Number(bn?.headingLevel) || 6)
        || (degree.get(b) || 0) - (degree.get(a) || 0)
        || compareIds(a, b);
    })[0];
    rootIds.push(root);
    const children = new Map<string, string[]>();
    const visited = new Set<string>([root]);
    const queue = [root];
    for (let head = 0; head < queue.length; head++) {
      const parent = queue[head];
      const links = (adjacency.get(parent) || []).filter(link => componentSet.has(link.id));
      const outward = links.filter(link => link.outward);
      const ordered = [...outward, ...links.filter(link => !link.outward)];
      for (const link of ordered) {
        if (visited.has(link.id)) continue;
        visited.add(link.id);
        parentByNode.set(link.id, parent);
        if (!children.has(parent)) children.set(parent, []);
        children.get(parent)!.push(link.id);
        treeEdgeIndices.add(link.edgeIndex);
        queue.push(link.id);
      }
    }
    edges.forEach((edge, edgeIndex) => {
      const source = endpointId(edge?.source), target = endpointId(edge?.target);
      if (componentSet.has(source) && componentSet.has(target) && !treeEdgeIndices.has(edgeIndex)) crossEdgeIndices.add(edgeIndex);
    });

    const widths = new Map<string, number>();
    const subtreeWidth = (id: string): number => {
      const own = nodeRadius(byId.get(id)) * 2 + 34;
      const kids = children.get(id) || [];
      if (kids.length === 0) { widths.set(id, own); return own; }
      const childrenWidth = kids.reduce((sum, child) => sum + subtreeWidth(child), 0) + siblingGap * (kids.length - 1);
      const width = Math.max(own, childrenWidth);
      widths.set(id, width);
      return width;
    };
    const totalWidth = subtreeWidth(root);
    const local = new Map<string, { x: number; y: number; depth: number }>();
    let maxDepth = 0;
    const place = (id: string, depth: number, left: number) => {
      maxDepth = Math.max(maxDepth, depth);
      const width = widths.get(id) || 1;
      const kids = children.get(id) || [];
      if (kids.length === 0) {
        local.set(id, { x: left + width / 2, y: depth * levelGap, depth });
        return;
      }
      const kidsWidth = kids.reduce((sum, child) => sum + (widths.get(child) || 1), 0) + siblingGap * (kids.length - 1);
      let cursor = left + (width - kidsWidth) / 2;
      for (const child of kids) {
        const childWidth = widths.get(child) || 1;
        place(child, depth + 1, cursor);
        cursor += childWidth + siblingGap;
      }
      const first = local.get(kids[0])!, last = local.get(kids[kids.length - 1])!;
      local.set(id, { x: (first.x + last.x) / 2, y: depth * levelGap, depth });
    };
    place(root, 0, 0);
    laidOut.push({ ids: component, width: totalWidth, height: (maxDepth + 1) * levelGap, positions: local });
  });

  const targetRowWidth = Math.max(620, Math.sqrt(laidOut.reduce((sum, item) => sum + item.width * Math.max(item.height, levelGap), 0)) * 1.35);
  let cursorX = 0, cursorY = 0, rowHeight = 0;
  laidOut.forEach((component, componentIndex) => {
    if (cursorX > 0 && cursorX + component.width > targetRowWidth) {
      cursorX = 0;
      cursorY += rowHeight + componentGap;
      rowHeight = 0;
    }
    for (const [id, point] of component.positions) {
      positions.set(id, { x: point.x + cursorX, y: point.y + cursorY, depth: point.depth, component: componentIndex });
    }
    cursorX += component.width + componentGap;
    rowHeight = Math.max(rowHeight, component.height);
  });
  if (positions.size > 0) {
    const xs = [...positions.values()].map(point => point.x);
    const ys = [...positions.values()].map(point => point.y);
    const offsetX = -(Math.min(...xs) + Math.max(...xs)) / 2;
    const offsetY = -(Math.min(...ys) + Math.max(...ys)) / 2;
    for (const point of positions.values()) { point.x += offsetX; point.y += offsetY; }
  }
  return { positions, parentByNode, treeEdgeIndices, crossEdgeIndices, rootIds };
}
