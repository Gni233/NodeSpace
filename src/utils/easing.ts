/**
 * Motion Token System — unified easing curves + duration presets
 * All UI interactions reference these tokens for consistent feel.
 */

/** Cubic ease-in-out: t in [0,1] → eased value in [0,1] */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// --- Easing curves ---
export const EASING = {
  /** Standard ease-out (default for UI elements appearing) */
  easeOut: (t: number) => 1 - Math.pow(1 - t, 3),
  /** Standard ease-in (for elements disappearing) */
  easeIn: (t: number) => t * t * t,
  /** Cubic ease-in-out (for continuous transitions) */
  easeInOut: easeInOutCubic,
  /** Elastic ease-out (for playful entrances: node create, pop-in) */
  elasticOut: (t: number) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t - 0.1) * 5 * Math.PI) + 1;
  },
  /** Back ease-out (slight overshoot: for emphasis animations) */
  backOut: (t: number) => {
    const c1 = 1.70158; const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  /** Smooth step (smoothstep profile, for hover/active transitions) */
  smoothStep: (t: number) => t * t * (3 - 2 * t),
};

// --- Duration tokens (ms) ---
export const DURATION = {
  instant: 100,
  fast: 150,
  normal: 250,
  slow: 400,
  entrance: 500,
  layout: 900,
};
