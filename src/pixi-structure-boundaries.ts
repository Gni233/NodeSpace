import { Container, Graphics, Text } from 'pixi.js';
import type { StructureBoundaryShape } from './geometry/structure-boundary';
import type { MembershipDragPreview } from './pane-state';

export type StructureBoundaryPoint = Readonly<{ x: number; y: number }> | readonly [number, number];

/**
 * Structural shape input accepted by the renderer. `StructureBoundaryShape` from
 * geometry/structure-boundary is intentionally structurally compatible with this
 * interface, so callers can pass it without a conversion allocation.
 */
export interface StructureBoundaryShapeLike {
  vertices?: readonly StructureBoundaryPoint[];
  points?: readonly StructureBoundaryPoint[];
  polygon?: readonly StructureBoundaryPoint[];
  bounds?: Readonly<{ x: number; y: number; width: number; height: number }>;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  labelPosition?: Readonly<{ x: number; y: number }>;
}

export interface StructureBoundaryMemberPosition {
  id?: string;
  x: number;
  y: number;
}

export interface StructureBoundaryRenderModel {
  id: string;
  label: string;
  shape: StructureBoundaryShape | StructureBoundaryShapeLike | readonly StructureBoundaryPoint[];
  memberCount: number;
  /** Number of edges from this structure to nodes outside the structure. */
  externalLinkCount: number;
  summary?: string | null;
  /** Model color overrides the pane accent for this boundary. */
  color?: string | number;
  selected?: boolean;
  hovered?: boolean;
  /** Per-model override for membership drag feedback. */
  membershipDragPreview?: MembershipDragPreview | null;
  /** Used only when `drawMembershipLines` is enabled. */
  memberPositions?: readonly StructureBoundaryMemberPosition[];
}

export interface StructureBoundaryTheme {
  accent: string | number;
  labelColor: string | number;
  isDark: boolean;
  /** Current viewport scale. Geometry remains in world coordinates. */
  zoom: number;
}

export interface StructureBoundaryRenderOptions {
  theme: StructureBoundaryTheme;
  /** Pane-local membership feedback applied to its source and target boundaries. */
  membershipDragPreview?: MembershipDragPreview | null;
  /** Draw light links from each member to the boundary title while selected/hovered. Defaults to false. */
  drawMembershipLines?: boolean;
  /** Optional custom title anchor. Otherwise the top-left of the boundary is used. */
  getTitlePosition?: (model: StructureBoundaryRenderModel, bounds: StructureBoundaryBounds) => Readonly<{ x: number; y: number }>;
}

export interface StructureBoundaryBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type StructureBoundaryVisualMode = 'default' | 'add-target' | 'remove-source' | 'reject-target';

export interface StructureBoundaryVisualState {
  mode: StructureBoundaryVisualMode;
  /** Undefined keeps the model or theme accent. */
  accent?: string | number;
  emphasized: boolean;
  titleSuffix?: string;
}

export const MEMBERSHIP_DRAG_BOUNDARY_COLORS = {
  add: 0x22c55e,
  remove: 0xf59e0b,
  reject: 0xef4444,
} as const;

/**
 * Resolve drag feedback without touching graph data or Pixi objects. The target
 * wins for add/reject feedback; a removal highlights its source boundary.
 */
export function resolveBoundaryVisualState(
  model: Pick<StructureBoundaryRenderModel, 'id'>,
  preview?: MembershipDragPreview | null,
): StructureBoundaryVisualState {
  if (!preview || preview.mode === 'none') return { mode: 'default', emphasized: false };
  if (preview.mode === 'add' && preview.targetStructureId === model.id) {
    return { mode: 'add-target', accent: MEMBERSHIP_DRAG_BOUNDARY_COLORS.add, emphasized: true, titleSuffix: '松手加入' };
  }
  if (preview.mode === 'remove' && preview.sourceStructureId === model.id) {
    return { mode: 'remove-source', accent: MEMBERSHIP_DRAG_BOUNDARY_COLORS.remove, emphasized: true, titleSuffix: '松手移出' };
  }
  if (preview.mode === 'reject' && preview.targetStructureId === model.id) {
    return { mode: 'reject-target', accent: MEMBERSHIP_DRAG_BOUNDARY_COLORS.reject, emphasized: true, titleSuffix: '不可加入' };
  }
  return { mode: 'default', emphasized: false };
}

