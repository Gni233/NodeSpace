export type GridLodSkip = 1 | 2 | 5;

export interface GridLodLevel {
  skip: GridLodSkip;
  /** Opacity contribution of this origin-anchored lattice. */
  alpha: number;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

function smoothstep(min: number, max: number, value: number): number {
  const t = clamp01((value - min) / Math.max(1e-6, max - min));
  return t * t * (3 - 2 * t);
}

/**
 * Returns exclusive, origin-anchored density tiers whose opacity is monotonic
 * with zoom. Zooming out can only fade points; no coarser tier re-brightens.
 */
export function getGridLodLevels(zoom: number): GridLodLevel[] {
  const k = Number.isFinite(zoom) ? Math.max(0, zoom) : 1;
  if (k <= 0.4) return [];
  return [
    { skip: 5, alpha: smoothstep(0.4, 0.7, k) },
    { skip: 2, alpha: smoothstep(0.56, 0.78, k) },
    { skip: 1, alpha: smoothstep(0.72, 0.9, k) },
  ].filter(level => level.alpha > 1e-4) as GridLodLevel[];
}

/** Aligns every LOD to the same immutable world origin, independent of view. */
export function alignedGridStart(min: number, baseStep: number, skip: GridLodSkip): number {
  const spacing = Math.max(1e-6, baseStep * skip);
  return Math.floor(min / spacing) * spacing - spacing;
}

export function dominantGridSkip(levels: readonly GridLodLevel[]): GridLodSkip {
  if (levels.length === 0) return 5;
  return levels.reduce((best, level) => level.alpha > best.alpha ? level : best).skip;
}

/** Keeps a primitive above the sub-pixel shimmer range without changing count. */
export function gridWorldSize(baseWorldSize: number, zoom: number, minScreenSize: number): number {
  const k = Math.max(0.16, Number.isFinite(zoom) ? zoom : 1);
  return Math.max(baseWorldSize, minScreenSize / k);
}

/** Conservative point-count estimate used to protect the lightweight budget. */
export function estimateGridPointCount(
  viewportWidth: number,
  viewportHeight: number,
  baseStep: number,
  zoom: number,
): number {
  const k = Math.max(1e-6, Number.isFinite(zoom) ? zoom : 1);
  return getGridLodLevels(k).reduce((total, level) => {
    const screenStep = Math.max(1, baseStep * level.skip * k);
    return total
      + Math.ceil(viewportWidth / screenStep + 3)
      * Math.ceil(viewportHeight / screenStep + 3);
  }, 0);
}
