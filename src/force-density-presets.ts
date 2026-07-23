import type { GraphSettings } from './data/storage';

/** The simulation controls that determine graph density. */
export type ForceDensitySettings = Pick<
  GraphSettings,
  | 'linkDist'
  | 'charge'
  | 'linkStr'
  | 'collideR'
  | 'centerS'
  | 'groupBound'
  | 'heatingTime'
  | 'alphaTarget'
>;

export type ForceDensityPreset = '极疏' | '疏' | '均衡' | '密' | '极密';
export type ForceDensitySelection = ForceDensityPreset | 'custom';

/**
 * Fixed, intentionally complete simulation configurations.  Keeping every
 * mechanics field here makes detection deterministic after a preset is applied.
 */
export const FORCE_DENSITY_PRESETS: Readonly<Record<ForceDensityPreset, Readonly<ForceDensitySettings>>> = {
  极疏: {
    linkDist: 240,
    charge: -300,
    linkStr: 0.2,
    collideR: 18,
    centerS: 0.01,
    groupBound: 1.2,
    heatingTime: 3,
    alphaTarget: 0.25,
  },
  疏: {
    linkDist: 180,
    charge: -200,
    linkStr: 0.25,
    collideR: 14,
    centerS: 0.015,
    groupBound: 1,
    heatingTime: 2.5,
    alphaTarget: 0.3,
  },
  均衡: {
    linkDist: 120,
    charge: -100,
    linkStr: 0.3,
    collideR: 10,
    centerS: 0.02,
    groupBound: 0.8,
    heatingTime: 2,
    alphaTarget: 0.3,
  },
  密: {
    linkDist: 80,
    charge: -70,
    linkStr: 0.4,
    collideR: 7,
    centerS: 0.04,
    groupBound: 0.5,
    heatingTime: 1.5,
    alphaTarget: 0.35,
  },
  极密: {
    linkDist: 50,
    charge: -40,
    linkStr: 0.5,
    collideR: 4,
    centerS: 0.08,
    groupBound: 0.2,
    heatingTime: 1,
    alphaTarget: 0.4,
  },
};

const DENSITY_FIELDS = Object.keys(FORCE_DENSITY_PRESETS.均衡) as (keyof ForceDensitySettings)[];

/** Returns a settings copy with the selected fixed density configuration. */
export function applyForceDensityPreset<T extends ForceDensitySettings>(
  settings: T,
  preset: ForceDensityPreset,
): T {
  return { ...settings, ...FORCE_DENSITY_PRESETS[preset] };
}

/** Returns `custom` whenever the mechanics values differ from all fixed presets. */
export function detectForceDensityPreset(settings: ForceDensitySettings): ForceDensitySelection {
  for (const preset of Object.keys(FORCE_DENSITY_PRESETS) as ForceDensityPreset[]) {
    const values = FORCE_DENSITY_PRESETS[preset];
    if (DENSITY_FIELDS.every(field => settings[field] === values[field])) return preset;
  }
  return 'custom';
}
