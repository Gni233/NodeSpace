export const PRESET_COLORS = [
  "#5B8FF9", "#5AD8A6", "#F6BD16", "#E8684A", "#6DC8EC",
  "#9270CA", "#FF99C3", "#269A99", "#FFCE30", "#FF6B6B"
];

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
