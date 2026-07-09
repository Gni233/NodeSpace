/**
 * 移动端浮动工具栏 — 小屏幕设备上提供常用操作按钮
 * window.innerWidth < 700 时显示
 */
import { Z_MOBILE_TOOLBAR, V } from './layout-constants';

export interface MobileToolbarCallbacks {
  undo: () => void;
  redo: () => void;
  toggleLinkMode: () => boolean;
  toggleBoxSelectMode: () => boolean;
  /** 外部查询当前状态，用于工具栏高亮同步 */
  getLinkActive?: () => boolean;
  getBoxSelectActive?: () => boolean;
}

export function createMobileToolbar(callbacks: MobileToolbarCallbacks): HTMLElement {
  const BREAKPOINT = 700;

  const bar = document.createElement('div');
  bar.className = 'fg-mobile-toolbar';
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
    const visible = window.innerWidth < BREAKPOINT;
    bar.style.display = visible ? 'flex' : 'none';
    if (visible) syncActive();
  };

  updateVisibility();
  window.addEventListener('resize', updateVisibility);

  return bar;
}
