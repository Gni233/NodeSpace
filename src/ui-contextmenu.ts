import { sharedState } from "./shared-state";
import { Z_CONTEXT_MENU } from './layout-constants';

let currentMenu: HTMLElement | null = null;

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

const V = (name: string, fallback: string) => `var(${name},${fallback})`;

export function showContextMenu(
  container: HTMLElement,
  x: number,
  y: number,
  items: { label: string; action: () => void; children?: { label: string; action: () => void }[] }[]
) {
  closeContextMenu();
  const menu = document.createElement("div");
  menu.setAttribute('data-menu', 'context');
  menu.style.cssText =
    `position:absolute;left:${x}px;top:${y}px;z-index:${Z_CONTEXT_MENU};` +
    `background:${V('--fg-surface-glass', 'rgba(40,42,48,0.8)')};` +
    `backdrop-filter:blur(var(--fg-glass-blur-md,10px));-webkit-backdrop-filter:blur(var(--fg-glass-blur-md,10px));` +
    `border:1px solid ${V('--fg-glass-border', 'rgba(255,255,255,0.1)')};` +
    `border-radius:${V('--fg-radius-md', '6px')};` +
    `box-shadow:${V('--fg-shadow-md', '0 4px 16px rgba(0,0,0,0.3)')};` +
    `padding:4px 0;min-width:120px;` +
    `color:${V('--fg-text', '#d0d0d0')};`;

  items.forEach(item => {
    const mi = document.createElement("div");
    mi.textContent = item.label;
    mi.style.cssText =
      `padding:4px 8px;cursor:pointer;font-size:0.9em;display:flex;justify-content:space-between;align-items:center;` +
      `transition:background var(--fg-transition-fast,0.15s ease);`;
    mi.onmouseenter = () => mi.style.background = V('--fg-button-hover', 'rgba(255,255,255,0.12)');
    mi.onmouseleave = () => mi.style.background = "";
    mi.onclick = (e) => {
      if (item.children) {
        e.stopPropagation();
        // 显示子菜单
        const existing = menu.querySelector('[data-submenu]');
        if (existing) existing.remove();
        const sub = document.createElement("div");
        sub.setAttribute('data-submenu', '1');
        sub.style.cssText =
          `position:absolute;left:${menu.offsetWidth}px;top:${mi.offsetTop}px;z-index:${Z_CONTEXT_MENU + 1};` +
          `background:${V('--fg-surface-glass', 'rgba(40,42,48,0.9)')};` +
          `backdrop-filter:blur(var(--fg-glass-blur-md,10px));-webkit-backdrop-filter:blur(var(--fg-glass-blur-md,10px));` +
          `border:1px solid ${V('--fg-glass-border', 'rgba(255,255,255,0.1)')};` +
          `border-radius:${V('--fg-radius-md', '6px')};` +
          `box-shadow:${V('--fg-shadow-md', '0 4px 16px rgba(0,0,0,0.3)')};` +
          `padding:4px 0;min-width:120px;` +
          `color:${V('--fg-text', '#d0d0d0')};`;
        item.children.forEach(child => {
          const sm = document.createElement("div");
          sm.textContent = child.label;
          sm.style.cssText =
            `padding:4px 8px;cursor:pointer;font-size:0.9em;` +
            `transition:background var(--fg-transition-fast,0.15s ease);`;
          sm.onmouseenter = () => sm.style.background = V('--fg-button-hover', 'rgba(255,255,255,0.12)');
          sm.onmouseleave = () => sm.style.background = "";
          sm.onclick = () => {
            child.action();
            closeContextMenu();
            if (sharedState.clearSelection) sharedState.clearSelection();
          };
          sub.appendChild(sm);
        });
        menu.appendChild(sub);
        return;
      }
      item.action();
      if (!(item as any).keepOpen) {
        closeContextMenu();
        if (sharedState.clearSelection) {
          sharedState.clearSelection();
        }
      }
    };
    menu.appendChild(mi);
  });

  container.appendChild(menu);
  currentMenu = menu;

  // Screen-edge clamping: reposition if menu overflows container
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
