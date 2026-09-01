/**
 * One semantic zoom language for the automatic workspace.
 *
 * Bands decide expensive composition changes and therefore use hysteresis.
 * Continuous values decide visual disclosure inside a band, so titles,
 * excerpts, media marks, regions and relationship labels never need to pop at
 * the same hard threshold.
 */
export type SemanticZoomBand = 'overview' | 'balanced' | 'reading';

export interface SemanticZoomProfile {
  zoom: number;
  band: SemanticZoomBand;
  titleAlpha: number;
  bodyAlpha: number;
  referenceBodyAlpha: number;
  bodyScale: number;
  referenceBodyScale: number;
  mediaAlpha: number;
  topicBlend: number;
  edgeDetailAlpha: number;
  edgeLabelAlpha: number;
  focusedEdgeLabelAlpha: number;
  echoReasonAlpha: number;
}

export interface SemanticInformationBudget {
  capacity: number;
  cardCount: number;
  edgeLabelCount: number;
  regionLabelCount: number;
  echoCount: number;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const clamp01 = (value: number): number => clamp(value, 0, 1);

export function semanticSmoothstep(min: number, max: number, value: number): number {
  const t = clamp01((value - min) / Math.max(1e-6, max - min));
  return t * t * (3 - 2 * t);
}

/** Asymmetric boundaries prevent a wheel ending near a threshold from
 * repeatedly recomposing the workspace. */
export function resolveSemanticZoomBand(
  zoom: number,
  previous?: SemanticZoomBand | null,
): SemanticZoomBand {
  const scale = Number.isFinite(zoom) ? zoom : 1;
  if (previous === 'overview') return scale >= 0.56 ? 'balanced' : 'overview';
  if (previous === 'reading') return scale < 0.94 ? 'balanced' : 'reading';
  if (previous === 'balanced') {
    if (scale < 0.48) return 'overview';
    if (scale >= 1.06) return 'reading';
    return 'balanced';
  }
  if (scale < 0.52) return 'overview';
  if (scale >= 1.02) return 'reading';
  return 'balanced';
}

const readableScale = (zoom: number, cap: number): number => {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const scale = clamp(0.7 / safeZoom, 1, cap);
  // Avoid rebuilding Pixi text textures for every small wheel delta.
  return Math.round(scale * 10) / 10;
};

export function semanticZoomProfile(
  zoom: number,
  previousBand?: SemanticZoomBand | null,
): SemanticZoomProfile {
  const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return {
    zoom: scale,
    band: resolveSemanticZoomBand(scale, previousBand),
    titleAlpha: semanticSmoothstep(0.22, 0.36, scale),
    bodyAlpha: semanticSmoothstep(0.30, 0.48, scale),
    referenceBodyAlpha: semanticSmoothstep(0.24, 0.38, scale),
    bodyScale: readableScale(scale, 1.8),
    referenceBodyScale: readableScale(scale, 2.2),
    mediaAlpha: semanticSmoothstep(0.34, 0.54, scale),
    topicBlend: semanticSmoothstep(0.32, 0.66, scale),
    edgeDetailAlpha: semanticSmoothstep(0.34, 0.72, scale),
    edgeLabelAlpha: semanticSmoothstep(0.58, 0.76, scale),
    focusedEdgeLabelAlpha: semanticSmoothstep(0.36, 0.50, scale),
    echoReasonAlpha: semanticSmoothstep(0.50, 0.68, scale),
  };
}

export function semanticViewportCapacity(width: number, height: number): number {
  return clamp(Math.floor((Math.max(320, width) * Math.max(240, height)) / 108_000), 3, 18);
}

/** A single screen-space budget bounds card forms and secondary annotations.
 * A visible card remains an indivisible reading unit: its excerpt is never
 * removed by a second hidden budget. */
export function semanticInformationBudget(options: {
  band: SemanticZoomBand;
  nodeCount: number;
  viewportWidth: number;
  viewportHeight: number;
  hasFocus: boolean;
}): SemanticInformationBudget {
  const { band, hasFocus } = options;
  const nodeCount = Math.max(0, Math.floor(options.nodeCount));
  const capacity = semanticViewportCapacity(options.viewportWidth, options.viewportHeight);
  const cardCount = clamp(
    band === 'overview'
      ? Math.max(hasFocus ? 3 : 1, Math.round(capacity * 0.42))
      : band === 'reading'
        ? Math.round(capacity * 1.55)
        : capacity,
    0,
    nodeCount,
  );
  const edgeLabelCount = band === 'overview'
    ? (hasFocus ? 2 : 0)
    : band === 'reading'
      ? capacity + 2
      : Math.max(hasFocus ? 3 : 2, Math.round(capacity * 0.62));
  const regionLabelCount = band === 'overview'
    ? Math.max(2, Math.round(capacity * 0.72))
    : band === 'reading'
      ? capacity + 4
      : capacity + 1;
  const echoCount = band === 'overview' ? 2 : band === 'reading' ? 4 : 3;
  return { capacity, cardCount, edgeLabelCount, regionLabelCount, echoCount };
}
