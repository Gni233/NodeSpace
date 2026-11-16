export interface OrderedNode {
  createdOrder?: unknown;
  [key: string]: unknown;
}

/** Identity is independent of display order; rapid actions may share a timestamp. */
export function createNodeId(nodes: readonly { id?: unknown }[]): string {
  return createEntityIds('n', nodes, 1)[0];
}

export function createGroupId(groups: readonly { id?: unknown }[]): string {
  return createEntityIds('g', groups, 1)[0];
}

/** Reserve a whole batch with one scan of the live graph. */
export function createNodeIds(nodes: readonly { id?: unknown }[], count: number): string[] {
  return createEntityIds('n', nodes, count);
}

function createEntityIds(prefix: string, nodes: readonly { id?: unknown }[], count: number): string[] {
  if (!Number.isSafeInteger(count) || count < 0) throw new RangeError('Identity count must be a nonnegative integer');
  if (count === 0) return [];
  const base = `${prefix}_${Date.now()}`;
  const used = new Set(nodes.map(node => String(node.id)));
  const ids: string[] = [];
  let suffix = 0;
  while (ids.length < count) {
    const id = suffix === 0 ? base : `${base}_${suffix}`;
    suffix++;
    if (used.has(id)) continue;
    used.add(id); ids.push(id);
  }
  return ids;
}

function isValidCreatedOrder(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function incrementOrder(order: number): number {
  if (order >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError('createdOrder has reached the largest safe integer');
  }
  return order + 1;
}

function repairCreatedOrdersAndGetMaximum(nodes: OrderedNode[]): number {
  const usedOrders = new Set<number>();
  let maxOrder = -1;

  for (const node of nodes) {
    const order = node?.createdOrder;
    if (!isValidCreatedOrder(order) || usedOrders.has(order)) continue;
    usedOrders.add(order);
    maxOrder = Math.max(maxOrder, order);
  }

  let assignedMaximum = maxOrder;
  let nextOrder: number | null = null;
  const preservedOrders = new Set<number>();
  for (const node of nodes) {
    const order = node?.createdOrder;
    if (isValidCreatedOrder(order) && !preservedOrders.has(order)) {
      preservedOrders.add(order);
      continue;
    }
    nextOrder ??= incrementOrder(maxOrder);
    node.createdOrder = nextOrder;
    assignedMaximum = nextOrder;
    nextOrder = incrementOrder(nextOrder);
  }
  return assignedMaximum;
}

/**
 * Repairs missing, invalid, and duplicate creation orders in place.
 * Valid first occurrences are preserved; all other nodes receive consecutive
 * orders after the largest valid order in their current array order.
 */
export function repairCreatedOrders(nodes: OrderedNode[]): void {
  repairCreatedOrdersAndGetMaximum(nodes);
}

/** Returns the next creation order after repairing the existing node list. */
export function nextCreatedOrder(nodes: OrderedNode[]): number {
  return incrementOrder(repairCreatedOrdersAndGetMaximum(nodes));
}

/**
 * Repairs existing nodes once, then assigns consecutive creation orders to
 * each new node in its supplied order.
 */
export function assignCreatedOrders(nodes: OrderedNode[], existingNodes: OrderedNode[]): number[] {
  if (nodes.length === 0) return [];

  const maxOrder = repairCreatedOrdersAndGetMaximum(existingNodes);

  if (maxOrder > Number.MAX_SAFE_INTEGER - nodes.length) {
    throw new RangeError('createdOrder has reached the largest safe integer');
  }

  return nodes.map((node, index) => {
    const order = maxOrder + index + 1;
    node.createdOrder = order;
    return order;
  });
}

/** Repairs existing nodes, then assigns a fresh creation order to a new node. */
export function assignCreatedOrder(node: OrderedNode, existingNodes: OrderedNode[]): number {
  return assignCreatedOrders([node], existingNodes)[0];
}
