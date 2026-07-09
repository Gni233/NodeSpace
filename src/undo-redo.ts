import { GraphData } from './data/storage';
import { showToast } from './toast';

interface Snapshot {
  nodes: any[];
  edges: any[];
  groups: any[];
}

const MAX_STACK = 50;

/** Deep-clone helper. Uses structuredClone when available, falls back to JSON.
 *  Note: runtime-only properties (prefixed `_`) like `_dyingAt`, `_createdAt` are not preserved
 *  across undo/redo — nodes will lose their animation/transition state after undo. */
const clone = (arr: any[]): any[] => {
  if (typeof structuredClone === 'function') return structuredClone(arr);
  return JSON.parse(JSON.stringify(arr));
};

/** Undo/redo manager with fixed-size stack (50). Snapshots store nodes, edges, groups.
 *  In-place array mutation avoids replacing references that may be iterated by D3/RAF loops. */
export class UndoManager {
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];

  pushSnapshot(graph: GraphData): void {
    this.redoStack = [];
    this.undoStack.push({
      nodes: clone(graph.nodes),
      edges: clone(graph.edges),
      groups: clone(graph.groups),
    });
    if (this.undoStack.length > MAX_STACK) this.undoStack.shift();
  }

  undo(graph: GraphData): boolean {
    const snap = this.undoStack.pop();
    if (!snap) return false;
    this.redoStack.push({
      nodes: clone(graph.nodes),
      edges: clone(graph.edges),
      groups: clone(graph.groups),
    });
    graph.nodes.length = 0; graph.nodes.push(...snap.nodes);
    graph.edges.length = 0; graph.edges.push(...snap.edges);
    graph.groups.length = 0; graph.groups.push(...snap.groups);
    showToast('已撤销', 'info', 1500);
    return true;
  }

  redo(graph: GraphData): boolean {
    const snap = this.redoStack.pop();
    if (!snap) return false;
    this.undoStack.push({
      nodes: clone(graph.nodes),
      edges: clone(graph.edges),
      groups: clone(graph.groups),
    });
    graph.nodes.length = 0; graph.nodes.push(...snap.nodes);
    graph.edges.length = 0; graph.edges.push(...snap.edges);
    graph.groups.length = 0; graph.groups.push(...snap.groups);
    showToast('已重做', 'info', 1500);
    return true;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
