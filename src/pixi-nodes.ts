import { Container, Graphics, Text } from 'pixi.js';

/** 多彩分级：六级不同色相，以色环黄金角 137.5° 生成长跨距调色盘，各主题偏移不同 */
export function getSpectrumColor(level: number, isDark: boolean, accentHex?: string): number {
  const h = Math.max(1, Math.min(6, level || 6));
  const t = (h - 1) / 5;
  // 从强调色提取基准色相，每主题偏移不同
  let baseHue = 15;
  if (accentHex) {
    const ar = parseInt(accentHex.slice(1, 3), 16);
    const ag = parseInt(accentHex.slice(3, 5), 16);
    const ab = parseInt(accentHex.slice(5, 7), 16);
    const maxV = Math.max(ar, ag, ab), minV = Math.min(ar, ag, ab);
    if (maxV !== minV) {
      if (maxV === ar) baseHue = ((ag - ab) / (maxV - minV)) * 60 + (ag < ab ? 360 : 0);
      else if (maxV === ag) baseHue = ((ab - ar) / (maxV - minV)) * 60 + 120;
      else baseHue = ((ar - ag) / (maxV - minV)) * 60 + 240;
    }
    // 黄金角偏移，确保各主题间色差明显
    baseHue = (baseHue + 137.5) % 360;
  }
  // 从基准色相跨 240° 渐变，覆盖秋林多彩感
  const hue = baseHue - t * 240;
  const normHue = ((hue % 360) + 360) % 360;
  const saturation = 0.62;
  const lightness = isDark ? 0.42 + t * 0.16 : 0.35 + t * 0.22;
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs((normHue / 60) % 2 - 1));
  const m = lightness - c / 2;
  let r = 0, g = 0, b = 0;
  if (normHue < 60) { r = c; g = x; }
  else if (normHue < 120) { r = x; g = c; }
  else if (normHue < 180) { g = c; b = x; }
  else if (normHue < 240) { g = x; b = c; }
  else if (normHue < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const R = Math.round((r + m) * 255);
  const G = Math.round((g + m) * 255);
  const B = Math.round((b + m) * 255);
  return (R << 16) | (G << 8) | B;
}

/** 分级多彩窄：六级窄跨距色相（全暖或全冷，由主题强调色决定） */
export function getNarrowSpectrumColor(level: number, isDark: boolean, accentHex: string): number {
  const h = Math.max(1, Math.min(6, level || 6));
  const t = (h - 1) / 5;
  const ar = parseInt(accentHex.slice(1, 3), 16);
  const ag = parseInt(accentHex.slice(3, 5), 16);
  const ab = parseInt(accentHex.slice(5, 7), 16);
  const maxV = Math.max(ar, ag, ab), minV = Math.min(ar, ag, ab);
  let accentHue = 210;
  if (maxV !== minV) {
    if (maxV === ar) accentHue = ((ag - ab) / (maxV - minV)) * 60 + (ag < ab ? 360 : 0);
    else if (maxV === ag) accentHue = ((ab - ar) / (maxV - minV)) * 60 + 120;
    else accentHue = ((ar - ag) / (maxV - minV)) * 60 + 240;
  }
  // 窄跨距：以强调色色相为锚点，60° 内渐变
  const baseHue = accentHue - 30;
  const hue = baseHue + t * 60;
  const normHue = hue % 360;
  const saturation = 0.55;
  const lightness = isDark ? 0.42 + t * 0.14 : 0.36 + t * 0.20;
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs((normHue / 60) % 2 - 1));
  const m = lightness - c / 2;
  let r = 0, g = 0, b = 0;
  if (normHue < 60) { r = c; g = x; }
  else if (normHue < 120) { r = x; g = c; }
  else if (normHue < 180) { g = c; b = x; }
  else if (normHue < 240) { g = x; b = c; }
  else if (normHue < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return (Math.round((r + m) * 255) << 16) | (Math.round((g + m) * 255) << 8) | Math.round((b + m) * 255);
}

