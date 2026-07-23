import { sharedState } from "./shared-state";
import {Z_CONTEXT_MENU, V } from "./layout-constants";

let currentMenu: HTMLElement | null = null;

export interface ContextMenuItem {
  label?: string;
  action?: () => void;
  children?: ContextMenuItem[];
  separator?: boolean;
  disabled?: boolean;
}

export function closeContextMenu() {
  if (currentMenu) {
    currentMenu.remove();
    currentMenu = null;
  }
  document.removeEventListener("pointerdown", onDocPointerDown);
  document.removeEventListener("touchstart", onDocTouchStart);
  window.removeEventListener("keydown", onKeyDown);
}

function onDocPointerDown(e: PointerEvent) {
  if (currentMenu && !currentMenu.contains(e.target as Node)) {
    closeContextMenu();
    if (sharedState.clearSelection) {
      sharedState.clearSelection();
    }
  }
}

function onDocTouchStart(e: TouchEvent) {
  if (currentMenu && !currentMenu.contains(e.target as Node)) {
    closeContextMenu();
    if (sharedState.clearSelection) {
      sharedState.clearSelection();
    }
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    closeContextMenu();
    if (sharedState.clearSelection) {
      sharedState.clearSelection();
    }
  }
}

export function showContextMenu(
  container: HTMLElement,
  x: number,
  y: number,
  items: ContextMenuItem[]
) {
  closeContextMenu();
  const menu = document.createElement("div");
  menu.setAttribute('data-menu', 'context');
  const menuStyle =
    `position:absolute;z-index:${Z_CONTEXT_MENU};` +
    `background:${V('--fg-surface-glass', 'rgba(40,42,48,0.8)')};` +
    `backdrop-filter:blur(var(--fg-glass-blur-md,10px));-webkit-backdrop-filter:blur(var(--fg-glass-blur-md,10px));` +
    `border:1px solid ${V('--fg-glass-border', 'rgba(255,255,255,0.1)')};` +
    `border-radius:${V('--fg-radius-md', '10px')};` +
    `box-shadow:${V('--fg-shadow-md', '0 4px 16px rgba(0,0,0,0.3)')};` +
    `padding:4px 0;min-width:120px;` +
    `color:${V('--fg-text', '#d0d0d0')};`;
  menu.style.cssText = menuStyle + `left:${x}px;top:${y}px;`;

  const itemStyle =
    `padding:4px 8px;cursor:pointer;font-size:${V('--fg-font-lg', '0.92em')};` +
    `transition:background var(--fg-transition-fast,0.15s ease);`;
  const itemHover = V('--fg-button-hover', 'rgba(255,255,255,0.12)');

  /** 在指定位置创建菜单 DOM */
  const buildItems = (parent: HTMLElement, itemList: typeof items, mx: number, my: number) => {
    itemList.forEach(item => {
      if (item.separator) {
        const separator = document.createElement('div');
        separator.setAttribute('role', 'separator');
        separator.style.cssText = `height:1px;margin:4px 6px;background:${V('--fg-border-light', 'rgba(255,255,255,0.1)')};`;
        parent.appendChild(separator);
        return;
      }
      const mi = document.createElement("div");
      mi.textContent = item.label ?? '';
      mi.style.cssText = itemStyle + (item.children ? ' display:flex;justify-content:space-between;' : '') + (item.disabled ? 'opacity:0.42;cursor:default;' : '');
      mi.setAttribute('aria-disabled', String(!!item.disabled));
      if (item.children) {
        const arrow = document.createElement('span');
        arrow.textContent = '\u25B6';
        arrow.style.cssText = 'font-size:0.7em;opacity:0.5;';
        mi.appendChild(arrow);
      }
      if (!item.disabled) {
        mi.onmouseenter = () => mi.style.background = itemHover;
        mi.onmouseleave = () => mi.style.background = "";
      }
      mi.onclick = () => {
        if (item.disabled) return;
        if (item.children) {
          // 子菜单：在父项右侧创建
          const sub = document.createElement("div");
          sub.style.cssText = menuStyle + `left:${mx + parent.offsetWidth}px;top:${my + mi.offsetTop}px;`;
          buildItems(sub, item.children, mx + parent.offsetWidth, my + mi.offsetTop);
          container.appendChild(sub);
          // 点击子菜单外关闭全部
          const onSubClose = (e: PointerEvent) => {
            if (!sub.contains(e.target as Node) && e.target !== mi) {
              sub.remove(); document.removeEventListener('pointerdown', onSubClose);
            }
          };
          setTimeout(() => document.addEventListener('pointerdown', onSubClose), 0);
        } else {
          item.action?.();
          closeContextMenu();
          if (sharedState.clearSelection) sharedState.clearSelection();
        }
      };
      parent.appendChild(mi);
    });
  };
  buildItems(menu, items, x, y);

  container.appendChild(menu);
  currentMenu = menu;

  // Screen-edge clamping
  requestAnimationFrame(() => {
    const menuRect = menu.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const margin = 8;
    const maxX = containerRect.width - menuRect.width - margin;
    const maxY = containerRect.height - menuRect.height - margin;
    if (x > maxX) menu.style.left = Math.max(margin, maxX) + 'px';
    if (y > maxY) menu.style.top = Math.max(margin, maxY) + 'px';
  });

  setTimeout(() => {
    document.addEventListener("pointerdown", onDocPointerDown);
    document.addEventListener("touchstart", onDocTouchStart);
    window.addEventListener("keydown", onKeyDown);
  }, 0);
}
