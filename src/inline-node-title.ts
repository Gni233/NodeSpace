import { Z_TOOLTIP } from './layout-constants';

export interface InlineNodeTitleAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontWeight?: string;
  color?: string;
  startAligned: boolean;
  canvas: DOMRectReadOnly;
}

interface InlineNodeTitleSession {
  label: string;
  selectContents: boolean;
  fontFamily: string;
  anchor(): InlineNodeTitleAnchor | null;
  commit(label: string): void;
  restoreTitle(): void;
}

export function createInlineNodeTitleEditor(host: HTMLElement) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'fg-inline-node-title';
  input.setAttribute('aria-label', '节点名称');
  input.autocomplete = 'off';
  input.style.zIndex = String(Z_TOOLTIP + 1);
  input.hidden = true;
  host.append(input);

  let session: InlineNodeTitleSession | null = null;
  let frame = 0;
  let composing = false;
  let initialValue = '';

  function finish(commit: boolean) {
    const ended = session;
    if (!ended) return;
    session = null;
    cancelAnimationFrame(frame);
    composing = false;
    const label = input.value.trim();
    input.hidden = true;
    ended.restoreTitle();
    if (commit && label && input.value !== initialValue) ended.commit(label);
  }

  function position(anchor: InlineNodeTitleAnchor) {
    const hostRect = host.getBoundingClientRect();
    const viewport = window.visualViewport;
    const inset = 6;
    const left = Math.max(hostRect.left, anchor.canvas.left, viewport?.offsetLeft ?? 0) + inset;
    const right = Math.min(hostRect.right, anchor.canvas.right, (viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth)) - inset;
    const top = Math.max(hostRect.top, anchor.canvas.top, viewport?.offsetTop ?? 0) + inset;
    const bottom = Math.min(hostRect.bottom, anchor.canvas.bottom, (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight)) - inset;
    if (right - left < 72 || bottom - top < 28) return false;
    const height = Math.min(bottom - top, Math.max(anchor.height, anchor.fontSize * 1.12));
    const width = Math.min(520, right - left, Math.max(64, anchor.width + 8, input.value.length * anchor.fontSize + 8));
    const start = anchor.startAligned ? anchor.x : anchor.x + (anchor.width - width) / 2;
    input.style.width = `${Math.round(width)}px`;
    input.style.height = `${Math.round(height)}px`;
    input.style.left = `${Math.round(Math.max(left, Math.min(start, right - width)) - hostRect.left)}px`;
    input.style.top = `${Math.round(Math.max(top, Math.min(anchor.y + (anchor.height - height) / 2, bottom - height)) - hostRect.top)}px`;
    input.style.textAlign = anchor.startAligned ? 'left' : 'center';
    input.style.fontSize = `${anchor.fontSize}px`;
    input.style.fontWeight = anchor.fontWeight ?? 'normal';
    input.style.color = anchor.color ?? '';
    input.style.lineHeight = `${height}px`;
    return true;
  }

  function followTitle() {
    const anchor = session?.anchor();
    if (!anchor || !position(anchor)) {
      finish(false);
      return;
    }
    frame = requestAnimationFrame(followTitle);
  }

  function begin(next: InlineNodeTitleSession) {
    finish(true);
    const anchor = next.anchor();
    if (!anchor) return false;
    input.value = next.label;
    initialValue = input.value;
    input.style.fontFamily = next.fontFamily;
    if (!position(anchor)) {
      next.restoreTitle();
      return false;
    }
    session = next;
    input.hidden = false;
    input.focus({ preventScroll: true });
    if (next.selectContents) input.select();
    else input.setSelectionRange(input.value.length, input.value.length);
    frame = requestAnimationFrame(followTitle);
    return true;
  }

  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; });
  input.addEventListener('blur', () => finish(true));
  input.addEventListener('keydown', (event) => {
    if (event.isComposing || composing || event.keyCode === 229) return;
    if (event.key !== 'Enter' && event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    finish(event.key === 'Enter');
  });

  return { begin, isActive: () => session !== null };
}
