export interface OrderedNode {
  createdOrder?: unknown;
  [key: string]: unknown;
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