/**
 * During a removal preview, preserve the source's exclusion snapshot for drawing.
 * Hit testing remains based on the live shape upstream; only the source model and
 * its optional membership guide lines omit the dragged member here.
 */
export function resolveMembershipDragBoundaryModel(
  model: StructureBoundaryRenderModel,
  preview?: MembershipDragPreview | null,
): StructureBoundaryRenderModel {
  if (
    preview?.mode !== 'remove'
    || preview.sourceStructureId !== model.id
    || !preview.sourceBoundaryShape
  ) return model;

  return {
    ...model,
    shape: preview.sourceBoundaryShape,
    memberPositions: model.memberPositions?.filter(member => member.id !== preview.nodeId),
  };
}

export interface StructureBoundaryCacheChanges {
  retainedIds: string[];
  createdIds: string[];
  staleIds: string[];
}

export interface StructureBoundaryRenderState {
  /** Dedicated child of the supplied structure layer; never shares the groups layer. */
  container: Container;
  boundaryGraphics: Graphics;
  membershipGraphics: Graphics;
  labels: Map<string, Text>;
  clear(): void;
  destroy(): void;
}

const STATE_KEY = '__structureBoundaryRenderState';
const FONT_FAMILY = 'system-ui, -apple-system, sans-serif';

function toPoint(point: StructureBoundaryPoint): { x: number; y: number } {
  if ('x' in point) return { x: point.x, y: point.y };
  return { x: point[0], y: point[1] };
}

function isPointList(shape: StructureBoundaryRenderModel['shape']): shape is readonly StructureBoundaryPoint[] {
  return Array.isArray(shape);
}

function isComputedShape(shape: StructureBoundaryRenderModel['shape']): shape is StructureBoundaryShape {
  return !isPointList(shape) && 'headerAnchor' in shape && 'headerRect' in shape;
}

/** Return the boundary vertices without mutating or copying an already-normalized shape. */
export function getStructureBoundaryVertices(shape: StructureBoundaryRenderModel['shape']): readonly StructureBoundaryPoint[] {
  if (isPointList(shape)) return shape;
  if (isComputedShape(shape)) return shape.polygon;
  return shape.vertices ?? shape.points ?? shape.polygon ?? rectangleVertices(shape);
}

function rectangleVertices(shape: StructureBoundaryShapeLike): readonly StructureBoundaryPoint[] {
  const bounds = shape.bounds ?? (Number.isFinite(shape.x) && Number.isFinite(shape.y) && Number.isFinite(shape.width) && Number.isFinite(shape.height)
    ? { x: shape.x!, y: shape.y!, width: shape.width!, height: shape.height! }
    : null);
  if (!bounds) return [];
  const { x, y, width, height } = bounds;
  return [[x, y], [x + width, y], [x + width, y + height], [x, y + height]];
}

