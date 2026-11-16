/** Shared circle geometry for layout, painting, relationship endpoints and hit testing. */
export const NODE_LEVEL_RADII = Object.freeze([22, 19, 16, 13, 10, 7]);

export function hasCustomNodeRadius(node: any): boolean {
  if (Array.isArray(node?.structure?.memberIds)) return false;
  return node?.radiusMode === 'custom'
    || (node?.radiusMode == null && Number.isFinite(node?.radius) && node.radius > 0);
}

export function getConfiguredNodeRadius(node: any): number {
  if (hasCustomNodeRadius(node)) {
    return Number.isFinite(node?.radius) && node.radius > 0 ? node.radius : 9;
  }
  const level = Number.isFinite(node?.headingLevel) ? Math.round(node.headingLevel) : 6;
  return NODE_LEVEL_RADII[Math.max(1, Math.min(6, level)) - 1];
}

export function getNodeVisualRadius(node: any): number {
  const card = node?._semanticCard;
  if (card && Number.isFinite(card.width) && card.width > 0 && Number.isFinite(card.height) && card.height > 0) {
    if (card.form === 'node') return Number.isFinite(card.nodeRadius) && card.nodeRadius > 0
      ? card.nodeRadius : getConfiguredNodeRadius(node);
    return Math.max(card.width, card.height) / 2;
  }
  return getConfiguredNodeRadius(node);
}