/** 根据 headingLevel 和主题强调色生成六级默认色（基于强调色做明度/饱和度渐变） */
export function getHeadingColor(level: number, accentHex: string, isDark: boolean): number {
  const h = Math.max(1, Math.min(6, level || 6));
  const t = (h - 1) / 5; // 0(h1) → 1(h6)
  const ar = parseInt(accentHex.slice(1, 3), 16);
  const ag = parseInt(accentHex.slice(3, 5), 16);
  const ab = parseInt(accentHex.slice(5, 7), 16);

  // 向背景色方向混合（暗主题 → 向暗色淡出；亮主题 → 向亮色淡出）
  const bgR = isDark ? 30 : 235;
  const bgG = isDark ? 30 : 235;
  const bgB = isDark ? 30 : 235;
  // h1 接近强调色本身，h6 混入较多背景但保留可辨识度
  const blend = t * t * 0.55; // h1=0, h3≈0.09, h6≈0.55
  const R = Math.round(ar + (bgR - ar) * blend);
  const G = Math.round(ag + (bgG - ag) * blend);
  const B = Math.round(ab + (bgB - ab) * blend);
  return (R << 16) | (G << 8) | B;
}

export interface NodeSprite {
  container: Container;
  circle: Graphics;
  label: Text;
  radius: number;
}

export interface NodeVisualState {
  selected: boolean;
  boxSelected: boolean;
  searchMatch: boolean;
  fixed: boolean;
  fixedHollow: boolean;
  collapsed: boolean;
  inFocus: boolean;
  isNew: boolean;
  dying: boolean;
  /** 折叠动画进度 0~1（正在折叠中）；null 表示未在折叠动画 */
  collapsing: number | null;
  /** 展开动画进度 0~1（正在展开中）；null 表示未在展开动画 */
  expanding: number | null;
  /** 当前主题强调色（十六进制数字，如 0x5B8FF9） */
  accentColor: number;
  /** 强调色的互补/变体（用于框选，如 0xF59E0B） */
  accentAltColor: number;
  groupColor?: number;
  groupEdgeOnly?: boolean;
  pieColors?: number[];
  mediaType?: string;
  mediaExpanded?: boolean;
  mediaUrl?: string;
  hyperlink?: string;
  /** 是否有子节点（出边连接到其他节点） */
  hasChildren?: boolean;
}

const TEXT_RESOLUTION = Math.max(3, (window.devicePixelRatio || 1) * 2);

let _nodeFontFamily = 'system-ui, -apple-system, sans-serif';
export function setNodeFontFamily(f: string) { _nodeFontFamily = f; }

function readFontFamily(): string {
  return _nodeFontFamily;
}

export function createNodeSprite(
  id: string,
  labelStr: string,
  x: number, y: number,
  radius: number,
  color: number,
  labelColor: number,
  labelSize: number
): NodeSprite {
  const container = new Container({ label: `node-${id}` });
  container.position.set(x, y);

  const circle = new Graphics()
    .circle(0, 0, radius)
    .fill({ color, alpha: 0.85 });

  container.addChild(circle);

  const text = new Text({
    text: labelStr,
    resolution: TEXT_RESOLUTION,
    style: {
      fontFamily: readFontFamily(),
      fontSize: labelSize,
      fill: labelColor,
      align: 'center',
    } as any,
  });
  text.anchor.set(0.5, 0);
  text.y = radius + 3;
  container.addChild(text);

  return { container, circle, label: text, radius };
}

export function updateNodePosition(sprite: NodeSprite, x: number, y: number) {
  sprite.container.position.set(x, y);
}

