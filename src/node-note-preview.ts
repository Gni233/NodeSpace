import { Z_TOOLTIP } from './layout-constants';
import { bindNodeTextInput } from './ui-edit';

export interface NodeNoteEdit {
  note: string;
  commit(note: string): void;
}

export function createNodeNotePreview(host: HTMLElement) {
  const element = document.createElement('aside');
  element.className = 'fg-node-note-preview';
  element.style.zIndex = String(Z_TOOLTIP);
  element.hidden = true;
  const title = document.createElement('div');
  title.className = 'fg-node-note-title';
  const excerpt = document.createElement('button');
  excerpt.type = 'button';
  excerpt.className = 'fg-node-note-excerpt';
  const input = document.createElement('textarea');
  input.className = 'fg-node-note-input';
  input.setAttribute('aria-label', '节点内容');
  input.hidden = true;
  const done = document.createElement('button');
  done.type = 'button';
  done.className = 'fg-node-note-done';
  done.textContent = '完成';
  done.hidden = true;
  done.addEventListener('pointerdown', event => event.preventDefault());
  done.onclick = () => input.blur();
  element.append(title, excerpt, input, done);
  host.append(element);

  let startEdit: (() => NodeNoteEdit | null) | undefined;
  let editing: NodeNoteEdit | null = null;
  let initialValue = '';
  let draft = '';
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let pointerInPreview = false;
  const keep = () => { clearTimeout(hideTimer); hideTimer = undefined; };
  const hide = () => {
    keep();
    if (editing) return;
    element.hidden = true;
    pointerInPreview = false;
  };
  const hideSoon = () => {
    if (!pointerInPreview && !editing && !element.hidden && hideTimer === undefined) hideTimer = setTimeout(hide, 200);
  };
  element.addEventListener('pointerenter', () => { pointerInPreview = true; keep(); });
  element.addEventListener('pointerleave', () => { pointerInPreview = false; hideSoon(); });

  function edit() {
    if (editing) return true;
    const session = startEdit?.();
    if (!session || element.hidden) return false;
    keep();
    editing = session;
    input.value = session.note;
    initialValue = draft = input.value;
    input.style.height = `${Math.max(44, excerpt.offsetHeight)}px`;
    input.hidden = false;
    done.hidden = false;
    excerpt.hidden = true;
    element.classList.add('is-editing');
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
    return true;
  }

  function finish(save: boolean) {
    const session = editing;
    if (!session) return;
    editing = null;
    input.hidden = true;
    done.hidden = true;
    excerpt.hidden = false;
    element.classList.remove('is-editing');
    hide();
    if (save && draft !== initialValue) session.commit(draft);
  }

  excerpt.onclick = edit;
  bindNodeTextInput(input, 'note', {
    begin: () => {},
    update: (_field, value) => { draft = value; return true; },
    end: () => finish(true),
  });
  input.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    event.stopPropagation();
    finish(false);
  });
  let label = '';
  let content = '';
  let width = 0;
  let height = 0;
  let maxWidth = 0;
  let maxHeight = 0;
  const inset = 8;

  function show(noteTitle: string, note: string, x: number, y: number, halfWidth: number, pane: DOMRectReadOnly, openEditor?: () => NodeNoteEdit | null) {
    if (editing) return true;
    keep();
    startEdit = openEditor;
    excerpt.disabled = !startEdit;
    element.classList.toggle('is-editable', !!startEdit);
    const hostBounds = host.getBoundingClientRect();
    const left = Math.max(pane.left, hostBounds.left) + inset;
    const right = Math.min(pane.right, hostBounds.right) - inset;
    const top = Math.max(pane.top, hostBounds.top) + inset;
    const bottom = Math.min(pane.bottom, hostBounds.bottom) - inset;
    if (right - left < 120 || bottom - top < 80 || x + halfWidth < left || x - halfWidth > right || y < top - inset || y > bottom + inset) {
      hide();
      return false;
    }

    const availableWidth = right - left;
    const availableHeight = bottom - top;
    if (noteTitle !== label || note !== content || availableWidth !== maxWidth || availableHeight !== maxHeight || element.hidden) {
      label = noteTitle;
      content = note;
      maxWidth = availableWidth;
      maxHeight = availableHeight;
      title.textContent = noteTitle;
      title.hidden = !noteTitle;
      const trimmed = note.trim();
      excerpt.textContent = trimmed.length > 640 ? `${trimmed.slice(0, 640)}…` : trimmed || '写下内容';
      element.style.maxWidth = `${maxWidth}px`;
      element.style.maxHeight = `${maxHeight}px`;
      element.hidden = false;
      width = element.offsetWidth;
      height = element.offsetHeight;
    }

    const after = x + halfWidth + 12;
    const before = x - halfWidth - 12 - width;
    const spaceAfter = right - after;
    const spaceBefore = before + width - left;
    const start = spaceAfter >= width || spaceAfter >= spaceBefore ? after : before;
    const px = Math.max(left, Math.min(start, right - width)) - hostBounds.left;
    const py = Math.max(top, Math.min(y - height / 3, bottom - height)) - hostBounds.top;
    element.style.left = `${Math.round(px)}px`;
    element.style.top = `${Math.round(py)}px`;
    return true;
  }

  return { show, edit, keep, hide, hideSoon, destroy: () => { keep(); editing = null; element.remove(); } };
}
