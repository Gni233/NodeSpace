import { compileTextGraph } from './compiler';
import { parseTextGraph } from './parser';
import { printTextGraph } from './printer';
import type { GraphDataLike, TextDiagnostic } from './types';

export interface TextViewEditorCallbacks {
  /** Read the graph only when text mode is entered or an edit is compiled. */
  getGraph: () => GraphDataLike;
  getGraphName: () => string | undefined;
  pauseSimulation: () => void;
  resumeSimulation: () => void;
  /** Atomically record undo and replace graph data in the host runtime. File renaming is not part of text mode. */
  applyGraph: (graph: GraphDataLike, graphName: string) => void | Promise<void>;
  markDirty: () => void;
  draw: () => void;
  toast?: (message: string, type?: 'info' | 'error' | 'success' | 'warning') => void;
}

export interface TextViewEditorOptions {
  debounceMs?: number;
}

export interface TextViewEditorControllerState {
  active: boolean;
  source: string;
  diagnostics: TextDiagnostic[];
}

export interface TextViewEditorControllerEvents {
  onStateChange?: (state: TextViewEditorControllerState) => void;
  onExitError?: (diagnostics: TextDiagnostic[]) => void;
}

export class TextViewEditorController {
  private active = false;
  private source = '';
  private diagnostics: TextDiagnostic[] = [];
  private validationTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly debounceMs: number;

  constructor(
    private readonly callbacks: TextViewEditorCallbacks,
    private readonly events: TextViewEditorControllerEvents = {},
    options: TextViewEditorOptions = {},
  ) {
    this.debounceMs = options.debounceMs ?? 250;
  }

  isActive(): boolean {
    return this.active;
  }

  getSource(): string {
    return this.source;
  }

  getDiagnostics(): readonly TextDiagnostic[] {
    return this.diagnostics;
  }

  enter(): void {
    if (this.active) return;
    this.source = printTextGraph(this.callbacks.getGraph(), { graphName: this.callbacks.getGraphName() });
    this.diagnostics = [];
    this.active = true;
    this.callbacks.pauseSimulation();
    this.emit();
  }

  setSource(source: string): void {
    this.source = source;
    this.scheduleValidation();
    this.emit();
  }

  validateNow(): TextDiagnostic[] {
    this.clearValidationTimer();
    this.diagnostics = parseTextGraph(this.source).diagnostics;
    this.emit();
    return this.diagnostics;
  }

  async requestExit(): Promise<boolean> {
    if (!this.active) return true;
    this.clearValidationTimer();
    const compiled = compileTextGraph(this.source, this.callbacks.getGraph());
    this.diagnostics = compiled.diagnostics;
    if (!compiled.ok || !compiled.graph || !compiled.graphName) {
      this.emit();
      this.events.onExitError?.(this.diagnostics);
      this.callbacks.toast?.('文字内容存在错误，请先修正后再返回图形。', 'error');
      return false;
    }
    const currentName = this.callbacks.getGraphName()?.trim();
    if (currentName && compiled.graphName.trim() !== currentName) {
      this.diagnostics = [this.unsupportedGraphNameDiagnostic()];
      this.emit();
      this.events.onExitError?.(this.diagnostics);
      this.callbacks.toast?.('不支持在文字视图改图名，请恢复首行后再返回图形。', 'error');
      return false;
    }

    try {
      await this.callbacks.applyGraph(compiled.graph, compiled.graphName);
      this.callbacks.markDirty();
      this.active = false;
      this.callbacks.resumeSimulation();
      this.callbacks.draw();
      this.callbacks.toast?.('已应用文字编辑。', 'success');
      this.emit();
      return true;
    } catch (error) {
      this.callbacks.toast?.(`无法应用文字编辑：${error instanceof Error ? error.message : String(error)}`, 'error');
      return false;
    }
  }

  dispose(): void {
    this.clearValidationTimer();
  }

