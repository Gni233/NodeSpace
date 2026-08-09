export type CanvasGestureMode =
  | 'idle'
  | 'pending-node'
  | 'node-drag'
  | 'viewport-pan'
  | 'box-select'
  | 'long-press';

export interface CanvasGestureMove {
  mode: CanvasGestureMode;
  startedNodeDrag: boolean;
  moved: boolean;
}

export interface CanvasGestureEnd {
  mode: CanvasGestureMode;
  targetNodeId: string | null;
  tap: boolean;
  moved: boolean;
}

export interface NodeMembershipDragPosition {
  nodeId: string;
  x: number;
  y: number;
}

export interface NodeMembershipDragEnd extends NodeMembershipDragPosition {
  cancelled: boolean;
}

/**
 * Tracks the callback lifecycle for a single node-membership drag independently
 * from pointer cleanup. Its end operation is idempotent so pointer cancellation,
 * a second touch, and event disposal cannot report duplicate endings.
 */
export class NodeMembershipDragState {
  private active: NodeMembershipDragPosition | null = null;

  start(nodeId: string, x: number, y: number): NodeMembershipDragPosition | null {
    if (this.active) return null;
    this.active = { nodeId, x, y };
    return { ...this.active };
  }

  move(nodeId: string, x: number, y: number): NodeMembershipDragPosition | null {
    if (!this.active || this.active.nodeId !== nodeId) return null;
    this.active.x = x;
    this.active.y = y;
    return { ...this.active };
  }

  end(x: number, y: number, cancelled: boolean): NodeMembershipDragEnd | null {
    if (!this.active) return null;
    this.active.x = x;
    this.active.y = y;
    const result = { ...this.active, cancelled };
    this.active = null;
    return result;
  }

  cancel(): NodeMembershipDragEnd | null {
    if (!this.active) return null;
    return this.end(this.active.x, this.active.y, true);
  }

  get isActive(): boolean {
    return this.active !== null;
  }
}

export class CanvasGestureState {
  private active: {
    pointerId: number;
    startX: number;
    startY: number;
    threshold: number;
    targetNodeId: string | null;
  } | null = null;
  private currentMode: CanvasGestureMode = 'idle';
  private hasMoved = false;

  begin(
    pointerId: number,
    x: number,
    y: number,
    targetNodeId: string | null,
    boxSelect: boolean,
    threshold: number,
  ): void {
    this.active = { pointerId, startX: x, startY: y, threshold, targetNodeId };
    this.currentMode = boxSelect ? 'box-select' : targetNodeId ? 'pending-node' : 'viewport-pan';
    this.hasMoved = false;
  }

  move(pointerId: number, x: number, y: number): CanvasGestureMove | null {
    if (!this.active || this.active.pointerId !== pointerId) return null;
    const crossedThreshold = Math.hypot(x - this.active.startX, y - this.active.startY) >= this.active.threshold;
    const startedNodeDrag = this.currentMode === 'pending-node' && crossedThreshold;
    if (crossedThreshold) {
      this.hasMoved = true;
      if (startedNodeDrag) this.currentMode = 'node-drag';
    }
    return { mode: this.currentMode, startedNodeDrag, moved: this.hasMoved };
  }

  markLongPress(pointerId: number): boolean {
    if (!this.active || this.active.pointerId !== pointerId || this.hasMoved) return false;
    if (this.currentMode !== 'pending-node' && this.currentMode !== 'viewport-pan') return false;
    this.currentMode = 'long-press';
    return true;
  }

  end(pointerId: number): CanvasGestureEnd | null {
    if (!this.active || this.active.pointerId !== pointerId) return null;
    const result: CanvasGestureEnd = {
      mode: this.currentMode,
      targetNodeId: this.active.targetNodeId,
      tap: !this.hasMoved && (this.currentMode === 'pending-node' || this.currentMode === 'viewport-pan'),
      moved: this.hasMoved,
    };
    this.cancel();
    return result;
  }

  cancel(pointerId?: number): boolean {
    if (!this.active || (pointerId !== undefined && this.active.pointerId !== pointerId)) return false;
    this.active = null;
    this.currentMode = 'idle';
    this.hasMoved = false;
    return true;
  }

  get mode(): CanvasGestureMode {
    return this.currentMode;
  }

  get pointerId(): number | null {
    return this.active?.pointerId ?? null;
  }

  get targetNodeId(): string | null {
    return this.active?.targetNodeId ?? null;
  }
}
