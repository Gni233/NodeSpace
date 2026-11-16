import { sharedState } from "./shared-state";
import {Z_CONTEXT_MENU, V } from "./layout-constants";
import { asContextMenuItems, buildWheelEntries, findWheelEntry, loadWheelOrder, moveWheelEntry, type WheelEntry, type WheelMove } from './context-wheel-order';
import './node-context-wheel.css';

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
let currentMenuKeyboard: ContextMenuKeyboard | undefined;
let disposeCurrentMenu: (() => void) | undefined;
const openMenus = new ContextMenuTree<HTMLElement>();

export interface ContextMenuItem {
  id?: string;
  label?: string;
  action?: () => void;
  children?: ContextMenuItem[];
  separator?: boolean;
  disabled?: boolean;
  destructive?: boolean;
  icon?: string;
  swatch?: string;
}

export interface ContextWheelOptions {
  label?: string;
  scope?: string;
  returnFocus?: HTMLElement | null | (() => HTMLElement | null | undefined);
  clearSelection?: boolean;
}

type ContextMenuKeyboard = ContextWheelOptions;

function menuKeyboard(options: ContextWheelOptions): ContextMenuKeyboard {
  const focused = document.activeElement;
  return { returnFocus: focused instanceof HTMLElement ? focused : null, ...options };
}

function restoreMenuFocus(keyboard?: ContextMenuKeyboard) {
  const target = keyboard?.returnFocus;
  (typeof target === 'function' ? target() : target)?.focus({ preventScroll: true });
}

export function closeContextMenu() {
  openMenus.closeAll();
  disposeCurrentMenu?.();
  disposeCurrentMenu = undefined;
  currentMenu = null;
  currentMenuKeyboard = undefined;
  document.removeEventListener("pointerdown", onDocPointerDown);
  document.removeEventListener("touchstart", onDocTouchStart);
  window.removeEventListener("keydown", onKeyDown, true);
}

export function hasOpenContextMenu(): boolean {
  return currentMenu?.isConnected === true;
}

function clearMenuSelection(keyboard?: ContextMenuKeyboard) {
  if (keyboard?.clearSelection !== false) sharedState.clearSelection?.();
}

function activateContextMenuItem(item: ContextMenuItem, keyboard?: ContextMenuKeyboard) {
  if (keyboard?.clearSelection === false) {
    closeContextMenu();
    restoreMenuFocus(keyboard);
    item.action?.();
    return;
  }
  item.action?.();
  closeContextMenu();
  clearMenuSelection(keyboard);
  if (document.activeElement === document.body) restoreMenuFocus(keyboard);
}

function dismissCurrentMenu() {
  const keyboard = currentMenuKeyboard;
  closeContextMenu();
  clearMenuSelection(keyboard);
  restoreMenuFocus(keyboard);
}

function onDocPointerDown(e: PointerEvent) {
  if (currentMenu && !openMenus.contains(e.target as Node | null)) {
    dismissCurrentMenu();
  }
}

function onDocTouchStart(e: TouchEvent) {
  if (currentMenu && !openMenus.contains(e.target as Node | null)) {
    dismissCurrentMenu();
  }
}

function onKeyDown(event: KeyboardEvent) {
  if (!currentMenu || event.key !== 'Escape') return;
  if (currentMenuKeyboard && openMenus.contains(event.target as Node | null)) return;
  event.preventDefault();
  event.stopPropagation();
  dismissCurrentMenu();
}

function dismissMenuWithKeyboard(event: KeyboardEvent, keyboard: ContextMenuKeyboard) {
  if (event.key !== 'Escape' && event.key !== 'Tab') return false;
  event.stopPropagation();
  if (event.key === 'Escape') event.preventDefault();
  closeContextMenu();
  if (event.key === 'Escape') clearMenuSelection(keyboard);
  restoreMenuFocus(keyboard);
  return true;
}

function mountContextMenu(container: HTMLElement, menu: HTMLElement, keyboard?: ContextMenuKeyboard, dispose?: () => void) {
  container.appendChild(menu);
  currentMenu = menu;
  currentMenuKeyboard = keyboard;
  disposeCurrentMenu = dispose;
  openMenus.register(menu);
  setTimeout(() => {
    if (currentMenu !== menu) return;
    document.addEventListener("pointerdown", onDocPointerDown);
    document.addEventListener("touchstart", onDocTouchStart);
    window.addEventListener("keydown", onKeyDown, true);
  }, 0);
}

