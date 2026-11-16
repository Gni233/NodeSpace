import { V } from "./layout-constants";
import { confirmAction } from './toast';
import { vaultDisplayName } from './vault';
export interface TabCallbacks {
  onSwitchTab: (fileName: string) => void;
  onCloseTab: (fileName: string) => void;
  onNewTab: () => void;
  onReorder?: (from: number, to: number, paneIndex: number) => void;
  onSplitTab?: (fileName: string) => void;
  onToggleSplit?: () => void;
}

export function createTabBar(container: HTMLElement, callbacks: TabCallbacks) {
  const tabBar = document.createElement('nav');
  tabBar.setAttribute('aria-label', '打开的空间');
  tabBar.className = 'fg-tab-bar';
  tabBar.style.cssText =
    'display:flex;align-items:center;gap:2px;padding:2px 4px;' +
    'background:transparent;' +
    `border-bottom:1px solid ${V('--fg-border-light', 'rgba(255,255,255,0.08)')};` +
    'overflow:hidden;flex-shrink:0;min-height:32px;position:relative;';

  const tabsContainer = document.createElement('div');
  tabsContainer.className = 'fg-tabs';
  tabsContainer.style.cssText =
    'display:flex;align-items:flex-end;gap:4px;flex:1;' +
    'overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;';
  tabBar.appendChild(tabsContainer);

  let splitDivider: HTMLDivElement | null = null;
  container.insertBefore(tabBar, container.firstChild);

  let cancelDrag: (() => void) | null = null;
  const switches = () => Array.from(tabsContainer.querySelectorAll<HTMLButtonElement>('[data-tab-switch]'));
  tabsContainer.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tab = (event.target as HTMLElement).closest<HTMLElement>('[data-tab-idx]');
    if (!tab) return;
    const buttons = switches();
    const current = buttons.findIndex(button => tab.contains(button));
    if (current < 0) return;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    event.preventDefault();
    event.stopPropagation();
    buttons[next]?.focus();
  });

  // 内建渲染
  const renderOne = (tabs: string[], active: string, dirty?: Set<string>, paneIdx?: number) => {
    for (let i = 0; i < tabs.length; i++) {
      const fileName = tabs[i];
      const tab = document.createElement('div');
      const isActive = fileName === active;
      tab.className = 'fg-tab' + (isActive ? ' is-active' : '');
      const isDirty = dirty?.has(fileName);
      const displayName = vaultDisplayName(fileName);

      tab.dataset.tabIdx = String(i);
      tab.dataset.fileName = fileName;
      if (paneIdx != null) tab.dataset.paneIdx = String(paneIdx);
      tab.style.cssText =
        'display:flex;align-items:center;gap:4px;padding:3px 10px;' +
        '-webkit-app-region:no-drag;' +
        'cursor:grab;border-radius:' + V('--fg-radius-md', '10px') + ';' +
        'font-size:' + V('--fg-font-sm', '0.8em') + ';' +
        'white-space:nowrap;flex:1 1 auto;min-width:56px;max-width:200px;user-select:none;' +
        'margin-bottom:2px;' +
        `transition:all var(--fg-transition-fast,0.15s ease);` +
        (isActive
          ? `background:${V('--fg-tab-active-bg', '#3f3f3f')};` +
            `border:1px solid ${V('--fg-tab-active-border', '#7e7e7e')};` +
            `border-bottom:2px solid var(--fg-accent,#5B8FF9);` +
            `color:${V('--fg-text', '#fff')};` +
            'font-weight:600;'
          : `background:transparent;border:1px solid transparent;` +
            `color:${V('--fg-tab-inactive', 'rgba(255,255,255,0.55)')};`);

      // Native click is the sole activation path; a drag suppresses its trailing click.
      let suppressPointerClick = false;
      tab.onpointerdown = (e) => {
        if ((e.target as HTMLElement).closest('[data-tab-close]') || e.button !== 0) return;
        cancelDrag?.();
        suppressPointerClick = false;
        const ox = e.clientX, oy = e.clientY;
        const pointerId = e.pointerId;
        let clone: HTMLElement | null = null;
        let center = ox;
        const siblings = () => Array.from(tabsContainer.querySelectorAll<HTMLElement>('[data-tab-idx]'))
          .filter(el => el.dataset.paneIdx === String(paneIdx ?? 0));
        const cleanup = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onCancel);
          clone?.remove();
          tab.style.opacity = '';
          for (const el of siblings()) el.style.borderLeft = '';
          cancelDrag = null;
        };
        const onMove = (ev: PointerEvent) => {
          if (ev.pointerId !== pointerId) return;
          if (!clone && Math.abs(ev.clientX - ox) + Math.abs(ev.clientY - oy) < 4) return;
          if (!clone) {
            suppressPointerClick = true;
            clone = tab.cloneNode(true) as HTMLElement;
            clone.setAttribute('aria-hidden', 'true');
            clone.inert = true;
            clone.style.cssText = tab.style.cssText + 'position:absolute;z-index:50;pointer-events:none;opacity:.85;';
            clone.style.width = tab.getBoundingClientRect().width + 'px';
            tab.style.opacity = '.3';
            tabBar.appendChild(clone);
          }
          const rect = tab.getBoundingClientRect(), bar = tabBar.getBoundingClientRect();
          const left = Math.max(0, Math.min(bar.width - rect.width, rect.left - bar.left + ev.clientX - ox));
          clone.style.left = left + 'px';
          clone.style.top = (rect.top - bar.top) + 'px';
          center = bar.left + left + rect.width / 2;
          const others = siblings().filter(el => el !== tab);
          for (const el of others) el.style.borderLeft = '';
          const before = others.find(el => { const r = el.getBoundingClientRect(); return center < r.left + r.width / 2; });
          if (before) before.style.borderLeft = '2px solid var(--fg-accent)';
        };
        const onUp = (ev: PointerEvent) => {
          if (ev.pointerId !== pointerId) return;
          const wasDragging = !!clone;
          const bounds = siblings().map(el => el.getBoundingClientRect());
          const insidePane = ev.clientX >= Math.min(...bounds.map(r => r.left))
            && ev.clientX <= Math.max(...bounds.map(r => r.left + r.width));
          const others = siblings().filter(el => el !== tab);
          const to = others.filter(el => { const r = el.getBoundingClientRect(); return center >= r.left + r.width / 2; }).length;
          cleanup();
          if (wasDragging && insidePane && to !== i) callbacks.onReorder?.(i, to, paneIdx ?? 0);
        };
        const onCancel = (ev: PointerEvent) => { if (ev.pointerId === pointerId) cleanup(); };
        cancelDrag = cleanup;
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onCancel);
      };
      tab.ondragstart = (e) => e.preventDefault();

      // 右键菜单（+ 分屏）
      tab.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const menu = document.createElement('div');
        menu.className = 'fg-context-menu fg-tab-context-menu';
        menu.style.cssText =
          `position:fixed;left:${e.clientX}px;top:${e.clientY}px;z-index:200;` +
          `background:${V('--fg-surface-glass','rgba(40,42,48,0.9)')};` +
          `border:1px solid ${V('--fg-glass-border','rgba(255,255,255,0.15)')};` +
          `border-radius:${V('--fg-radius-sm','6px')};padding:4px 0;min-width:80px;` +
          `font-size:${V('--fg-font-sm','0.8em')};color:${V('--fg-text','#ccc')};` +
          `backdrop-filter:blur(var(--fg-glass-blur,12px));box-shadow:${V('--fg-shadow-md','0 4px 16px rgba(0,0,0,0.3)')};`;
        const mk = (t: string, fn: () => void) => {
          const mi = document.createElement('div'); mi.textContent = t;
          mi.className = 'fg-context-menu-item';
          mi.style.cssText = 'padding:3px 8px;cursor:pointer;';
          mi.onmouseenter = () => mi.style.background = V('--fg-button-hover','rgba(255,255,255,0.12)');
          mi.onmouseleave = () => mi.style.background = '';
          mi.onclick = () => { fn(); menu.remove(); }; return mi;
        };
        if (callbacks.onSplitTab) {
          menu.appendChild(mk('分屏', () => callbacks.onSplitTab!(fileName)));
        }
        let activeTabMenuC: EventListener | null = null;
        document.body.appendChild(menu);
        const close = (e2: Event) => { if (!menu.contains(e2.target as Node)) { menu.remove(); clean(); } };
        const clean = () => {
          if (activeTabMenuC) {
            document.removeEventListener('click', activeTabMenuC);
            document.removeEventListener('contextmenu', activeTabMenuC);
          }
        };
        activeTabMenuC = close as EventListener;
        setTimeout(() => {
          if (activeTabMenuC) {
            document.addEventListener('click', activeTabMenuC);
            document.addEventListener('contextmenu', activeTabMenuC);
          }
        }, 0);
      });

      // 标签名
      const label = document.createElement('button');
      label.type = 'button';
      label.className = 'fg-tab-switch';
      label.dataset.tabSwitch = 'true';
      label.setAttribute('aria-label', `打开 ${displayName}${isDirty ? '，未保存' : ''}，窗格 ${(paneIdx ?? 0) + 1}`);
      label.setAttribute('aria-pressed', String(isActive));
      label.title = displayName;
      label.textContent = displayName + (isDirty ? ' \u25CF' : '');
      label.style.cssText = 'max-width:120px;overflow:hidden;text-overflow:ellipsis;flex-shrink:1;';
      if (isDirty) label.style.color = V('--fg-accent', '#5B8FF9');
      label.onclick = (e) => {
        e.stopPropagation();
        if (suppressPointerClick && e.detail !== 0) return;
        if (!isActive) callbacks.onSwitchTab(fileName);
      };
      tab.appendChild(label);

      // 关闭按钮
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'fg-tab-close';
      closeBtn.setAttribute('aria-label', `关闭 ${displayName}，窗格 ${(paneIdx ?? 0) + 1}`);
      closeBtn.textContent = '\u2715';
      closeBtn.title = '关闭页面';
      closeBtn.dataset.tabClose = 'true';
      closeBtn.onpointerdown = (e) => e.stopPropagation();
      closeBtn.style.cssText =
        `opacity:0;margin-left:auto;width:14px;height:14px;color:${V('--fg-text-muted','rgba(255,255,255,0.4)')};` +
        `font-size:${V('--fg-font-xxs', '0.65em')};line-height:14px;text-align:center;cursor:pointer;border-radius:${V('--fg-radius-sm','6px')};flex-shrink:0;` +
        `transition:all var(--fg-transition-fast,0.15s ease);`;
      closeBtn.onmouseenter = () => {
        closeBtn.style.color = '#fff';
        closeBtn.style.background = `var(--fg-accent,#5B8FF9)`;
      };
      closeBtn.onmouseleave = () => {
        closeBtn.style.color = V('--fg-text-muted', 'rgba(255,255,255,0.4)');
        closeBtn.style.background = 'transparent';
      };
      let closing = false;
      closeBtn.onclick = async (e) => {
        e.stopPropagation();
        if (closing) return;
        closing = true;
        if (isDirty) {
          const confirmed = await confirmAction(`"${displayName}" 有未保存的更改，确定关闭？`);
          if (!confirmed) { closing = false; closeBtn.focus(); return; }
        }
        // The confirmation dialog may have owned focus; restore the tab anchor
        // before the callback rebuilds the bar and selects its surviving neighbour.
        closeBtn.focus({ preventScroll: true });
        callbacks.onCloseTab(fileName);
        closing = false;
      };
      tab.appendChild(closeBtn);
      tab.onmouseenter = () => {
        closeBtn.style.opacity = '1';
        if (!isActive) tab.style.background = V('--fg-sidebar-item-hover', 'rgba(0,0,0,0.06)');
      };
      tab.onmouseleave = () => {
        closeBtn.style.opacity = '0';
        if (!isActive) tab.style.background = 'transparent';
      };

      tabsContainer.appendChild(tab);
    }
  };

  const renderTabs = (groups: { tabs: string[]; active: string; dirty?: Set<string>; paneIndex?: number }[]) => {
    const focused = document.activeElement as HTMLElement | null;
    const focusedTab = focused?.closest<HTMLElement>('[data-tab-idx]');
    const restore = focusedTab && tabsContainer.contains(focusedTab) ? {
      fileName: focusedTab.dataset.fileName, pane: focusedTab.dataset.paneIdx,
      close: focused?.hasAttribute('data-tab-close'), index: switches().findIndex(button => focusedTab.contains(button)),
    } : null;
    cancelDrag?.();
    tabsContainer.innerHTML = '';
    if (splitDivider) { splitDivider.remove(); splitDivider = null; }

    for (let g = 0; g < groups.length; g++) {
      if (g > 0) {
        const div = document.createElement('div');
        div.style.cssText = `width:1px;align-self:stretch;margin:2px 4px;background:${V('--fg-accent','#5B8FF9')};opacity:0.4;flex-shrink:0;`;
        tabsContainer.appendChild(div);
      }
      renderOne(groups[g].tabs, groups[g].active, groups[g].dirty, groups[g].paneIndex ?? g);
    }
    if (restore) {
      const tabs = Array.from(tabsContainer.querySelectorAll<HTMLElement>('[data-tab-idx]'));
      const same = tabs.find(tab => tab.dataset.fileName === restore.fileName && tab.dataset.paneIdx === restore.pane);
      const target = same?.querySelector<HTMLButtonElement>(restore.close ? '[data-tab-close]' : '[data-tab-switch]')
        ?? switches()[Math.min(restore.index, switches().length - 1)];
      if (target) target.focus({ preventScroll: true });
      else { tabBar.tabIndex = -1; tabBar.focus({ preventScroll: true }); }
    }
    requestAnimationFrame(() => {
      const activeTab = tabsContainer.contains(document.activeElement)
        ? (document.activeElement as HTMLElement).closest<HTMLElement>('[data-tab-idx]')
        : tabsContainer.querySelector<HTMLElement>('.fg-tab.is-active');
      if (!activeTab) return;
      const left = activeTab.offsetLeft;
      const right = left + activeTab.offsetWidth;
      if (left < tabsContainer.scrollLeft) tabsContainer.scrollLeft = left;
      else if (right > tabsContainer.scrollLeft + tabsContainer.clientWidth) {
        tabsContainer.scrollLeft = Math.max(0, right - tabsContainer.clientWidth);
      }
    });
  };

  return { renderTabs, tabBar };
}
