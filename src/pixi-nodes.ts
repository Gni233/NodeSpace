import { Container, Graphics, Text } from 'pixi.js';
import type { SemanticCardMetrics } from './layouts/semantic';
import { semanticBodyDetailAlpha, semanticBodyScale, semanticReferenceBodyDetailAlpha, semanticReferenceBodyScale, WORLD_TEXT_SAMPLING } from './pixi-text-quality';
import { semanticZoomProfile } from './semantic-zoom';
import { spacePortalZoomProfile } from './space-navigation';

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
  vaultResourceKind?: string;
  resourceReferenceKind?: string;
  resourceReferenceStatus?: 'ok' | 'broken';
  /** Live, transient source text. Reference cards render this directly instead
   * of depending on a possibly stale semantic-layout excerpt. */
  resourceReferencePreview?: string;
  spaceReferenceKind?: 'node' | 'space' | 'fragment';
  spaceReferenceStatus?: 'ok' | 'broken';
  spaceReferencePreview?: string;
  spaceReferenceMiniMap?: {
    points: Array<{ id: string; x: number; y: number; label?: string; level?: number }>;
    edges: Array<{ source: string; target: string }>;
  };
  mediaExpanded?: boolean;
  mediaUrl?: string;
  hyperlink?: string;
  /** 是否有子节点（出边连接到其他节点） */
  hasChildren?: boolean;
  /** 结构节点包含的成员数量 */
  structureMemberCount?: number;
  semanticCard?: SemanticCardMetrics & { regionColorIndex?: number };
  semanticZoom?: number;
  /** Layout animation multiplier, kept separate from semantic zoom alpha. */
  semanticTransitionAlpha?: number;
  /** Read-only content temporarily projected from another graph or Vault view. */
  localContextProxy?: boolean;
}

const SEMANTIC_PALETTE = [0x5e81ac, 0x88c0d0, 0x8fbcbb, 0xa3be8c, 0xb48ead, 0xd08770, 0xebcb8b];

const TEXT_RESOLUTION = Math.max(3, (window.devicePixelRatio || 1) * 2);

function fitCardExcerpt(value: string, limit: number): string {
  const characters = Array.from(String(value || '').replace(/\s+/g, ' ').trim());
  if (characters.length <= limit) return characters.join('');
  return `${characters.slice(0, Math.max(1, limit - 1)).join('').trimEnd()}…`;
}

interface SemanticBodyViewportState {
  excerpt: string;
  width: number;
  height: number;
  headerHeight: number;
  focusAlpha: number;
  isReferencePreview: boolean;
  reservedRight?: number;
  spacePortal?: boolean;
}

interface SemanticTitleViewportState {
  baseAlpha: number;
}

interface SemanticMediaViewportState {
  persistent: boolean;
  nodeForm: boolean;
}

interface SpacePortalViewportState {
  container: Container;
  labels: Text[];
  hint: Text;
  compactScale: number;
  compactX: number;
  compactY: number;
  expandedX: number;
  expandedY: number;
  focusAlpha: number;
}

/** Update only zoom-dependent paragraph detail. This deliberately avoids a
 * graph/layout redraw and is safe to call from the viewport's frequent moved
 * event. */
