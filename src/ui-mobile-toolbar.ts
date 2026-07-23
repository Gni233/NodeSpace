import { Z_MOBILE_TOOLBAR, V } from './layout-constants';
import { isCapacitor } from './fs-mobile';
import { MobileToolbarGesture } from './mobile-toolbar-gesture';

const isTouchDevice = (): boolean => {
  if (isCapacitor()) return true;
  if (window.innerWidth < 700) return true;
  return matchMedia('(any-pointer: coarse)').matches;
};

export interface MobileToolbarSelectionState {
  /** True only when the selection is one ordinary (non-structure) node. */
  isSingleOrdinaryNode: boolean;
  /** Whether the selected node's heading may be promoted. */
  canRaiseHeading: boolean;
  /** Whether the selected node's heading may be demoted. */
  canLowerHeading: boolean;
}

export interface MobileToolbarCallbacks {
  createNode: () => void;
  /** Creates a child for the single selected ordinary node. */
  createChildNode?: () => void;
  /** Promotes the selected node's heading level. */
  raiseHeading?: () => void;
  /** Demotes the selected node's heading level. */
  lowerHeading?: () => void;
  /** Returns selection-dependent availability for creation and heading actions. */
  getSelectionState?: () => MobileToolbarSelectionState;
  undo: () => void;
  redo: () => void;
  fitView: () => void;
  toggleLinkMode: () => boolean;
  toggleBoxSelectMode: () => boolean;
  getLinkActive: () => boolean;
  getBoxSelectActive: () => boolean;
  getBoxSelectEnabled: () => boolean;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export interface MobileToolbarController {
  element: HTMLElement;
  sync(): void;
  destroy(): void;
}

export function createMobileToolbar(callbacks: MobileToolbarCallbacks): MobileToolbarController {
  const bar = document.createElement('div');
  bar.className = 'fg-mobile-toolbar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', '画布快捷操作');

  let barLeft: number | null = null;
  let barTop: number | null = null;
  const applyPos = () => {
    if (barLeft === null || barTop === null) return;
    bar.style.left = `${barLeft}px`;
    bar.style.top = `${barTop}px`;
    bar.style.bottom = 'auto';
    bar.style.transform = 'none';
  };

  bar.style.cssText = [
    'position:fixed; bottom:12px; left:50%; transform:translateX(-50%)',
    `z-index:${Z_MOBILE_TOOLBAR}`,
    'display:flex; gap:6px; padding:6px 10px',
    `background:${V('--fg-surface-glass', 'rgba(63,63,63,0.85)')}`,
    'backdrop-filter:blur(var(--fg-glass-blur, 14px))',
    '-webkit-backdrop-filter:blur(var(--fg-glass-blur, 14px))',
    `border:1px solid ${V('--fg-glass-border', 'rgba(255,255,255,0.08)')}`,
    `border-radius:${V('--fg-radius-lg', '14px')}`,
    `box-shadow:${V('--fg-shadow-md', '0 4px 16px rgba(0,0,0,0.4)')}`,
    'padding-bottom:calc(6px + env(safe-area-inset-bottom, 0px))',
    'touch-action:none',
    'transition:opacity 0.25s ease',
  ].join(';');

