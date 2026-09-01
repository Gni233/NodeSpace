export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface NormalizedSpacePortalAnchor {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

export interface SpacePortalZoomProfile {
  /** 0 = compact overview glyph, 1 = card-filling interior preview. */
  expansion: number;
  mapAlpha: number;
  labelAlpha: number;
  bodyAlpha: number;
  hintAlpha: number;
  borderAlpha: number;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const clamp01 = (value: number): number => clamp(value, 0, 1);

export function spacePortalSmoothstep(min: number, max: number, value: number): number {
  const t = clamp01((value - min) / Math.max(1e-6, max - min));
  return t * t * (3 - 2 * t);
}

/**
 * Continuous disclosure for a space portal. It intentionally has no bands:
 * wheel zoom should feel like looking further into one object, not switching
 * between unrelated card templates.
 */
export function spacePortalZoomProfile(zoom: number): SpacePortalZoomProfile {
  const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const expansion = spacePortalSmoothstep(0.52, 1.04, scale);
  return {
    expansion,
    mapAlpha: 0.48 + spacePortalSmoothstep(0.30, 0.68, scale) * 0.46,
    labelAlpha: spacePortalSmoothstep(0.72, 1.02, scale),
    bodyAlpha: 1 - spacePortalSmoothstep(0.60, 0.94, scale),
    hintAlpha: spacePortalSmoothstep(0.84, 1.12, scale),
    borderAlpha: 0.38 + spacePortalSmoothstep(0.42, 0.90, scale) * 0.42,
  };
}

/** Store an entrance independently of screen size so return remains anchored
 * after a resize or sidebar change. Width/height stay in screen pixels. */
export function normalizeSpacePortalAnchor(canvas: RectLike, portal: RectLike): NormalizedSpacePortalAnchor {
  const width = Math.max(1, Number(canvas.width) || 1);
  const height = Math.max(1, Number(canvas.height) || 1);
  return {
    centerX: clamp01(((portal.left - canvas.left) + portal.width / 2) / width),
    centerY: clamp01(((portal.top - canvas.top) + portal.height / 2) / height),
    width: clamp(Number(portal.width) || 1, 24, width),
    height: clamp(Number(portal.height) || 1, 24, height),
  };
}

export function resolveSpacePortalAnchor(canvas: RectLike, anchor: NormalizedSpacePortalAnchor): RectLike {
  const width = clamp(anchor.width, 24, Math.max(24, canvas.width));
  const height = clamp(anchor.height, 24, Math.max(24, canvas.height));
  const centerX = canvas.left + clamp01(anchor.centerX) * canvas.width;
  const centerY = canvas.top + clamp01(anchor.centerY) * canvas.height;
  return {
    left: clamp(centerX - width / 2, canvas.left, canvas.left + Math.max(0, canvas.width - width)),
    top: clamp(centerY - height / 2, canvas.top, canvas.top + Math.max(0, canvas.height - height)),
    width,
    height,
  };
}

export function expandedSpacePortalRect(canvas: RectLike, insets: Partial<Record<'top' | 'right' | 'bottom' | 'left', number>> = {}): RectLike {
  const leftInset = Math.max(0, insets.left || 0);
  const rightInset = Math.max(0, insets.right || 0);
  const topInset = Math.max(0, insets.top || 0);
  const bottomInset = Math.max(0, insets.bottom || 0);
  return {
    left: canvas.left + leftInset,
    top: canvas.top + topInset,
    width: Math.max(48, canvas.width - leftInset - rightInset),
    height: Math.max(48, canvas.height - topInset - bottomInset),
  };
}
