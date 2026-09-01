import { semanticZoomProfile } from './semantic-zoom';

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

/** Ordinary cards keep a restrained excerpt in the wider overview. The
 * matching scale policy below prevents a partially minified paragraph: the
 * excerpt either reaches a useful screen size or fades away. */
export function semanticBodyDetailAlpha(zoom: number): number {
  return semanticZoomProfile(zoom).bodyAlpha;
}

/** Vault references are preview cards rather than empty placeholders. Reveal
 * their excerpt in the overview too; a separate scale policy below keeps the
 * shortened text readable without enlarging the card itself. */
export function semanticReferenceBodyDetailAlpha(zoom: number): number {
  return semanticZoomProfile(zoom).referenceBodyAlpha;
}

/** Keep the small, shortened reference excerpt near a 7.7px screen font in an
 * overview. Quantizing avoids rebuilding its text texture for every wheel
 * delta, and the cap prevents it from spilling across neighbouring cards. */
export function semanticReferenceBodyScale(zoom: number): number {
  return semanticZoomProfile(zoom).referenceBodyScale;
}

/** Ordinary card excerpts use the same readable-screen-size idea as vault
 * references, with a lower cap so many cards do not turn the overview into a
 * dense wall of text. */
export function semanticBodyScale(zoom: number): number {
  return semanticZoomProfile(zoom).bodyScale;
}
