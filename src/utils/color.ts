export const PRESET_COLORS = [
  "#5B8FF9", "#5AD8A6", "#F6BD16", "#E8684A", "#6DC8EC",
  "#9270CA", "#FF99C3", "#269A99", "#FFCE30", "#FF6B6B"
];

/** Quiet editing choices; existing graph colors and the general palette stay intact. */
export const GRAPH_EDITOR_COLORS = ['#A8563E', '#8B7563', '#8B9270', '#5F8A83', '#738899', '#9985A8', '#B38D53', '#BA7F6C'];

/** Old files used black nodes and grey edges as theme placeholders. Explicit
 * choices made by the editor carry a marker so those colors remain usable. */
export function getExplicitGraphColor(item: any, kind: 'node' | 'edge'): string | null {
  let color = typeof item?.color === 'string' ? item.color.trim() : '';
  if (/^#[a-f\d]{3}$/i.test(color)) color = '#' + [...color.slice(1)].map(character => character + character).join('');
  if (!/^#[a-f\d]{6}(?:[a-f\d]{2})?$/i.test(color) || item?.colorMode === 'theme') return null;
  color = color.slice(0, 7);
  const placeholder = kind === 'node' ? '#000000' : '#BFBFBF';
  return item?.colorMode === 'custom' || color.toUpperCase() !== placeholder ? color : null;
}

export function setGraphColorOverride(item: any, color: string | null): void {
  if (color === null) { delete item.color; delete item.colorMode; }
  else { item.color = color; item.colorMode = 'custom'; }
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): RGB | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m
    ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
    : null;
}

export function rgbToHex(r: number, g: number, b: number): string {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

export function darken(hex: string, amount = 0.2): string {
  const c = hexToRgb(hex);
  if (!c) return "#000";
  return rgbToHex(
    Math.round(c.r * (1 - amount)),
    Math.round(c.g * (1 - amount)),
    Math.round(c.b * (1 - amount))
  );
}

export function randomColor(): string {
  return PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)];
}

export function textColor(bgHex: string): string {
  const c = hexToRgb(bgHex);
  if (!c) return "#fff";
  const luminance = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
  return luminance > 0.6 ? "#000" : "#fff";
}
