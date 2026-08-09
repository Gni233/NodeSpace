export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface StructureBoundaryShape {
  /** A counter-clockwise, convex approximation of the structure outline. */
  readonly polygon: readonly Point[];
  readonly bounds: Bounds;
  readonly headerAnchor: Point;
  readonly headerRect: Bounds;
  readonly center: Point;
}

export interface StructureBoundaryMember {
  readonly x: number;
  readonly y: number;
  readonly radius?: number;
  readonly visualRadius?: number;
}

export interface StructureBoundaryOptions {
  readonly padding?: number;
  readonly headerHeight?: number;
}

export interface StructureBoundaryHitTestOptions {
  /** Maximum distance from an outline segment to count as an outline hit. */
  readonly outlineTolerance?: number;
}

const DEFAULT_PADDING = 16;
const DEFAULT_HEADER_HEIGHT = 28;
const CIRCLE_SEGMENTS = 16;
const EPSILON = 1e-9;

const finite = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const radiusOf = (member: StructureBoundaryMember): number =>
  Math.max(0, finite(member.visualRadius, finite(member.radius)));

function comparePoints(a: Point, b: Point): number {
  return a.x - b.x || a.y - b.y;
}

function cross(origin: Point, a: Point, b: Point): number {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
}

/** Monotone-chain hull with deterministic point ordering and duplicate removal. */
function convexHull(points: readonly Point[]): Point[] {
  const sorted = points
    .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
    .slice()
    .sort(comparePoints)
    .filter((point, index, items) => index === 0 || point.x !== items[index - 1].x || point.y !== items[index - 1].y);
  if (sorted.length <= 1) return sorted;

  const lower: Point[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= EPSILON) lower.pop();
    lower.push(point);
  }
  const upper: Point[] = [];
  for (let index = sorted.length - 1; index >= 0; index--) {
    const point = sorted[index];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= EPSILON) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function circlePoints(center: Point, radius: number): Point[] {
  const safeRadius = Math.max(radius, 0.5);
  return Array.from({ length: CIRCLE_SEGMENTS }, (_, index) => {
    const angle = (Math.PI * 2 * index) / CIRCLE_SEGMENTS;
    return { x: center.x + Math.cos(angle) * safeRadius, y: center.y + Math.sin(angle) * safeRadius };
  });
}

function boundsOf(points: readonly Point[]): Bounds {
  return {
    minX: Math.min(...points.map(point => point.x)),
    minY: Math.min(...points.map(point => point.y)),
    maxX: Math.max(...points.map(point => point.x)),
    maxY: Math.max(...points.map(point => point.y)),
  };
}

function pointInPolygon(x: number, y: number, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index];
    const b = polygon[previous];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function distanceToSegment(x: number, y: number, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= EPSILON) return Math.hypot(x - a.x, y - a.y);
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lengthSquared));
  return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
}

function containsBounds(x: number, y: number, bounds: Bounds): boolean {
  return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
}

/**
 * Creates a stable, padded convex outline around visual member discs. The sampled
 * discs make one member round and two/collinear members capsule-like without
 * special-case line math; a header band is included at the boundary's top.
 */
export function computeStructureBoundary(
  members: readonly StructureBoundaryMember[],
  options: StructureBoundaryOptions = {},
): StructureBoundaryShape | null {
  const padding = Math.max(0, finite(options.padding, DEFAULT_PADDING));
  const headerHeight = Math.max(0, finite(options.headerHeight, DEFAULT_HEADER_HEIGHT));
  const validMembers = members.filter(member => Number.isFinite(member?.x) && Number.isFinite(member?.y));
  if (validMembers.length === 0) return null;

  const bodyPoints = validMembers.flatMap(member => circlePoints(member, radiusOf(member) + padding));
  const bodyBounds = boundsOf(bodyPoints);
  const headerWidth = Math.max(1, bodyBounds.maxX - bodyBounds.minX);
  const headerRect: Bounds = {
    minX: bodyBounds.minX,
    maxX: bodyBounds.minX + headerWidth,
    minY: bodyBounds.minY,
    maxY: bodyBounds.minY + headerHeight,
  };
  const headerAnchor: Point = {
    x: (headerRect.minX + headerRect.maxX) / 2,
    y: (headerRect.minY + headerRect.maxY) / 2,
  };
  const polygon = convexHull(headerHeight > 0
    ? bodyPoints.concat([
      { x: headerRect.minX, y: headerRect.minY },
      { x: headerRect.maxX, y: headerRect.minY },
      { x: headerRect.maxX, y: headerRect.maxY },
      { x: headerRect.minX, y: headerRect.maxY },
    ])
    : bodyPoints);
  if (polygon.length < 3) return null;

  const bounds = boundsOf(polygon);
  return Object.freeze({
    polygon: Object.freeze(polygon.map(point => Object.freeze({ ...point }))),
    bounds: Object.freeze(bounds),
    headerAnchor: Object.freeze(headerAnchor),
    headerRect: Object.freeze(headerRect),
    center: Object.freeze({ x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }),
  });
}

/** True when a point is inside (or on) the boundary, for future drag-into behavior. */
export function containsPoint(x: number, y: number, shape: StructureBoundaryShape): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !containsBounds(x, y, shape.bounds)) return false;
  if (pointInPolygon(x, y, shape.polygon)) return true;
  return shape.polygon.some((point, index) =>
    distanceToSegment(x, y, point, shape.polygon[(index + 1) % shape.polygon.length]) <= EPSILON,
  );
}

/**
 * Prioritizes the header over the outline. Interior points deliberately do not
 * hit the boundary, so member-node interactions remain available.
 */
export function hitTestStructureBoundary(
  x: number,
  y: number,
  shape: StructureBoundaryShape,
  options: StructureBoundaryHitTestOptions = {},
): 'header' | 'outline' | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (shape.headerRect.maxY > shape.headerRect.minY && containsBounds(x, y, shape.headerRect)) return 'header';
  const tolerance = Math.max(0, finite(options.outlineTolerance));
  if (tolerance === 0) return null;
  for (let index = 0; index < shape.polygon.length; index++) {
    if (distanceToSegment(x, y, shape.polygon[index], shape.polygon[(index + 1) % shape.polygon.length]) <= tolerance) return 'outline';
  }
  return null;
}