/** Animate _fixedAnim toward target value */
function animateFixedAnim(sprite: NodeSprite, target: number) {
  if (sprite.container.destroyed) return;
  const sn = sprite as any;
  if (sn._fixedAnimTarget === target) return;
  sn._fixedAnimTarget = target;

  // 终止旧动画
  if (sn._fixedAnimRaf) cancelAnimationFrame(sn._fixedAnimRaf);

  const step = () => {
    const cur = (sn._fixedAnim as number) ?? (target === 1 ? 1 : 0);
    if (typeof cur !== 'number' || isNaN(cur)) { sn._fixedAnim = target; sn._fixedAnimRaf = null; return; }
    const diff = target - cur;
    if (Math.abs(diff) < 0.01) {
      sn._fixedAnim = target;
      sn._fixedAnimRaf = null;
      return;
    }
    sn._fixedAnim = cur + diff * 0.28;
    sn._fixedAnimRaf = requestAnimationFrame(step);
  };
  sn._fixedAnimRaf = requestAnimationFrame(step);
}

export function cancelSpriteAnimations(sprite: NodeSprite): void {
  const sn = sprite as any;
  if (sn._fixedAnimRaf) { cancelAnimationFrame(sn._fixedAnimRaf); sn._fixedAnimRaf = null; }
  if (sn._growRaf) { cancelAnimationFrame(sn._growRaf); sn._growRaf = null; }
  if (sn._dyingRaf) { cancelAnimationFrame(sn._dyingRaf); sn._dyingRaf = null; }
}

