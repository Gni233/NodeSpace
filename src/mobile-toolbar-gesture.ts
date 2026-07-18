export interface ToolbarGestureMove {
  started: boolean;
  dragging: boolean;
  dx: number;
  dy: number;
}

export class MobileToolbarGesture {
  private active: { pointerId: number; x: number; y: number; fromButton: boolean } | null = null;
  private dragging = false;
  private suppressNextClick = false;

  constructor(private readonly threshold = 5) {}

  begin(pointerId: number, x: number, y: number, fromButton: boolean): void {
    this.active = { pointerId, x, y, fromButton };
    this.dragging = false;
    this.suppressNextClick = false;
  }

  move(pointerId: number, x: number, y: number): ToolbarGestureMove | null {
    if (!this.active || this.active.pointerId !== pointerId) return null;
    const dx = x - this.active.x;
    const dy = y - this.active.y;
    const started = !this.dragging && Math.hypot(dx, dy) >= this.threshold;
    if (started) {
      this.dragging = true;
      this.suppressNextClick = this.active.fromButton;
    }
    return { started, dragging: this.dragging, dx, dy };
  }

  end(pointerId: number): boolean {
    if (!this.active || this.active.pointerId !== pointerId) return false;
    const wasDragging = this.dragging;
    this.active = null;
    this.dragging = false;
    return wasDragging;
  }

  cancel(): void {
    this.active = null;
    this.dragging = false;
    this.suppressNextClick = false;
  }

  consumeClickSuppression(): boolean {
    if (!this.suppressNextClick) return false;
    this.suppressNextClick = false;
    return true;
  }

  get pointerId(): number | null {
    return this.active?.pointerId ?? null;
  }
}
