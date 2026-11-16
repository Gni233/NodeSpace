import type { NodeTitleHitBounds } from './geometry/hit';
import type { NodeSprite } from './pixi-nodes';

/** Pixi bounds use canvas coordinates; pointer hit tests use this pane's world. */
export function renderedNodeTitleHitBounds(
  sprite: NodeSprite | undefined,
  viewport: { toWorld(x: number, y: number): { x: number; y: number } },
  worldX?: number,
  worldY?: number,
  includeEditingLabel = false,
): NodeTitleHitBounds | null {
  if (!sprite || (sprite as any)._dyingAnim) return null;
  const label = sprite.label;
  if (!label?.parent || !sprite.container?.parent || !String(label.text || '').trim()) return null;
  let alpha = 1;
  let direct = true, inViewport = false;
  let offsetX = 0, offsetY = 0, scaleX = 1, scaleY = 1, screenScaleX = 1, screenScaleY = 1;
  for (let item: any = label; item; item = item.parent) {
    if (item.destroyed || item.visible === false || item.measurable === false
      || (item.renderable === false && !(includeEditingLabel && item === label))) return null;
    alpha *= item.alpha ?? 1;
    if (item === viewport) inViewport = true;
    if (!direct) continue;
    if (typeof item.updateLocalTransform !== 'function') { direct = false; continue; }
    item.updateLocalTransform();
    const matrix = item.localTransform;
    // NodeSpace titles use translation and scale. Reuse Pixi's cached local
    // text bounds instead of allocating global bounds and inverting the
    // viewport twice for every title on every pointer movement.
    if (!matrix || matrix.b !== 0 || matrix.c !== 0) { direct = false; continue; }
    if (inViewport) {
      screenScaleX *= matrix.a; screenScaleY *= matrix.d;
    } else {
      offsetX = matrix.a * offsetX + matrix.tx; offsetY = matrix.d * offsetY + matrix.ty;
      scaleX *= matrix.a; scaleY *= matrix.d;
    }
  }
  if (!Number.isFinite(alpha) || alpha < .1) return null;
  if (direct && inViewport && typeof label.getLocalBounds === 'function') {
    // Text owns its geometry; only labels with children/effects need subtree bounds.
    const local = label.children.length === 0 && !label.effects?.length
      ? label.bounds : label.getLocalBounds();
    const startX = offsetX + local.x * scaleX, startY = offsetY + local.y * scaleY;
    const endX = startX + local.width * scaleX, endY = startY + local.height * scaleY;
    const left = Math.min(startX, endX), top = Math.min(startY, endY);
    const right = Math.max(startX, endX), bottom = Math.max(startY, endY);
    if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)
      || !Number.isFinite(screenScaleX) || !Number.isFinite(screenScaleY)
      || Math.abs((right - left) * screenScaleX) < 2
      || Math.abs((bottom - top) * screenScaleY) < 3) return null;
    if (worldX !== undefined && worldY !== undefined
      && (worldX < left || worldX > right || worldY < top || worldY > bottom)) return null;
    return { left, top, right, bottom, visible: true, alpha };
  }
  // Keep the general path for rotated/skewed containers and other renderers.
  const rectangle = label.getBounds().rectangle;
  const { x, y, width, height } = rectangle;
  if (![x, y, width, height].every(Number.isFinite) || width < 2 || height < 3) return null;
  const start = viewport.toWorld(x, y);
  const end = viewport.toWorld(x + width, y + height);
  if (![start.x, start.y, end.x, end.y].every(Number.isFinite)) return null;
  const result = {
    left: Math.min(start.x, end.x), top: Math.min(start.y, end.y),
    right: Math.max(start.x, end.x), bottom: Math.max(start.y, end.y),
    visible: true, alpha,
  };
  if (worldX !== undefined && worldY !== undefined
    && (worldX < result.left || worldX > result.right || worldY < result.top || worldY > result.bottom)) return null;
  return result;
}