export function applyNodeVisual(
  sprite: NodeSprite,
  baseColor: number,
  labelColor: number,
  labelSize: number,
  state: NodeVisualState
) {
  // 节点固定状态过渡动画：首次渲染也从 0 起跳，保证动画可见
  const sn = sprite as any;
  if (sn._fixedAnimTarget !== (state.fixed ? 1 : 0)) {
    if (sn._fixedAnim === undefined) sn._fixedAnim = 0;
    animateFixedAnim(sprite, state.fixed ? 1 : 0);
  }
  const { circle, container, radius } = sprite;
  const r = radius;
  const alpha = state.inFocus ? 1 : 0.15;

  // 多媒体节点图标（Feather Icons 风格）
  const oldIcon = (sprite as any)._mediaIcon as Graphics | undefined;
  if (oldIcon) { sprite.container.removeChild(oldIcon); oldIcon.destroy(); (sprite as any)._mediaIcon = null; }
  if (state.mediaType && !state.mediaExpanded) {
    const g = new Graphics();
    const s = r * 0.4;
    const w = 1.4;
    const a = 0.5;
    g.setStrokeStyle({ color: 0xffffff, width: w, alpha: a, cap: 'round', join: 'round' });
    if (state.mediaType === 'image') {
      // rect + circle (sun) + mountain
      g.roundRect(-s * 1.2, -s * 0.9, s * 2.4, s * 1.8, s * 0.2).stroke();
      g.circle(-s * 0.2, -s * 0.2, s * 0.35).stroke();
      g.moveTo(-s * 0.8, s * 0.6).lineTo(-s * 0.1, s * 0.0).lineTo(s * 0.4, s * 0.6).stroke();
    } else if (state.mediaType === 'audio') {
      // four vertical bars, varying heights
      const gap = s * 0.6;
      const h1 = s * 0.6, h2 = s * 1.4, h3 = s * 0.9, h4 = s * 1.1;
      g.moveTo(-gap * 1.5, -h1 / 2).lineTo(-gap * 1.5, h1 / 2);
      g.moveTo(-gap * 0.5, -h2 / 2).lineTo(-gap * 0.5, h2 / 2);
      g.moveTo(gap * 0.5, -h3 / 2).lineTo(gap * 0.5, h3 / 2);
      g.moveTo(gap * 1.5, -h4 / 2).lineTo(gap * 1.5, h4 / 2);
      g.stroke();
    } else if (state.mediaType === 'video') {
      // play triangle
      g.moveTo(-s * 0.7, -s * 0.9).lineTo(s * 1.0, 0).lineTo(-s * 0.7, s * 0.9).closePath().stroke();
    } else if (state.mediaType === 'md') {
      // document with folded corner
      g.moveTo(-s, -s * 1.1).lineTo(s * 0.4, -s * 1.1).lineTo(s * 1.0, -s * 0.5).lineTo(s * 1.0, s * 1.1).lineTo(-s, s * 1.1).closePath().stroke();
      g.moveTo(s * 0.4, -s * 1.1).lineTo(s * 0.4, -s * 0.5).lineTo(s * 1.0, -s * 0.5).stroke();
      for (let i = 0; i < 3; i++) {
        g.moveTo(-s * 0.5, -s * 0.3 + i * s * 0.5).lineTo(s * 0.4, -s * 0.3 + i * s * 0.5).stroke();
      }
    }
    g.alpha = 0.75;
    (sprite as any)._mediaIcon = g;
    sprite.container.addChild(g);
  }

  circle.clear();

  // 填充色
  let fillColor = baseColor;
  if (state.groupColor && !state.groupEdgeOnly) fillColor = state.groupColor;

  // --- 发光（6步同心圆 + 二次衰减模拟平滑渐变）---
  const drawSmoothGlow = (color: number, maxAlpha: number) => {
    for (let i = 5; i >= 0; i--) {
      const t = (5 - i) / 5;
      const offset = (i + 0.5);
      const alpha = maxAlpha * (1 - t) * (1 - t);
      circle.circle(0, 0, r + offset).fill({ color, alpha });
    }
  };

  const accentGlow = (state.selected && !state.boxSelected);
  const searchGlow = state.searchMatch;
  const altGlow = state.boxSelected;

  if (searchGlow) drawSmoothGlow(state.accentColor, 0.10);
  if (accentGlow) drawSmoothGlow(state.accentColor, 0.16);
  if (altGlow) drawSmoothGlow(state.accentAltColor, 0.14);

  // --- 节点实体 ---
  const fillAlpha = alpha * 0.85;
  // 冲突节点饼状设色
  if (state.pieColors && state.pieColors.length >= 2) {
    const colors = state.pieColors;
    const anglePer = (2 * Math.PI) / colors.length;
    for (let i = 0; i < colors.length; i++) {
      circle.moveTo(0, 0).arc(0, 0, r, i * anglePer, (i + 1) * anglePer).closePath()
        .fill({ color: colors[i], alpha: fillAlpha });
    }
  } else {
    // 固定节点可切换：镂空环 vs 实心
    const fixedT = (typeof (sprite as any)._fixedAnim === 'number' && !isNaN((sprite as any)._fixedAnim))
      ? (sprite as any)._fixedAnim : (state.fixed ? 1 : 0);
    // 普通实心（不固定或固定但不开镂空）
    if (!state.fixedHollow || fixedT < 1) {
      circle.circle(0, 0, r).fill({ color: fillColor, alpha: fillAlpha * (state.fixedHollow ? (1 - fixedT) : 1) });
    }
    // 固定镂空环+中心点
    if (state.fixedHollow && fixedT > 0) {
      circle.circle(0, 0, r).fill({ color: fillColor, alpha: Math.max(0.15, fillAlpha) * fixedT });
      circle.circle(0, 0, r - Math.max(1.5, r * 0.25)).cut();
      circle.circle(0, 0, Math.max(r * 0.3, 1.5)).fill({ color: fillColor, alpha: Math.max(0.3, fillAlpha) * fixedT });
    }
    if (state.groupEdgeOnly) {
      circle.stroke({ color: state.groupColor!, width: 2, alpha });
    }
  }

  // 选中描边 vs 框选描边（使用主题强调色）
  if (state.selected && !state.boxSelected) {
    circle.circle(0, 0, r + 1).stroke({ color: state.accentColor, width: 2, alpha });
  }
  if (state.boxSelected) {
    circle.circle(0, 0, r + 1).stroke({ color: state.accentAltColor, width: 2, alpha });
  }

  // 搜索高亮环（跟随主题强调色，略淡于选中）
  if (state.searchMatch) {
    circle.circle(0, 0, r).stroke({ color: state.accentColor, width: 1.5, alpha: 0.35 });
  }

  // 折叠标记：节点名下方加 ...
  const oldDotsLabel = (sprite as any)._collapseDots as Text | undefined;
  if (oldDotsLabel) { oldDotsLabel.visible = false; sprite.container.removeChild(oldDotsLabel); (sprite as any)._collapseDots = null; }
  if (state.collapsed && state.hasChildren) {
    const dots = new Text({
      text: '...',
      resolution: TEXT_RESOLUTION,
      style: {
        fontFamily: readFontFamily(),
        fontSize: Math.max(10, labelSize * 0.75),
        fill: labelColor,
        fontWeight: 'bold',
        align: 'left',
        letterSpacing: 1,
      } as any,
    });
    dots.anchor.set(0, 0.3);
    dots.position.set(r * 0.55, r * 0.15);
    dots.alpha = 0.7;
    (sprite as any)._collapseDots = dots;
    sprite.container.addChild(dots);
  }

  // 新节点弹性生长动画
  if (state.isNew && !(sprite as any)._grew) {
    (sprite as any)._grew = true;
    sprite.container.scale.set(0.01);
    const start = performance.now();
    const grow = () => {
      const t = Math.min(1, (performance.now() - start) / 350);
      const s = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const bounce = 1 + (1 - s) * 0.1; // slight overshoot then settle
      const scale = t < 0.85 ? s : bounce * (1 - (t - 0.85) / 0.15) + 1 * ((t - 0.85) / 0.15);
      sprite.container.scale.set(Math.max(0.01, scale));
      if (t < 1) requestAnimationFrame(grow);
      else sprite.container.scale.set(1);
    };
    requestAnimationFrame(grow);
  }

  // 消失动画：缩放到 0 + 淡出
  if (state.dying && !(sprite as any)._dyingAnim) {
    (sprite as any)._dyingAnim = true;
    const start = performance.now();
    const shrink = () => {
      if (!sprite || !sprite.container || !sprite.container.scale) return;
      const t = Math.min(1, (performance.now() - start) / 200);
      sprite.container.scale.set(1 - t);
      sprite.container.alpha = 1 - t;
      if (t < 1) requestAnimationFrame(shrink);
    };
    requestAnimationFrame(shrink);
    return;
  }

  // 折叠动画：先微放大再缩小吸入父节点
  // 缩放进度快于位移，在到达父节点边界前就已消失
  if (state.collapsing != null) {
    const t = state.collapsing;
    const scaleT = Math.min(1, t / 0.65); // 缩放比位移早 35% 完成
    let scale: number;
    if (scaleT < 0.15) {
      // 先微放大到 112%
      scale = 1 + (scaleT / 0.15) * 0.12;
    } else {
      // 再缩小吸入
      const ts = (scaleT - 0.15) / 0.85;
      scale = 1.12 * (1 - ts * ts * ts);
      scale = Math.max(0.01, scale);
    }
    sprite.container.scale.set(scale);
    sprite.container.alpha = Math.max(0, 1 - scaleT * scaleT);
  }

  // 展开动画：放大（ease-out cubic，从父节点长出）
  if (state.expanding != null) {
    const t = state.expanding;
    const easeOut = 1 - Math.pow(1 - t, 3); // ease-out cubic
    sprite.container.scale.set(Math.max(0.01, easeOut));
    sprite.container.alpha = Math.min(1, t);
  }

  if (state.collapsing == null && state.expanding == null) {
    container.alpha = alpha;
  }
  sprite.label.style.fontSize = labelSize;
  sprite.label.style.fill = labelColor;
  sprite.label.style.fontFamily = readFontFamily();
  sprite.label.y = r + 3;
}
