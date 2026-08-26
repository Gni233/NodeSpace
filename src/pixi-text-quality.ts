/**
 * World-space text is routinely viewed below 1x in NodeSpace. Without mipmaps,
 * a whole high-resolution text texture is sampled into only a few screen
 * pixels, so different strokes disappear as the viewport crosses sub-pixels.
 *
 * Keep this policy on short, reusable labels. Long card bodies use semantic
 * detail LOD instead, avoiding a power-of-two mip chain for every paragraph.
 */
export const WORLD_TEXT_SAMPLING = Object.freeze({
  autoGenerateMipmaps: true,
  roundPixels: true,
  textureStyle: Object.freeze({
    magFilter: 'linear' as const,
    minFilter: 'linear' as const,
    mipmapFilter: 'linear' as const,
  }),
});

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** Fade paragraph detail in only when its 11px world font approaches a
 * readable screen size. Titles remain available throughout the overview. */
export function semanticBodyDetailAlpha(zoom: number): number {
  const safeZoom = Number.isFinite(zoom) ? zoom : 1;
  const t = clamp01((safeZoom - 0.64) / 0.24);
  return t * t * (3 - 2 * t);
}