  private unsupportedGraphNameDiagnostic(): TextDiagnostic {
    const firstLineLength = this.source.split('\n', 1)[0]?.length ?? 0;
    return {
      code: 'UNSUPPORTED_GRAPH_NAME',
      message: '不支持在文字视图改图名，请恢复首行后再返回图形。',
      severity: 'error',
      range: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: Math.max(2, firstLineLength + 1) },
      },
    };
  }

  private scheduleValidation(): void {
    this.clearValidationTimer();
    this.validationTimer = setTimeout(() => {
      this.validationTimer = null;
      if (!this.active) return;
      this.diagnostics = parseTextGraph(this.source).diagnostics;
      this.emit();
    }, this.debounceMs);
  }

  private clearValidationTimer(): void {
    if (this.validationTimer !== null) clearTimeout(this.validationTimer);
    this.validationTimer = null;
  }

  private emit(): void {
    this.events.onStateChange?.({
      active: this.active,
      source: this.source,
      diagnostics: this.diagnostics,
    });
  }
}

export interface TextViewEditor {
  isActive: () => boolean;
  enter: () => void;
  requestExit: () => Promise<boolean>;
  preserveDraft: () => void;
  dispose: () => void;
}

function diagnosticOffset(source: string, diagnostic: TextDiagnostic): number {
  const lines = source.split('\n');
  const lineIndex = Math.max(0, Math.min(lines.length - 1, diagnostic.range.start.line - 1));
  const precedingLength = lines.slice(0, lineIndex).reduce((length, line) => length + line.length + 1, 0);
  return precedingLength + Math.max(0, Math.min(lines[lineIndex].length, diagnostic.range.start.column - 1));
}

function diagnosticEndOffset(source: string, diagnostic: TextDiagnostic, start: number): number {
  const lines = source.split('\n');
  const lineIndex = Math.max(0, Math.min(lines.length - 1, diagnostic.range.end.line - 1));
  const precedingLength = lines.slice(0, lineIndex).reduce((length, line) => length + line.length + 1, 0);
  return Math.max(start + 1, precedingLength + Math.max(0, Math.min(lines[lineIndex].length, diagnostic.range.end.column - 1)));
}

function button(label: string, style: string): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.setAttribute('style', style);
  return element;
}

/**
 * Mount an exclusive text editor over a pane. The host retains graph ownership;
 * this module only reads through and writes through the supplied callbacks.
 */
