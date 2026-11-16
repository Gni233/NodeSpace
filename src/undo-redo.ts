import type { GraphData, GraphSettings } from './data/storage';
import { showToast } from './toast';

interface Snapshot {
  nodes: any[];
  edges: any[];
  groups: any[];
  semanticLayoutMemory?: GraphSettings['semanticLayoutMemory'];
}

const MAX_STACK = 50;

/** Capture content and its derived spatial memory without sharing mutable data. */
const clone = <T>(value: T): T => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const capture = (graph: GraphData): Snapshot => ({
  nodes: clone(graph.nodes),
  edges: clone(graph.edges),
  groups: clone(graph.groups),
  semanticLayoutMemory: graph.settings?.semanticLayoutMemory === undefined
    ? undefined : clone(graph.settings.semanticLayoutMemory),
});

const restore = (graph: GraphData, snapshot: Snapshot): void => {
  graph.nodes.length = 0; graph.nodes.push(...snapshot.nodes);
  graph.edges.length = 0; graph.edges.push(...snapshot.edges);
  graph.groups.length = 0; graph.groups.push(...snapshot.groups);
  // Theme, typography and other view preferences stay outside content history.
  if (snapshot.semanticLayoutMemory !== undefined) {
    graph.settings ||= {} as GraphSettings;
    graph.settings.semanticLayoutMemory = clone(snapshot.semanticLayoutMemory);
  } else if (graph.settings) delete graph.settings.semanticLayoutMemory;
};

/** Undo/redo manager with fixed-size stack (50). Includes automatic layout memory.
 *  In-place array mutation avoids replacing references that may be iterated by D3/RAF loops. */
export class UndoManager {
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];

  pushSnapshot(graph: GraphData): void {
    this.redoStack = [];
    this.undoStack.push(capture(graph));
    if (this.undoStack.length > MAX_STACK) this.undoStack.shift();
  }

  undo(graph: GraphData): boolean {
    const snap = this.undoStack.pop();
    if (!snap) return false;
    this.redoStack.push(capture(graph));
    restore(graph, snap);
    showToast('已撤销', 'info', 1500);
    return true;
  }

  redo(graph: GraphData): boolean {
    const snap = this.redoStack.pop();
    if (!snap) return false;
    this.undoStack.push(capture(graph));
    restore(graph, snap);
    showToast('已重做', 'info', 1500);
    return true;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
