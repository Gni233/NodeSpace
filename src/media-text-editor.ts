import type { GraphData } from './data/storage';

export interface MediaTextEditorContext {
  getGraph: () => GraphData;
  node: any;
  field: 'note' | 'mediaUrl';
  canMutate: () => boolean;
  saveUndo: (graph: GraphData) => void;
  onChange: () => void;
}

/** A reading editor belongs to its exact source, independent of the focused pane. */
export function createMediaTextEditor(ctx: MediaTextEditorContext) {
  const graph = ctx.getGraph(), node = ctx.node, mediaType = node.mediaType;
  let active = false, undoSaved = false, expected = '';
  const current = () => String(node[ctx.field] ?? '');
  const valid = () => ctx.canMutate() && ctx.getGraph() === graph && graph.nodes.includes(node)
    && graph.settings?.sourceMode !== 'vault-readonly' && (ctx.field !== 'mediaUrl' || node.mediaType === mediaType);
  return {
    begin(): string | null {
      active = valid(); undoSaved = false; expected = current();
      return active ? expected : null;
    },
    update(value: string): boolean {
      if (!active || !valid() || current() !== expected) { active = false; return false; }
      if (value === expected) return true;
      if (!undoSaved) { ctx.saveUndo(graph); undoSaved = true; }
      node[ctx.field] = value; expected = value;
      ctx.onChange();
      return true;
    },
    end() { active = false; },
  };
}

/** Preserve IME composition, plain-text whitespace, and flush the last edit on blur. */
export function bindMediaTextInput(input: HTMLTextAreaElement, update: (value: string) => boolean) {
  let composing = false;
  const commit = () => {
    if (composing || input.readOnly) return;
    if (!update(input.value)) {
      input.readOnly = true;
      input.setAttribute('aria-label', '来源已变化，请重新打开文档');
    }
  };
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; commit(); });
  input.addEventListener('input', commit);
  input.addEventListener('blur', () => { composing = false; commit(); });
}
