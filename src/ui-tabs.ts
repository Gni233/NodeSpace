export interface TabCallbacks {
  onSwitchTab: (fileName: string) => void;
  onCloseTab: (fileName: string) => void;
  onNewTab: () => void;
  onReorder?: (from: number, to: number) => void;
  onSplitTab?: (fileName: string) => void;
  onToggleSplit?: () => void;
}

const V = (name: string, fallback: string) => `var(${name},${fallback})`;

export function createTabBar(container: HTMLElement, callbacks: TabCallbacks) {
  const tabBar = document.createElement('div');
  tabBar.style.cssText =
    'display:flex;align-items:center;gap:2px;padding:2px 4px;' +
    'background:transparent;' +
    `border-bottom:1px solid ${V('--fg-border-light', 'rgba(255,255,255,0.08)')};` +
    'overflow:hidden;flex-shrink:0;min-height:32px;';

  const tabsContainer = document.createElement('div');
  tabsContainer.style.cssText =
    'display:flex;align-items:flex-end;gap:4px;flex:1;' +
    'overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;';
  tabBar.appendChild(tabsContainer);

  // 分屏间隔线
  let splitDivider: HTMLDivElement | null = null;

  container.insertBefore(tabBar, container.firstChild);

  // 内建渲染
  const renderOne = (tabs: string[], active: string, dirty?: Set<string>, paneClass?: string) => {
    for (let i = 0; i < tabs.length; i++) {
      const fileName = tabs[i];
      const tab = document.createElement('div');
      const isActive = fileName === active;
      const isDirty = dirty?.has(fileName);
      const displayName = fileName.replace(/\.json$/, '');

      if (paneClass) tab.dataset.pane = paneClass;
      tab.draggable = true;
      tab.style.cssText =
        'display:flex;align-items:center;gap:4px;padding:3px 10px;' +
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

      tab.onclick = () => { if (!isActive) callbacks.onSwitchTab(fileName); };

      // 右键菜单（+ 分屏）
      tab.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const menu = document.createElement('div');
        menu.style.cssText =
          `position:fixed;left:${e.clientX}px;top:${e.clientY}px;z-index:200;` +
          `background:${V('--fg-surface-glass','rgba(40,42,48,0.9)')};` +
          `border:1px solid ${V('--fg-glass-border','rgba(255,255,255,0.15)')};` +
          `border-radius:${V('--fg-radius-sm','6px')};padding:4px 0;min-width:80px;` +
          `font-size:${V('--fg-font-sm','0.8em')};color:${V('--fg-text','#ccc')};` +
          `backdrop-filter:blur(10px);box-shadow:${V('--fg-shadow-md','0 4px 16px rgba(0,0,0,0.3)')};`;
        const mk = (t: string, fn: () => void) => {
          const mi = document.createElement('div'); mi.textContent = t;
          mi.style.cssText = 'padding:3px 8px;cursor:pointer;';
          mi.onmouseenter = () => mi.style.background = V('--fg-button-hover','rgba(255,255,255,0.12)');
          mi.onmouseleave = () => mi.style.background = '';
          mi.onclick = () => { fn(); menu.remove(); }; return mi;
        };
        if (callbacks.onSplitTab) {
          menu.appendChild(mk('分屏', () => callbacks.onSplitTab!(fileName)));
        }
        document.body.appendChild(menu);
        const close = (e2: Event) => { if (!menu.contains(e2.target as Node)) { menu.remove(); clean(); } };
        const clean = () => { document.removeEventListener('click', c); document.removeEventListener('contextmenu', c); };
        const c = close as EventListener;
        setTimeout(() => { document.addEventListener('click', c); document.addEventListener('contextmenu', c); }, 0);
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
      closeBtn.style.cssText =
        `opacity:0;margin-left:auto;width:14px;height:14px;color:${V('--fg-text-muted','rgba(255,255,255,0.4)')};` +
        'font-size:9px;line-height:14px;text-align:center;cursor:pointer;border-radius:3px;flex-shrink:0;' +
        `transition:all var(--fg-transition-fast,0.15s ease);`;
      closeBtn.onmouseenter = () => {
        closeBtn.style.color = '#fff';
        closeBtn.style.background = `var(--fg-accent,#5B8FF9)`;
      };
      closeBtn.onmouseleave = () => {
        closeBtn.style.color = V('--fg-text-muted', 'rgba(255,255,255,0.4)');
        closeBtn.style.background = 'transparent';
      };
      closeBtn.onclick = (e) => { e.stopPropagation(); callbacks.onCloseTab(fileName); };
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
        // 窗格间隔线
        const div = document.createElement('div');
        div.style.cssText = `width:1px;align-self:stretch;margin:2px 4px;background:${V('--fg-accent','#5B8FF9')};opacity:0.4;flex-shrink:0;`;
        tabsContainer.appendChild(div);
      }
      renderOne(groups[g].tabs, groups[g].active, groups[g].dirty);
    }
  };

  return { renderTabs, tabBar };
}
