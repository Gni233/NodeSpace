import type { GraphData } from './data/storage';

export class GraphRuntime {
  fileName: string;
  graph: GraphData;
  simManager: any = null;
  undoManager: any;
  saveTimeout: ReturnType<typeof setTimeout> | null = null;
  dirty = false;
  externalConflict = false;
  fileOperationActive = false;
  private textEditorOwner: object | null = null;
  private owners = new Set<object>();
  private saveChain: Promise<void> = Promise.resolve();
  private revision = 0;
  private operationGeneration = 0;

  constructor(
    fileName: string,
    graph: GraphData = { nodes: [], edges: [], groups: [] },
    undoManager: any = null,
  ) {
    this.fileName = fileName;
    this.graph = graph;
    this.undoManager = undoManager;
  }

  attach(owner: object): void {
    this.owners.add(owner);
  }

  detach(owner: object): void {
    this.owners.delete(owner);
  }

  get ownerCount(): number {
    return this.owners.size;
  }

  beginTextEdit(owner: object): boolean {
    if (this.textEditorOwner && this.textEditorOwner !== owner) return false;
    this.textEditorOwner = owner;
    this.cancelPendingSave();
    this.simManager?.getSim?.()?.stop?.();
    return true;
  }

  endTextEdit(owner: object): void {
    if (this.textEditorOwner === owner) this.textEditorOwner = null;
  }

  get textEditActive(): boolean {
    return this.textEditorOwner !== null;
  }

  isTextEditorOwner(owner: object): boolean {
    return this.textEditorOwner === owner;
  }

  canInteract(owner: object): boolean {
    return !this.textEditorOwner || this.textEditorOwner === owner;
  }

  markDirty(): number {
    this.dirty = true;
    return ++this.revision;
  }

  markSaved(revision = this.revision): boolean {
    if (revision !== this.revision) return false;
    this.dirty = false;
    return true;
  }

  cancelPendingSave(): void {
    if (this.saveTimeout != null) clearTimeout(this.saveTimeout);
    this.saveTimeout = null;
  }

  enqueueSave(
    snapshot: string,
    write: (snapshot: string) => Promise<boolean>,
  ): Promise<{ saved: boolean; current: boolean; revision: number }> {
    const revision = this.revision;
    const generation = this.operationGeneration;
    let saved = false;
    const run = this.saveChain.then(async () => {
      if (generation !== this.operationGeneration) return;
      saved = await write(snapshot);
    });
    this.saveChain = run.then(() => undefined, () => undefined);
    return run.then(() => ({
      saved,
      current: revision === this.revision && generation === this.operationGeneration,
      revision,
    }));
  }

  markExternalConflict(): void {
    this.cancelPendingSave();
    this.externalConflict = true;
  }

  clearExternalConflict(): void {
    this.externalConflict = false;
  }

  async invalidateSaves(): Promise<void> {
    this.cancelPendingSave();
    this.operationGeneration++;
    await this.saveChain;
  }

  dispose(): void {
    this.cancelPendingSave();
    this.externalConflict = false;
    this.textEditorOwner = null;
    this.simManager?.getSim?.()?.stop?.();
    this.simManager = null;
    this.owners.clear();
  }
}

export class GraphRuntimeRegistry {
  private runtimes = new Map<string, GraphRuntime>();

  acquire(fileName: string, owner: object, create?: () => GraphRuntime): GraphRuntime {
    let runtime = this.runtimes.get(fileName);
    if (!runtime) {
      if (!create) throw new Error(`Runtime not found: ${fileName}`);
      runtime = create();
      if (runtime.fileName !== fileName) throw new Error('Runtime file name mismatch');
      this.runtimes.set(fileName, runtime);
    }
    runtime.attach(owner);
    return runtime;
  }

  get(fileName: string): GraphRuntime | null {
    return this.runtimes.get(fileName) ?? null;
  }

  values(): GraphRuntime[] {
    return [...this.runtimes.values()];
  }

  release(runtime: GraphRuntime, owner: object): void {
    runtime.detach(owner);
    if (runtime.ownerCount === 0 && runtime.dirty) runtime.simManager?.getSim?.()?.stop?.();
    this.prune(runtime);
  }

  rename(oldFileName: string, newFileName: string): GraphRuntime | null {
    if (oldFileName === newFileName) return this.get(oldFileName);
    const runtime = this.runtimes.get(oldFileName);
    if (!runtime) return null;
    if (this.runtimes.has(newFileName)) throw new Error(`Runtime already exists: ${newFileName}`);
    this.runtimes.delete(oldFileName);
    runtime.fileName = newFileName;
    this.runtimes.set(newFileName, runtime);
    return runtime;
  }

  prune(runtime: GraphRuntime): void {
    if (runtime.ownerCount > 0 || runtime.dirty) return;
    if (this.runtimes.get(runtime.fileName) === runtime) this.runtimes.delete(runtime.fileName);
    runtime.dispose();
  }

  delete(fileName: string): void {
    const runtime = this.runtimes.get(fileName);
    if (!runtime) return;
    this.runtimes.delete(fileName);
    runtime.dispose();
  }

  clear(): void {
    for (const runtime of this.runtimes.values()) runtime.dispose();
    this.runtimes.clear();
  }
}
