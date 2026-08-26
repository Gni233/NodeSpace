import { V } from "./layout-constants";
import { confirmAction } from './toast';
import { vaultDisplayName } from './vault';
export interface TabCallbacks {
  onSwitchTab: (fileName: string) => void;
  onCloseTab: (fileName: string) => void;
  onNewTab: () => void;
  onReorder?: (from: number, to: number) => void;
  onSplitTab?: (fileName: string) => void;
  onToggleSplit?: () => void;
}

export function createTabBar(container: HTMLElement, callbacks: TabCallbacks) {
  const tabBar = document.createElement('div');
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

  // 自定义拖拽状态
  let dragEl: HTMLElement | null = null;
  let dragClone: HTMLElement | null = null;
  let dragSrcIdx = -1;
  let dragSrcPaneIdx = -1;
  let dragStartX = 0;
  let dragOriginLeft = 0;
  let dragMoved = false;

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

      // ── 自定义拖拽排序（限位在标签栏内）──
      tab.onpointerdown = (e) => {
        if ((e.target as HTMLElement).closest('[data-tab-close]')) return;
        if (e.button !== 0) return;
        const ox = e.clientX, oy = e.clientY;
        let started = false;
        let dragCloneRect: DOMRect | null = null;

        const onMove = (ev: PointerEvent) => {
          if (started) {
            if (!dragClone) return;
            dragMoved = true;
            const dx = ev.clientX - dragStartX;
            let nl = dragOriginLeft + dx;
            const barW = tabBar.getBoundingClientRect().width;
            const cw = dragClone.offsetWidth;
            nl = Math.max(0, Math.min(barW - cw, nl));
            dragClone.style.left = nl + 'px';
            dragCloneRect = { left: nl, width: cw } as any;
            const cx = nl + cw / 2;
            // 更新指示线（用缓存 rect 避免每帧全量查询）
            const allTabs = Array.from(tabsContainer.querySelectorAll('[data-tab-idx]')) as HTMLElement[];
            for (const el of allTabs) el.style.borderLeft = '';
            for (const sib of allTabs) {
              const si = parseInt(sib.dataset.tabIdx!);
              if (si === dragSrcIdx) continue;
              const sr = sib.getBoundingClientRect();
              if (cx < sr.left + sr.width / 2) {
                sib.style.borderLeft = `2px solid var(--fg-accent,#5B8FF9)`;
                break;
              }
            }
            return;
          }
          if (Math.abs(ev.clientX - ox) + Math.abs(ev.clientY - oy) < 4) return;
          started = true;
          dragEl = tab; dragSrcIdx = i; dragSrcPaneIdx = paneIdx ?? 0;
          dragMoved = false;
          dragClone = tab.cloneNode(true) as HTMLElement;
          dragClone.style.cssText = tab.style.cssText +
            'position:absolute;z-index:50;pointer-events:none;opacity:0.85;' +
            'box-shadow:0 2px 8px rgba(0,0,0,0.3);';
          const rect = tab.getBoundingClientRect();
          const barRect = tabBar.getBoundingClientRect();
          dragClone.style.left = (rect.left - barRect.left) + 'px';
          dragClone.style.top = (rect.top - barRect.top) + 'px';
          dragClone.style.width = rect.width + 'px';
          dragStartX = ev.clientX;
          dragOriginLeft = rect.left - barRect.left;
          tab.style.opacity = '0.3';
          tabBar.appendChild(dragClone);
        };

        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          if (!started) { tab.click(); return; }
          if (dragClone) { dragClone.remove(); dragClone = null; }
          const allTabs = Array.from(tabsContainer.querySelectorAll('[data-tab-idx]')) as HTMLElement[];
          for (const el of allTabs) el.style.borderLeft = '';
          if (dragEl) { dragEl.style.opacity = '1'; dragEl = null; }
          if (dragMoved && dragCloneRect) {
            let ti = dragSrcIdx;
            const cx = dragCloneRect.left + dragCloneRect.width / 2;
            for (const sib of allTabs) {
              const si = parseInt(sib.dataset.tabIdx!);
              if (si === dragSrcIdx) continue;
              const sr = sib.getBoundingClientRect();
              if (cx < sr.left + sr.width / 2) { ti = si; break; }
              ti = si + 1;
            }
            if (ti !== dragSrcIdx) callbacks.onReorder?.(dragSrcIdx, Math.min(ti, tabs.length - 1));
          }
          dragSrcIdx = -1; dragSrcPaneIdx = -1;
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp, { once: true });
      };
      tab.ondragstart = (e) => e.preventDefault(); // 禁用原生拖拽

      tab.onclick = () => { if (!isActive) callbacks.onSwitchTab(fileName); };

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
      const label = document.createElement('span');
      label.textContent = displayName + (isDirty ? ' \u25CF' : '');
      label.style.cssText = 'max-width:120px;overflow:hidden;text-overflow:ellipsis;flex-shrink:1;';
      if (isDirty) label.style.color = V('--fg-accent', '#5B8FF9');
      label.onclick = (e) => { e.stopPropagation(); if (!isActive) callbacks.onSwitchTab(fileName); };
      tab.appendChild(label);

      // 关闭按钮
      const closeBtn = document.createElement('span');
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
      closeBtn.onclick = async (e) => {
        e.stopPropagation();
        if (isDirty) {
          const confirmed = await confirmAction(`"${displayName}" 有未保存的更改，确定关闭？`);
          if (!confirmed) return;
        }
        callbacks.onCloseTab(fileName);
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

  const renderTabs = (groups: { tabs: string[]; active: string; dirty?: Set<string> }[]) => {
    tabsContainer.innerHTML = '';
    if (splitDivider) { splitDivider.remove(); splitDivider = null; }

    for (let g = 0; g < groups.length; g++) {
      if (g > 0) {
        const div = document.createElement('div');
        div.style.cssText = `width:1px;align-self:stretch;margin:2px 4px;background:${V('--fg-accent','#5B8FF9')};opacity:0.4;flex-shrink:0;`;
        tabsContainer.appendChild(div);
      }
      renderOne(groups[g].tabs, groups[g].active, groups[g].dirty, g);
    }
  };

  return { renderTabs, tabBar };
}