const menuInset = 8;

function getMenuBounds(container: HTMLElement) {
  const rect = container.getBoundingClientRect();
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  const styles = window.getComputedStyle?.(container);
  const safeInset = (side: 'left' | 'top' | 'right' | 'bottom') =>
    parseFloat(styles?.getPropertyValue(`--fg-wheel-safe-${side}`) ?? '') || 0;
  return {
    left: Math.max(0, left + safeInset('left') - rect.left),
    top: Math.max(0, top + safeInset('top') - rect.top),
    right: Math.min(rect.width, left + (viewport?.width ?? window.innerWidth) - safeInset('right') - rect.left),
    bottom: Math.min(rect.height, top + (viewport?.height ?? window.innerHeight) - safeInset('bottom') - rect.top),
  };
}

function clampMenuOffset(offset: number, min: number, max: number) {
  return Math.max(min, Math.min(offset, max));
}

function placeContextList(container: HTMLElement, menu: HTMLElement, x: number, y: number, anchor?: DOMRectReadOnly) {
  const bounds = getMenuBounds(container);
  const maxX = bounds.right - menu.offsetWidth - menuInset;
  if (anchor) {
    const origin = container.getBoundingClientRect();
    const right = anchor.right - origin.left + 4;
    x = right <= maxX ? right : anchor.left - origin.left - menu.offsetWidth - 4;
    y = anchor.top - origin.top;
  }
  menu.style.left = `${clampMenuOffset(x, bounds.left + menuInset, maxX)}px`;
  menu.style.top = `${clampMenuOffset(y, bounds.top + menuInset, bounds.bottom - menu.offsetHeight - menuInset)}px`;
}

function menuSwatch(color: string) {
  const swatch = document.createElement('span');
  swatch.className = 'fg-context-menu-swatch';
  swatch.setAttribute('aria-hidden', 'true');
  swatch.style.setProperty('--fg-menu-swatch-color', color);
  return swatch;
}

