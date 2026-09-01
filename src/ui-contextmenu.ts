import { sharedState } from "./shared-state";
import {Z_CONTEXT_MENU, V } from "./layout-constants";

export interface ContextMenuTreeElement {
  contains(target: Node | null): boolean;
  remove(): void;
}

/** Tracks every element in one context-menu tree, including submenus. */
export class ContextMenuTree<T extends ContextMenuTreeElement = ContextMenuTreeElement> {
  private readonly menus = new Set<T>();

  get size(): number {
    return this.menus.size;
  }

  register(menu: T): void {
    this.menus.add(menu);
  }

  unregister(menu: T): void {
    this.menus.delete(menu);
  }

  contains(target: Node | null): boolean {
    return [...this.menus].some(menu => menu.contains(target));
  }

  closeAll(): void {
    for (const menu of this.menus) menu.remove();
    this.menus.clear();
  }

  closeAllExcept(menu: T): void {
    for (const openMenu of this.menus) {
      if (openMenu !== menu) openMenu.remove();
    }
    this.menus.clear();
    this.menus.add(menu);
  }
}

let currentMenu: HTMLElement | null = null;
const openMenus = new ContextMenuTree<HTMLElement>();

export interface ContextMenuItem {
  label?: string;
  action?: () => void;
  children?: ContextMenuItem[];
  separator?: boolean;
  disabled?: boolean;
}

export function closeContextMenu() {
  openMenus.closeAll();
  currentMenu = null;
  document.removeEventListener("pointerdown", onDocPointerDown);
  document.removeEventListener("touchstart", onDocTouchStart);
  window.removeEventListener("keydown", onKeyDown);
}

function onDocPointerDown(e: PointerEvent) {
  if (currentMenu && !openMenus.contains(e.target as Node | null)) {
    closeContextMenu();
    if (sharedState.clearSelection) {
      sharedState.clearSelection();
    }
  }
}

function onDocTouchStart(e: TouchEvent) {
  if (currentMenu && !openMenus.contains(e.target as Node | null)) {
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
  menu.className = 'fg-context-menu';
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
        separator.className = 'fg-context-menu-separator';
        separator.setAttribute('role', 'separator');
        separator.style.cssText = `height:1px;margin:4px 6px;background:${V('--fg-border-light', 'rgba(255,255,255,0.1)')};`;
        parent.appendChild(separator);
        return;
      }
      const mi = document.createElement("div");
      mi.className = 'fg-context-menu-item' + (item.children ? ' has-children' : '') + (item.disabled ? ' is-disabled' : '');
      mi.setAttribute('role', 'menuitem');
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
          sub.className = 'fg-context-menu fg-context-submenu';
          sub.setAttribute('data-menu', 'context-submenu');
          sub.style.cssText = menuStyle + `left:${mx + parent.offsetWidth}px;top:${my + mi.offsetTop}px;`;
          buildItems(sub, item.children, mx + parent.offsetWidth, my + mi.offsetTop);
          // Keep one submenu branch open and register it with the root's outside-click tree.
          openMenus.closeAllExcept(menu);
          container.appendChild(sub);
          openMenus.register(sub);
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
  openMenus.register(menu);

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
    // A newer menu may have replaced this one before its deferred listeners run.
    if (currentMenu !== menu) return;
    document.addEventListener("pointerdown", onDocPointerDown);
    document.addEventListener("touchstart", onDocTouchStart);
    window.addEventListener("keydown", onKeyDown);
  }, 0);
}