export function updateSemanticBodyViewport(sprite: NodeSprite, zoom: number): boolean {
  const body = (sprite as any)._semanticBody as Text | undefined;
  const view = (sprite as any)._semanticBodyViewport as SemanticBodyViewportState | undefined;
  if (!body || body.destroyed || !view) return false;
  const previewScale = view.isReferencePreview
    ? semanticReferenceBodyScale(zoom)
    : semanticBodyScale(zoom);
  const bodyWidth = (view.width - 30 - (view.reservedRight || 0)) / previewScale;
  const lineHeight = view.isReferencePreview ? 15 : 17;
  const availableHeight = Math.max(lineHeight, (view.height - view.headerHeight - 14) / previewScale);
  const visibleLines = Math.max(1, Math.min(3, Math.floor(availableHeight / lineHeight)));
  const visibleCharacters = Math.max(6, Math.floor(bodyWidth / 11) * visibleLines);
  const excerpt = fitCardExcerpt(view.excerpt, visibleCharacters);
  const detailAlpha = (view.isReferencePreview
    ? semanticReferenceBodyDetailAlpha(zoom)
    : semanticBodyDetailAlpha(zoom));
  const visible = detailAlpha > 0.015;
  let changed = body.text !== excerpt
    || body.style.wordWrapWidth !== bodyWidth
    || body.style.lineHeight !== lineHeight
    || body.scale.x !== previewScale
    || body.visible !== visible;
  const portalBodyAlpha = view.spacePortal ? spacePortalZoomProfile(zoom).bodyAlpha : 1;
  const alpha = (view.isReferencePreview ? 0.68 : 0.58) * view.focusAlpha * detailAlpha * portalBodyAlpha;
  changed ||= Math.abs(body.alpha - alpha) > 0.001;
  if (body.text !== excerpt) body.text = excerpt;
  if (body.style.wordWrapWidth !== bodyWidth) body.style.wordWrapWidth = bodyWidth;
  if (body.style.lineHeight !== lineHeight) body.style.lineHeight = lineHeight;
  if (body.scale.x !== previewScale) body.scale.set(previewScale);
  body.alpha = alpha;
  body.visible = visible;
  return changed;
}

function updateSpacePortalViewport(sprite: NodeSprite, zoom: number): boolean {
  const view = (sprite as any)._spacePortalViewport as SpacePortalViewportState | undefined;
  if (!view || view.container.destroyed) return false;
  const profile = spacePortalZoomProfile(zoom);
  const scale = view.compactScale + (1 - view.compactScale) * profile.expansion;
  const x = view.compactX + (view.expandedX - view.compactX) * profile.expansion;
  const y = view.compactY + (view.expandedY - view.compactY) * profile.expansion;
  const alpha = profile.mapAlpha * view.focusAlpha;
  let changed = Math.abs(view.container.scale.x - scale) > 0.001
    || Math.abs(view.container.x - x) > 0.05
    || Math.abs(view.container.y - y) > 0.05
    || Math.abs(view.container.alpha - alpha) > 0.001;
  view.container.scale.set(scale);
  view.container.position.set(x, y);
  view.container.alpha = alpha;
  for (const label of view.labels) {
    changed ||= Math.abs(label.alpha - profile.labelAlpha) > 0.001;
    label.alpha = profile.labelAlpha;
    label.visible = profile.labelAlpha > 0.015;
  }
  changed ||= Math.abs(view.hint.alpha - profile.hintAlpha) > 0.001;
  view.hint.alpha = profile.hintAlpha;
  view.hint.visible = profile.hintAlpha > 0.015;
  return changed;
}

export function updateSemanticViewportDetails(sprite: NodeSprite, zoom: number): boolean {
  let changed = updateSemanticBodyViewport(sprite, zoom);
  changed = updateSpacePortalViewport(sprite, zoom) || changed;
  const profile = semanticZoomProfile(zoom);
  const title = (sprite as any)._semanticTitleViewport as SemanticTitleViewportState | undefined;
  if (title) {
    const alpha = title.baseAlpha * profile.titleAlpha;
    const visible = alpha > 0.015;
    changed ||= Math.abs(sprite.label.alpha - alpha) > 0.001 || sprite.label.visible !== visible;
    sprite.label.alpha = alpha;
    sprite.label.visible = visible;
  }
  const media = (sprite as any)._semanticMediaViewport as SemanticMediaViewportState | undefined;
  const mediaIcon = (sprite as any)._mediaIcon as Graphics | undefined;
  if (media && mediaIcon && !mediaIcon.destroyed) {
    const alpha = media.persistent ? 1 : media.nodeForm ? 0.58 + profile.mediaAlpha * 0.42 : profile.mediaAlpha;
    const visible = alpha > 0.015;
    changed ||= Math.abs(mediaIcon.alpha - alpha) > 0.001 || mediaIcon.visible !== visible;
    mediaIcon.alpha = alpha;
    mediaIcon.visible = visible;
  }
  return changed;
}