export function showContextMenu(
  container: HTMLElement,
  x: number,
  y: number,
  items: ContextMenuItem[],
  keyboard?: ContextMenuKeyboard,
) {
  closeContextMenu();
  const menu = document.createElement("div");
  menu.className = 'fg-context-menu';
  menu.setAttribute('data-menu', 'context');
  const configureList = (list: HTMLElement) => {
    if (!keyboard) return;
    const bounds = getMenuBounds(container);
    list.classList.add('fg-node-wheel-list');
    list.setAttribute('role', 'menu');
    if (keyboard.label) list.setAttribute('aria-label', keyboard.label);
    list.style.setProperty('--fg-wheel-list-height', `${Math.max(0, bounds.bottom - bounds.top - menuInset * 2)}px`);
  };
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
  configureList(menu);

  const itemStyle =
    `padding:4px 8px;cursor:pointer;font-size:${V('--fg-font-lg', '0.92em')};` +
    `transition:background var(--fg-transition-fast,0.15s ease);`;
  const itemHover = V('--fg-button-hover', 'rgba(255,255,255,0.12)');

  const buildItems = (parent: HTMLElement, itemList: typeof items, trigger?: HTMLElement) => {
    const focusable: HTMLElement[] = [];
    itemList.forEach(item => {
      if (item.separator) {
        const separator = document.createElement('div');
        separator.className = 'fg-context-menu-separator';
        separator.setAttribute('role', 'separator');
        separator.style.cssText = `height:1px;margin:4px 6px;background:${V('--fg-border-light', 'rgba(255,255,255,0.1)')};`;
        parent.appendChild(separator);
        return;
      }
      const mi = document.createElement('button');
      mi.type = 'button';
      mi.disabled = !!item.disabled;
      mi.className = 'fg-context-menu-item' + (item.children ? ' has-children' : '') + (item.disabled ? ' is-disabled' : '') + (item.destructive ? ' is-destructive' : '');
      mi.setAttribute('role', 'menuitem');
      if (item.swatch) {
        mi.appendChild(menuSwatch(item.swatch));
        const label = document.createElement('span');
        label.textContent = item.label ?? '';
        mi.appendChild(label);
      } else mi.textContent = item.label ?? '';
      mi.style.cssText = itemStyle + (item.children ? ' display:flex;justify-content:space-between;' : '') + (item.disabled ? 'opacity:0.42;cursor:default;' : '');
      mi.setAttribute('aria-disabled', String(!!item.disabled));
      if (item.children) {
        mi.setAttribute('aria-haspopup', 'menu');
        const arrow = document.createElement('span');
        arrow.textContent = '\u25B6';
        arrow.style.cssText = 'font-size:0.7em;opacity:0.5;';
        mi.appendChild(arrow);
      }
      if (!item.disabled) {
        if (keyboard) {
          mi.tabIndex = -1;
          focusable.push(mi);
        }
        mi.onmouseenter = () => mi.style.background = itemHover;
        mi.onmouseleave = () => mi.style.background = "";
      }
      mi.onclick = () => {
        if (item.disabled) return;
        if (item.children) {
          const sub = document.createElement("div");
          sub.className = 'fg-context-menu fg-context-submenu';
          sub.setAttribute('data-menu', 'context-submenu');
          sub.style.cssText = menuStyle;
          configureList(sub);
          const anchor = mi.getBoundingClientRect();
          const list = parent.getBoundingClientRect();
          const first = buildItems(sub, item.children, trigger ?? mi);
          // Keep one submenu branch open and register it with the root's outside-click tree.
          openMenus.closeAllExcept(menu);
          container.appendChild(sub);
          openMenus.register(sub);
          placeContextList(container, sub, x, y, new DOMRect(list.left, anchor.top, list.width, anchor.height));
          first?.focus({ preventScroll: true });
        } else {
          activateContextMenuItem(item, keyboard);
        }
      };
      parent.appendChild(mi);
    });
    if (keyboard) parent.addEventListener('keydown', event => {
      if (dismissMenuWithKeyboard(event, keyboard)) return;
      const current = document.activeElement as HTMLElement | null;
      if (event.key === 'ArrowLeft' && trigger) {
        event.preventDefault();
        openMenus.unregister(parent);
        parent.remove();
        trigger.focus({ preventScroll: true });
      } else if (event.key === 'Enter' || event.key === ' ' || (event.key === 'ArrowRight' && current?.getAttribute('aria-haspopup'))) {
        event.preventDefault();
        current?.click();
      } else if (focusable.length && ['Home', 'End', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const index = focusable.indexOf(current!);
        const step = event.key === 'ArrowUp' ? -1 : 1;
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? focusable.length - 1 : (index + step + focusable.length) % focusable.length;
        focusable[next].focus();
      }
    });
    return focusable[0];
  };
  const first = buildItems(menu, items);
  mountContextMenu(container, menu, keyboard);
  placeContextList(container, menu, x, y);
  first?.focus({ preventScroll: true });
}

const innerHoleRadius = 52;
const firstWheelRadius = 146;
const outerWheelGap = 7;
const outerWheelWidth = 59;
const minWedgeCaptionWidth = 52;
const hoverDelay = 85;
const nodeWheelIcons: Record<string, string> = {
  edit: '<path d="M3.5 15.5h3l8.7-8.7-3-3-8.7 8.7v3Zm7.1-10.1 3 3"/>',
  open: '<path d="M10 3.5h5.5V9M15.5 3.5l-7 7M7 5H4.5A1.5 1.5 0 0 0 3 6.5v7A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5V11"/>',
  child: '<path d="M9 3.5v11m-5.5-5.5h11"/>',
  link: '<path d="m7.2 10.8 3.6-3.6M6.4 8.2l-2 2a2.5 2.5 0 0 0 3.5 3.5l2-2m0-5.8 2-2a2.5 2.5 0 0 1 3.5 3.5l-2 2"/>',
  pin: '<path d="M6 3.5h6l-1 4.1 2 2v1H5v-1l2-2-1-4.1Zm3 7.1v4.9"/>',
  fold: '<path d="M5 6.8 9 11l4-4.2M5.5 14h7"/>',
  context: '<circle cx="9" cy="9" r="2"/><path d="M4.2 11.4a5.4 5.4 0 0 1 2.4-7.2m7.2 2.4a5.4 5.4 0 0 1-2.4 7.2"/>',
  more: '<circle cx="4" cy="9" r=".75"/><circle cx="9" cy="9" r=".75"/><circle cx="14" cy="9" r=".75"/>',
  back: '<path d="M7 3.5 2.5 8 7 12.5M3 8h8a3.5 3.5 0 0 1 3.5 3.5V14"/>',
  duplicate: '<rect x="6.5" y="6.5" width="8" height="8" rx="1.5"/><path d="M11.5 4A1.5 1.5 0 0 0 10 2.5H4A1.5 1.5 0 0 0 2.5 4v6A1.5 1.5 0 0 0 4 11.5"/>',
  delete: '<path d="M4 5h10m-6-2h2m-5 2 .7 9.2a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9L13 5M7.5 7.5v5m3-5v5"/>',
  tag: '<path d="M3 4v4.8l5.9 6 6-6-6-5.8H4a1 1 0 0 0-1 1Z"/><circle cx="6.6" cy="6.5" r=".8"/>',
  color: '<path d="M15 8.5A6 6 0 1 0 8.6 15c1.2 0 1.3-.8 1.1-1.6-.2-.9.2-1.6 1.1-1.6h1.1c1.9 0 3.1-1.2 3.1-3.3Z"/><circle cx="6" cy="8.3" r=".55"/><circle cx="8.1" cy="5.7" r=".55"/><circle cx="11.2" cy="6.7" r=".55"/>',
  swap: '<path d="M4 6h10m-3-3 3 3-3 3M14 12H4m3-3-3 3 3 3"/>',
  next: '<path d="m7 4 5 5-5 5"/>',
};

type WheelBounds = ReturnType<typeof getMenuBounds>;

interface WheelShape {
  inner: number;
  outer: number;
  caption: number;
  angle: number;
  sweep: number;
}

interface WheelButton {
  button: HTMLButtonElement;
  entry: WheelEntry;
  sector: WheelShape;
  x: number;
  y: number;
}

interface WheelRing {
  element: HTMLElement;
  buttons: WheelButton[];
  shape: WheelShape;
  anchor?: WheelButton;
}

interface WheelDrop {
  move: WheelMove;
  target?: WheelButton;
  hint: string;
  expand?: WheelRing;
}

interface WheelDrag {
  pointerId: number;
  startX: number;
  startY: number;
  sourceRing: WheelRing;
  source: WheelButton;
  status?: HTMLElement;
  drop?: WheelDrop;
}

const wheelDirections: Record<string, readonly [number, number]> = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
};

