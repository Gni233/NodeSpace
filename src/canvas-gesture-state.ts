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