  const makeBtn = (text: string, label: string, onClick: () => void): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = text;
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.style.cssText = [
      'min-width:44px; height:44px; padding:4px 10px',
      'font-size:18px; line-height:1',
      `border:1px solid ${V('--fg-glass-border', 'rgba(255,255,255,0.08)')}`,
      `border-radius:${V('--fg-radius-md', '10px')}`,
      `background:${V('--fg-button-bg', 'rgba(255,255,255,0.06)')}`,
      `color:${V('--fg-text', '#fff')}`,
      'cursor:pointer',
      'transition:background 0.15s ease, color 0.15s ease, opacity 0.15s ease',
      'display:flex; align-items:center; justify-content:center',
    ].join(';');
    btn.onclick = onClick;
    return btn;
  };

  const setToggleState = (button: HTMLButtonElement, active: boolean) => {
    button.setAttribute('aria-pressed', String(active));
    button.style.background = active ? '#5B8FF9' : '';
    button.style.color = active ? '#fff' : '';
  };

  const runAndSync = (action: () => void) => {
    action();
    sync();
  };

  const createBtn = makeBtn('+', '新建节点', () => {
    const selection = callbacks.getSelectionState?.();
    if (selection?.isSingleOrdinaryNode && callbacks.createChildNode) {
      runAndSync(callbacks.createChildNode);
      return;
    }
    runAndSync(callbacks.createNode);
  });
  const undoBtn = makeBtn('↩', '撤销', () => runAndSync(callbacks.undo));
  const linkBtn = makeBtn('↔', '连线模式', () => runAndSync(callbacks.toggleLinkMode));
  linkBtn.setAttribute('aria-pressed', 'false');
  const fitBtn = makeBtn('◎', '适配全部节点', () => runAndSync(callbacks.fitView));
  const moreBtn = makeBtn('⋯', '更多操作', () => setMenuOpen(!menuOpen));
  moreBtn.setAttribute('aria-haspopup', 'menu');
  moreBtn.setAttribute('aria-expanded', 'false');

  const menu = document.createElement('div');
  menu.className = 'fg-mobile-toolbar-menu';
  menu.setAttribute('role', 'menu');
  menu.style.cssText = [
    'position:absolute; right:6px; bottom:calc(100% + 8px)',
    'display:none; min-width:132px; padding:6px; gap:4px; flex-direction:column',
    `background:${V('--fg-surface-glass', 'rgba(63,63,63,0.94)')}`,
    `border:1px solid ${V('--fg-glass-border', 'rgba(255,255,255,0.08)')}`,
    `border-radius:${V('--fg-radius-md', '10px')}`,
    `box-shadow:${V('--fg-shadow-md', '0 4px 16px rgba(0,0,0,0.4)')}`,
  ].join(';');

  const redoBtn = makeBtn('↪', '重做', () => {
    runAndSync(callbacks.redo);
    setMenuOpen(false);
  });
  redoBtn.setAttribute('role', 'menuitem');
  redoBtn.style.width = '100%';
  redoBtn.appendChild(document.createTextNode(' 重做'));

  const boxBtn = makeBtn('⬚', '框选模式', () => {
    runAndSync(callbacks.toggleBoxSelectMode);
    setMenuOpen(false);
  });
  boxBtn.setAttribute('role', 'menuitemcheckbox');
  boxBtn.setAttribute('aria-checked', 'false');
  boxBtn.style.width = '100%';
  boxBtn.appendChild(document.createTextNode(' 框选'));

  const raiseHeadingBtn = makeBtn('⇧', '提升层级', () => {
    if (callbacks.raiseHeading) runAndSync(callbacks.raiseHeading);
    setMenuOpen(false);
  });
  raiseHeadingBtn.setAttribute('role', 'menuitem');
  raiseHeadingBtn.style.width = '100%';
  raiseHeadingBtn.appendChild(document.createTextNode(' 提升层级'));

  const lowerHeadingBtn = makeBtn('⇩', '降低层级', () => {
    if (callbacks.lowerHeading) runAndSync(callbacks.lowerHeading);
    setMenuOpen(false);
  });
  lowerHeadingBtn.setAttribute('role', 'menuitem');
  lowerHeadingBtn.style.width = '100%';
  lowerHeadingBtn.appendChild(document.createTextNode(' 降低层级'));

  menu.append(redoBtn, boxBtn);
  menu.append(raiseHeadingBtn, lowerHeadingBtn);
  bar.append(createBtn, undoBtn, linkBtn, fitBtn, moreBtn, menu);

  let menuOpen = false;
  const setMenuOpen = (open: boolean) => {
    menuOpen = open;
    menu.style.display = open ? 'flex' : 'none';
    moreBtn.setAttribute('aria-expanded', String(open));
  };

  const syncDisabled = (button: HTMLButtonElement, disabled: boolean) => {
    button.disabled = disabled;
    button.style.opacity = disabled ? '0.45' : '';
  };

  const sync = () => {
    const selection = callbacks.getSelectionState?.() ?? {
      isSingleOrdinaryNode: false,
      canRaiseHeading: false,
      canLowerHeading: false,
    };
    const createsChild = selection.isSingleOrdinaryNode && !!callbacks.createChildNode;
    const createLabel = createsChild ? '新建子节点' : '新建节点';
    createBtn.title = createLabel;
    createBtn.setAttribute('aria-label', createLabel);

    setToggleState(linkBtn, callbacks.getLinkActive());
    const boxActive = callbacks.getBoxSelectActive();
    boxBtn.setAttribute('aria-checked', String(boxActive));
    boxBtn.style.background = boxActive ? '#5B8FF9' : '';
    boxBtn.style.color = boxActive ? '#fff' : '';
    boxBtn.disabled = !callbacks.getBoxSelectEnabled();
    boxBtn.style.opacity = boxBtn.disabled ? '0.45' : '';
    syncDisabled(raiseHeadingBtn, !callbacks.raiseHeading || !selection.canRaiseHeading);
    syncDisabled(lowerHeadingBtn, !callbacks.lowerHeading || !selection.canLowerHeading);
    syncDisabled(undoBtn, !callbacks.canUndo());
    syncDisabled(redoBtn, !callbacks.canRedo());
  };

  const viewportBounds = () => {
    const vv = window.visualViewport;
    return vv
      ? { left: vv.offsetLeft, top: vv.offsetTop, width: vv.width, height: vv.height }
      : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  };

  const clampPosition = () => {
    if (barLeft === null || barTop === null) return;
    const bounds = viewportBounds();
    const margin = 6;
    barLeft = Math.max(bounds.left + margin, Math.min(bounds.left + bounds.width - bar.offsetWidth - margin, barLeft));
    barTop = Math.max(bounds.top + margin, Math.min(bounds.top + bounds.height - bar.offsetHeight - margin, barTop));
    applyPos();
  };

  const updateViewport = () => {
    const visible = isTouchDevice();
    bar.style.display = visible ? 'flex' : 'none';
    if (!visible) {
      setMenuOpen(false);
      return;
    }
    clampPosition();
    sync();
  };

  const gesture = new MobileToolbarGesture();
  let dragOrigin: { left: number; top: number } | null = null;

  const onPointerDown = (e: PointerEvent) => {
    if ((e.target as Element).closest('.fg-mobile-toolbar-menu')) return;
    const rect = bar.getBoundingClientRect();
    barLeft = rect.left;
    barTop = rect.top;
    applyPos();
    dragOrigin = { left: barLeft, top: barTop };
    const fromButton = !!(e.target as Element).closest('button');
    gesture.begin(e.pointerId, e.clientX, e.clientY, fromButton);
    bar.setPointerCapture(e.pointerId);
    if (!fromButton) {
      bar.style.transition = 'none';
      e.preventDefault();
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    const move = gesture.move(e.pointerId, e.clientX, e.clientY);
    if (!move || !dragOrigin) return;
    if (move.started && !bar.hasPointerCapture(e.pointerId)) {
      bar.setPointerCapture(e.pointerId);
      bar.style.transition = 'none';
    }
    if (!move.dragging) return;
    barLeft = dragOrigin.left + move.dx;
    barTop = dragOrigin.top + move.dy;
    clampPosition();
    e.preventDefault();
  };

  const onPointerEnd = (e: PointerEvent) => {
    if (gesture.pointerId !== e.pointerId) return;
    gesture.end(e.pointerId);
    if (bar.hasPointerCapture(e.pointerId)) bar.releasePointerCapture(e.pointerId);
    dragOrigin = null;
    bar.style.transition = '';
  };

  const onPointerCancel = (e: PointerEvent) => {
    if (gesture.pointerId !== e.pointerId) return;
    gesture.cancel();
    if (bar.hasPointerCapture(e.pointerId)) bar.releasePointerCapture(e.pointerId);
    dragOrigin = null;
    bar.style.transition = '';
  };

  const onClickCapture = (e: MouseEvent) => {
    if (!gesture.consumeClickSuppression()) return;
    e.stopImmediatePropagation();
    e.preventDefault();
  };

  const onDocumentPointerDown = (e: PointerEvent) => {
    if (menuOpen && !bar.contains(e.target as Node)) setMenuOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && menuOpen) {
      setMenuOpen(false);
      moreBtn.focus();
    }
  };

  bar.addEventListener('pointerdown', onPointerDown);
  bar.addEventListener('pointermove', onPointerMove);
  bar.addEventListener('pointerup', onPointerEnd);
  bar.addEventListener('pointercancel', onPointerCancel);
  bar.addEventListener('click', onClickCapture, true);
  document.addEventListener('pointerdown', onDocumentPointerDown);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', updateViewport);
  window.addEventListener('orientationchange', updateViewport);
  window.visualViewport?.addEventListener('resize', updateViewport);
  window.visualViewport?.addEventListener('scroll', updateViewport);
  updateViewport();

  const destroy = () => {
    bar.removeEventListener('pointerdown', onPointerDown);
    bar.removeEventListener('pointermove', onPointerMove);
    bar.removeEventListener('pointerup', onPointerEnd);
    bar.removeEventListener('pointercancel', onPointerCancel);
    bar.removeEventListener('click', onClickCapture, true);
    document.removeEventListener('pointerdown', onDocumentPointerDown);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('resize', updateViewport);
    window.removeEventListener('orientationchange', updateViewport);
    window.visualViewport?.removeEventListener('resize', updateViewport);
    window.visualViewport?.removeEventListener('scroll', updateViewport);
    bar.remove();
  };

  return { element: bar, sync, destroy };
}
