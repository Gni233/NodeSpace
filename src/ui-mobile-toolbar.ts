/**
 * 移动端浮动工具栏 — 触摸设备/小屏幕上提供常用操作按钮
 * 显示条件：原生 Android / 触摸屏 / 小窗口 (<700px)
 */
import { Z_MOBILE_TOOLBAR, V } from './layout-constants';
import { isCapacitor } from './fs-mobile';

const isTouchDevice = (): boolean => {
  if (isCapacitor()) return true;
  if (window.innerWidth < 700) return true;
  return matchMedia('(any-pointer: coarse)').matches;
};

export interface MobileToolbarCallbacks {
  undo: () => void;
  redo: () => void;
  toggleLinkMode: () => boolean;
  toggleBoxSelectMode: () => boolean;
  getLinkActive?: () => boolean;
  getBoxSelectActive?: () => boolean;
}

export function createMobileToolbar(callbacks: MobileToolbarCallbacks): HTMLElement {

  const bar = document.createElement('div');
  bar.className = 'fg-mobile-toolbar';
  // 使用 left/top 定位支持拖拽，初始用 CSS 居中
  let barLeft: number | null = null;
  let barTop: number | null = null;
  const applyPos = () => {
    if (barLeft !== null && barTop !== null) {
      bar.style.left = `${barLeft}px`;
      bar.style.top = `${barTop}px`;
      bar.style.bottom = 'auto';
      bar.style.transform = 'none';
    }
  };
  bar.style.cssText = [
    `position:fixed; bottom:12px; left:50%; transform:translateX(-50%)`,
    `z-index:${Z_MOBILE_TOOLBAR}`,
    `display:flex; gap:6px; padding:6px 10px`,
    `background:${V('--fg-surface-glass', 'rgba(63,63,63,0.85)')}`,
    `backdrop-filter:blur(var(--fg-glass-blur, 14px))`,
    `-webkit-backdrop-filter:blur(var(--fg-glass-blur, 14px))`,
    `border:1px solid ${V('--fg-glass-border', 'rgba(255,255,255,0.08)')}`,
    `border-radius:${V('--fg-radius-lg', '14px')}`,
    `box-shadow:${V('--fg-shadow-md', '0 4px 16px rgba(0,0,0,0.4)')}`,
    `padding-bottom:calc(6px + env(safe-area-inset-bottom, 0px))`,
    `touch-action:manipulation`,
    `transition:opacity 0.25s ease`,
  ].join(';');

  const makeBtn = (text: string, title: string, onClick: () => void): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.title = title;
    btn.style.cssText = [
      `min-width:40px; height:40px; padding:4px 10px`,
      `font-size:18px; line-height:1`,
      `border:1px solid ${V('--fg-glass-border', 'rgba(255,255,255,0.08)')}`,
      `border-radius:${V('--fg-radius-md', '10px')}`,
      `background:${V('--fg-button-bg', 'rgba(255,255,255,0.06)')}`,
      `color:${V('--fg-text', '#fff')}`,
      `cursor:pointer`,
      `transition:background 0.15s ease, color 0.15s ease`,
      `display:flex; align-items:center; justify-content:center`,
    ].join(';');
    btn.onclick = onClick;
    return btn;
  };

  const undoBtn = makeBtn('↩', '撤销 (Ctrl+Z)', () => callbacks.undo());
  const redoBtn = makeBtn('↪', '重做 (Ctrl+Shift+Z)', () => callbacks.redo());
  const linkBtn = makeBtn('↔', '连线模式', () => {
    const active = callbacks.toggleLinkMode();
    linkBtn.style.background = active ? '#5B8FF9' : '';
    linkBtn.style.color = active ? '#fff' : '';
  });
  const boxBtn = makeBtn('⬜', '框选模式', () => {
    const active = callbacks.toggleBoxSelectMode();
    boxBtn.style.background = active ? '#5B8FF9' : '';
    boxBtn.style.color = active ? '#fff' : '';
  });

  // 初始化高亮状态
  const syncActive = () => {
    const la = callbacks.getLinkActive?.() ?? false;
    linkBtn.style.background = la ? '#5B8FF9' : '';
    linkBtn.style.color = la ? '#fff' : '';
    const ba = callbacks.getBoxSelectActive?.() ?? false;
    boxBtn.style.background = ba ? '#5B8FF9' : '';
    boxBtn.style.color = ba ? '#fff' : '';
  };

  bar.appendChild(undoBtn);
  bar.appendChild(redoBtn);
  bar.appendChild(linkBtn);
  bar.appendChild(boxBtn);

  const updateVisibility = () => {
    const visible = isTouchDevice();
    bar.style.display = visible ? 'flex' : 'none';
    if (visible) syncActive();
  };

  updateVisibility();
  window.addEventListener('resize', updateVisibility);

  // --- 拖拽工具栏（按钮区域也可拖，移动 >5px 才算拖拽）---
  let dragInfo: { cx: number; cy: number; elX: number; elY: number; moved: boolean } | null = null;
  let _draggedThisGesture = false;

  const startDrag = (ex: number, ey: number) => {
    const rect = bar.getBoundingClientRect();
    barLeft = rect.left;
    barTop = rect.top;
    applyPos();
    dragInfo = { cx: ex, cy: ey, elX: barLeft, elY: barTop, moved: false };
    bar.style.transition = 'none';
  };

  const moveDrag = (ex: number, ey: number) => {
    if (!dragInfo) return;
    if (!dragInfo.moved && Math.hypot(ex - dragInfo.cx, ey - dragInfo.cy) < 5) return;
    dragInfo.moved = true;
    _draggedThisGesture = true;
    barLeft = Math.max(0, Math.min(window.innerWidth - bar.offsetWidth, dragInfo.elX + (ex - dragInfo.cx)));
    barTop = Math.max(0, Math.min(window.innerHeight - bar.offsetHeight, dragInfo.elY + (ey - dragInfo.cy)));
    applyPos();
  };

  const endDrag = () => {
    dragInfo = null;
    bar.style.transition = '';
  };

  bar.addEventListener('pointerdown', (e: PointerEvent) => {
    _draggedThisGesture = false;
    startDrag(e.clientX, e.clientY);
    e.preventDefault();
  });
  window.addEventListener('pointermove', (e: PointerEvent) => {
    if (dragInfo) moveDrag(e.clientX, e.clientY);
  });
  window.addEventListener('pointerup', () => { endDrag(); });
  // 拖动后阻止按钮 click
  bar.addEventListener('click', (e) => {
    if (_draggedThisGesture) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);

  bar.addEventListener('touchstart', (e: TouchEvent) => {
    _draggedThisGesture = false;
    const t = e.touches[0];
    if (t) startDrag(t.clientX, t.clientY);
  }, { passive: false });
  window.addEventListener('touchmove', (e: TouchEvent) => {
    if (!dragInfo) return;
    const t = e.touches[0];
    if (t) moveDrag(t.clientX, t.clientY);
  }, { passive: false });
  window.addEventListener('touchend', () => { endDrag(); });
  window.addEventListener('touchcancel', () => { if (dragInfo) endDrag(); });

  return bar;
}