function wheelSectorPath(shape: WheelShape, gap: number) {
  const { inner, outer, angle, sweep } = shape;
  const center = outer + 1;
  const start = angle - sweep / 2 + gap;
  const end = angle + sweep / 2 - gap;
  const large = end - start > Math.PI ? 1 : 0;
  const point = (theta: number, r: number) =>
    `${(center + r * Math.cos(theta)).toFixed(2)} ${(center + r * Math.sin(theta)).toFixed(2)}`;
  return `path("M ${point(start, outer)} A ${outer} ${outer} 0 ${large} 1 ${point(end, outer)} L ${point(end, inner)} A ${inner} ${inner} 0 ${large} 0 ${point(start, inner)} Z")`;
}

function wheelBounds({ inner, outer, angle, sweep }: WheelShape): WheelBounds {
  const start = angle - sweep / 2;
  const end = angle + sweep / 2;
  const angles = [start, end];
  const quarter = Math.PI / 2;
  for (let theta = Math.ceil(start / quarter) * quarter; theta < end; theta += quarter) angles.push(theta);
  const points = angles.flatMap(theta => [inner, outer].map(radius => ({
    x: radius * Math.cos(theta), y: radius * Math.sin(theta),
  })));
  return {
    left: Math.min(...points.map(point => point.x)) - 1,
    right: Math.max(...points.map(point => point.x)) + 1,
    top: Math.min(...points.map(point => point.y)) - 1,
    bottom: Math.max(...points.map(point => point.y)) + 1,
  };
}

function wheelShape(count: number, compact: boolean, parent?: { outer: number; angle: number; sweep: number }): WheelShape {
  const width = compact ? 52 : outerWheelWidth;
  const inner = parent ? parent.outer + outerWheelGap : compact ? 40 : innerHoleRadius;
  const minCaption = count * (compact ? 60 : minWedgeCaptionWidth) / (2 * Math.PI);
  const caption = Math.ceil(Math.max(parent ? inner + width / 2 : compact ? 75 : 99, minCaption));
  const padding = parent ? compact ? 26 : 30 : compact ? 36 : 47;
  const outer = Math.max(parent ? inner + width : compact ? 111 : firstWheelRadius, caption + padding);
  const sweep = parent ? Math.min(2 * Math.PI, Math.max(parent.sweep, count * (compact ? 68 : 84) / caption)) : 2 * Math.PI;
  return { inner, outer, caption, angle: parent?.angle ?? Math.PI / 2 - Math.PI / count, sweep };
}