export function createTextViewEditor(
  root: HTMLElement,
  callbacks: TextViewEditorCallbacks,
  options: TextViewEditorOptions = {},
): TextViewEditor {
  const overlay = document.createElement('section');
  overlay.className = 'fg-text-view-editor';
  overlay.setAttribute('aria-label', '文字图编辑器');
  overlay.setAttribute('style', [
    'position:absolute', 'inset:0', 'z-index:1000', 'display:none', 'flex-direction:column',
    'min-width:0', 'min-height:0', 'box-sizing:border-box', 'padding:clamp(8px,2vw,18px)',
    'gap:8px', 'background:var(--fg-surface,#202228)', 'color:var(--fg-text,#e6e6e6)',
    'font-family:var(--fg-font-family,system-ui,sans-serif)',
  ].join(';'));

  const toolbar = document.createElement('div');
  toolbar.setAttribute('style', 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:0 0 auto;');
  const title = document.createElement('strong');
  title.textContent = '文字模式';
  title.setAttribute('style', 'margin-right:auto;font-size:1rem;');
  const exitButton = button('返回图形', 'min-height:36px;padding:6px 12px;border:0;border-radius:8px;background:var(--fg-accent,#5B8FF9);color:#fff;font:inherit;touch-action:manipulation;');
  toolbar.append(title, exitButton);

  const textarea = document.createElement('textarea');
  textarea.spellcheck = false;
  textarea.setAttribute('aria-label', '图的文字表示');
  textarea.setAttribute('wrap', 'off');
  textarea.setAttribute('style', [
    'display:block', 'width:100%', 'min-width:0', 'min-height:180px', 'flex:1 1 auto', 'resize:none',
    'box-sizing:border-box', 'padding:12px', 'border:1px solid var(--fg-glass-border,rgba(255,255,255,.18))',
    'border-radius:8px', 'background:rgba(0,0,0,.18)', 'color:inherit',
    'font:14px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace', 'outline:none',
  ].join(';'));

  const diagnostics = document.createElement('div');
  diagnostics.setAttribute('aria-live', 'polite');
  diagnostics.setAttribute('style', 'flex:0 1 28%;max-height:28%;overflow:auto;display:flex;flex-direction:column;gap:4px;font-size:.9rem;');
  overlay.append(toolbar, textarea, diagnostics);
  root.appendChild(overlay);

  const hiddenChildren = new Map<HTMLElement, { visibility: string; pointerEvents: string }>();
  const rootPosition = root.style.position;
  const draftKey = () => `fg-text-view-emergency-draft:${callbacks.getGraphName() ?? 'unnamed'}`;
  const readEmergencyDraft = () => {
    try { return sessionStorage.getItem(draftKey()); } catch { return null; }
  };
  const clearEmergencyDraft = () => {
    try { sessionStorage.removeItem(draftKey()); } catch {}
  };
  let rootPositionChanged = false;
  let disposed = false;

  const renderDiagnostics = (items: readonly TextDiagnostic[]) => {
    diagnostics.replaceChildren();
    if (items.length === 0) return;
    for (const item of items) {
      const itemButton = button(
        `${item.severity === 'error' ? '错误' : '提示'} · 第 ${item.range.start.line} 行，第 ${item.range.start.column} 列：${item.message}`,
        `display:block;width:100%;min-height:32px;padding:6px 8px;text-align:left;border:1px solid ${item.severity === 'error' ? 'rgba(240,96,96,.55)' : 'rgba(224,176,64,.5)'};border-radius:6px;background:transparent;color:inherit;font:inherit;touch-action:manipulation;`,
      );
      itemButton.addEventListener('click', () => focusDiagnostic(item));
      diagnostics.appendChild(itemButton);
    }
  };

  const focusDiagnostic = (item: TextDiagnostic | undefined) => {
    if (!item) return;
    const start = diagnosticOffset(textarea.value, item);
    textarea.focus();
    textarea.setSelectionRange(start, diagnosticEndOffset(textarea.value, item, start));
  };

  const controller = new TextViewEditorController(callbacks, {
    onStateChange: state => {
      textarea.value = state.source;
      renderDiagnostics(state.diagnostics);
    },
    onExitError: items => focusDiagnostic(items.find(item => item.severity === 'error') ?? items[0]),
  }, options);

  const showOverlay = () => {
    if (!root.style.position) {
      root.style.position = 'relative';
      rootPositionChanged = true;
    }
    for (const child of Array.from(root.children)) {
      if (child === overlay) continue;
      const element = child as HTMLElement;
      hiddenChildren.set(element, { visibility: element.style.visibility, pointerEvents: element.style.pointerEvents });
      element.style.visibility = 'hidden';
      element.style.pointerEvents = 'none';
    }
    overlay.style.display = 'flex';
    requestAnimationFrame(() => textarea.focus());
  };

  const hideOverlay = () => {
    overlay.style.display = 'none';
    for (const [element, styles] of hiddenChildren) {
      element.style.visibility = styles.visibility;
      element.style.pointerEvents = styles.pointerEvents;
    }
    hiddenChildren.clear();
    if (rootPositionChanged) root.style.position = rootPosition;
    rootPositionChanged = false;
  };

  const enter = () => {
    if (disposed || controller.isActive()) return;
    controller.enter();
    const emergencyDraft = readEmergencyDraft();
    if (emergencyDraft !== null && emergencyDraft !== controller.getSource()) {
      controller.setSource(emergencyDraft);
      callbacks.toast?.('已恢复上次未应用的文字草稿。', 'warning');
    }
    showOverlay();
  };

  const requestExit = async () => {
    if (disposed) return false;
    const exited = await controller.requestExit();
    if (exited) {
      clearEmergencyDraft();
      hideOverlay();
    }
    return exited;
  };

  textarea.addEventListener('input', () => controller.setSource(textarea.value));
  textarea.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      void requestExit();
    }
  });
  exitButton.addEventListener('click', () => { void requestExit(); });

  return {
    isActive: () => controller.isActive(),
    enter,
    requestExit,
    preserveDraft: () => {
      if (!controller.isActive()) return;
      try { sessionStorage.setItem(draftKey(), controller.getSource()); } catch {}
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      const wasActive = controller.isActive();
      controller.dispose();
      hideOverlay();
      overlay.remove();
      if (wasActive) callbacks.resumeSimulation();
    },
  };
}