export function updateSemanticBodiesForViewport(sprites: Iterable<NodeSprite>, zoom: number): boolean {
  let changed = false;
  for (const sprite of sprites) changed = updateSemanticViewportDetails(sprite, zoom) || changed;
  return changed;
}

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
    ...WORLD_TEXT_SAMPLING,
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

  // Media identity is a compact badge attached to the card/node silhouette.
  // It remains visible while the reader is open, using the accent ring as its
  // state instead of making the symbol disappear.
  const oldIcon = (sprite as any)._mediaIcon as Graphics | undefined;
  if (oldIcon) { sprite.container.removeChild(oldIcon); oldIcon.destroy(); (sprite as any)._mediaIcon = null; }
  delete (sprite as any)._semanticMediaViewport;
  const oldPortal = (sprite as any)._spacePortalContainer as Container | undefined;
  if (oldPortal) {
    sprite.container.removeChild(oldPortal);
    oldPortal.destroy({ children: true });
    delete (sprite as any)._spacePortalContainer;
    delete (sprite as any)._spacePortalViewport;
  }
  const oldProjectionIcon = (sprite as any)._localContextProjectionIcon as Graphics | undefined;
  if (oldProjectionIcon) {
    sprite.container.removeChild(oldProjectionIcon);
    oldProjectionIcon.destroy();
    delete (sprite as any)._localContextProjectionIcon;
  }
  const drawProjectionBadge = (x: number, y: number, size: number, tint: number, focusAlpha = 1) => {
    if (!state.localContextProxy) return;
    const g = new Graphics();
    const s = Math.max(4.5, size);
    g.circle(0, 0, s)
      .fill({ color: tint, alpha: 0.18 * focusAlpha })
      .stroke({ color: tint, width: 1.1, alpha: 0.62 * focusAlpha });
    g.circle(-s * 0.2, 0, s * 0.34)
      .stroke({ color: 0xffffff, width: Math.max(0.9, s * 0.12), alpha: 0.8 * focusAlpha });
    g.circle(s * 0.2, 0, s * 0.34)
      .stroke({ color: 0xffffff, width: Math.max(0.9, s * 0.12), alpha: 0.8 * focusAlpha });
    g.position.set(x, y);
    (sprite as any)._localContextProjectionIcon = g;
    sprite.container.addChild(g);
  };
  const drawMediaBadge = (x: number, y: number, size: number, tint: number, focusAlpha = 1, nodeForm = false) => {
    const resourceKind = state.spaceReferenceKind || state.mediaType || state.resourceReferenceKind || state.vaultResourceKind;
    if (!resourceKind) return;
    const g = new Graphics();
    const s = Math.max(4.5, size);
    const active = !!state.mediaExpanded;
    const isReference = Boolean(state.resourceReferenceKind || state.spaceReferenceKind);
    const isBroken = state.resourceReferenceStatus === 'broken' || state.spaceReferenceStatus === 'broken';
    const badgeTint = isBroken ? 0xbf616a : tint;
    g.circle(0, 0, s)
      .fill({ color: badgeTint, alpha: (active ? 0.34 : isReference ? 0.22 : 0.16) * focusAlpha })
      .stroke({ color: active ? state.accentColor : badgeTint, width: active || isReference ? 1.6 : 1, alpha: (active ? 0.9 : isReference ? 0.7 : 0.48) * focusAlpha });
    const u = s * 0.46;
    const stroke = { color: 0xffffff, width: Math.max(1, s * 0.13), alpha: 0.82 * focusAlpha, cap: 'round' as const, join: 'round' as const };
    if (resourceKind === 'node') {
      g.circle(-u * 0.32, 0, u * 0.42).stroke(stroke);
      g.circle(u * 0.32, 0, u * 0.42).stroke(stroke);
    } else if (resourceKind === 'space' || resourceKind === 'fragment') {
      g.roundRect(-u * 0.82, -u * 0.64, u * 1.18, u * 1.02, u * 0.12).stroke(stroke);
      g.roundRect(-u * 0.34, -u * 0.28, u * 1.18, u * 1.02, u * 0.12).stroke(stroke);
    } else if (resourceKind === 'folder') {
      g.moveTo(-u * 0.72, -u * 0.42).lineTo(-u * 0.12, -u * 0.42).lineTo(u * 0.08, -u * 0.62)
        .lineTo(u * 0.7, -u * 0.62).lineTo(u * 0.7, u * 0.55).lineTo(-u * 0.72, u * 0.55).closePath().stroke(stroke);
    } else if (resourceKind === 'graph') {
      g.circle(-u * 0.52, u * 0.28, u * 0.2).fill({ color: 0xffffff, alpha: 0.82 * focusAlpha });
      g.circle(0, -u * 0.48, u * 0.2).fill({ color: 0xffffff, alpha: 0.82 * focusAlpha });
      g.circle(u * 0.52, u * 0.28, u * 0.2).fill({ color: 0xffffff, alpha: 0.82 * focusAlpha });
      g.moveTo(-u * 0.38, u * 0.14).lineTo(-u * 0.1, -u * 0.32).lineTo(u * 0.1, -u * 0.32).lineTo(u * 0.38, u * 0.14).stroke(stroke);
    } else if (resourceKind === 'image') {
      g.roundRect(-u, -u * 0.82, u * 2, u * 1.64, u * 0.2).stroke(stroke);
      g.circle(-u * 0.28, -u * 0.24, u * 0.2).fill({ color: 0xffffff, alpha: 0.78 * focusAlpha });
      g.moveTo(-u * 0.72, u * 0.5).lineTo(-u * 0.12, 0).lineTo(u * 0.2, u * 0.3).lineTo(u * 0.66, -u * 0.18).stroke(stroke);
    } else if (resourceKind === 'audio') {
      g.moveTo(-u * 0.58, u * 0.45).lineTo(-u * 0.58, -u * 0.34).lineTo(u * 0.45, -u * 0.58).lineTo(u * 0.45, u * 0.2).stroke(stroke);
      g.circle(-u * 0.72, u * 0.5, u * 0.25).fill({ color: 0xffffff, alpha: 0.82 * focusAlpha });
      g.circle(u * 0.3, u * 0.28, u * 0.25).fill({ color: 0xffffff, alpha: 0.82 * focusAlpha });
    } else if (resourceKind === 'video') {
      g.moveTo(-u * 0.35, -u * 0.58).lineTo(u * 0.62, 0).lineTo(-u * 0.35, u * 0.58).closePath().fill({ color: 0xffffff, alpha: 0.84 * focusAlpha });
    } else if (resourceKind === 'pdf') {
      g.moveTo(-u * 0.52, -u * 0.72).lineTo(u * 0.18, -u * 0.72).lineTo(u * 0.54, -u * 0.34).lineTo(u * 0.54, u * 0.72).lineTo(-u * 0.52, u * 0.72).closePath().stroke(stroke);
      g.moveTo(-u * 0.22, u * 0.28).lineTo(u * 0.28, u * 0.28).stroke(stroke);
    } else {
      g.moveTo(-u * 0.52, -u * 0.68).lineTo(u * 0.52, -u * 0.68).lineTo(u * 0.52, u * 0.68).lineTo(-u * 0.52, u * 0.68).closePath().stroke(stroke);
      g.moveTo(-u * 0.26, -u * 0.2).lineTo(u * 0.27, -u * 0.2).moveTo(-u * 0.26, u * 0.18).lineTo(u * 0.16, u * 0.18).stroke(stroke);
    }
    if (isReference) {
      g.circle(s * 0.7, -s * 0.7, Math.max(1.35, s * 0.22))
        .fill({ color: isBroken ? 0xbf616a : state.accentColor, alpha: 0.94 * focusAlpha })
        .stroke({ color: 0xffffff, width: Math.max(0.7, s * 0.08), alpha: 0.72 * focusAlpha });
    }
    if (isBroken) {
      g.moveTo(-s * 0.58, s * 0.58).lineTo(s * 0.58, -s * 0.58)
        .stroke({ color: 0xffffff, width: Math.max(1.1, s * 0.15), alpha: 0.9 * focusAlpha, cap: 'round' });
    }
    g.position.set(x, y);
    (sprite as any)._mediaIcon = g;
    sprite.container.addChild(g);
    if (state.semanticCard) {
      (sprite as any)._semanticMediaViewport = {
        persistent: active || isBroken || isReference,
        nodeForm,
      } satisfies SemanticMediaViewportState;
    }
  };

  circle.clear();

  if (state.semanticCard) {
    const card = state.semanticCard;
    const width = Math.max(80, card.width);
    const height = Math.max(48, card.height);
    const regionIndex = card.regionColorIndex ?? -1;
    const tint = regionIndex >= 0 ? SEMANTIC_PALETTE[regionIndex % SEMANTIC_PALETTE.length] : baseColor;
    const identityColor = state.groupColor && !state.groupEdgeOnly ? state.groupColor : baseColor;
    const focusAlpha = state.inFocus ? 1 : 0.18;
    const fillAlpha = card.kind === 'private' ? 0.055 : 0.075;
    const borderAlpha = state.selected ? 0.82 : state.boxSelected ? 0.68 : 0.32;
    const headerHeight = (card.titleLines || 1) > 1 ? 49 : 32;

    if (card.form === 'node') {
      const nodeRadius = Math.max(5, Number(card.nodeRadius) || r);
      const body = (sprite as any)._semanticBody as Text | undefined;
      if (body) body.visible = false;
      delete (sprite as any)._semanticBodyViewport;
      const drawGlow = (color: number, maxAlpha: number) => {
        for (let index = 5; index >= 0; index--) {
          const progress = (5 - index) / 5;
          circle.circle(0, 0, nodeRadius + index + 0.5)
            .fill({ color, alpha: maxAlpha * (1 - progress) * (1 - progress) });
        }
      };
      if (state.searchMatch) drawGlow(state.accentColor, 0.10 * focusAlpha);
      if (state.selected && !state.boxSelected) drawGlow(state.accentColor, 0.16 * focusAlpha);
      if (state.boxSelected) drawGlow(state.accentAltColor, 0.14 * focusAlpha);

      const nodeAlpha = focusAlpha * 0.85;
      const fixedT = (typeof (sprite as any)._fixedAnim === 'number' && !isNaN((sprite as any)._fixedAnim))
        ? (sprite as any)._fixedAnim : (state.fixed ? 1 : 0);
      if (!state.fixedHollow || fixedT < 1) {
        circle.circle(0, 0, nodeRadius)
          .fill({ color: identityColor, alpha: nodeAlpha * (state.fixedHollow ? (1 - fixedT) : 1) });
      }
      if (state.fixedHollow && fixedT > 0) {
        circle.circle(0, 0, nodeRadius)
          .fill({ color: identityColor, alpha: Math.max(0.15, nodeAlpha) * fixedT });
        circle.circle(0, 0, nodeRadius - Math.max(1.5, nodeRadius * 0.25)).cut();
        circle.circle(0, 0, Math.max(nodeRadius * 0.3, 1.5))
          .fill({ color: identityColor, alpha: Math.max(0.3, nodeAlpha) * fixedT });
      }
      if (state.groupEdgeOnly) {
        circle.circle(0, 0, nodeRadius)
          .stroke({ color: state.groupColor!, width: 2, alpha: focusAlpha });
      }
      if (state.selected && !state.boxSelected) {
        circle.circle(0, 0, nodeRadius + 1)
          .stroke({ color: state.accentColor, width: 2, alpha: focusAlpha });
      }
      if (state.boxSelected) {
        circle.circle(0, 0, nodeRadius + 1)
          .stroke({ color: state.accentAltColor, width: 2, alpha: focusAlpha });
      }
      if (state.searchMatch) {
        circle.circle(0, 0, nodeRadius)
          .stroke({ color: state.accentColor, width: 1.5, alpha: 0.35 * focusAlpha });
      }

      // A short regional arc is the only new mark. The node itself keeps the
      // same color, radius, fill and selection language as the legacy renderer.
      if (regionIndex >= 0) {
        circle.arc(0, 0, nodeRadius + 3, -Math.PI * 0.78, -Math.PI * 0.22)
          .stroke({ color: tint, width: 1.35, alpha: 0.46 * focusAlpha, cap: 'round' });
      }
      const markerX = nodeRadius * 0.62;
      const markerY = -nodeRadius * 0.62;
      if (card.kind === 'task') {
        circle.roundRect(markerX - 2.5, markerY - 2.5, 5, 5, 1)
          .stroke({ color: tint, width: 1, alpha: 0.72 * focusAlpha });
      } else if (card.kind === 'question') {
        circle.circle(markerX, markerY, 2.4)
          .stroke({ color: tint, width: 1, alpha: 0.7 * focusAlpha });
      } else if (card.kind === 'private') {
        circle.circle(markerX, markerY, 1.8)
          .fill({ color: tint, alpha: 0.66 * focusAlpha });
      }
      drawMediaBadge(-nodeRadius * 0.72, -nodeRadius * 0.72, Math.max(4.5, nodeRadius * 0.42), tint, focusAlpha, true);
      drawProjectionBadge(nodeRadius * 0.72, -nodeRadius * 0.72, Math.max(4.5, nodeRadius * 0.38), tint, focusAlpha);

      sprite.label.anchor.set(0.5, 0);
      sprite.label.position.set(0, nodeRadius + 3);
      const labelCharacters = Array.from(String(sprite.label.text || ''));
      if (labelCharacters.length > 9) sprite.label.text = `${labelCharacters.slice(0, 8).join('')}…`;
      sprite.label.style.fontSize = Math.max(11, Math.min(15, labelSize));
      sprite.label.style.fontWeight = 'normal';
      sprite.label.style.align = 'center';
      sprite.label.style.wordWrap = false;
      sprite.label.style.breakWords = false;
      sprite.label.style.fill = labelColor;
      (sprite as any)._semanticTitleViewport = {
        baseAlpha: focusAlpha * (state.semanticTransitionAlpha ?? 1),
      } satisfies SemanticTitleViewportState;
      (sprite as any)._semanticMode = true;
      updateSemanticViewportDetails(sprite, state.semanticZoom ?? 1);
      container.alpha = state.dying ? 0.25 : 1;
      return;
    }

    circle
      .roundRect(-width / 2, -height / 2, width, height, 9)
      .fill({ color: tint, alpha: fillAlpha * focusAlpha })
      .stroke({ color: state.selected ? state.accentColor : state.boxSelected ? state.accentAltColor : tint, width: state.selected || state.boxSelected ? 2 : 1, alpha: borderAlpha * focusAlpha });
    const isSpacePortal = state.spaceReferenceKind === 'space' || state.spaceReferenceKind === 'fragment';
    if (isSpacePortal) {
      circle
        .roundRect(-width / 2 + 5, -height / 2 + 5, width - 10, height - 10, 7)
        .stroke({ color: identityColor, width: 0.8, alpha: 0.18 * focusAlpha });
      circle
        .moveTo(width / 2 - 54, -height / 2)
        .lineTo(width / 2 - 18, -height / 2)
        .stroke({ color: identityColor, width: 2.2, alpha: 0.58 * focusAlpha, cap: 'round' });
    }
    circle
      .roundRect(-width / 2, -height / 2, 4, height, 2)
      .fill({ color: identityColor, alpha: 0.78 * focusAlpha });
    circle
      .moveTo(-width / 2 + 15, -height / 2 + headerHeight)
      .lineTo(width / 2 - 15, -height / 2 + headerHeight)
      .stroke({ color: tint, width: 1, alpha: 0.16 * focusAlpha });

    if (card.kind === 'task') {
      circle.rect(width / 2 - 25, -height / 2 + 12, 10, 10)
        .stroke({ color: identityColor, width: 1.2, alpha: 0.62 * focusAlpha });
    } else if (card.kind === 'question') {
      circle.circle(width / 2 - 20, -height / 2 + 17, 5)
        .stroke({ color: identityColor, width: 1.2, alpha: 0.58 * focusAlpha });
      circle.circle(width / 2 - 20, -height / 2 + 17, 1.2)
        .fill({ color: identityColor, alpha: 0.7 * focusAlpha });
    } else if (card.kind === 'private') {
      circle.circle(width / 2 - 20, -height / 2 + 17, 3)
        .fill({ color: identityColor, alpha: 0.5 * focusAlpha });
    }

    sprite.label.anchor.set(0, 0);
    sprite.label.position.set(-width / 2 + 15, -height / 2 + 9);
    sprite.label.style.fontSize = Math.max(12, Math.min(17, labelSize));
    sprite.label.style.fontWeight = '600';
    sprite.label.style.align = 'left';
    sprite.label.style.wordWrap = true;
    sprite.label.style.breakWords = true;
    sprite.label.style.lineHeight = 18;
    sprite.label.style.wordWrapWidth = width - 50;
    sprite.label.style.fill = labelColor;
    (sprite as any)._semanticTitleViewport = {
      baseAlpha: focusAlpha * (state.semanticTransitionAlpha ?? 1),
    } satisfies SemanticTitleViewportState;
    (sprite as any)._semanticMode = true;

    const isReferenceCard = Boolean(state.resourceReferenceKind || state.spaceReferenceKind);
    const semanticExcerpt = isReferenceCard
      ? String(state.spaceReferencePreview || state.resourceReferencePreview || card.excerpt
        || (state.resourceReferenceStatus === 'broken' || state.spaceReferenceStatus === 'broken' ? '引用目标暂时不可用' : '引用内容暂时没有摘要 · 双击阅读')).trim()
      : card.excerpt;
    let body = (sprite as any)._semanticBody as Text | undefined;
    if (semanticExcerpt) {
      if (!body || body.destroyed) {
        body = new Text({
          text: semanticExcerpt,
          resolution: TEXT_RESOLUTION,
          ...(isReferenceCard ? WORLD_TEXT_SAMPLING : {}),
          style: {
            fontFamily: readFontFamily(),
            fontSize: 11,
            lineHeight: 17,
            fill: labelColor,
            align: 'left',
            wordWrap: true,
            breakWords: true,
          } as any,
        });
        body.anchor.set(0, 0);
        (sprite as any)._semanticBody = body;
        container.addChild(body);
      }
      body.position.set(-width / 2 + 15, -height / 2 + headerHeight + 7);
      (sprite as any)._semanticBodyViewport = {
        excerpt: semanticExcerpt,
        width,
        height,
        headerHeight,
        focusAlpha,
        isReferencePreview: isReferenceCard,
        reservedRight: state.spaceReferenceKind !== 'node' && state.spaceReferenceMiniMap?.points.length ? 58 : 0,
        spacePortal: isSpacePortal,
      } satisfies SemanticBodyViewportState;
    } else if (body) {
      body.visible = false;
      delete (sprite as any)._semanticBodyViewport;
    }
    if (state.fixed) {
      circle.circle(-width / 2 + 12, height / 2 - 11, 2.2).fill({ color: tint, alpha: 0.7 * focusAlpha });
    }
    if (isSpacePortal && state.spaceReferenceMiniMap?.points.length) {
      const map = state.spaceReferenceMiniMap;
      const mapWidth = Math.max(72, width - 30);
      const mapHeight = Math.max(46, height - headerHeight - 16);
      const compactWidth = 46;
      const compactHeight = Math.min(32, Math.max(22, height - headerHeight - 18));
      const compactScale = Math.min(1, compactWidth / mapWidth, compactHeight / mapHeight);
      const portal = new Container({ label: `space-portal-${state.spaceReferenceKind}` });
      const portalGraphics = new Graphics();
      const points = new Map(map.points.map(point => [point.id, {
        x: 10 + point.x * (mapWidth - 20),
        y: 10 + point.y * (mapHeight - 25),
        label: point.label,
        level: point.level,
      }]));
      portalGraphics.roundRect(0, 0, mapWidth, mapHeight, 7)
        .fill({ color: tint, alpha: 0.07 })
        .stroke({ color: tint, width: 0.8, alpha: 0.38 });
      portalGraphics.roundRect(5, 5, mapWidth - 10, mapHeight - 10, 5)
        .stroke({ color: identityColor, width: 0.6, alpha: 0.16 });
      for (const edge of map.edges) {
        const source = points.get(edge.source);
        const target = points.get(edge.target);
        if (source && target) portalGraphics.moveTo(source.x, source.y).lineTo(target.x, target.y)
          .stroke({ color: tint, width: 0.85, alpha: 0.36, cap: 'round' });
      }
      for (const point of points.values()) {
        const level = Math.max(1, Math.min(6, Number(point.level) || 6));
        const radius = 1.7 + (6 - level) * 0.22;
        portalGraphics.circle(point.x, point.y, radius)
          .fill({ color: identityColor, alpha: 0.82 })
          .stroke({ color: tint, width: 0.55, alpha: 0.58 });
      }
      portal.addChild(portalGraphics);
      const labels = [...points.values()]
        .filter(point => String(point.label || '').trim())
        .sort((left, right) => (Number(left.level) || 6) - (Number(right.level) || 6))
        .slice(0, 7)
        .map(point => {
          const characters = Array.from(String(point.label || '').trim());
          const label = new Text({
            text: characters.length > 8 ? `${characters.slice(0, 7).join('')}…` : characters.join(''),
            resolution: TEXT_RESOLUTION,
            ...WORLD_TEXT_SAMPLING,
            style: {
              fontFamily: readFontFamily(),
              fontSize: 8,
              fill: labelColor,
              fontWeight: '500',
            } as any,
          });
          label.anchor.set(0.5, 0);
          label.position.set(point.x, Math.min(mapHeight - 18, point.y + 3.5));
          portal.addChild(label);
          return label;
        });
      const hint = new Text({
        text: state.spaceReferenceKind === 'fragment' ? '进入片段  ↗' : '进入空间  ↗',
        resolution: TEXT_RESOLUTION,
        ...WORLD_TEXT_SAMPLING,
        style: {
          fontFamily: readFontFamily(),
          fontSize: 8.5,
          fill: labelColor,
          fontWeight: '600',
          letterSpacing: 0.4,
        } as any,
      });
      hint.anchor.set(1, 1);
      hint.position.set(mapWidth - 9, mapHeight - 7);
      portal.addChild(hint);
      container.addChild(portal);
      (sprite as any)._spacePortalContainer = portal;
      (sprite as any)._spacePortalViewport = {
        container: portal,
        labels,
        hint,
        compactScale,
        compactX: width / 2 - 13 - mapWidth * compactScale,
        compactY: -height / 2 + headerHeight + 9,
        expandedX: -width / 2 + 15,
        expandedY: -height / 2 + headerHeight + 8,
        focusAlpha,
      } satisfies SpacePortalViewportState;
    }
    drawMediaBadge(width / 2 - 17, height / 2 - 15, 6.5, tint, focusAlpha);
    drawProjectionBadge(-width / 2 + 17, -height / 2 + 15, 6.2, tint, focusAlpha);
    updateSemanticViewportDetails(sprite, state.semanticZoom ?? 1);
    container.alpha = state.dying ? 0.25 : 1;
    return;
  }

  if ((sprite as any)._semanticMode) {
    (sprite as any)._semanticMode = false;
    sprite.label.anchor.set(0.5, 0);
    sprite.label.position.set(0, radius + 3);
    sprite.label.style.fontWeight = 'normal';
    sprite.label.style.align = 'center';
    sprite.label.style.wordWrap = false;
    sprite.label.style.breakWords = false;
    const body = (sprite as any)._semanticBody as Text | undefined;
    if (body) body.visible = false;
    delete (sprite as any)._semanticBodyViewport;
    delete (sprite as any)._semanticTitleViewport;
    delete (sprite as any)._semanticMediaViewport;
    container.alpha = 1;
  }

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
  if (state.structureMemberCount || (state.collapsed && state.hasChildren)) {
    const dots = new Text({
      text: state.structureMemberCount ? String(state.structureMemberCount) : '...',
      resolution: TEXT_RESOLUTION,
      ...WORLD_TEXT_SAMPLING,
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
  drawMediaBadge(r * 0.72, -r * 0.72, Math.max(4.5, r * 0.42), baseColor, alpha);
  drawProjectionBadge(-r * 0.72, -r * 0.72, Math.max(4.5, r * 0.38), baseColor, alpha);
}
