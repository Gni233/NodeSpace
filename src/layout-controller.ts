export interface LayoutController {
  readonly mode: string;
  deactivate(): void;
  onGraphChanged?(): void;
  update?(): void;
  render?(accentColor: number): void;
  hiddenEdgeIndices?(edges: any[]): Set<number>;
  constrainNodePosition?(nodeId: string, x: number, y: number): [number, number];
  resize?(width: number, height: number): void;
}

export class LayoutSlot {
  private controller: LayoutController | null = null;

  get current(): LayoutController | null {
    return this.controller;
  }

  set(next: LayoutController | null): void {
    if (this.controller === next) return;
    const previous = this.controller;
    this.controller = next;
    previous?.deactivate();
  }

  clear(): void {
    this.set(null);
  }

  onGraphChanged(): void {
    this.controller?.onGraphChanged?.();
  }

  update(): void {
    this.controller?.update?.();
  }

  render(accentColor: number): void {
    this.controller?.render?.(accentColor);
  }

  hiddenEdgeIndices(edges: any[]): Set<number> {
    return this.controller?.hiddenEdgeIndices?.(edges) ?? new Set<number>();
  }

  constrainNodePosition(nodeId: string, x: number, y: number): [number, number] {
    return this.controller?.constrainNodePosition?.(nodeId, x, y) ?? [x, y];
  }

  resize(width: number, height: number): void {
    this.controller?.resize?.(width, height);
  }
}