export function getStructureBoundaryBounds(vertices: readonly StructureBoundaryPoint[]): StructureBoundaryBounds | null {
  if (vertices.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const rawPoint of vertices) {
    const point = toPoint(rawPoint);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

/** Keep title summaries compact and stable across refreshes. */
export function truncateStructureBoundarySummary(summary: string, maxLength: number = 30): string {
  const compact = summary.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

/** Pure cache reconciliation helper, independently testable without a Pixi renderer. */
export function getStructureBoundaryCacheChanges(
  cachedIds: Iterable<string>,
  models: readonly Pick<StructureBoundaryRenderModel, 'id'>[],
): StructureBoundaryCacheChanges {
  const previous = new Set(cachedIds);
  const retainedIds: string[] = [];
  const createdIds: string[] = [];
  for (const model of models) {
    if (previous.delete(model.id)) retainedIds.push(model.id);
    else createdIds.push(model.id);
  }
  return { retainedIds, createdIds, staleIds: [...previous] };
}

function ensureState(layer: Container): StructureBoundaryRenderState {
  const existing = (layer as Container & { [STATE_KEY]?: StructureBoundaryRenderState })[STATE_KEY];
  if (existing && !existing.container.destroyed) return existing;

  const container = new Container({ label: 'structure-boundaries' });
  const membershipGraphics = new Graphics();
  const boundaryGraphics = new Graphics();
  container.addChild(membershipGraphics, boundaryGraphics);
  layer.addChild(container);

  const labels = new Map<string, Text>();
  const state: StructureBoundaryRenderState = {
    container,
    boundaryGraphics,
    membershipGraphics,
    labels,
    clear() {
      boundaryGraphics.clear();
      membershipGraphics.clear();
      for (const label of labels.values()) label.visible = false;
    },
    destroy() {
      labels.clear();
      if (!container.destroyed) container.destroy({ children: true });
      const owner = layer as Container & { [STATE_KEY]?: StructureBoundaryRenderState };
      if (owner[STATE_KEY] === state) delete owner[STATE_KEY];
    },
  };
  (layer as Container & { [STATE_KEY]?: StructureBoundaryRenderState })[STATE_KEY] = state;
  return state;
}

function worldScale(zoom: number): number {
  return 1 / Math.max(0.25, Math.min(4, Number.isFinite(zoom) ? zoom : 1));
}

function boundaryTitle(model: StructureBoundaryRenderModel, titleSuffix?: string): string {
  const baseTitle = `${model.label} · ${model.memberCount} members · ${model.externalLinkCount} external`;
  const firstLine = titleSuffix ? `${baseTitle} · ${titleSuffix}` : baseTitle;
  const summary = model.summary ? truncateStructureBoundarySummary(model.summary) : '';
  return summary ? `${firstLine}\n${summary}` : firstLine;
}

function drawPolygon(graphics: Graphics, vertices: readonly StructureBoundaryPoint[]): void {
  const first = toPoint(vertices[0]);
  graphics.moveTo(first.x, first.y);
  for (let index = 1; index < vertices.length; index++) {
    const point = toPoint(vertices[index]);
    graphics.lineTo(point.x, point.y);
  }
  graphics.closePath();
}

function labelPosition(
  model: StructureBoundaryRenderModel,
  bounds: StructureBoundaryBounds,
  options: StructureBoundaryRenderOptions,
  padding: number,
): Readonly<{ x: number; y: number }> {
  if (options.getTitlePosition) return options.getTitlePosition(model, bounds);
  if (isComputedShape(model.shape)) return { x: model.shape.headerRect.minX + padding, y: model.shape.headerRect.minY + padding };
  if (!isPointList(model.shape) && model.shape.labelPosition) return model.shape.labelPosition;
  return { x: bounds.minX + padding, y: bounds.minY + padding };
}

/**
 * Render structure outlines into an independent Pixi layer.
 *
 * Membership lines are deliberately opt-in (`drawMembershipLines`). Main edge
 * rendering can therefore omit membership edges, or keep its existing policy,
 * without this renderer drawing duplicate lines.
 */
export function updateStructureBoundaries(
  layer: Container,
  modelsWithShape: readonly StructureBoundaryRenderModel[],
  options: StructureBoundaryRenderOptions,
): StructureBoundaryRenderState {
  const state = ensureState(layer);
  const { boundaryGraphics, membershipGraphics, labels } = state;
  const scale = worldScale(options.theme.zoom);
  const baseFillAlpha = options.theme.isDark ? 0.10 : 0.075;
  const baseStrokeAlpha = options.theme.isDark ? 0.50 : 0.38;
  const activeIds = new Set<string>();

  boundaryGraphics.clear();
  membershipGraphics.clear();
  for (const model of modelsWithShape) {
    const vertices = getStructureBoundaryVertices(model.shape);
    const bounds = getStructureBoundaryBounds(vertices);
    if (!bounds || vertices.length < 3) continue;
    activeIds.add(model.id);

    const visualState = resolveBoundaryVisualState(
      model,
      model.membershipDragPreview ?? options.membershipDragPreview,
    );
    const emphasized = Boolean(model.selected || model.hovered || visualState.emphasized);
    const accent = visualState.accent ?? model.color ?? options.theme.accent;
    const fillAlpha = baseFillAlpha + (emphasized ? 0.11 : 0);
    const strokeAlpha = baseStrokeAlpha + (emphasized ? 0.30 : 0);
    const strokeWidth = (emphasized ? 2.4 : 1.25) * scale;
    drawPolygon(boundaryGraphics, vertices);
    boundaryGraphics
      .fill({ color: accent, alpha: fillAlpha })
      .stroke({ color: accent, width: strokeWidth, alpha: strokeAlpha });

    const padding = 5 * scale;
    const titleAt = labelPosition(model, bounds, options, padding);
    let label = labels.get(model.id);
    if (!label || label.destroyed) {
      label = new Text({ text: '', style: { fontFamily: FONT_FAMILY } });
      label.anchor.set(0, 0);
      labels.set(model.id, label);
      state.container.addChild(label);
    }
    label.text = boundaryTitle(model, visualState.titleSuffix);
    label.style.fontFamily = FONT_FAMILY;
    label.style.fontSize = Math.max(9, 12 * scale);
    label.style.fill = options.theme.labelColor;
    label.style.lineHeight = Math.max(11, 15 * scale);
    label.position.set(titleAt.x, titleAt.y);
    label.alpha = emphasized ? 1 : 0.88;
    label.visible = true;

    const titleWidth = label.width + padding * 2;
    const titleHeight = label.height + padding * 2;
    boundaryGraphics
      .roundRect(titleAt.x - padding, titleAt.y - padding, titleWidth, titleHeight, 4 * scale)
      .fill({ color: options.theme.isDark ? 0x121820 : 0xffffff, alpha: emphasized ? 0.86 : 0.72 })
      .stroke({ color: accent, width: Math.max(0.75, scale), alpha: emphasized ? 0.55 : 0.28 });

    if (options.drawMembershipLines && emphasized && model.memberPositions?.length) {
      const targetX = titleAt.x + titleWidth / 2;
      const targetY = titleAt.y + titleHeight / 2;
      for (const member of model.memberPositions) {
        membershipGraphics
          .moveTo(member.x, member.y)
          .lineTo(targetX, targetY)
          .stroke({ color: accent, width: Math.max(0.75, scale), alpha: model.selected ? 0.32 : 0.20 });
      }
    }
  }

  const changes = getStructureBoundaryCacheChanges(labels.keys(), modelsWithShape.filter(model => activeIds.has(model.id)));
  for (const id of changes.staleIds) {
    const label = labels.get(id);
    label?.destroy();
    labels.delete(id);
  }
  return state;
}

/** Clear current drawing while retaining cached Pixi objects for the next update. */
export function clearStructureBoundaries(layer: Container): void {
  const state = (layer as Container & { [STATE_KEY]?: StructureBoundaryRenderState })[STATE_KEY];
  state?.clear();
}

/** Destroy all structure-boundary resources associated with this layer. */
export function destroyStructureBoundaries(layer: Container): void {
  const state = (layer as Container & { [STATE_KEY]?: StructureBoundaryRenderState })[STATE_KEY];
  state?.destroy();
}