export function showContextWheel(
  container: HTMLElement,
  x: number,
  y: number,
  commands: { icon: string; item: ContextMenuItem }[],
  remaining: ContextMenuItem[],
  fallbackItems: ContextMenuItem[],
  options: ContextWheelOptions = {},
) {
  const keyboard = menuKeyboard({ label: '节点操作', ...options });
  const bounds = getMenuBounds(container);
  const compact = bounds.right - bounds.left < 520 || bounds.bottom - bounds.top < 460;
  const primary = commands.filter(({ item }) => !item.separator && !item.disabled && item.label && (item.action || item.children?.length));
  if (primary.length && remaining.some(item => !item.separator && item.label)) {
    primary.push({ icon: 'more', item: { id: 'wheel-more', label: '更多', children: remaining } });
  }
  const entries = buildWheelEntries(primary.length ? primary : fallbackItems.map(item => ({ item })));
  if (!entries.length) return;
  const order = loadWheelOrder(options.scope ?? keyboard.label?.split(' · ')[0] ?? '操作');
  const customized = order.apply(entries);
  const primaryShape = wheelShape(entries.length, compact);

  const wheel = document.createElement('div');
  wheel.className = 'fg-node-wheel';
  wheel.dataset.menu = 'context';
  wheel.setAttribute('role', 'menu');
  wheel.setAttribute('aria-label', keyboard.label ?? '节点操作');
  wheel.tabIndex = -1;
  wheel.style.zIndex = String(Z_CONTEXT_MENU);
  wheel.addEventListener('contextmenu', event => event.preventDefault());

  const rings: WheelRing[] = [];
  let centerX = x;
  let centerY = y;
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;
  let hovered: HTMLButtonElement | null = null;
  let pointerPosition: { x: number; y: number } | undefined;
  let deferHoverUntilMove: typeof pointerPosition;
  let drag: WheelDrag | undefined;
  let expandOnDrag: ReturnType<typeof setTimeout> | undefined;
  let suppressNextClick = false;

  function fitWheel(shape: WheelShape) {
    const footprint = [...rings.map(ring => ring.shape), shape].map(wheelBounds);
    const minX = bounds.left + menuInset - Math.min(...footprint.map(rect => rect.left));
    const maxX = bounds.right - menuInset - Math.max(...footprint.map(rect => rect.right));
    const minY = bounds.top + menuInset - Math.min(...footprint.map(rect => rect.top));
    const maxY = bounds.bottom - menuInset - Math.max(...footprint.map(rect => rect.bottom));
    if (minX > maxX || minY > maxY) return false;
    const nextX = clampMenuOffset(centerX, minX, maxX);
    const nextY = clampMenuOffset(centerY, minY, maxY);
    // Moving the wheel beneath a stationary pointer must not open a different branch.
    if (nextX !== centerX || nextY !== centerY) deferHoverUntilMove = pointerPosition;
    centerX = nextX;
    centerY = nextY;
    wheel.style.left = `${centerX}px`;
    wheel.style.top = `${centerY}px`;
    return true;
  }

  if (window.CSS && !window.CSS.supports('clip-path', 'path("M 0 0 L 1 0 L 0 1 Z")')
    || !fitWheel(primaryShape)) {
    showContextMenu(container, x, y, customized ? asContextMenuItems(entries) : fallbackItems, keyboard);
    return;
  }

  function trimRings(count: number) {
    while (rings.length > count) {
      const removed = rings.pop()!;
      removed.anchor?.button.setAttribute('aria-expanded', 'false');
      removed.element.remove();
    }
  }

  function focusRing(ring: WheelRing) {
    (ring.buttons.find(item => !item.button.disabled)?.button ?? wheel).focus({ preventScroll: true });
  }

  function openBranch(ring: WheelRing, trigger: WheelButton, focus: boolean, allowFallback = true) {
    const depth = rings.indexOf(ring);
    if (depth < 0 || currentMenu !== wheel) return;
    const existing = rings[depth + 1];
    if (existing?.anchor === trigger) {
      if (focus) focusRing(existing);
      return existing;
    }
    trimRings(depth + 1);
    const { entry, sector } = trigger;
    if (!entry.children?.length) return;
    const shape = wheelShape(entry.children.length, compact, sector);
    if (!fitWheel(shape)) {
      if (allowFallback) {
        showContextMenu(container, centerX + trigger.x, centerY + trigger.y, asContextMenuItems(entry.children), { ...keyboard, label: entry.item.label });
      }
      return;
    }
    const child = addRing(entry.children, shape, trigger);
    trigger.button.setAttribute('aria-expanded', 'true');
    if (focus) focusRing(child);
    return child;
  }

  function wheelSiblings(ring: WheelRing) {
    return ring.anchor?.entry.children ?? entries;
  }

  function findDrop(active: WheelDrag, x: number, y: number): WheelDrop | undefined {
    const hit = document.elementFromPoint(x, y)?.closest('.fg-node-wheel-item');
    const targetRing = rings.find(ring => ring.buttons.some(item => item.button === hit));
    const target = targetRing?.buttons.find(item => item.button === hit);
    const origin = container.getBoundingClientRect();
    const dx = x - origin.left - centerX;
    const dy = y - origin.top - centerY;
    const radius = Math.hypot(dx, dy);
    const key = active.source.entry.key;

    const anchor = active.sourceRing.anchor;
    if (anchor && (!target || target === anchor) && radius < active.sourceRing.shape.inner - outerWheelGap) {
      const upper = rings[rings.indexOf(active.sourceRing) - 1];
      if (!upper) return;
      const siblings = wheelSiblings(upper);
      const before = siblings[siblings.indexOf(anchor.entry) + 1]?.key ?? null;
      return { move: { key, parent: upper.anchor?.entry.key ?? null, before }, target: anchor, hint: '移出一级' };
    }
    if (!target || !targetRing || target === active.source) return;

    const enters = target.entry.children && radius >= target.sector.caption;
    const parent = enters ? target.entry.key : targetRing.anchor?.entry.key ?? null;
    const destination = parent === null ? null : findWheelEntry(entries, parent);
    if (destination?.entry === active.source.entry || destination?.ancestors.includes(active.source.entry)) return;
    if (enters) {
      return { move: { key, parent, before: null }, target, hint: '移入子菜单', expand: targetRing };
    }

    const siblings = wheelSiblings(targetRing);
    const targetIndex = siblings.indexOf(target.entry);
    const after = targetRing === active.sourceRing
      ? siblings.indexOf(active.source.entry) < targetIndex
      : Math.sin(Math.atan2(dy, dx) - target.sector.angle) > 0;
    let before = siblings[targetIndex + Number(after)]?.key ?? null;
    if (before === key) before = siblings[targetIndex + 2]?.key ?? null;
    return { move: { key, parent, before }, target, hint: '在这里排列' };
  }

  function renderMovedEntry(key: string) {
    const location = findWheelEntry(entries, key);
    if (!location) return;
    trimRings(0);
    const shape = wheelShape(entries.length, compact);
    if (!fitWheel(shape)) {
      showContextMenu(container, centerX, centerY, asContextMenuItems(entries), keyboard);
      return;
    }
    let ring = addRing(entries, shape);
    for (const parent of location.ancestors) {
      const anchor = ring.buttons.find(item => item.entry === parent);
      const next = anchor && openBranch(ring, anchor, false, false);
      if (!next) break;
      ring = next;
    }
    const control = ring.buttons.find(item => item.entry.key === key);
    if (control) control.button.focus({ preventScroll: true });
    else focusRing(ring);
  }

  function cancelDrag() {
    if (!drag) return;
    drag.source.button.classList.toggle('is-reordering', false);
    drag.drop?.target?.button.classList.toggle('is-reorder-target', false);
    drag.status?.remove();
    drag = undefined;
    clearTimeout(expandOnDrag);
    window.removeEventListener('pointermove', onDragMove, true);
    window.removeEventListener('pointerup', onDragUp, true);
    window.removeEventListener('pointercancel', onDragCancel, true);
    window.removeEventListener('blur', abortDrag);
  }

  function abortDrag() {
    if (drag?.status) suppressNextClick = true;
    cancelDrag();
  }

  function onDragMove(event: PointerEvent) {
    const active = drag;
    if (!active || event.pointerId !== active.pointerId) return;
    if (!(event.buttons & 1)) { abortDrag(); return; }
    if (!active.status && Math.hypot(event.clientX - active.startX, event.clientY - active.startY) < 8) return;
    event.preventDefault();
    event.stopPropagation();
    pointerPosition = { x: event.clientX, y: event.clientY };
    if (!active.status) {
      const status = document.createElement('span');
      status.className = 'fg-wheel-drag-status';
      status.setAttribute('role', 'status');
      wheel.appendChild(status);
      active.status = status;
      active.source.button.classList.toggle('is-reordering', true);
    }
    const drop = findDrop(active, event.clientX, event.clientY);
    if (active.drop?.target !== drop?.target || active.drop?.expand !== drop?.expand) {
      clearTimeout(expandOnDrag);
      active.drop?.target?.button.classList.toggle('is-reorder-target', false);
      drop?.target?.button.classList.toggle('is-reorder-target', true);
      if (drop?.expand && drop.target) {
        const ring = drop.expand, target = drop.target;
        expandOnDrag = setTimeout(() => openBranch(ring, target, false, false), hoverDelay);
      }
    }
    active.drop = drop;
    active.status.textContent = drop?.hint ?? '拖到选项以调整位置';
  }

  function onDragUp(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const moving = !!drag.status;
    const drop = drag.drop;
    cancelDrag();
    if (!moving) return;
    event.preventDefault();
    event.stopPropagation();
    suppressNextClick = true;
    if (drop && moveWheelEntry(entries, drop.move)) {
      order.save(drop.move);
      renderMovedEntry(drop.move.key);
    }
  }

  function onDragCancel(event: PointerEvent) {
    if (event.pointerId === drag?.pointerId) abortDrag();
  }

  function addRing(items: WheelEntry[], shape: WheelShape, anchor?: WheelButton): WheelRing {
    const element = document.createElement('div');
    element.className = 'fg-node-wheel-ring';
    element.setAttribute('role', 'presentation');
    element.style.setProperty('--fg-wheel-diameter', `${2 * (shape.outer + 1)}px`);
    const sweep = shape.sweep / items.length;
    const ring: WheelRing = { element, buttons: [], shape, anchor };
    const start = shape.angle - shape.sweep / 2 + sweep / 2;
    ring.buttons = items.map((entry, index) => {
      const { item, icon } = entry;
      const angle = start + index * sweep;
      const sector = { ...shape, angle, sweep };
      const x = Math.cos(angle) * shape.caption;
      const y = Math.sin(angle) * shape.caption;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'fg-node-wheel-item';
      button.tabIndex = -1;
      const control: WheelButton = { button, entry, sector, x, y };
      button.disabled = !!item.disabled || !(item.action || entry.children?.length);
      button.classList.toggle('is-destructive', !!item.destructive);
      button.setAttribute('role', 'menuitem');
      button.title = item.label ?? '';
      if (entry.children) {
        button.setAttribute('aria-haspopup', 'menu');
        button.setAttribute('aria-expanded', 'false');
      }
      button.style.setProperty('--fg-wheel-x', `${x}px`);
      button.style.setProperty('--fg-wheel-y', `${y}px`);
      button.style.setProperty('--fg-wheel-sector', wheelSectorPath(sector, 0.018));
      const captionHeight = item.swatch || icon ? 48 : 28;
      const radialRoom = 2 * Math.min(shape.caption - shape.inner, shape.outer - shape.caption) - 4;
      const tangentRoom = 2 * shape.caption * Math.sin(Math.min(Math.PI / 2, sweep / 2)) - 8;
      const horizontal = Math.abs(Math.cos(angle));
      const vertical = Math.abs(Math.sin(angle));
      const radialWidth = (radialRoom - captionHeight * vertical) / Math.max(horizontal, 0.01);
      const tangentWidth = (tangentRoom - captionHeight * horizontal) / Math.max(vertical, 0.01);
      const captionWidth = Math.max(34, Math.min(76, radialWidth, tangentWidth));
      button.style.setProperty('--fg-wheel-caption-width', `${captionWidth}px`);

      const caption = document.createElement('span');
      caption.className = 'fg-node-wheel-caption';
      if (item.swatch) caption.appendChild(menuSwatch(item.swatch));
      else if (icon && nodeWheelIcons[icon]) {
        caption.innerHTML = `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${nodeWheelIcons[icon]}</svg>`;
      }
      const label = document.createElement('span');
      label.className = 'fg-node-wheel-label';
      label.textContent = item.label ?? '';
      caption.appendChild(label);
      button.appendChild(caption);
      const queueHover = (event: PointerEvent) => {
        if (event.pointerType === 'touch' || button.disabled || drag) return;
        pointerPosition = { x: event.clientX, y: event.clientY };
        if (hovered === button || (deferHoverUntilMove?.x === event.clientX && deferHoverUntilMove?.y === event.clientY)) return;
        deferHoverUntilMove = undefined;
        clearTimeout(hoverTimer);
        hovered = button;
        hoverTimer = setTimeout(() => {
          if (currentMenu === wheel) openBranch(ring, control, false);
        }, hoverDelay);
      };
      button.addEventListener('pointerenter', queueHover);
      button.addEventListener('pointermove', queueHover);
      button.addEventListener('pointerleave', () => {
        if (hovered !== button) return;
        hovered = null;
        clearTimeout(hoverTimer);
      });
      let touchPressed = false;
      button.addEventListener('pointercancel', () => { touchPressed = false; });
      button.addEventListener('pointerdown', event => {
        touchPressed = event.pointerType === 'touch';
        if (event.button !== 0 || touchPressed || button.disabled) return;
        cancelDrag();
        clearTimeout(hoverTimer);
        suppressNextClick = false;
        drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, sourceRing: ring, source: control };
        window.addEventListener('pointermove', onDragMove, { capture: true, passive: false });
        window.addEventListener('pointerup', onDragUp, true);
        window.addEventListener('pointercancel', onDragCancel, true);
        window.addEventListener('blur', abortDrag);
      });
      button.onclick = () => {
        const touch = touchPressed;
        touchPressed = false;
        if (button.disabled) return;
        clearTimeout(hoverTimer);
        if (entry.children) {
          const depth = rings.indexOf(ring);
          if (touch && depth >= 0 && rings[depth + 1]?.anchor === control) {
            trimRings(depth + 1);
            button.focus({ preventScroll: true });
            return;
          }
          openBranch(ring, control, true);
          return;
        }
        activateContextMenuItem(item, keyboard);
      };
      element.appendChild(button);
      return control;
    });
    rings.push(ring);
    wheel.appendChild(element);
    return ring;
  }

  wheel.addEventListener('keydown', event => {
    clearTimeout(hoverTimer);
    if (drag && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      abortDrag();
      return;
    }
    if (rings.length > 1 && (event.key === 'Escape' || event.key === 'Backspace')) {
      event.preventDefault();
      event.stopPropagation();
      const anchor = rings[rings.length - 1].anchor;
      trimRings(rings.length - 1);
      anchor?.button.focus({ preventScroll: true });
      return;
    }
    if (dismissMenuWithKeyboard(event, keyboard)) return;
    const enabled = rings.flatMap(ring => ring.buttons).filter(item => !item.button.disabled);
    const current = enabled.find(item => item.button === document.activeElement) ?? enabled[0];
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const activeRing = rings.find(ring => ring.buttons.includes(current)) ?? rings[rings.length - 1];
      const buttons = activeRing.buttons.filter(item => !item.button.disabled);
      (event.key === 'Home' ? buttons[0] : buttons[buttons.length - 1])?.button.focus();
      return;
    }
    const direction = wheelDirections[event.key];
    if (!direction || !current) return;
    event.preventDefault();
    let next: WheelButton | undefined;
    let alignment = 0;
    let distance = Infinity;
    for (const item of enabled) {
      if (item === current) continue;
      const dx = item.x - current.x, dy = item.y - current.y;
      const length = Math.hypot(dx, dy);
      const score = (dx * direction[0] + dy * direction[1]) / length;
      if (score <= 0 || score < alignment || (score === alignment && length >= distance)) continue;
      next = item;
      alignment = score;
      distance = length;
    }
    next?.button.focus();
  });
  wheel.addEventListener('click', event => {
    if (!suppressNextClick || event.detail === 0) return;
    suppressNextClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);
  closeContextMenu();
  mountContextMenu(container, wheel, keyboard, () => { clearTimeout(hoverTimer); cancelDrag(); });
  focusRing(addRing(entries, primaryShape));
}

export const showNodeContextWheel = showContextWheel;

export function showActionWheel(
  container: HTMLElement,
  x: number,
  y: number,
  items: ContextMenuItem[],
  options: ContextWheelOptions = {},
) {
  const labeled = items.filter(item => !item.separator && item.label);
  if (!labeled.length) return;
  const enabled = labeled.filter(item => !item.disabled && (item.action || item.children?.length));
  if (!enabled.length) {
    showContextMenu(container, x, y, items, menuKeyboard({ label: '操作', ...options }));
    return;
  }
  const primary = enabled.length > 7 ? enabled.slice(0, 6) : [];
  const commands = primary.map(item => ({ icon: item.icon ?? (item.children?.length ? 'next' : ''), item }));
  const remaining = items.filter(item => !primary.includes(item));
  showContextWheel(container, x, y, commands, remaining, items, { label: '操作', ...options });
}
