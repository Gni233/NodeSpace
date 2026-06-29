import * as d3 from 'd3';
(window as any).d3 = d3;

import { sharedState } from './shared-state';
import { createStorage, GraphData, GraphSettings } from './data/storage';
import { createSimManager } from './graph-sim';
import { setupCanvasEvents } from './ui-events';
import { showContextMenu } from './ui-contextmenu';
import { createEditPanel } from './ui-edit';
import { buildSettings } from './ui-settings';
import { getTheme, applyThemeVars, getAccentColorsForTheme, ThemeConfig } from './theme';
import { createSidebar } from './ui-sidebar';
import { createTabBar } from './ui-tabs';
import { openFolder, restoreFolder, listFileTree, flatFilePaths, readGraphFile, writeGraphFile, deleteFile, renameFile } from './file-system';
import { saveFolderHandle, loadFolderHandle, clearFolderHandle } from './folder-store';
import { isCapacitor, importFilesMobile, pickDirectoryAndImport, listFilesMobile, readFileMobile, writeFileMobile, deleteFileMobile, downloadApk, downloadReleaseApk, installApk } from './fs-mobile';
import { safPickDirectory, safRestoreDirectory, safListFiles, safReadFile, safWriteFile, safDeleteFile, safIsAvailable } from './saf-bridge';
import { isHarmonyOS } from './utils/platform';
import { listFilesHarmony, readFileHarmony, writeFileHarmony, deleteFileHarmony, importFilesHarmony } from './fs-harmony';
import { safePrompt } from './dialog';

import { DEMO_DATA } from './demo-data';
import { BlurFilter, Container, Graphics, Text } from 'pixi.js';
import { showMedia, positionMedia, hideMedia, isExpanded, clearAllMedia } from './media-nodes';
import { createSettingsPanel } from './settings-panel';
import { UndoManager } from './undo-redo';
import { showToast, confirmAction } from './toast';
import { startNodeAnimation } from './utils/animate-nodes';
import { EASING, DURATION } from './utils/easing';
import { createPaneState, PANE_LEFT, PANE_RIGHT, PaneState } from './pane-state';
import { PaneManager, PaneExternals } from './pane-manager';
import { createMultiPaneLayout, MultiPaneDOM } from './dual-pane-layout';
import { SIDEBAR_LEFT, SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_MIN_WIDTH, sidebarExpandedLeft, sidebarCollapsedLeft, getResponsiveSidebarWidth, Z_CANVAS, Z_LOADING, Z_FLOATING_UI, Z_MEDIA_OVERLAY, Z_EDIT_PANEL, Z_SELECTION_BOX, Z_SETTINGS_PANEL, Z_DROPDOWN, Z_CONTEXT_MENU, Z_WINDOW_CONTROLS, Z_STATS, Z_TOAST, WIN_CONTROLS_WIDTH, LAYOUT_ANIM_DURATION, SEARCH_MOVE_DURATION, FIT_ALL_DURATION } from './layout-constants';
(window as any).__triggerSave = () => {};
import { createPixiApp, PixiLayers } from './pixi-app';
import { createNodeSprite, updateNodePosition, applyNodeVisual, getHeadingColor, getSpectrumColor, getNarrowSpectrumColor, NodeSprite, NodeVisualState, setNodeFontFamily } from './pixi-nodes';
import { updateEdges } from './pixi-edges';
import { updateGroups } from './pixi-groups';
import { updateGrid, clearGridCache } from './pixi-grid';

const DEFAULT_SETTINGS: GraphSettings = {
  linkDist: 120, labelSize: 18, charge: -100, linkStr: 0.3,
  collideR: 10, centerS: 0.02, groupBound: 0.8,
  heatingTime: 2, alphaTarget: 0.3, editPanelOpacity: 0.9,
  useRAFL: true, nodeExpand: 8, lineExpand: 6,
  showGLabels: true, glMin: 10, glMax: 28,
  gridVis: true, gridMode: 'dot' as 'line' | 'dot', axisVis: false, axisTicks: false, gridSp: 30, layoutMode: 'default', gridSnap: false, partialGridSnap: false, nodeColorStyle: 'spectrum-narrow', fontFamily: '"SiYuan Songti", serif',
  ar: 0.75, graphTheme: 'nord-dark', focusMode: false, glowAppearance: true, gridWidth: 0.5, categoryLayout: false,
  edgeColorGradient: false, edgeWidthByLevel: false,
};

async function main() {
  const appEl = document.getElementById('app');
  if (!appEl) return;

  // CSS variable helper for inline styles (fallback for pre-theme state)
  const V = (name: string, fallback: string) => `var(${name},${fallback})`;

  // ===== 布局：全屏画布 + 玻璃悬浮 UI =====
  const appShell = document.createElement('div');
  appShell.style.cssText = 'position:relative;width:100vw;height:100vh;overflow:hidden;';
  appEl.appendChild(appShell);

  // 玻璃效果现在通过 CSS 类 .fg-glass 实现，定义在 index.html 中
  // 所有 UI 组件使用 CSS 变量 var(--fg-xxx)，由 applyThemeVars() 统一设置

  // --- 窗口控制按钮（仅 Electron 桌面端）---
  const isElectron = !!(window as any).electronAPI;
  const floatingRight = isElectron ? `${WIN_CONTROLS_WIDTH + 6}px` : '6px';

  if (isElectron) {
    const winCtrls = document.createElement('div');
    winCtrls.style.cssText = `position:absolute;top:4px;right:6px;z-index:${Z_WINDOW_CONTROLS};display:flex;gap:4px;`;

    function makeWinBtn(label: string, hoverBg: string) {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.className = 'fg-glass';
      btn.style.cssText = 'width:30px;height:26px;border:none;display:flex;align-items:center;justify-content:center;font-size:13px;line-height:1;cursor:pointer;padding:0;transition:background 0.15s;border-radius:6px;';
      btn.addEventListener('mouseenter', () => { btn.style.background = hoverBg; });
      btn.addEventListener('mouseleave', () => { btn.style.background = ''; });
      return btn;
    }

    const btnMin = makeWinBtn('\u2500', 'rgba(255,255,255,0.12)'); // ─
    const btnMax = makeWinBtn('\u25A1', 'rgba(255,255,255,0.12)'); // □
    const btnClose = makeWinBtn('\u2715', 'rgba(232,68,68,0.85)'); // ✕

    const api = (window as any).electronAPI;
    btnMin.addEventListener('click', () => api.minimizeWindow());
    btnMax.addEventListener('click', () => api.maximizeWindow());
    btnClose.addEventListener('click', () => api.closeWindow());
    api.onMaximizeChange((maximized: boolean) => {
      btnMax.textContent = maximized ? '\u25A3' : '\u25A1'; // ▣ / □
    });

    winCtrls.appendChild(btnMin);
    winCtrls.appendChild(btnMax);
    winCtrls.appendChild(btnClose);
    appShell.appendChild(winCtrls);
  }

  // --- 浮动顶栏（标签 + 搜索 + 操作）---
  const floatingTop = document.createElement('div');
  floatingTop.className = 'fg-glass';
  floatingTop.className = 'fg-glass' + (isElectron ? ' fg-drag-region' : '');
  floatingTop.style.cssText = `position:absolute;left:${sidebarExpandedLeft()}px;top:6px;right:${floatingRight};z-index:${Z_FLOATING_UI};display:flex;flex-direction:column;gap:4px;padding:4px 8px 6px 8px;transition:left 0.25s ease;`;
  appShell.appendChild(floatingTop);

  // --- 标签栏 ---
  let renderTabs: (groups: { tabs: string[]; active: string; dirty?: Set<string> }[]) => void;
  const tabBarInit = createTabBar(floatingTop, {
    onSwitchTab: (fileName) => {
      if (!splitActive) { switchTab(fileName); return; }
      // 找到该标签所属的窗格索引
      let targetPaneIdx = PANE_LEFT;
      if (openTabs.includes(fileName)) targetPaneIdx = PANE_LEFT;
      else if (pane1.openTabs.includes(fileName)) targetPaneIdx = PANE_RIGHT;
      else {
        for (let i = 1; i < extraPanes.length; i++) {
          if (extraPanes[i].openTabs.includes(fileName)) { targetPaneIdx = i + 1; break; }
        }
      }
      // 切换到目标窗格
      if (focusedPaneIndex !== targetPaneIdx) switchFocusedPane(targetPaneIdx);
      // 打开标签（若尚未激活）
      if (targetPaneIdx === PANE_LEFT) {
        if (activeTab !== fileName) {
          if (saveTimeout) clearTimeout(saveTimeout);
          writeGraphData(activeTab, graph);
          activeTab = fileName; loadGraphData(fileName);
        }
      } else {
        const ep = extraPanes[targetPaneIdx - 1];
        if (ep && ep.activeTab !== fileName) {
          if (ep.saveTimeout) clearTimeout(ep.saveTimeout);
          writeGraphData(ep.activeTab, ep.graph);
          loadGraphForPane(ep, fileName);
        }
      }
      renderAllTabs(); persistTabs(); draw();
    },
    onCloseTab: (fileName) => {
      if (splitActive && !openTabs.includes(fileName)) {
        // 找到该标签所属的额外窗格
        let targetEpIdx = -1;
        for (let i = 0; i < extraPanes.length; i++) {
          if (extraPanes[i].openTabs.includes(fileName)) { targetEpIdx = i; break; }
        }
        if (targetEpIdx >= 0) {
          const ep = extraPanes[targetEpIdx];
          if (ep.openTabs.length <= 1) {
            // 最后一个标签 → 关闭该分屏
            if (targetEpIdx === 0) splitActive = false; // pane1 关闭则隐藏分屏
            removeSplitPane(targetEpIdx);
            renderAllTabs(); persistTabs(); draw();
            return;
          }
          if (ep.saveTimeout) clearTimeout(ep.saveTimeout);
          if (fileName === ep.activeTab) writeGraphData(fileName, ep.graph);
          ep.openTabs = ep.openTabs.filter(t => t !== fileName);
          if (fileName === ep.activeTab) { ep.activeTab = ep.openTabs[ep.openTabs.length - 1]; loadGraphForPane(ep, ep.activeTab); }
        }
      } else {
        closeTab(fileName);
      }
      renderAllTabs();
      persistTabs();
      draw();
    },
    onSplitTab: (fileName) => {
      if (!splitActive) {
        splitActive = true;
        pane1.openTabs = [fileName];
        pane1.activeTab = fileName;
        dualPane.paneContainers[PANE_RIGHT].style.display = '';
        if (dualPane.dividers.length > 0) dualPane.dividers[0].style.display = '';
        dualPane.layoutPanes();
        window.dispatchEvent(new CustomEvent('pane-resize'));
        // 懒加载：确保右窗格 pixi 和 sim 就绪后再加载数据
        const initAndLoad = async () => {
          if (!extraPixis[0]) {
            extraPixis[0] = await createPixiApp(pane1Container);
            pixi1 = extraPixis[0];
            pixi1.viewport.on('moved', () => { if (readyToDraw) draw(); });
            pixi1.viewport.on('zoomed-end', () => { if (readyToDraw) draw(); });
            extraPanes[0].pixi = extraPixis[0];
            // extraSims[0] 已由 simManager1 填充，不重复创建（修复 Issue #2）
            // simManager1.initSim() 在 loadGraphDataPane1 中调用
            // 绑定 pane1 的 canvas 事件（修复 Issue #1）
            pane1.pixi = extraPixis[0];
            pixi1.onContextRestored = () => { simManager1.initSim(); draw(); };
            setupCanvasEvents(pixi1.app.canvas as any, bindPaneEvents(
              pane1, pixi1, simManager1, pane1NodeSprites, { v: null }
            ));
          }
          await loadGraphDataPane1(fileName);
          dualPane.layoutPanes();
          extraPixis[0]!.viewport.resize(pane1Container.clientWidth, pane1Container.clientHeight);
          extraPixis[0]!.app.renderer.resize(pane1Container.clientWidth, pane1Container.clientHeight);
          switchFocusedPane(PANE_RIGHT);
          draw();
        };
        initAndLoad();
      } else {
        // 已分屏 → 右键"分屏"创建新窗格（等比例扩展）
        addSplitPane(fileName);
      }
      renderAllTabs();
    },
    onNewTab: () => { createNewTab(); },
    onToggleSplit: () => {
      if (splitActive) {
        splitActive = false;
        dualPane.paneContainers[PANE_RIGHT].style.display = 'none';
        for (const d of dualPane.dividers) d.style.display = 'none';
        dualPane.paneContainers[PANE_LEFT].style.width = '100%';
        dualPane.paneContainers[PANE_LEFT].style.left = '0';
        window.dispatchEvent(new CustomEvent('pane-resize'));
        if (focusedPaneIndex === PANE_RIGHT) switchFocusedPane(PANE_LEFT);
      } else {
        createNewTab();
      }
      renderAllTabs();
    },
    onReorder: (from, to) => {
      const ts = focusedPaneIndex === PANE_RIGHT ? pane1 : { openTabs, activeTab, dirtyTabs, saveTimeout };
      const item = (ts as any).openTabs.splice(from, 1)[0];
      (ts as any).openTabs.splice(to, 0, item);
      renderAllTabs();
      persistTabs();
    },
  });
  renderTabs = tabBarInit.renderTabs;

  // --- 搜索栏 ---
  const searchRow = document.createElement('div');
  searchRow.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;flex-shrink:0;';
  const searchLabel = document.createElement('span');
  searchLabel.textContent = '搜索:';
  searchLabel.style.cssText = `font-size:${V('--fg-font-sm', '0.84em')};color:${V('--fg-text-muted', '#999')};flex-shrink:0;`;
  searchRow.appendChild(searchLabel);
  const fieldSelect = document.createElement('select');
  fieldSelect.style.cssText = `font-size:${V('--fg-font-sm', '0.8em')};`;
  ['名称', '标签', '内容'].forEach((t, i) => { const o = document.createElement('option'); o.value = ['name', 'tags', 'note'][i]; o.textContent = t; fieldSelect.appendChild(o); });
  searchRow.appendChild(fieldSelect);
  const matchModeSelect = document.createElement('select');
  matchModeSelect.style.cssText = `font-size:${V('--fg-font-sm', '0.8em')};`;
  ['包含', '开头', '结尾', '模糊'].forEach((t, i) => { const o = document.createElement('option'); o.value = ['contains', 'startsWith', 'endsWith', 'fuzzy'][i]; o.textContent = t; matchModeSelect.appendChild(o); });
  searchRow.appendChild(matchModeSelect);
  const modeSelect = document.createElement('select');
  modeSelect.style.cssText = `font-size:${V('--fg-font-sm', '0.8em')};`;
  ['高亮', '仅显示'].forEach((t, i) => { const o = document.createElement('option'); o.value = ['highlight', 'show'][i]; o.textContent = t; modeSelect.appendChild(o); });
  searchRow.appendChild(modeSelect);
  const searchInput = document.createElement('input');
  searchInput.type = 'text'; searchInput.placeholder = '搜索...';
  searchInput.style.cssText = `flex:1;min-width:80px;font-size:${V('--fg-font-sm', '0.8em')};padding:2px 6px;`;
  searchRow.appendChild(searchInput);
  const searchStatus = document.createElement('span');
  searchStatus.style.cssText = `font-size:${V('--fg-font-xs', '0.72em')};color:${V('--fg-danger','#e03030')};display:none;white-space:nowrap;`;
  searchRow.appendChild(searchStatus);

  // --- 主要操作按钮行（始终可见）---
  const primaryRow = document.createElement('div');
  primaryRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;align-items:center;flex-shrink:0;';
  floatingTop.appendChild(primaryRow);

  // --- 操作栏（折叠区：低频操作）---
  const controlsDetails = document.createElement('details');
  const controlsSum = document.createElement('summary');
  controlsSum.textContent = '更多操作';
  controlsSum.style.cssText = `font-size:${V('--fg-font-sm', '0.84em')};cursor:pointer;opacity:0.6;padding:2px 0;`;
  controlsDetails.appendChild(controlsSum);
  const controlsDiv = document.createElement('div');
  controlsDiv.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:4px 0;';
  // 搜索栏收入更多操作
  controlsDiv.appendChild(searchRow);
  // 中间行：集合搜索 + 旋转 + 适应
  const controlsRow2 = document.createElement('div');
  controlsRow2.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;';
  controlsDetails.appendChild(controlsDiv);
  floatingTop.appendChild(controlsDetails);

  // --- 分屏布局 ---
  const dualPane: MultiPaneDOM = createMultiPaneLayout(appShell);
  const pixiContainer = dualPane.paneContainers[PANE_LEFT]; // pane 0 保持原名兼容
  const pane1Container = dualPane.paneContainers[PANE_RIGHT];

  // 统计栏
  const statsEl = document.createElement('div');
  statsEl.style.cssText = `position:fixed;right:10px;bottom:4px;z-index:${Z_STATS};font-size:${V('--fg-font-xs', '0.72em')};color:${V('--fg-text-muted','#aaa')};pointer-events:none;`;
  document.body.appendChild(statsEl);

  // 加载遮罩
  const loadingOverlay = document.createElement('div');
  loadingOverlay.style.cssText = `position:absolute;inset:0;z-index:${Z_LOADING};background:rgba(0,0,0,0.3);display:none;align-items:center;justify-content:center;font-size:1.2em;color:${V('--fg-text-muted','#999')};`;
  loadingOverlay.textContent = '加载中...';
  appShell.appendChild(loadingOverlay);

  // 多媒体覆盖层容器
  const mediaOverlayContainer = document.createElement('div');
  mediaOverlayContainer.style.cssText = `position:fixed;top:0;left:0;z-index:${Z_MEDIA_OVERLAY};pointer-events:none;`;
  document.body.appendChild(mediaOverlayContainer);

  // PixiJS 初始化（异步）
  let pixi: PixiLayers | null = null;
  let pixi1: PixiLayers | null = null;
  const pixiReady = createPixiApp(pixiContainer).then(p => {
    pixi = p;
    p.onContextRestored = () => { simManager.initSim(); draw(); };
    return p;
  });

  // 框选矩形（圆角虚线 + 半透明填充）
  const selectionBox = document.createElement('div');
  selectionBox.style.cssText = `position:absolute;border:2px dashed ${V('--fg-warning','#F59E0B')};background:${V('--fg-warning-glass','rgba(245,158,11,0.08)')};display:none;pointer-events:none;z-index:${Z_SELECTION_BOX};border-radius:${V('--fg-radius-sm','6px')};`;
  appShell.appendChild(selectionBox);

  // --- 设置折叠区 ---
  const settingsDet = document.createElement('details');
  const settingsSum = document.createElement('summary');
  settingsSum.textContent = '图区自定义';
  settingsSum.style.cssText = `font-size:${V('--fg-font-sm', '0.84em')};cursor:pointer;opacity:0.7;padding:4px 0;`;
  settingsDet.appendChild(settingsSum);
  const setDiv = document.createElement('div');
  setDiv.style.cssText = 'padding:2px 0 6px 0;';
  settingsDet.appendChild(setDiv);
  settingsDet.className = 'fg-glass';
  settingsDet.style.cssText = `position:absolute;left:${sidebarExpandedLeft()}px;right:${floatingRight};bottom:6px;z-index:${Z_FLOATING_UI};max-height:40vh;overflow-y:auto;padding:6px 12px;`;
  appShell.appendChild(settingsDet);

  // --- 主题应用函数 ---
  // 通过 CSS 变量统一控制所有 UI 组件的颜色，无需逐元素 querySelectorAll
  // 当前主题的强调色（用于节点选中高亮）
  let themeAccentColor = 0x5B8FF9;
  let themeAccentAltColor = 0xF59E0B;

  // pane 0 自己的强调色缓存（不随 UI 聚焦切换而改变）
  let _pane0AccentColor = 0x5B8FF9;
  let _pane0AccentAltColor = 0xF59E0B;

  /** 仅设置 UI 主题（CSS 变量 + body 背景），不干涉两窗格各自的画布背景 */
  const applyUIToFocusedPane = (graphThemeName: string) => {
    const t = getTheme(graphThemeName);
    applyThemeVars(document.documentElement, t);
    document.body.style.background = t.canvasBackground;
    const accentHex = getComputedStyle(document.documentElement).getPropertyValue('--fg-accent').trim();
    const warningHex = getComputedStyle(document.documentElement).getPropertyValue('--fg-warning').trim();
    const acc = parseInt(accentHex.replace('#', ''), 16) || 0x5B8FF9;
    const alt = parseInt(warningHex.replace('#', ''), 16) || 0xF59E0B;
    themeAccentColor = acc; themeAccentAltColor = alt;
    // 保存到对应窗格（各自保留，供 renderPane 读取）
    if (focusedPaneIndex === PANE_RIGHT) {
      pane1.themeAccentColor = acc; pane1.themeAccentAltColor = alt;
    } else {
      _pane0AccentColor = acc; _pane0AccentAltColor = alt;
    }
    const ea = (window as any).electronAPI;
    if (ea?.setTitlebarColor) ea.setTitlebarColor(t.canvasBackground);
  };

  /** 设置单个窗格的画布背景（从自己的主题提取，两侧互不干涉） */
  const applyPaneCanvasBg = (container: HTMLElement, graphThemeName: string) => {
    container.style.background = getTheme(graphThemeName).canvasBackground;
  };

  // --- 全局 checkbox 主题适配 ---
  const checkboxStyle = document.createElement('style');
  checkboxStyle.id = 'fg-checkbox-style';
  checkboxStyle.textContent = `input[type="checkbox"]{accent-color:var(--fg-accent,#5B8FF9)}`;
  document.head.appendChild(checkboxStyle);

  // --- 检测 backdrop-filter 支持（鸿蒙/HarmonyOS WebView 不支持）---
  const supportsBackdrop = CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)');
  if (!supportsBackdrop) {
    // 将所有玻璃面板降级为实色背景
    document.documentElement.style.setProperty('--fg-surface-glass', 'var(--fg-surface)');
    document.documentElement.style.setProperty('--fg-surface-elevated', 'var(--fg-surface)');
  }

  // ===== 侧边栏 =====
  let openTabs: string[] = [];
  let activeTab = 'demo';
  let fileSystemMountPath: string | null = null; // Electron 模式下的文件夹路径
  const capApp = isCapacitor();
  const isHarmony = !capApp && isHarmonyOS();

  // 存储适配器：所有图统一走 localStorage
  const readGraphData = async (fileName: string): Promise<GraphData | null> => {
    // SAF 目录模式
    if (fileSystemMountPath && fileSystemMountPath !== 'graphs' && safIsAvailable() && fileName !== 'demo') {
      try {
        const raw = await safReadFile(fileName);
        if (raw) return JSON.parse(raw);
      } catch {}
    }
    // Capacitor Filesystem
    if (fileSystemMountPath === 'graphs' && fileName !== 'demo') {
      try {
        const data = await readFileMobile(fileName);
        if (data) return data;
      } catch {}
    }
    // Electron 模式：从挂载目录读文件
    const ea = (window as any).electronAPI;
    if (ea && fileSystemMountPath && fileSystemMountPath !== 'graphs' && fileName !== 'demo') {
      try {
        const raw = await ea.readFile(fileSystemMountPath + '/' + fileName);
        return raw && !raw.error ? JSON.parse(raw) : null;
      } catch {}
    }
    // File System Access API：从磁盘目录读文件
    if (fileSystemMountPath && fileSystemMountPath !== 'graphs' && !ea && !safIsAvailable() && fileName !== 'demo') {
      try {
        const data = await readGraphFile(fileName);
        if (data) return data;
      } catch {}
    }
    // 桌面 localStorage 回退
    const store = createStorage(fileName);
    return await store.readData();
  };

  const writeGraphData = async (fileName: string, data: GraphData): Promise<void> => {
    const store = createStorage(fileName);
    await store.writeData(data);
    // SAF 目录模式
    if (fileSystemMountPath && fileSystemMountPath !== 'graphs' && safIsAvailable() && fileName !== 'demo') {
      try { await safWriteFile(fileName, JSON.stringify(data, null, 2)); } catch {}
      return;
    }
    // Capacitor Filesystem
    if (fileSystemMountPath === 'graphs' && fileName !== 'demo') {
      try { await writeFileMobile(fileName, data); } catch {}
      return;
    }
    // Electron 模式：同步到挂载目录
    const ea = (window as any).electronAPI;
    if (ea && fileSystemMountPath && fileSystemMountPath !== 'graphs' && fileName !== 'demo') {
      try {
        await ea.writeFile(fileSystemMountPath + '/' + fileName, JSON.stringify(data, null, 2));
      } catch {}
      return;
    }
    // File System Access API：写到磁盘目录
    if (fileSystemMountPath && fileSystemMountPath !== 'graphs' && !ea && !safIsAvailable() && fileName !== 'demo') {
      try { await writeGraphFile(fileName, data); } catch {}
    }
  };

  // --- 标签页持久化 ---
  const TABS_KEY = 'fg-open-tabs';
  const ACTIVE_KEY = 'fg-active-tab';
  function persistTabs() {
    localStorage.setItem(TABS_KEY, JSON.stringify(openTabs));
    localStorage.setItem(ACTIVE_KEY, activeTab);
    // 持久化所有分屏窗格标签
    for (let i = 0; i < extraPanes.length; i++) {
      const ep = extraPanes[i];
      localStorage.setItem(TABS_KEY + '-ep' + i, JSON.stringify(ep.openTabs));
      localStorage.setItem(ACTIVE_KEY + '-ep' + i, ep.activeTab);
    }
  }
  function restoreTabs(): { tabs: string[]; active: string } | null {
    try {
      const raw = localStorage.getItem(TABS_KEY);
      const active = localStorage.getItem(ACTIVE_KEY);
      if (raw) {
        const tabs = JSON.parse(raw);
        if (Array.isArray(tabs) && tabs.length > 0) return { tabs, active: active || tabs[0] };
      }
    } catch {}
    return null;
  }

  const sidebar = createSidebar(appShell, {
    onSelectFile: async (path) => {
      if (focusedPaneIndex === PANE_RIGHT) {
        await loadGraphDataPane1(path);
      } else {
        await openTab(path);
      }
    },
    onNewFile: async (path) => {
      const presetSettings = Object.keys(presetDefaults).length > 0 ? { ...DEFAULT_SETTINGS, ...presetDefaults } : { ...DEFAULT_SETTINGS };
      const empty: GraphData = { nodes: [], edges: [], groups: [], settings: presetSettings };
      if (focusedPaneIndex === PANE_RIGHT) {
        await writeGraphData(path, empty);
        await loadGraphDataPane1(path);
        return;
      }
      if (fileSystemMountPath && fileSystemMountPath !== 'graphs' && safIsAvailable()) {
        try { await safWriteFile(path, JSON.stringify(empty, null, 2)); } catch {}
      } else if (fileSystemMountPath === 'graphs') {
        try { await writeFileMobile(path, empty); } catch {}
      } else if (isHarmony) {
        await writeFileHarmony(path, empty);
      } else {
        await writeGraphFile(path, empty);
      }
      await writeGraphData(path, empty);
      await refreshFileTree();
      await openTab(path);
    },
    onDeleteFile: async (path) => {
      if (fileSystemMountPath && fileSystemMountPath !== 'graphs' && safIsAvailable()) {
        try { await safDeleteFile(path); } catch {}
      } else if (fileSystemMountPath === 'graphs') { try { await deleteFileMobile(path); } catch {} }
      else if (isHarmony) { await deleteFileHarmony(path); }
      else if (fileSystemMountPath && (window as any).electronAPI) {
        try { await (window as any).electronAPI.delete(fileSystemMountPath + '/' + path); } catch {}
      }
      else { await deleteFile(path); }
      // 同时清理 localStorage（各环境统一兜底）
      try { await createStorage(path).deleteData(); } catch {}
      openTabs = openTabs.filter(t => t !== path);
      if (activeTab === path) {
        activeTab = openTabs.length > 0 ? openTabs[openTabs.length - 1] : 'demo';
        await loadGraphData(activeTab);
      }
      renderAllTabs();
      persistTabs();
      await refreshFileTree();
    },
    onRenameFile: async (oldPath, newName) => {
      const newPath = newName.endsWith('.json') ? newName : newName + '.json';
      if (fileSystemMountPath && fileSystemMountPath !== 'graphs' && safIsAvailable()) {
        try {
          const content = await safReadFile(oldPath);
          const data = content ? JSON.parse(content) : { nodes: [], edges: [], groups: [] };
          await safWriteFile(newPath, JSON.stringify(data, null, 2));
          await safDeleteFile(oldPath);
        } catch {}
      } else if (fileSystemMountPath === 'graphs') {
        try {
          const content = await readFileMobile(oldPath);
          await writeFileMobile(newPath, content || { nodes: [], edges: [], groups: [] });
          await deleteFileMobile(oldPath);
        } catch {}
      } else if (isHarmony) {
        const content = await readFileHarmony(oldPath);
        await writeFileHarmony(newPath, content || { nodes: [], edges: [], groups: [], settings: { ...DEFAULT_SETTINGS } });
        await deleteFileHarmony(oldPath);
      } else if (fileSystemMountPath && (window as any).electronAPI) {
        const ea = (window as any).electronAPI;
        const content = await ea.readFile(fileSystemMountPath + '/' + oldPath);
        const data = (!content || content.error) ? { nodes: [], edges: [], groups: [], settings: { ...DEFAULT_SETTINGS } } : JSON.parse(content);
        await ea.writeFile(fileSystemMountPath + '/' + newPath, JSON.stringify(data, null, 2));
        await ea.delete(fileSystemMountPath + '/' + oldPath);
      } else {
        await renameFile(oldPath, newName);
      }
      if (activeTab === oldPath) {
        openTabs = openTabs.map(t => t === oldPath ? newPath : t);
        await loadGraphData(newPath);
        renderAllTabs();
        persistTabs();
      }
      await refreshFileTree();
    },
    onCopyFile: async (path) => {
      const base = path.replace(/\.json$/, '');
      let n = 2; let newPath = base + ' ' + n + '.json';
      if (fileSystemMountPath === 'graphs') {
        try {
          const files = await listFilesMobile();
          while (files.some(f => f.name === newPath)) { n++; newPath = base + ' ' + n + '.json'; }
        } catch {}
      } else if (isHarmony) {
        const files = await listFilesHarmony();
        while (files.some(f => f.name === newPath)) { n++; newPath = base + ' ' + n + '.json'; }
      } else {
        while (flatFilePaths(await listFileTree()).includes(newPath)) { n++; newPath = base + ' ' + n + '.json'; }
      }
      const content = await readGraphData(path);
      await writeGraphData(newPath, content || { nodes: [], edges: [], groups: [], settings: { ...DEFAULT_SETTINGS } });
      await refreshFileTree();
    },
    onNewFolder: async (_path) => {
      if (fileSystemMountPath && (window as any).electronAPI) {
        try {
          const ea = (window as any).electronAPI;
          await ea.mkdir(fileSystemMountPath + '/' + _path);
        } catch {}
      } else if (!isHarmony && fileSystemMountPath !== 'graphs') {
        await writeGraphFile(_path + '/.gitkeep', { nodes: [], edges: [], groups: [], settings: { ...DEFAULT_SETTINGS } });
        await deleteFile(_path + '/.gitkeep');
      }
      await refreshFileTree();
    },
    onMoveFile: async (src, dstDir) => {
      const parts = src.split('/'); const name = parts.pop()!;
      const dstPath = dstDir + '/' + name;
      const content = await readGraphData(src);
      await writeGraphData(dstPath, content || { nodes: [], edges: [], groups: [] });
      if (fileSystemMountPath === 'graphs') { try { await deleteFileMobile(src); } catch {} }
      else if (isHarmony) { await deleteFileHarmony(src); }
      else if (fileSystemMountPath && (window as any).electronAPI) { try { await (window as any).electronAPI.delete(fileSystemMountPath + '/' + src); } catch {} }
      else { await deleteFile(src); }
      if (activeTab === src) { await loadGraphData(dstPath); }
      await refreshFileTree();
    },
    onApplyPreset: () => { settingsPanel.show(); },
    onResetPresets: () => { settingsPanel.show(); },
    onOpenFolder: () => {},
  });

  // 侧边栏玻璃效果
  sidebar.sidebar.className = 'fg-glass';
  sidebar.sidebar.style.cssText = `position:absolute;left:${SIDEBAR_LEFT}px;top:6px;bottom:6px;z-index:${Z_FLOATING_UI};width:${getResponsiveSidebarWidth()}px;min-width:${SIDEBAR_MIN_WIDTH}px;display:flex;flex-direction:column;font-size:${V('--fg-font-md', '0.85em')};overflow:hidden;`;

  const refreshFileTree = async () => {
    // SAF 目录模式（Obsidian 式）
    if (fileSystemMountPath && fileSystemMountPath !== 'graphs' && safIsAvailable()) {
      const files = await safListFiles();
      sidebar.updateFileTree(files, activeTab);
      return;
    }
    // Capacitor Filesystem
    if (fileSystemMountPath === 'graphs') {
      try {
        const files = await listFilesMobile();
        if (files.length > 0) {
          sidebar.updateFileTree(files, activeTab);
          return;
        }
      } catch {}
    }
    // 鸿蒙 localStorage 回退
    if (isHarmony || (!capApp && !(window as any).electronAPI)) {
      const files = await listFilesHarmony();
      if (files.length > 0) {
        sidebar.updateFileTree(files, activeTab);
        return;
      }
    }
    // Electron 模式：直接用 fs 读目录
    const ea = (window as any).electronAPI;
    if (fileSystemMountPath && ea?.readDir) {
      const buildTree = async (dirPath: string): Promise<any[]> => {
        const entries = await ea.readDir(dirPath);
        if (!entries || entries.error) return [];
        const result: any[] = [];
        for (const e of entries) {
          if (e.name.startsWith('.')) continue;
          if (e.kind === 'directory') {
            result.push({ name: e.name, kind: 'directory', children: await buildTree(dirPath + '/' + e.name) });
          } else if (e.name.endsWith('.json')) {
            result.push({ name: e.name, kind: 'file', children: [] });
          }
        }
        return result;
      };
      const tree = await buildTree(fileSystemMountPath);
      sidebar.updateFileTree(tree, activeTab);
      return;
    }
    const tree = await listFileTree();
    // 文件系统不可用时，从 localStorage 列出已保存的图
    if (tree.length === 0) {
      const localFiles: any[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('fg-data-')) {
          const name = key.slice('fg-data-'.length);
          // 跳过系统键
          if (name === 'demo' || name === '' || name.startsWith('fg-')) continue;
          localFiles.push({ name, kind: 'file', children: [] });
        }
      }
      sidebar.updateFileTree(localFiles, activeTab);
      return;
    }
    sidebar.updateFileTree(tree, activeTab);
  };

  // 共享的文件导入逻辑（FAB 按钮 + 设置面板"打开目录"共用）
  const triggerFileImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.multiple = true;
    input.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;';
    input.addEventListener('change', async () => {
      const files = input.files;
      input.remove();
      if (!files || files.length === 0) return;
      try {
        try { await importFilesMobile(files); } catch { await importFilesHarmony(files); }
        fileSystemMountPath = 'graphs';
        await refreshFileTree();
        showToast(`已导入 ${files.length} 个文件`, 'success');
      } catch (e) {
        console.error('import error:', e);
        showToast('导入失败', 'error');
      }
    });
    document.body.appendChild(input);
    input.click();
  };

  // ===== 图加载函数 =====
  async function loadGraphData(fileName: string) {
    loadingOverlay.style.display = 'flex';
    activeTab = fileName;
    updateGwGh();
    // 先停掉旧模拟（仅当不与其他窗格共享时，否则会影响另一窗格）
    if (simManager !== simManager1 && !extraSims.slice(1).some(es => es === simManager)) {
      simManager.getSim()?.stop();
    }
    // 清除旧节点精灵
    if (pixi) { pixi.nodeLayer.removeChildren(); pixi.edgeLayer.removeChildren(); pixi.blobLayer.removeChildren(); }
    nodeSprites.clear(); clearGridCache();

    // 检查是否已有其他窗格持有同文件 → 共享 graph 引用 + simManager
    const existing = findExistingForFile(fileName);
    const sharing = !!existing;
    if (existing) {
      graph.nodes = existing.graph.nodes;
      graph.edges = existing.graph.edges;
      graph.groups = existing.graph.groups;
      graph.settings = existing.graph.settings;
      simManager = existing.simManager;
    } else {
      // 从共享 sim 脱离（切换到不同文件）
      if (simManager && (simManager === simManager1 || extraSims.some((es, i) => es === simManager && extraPanes[i]?.graph !== graph))) {
        simManager = createSimManager(graph, () => gw, () => gh,
          () => linkDist, () => linkStr, () => charge, () => centerS,
          () => collideR, () => groupBound,
          () => alphaTarget, () => heatingTime,
          () => sharedState.hiddenNodeIds?.() ?? new Set(),
          () => draw()
        );
        // 左窗格事件用的是 proxy fake PaneState（已有 get simManager() getter），无需重绑
      }
      const saved = await readGraphData(fileName);
      if (fileName === 'demo') {
        // demo 始终从最新 DEMO_DATA 强制重建
        const demo = JSON.parse(JSON.stringify(DEMO_DATA));
        graph.nodes = demo.nodes;
        graph.edges = demo.edges;
        graph.groups = demo.groups;
        graph.settings = { ...DEFAULT_SETTINGS, ...demo.settings };
        await writeGraphData('demo', graph);
      } else if (saved && saved.nodes && saved.nodes.length > 0) {
        graph.nodes = saved.nodes;
        graph.edges = (saved.edges || []).map((e: any) => {
          const { _createdAt, _dyingAt, ...clean } = e;
          return clean;
        });
        graph.groups = saved.groups || [];
        graph.settings = saved.settings;
        // 迁移：去掉旧默认色（#000000 / #5B8FF9），让节点颜色跟随主题
        const oldDefaults = new Set(['', '#000000', '#5B8FF9']);
        graph.nodes.forEach(n => { if (oldDefaults.has(n.color)) delete n.color; });
      } else {
        graph.nodes = [];
        graph.edges = [];
        graph.groups = [];
        graph.settings = saved?.settings || { ...DEFAULT_SETTINGS };
      }
    }
    if (graph.settings) {
      const s = graph.settings;
      linkDist = s.linkDist; labelSize = s.labelSize; charge = s.charge; linkStr = s.linkStr;
      collideR = s.collideR; centerS = s.centerS; groupBound = s.groupBound;
      heatingTime = s.heatingTime; alphaTarget = s.alphaTarget;
      editPanelOpacity = s.editPanelOpacity; useRAFL = s.useRAFL;
      nodeExpand = s.nodeExpand; lineExpand = s.lineExpand;
      showGLabels = s.showGLabels; glMin = s.glMin; glMax = s.glMax;
      gridVis = s.gridVis; axisVis = s.axisVis; axisTicks = s.axisTicks;
      gridSp = s.gridSp; gridWidth = s.gridWidth ?? 0.5; gridMode = (s.gridMode as 'line' | 'dot') || 'line'; ar = s.ar; graphTheme = s.graphTheme || 'default'; layoutMode = (s as any).layoutMode || 'default'; gridSnapEnabled = (s as any).gridSnap || ((s as any).layoutMode === 'gridsnap') || false;
      partialGridSnap = (s as any).partialGridSnap || false;
      nodeColorStyle = (s as any).nodeColorStyle || 'spectrum-narrow';
      fontFamily = (s as any).fontFamily || '"SiYuan Songti", serif';
      document.documentElement.style.setProperty('--fg-font-family', fontFamily);
      const styleId = 'fg-font-override';
      let styleEl = document.getElementById(styleId);
      if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = styleId; document.head.appendChild(styleEl); }
      styleEl.textContent = `body,button,input,select,textarea,details,summary,span,a,div,code{font-family:${fontFamily} !important} input[type="checkbox"]{accent-color:var(--fg-accent,#5B8FF9)}`;
      setNodeFontFamily(fontFamily);
      focusMode = s.focusMode ?? false;
      glowAppearance = s.glowAppearance ?? false;
      categoryLayout = s.categoryLayout ?? false;
      edgeColorGradient = s.edgeColorGradient ?? false;
      edgeWidthByLevel = s.edgeWidthByLevel ?? false;
      fixedHollow = (s as any).fixedHollow ?? true;
    }
    sharedState.setFocusModeFn(() => focusedPaneIndex === PANE_RIGHT ? pane1.focusMode : focusMode);
    applyPaneCanvasBg(pixiContainer, graphTheme);
    { const ac = getAccentColorsForTheme(graphTheme);
      _pane0AccentColor = ac.accent; _pane0AccentAltColor = ac.accentAlt; }
    if (focusedPaneIndex === PANE_LEFT) applyUIToFocusedPane(graphTheme);
    // 若在默认模式且节点未被人为固定，清除锁定坐标（防脏数据；共享图时跳过）
    const savedMode = (graph.settings as any)?.layoutMode || 'default';
    const hasManualLayout = graph.nodes.some(n => n.fixed === true && n.fx != null);
    if (savedMode === 'default' && !sharing && !hasManualLayout) {
      for (const n of graph.nodes) { n.fixed = false; n.fx = null; n.fy = null; delete (n as any)._pieColors; }
      for (const e of graph.edges) { delete (e as any)._conflict; }
      (graph as any)._categoryBoxes = null;
    }
    clearEd(); simManager.initSim();
    // 恢复该图已保存的布局模式（必须在 initSim 之后，保证 sim 有正确的节点）
    if (savedMode !== 'default' && savedMode !== 'gridsnap') {
      applyLayoutMode(savedMode);
    }
    // 格点吸附恢复（新格式 gridSnap 或旧格式 layoutMode='gridsnap'）
    if (gridSnapEnabled) {
      applyGridSnapLayout();
    }
    updateInfoRef.current();
    loadingOverlay.style.display = 'none';
    setTimeout(() => draw(), 100);
  }

  // Pane 1 加载文件
  async function loadGraphDataPane1(fileName: string) {
    if (pane1.saveTimeout) clearTimeout(pane1.saveTimeout);
    if (pane1.activeTab !== fileName) {
      await writeGraphData(pane1.activeTab, pane1.graph);
    }
    pane1.activeTab = fileName;
    if (!pane1.openTabs.includes(fileName)) pane1.openTabs.push(fileName);

    // 清除旧 sprites
    if (pixi1) { pixi1.nodeLayer.removeChildren(); pixi1.edgeLayer.removeChildren(); pixi1.blobLayer.removeChildren(); }
    pane1NodeSprites.clear();

    // 检查是否已有其他窗格持有同文件 → 共享 graph 引用 + simManager
    const existing = findExistingForFile(fileName, pane1);
    if (existing) {
      pane1.graph.nodes = existing.graph.nodes;
      pane1.graph.edges = existing.graph.edges;
      pane1.graph.groups = existing.graph.groups;
      pane1.simManager = existing.simManager;
      simManager1 = existing.simManager; extraSims[0] = existing.simManager;
      if (existing.graph.settings) applyPaneSettings(pane1, existing.graph.settings);
    } else {
      // 从共享 sim 脱离（之前可能与其他窗格共享了 simManager）
      if (simManager1 === simManager || extraSims.some((es, i) => es === simManager1 && extraPanes[i] !== pane1)) {
        simManager1 = createSimManager(pane1.graph, () => pane1.gw, () => pane1.gh,
          () => pane1.linkDist, () => pane1.linkStr, () => pane1.charge, () => pane1.centerS,
          () => pane1.collideR, () => pane1.groupBound,
          () => pane1.alphaTarget, () => pane1.heatingTime,
          () => sharedState.hiddenNodeIds?.() ?? new Set(),
          () => pixiDrawPane1()
        );
        extraSims[0] = simManager1; pane1.simManager = simManager1;
        if (pixi1) setupCanvasEvents(pixi1.app.canvas as any, bindPaneEvents(
          pane1, pixi1!, simManager1, pane1NodeSprites, { v: null }
        ));
      }
      const saved = await readGraphData(fileName);
      if (fileName === 'demo') {
        const demo = JSON.parse(JSON.stringify(DEMO_DATA));
        pane1.graph.nodes = demo.nodes;
        pane1.graph.edges = demo.edges;
        pane1.graph.groups = demo.groups;
        pane1.graph.settings = demo.settings;
      } else if (saved && saved.nodes && saved.nodes.length > 0) {
        pane1.graph.nodes = saved.nodes;
        pane1.graph.edges = (saved.edges || []).map((e: any) => {
          const { _createdAt, _dyingAt, ...clean } = e;
          return clean;
        });
        pane1.graph.groups = saved.groups || [];
        pane1.graph.settings = saved.settings;
      } else {
        pane1.graph.nodes = [];
        pane1.graph.edges = [];
        pane1.graph.groups = [];
        pane1.graph.settings = saved?.settings;
      }
      if (pane1.graph.settings) applyPaneSettings(pane1, pane1.graph.settings);
    }
    // 初始化模拟（共享时重新克隆，确保 sim 节点与最新 graph 一致）
    simManager1.initSim();
    loadingOverlay.style.display = 'none';
    // 右窗格画布背景独立设置（不受左窗格/UI 主题影响）
    applyPaneCanvasBg(pane1Container, pane1.graphTheme);
    { const ac = getAccentColorsForTheme(pane1.graphTheme);
      pane1.themeAccentColor = ac.accent; pane1.themeAccentAltColor = ac.accentAlt; }
    // 若右窗格为当前焦点，同步其主题到 UI CSS 变量
    if (focusedPaneIndex === PANE_RIGHT) {
      applyUIToFocusedPane(pane1.graphTheme);
    }
    pixiDrawPane1();
  }

  // 聚焦窗格状态访问辅助（兼容多分屏）
  const focusedExtraPane = () => focusedPaneIndex > PANE_LEFT ? extraPanes[focusedPaneIndex - 1] : null;
  const focusedTabs = () => {
    const ep = focusedExtraPane();
    return ep ? ep : { openTabs, get activeTab() { return activeTab; }, set activeTab(v: string) { activeTab = v; }, graph, dirtyTabs, saveTimeout };
  };
  const focusedTabState = () => {
    const ep = focusedExtraPane();
    return ep ? { ot: ep.openTabs, at: ep.activeTab, g: ep.graph, dt: ep.dirtyTabs, st: ep.saveTimeout }
      : { ot: openTabs, at: activeTab, g: graph, dt: dirtyTabs, st: saveTimeout };
  };

  /** 通用：加载图到指定窗格 */
  async function loadGraphForPane(pane: PaneState, fileName: string) {
    pane.activeTab = fileName;
    if (!pane.openTabs.includes(fileName)) pane.openTabs.push(fileName);
    // 清除旧 sprites
    if (pane.pixi) { pane.pixi.nodeLayer.removeChildren(); pane.pixi.edgeLayer.removeChildren(); pane.pixi.blobLayer.removeChildren(); }
    pane.nodeSprites.clear();

    // 检查是否已有其他窗格持有同文件 → 共享 graph 引用 + simManager
    const existing = findExistingForFile(fileName, pane);
    if (existing) {
      pane.graph.nodes = existing.graph.nodes;
      pane.graph.edges = existing.graph.edges;
      pane.graph.groups = existing.graph.groups;
      pane.simManager = existing.simManager;
      // 同步更新 extraSims 数组（drawExtraPanes 用它取 sim）
      if (pane.index < extraSims.length) extraSims[pane.index] = existing.simManager;
      const ss = existing.graph.settings;
      if (ss) applyPaneSettings(pane, ss);
    } else {
      // 从共享 sim 脱离（切换到不同文件）
      const sm = extraSims[pane.index] || pane.simManager;
      if (sm && (sm === simManager || extraSims.some((es, i) => es === sm && extraPanes[i] !== pane))) {
        const newSM = createSimManager(pane.graph, () => pane.gw, () => pane.gh,
          () => pane.linkDist, () => pane.linkStr, () => pane.charge, () => pane.centerS,
          () => pane.collideR, () => pane.groupBound,
          () => pane.alphaTarget, () => pane.heatingTime,
          () => sharedState.hiddenNodeIds?.() ?? new Set(),
          () => draw()
        );
        extraSims[pane.index] = newSM; pane.simManager = newSM;
        if (pane.pixi) setupCanvasEvents(pane.pixi.app.canvas as any, bindPaneEvents(
          pane, pane.pixi, newSM, extraSprites[pane.index], { v: null }
        ));
      }
      const saved = await readGraphData(fileName);
      if (fileName === 'demo') {
        const demo = JSON.parse(JSON.stringify(DEMO_DATA));
        pane.graph.nodes = demo.nodes; pane.graph.edges = demo.edges; pane.graph.groups = demo.groups;
        pane.graph.settings = demo.settings;
      } else if (saved && saved.nodes && saved.nodes.length > 0) {
        pane.graph.nodes = saved.nodes;
        pane.graph.edges = (saved.edges || []).map((e: any) => { const { _createdAt, _dyingAt, ...clean } = e; return clean; });
        pane.graph.groups = saved.groups || [];
        pane.graph.settings = saved.settings;
      } else {
        pane.graph.nodes = []; pane.graph.edges = []; pane.graph.groups = [];
        pane.graph.settings = saved?.settings;
      }
      if (pane.graph.settings) applyPaneSettings(pane, pane.graph.settings);
    }
    // 初始化模拟（共享时重新克隆，确保 sim 节点与最新 graph 一致）
    pane.simManager?.initSim();
    // 画布背景 + 强调色（各自独立）
    applyPaneCanvasBg(pane.canvasContainer, pane.graphTheme);
    const ac = getAccentColorsForTheme(pane.graphTheme);
    pane.themeAccentColor = ac.accent; pane.themeAccentAltColor = ac.accentAlt;
  }

  /** 从 settings 对象恢复窗格配置 */
  function applyPaneSettings(pane: PaneState, s: any) {
    pane.linkDist = s.linkDist; pane.labelSize = s.labelSize;
    pane.charge = s.charge; pane.linkStr = s.linkStr;
    pane.collideR = s.collideR; pane.centerS = s.centerS;
    pane.groupBound = s.groupBound; pane.heatingTime = s.heatingTime;
    pane.alphaTarget = s.alphaTarget; pane.editPanelOpacity = s.editPanelOpacity;
    pane.useRAFL = s.useRAFL; pane.nodeExpand = s.nodeExpand;
    pane.lineExpand = s.lineExpand; pane.showGLabels = s.showGLabels;
    pane.glMin = s.glMin; pane.glMax = s.glMax;
    pane.gridVis = s.gridVis; pane.axisVis = s.axisVis;
    pane.axisTicks = s.axisTicks; pane.gridSp = s.gridSp;
    pane.gridWidth = s.gridWidth ?? 0.5;
    pane.gridMode = (s.gridMode as 'line' | 'dot') || 'line';
    pane.ar = s.ar; pane.graphTheme = s.graphTheme || 'default';
    pane.gridSnapEnabled = (s as any).gridSnap || false;
    pane.partialGridSnap = (s as any).partialGridSnap || false;
    pane.nodeColorStyle = (s as any).nodeColorStyle || 'spectrum-narrow';
    pane.fontFamily = (s as any).fontFamily || '"SiYuan Songti", serif';
    pane.focusMode = s.focusMode ?? false;
    pane.glowAppearance = s.glowAppearance ?? false;
    pane.fixedHollow = (s as any).fixedHollow ?? true;
  }

  /** 查找已持有 fileName 的现有 pane 数据（graph + simManager），不含自身 self */
  function findExistingForFile(fileName: string, self?: PaneState): { graph: GraphData; simManager: any } | null {
    const selfIdx = self ? self.index : undefined;
    // 左窗格（仅在调用者不是左窗格时才返回，避免自引用导致无法加载数据）
    if (activeTab === fileName && selfIdx !== undefined && selfIdx !== PANE_LEFT) return { graph, simManager };
    // pane1
    if (pane1.activeTab === fileName && pane1 !== self) return { graph: pane1.graph, simManager: simManager1 };
    // extraPanes beyond pane1
    for (let i = 1; i < extraPanes.length; i++) {
      if (extraPanes[i] !== self && extraPanes[i].activeTab === fileName) return { graph: extraPanes[i].graph, simManager: extraSims[i] };
    }
    return null;
  }

  async function openTab(fileName: string) {
    const ts = focusedTabState();
    if (ts.st) clearTimeout(ts.st);
    if (ts.at !== fileName) {
      await writeGraphData(ts.at, ts.g);
    }
    if (!ts.ot.includes(fileName)) ts.ot.push(fileName);
    if (focusedPaneIndex === PANE_LEFT) {
      activeTab = fileName; await loadGraphData(fileName);
    } else {
      const ep = extraPanes[focusedPaneIndex - 1];
      if (ep) await loadGraphForPane(ep, fileName);
    }
    try { loadLayouts(); renderModeBar(); } catch {}
    renderAllTabs();
    persistTabs();
  }

  async function switchTab(fileName: string) {
    const ts = focusedTabState();
    if (fileName === ts.at) return;
    if (ts.st) clearTimeout(ts.st);
    await writeGraphData(ts.at, ts.g);
    if (focusedPaneIndex === PANE_LEFT) {
      activeTab = fileName; await loadGraphData(fileName);
    } else {
      const ep = extraPanes[focusedPaneIndex - 1];
      if (ep) await loadGraphForPane(ep, fileName);
    }
    draw(); // 立即刷新画布，避免用户看到旧数据
    try { loadLayouts(); renderModeBar(); } catch {}
    renderAllTabs();
    persistTabs();
    sidebar.syncActiveFile(fileName);
  }

  async function closeTab(fileName: string) {
    if (focusedPaneIndex > PANE_LEFT) {
      const ep = extraPanes[focusedPaneIndex - 1];
      if (!ep) return;
      if (ep.saveTimeout) clearTimeout(ep.saveTimeout);
      if (fileName === ep.activeTab) await writeGraphData(fileName, ep.graph);
      ep.openTabs = ep.openTabs.filter(t => t !== fileName);
      if (ep.openTabs.length === 0) {
        // 最后一个标签 → 关闭分屏（若为 pane1）或移除此窗格
        if (focusedPaneIndex === PANE_RIGHT) splitActive = false;
        removeSplitPane(focusedPaneIndex - 1);
        return;
      }
      if (fileName === ep.activeTab) {
        ep.activeTab = ep.openTabs[ep.openTabs.length - 1];
        await loadGraphForPane(ep, ep.activeTab);
      }
    } else {
      clearTimeout(saveTimeout);
      if (fileName === activeTab) {
        graph.settings = collectSettings();
        await writeGraphData(fileName, graph);
      }
      openTabs = openTabs.filter(t => t !== fileName);
      if (openTabs.length === 0) {
        const newName = 'untitled_' + Date.now() + '.json';
        await writeGraphData(newName, { nodes: [], edges: [], groups: [], settings: { ...DEFAULT_SETTINGS } });
        openTabs = [newName]; activeTab = newName;
        graph.nodes = []; graph.edges = []; graph.groups = [];
        simManager.initSim();
      } else if (fileName === activeTab) {
        activeTab = openTabs[openTabs.length - 1];
        await loadGraphData(activeTab);
      }
    }
    renderAllTabs();
    persistTabs();
  }

  async function createNewTab() {
    const name = await safePrompt('输入新页面名称:');
    if (!name) return;
    const fileName = name.endsWith('.json') ? name : name + '.json';
    const ep = focusedPaneIndex > PANE_LEFT ? extraPanes[focusedPaneIndex - 1] : null;
    if (ep && ep.openTabs.includes(fileName)) { await switchTab(fileName); return; }
    if (!ep && openTabs.includes(fileName)) { await switchTab(fileName); return; }

    // 先把当前标签的数据保存到 localStorage（防止数据丢失和泄漏）
    if (ep) {
      if (ep.saveTimeout) clearTimeout(ep.saveTimeout);
      ep.graph.settings = collectSettings();
      await writeGraphData(ep.activeTab, ep.graph);
    } else {
      if (saveTimeout) clearTimeout(saveTimeout);
      graph.settings = collectSettings();
      await writeGraphData(activeTab, graph);
    }

    const presetSettings = Object.keys(presetDefaults).length > 0 ? { ...DEFAULT_SETTINGS, ...presetDefaults } : { ...DEFAULT_SETTINGS };
    const empty: GraphData = { nodes: [], edges: [], groups: [], settings: { ...presetSettings } };
    await writeGraphData(fileName, empty);
    if (ep) {
      ep.graph = { nodes: [], edges: [], groups: [], settings: { ...presetSettings } };
      ep.openTabs.push(fileName);
      ep.activeTab = fileName;
      await loadGraphForPane(ep, fileName);
    } else {
      graph.nodes = []; graph.edges = []; graph.groups = [];
      graph.settings = { ...presetSettings };
      openTabs.push(fileName);
      activeTab = fileName;
      await loadGraphData(fileName);
    }
    renderAllTabs();
    persistTabs();
  }

  // ===== PaneManager + 单例兼容层 =====
  // pm.$ Proxy 将所有属性访问代理到当前焦点窗格
  // 同时保留所有单例变量，初始时指向 pane 0 的状态，焦点切换时换入/换出
  const pm = new PaneManager();
  const $ = pm.$;

  // 状态变量（单例，始终反映焦点窗格的状态）
  // 注意：这些变量通过 withFocusedPane / _syncSingletons 与 PaneManager 同步
  let graph: GraphData = { nodes: [], edges: [], groups: [] };
  let linkDist = DEFAULT_SETTINGS.linkDist, labelSize = DEFAULT_SETTINGS.labelSize,
      charge = DEFAULT_SETTINGS.charge, linkStr = DEFAULT_SETTINGS.linkStr,
      collideR = DEFAULT_SETTINGS.collideR, centerS = DEFAULT_SETTINGS.centerS,
      groupBound = DEFAULT_SETTINGS.groupBound, heatingTime = DEFAULT_SETTINGS.heatingTime,
      alphaTarget = DEFAULT_SETTINGS.alphaTarget, editPanelOpacity = DEFAULT_SETTINGS.editPanelOpacity,
      useRAFL = DEFAULT_SETTINGS.useRAFL, nodeExpand = DEFAULT_SETTINGS.nodeExpand,
      lineExpand = DEFAULT_SETTINGS.lineExpand, showGLabels = DEFAULT_SETTINGS.showGLabels,
      glMin = DEFAULT_SETTINGS.glMin, glMax = DEFAULT_SETTINGS.glMax,
      gridVis = DEFAULT_SETTINGS.gridVis, axisVis = DEFAULT_SETTINGS.axisVis,
      axisTicks = DEFAULT_SETTINGS.axisTicks, gridSp = DEFAULT_SETTINGS.gridSp,
      gridWidth = DEFAULT_SETTINGS.gridWidth, gridMode = DEFAULT_SETTINGS.gridMode as 'line' | 'dot',
      ar = DEFAULT_SETTINGS.ar, graphTheme = DEFAULT_SETTINGS.graphTheme,
      focusMode = DEFAULT_SETTINGS.focusMode, glowAppearance = DEFAULT_SETTINGS.glowAppearance, categoryLayout = DEFAULT_SETTINGS.categoryLayout,
    layoutMode = DEFAULT_SETTINGS.layoutMode || 'default', gridSnapEnabled = DEFAULT_SETTINGS.gridSnap || false, partialGridSnap = DEFAULT_SETTINGS.partialGridSnap || false, nodeColorStyle = (DEFAULT_SETTINGS.nodeColorStyle as 'uniform' | 'hierarchical' | 'spectrum' | 'spectrum-narrow') || 'spectrum-narrow', fixedHollow = true,
    edgeColorGradient = DEFAULT_SETTINGS.edgeColorGradient || false, edgeWidthByLevel = DEFAULT_SETTINGS.edgeWidthByLevel || false;

  let gw = 800, gh = 600;
  const getViewportTransform = () => {
    if (!pixi) return { k: 1, x: 0, y: 0 };
    const vp = pixi.viewport;
    return { k: vp.scale.x, x: vp.x, y: vp.y };
  };
  const updateGwGh = () => {
    if (pixi) { gw = pixi.viewport.worldWidth; gh = pixi.viewport.worldHeight; }
  };
  let search = '', sField: "name"|"tags"|"note" = "name",
      sDisplayMode: "highlight"|"show" = "highlight",
      sMatchMode: "contains"|"startsWith"|"endsWith"|"fuzzy" = "contains";
  let selNode: string | null = null, selEdge: number | null = null, selGroup: string | null = null;
  let draggingNode: any = null, wasDragged = false;
  let linkMode = false, linkSrc: string | null = null;
  let _lastDragNodeId: string | null = null;
  let hoveredMediaId = '';
  let defArrow = false;
  let linkCursorX = 0, linkCursorY = 0;

  let undoManager = new UndoManager();
  const saveUndo = () => {
    const g = focusedPaneIndex === PANE_LEFT ? graph : (extraPanes[focusedPaneIndex - 1]?.graph ?? graph);
    const um = focusedPaneIndex === PANE_LEFT ? undoManager : (extraPanes[focusedPaneIndex - 1]?.undoManager ?? undoManager);
    um.pushSnapshot(g);
  };
  let saveTimeout: any;
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  const dirtyTabs = new Set<string>();
  let currentAnimationCancel: (() => void) | null = null;

  // --- 存储辅助函数 ---
  const collectSettings = (): GraphSettings => ({
    linkDist, labelSize, charge, linkStr, collideR, centerS, groupBound,
    heatingTime, alphaTarget, editPanelOpacity, useRAFL,
    nodeExpand, lineExpand, showGLabels, glMin, glMax,
    gridVis, gridMode, axisVis, axisTicks, gridSp, gridWidth, ar, graphTheme, focusMode, glowAppearance, categoryLayout,
    layoutMode: activeMode, gridSnap: gridSnapEnabled, partialGridSnap, nodeColorStyle, fontFamily,
    edgeColorGradient, edgeWidthByLevel,
    fixedHollow,
  });

  const scheduleSave = () => {
    if (focusedPaneIndex > PANE_LEFT) {
      const ep = extraPanes[focusedPaneIndex - 1];
      if (!ep) return;
      clearTimeout(ep.saveTimeout);
      ep.dirtyTabs.add(ep.activeTab);
      ep.saveTimeout = setTimeout(async () => {
        ep.graph.settings = collectSettings();
        await writeGraphData(ep.activeTab, ep.graph);
        ep.dirtyTabs.delete(ep.activeTab);
        renderAllTabs();
      }, 300);
      return;
    }
    clearTimeout(saveTimeout);
    dirtyTabs.add(activeTab);
    saveTimeout = setTimeout(async () => {
      graph.settings = collectSettings();
      await writeGraphData(activeTab, graph);
      dirtyTabs.delete(activeTab);
      renderAllTabs();
    }, 300);
  };
  (window as any).__triggerSave = () => scheduleSave();
  (window as any).__graphNodes = graph.nodes;

  const saveNow = async () => {
    if (focusedPaneIndex > PANE_LEFT) {
      const ep = extraPanes[focusedPaneIndex - 1];
      if (!ep) return;
      ep.graph.settings = collectSettings();
      await writeGraphData(ep.activeTab, ep.graph);
      return;
    }
    graph.settings = collectSettings();
    const cleanEdges = graph.edges
      .filter((e: any) => !e._dyingAt)
      .map((e: any) => { const { _createdAt, _dyingAt, ...rest } = e; return rest; });
    const saveGraph = { ...graph, edges: cleanEdges };
    await writeGraphData(activeTab, saveGraph);
    dirtyTabs.delete(activeTab);
    renderAllTabs();
  };

  let splitActive = false;
  // 初始单窗格：隐藏右窗格
  dualPane.paneContainers[PANE_RIGHT].style.display = 'none';
  dualPane.paneContainers[PANE_LEFT].style.width = '100%';
  dualPane.paneContainers[PANE_LEFT].style.left = '0';
  for (const d of dualPane.dividers) d.style.display = 'none';
  window.dispatchEvent(new CustomEvent('pane-resize'));

  const renderAllTabs = () => {
    const groups: { tabs: string[]; active: string; dirty?: Set<string> }[] = [];
    // 始终包含左窗格
    groups.push({ tabs: openTabs, active: activeTab, dirty: dirtyTabs });
    // 分屏激活时追加右窗格及额外窗格
    if (splitActive) {
      groups.push({ tabs: pane1.openTabs, active: pane1.activeTab, dirty: pane1.dirtyTabs });
      for (let i = 1; i < extraPanes.length; i++) {
        const ep = extraPanes[i];
        if (ep.openTabs.length > 0) {
          groups.push({ tabs: ep.openTabs, active: ep.activeTab, dirty: ep.dirtyTabs });
        }
      }
    }
    renderTabs(groups);
  };

  const isFixedNode = (id: string) => { const n = graph.nodes.find(gn => gn.id === id); return n?.fixed || false; };
  const fixNode = (id: string) => {
    const n = graph.nodes.find(gn => gn.id === id);
    if (n) { n.fixed = true; n.fx = n.x; n.fy = n.y; scheduleSave(); }
    // 同步到模拟副本（否则样式不会变）
    const sim = getSim();
    if (sim) { const sn = sim.nodes().find((sn: any) => sn.id === id); if (sn) { sn.fixed = true; sn.fx = sn.x; sn.fy = sn.y; } }
    draw();
  };
  const fixNodes = (ids: string[]) => { for (const id of ids) fixNode(id); draw(); };
  const unfixNodes = (ids: string[]) => {
    const sim = getSim();
    for (const id of ids) {
      const n = graph.nodes.find(gn => gn.id === id);
      if (n) { n.fixed = false; n.fx = null; n.fy = null; }
      if (sim) { const sn = sim.nodes().find((sn: any) => sn.id === id); if (sn) { sn.fixed = false; sn.fx = null; sn.fy = null; } }
    }
    scheduleSave(); draw();
  };

  // --- 模拟管理器 ---
  let simManager = createSimManager(
    graph, () => gw, () => gh,
    () => linkDist, () => linkStr, () => charge, () => centerS,
    () => collideR, () => groupBound,
    () => alphaTarget, () => heatingTime,
    () => sharedState.hiddenNodeIds?.() ?? new Set(),
    () => draw()
  );
  const getSim = () => simManager.getSim();

  // --- Pane 1 (右窗格) ---
  const pane1 = createPaneState(PANE_RIGHT, pane1Container);
  pane1.pixi = null; // will be synced from pixi1 after init
  let focusedPaneIndex = PANE_LEFT;

  // 配置同步：singletons ↔ PaneState
  const configKeys = ['linkDist','labelSize','charge','linkStr','collideR','centerS','groupBound','heatingTime','alphaTarget','editPanelOpacity','useRAFL','nodeExpand','lineExpand','showGLabels','glMin','glMax','gridVis','gridMode','axisVis','axisTicks','gridSp','gridWidth','ar','graphTheme','focusMode','glowAppearance','layoutMode','gridSnapEnabled','partialGridSnap','nodeColorStyle','fixedHollow','fontFamily','gw','gh'] as const;

  function saveConfigTo(to: PaneState) {
    const all: any = { linkDist, labelSize, charge, linkStr, collideR, centerS, groupBound, heatingTime, alphaTarget, editPanelOpacity, useRAFL, nodeExpand, lineExpand, showGLabels, glMin, glMax, gridVis, gridMode, axisVis, axisTicks, gridSp, gridWidth, ar, graphTheme, focusMode, glowAppearance, layoutMode: activeMode, gridSnapEnabled, partialGridSnap, nodeColorStyle, fixedHollow, fontFamily, gw, gh };
    for (const k of Object.keys(all)) (to as any)[k] = all[k];
    to.activeMode = activeMode; to.treeMode = treeMode;
    to.categoryMode = categoryMode; to.fullCatMode = fullCatMode;
  }

  function loadConfigFrom(from: PaneState) {
    linkDist = from.linkDist; labelSize = from.labelSize; charge = from.charge; linkStr = from.linkStr;
    collideR = from.collideR; centerS = from.centerS; groupBound = from.groupBound;
    heatingTime = from.heatingTime; alphaTarget = from.alphaTarget;
    editPanelOpacity = from.editPanelOpacity; useRAFL = from.useRAFL;
    nodeExpand = from.nodeExpand; lineExpand = from.lineExpand;
    showGLabels = from.showGLabels; glMin = from.glMin; glMax = from.glMax;
    gridVis = from.gridVis; gridMode = from.gridMode; axisVis = from.axisVis;
    axisTicks = from.axisTicks; gridSp = from.gridSp; gridWidth = from.gridWidth;
    ar = from.ar; graphTheme = from.graphTheme; focusMode = from.focusMode;
    glowAppearance = from.glowAppearance; layoutMode = from.layoutMode || 'default';
    gridSnapEnabled = from.gridSnapEnabled; partialGridSnap = from.partialGridSnap;
    nodeColorStyle = from.nodeColorStyle; fixedHollow = from.fixedHollow;
    fontFamily = from.fontFamily; gw = from.gw; gh = from.gh;
    activeMode = from.activeMode; treeMode = from.treeMode;
    categoryMode = from.categoryMode; fullCatMode = from.fullCatMode;
    applyUIToFocusedPane(graphTheme);
  }

  // pane0 配置备份（切到 pane1 时暂存 singletons）
  const pane0Config: Record<string, any> = {};

  function switchFocusedPane(toIndex: number) {
    if (focusedPaneIndex === toIndex || toIndex >= extraPanes.length + 1) return;
    focusedPaneIndex = toIndex;
    // UI 主题跟随聚焦窗格
    const targetTheme = toIndex === PANE_RIGHT ? pane1.graphTheme : graphTheme;
    applyUIToFocusedPane(targetTheme);
    // 文件树同步到聚焦窗格的活动文件
    const targetFile = toIndex === PANE_LEFT ? activeTab
      : toIndex === PANE_RIGHT ? pane1.activeTab
      : (extraPanes[toIndex - 1]?.activeTab ?? 'demo');
    sidebar.syncActiveFile(targetFile);
    settingsUI.updateInfo();
    renderAllTabs();
    draw();
  }
  // pane 点击自动聚焦
  dualPane.onPaneFocus((index: number) => switchFocusedPane(index));

  let simManager1 = createSimManager(
    pane1.graph,
    () => pane1.gw, () => pane1.gh,
    () => pane1.linkDist, () => pane1.linkStr, () => pane1.charge, () => pane1.centerS,
    () => pane1.collideR, () => pane1.groupBound,
    () => pane1.alphaTarget, () => pane1.heatingTime,
    () => new Set(),
    () => pixiDrawPane1()
  );
  const getSim1 = () => simManager1.getSim();
  const pane1NodeSprites = new Map<string, NodeSprite>();

  // --- PixiJS 渲染 ---
  let nodeSprites = new Map<string, NodeSprite>();

  const themeLabelColor = () => {
    const g = focusedPaneIndex === PANE_RIGHT ? pane1.graphTheme : graphTheme;
    const t = getTheme(g);
    return parseInt(t.labelColor.replace('#', ''), 16);
  };
  const themeNodeColor = () => {
    const g = focusedPaneIndex === PANE_RIGHT ? pane1.graphTheme : graphTheme;
    const t = getTheme(g);
    return parseInt(t.nodeDefaultColor.replace('#', ''), 16);
  };

function renderPane(px: PixiLayers, g: GraphData, sm: any, sp: Map<string, NodeSprite>, st: PaneState) {
    const graph = g;
    const pixi = px;
    const simManager = sm;
    const nodeSprites = sp;
    const undoManager = st.undoManager;
    const getSim = () => sm.getSim();

    if (!pixi) return;
    const sim = getSim();
    if (!sim) return;
    const nodes = sim.nodes() || [];
    try {

    // 空状态提示（图标 + 引导按钮）
    if (nodes.length === 0 && st.readyToDraw) {
      if (!(pixi.nodeLayer as any)._emptyGroup) {
        const group = new Container({ label: 'empty-state' });

        const hintText = new Text({
          text: '右键区域或点击按钮创建第一个节点',
          resolution: 3,
          style: { fontSize: 12, fill: 0x666666, fontFamily: st.fontFamily || 'system-ui, -apple-system, sans-serif', align: 'center' } as any,
        });
        hintText.anchor.set(0.5);
        hintText.position.set(0, 54);
        group.addChild(hintText);

        group.position.set(0, 0);
        (pixi.nodeLayer as any)._emptyGroup = group;
        pixi.nodeLayer.addChild(group);
      }
      (pixi.nodeLayer as any)._emptyGroup.visible = true;
    } else if ((pixi.nodeLayer as any)._emptyGroup) {
      (pixi.nodeLayer as any)._emptyGroup.visible = false;
    }
    const theme = getTheme(st.graphTheme);
    const lblColor = parseInt(theme.labelColor.replace('#', ''), 16);
    const defColor = parseInt(theme.nodeDefaultColor.replace('#', ''), 16);
    // 根据画布背景明度判断暗/亮主题
    const isDarkTheme = ((c: string) => {
      const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(c);
      if (!m) return true;
      return (parseInt(m[1], 16) * 299 + parseInt(m[2], 16) * 587 + parseInt(m[3], 16) * 114) / 1000 < 128;
    })(theme.canvasBackground);
    const accentHex = '#' + st.themeAccentColor.toString(16).padStart(6, '0');
    const defaultNodeColor = (lv: number) =>
      '#' + getHeadingColor(lv || 6, accentHex, isDarkTheme).toString(16).padStart(6, '0');

    // 搜索匹配集
    const matchText = (haystack: string, needle: string): boolean => {
      switch (st.sMatchMode) {
        case 'startsWith': return haystack.toLowerCase().startsWith(needle.toLowerCase());
        case 'endsWith': return haystack.toLowerCase().endsWith(needle.toLowerCase());
        case 'fuzzy': {
          let ni = 0;
          const hl = haystack.toLowerCase(), nl = needle.toLowerCase();
          for (let i = 0; i < hl.length && ni < nl.length; i++) {
            if (hl[i] === nl[ni]) ni++;
          }
          return ni === nl.length;
        }
        case 'contains':
        default: return haystack.toLowerCase().includes(needle.toLowerCase());
      }
    };
    const searchMatchIds = new Set<string>();
    const showOnlyMode = st.sDisplayMode === 'show' && st.search;
    if (st.search) {
      for (const n of nodes) {
        let m = false;
        if (st.sField === 'name') m = matchText(n.label || '', st.search);
        else if (st.sField === 'tags') m = (n.tags || []).some((t: string) => matchText(t, st.search));
        else if (st.sField === 'note') m = matchText(n.note || '', st.search);
        if (m) searchMatchIds.add(n.id);
      }
    }

    // 框选集
    const boxSelIds = new Set(sharedState.selectedNodeIds);

    // --- 计算隐藏节点（搜索 + 折叠）---
    const hiddenNodes = new Set<string>();
    if (showOnlyMode) {
      for (const n of nodes) { if (!searchMatchIds.has(n.id)) hiddenNodes.add(n.id); }
    }
    const collapsedNodeIds = new Set<string>(graph.nodes.filter((n: any) => n.collapsed).map((n: any) => n.id as string));
    if (collapsedNodeIds.size > 0) {
      const nonCollapsedIncoming = new Set<string>();
      const hasCollapsedParent = new Set<string>();
      const hasAnyIncoming = new Set<string>();
      graph.edges.forEach((e: any) => {
        const src = typeof e.source === 'object' ? e.source.id : e.source;
        const tgt = typeof e.target === 'object' ? e.target.id : e.target;
        hasAnyIncoming.add(tgt);
        if (!collapsedNodeIds.has(src)) {
          nonCollapsedIncoming.add(tgt);
        } else if (collapsedNodeIds.has(tgt)) {
          hasCollapsedParent.add(tgt);
        }
        // 等级保护：即使源节点已折叠，若目标节点等级更高（headingLevel 更小），不隐藏
        if (collapsedNodeIds.has(src) && !collapsedNodeIds.has(tgt)) {
          const srcLevel = graph.nodes.find((n: any) => n.id === src)?.headingLevel || 6;
          const tgtLevel = graph.nodes.find((n: any) => n.id === tgt)?.headingLevel || 6;
          if (tgtLevel < srcLevel) {
            nonCollapsedIncoming.add(tgt);
          }
        }
      });
      for (const cid of collapsedNodeIds) {
        if (hasCollapsedParent.has(cid) && !nonCollapsedIncoming.has(cid)) hiddenNodes.add(cid);
      }
      for (const gn of graph.nodes) {
        const sid: string = gn.id;
        if (!collapsedNodeIds.has(sid) && hasAnyIncoming.has(sid) && !nonCollapsedIncoming.has(sid)) {
          hiddenNodes.add(sid);
        }
      }
    }
    sharedState.hiddenNodeIds = () => hiddenNodes;

    // 聚焦邻居集
    const focusNeighborIds = new Set<string>();
    const focusEdgeIndices = new Set<number>();
    let focusActive = false;
    if (sharedState.focusMode && sharedState.hoverNodeId) {
      focusActive = true;
      focusNeighborIds.add(sharedState.hoverNodeId);
      graph.edges.forEach((e, idx) => {
        const src = typeof e.source === 'object' ? e.source.id : e.source;
        const tgt = typeof e.target === 'object' ? e.target.id : e.target;
        if (src === sharedState.hoverNodeId) { focusNeighborIds.add(tgt); focusEdgeIndices.add(idx); }
        if (tgt === sharedState.hoverNodeId) { focusNeighborIds.add(src); focusEdgeIndices.add(idx); }
      });
    }

    // --- 光晕层 ---
    if (st.glowAppearance) {
      updateBlobFilters();
      pixi.blobLayer.visible = true;
      pixi.blobLayer.removeChildren();
      const bg = new Graphics();
      for (const n of nodes) {
        if (hiddenNodes.has(n.id)) continue;
        const levelR = [22, 19, 16, 13, 10, 7][(n.headingLevel || 6) - 1] || 9;
        const nr = (n.radiusMode === 'custom' || (!n.radiusMode && n.radius)) ? (n.radius || 9) : levelR;
        const r = nr * 1.8;
        const colorStr = (n.color && n.color !== '#000000') ? n.color : st.nodeColorStyle === 'uniform' ? theme.nodeDefaultColor : st.nodeColorStyle === 'spectrum' ? '#' + getSpectrumColor(n.headingLevel || 6, isDarkTheme, accentHex).toString(16).padStart(6, '0') : st.nodeColorStyle === 'spectrum-narrow' ? '#' + getNarrowSpectrumColor(n.headingLevel || 6, isDarkTheme, accentHex).toString(16).padStart(6, '0') : defaultNodeColor(n.headingLevel || 6);
        const color = parseInt(colorStr.replace('#', ''), 16);
        // 光晕随折叠/展开动画渐隐渐显
        const ca = (n as any)._collapseAnim;
        const ea = (n as any)._expandAnim;
        const glowAlpha = ca ? 0.5 * (1 - Math.min(1, Math.max(0, (performance.now() - ca.startTime) / ANIM_DURATION)))
          : ea ? 0.5 * Math.min(1, Math.max(0, (performance.now() - ea.startTime) / ANIM_DURATION))
          : 0.5;
        if (glowAlpha > 0.01) bg.circle(n.x, n.y, r).fill({ color, alpha: glowAlpha });
      }
      pixi.blobLayer.addChild(bg);
    } else {
      pixi.blobLayer.visible = false;
    }

    // --- 格点吸附：每帧将节点位置吸附到网格（拖拽中的节点跳过，由释放时吸附）---
    if (st.gridSnapEnabled || st.partialGridSnap) {
      const dragId = st.draggingNode?.id ?? null;
      for (const n of nodes) {
        if (n.id === dragId) continue;
        // 部分格点：仅固定节点吸附；全格点：所有节点吸附
        if (st.partialGridSnap && !n.fixed) continue;
        const [sx, sy] = snapPosToGrid(n.x, n.y);
        n.x = sx; n.y = sy;
        if (n.fx != null) n.fx = sx;
        if (n.fy != null) n.fy = sy;
      }
    }

    // 同步折叠状态：graph node → sim node（确保 applyNodeVisual 读到正确值）
    for (const n of nodes) {
      const gn = graph.nodes.find((gn: any) => gn.id === n.id);
      if (gn) n.collapsed = gn.collapsed || false;
    }

    // 动画中的节点暂不视为隐藏（保持渲染以播放动画）
    const animatingIds = new Set<string>();
    for (const n of nodes) {
      if ((n as any)._collapseAnim || (n as any)._expandAnim) animatingIds.add(n.id);
    }
    for (const aid of animatingIds) hiddenNodes.delete(aid);

    // 先清理隐藏/不存在节点的 sprite（避免旧光晕残留）
    const aliveIds = new Set(nodes.map((n: any) => n.id));
    for (const [id, sprite] of nodeSprites) {
      if (!aliveIds.has(id) || (hiddenNodes.has(id) && !animatingIds.has(id))) {
        pixi.nodeLayer.removeChild(sprite.container);
        sprite.container.destroy({ children: true });
        nodeSprites.delete(id);
      }
    }

    // --- 节点 ---
    const now = performance.now();
    // 构建所有节点的显色映射（含隐藏节点，供连线渐变色用）
    const nodeColorMap = new Map<string, number>();
    for (const n of nodes) {
      const colorStr = (n.color && n.color !== '#000000') ? n.color : st.nodeColorStyle === 'uniform' ? theme.nodeDefaultColor : st.nodeColorStyle === 'spectrum' ? '#' + getSpectrumColor(n.headingLevel || 6, isDarkTheme, accentHex).toString(16).padStart(6, '0') : st.nodeColorStyle === 'spectrum-narrow' ? '#' + getNarrowSpectrumColor(n.headingLevel || 6, isDarkTheme, accentHex).toString(16).padStart(6, '0') : defaultNodeColor(n.headingLevel || 6);
      nodeColorMap.set(n.id, parseInt(colorStr.replace('#', ''), 16));
    }
    for (const n of nodes) {
      if (hiddenNodes.has(n.id)) continue;
      const id = n.id;
      const collapseAnim = (n as any)._collapseAnim;
      const expandAnim = (n as any)._expandAnim;
      let collapseProgress = -1;
      let expandProgress = -1;

      // 折叠动画：原地消失（仅 scale + alpha）
      if (collapseAnim) {
        const elapsed = now - collapseAnim.startTime;
        collapseProgress = Math.min(1, Math.max(0, elapsed / ANIM_DURATION));
      }

      // 展开动画：原地生长（仅 scale + alpha）
      if (expandAnim) {
        const elapsed = now - expandAnim.startTime;
        expandProgress = Math.min(1, Math.max(0, elapsed / ANIM_DURATION));
      }

      const levelR = [22, 19, 16, 13, 10, 7][(n.headingLevel || 6) - 1] || 9;
      const nodeRadius = (n.radiusMode === 'custom' || (!n.radiusMode && n.radius)) ? (n.radius || 9) : levelR;
      let sprite = nodeSprites.get(id);
      if (!sprite) {
        const colorStr = (n.color && n.color !== '#000000') ? n.color : st.nodeColorStyle === 'uniform' ? theme.nodeDefaultColor : st.nodeColorStyle === 'spectrum' ? '#' + getSpectrumColor(n.headingLevel || 6, isDarkTheme, accentHex).toString(16).padStart(6, '0') : st.nodeColorStyle === 'spectrum-narrow' ? '#' + getNarrowSpectrumColor(n.headingLevel || 6, isDarkTheme, accentHex).toString(16).padStart(6, '0') : defaultNodeColor(n.headingLevel || 6);
        const color = parseInt(colorStr.replace('#', ''), 16);
        const nodeLabelSize = Math.max(12, Math.min(28, Math.round(nodeRadius * 0.8 + 7)));
        sprite = createNodeSprite(id, n.label || id, n.x, n.y, nodeRadius, color, lblColor, nodeLabelSize);
        pixi.nodeLayer.addChild(sprite.container);
        nodeSprites.set(id, sprite);
      } else {
        updateNodePosition(sprite, n.x, n.y);
        sprite.label.text = n.label || id;
      }

      // 标签在缩放 0.3-0.45 区间淡入淡出
      sprite.radius = nodeRadius;
	      const zoom = pixi.viewport.scale.x;
      const labelAlpha = Math.max(0, Math.min(1, (zoom - 0.3) / 0.15));
      sprite.label.visible = labelAlpha > 0;
      sprite.label.alpha = labelAlpha;

      // 组颜色
      const tags: string[] = n.tags || [];
      const matchingGroups = (graph.groups || []).filter((g: any) => g.displayMode !== 'none' && g.nodeColorMode && g.nodeColorMode !== 'off' && tags.includes(g.label));
      let gColor: number | undefined;
      let gEdgeOnly = false;
      if (matchingGroups.length === 1) {
        const gc = matchingGroups[0].nodeColor || matchingGroups[0].color;
        gColor = parseInt((gc || '#5B8FF9').replace('#', ''), 16);
        gEdgeOnly = matchingGroups[0].nodeColorMode === 'edge';
      }

      const colorStr = (n.color && n.color !== '#000000') ? n.color : st.nodeColorStyle === 'uniform' ? theme.nodeDefaultColor : st.nodeColorStyle === 'spectrum' ? '#' + getSpectrumColor(n.headingLevel || 6, isDarkTheme, accentHex).toString(16).padStart(6, '0') : st.nodeColorStyle === 'spectrum-narrow' ? '#' + getNarrowSpectrumColor(n.headingLevel || 6, isDarkTheme, accentHex).toString(16).padStart(6, '0') : defaultNodeColor(n.headingLevel || 6);
      const baseColor = parseInt(colorStr.replace('#', ''), 16);

      // 冲突节点饼状颜色
      const pieStrColors: string[] | undefined = (n as any)._pieColors;
      const pieColors: number[] | undefined = pieStrColors?.map(c => parseInt(c.replace('#', ''), 16));
      const nodeLabelSize2 = Math.max(12, Math.min(28, Math.round(nodeRadius * 0.8 + 7)));

      // 展开节点预缩：防止新 sprite 在 applyNodeVisual 缩小前闪现一帧
      if (expandProgress >= 0) sprite.container.scale.set(0.01);

      applyNodeVisual(sprite, baseColor, lblColor, nodeLabelSize2, {
        selected: n.id === st.selNode,
        boxSelected: boxSelIds.has(id),
        searchMatch: searchMatchIds.has(id),
        fixed: n.fixed || false,
        fixedHollow: st.fixedHollow,
        collapsed: n.collapsed || false,
        inFocus: (!focusActive || focusNeighborIds.has(id)) && (!showOnlyMode || searchMatchIds.has(id)),
        isNew: (n as any)._isNew === true,
        dying: (n as any)._dying != null,
        collapsing: collapseProgress >= 0 ? collapseProgress : null,
        expanding: expandProgress >= 0 ? expandProgress : null,
        accentColor: st.themeAccentColor,
        accentAltColor: st.themeAccentAltColor,
        groupColor: gColor,
        groupEdgeOnly: gEdgeOnly,
        pieColors,
        mediaType: n.mediaType || undefined,
        mediaExpanded: isExpanded(n.id),
        mediaUrl: n.mediaUrl || undefined,
        hyperlink: n.hyperlink || undefined,
      });
      if ((n as any)._isNew) (n as any)._isNew = false;

      // 折叠动画完成：标记隐藏，后续 cleanup 会从 sim 移除
      if (collapseProgress >= 1) {
        hiddenNodes.add(id);
      }
      // 展开动画完成：清除动画状态
      if (expandProgress >= 1) {
        delete (n as any)._expandAnim;
      }
    }

    // --- 折叠动画完成后：从 sim 移除节点 ---
    const finishedCollapsing = new Set<string>();
    for (const n of nodes) {
      const ca = (n as any)._collapseAnim;
      if (ca && (performance.now() - ca.startTime) >= (ca.duration || 300)) {
        finishedCollapsing.add(n.id);
      }
    }
    if (finishedCollapsing.size > 0) {
      const sim = getSim();
      if (sim) {
        // 保存位置到 graph nodes
        for (const n of nodes) {
          if (finishedCollapsing.has(n.id)) {
            const gn = graph.nodes.find((gn: any) => gn.id === n.id);
            if (gn) { gn.x = n.x; gn.y = n.y; }
          }
        }
        sim.nodes(sim.nodes().filter((n: any) => !finishedCollapsing.has(n.id)));
        // 平滑过渡：移除节点后微微加热，让余下节点自然重排
        sim.alpha(0.3).st.alphaTarget(0).restart();
      }
    }

    // 边、集合、网格
    // 折叠边索引（边线隐藏用；动画中或等级更高的目标节点的边保留）
    const collapsedEdgeIndices = new Set<number>();
    if (collapsedNodeIds.size > 0) {
      const simNodesById = new Map<string, any>(nodes.map((n: any) => [n.id, n]));
      graph.edges.forEach((e: any, idx: number) => {
        const src = typeof e.source === 'object' ? e.source.id : e.source;
        if (!collapsedNodeIds.has(src)) return;
        const tgt = typeof e.target === 'object' ? e.target.id : e.target;
        const srcLevel = graph.nodes.find((n: any) => n.id === src)?.headingLevel || 6;
        const tgtLevel = graph.nodes.find((n: any) => n.id === tgt)?.headingLevel || 6;
        // 等级保护：目标节点等级更高 → 保留边线
        if (tgtLevel < srcLevel) return;
        // 动画保护：源或目标正在折叠动画中 → 保留边线，跟随动画
        const srcSim = simNodesById.get(src);
        const tgtSim = simNodesById.get(tgt);
        if ((srcSim && (srcSim as any)._collapseAnim) || (tgtSim && (tgtSim as any)._collapseAnim)) return;
        collapsedEdgeIndices.add(idx);
      });
    }

    // 折叠/展开中连线透明度渐变（值 = alpha 乘数，1=正常，0=全透明）
    const collapseEdgeFade = new Map<number, number>();
    const simNodesById2 = new Map<string, any>(nodes.map((n: any) => [n.id, n]));
    const calcAP = (anim: any) => anim ? Math.min(1, Math.max(0, (performance.now() - anim.startTime) / ANIM_DURATION)) : -1;
    graph.edges.forEach((e: any, idx: number) => {
      const sId = typeof e.source === 'object' ? e.source.id : e.source;
      const tId = typeof e.target === 'object' ? e.target.id : e.target;
      const sSn = simNodesById2.get(sId);
      const tSn = simNodesById2.get(tId);
      const sCol = sSn?._collapseAnim ? (1 - calcAP(sSn._collapseAnim)) : sSn?._expandAnim ? calcAP(sSn._expandAnim) : 1;
      const tCol = tSn?._collapseAnim ? (1 - calcAP(tSn._collapseAnim)) : tSn?._expandAnim ? calcAP(tSn._expandAnim) : 1;
      const mult = Math.min(sCol, tCol);
      if (mult < 1) collapseEdgeFade.set(idx, mult);
    });

    updateEdges(pixi.edgeLayer, graph, nodes, {
      hiddenNodes,
      focusNeighborIds: focusActive ? focusNeighborIds : undefined,
      focusEdgeIndices: focusActive ? focusEdgeIndices : undefined,
      collapsedEdgeIndices: collapsedEdgeIndices.size > 0 ? collapsedEdgeIndices : undefined,
      collapseEdgeFade: collapseEdgeFade.size > 0 ? collapseEdgeFade : undefined,
      selectedEdgeIndex: st.selEdge,
      boxSelectedEdgeIndices: sharedState.boxSelectedEdgeIndices ?? undefined,
      nodeColorMap: (edgeColorGradient || edgeWidthByLevel) ? nodeColorMap : undefined,
      edgeColorGradient,
      edgeWidthByLevel,
    });
    // 连线模式 / 右键拖拽连线：从源节点到光标的实时贝塞尔预览线
    const dragLink = sharedState.rightDragLink;
    const previewSrc = (st.linkMode && st.linkSrc) ? st.linkSrc : dragLink?.sourceId;
    const previewX = (st.linkMode && st.linkSrc) ? st.linkCursorX : dragLink?.x ?? 0;
    const previewY = (st.linkMode && st.linkSrc) ? st.linkCursorY : dragLink?.y ?? 0;
    if (previewSrc) {
      const srcNode = nodes.find((n: any) => n.id === previewSrc);
      if (srcNode && (previewX !== 0 || previewY !== 0)) {
        if (!(pixi.edgeLayer as any)._linkGfx) {
          (pixi.edgeLayer as any)._linkGfx = new Graphics();
        }
        const lg = (pixi.edgeLayer as any)._linkGfx as Graphics;
        pixi.edgeLayer.addChild(lg);
        lg.clear();
        // 贝塞尔曲线预览
        const midX = (srcNode.x + previewX) / 2;
        const midY = (srcNode.y + previewY) / 2;
        const cpX = midX + (previewY - srcNode.y) * 0.15;
        const cpY = midY - (previewX - srcNode.x) * 0.15;
        const psr = (srcNode.radius || 9) + 1;
        const pdx = previewX - srcNode.x, pdy = previewY - srcNode.y;
        const plen = Math.sqrt(pdx * pdx + pdy * pdy) || 1;
        lg.moveTo(srcNode.x + pdx / plen * psr, srcNode.y + pdy / plen * psr)
          .quadraticCurveTo(cpX, cpY, previewX, previewY)
          .stroke({ color: 0x5B8FF9, width: 2, alpha: 0.5 });
        // 端点头
        lg.circle(previewX, previewY, 3).fill({ color: 0x5B8FF9, alpha: 0.6 });
        // 虚线引导
        const dashLen = 4, gapLen = 4;
        const dx = previewX - srcNode.x, dy = previewY - srcNode.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 1) {
          const ux = dx / len, uy = dy / len;
          let drawn = 0; let on = false;
          while (drawn < len) {
            const seg = on ? Math.min(dashLen, len - drawn) : Math.min(gapLen, len - drawn);
            const sx = srcNode.x + ux * drawn;
            const sy = srcNode.y + uy * drawn;
            drawn += seg;
            const ex = srcNode.x + ux * drawn;
            const ey = srcNode.y + uy * drawn;
            if (on) lg.moveTo(sx, sy).lineTo(ex, ey);
            on = !on;
          }
          lg.stroke({ color: 0xffffff, width: 1, alpha: 0.12 });
        }
      }
    } else if ((pixi.edgeLayer as any)._linkGfx) {
      (pixi.edgeLayer as any)._linkGfx.clear();
    }
    // 分类布局矩形框
    if ((st.activeMode === 'category' || st.activeMode === 'fullcat') && (graph as any)._categoryBoxes) {
      const boxes = (graph as any)._categoryBoxes;
      if (!(pixi.groupLayer as any)._catGfx) {
        (pixi.groupLayer as any)._catGfx = new Graphics();
        pixi.groupLayer.addChild((pixi.groupLayer as any)._catGfx);
      }
      const cg = (pixi.groupLayer as any)._catGfx as Graphics;
      cg.clear();
      // 清除旧标签
      const oldLabels = (pixi.groupLayer as any)._catLabels as any[];
      if (oldLabels) { for (const t of oldLabels) { t.visible = false; pixi.groupLayer.removeChild(t); } }
      const catLabels: any[] = [];
      for (const b of boxes) {
        const sp = st.gridSp || 30;
        const sx = st.gridSnapEnabled ? Math.round(b.x / sp) * sp : b.x;
        const sy = st.gridSnapEnabled ? Math.round(b.y / sp) * sp : b.y;
        const sw = st.gridSnapEnabled ? Math.max(sp, Math.round((b.x + b.w) / sp) * sp - sx) : b.w;
        const sh = st.gridSnapEnabled ? Math.max(sp, Math.round((b.y + b.h) / sp) * sp - sy) : b.h;
        cg.rect(sx, sy, sw, sh)
          .fill({ color: parseInt(b.color.replace('#', ''), 16), alpha: 0.08 })
          .stroke({ color: parseInt(b.color.replace('#', ''), 16), width: 2, alpha: 0.4 });
        // 分类标签
        if (b.label) {
          const lbl = new Text({ text: b.label, resolution: 2, style: { fontSize: 13, fill: b.color, fontFamily: st.fontFamily === "system-ui, -apple-system, sans-serif" ? "system-ui, -apple-system, sans-serif" : 'system-ui, -apple-system, sans-serif', fontWeight: '600' } as any });
          lbl.anchor.set(0.5, 0); lbl.position.set(sx + sw / 2, sy - 18); lbl.alpha = 0.55;
          catLabels.push(lbl); pixi.groupLayer.addChild(lbl);
        }
        if (!cg.parent) pixi.groupLayer.addChild(cg);
      }
      (pixi.groupLayer as any)._catLabels = catLabels;
    } else {
      const cg = (pixi.groupLayer as any)._catGfx;
      if (cg) { cg.clear(); pixi.groupLayer.removeChild(cg); (pixi.groupLayer as any)._catGfx = null; }
      const oldLabels2 = (pixi.groupLayer as any)._catLabels as any[];
      if (oldLabels2) { for (const t of oldLabels2) { t.visible = false; pixi.groupLayer.removeChild(t); } (pixi.groupLayer as any)._catLabels = null; }
      updateGroups(pixi.groupLayer, graph, nodes.filter((n: any) => !hiddenNodes.has(n.id)), st.showGLabels, st.glMin, st.glMax, { enabled: st.gridSnapEnabled, spacing: st.gridSp });
    }
    // 多媒体覆盖层：跟随节点 + 缩放（跳过隐藏节点）
    for (const n of nodes) {
      if (hiddenNodes.has(n.id)) continue;
      if (n.mediaType && isExpanded(n.id)) {
        const vp = pixi.viewport;
        const scale = vp.scale.x;
        const sp = vp.toScreen(n.x, n.y);
        const rect = pixi.app.canvas.getBoundingClientRect();
        positionMedia(n.id, () => ({ x: rect.left + sp.x, y: rect.top + sp.y }));
        const ov = document.querySelector(`[data-media-id="${n.id}"]`) as HTMLElement;
        if (ov) ov.style.transform = `scale(${scale})`;
      }
    }
    updateGwGh();
    // 网格用 canvas 实际 CSS 尺寸
    const cw = pixi.app.canvas.clientWidth;
    const ch = pixi.app.canvas.clientHeight;
    updateGrid(pixi.gridLayer, cw, ch, {
      gridVis: st.gridVis, gridMode: st.gridMode, axisVis: st.axisVis, axisTicks: st.axisTicks, gridSp: st.gridSp, gridWidth: st.gridWidth,
      nodes,
      transform: getViewportTransform(),
      dragX: st.draggingNode?.x ?? null,
      dragY: st.draggingNode?.y ?? null,
    });
    const selCount = sharedState.selectedNodeIds.length;
    const parts = [`${graph.nodes.length} 节点 | ${graph.edges.length} 连线`];
    if (st.search) parts.push(`匹配: ${searchMatchIds.size}`);
    if (selCount > 0) parts.push(`选中: ${selCount}`);
    if (sharedState.focusMode) parts.push('聚焦');
    if (st.linkMode) parts.push('连线中');
    parts.push(`${pixi.viewport.scale.x.toFixed(1)}x`);
    parts.push(focusedPaneIndex === PANE_LEFT ? '[左]' : '[右]');
    statsEl.textContent = parts.join(' | ');
    searchStatus.style.display = (st.search && searchMatchIds.size === 0) ? '' : 'none';
    if (st.search && searchMatchIds.size === 0) searchStatus.textContent = '无结果';

    // 折叠/展开动画自保持：保持 sim 微动以驱动持续渲染
    let hasActiveAnim = false;
    for (const n of nodes) {
      if ((n as any)._collapseAnim || (n as any)._expandAnim) { hasActiveAnim = true; break; }
    }
    if (hasActiveAnim) {
      const s = getSim();
      // 最低 alpha 维持 tick，不产生有感的力学偏移
      if (s && s.alpha() < 0.01) s.alpha(0.01).restart();
    }

    // 节点固定动画自保持：即使模拟停止也继续渲染直到过渡完成
    for (const [, sprite] of nodeSprites) {
      if ((sprite as any)._fixedAnimRaf) {
        requestAnimationFrame(() => renderPane(px, g, sm, sp, st));
        break;
      }
    }
    } catch (e) { console.error('pixiDraw error:', e); }
  
}
  // 帧计数器用于降频和非聚焦优化
  let frameCount = 0;
  // 左窗格预分配 state（复用对象，避免每帧 GC）
  const pane0St = {
    index: 0, activeTab: '', openTabs: [] as string[], dirtyTabs: new Set<string>(),
    pixi: null as any, canvasContainer: null as any,
    nodeSprites: null as any, readyToDraw: false, get simManager() { return simManager; },
    _lastDragNodeId: null, searchMatchIndex: 0, lastSearchTerm: "",
    searchDebounceTimer: null, currentAnimationCancel: null,
    savedFixedNodes: [] as any[], savedGroupModes: [] as any[], layouts: [] as any[],
    updateInfoRef: { current: () => {} }, updateSelectsRef: { current: () => {} },
    saveTimeout: null,
  } as PaneState;
  const pane0Draw = () => {
    // 刷新动态属性（引用型直接赋，不改对象结构）
    const s = pane0St;
    s.graph = graph; s.selNode = selNode; s.selEdge = selEdge; s.selGroup = selGroup;
    s.linkDist = linkDist; s.labelSize = labelSize; s.charge = charge; s.linkStr = linkStr;
    s.collideR = collideR; s.centerS = centerS; s.groupBound = groupBound;
    s.heatingTime = heatingTime; s.alphaTarget = alphaTarget;
    s.editPanelOpacity = editPanelOpacity; s.useRAFL = useRAFL;
    s.nodeExpand = nodeExpand; s.lineExpand = lineExpand;
    s.showGLabels = showGLabels; s.glMin = glMin; s.glMax = glMax;
    s.gridVis = gridVis; s.gridMode = gridMode; s.axisVis = axisVis;
    s.axisTicks = axisTicks; s.gridSp = gridSp; s.gridWidth = gridWidth;
    s.ar = ar; s.graphTheme = graphTheme; s.focusMode = focusMode;
    s.glowAppearance = glowAppearance; s.categoryLayout = categoryLayout;
    s.layoutMode = layoutMode; s.gridSnapEnabled = gridSnapEnabled;
    s.partialGridSnap = partialGridSnap; s.nodeColorStyle = nodeColorStyle;
    s.fixedHollow = fixedHollow; s.fontFamily = fontFamily;
    s.draggingNode = draggingNode; s.wasDragged = wasDragged;
    s.search = search; s.sField = sField; s.sDisplayMode = sDisplayMode; s.sMatchMode = sMatchMode;
    s.linkMode = linkMode; s.linkSrc = linkSrc;
    s.linkCursorX = linkCursorX; s.linkCursorY = linkCursorY;
    s.defArrow = defArrow;
    s.themeAccentColor = _pane0AccentColor; s.themeAccentAltColor = _pane0AccentAltColor;
    s.treeMode = treeMode; s.categoryMode = categoryMode;
    s.fullCatMode = fullCatMode; s.activeMode = activeMode;
    s.gw = gw; s.gh = gh; s.undoManager = undoManager;
    renderPane(pixi!, graph, simManager, nodeSprites, s);
  };

  function pixiDrawPane1() {
    // 现在通过 draw() 里的状态快照换入机制统一绘制，两个窗格能力平等
    draw();
  }

  const drawExtraPanes = () => {
    for (let i = 0; i < extraPanes.length; i++) {
      const px = extraPixis[i]; const pi = extraPanes[i]; const sm = extraSims[i];
      if (!px || !sm) continue;
      // 与聚焦窗格共享 sim → 每帧渲染，不降频不跳过
      const isShared = (focusedPaneIndex !== i + 1) && (sm === (focusedPaneIndex === PANE_LEFT ? simManager : extraSims[focusedPaneIndex - 1]));
      if (!isShared && focusedPaneIndex !== i + 1 && frameCount % 4 !== 0) continue;
      const s = sm.getSim();
      if (!isShared && focusedPaneIndex !== i + 1 && s && s.alpha() < 0.01) continue;
      renderPane(px!, pi.graph, sm, extraSprites[i], pi);
    }
  };
  sharedState.directDraw = () => { frameCount++; pane0Draw(); drawExtraPanes(); };
  let drawPending = false;
  const rafDraw = () => { if (!drawPending) { drawPending = true; requestAnimationFrame(() => { drawPending = false; frameCount++; pane0Draw(); drawExtraPanes(); }); } };
  const draw = () => {
    frameCount++;
    pane0Draw();
    drawExtraPanes();
    pixi?.app?.ticker?.update();
    // 非聚焦窗格 sim 休眠（跳过与聚焦窗格共享 sim 的窗格，防止误休眠）
    const focusedSM = focusedPaneIndex === PANE_LEFT ? simManager
      : (extraSims[focusedPaneIndex - 1] ?? simManager);
    for (let i = 0; i < extraSims.length; i++) {
      if (focusedPaneIndex === i + 1) continue;
      const sm = extraSims[i];
      if (!sm || sm === focusedSM) continue;
      const s = sm.getSim(); if (s && s.alpha() < 0.02) s.alphaTarget(0);
    }
    if (focusedPaneIndex !== PANE_LEFT) {
      const s0 = getSim();
      if (s0 && s0.alpha() < 0.02 && simManager !== focusedSM) s0.alphaTarget(0);
    }
  };

  // --- 编辑面板 ---
  const updateInfoRef = { current: () => {} };
  const updateSelectsRef = { current: () => {} };
  const _fg = () => focusedPaneIndex === PANE_RIGHT ? pane1.graph : graph;

  // 延迟赋值的同步回调：将当前图节点显示属性同步到其他持有同文件的窗格
  let _syncGraphToOtherPanes_impl: (() => void) | undefined;
  const editCtx = createEditPanel(appShell, {
    get graph() { return focusedPaneIndex === PANE_RIGHT ? pane1.graph : graph; },
    getSelNode: () => focusedPaneIndex === PANE_RIGHT ? pane1.selNode : selNode,
    setSelNode: v => { if (focusedPaneIndex === PANE_RIGHT) pane1.selNode = v; else selNode = v; },
    getSelEdge: () => focusedPaneIndex === PANE_RIGHT ? pane1.selEdge : selEdge,
    setSelEdge: v => { if (focusedPaneIndex === PANE_RIGHT) pane1.selEdge = v; else selEdge = v; },
    getSelGroup: () => focusedPaneIndex === PANE_RIGHT ? pane1.selGroup : selGroup,
    setSelGroup: v => { if (focusedPaneIndex === PANE_RIGHT) pane1.selGroup = v; else selGroup = v; },
    getLinkMode: () => focusedPaneIndex === PANE_RIGHT ? pane1.linkMode : linkMode,
    setLinkMode: v => { if (focusedPaneIndex === PANE_RIGHT) pane1.linkMode = v; else linkMode = v; },
    setLinkSrc: v => { if (focusedPaneIndex === PANE_RIGHT) pane1.linkSrc = v; else linkSrc = v; },
    getSaveData: () => saveNow,
    getInitSim: () => focusedPaneIndex === PANE_RIGHT ? simManager1.initSim : simManager.initSim,
    getUpdateInfo: () => updateInfoRef.current,
    getUpdateSelects: () => updateSelectsRef.current,
    draw,
    triggerSave: () => scheduleSave(),
    getSimulation: () => focusedPaneIndex === PANE_RIGHT ? getSim1() : getSim(),
    markNodesDying: (ids: string[]) => {
      if (focusedPaneIndex === PANE_RIGHT) {
        // pane1 node dying
        for (const id of ids) {
          const sn = getSim1()?.nodes().find((s: any) => s.id === id);
          if (sn) (sn as any)._dying = true;
        }
        setTimeout(() => {
          const sim = getSim1(); if (!sim) return;
          const alive = sim.nodes().filter((sn: any) => !(sn as any)._dying);
          sim.nodes(alive); sim.alpha(0.05).restart();
          draw();
        }, 250);
      } else {
        markNodesDying(ids);
      }
    },
    updateLinkForce: () => {
      if (focusedPaneIndex === PANE_RIGHT) {
        const s = getSim1();
        if (s) {
          const validEdges = pane1.graph.edges.filter(e => (e.lineStyle || 'solid') === 'solid' && !(e as any)._conflict && !(e as any)._dyingAt);
          s.force("link", d3.forceLink(validEdges).id((d: any) => d.id).distance(pane1.linkDist).strength(pane1.linkStr));
          s.alpha(0.1).restart();
        }
        return;
      }
      const s = getSim();
      if (s) {
        const validEdges = graph.edges.filter(e => (e.lineStyle || 'solid') === 'solid' && !(e as any)._conflict && !(e as any)._dyingAt);
        s.force("link", d3.forceLink(validEdges).id((d: any) => d.id).distance(linkDist).strength(linkStr));
        s.alpha(0.1).restart();
      }
    },
    syncGraphToOtherPanes: () => _syncGraphToOtherPanes_impl?.(),
  }, () => editPanelOpacity);
  const { fillNode, fillEdge, fillGroup, clearEd, updateOpacity, saveCurrent } = editCtx;

  // --- 设置面板 ---
  const settingsUI = buildSettings(setDiv, {
    getLinkDist: () => focusedPaneIndex === PANE_RIGHT ? (pane1 as any)['linkDist'] : linkDist, setLinkDist: v => { if (focusedPaneIndex === PANE_RIGHT) (pane1 as any)['linkDist'] = v; else linkDist = v; },
    getLabelSize: () => focusedPaneIndex === PANE_RIGHT ? (pane1 as any)['labelSize'] : labelSize, setLabelSize: v => { if (focusedPaneIndex === PANE_RIGHT) (pane1 as any)['labelSize'] = v; else labelSize = v; },
    getCharge: () => focusedPaneIndex === PANE_RIGHT ? (pane1 as any)['charge'] : charge, setCharge: v => { if (focusedPaneIndex === PANE_RIGHT) (pane1 as any)['charge'] = v; else charge = v; },
    getLinkStr: () => focusedPaneIndex === PANE_RIGHT ? (pane1 as any)['linkStr'] : linkStr, setLinkStr: v => { if (focusedPaneIndex === PANE_RIGHT) (pane1 as any)['linkStr'] = v; else linkStr = v; },
    getCollideR: () => focusedPaneIndex === PANE_RIGHT ? (pane1 as any)['collideR'] : collideR, setCollideR: v => { if (focusedPaneIndex === PANE_RIGHT) (pane1 as any)['collideR'] = v; else collideR = v; },
    getCenterS: () => focusedPaneIndex === PANE_RIGHT ? (pane1 as any)['centerS'] : centerS, setCenterS: v => { if (focusedPaneIndex === PANE_RIGHT) (pane1 as any)['centerS'] = v; else centerS = v; },
    getGroupBound: () => focusedPaneIndex === PANE_RIGHT ? (pane1 as any)['groupBound'] : groupBound, setGroupBound: v => { if (focusedPaneIndex === PANE_RIGHT) (pane1 as any)['groupBound'] = v; else groupBound = v; },
    getHeatingTime: () => focusedPaneIndex === PANE_RIGHT ? (pane1 as any)['heatingTime'] : heatingTime, setHeatingTime: v => { if (focusedPaneIndex === PANE_RIGHT) (pane1 as any)['heatingTime'] = v; else heatingTime = v; },
    getAlphaTarget: () => focusedPaneIndex === PANE_RIGHT ? (pane1 as any)['alphaTarget'] : alphaTarget, setAlphaTarget: v => { if (focusedPaneIndex === PANE_RIGHT) (pane1 as any)['alphaTarget'] = v; else alphaTarget = v; },
    getEditPanelOpacity: () => focusedPaneIndex === PANE_RIGHT ? pane1.editPanelOpacity : editPanelOpacity, setEditPanelOpacity: v => { if (focusedPaneIndex === PANE_RIGHT) pane1.editPanelOpacity = v; else editPanelOpacity = v; updateOpacity(v); },
    getUseRAFL: () => focusedPaneIndex === PANE_RIGHT ? (pane1 as any)['useRAFL'] : useRAFL, setUseRAFL: v => { if (focusedPaneIndex === PANE_RIGHT) (pane1 as any)['useRAFL'] = v; else useRAFL = v; },
    getNodeExpand: () => focusedPaneIndex === PANE_RIGHT ? (pane1 as any)['nodeExpand'] : nodeExpand, setNodeExpand: v => { if (focusedPaneIndex === PANE_RIGHT) (pane1 as any)['nodeExpand'] = v; else nodeExpand = v; },
    getLineExpand: () => focusedPaneIndex === PANE_RIGHT ? (pane1 as any)['lineExpand'] : lineExpand, setLineExpand: v => { if (focusedPaneIndex === PANE_RIGHT) (pane1 as any)['lineExpand'] = v; else lineExpand = v; },
    getShowGLabels: () => focusedPaneIndex === PANE_RIGHT ? (pane1 as any)['showGLabels'] : showGLabels, setShowGLabels: v => { if (focusedPaneIndex === PANE_RIGHT) (pane1 as any)['showGLabels'] = v; else showGLabels = v; },
    getGlMin: () => focusedPaneIndex === PANE_RIGHT ? (pane1 as any)['glMin'] : glMin, setGlMin: v => { if (focusedPaneIndex === PANE_RIGHT) (pane1 as any)['glMin'] = v; else glMin = v; },
    getGlMax: () => focusedPaneIndex === PANE_RIGHT ? (pane1 as any)['glMax'] : glMax, setGlMax: v => { if (focusedPaneIndex === PANE_RIGHT) (pane1 as any)['glMax'] = v; else glMax = v; },
    getGridVis: () => focusedPaneIndex === PANE_RIGHT ? (pane1 as any)['gridVis'] : gridVis, setGridVis: v => { if (focusedPaneIndex === PANE_RIGHT) (pane1 as any)['gridVis'] = v; else gridVis = v; },
    getGridMode: () => focusedPaneIndex === PANE_RIGHT ? (pane1 as any)['gridMode'] : gridMode, setGridMode: v => { if (focusedPaneIndex === PANE_RIGHT) (pane1 as any)['gridMode'] = v; else gridMode = v; },
    getAxisVis: () => focusedPaneIndex === PANE_RIGHT ? (pane1 as any)['axisVis'] : axisVis, setAxisVis: v => { if (focusedPaneIndex === PANE_RIGHT) (pane1 as any)['axisVis'] = v; else axisVis = v; },
    getAxisTicks: () => focusedPaneIndex === PANE_RIGHT ? (pane1 as any)['axisTicks'] : axisTicks, setAxisTicks: v => { if (focusedPaneIndex === PANE_RIGHT) (pane1 as any)['axisTicks'] = v; else axisTicks = v; },
    getGridSp: () => focusedPaneIndex === PANE_RIGHT ? (pane1 as any)['gridSp'] : gridSp, setGridSp: v => { if (focusedPaneIndex === PANE_RIGHT) (pane1 as any)['gridSp'] = v; else gridSp = v; },
    getAr: () => focusedPaneIndex === PANE_RIGHT ? pane1.ar : ar, setAr: v => { if (focusedPaneIndex === PANE_RIGHT) { pane1.ar = v; if (pixi1) { pixi1.app.renderer.resize(pixi1.app.canvas.width, Math.max(300, pixi1.app.canvas.width * pane1.ar)); simManager1.updateCenter(); } } else { ar = v; if (pixi) { pixi.app.renderer.resize(pixi.app.canvas.width, Math.max(300, pixi.app.canvas.width * ar)); updateGwGh(); simManager.updateCenter(); } } draw(); },
    getSimulation: () => focusedPaneIndex === PANE_RIGHT ? getSim1() : getSim(),
    getGw: () => focusedPaneIndex === PANE_RIGHT ? pane1.gw : gw,
    getGh: () => focusedPaneIndex === PANE_RIGHT ? pane1.gh : gh,
    draw, getInitSim: () => focusedPaneIndex === PANE_RIGHT ? simManager1.initSim : simManager.initSim,
    getSaveData: () => saveNow,
    get graph() { return focusedPaneIndex === PANE_RIGHT ? pane1.graph : graph; },
    getGraphTheme: () => focusedPaneIndex === PANE_RIGHT ? pane1.graphTheme : graphTheme,
    setGraphTheme: v => { if (focusedPaneIndex === PANE_RIGHT) { pane1.graphTheme = v; applyPaneCanvasBg(pane1Container, v); } else { graphTheme = v; applyPaneCanvasBg(pixiContainer, v); } applyUIToFocusedPane(v); saveNow(); _syncGraphToOtherPanes_impl?.(); draw(); },
    getDefaultValues: () => {
      const preset = presetDefaults as Record<string, number | boolean | string>;
      return {
        defaultLinkDistance: (preset.linkDist as number) ?? DEFAULT_SETTINGS.linkDist,
        defaultFontSize: (preset.labelSize as number) ?? DEFAULT_SETTINGS.labelSize,
        defaultCharge: (preset.charge as number) ?? DEFAULT_SETTINGS.charge,
        defaultLinkStrength: (preset.linkStr as number) ?? DEFAULT_SETTINGS.linkStr,
        defaultCollideRadius: (preset.collideR as number) ?? DEFAULT_SETTINGS.collideR,
        defaultCenterStrength: (preset.centerS as number) ?? DEFAULT_SETTINGS.centerS,
        defaultGroupBound: (preset.groupBound as number) ?? DEFAULT_SETTINGS.groupBound,
        defaultHeatingTime: (preset.heatingTime as number) ?? DEFAULT_SETTINGS.heatingTime,
        defaultAlphaTarget: (preset.alphaTarget as number) ?? DEFAULT_SETTINGS.alphaTarget,
        defaultEditPanelOpacity: (preset.editPanelOpacity as number) ?? DEFAULT_SETTINGS.editPanelOpacity,
        defaultUseRAFL: (preset.useRAFL as boolean) ?? DEFAULT_SETTINGS.useRAFL,
        defaultFocusMode: (preset.focusMode as boolean) ?? DEFAULT_SETTINGS.focusMode,
        defaultGlowAppearance: (preset.glowAppearance as boolean) ?? DEFAULT_SETTINGS.glowAppearance,
        defaultGridWidth: (preset.gridWidth as number) ?? DEFAULT_SETTINGS.gridWidth,
        defaultNodeExpand: (preset.nodeExpand as number) ?? DEFAULT_SETTINGS.nodeExpand,
        defaultLineExpand: (preset.lineExpand as number) ?? DEFAULT_SETTINGS.lineExpand,
        defaultShowGLabels: (preset.showGLabels as boolean) ?? DEFAULT_SETTINGS.showGLabels,
        defaultGlMin: (preset.glMin as number) ?? DEFAULT_SETTINGS.glMin,
        defaultGlMax: (preset.glMax as number) ?? DEFAULT_SETTINGS.glMax,
        defaultGridVis: (preset.gridVis as boolean) ?? DEFAULT_SETTINGS.gridVis,
        defaultGridMode: (preset.gridMode as 'line' | 'dot') || DEFAULT_SETTINGS.gridMode,
        defaultAxisVis: (preset.axisVis as boolean) ?? DEFAULT_SETTINGS.axisVis,
        defaultAxisTicks: (preset.axisTicks as boolean) ?? DEFAULT_SETTINGS.axisTicks,
        defaultGridSpacing: (preset.gridSp as number) ?? DEFAULT_SETTINGS.gridSp,
        defaultAr: (preset.ar as number) ?? DEFAULT_SETTINGS.ar,
        defaultGraphTheme: (preset.graphTheme as string) ?? DEFAULT_SETTINGS.graphTheme,
      };
    },
    getFocusMode: () => focusedPaneIndex === PANE_RIGHT ? (pane1 as any)['focusMode'] : focusMode, setFocusMode: v => { if (focusedPaneIndex === PANE_RIGHT) (pane1 as any)['focusMode'] = v; else focusMode = v; },
    getGlowAppearance: () => focusedPaneIndex === PANE_RIGHT ? (pane1 as any)['glowAppearance'] : glowAppearance, setGlowAppearance: v => { if (focusedPaneIndex === PANE_RIGHT) (pane1 as any)['glowAppearance'] = v; else glowAppearance = v; draw(); },
    getEdgeColorGradient: () => edgeColorGradient, setEdgeColorGradient: v => { edgeColorGradient = v; draw(); },
    getEdgeWidthByLevel: () => edgeWidthByLevel, setEdgeWidthByLevel: v => { edgeWidthByLevel = v; draw(); },
    getGridWidth: () => focusedPaneIndex === PANE_RIGHT ? (pane1 as any)['gridWidth'] : gridWidth, setGridWidth: v => { if (focusedPaneIndex === PANE_RIGHT) (pane1 as any)['gridWidth'] = v; else gridWidth = v; },
  });
  // 图区自定义保留在底部（滑块/复选框直接修改当前图）

  // 设置面板 + 预设
  const SETTING_PRESETS_KEY = `fg-setting-presets`;
  let settingPresets: { name: string; values: Partial<GraphSettings> }[] = [];
  try { settingPresets = JSON.parse(localStorage.getItem(SETTING_PRESETS_KEY) || '[]'); } catch {}
  const saveSettingPresets = () => localStorage.setItem(SETTING_PRESETS_KEY, JSON.stringify(settingPresets));

  const getFocusedSettingValues = (): Partial<GraphSettings> => {
    const isExtra = focusedPaneIndex === PANE_RIGHT;
    const src = isExtra ? pane1 : { linkDist, labelSize, charge, linkStr, collideR, centerS, groupBound, heatingTime, alphaTarget, editPanelOpacity, useRAFL, nodeExpand, lineExpand, showGLabels, glMin, glMax, gridVis, gridMode, axisVis, axisTicks, gridSp, gridWidth, ar, graphTheme, focusMode, glowAppearance, activeMode, gridSnapEnabled, partialGridSnap, nodeColorStyle, fontFamily };
    return {
      linkDist: src.linkDist, labelSize: src.labelSize, charge: src.charge, linkStr: src.linkStr,
      collideR: src.collideR, centerS: src.centerS, groupBound: src.groupBound,
      heatingTime: src.heatingTime, alphaTarget: src.alphaTarget, editPanelOpacity: src.editPanelOpacity,
      useRAFL: src.useRAFL, nodeExpand: src.nodeExpand, lineExpand: src.lineExpand,
      showGLabels: src.showGLabels, glMin: src.glMin, glMax: src.glMax,
      gridVis: src.gridVis, gridMode: src.gridMode, axisVis: src.axisVis,
      axisTicks: src.axisTicks, gridSp: src.gridSp, gridWidth: src.gridWidth,
      ar: src.ar, graphTheme: src.graphTheme, focusMode: src.focusMode,
      glowAppearance: src.glowAppearance, edgeColorGradient, edgeWidthByLevel,
      layoutMode: src.activeMode, gridSnap: src.gridSnapEnabled, partialGridSnap: src.partialGridSnap,
      nodeColorStyle: src.nodeColorStyle, fontFamily: src.fontFamily,
    };
  };

  const applySettingValues = (vals: Partial<GraphSettings>) => {
    const isExtra = focusedPaneIndex === PANE_RIGHT;
    for (const [k, v] of Object.entries(vals)) {
      if (k === 'linkDist') { if (isExtra) pane1.linkDist = v as number; else linkDist = v as number; }
      else if (k === 'labelSize') { if (isExtra) pane1.labelSize = v as number; else labelSize = v as number; }
      else if (k === 'charge') { if (isExtra) pane1.charge = v as number; else charge = v as number; }
      else if (k === 'linkStr') { if (isExtra) pane1.linkStr = v as number; else linkStr = v as number; }
      else if (k === 'collideR') { if (isExtra) pane1.collideR = v as number; else collideR = v as number; }
      else if (k === 'centerS') { if (isExtra) pane1.centerS = v as number; else centerS = v as number; }
      else if (k === 'groupBound') { if (isExtra) pane1.groupBound = v as number; else groupBound = v as number; }
      else if (k === 'heatingTime') { if (isExtra) pane1.heatingTime = v as number; else heatingTime = v as number; }
      else if (k === 'alphaTarget') { if (isExtra) pane1.alphaTarget = v as number; else alphaTarget = v as number; }
      else if (k === 'editPanelOpacity') { const vn = v as number; if (isExtra) pane1.editPanelOpacity = vn; else editPanelOpacity = vn; updateOpacity(vn); }
      else if (k === 'useRAFL') { if (isExtra) pane1.useRAFL = v as boolean; else useRAFL = v as boolean; }
      else if (k === 'nodeExpand') { if (isExtra) pane1.nodeExpand = v as number; else nodeExpand = v as number; }
      else if (k === 'lineExpand') { if (isExtra) pane1.lineExpand = v as number; else lineExpand = v as number; }
      else if (k === 'showGLabels') { if (isExtra) pane1.showGLabels = v as boolean; else showGLabels = v as boolean; }
      else if (k === 'glMin') { if (isExtra) pane1.glMin = v as number; else glMin = v as number; }
      else if (k === 'glMax') { if (isExtra) pane1.glMax = v as number; else glMax = v as number; }
      else if (k === 'gridVis') { if (isExtra) pane1.gridVis = v as boolean; else gridVis = v as boolean; }
      else if (k === 'gridMode') { if (isExtra) pane1.gridMode = v as 'line' | 'dot'; else gridMode = v as 'line' | 'dot'; }
      else if (k === 'axisVis') { if (isExtra) pane1.axisVis = v as boolean; else axisVis = v as boolean; }
      else if (k === 'axisTicks') { if (isExtra) pane1.axisTicks = v as boolean; else axisTicks = v as boolean; }
      else if (k === 'gridSp') { if (isExtra) pane1.gridSp = v as number; else gridSp = v as number; }
      else if (k === 'gridWidth') { if (isExtra) pane1.gridWidth = v as number; else gridWidth = v as number; }
      else if (k === 'ar') { const vn = v as number; if (isExtra) pane1.ar = vn; else ar = vn; }
      else if (k === 'graphTheme') { const vs = v as string; if (isExtra) { pane1.graphTheme = vs; applyPaneCanvasBg(pane1Container, vs); } else { graphTheme = vs; applyPaneCanvasBg(pixiContainer, vs); } applyUIToFocusedPane(vs); }
      else if (k === 'focusMode') { if (isExtra) pane1.focusMode = v as boolean; else focusMode = v as boolean; }
      else if (k === 'glowAppearance') { if (isExtra) pane1.glowAppearance = v as boolean; else glowAppearance = v as boolean; }
      else if (k === 'edgeColorGradient') edgeColorGradient = v as boolean;
      else if (k === 'edgeWidthByLevel') edgeWidthByLevel = v as boolean;
      else if (k === 'nodeColorStyle') { if (isExtra) pane1.nodeColorStyle = v as 'uniform' | 'hierarchical' | 'spectrum' | 'spectrum-narrow'; else nodeColorStyle = v as 'uniform' | 'hierarchical' | 'spectrum' | 'spectrum-narrow'; }
      else if (k === 'partialGridSnap') { if (isExtra) pane1.partialGridSnap = v as boolean; else partialGridSnap = v as boolean; }
      else if (k === 'gridSnap') { if (isExtra) pane1.gridSnapEnabled = v as boolean; else gridSnapEnabled = v as boolean; }
      else if (k === 'fontFamily') { const vs = v as string; if (isExtra) pane1.fontFamily = vs; else fontFamily = vs; document.documentElement.style.setProperty('--fg-font-family', vs); setNodeFontFamily(vs); }
      else if (k === 'categoryLayout') { if (isExtra) pane1.categoryLayout = v as boolean; else categoryLayout = v as boolean; }
      else if (k === 'layoutMode') { const vs = v as string; if (isExtra) pane1.activeMode = vs; else activeMode = vs; loadLayouts(); renderModeBar(); }
    }
  };

  // 默认预设（新建图和"恢复默认"时采用）
  const PRESET_DEFAULT_KEY = 'fg-preset-default';
  let presetDefaults: Partial<GraphSettings> = {};
  try { presetDefaults = JSON.parse(localStorage.getItem(PRESET_DEFAULT_KEY) || '{}'); } catch {}


  // 预设编辑面板（独立于图区自定义，读写 presetDefaults）
  const presetSetDiv = document.createElement('div');
  presetSetDiv.style.cssText = 'padding:4px 0;';
  const _buildPresetSettings = () => buildSettings(presetSetDiv, {
    getLinkDist: () => (presetDefaults.linkDist as number) ?? DEFAULT_SETTINGS.linkDist,
    setLinkDist: v => { presetDefaults.linkDist = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    getLabelSize: () => (presetDefaults.labelSize as number) ?? DEFAULT_SETTINGS.labelSize,
    setLabelSize: v => { presetDefaults.labelSize = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    getCharge: () => (presetDefaults.charge as number) ?? DEFAULT_SETTINGS.charge,
    setCharge: v => { presetDefaults.charge = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    getLinkStr: () => (presetDefaults.linkStr as number) ?? DEFAULT_SETTINGS.linkStr,
    setLinkStr: v => { presetDefaults.linkStr = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    getCollideR: () => (presetDefaults.collideR as number) ?? DEFAULT_SETTINGS.collideR,
    setCollideR: v => { presetDefaults.collideR = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    getCenterS: () => (presetDefaults.centerS as number) ?? DEFAULT_SETTINGS.centerS,
    setCenterS: v => { presetDefaults.centerS = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    getGroupBound: () => (presetDefaults.groupBound as number) ?? DEFAULT_SETTINGS.groupBound,
    setGroupBound: v => { presetDefaults.groupBound = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    getHeatingTime: () => (presetDefaults.heatingTime as number) ?? DEFAULT_SETTINGS.heatingTime,
    setHeatingTime: v => { presetDefaults.heatingTime = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    getAlphaTarget: () => (presetDefaults.alphaTarget as number) ?? DEFAULT_SETTINGS.alphaTarget,
    setAlphaTarget: v => { presetDefaults.alphaTarget = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    getEditPanelOpacity: () => (presetDefaults.editPanelOpacity as number) ?? DEFAULT_SETTINGS.editPanelOpacity,
    setEditPanelOpacity: v => { presetDefaults.editPanelOpacity = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    getUseRAFL: () => (presetDefaults.useRAFL as boolean) ?? DEFAULT_SETTINGS.useRAFL,
    setUseRAFL: v => { presetDefaults.useRAFL = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    getNodeExpand: () => (presetDefaults.nodeExpand as number) ?? DEFAULT_SETTINGS.nodeExpand,
    setNodeExpand: v => { presetDefaults.nodeExpand = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    getLineExpand: () => (presetDefaults.lineExpand as number) ?? DEFAULT_SETTINGS.lineExpand,
    setLineExpand: v => { presetDefaults.lineExpand = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    getShowGLabels: () => (presetDefaults.showGLabels as boolean) ?? DEFAULT_SETTINGS.showGLabels,
    setShowGLabels: v => { presetDefaults.showGLabels = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    getGlMin: () => (presetDefaults.glMin as number) ?? DEFAULT_SETTINGS.glMin,
    setGlMin: v => { presetDefaults.glMin = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    getGlMax: () => (presetDefaults.glMax as number) ?? DEFAULT_SETTINGS.glMax,
    setGlMax: v => { presetDefaults.glMax = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    getGridVis: () => (presetDefaults.gridVis as boolean) ?? DEFAULT_SETTINGS.gridVis,
    setGridVis: v => { presetDefaults.gridVis = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    getGridMode: () => (presetDefaults.gridMode as 'line' | 'dot') || DEFAULT_SETTINGS.gridMode,
    setGridMode: v => { presetDefaults.gridMode = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    getAxisVis: () => (presetDefaults.axisVis as boolean) ?? DEFAULT_SETTINGS.axisVis,
    setAxisVis: v => { presetDefaults.axisVis = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    getAxisTicks: () => (presetDefaults.axisTicks as boolean) ?? DEFAULT_SETTINGS.axisTicks,
    setAxisTicks: v => { presetDefaults.axisTicks = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    getGridSp: () => (presetDefaults.gridSp as number) ?? DEFAULT_SETTINGS.gridSp,
    setGridSp: v => { presetDefaults.gridSp = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    getAr: () => (presetDefaults.ar as number) ?? DEFAULT_SETTINGS.ar,
    setAr: v => { presetDefaults.ar = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    getSimulation: getSim, getGw: () => gw, getGh: () => gh,
    draw: () => {}, getInitSim: () => () => {}, getSaveData: () => async () => {},
    graph, setGraphTheme: v => { presetDefaults.graphTheme = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    getGraphTheme: () => (presetDefaults.graphTheme as string) ?? DEFAULT_SETTINGS.graphTheme,
    getDefaultValues: () => ({
      defaultLinkDistance: DEFAULT_SETTINGS.linkDist,
      defaultFontSize: DEFAULT_SETTINGS.labelSize,
      defaultCharge: DEFAULT_SETTINGS.charge,
      defaultLinkStrength: DEFAULT_SETTINGS.linkStr,
      defaultCollideRadius: DEFAULT_SETTINGS.collideR,
      defaultCenterStrength: DEFAULT_SETTINGS.centerS,
      defaultGroupBound: DEFAULT_SETTINGS.groupBound,
      defaultHeatingTime: DEFAULT_SETTINGS.heatingTime,
      defaultAlphaTarget: DEFAULT_SETTINGS.alphaTarget,
      defaultEditPanelOpacity: DEFAULT_SETTINGS.editPanelOpacity,
      defaultUseRAFL: DEFAULT_SETTINGS.useRAFL,
      defaultFocusMode: DEFAULT_SETTINGS.focusMode,
      defaultGlowAppearance: DEFAULT_SETTINGS.glowAppearance,
      defaultGridWidth: DEFAULT_SETTINGS.gridWidth,
      defaultNodeExpand: DEFAULT_SETTINGS.nodeExpand,
      defaultLineExpand: DEFAULT_SETTINGS.lineExpand,
      defaultShowGLabels: DEFAULT_SETTINGS.showGLabels,
      defaultGlMin: DEFAULT_SETTINGS.glMin,
      defaultGlMax: DEFAULT_SETTINGS.glMax,
      defaultGridVis: DEFAULT_SETTINGS.gridVis,
      defaultGridMode: DEFAULT_SETTINGS.gridMode,
      defaultAxisVis: DEFAULT_SETTINGS.axisVis,
      defaultAxisTicks: DEFAULT_SETTINGS.axisTicks,
      defaultGridSpacing: DEFAULT_SETTINGS.gridSp,
      defaultAr: DEFAULT_SETTINGS.ar,
      defaultGraphTheme: DEFAULT_SETTINGS.graphTheme,
    }),
    getFocusMode: () => (presetDefaults.focusMode as boolean) ?? DEFAULT_SETTINGS.focusMode,
    setFocusMode: v => { presetDefaults.focusMode = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    getGlowAppearance: () => (presetDefaults.glowAppearance as boolean) ?? DEFAULT_SETTINGS.glowAppearance,
    setGlowAppearance: v => { presetDefaults.glowAppearance = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    getEdgeColorGradient: () => (presetDefaults.edgeColorGradient as boolean) ?? false, setEdgeColorGradient: v => { presetDefaults.edgeColorGradient = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    getEdgeWidthByLevel: () => (presetDefaults.edgeWidthByLevel as boolean) ?? false, setEdgeWidthByLevel: v => { presetDefaults.edgeWidthByLevel = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    getGridWidth: () => (presetDefaults.gridWidth as number) ?? DEFAULT_SETTINGS.gridWidth,
    setGridWidth: v => { presetDefaults.gridWidth = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
  });

  // 节点默认色（预设）
  const presetColorRow = document.createElement('div');
  presetColorRow.style.cssText = `display:flex;align-items:center;gap:8px;margin-top:6px;font-size:${V('--fg-font-sm','0.84em')};`;
  const presetColorLabel = document.createElement('span');
  presetColorLabel.textContent = '节点默认色:';
  presetColorLabel.style.cssText = `color:${V('--fg-text-muted','#999')}`;
  presetColorRow.appendChild(presetColorLabel);
  const presetColorSelect = document.createElement('select');
  presetColorSelect.style.cssText = `font-size:${V('--fg-font-sm','0.84em')};padding:1px 4px;border:1px solid ${V('--fg-input-border','#ccc')};border-radius:3px;background:${V('--fg-surface','#2a2a2a')};color:${V('--fg-text','#d0d0d0')};`;
  ['uniform','hierarchical','spectrum','spectrum-narrow'].forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v === 'uniform' ? '统一' : v === 'hierarchical' ? '分级' : v === 'spectrum-narrow' ? '分级窄' : '多彩分级';
    presetColorSelect.appendChild(opt);
  });
  presetColorSelect.value = (presetDefaults.nodeColorStyle as string) || (DEFAULT_SETTINGS.nodeColorStyle as string);
  presetColorSelect.onchange = () => {
    presetDefaults.nodeColorStyle = presetColorSelect.value;
    localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults));
  };
  presetColorRow.appendChild(presetColorSelect);
  presetSetDiv.appendChild(presetColorRow);

  // 字体（预设）
  const presetFontRow = document.createElement('div');
  presetFontRow.style.cssText = `display:flex;align-items:center;gap:8px;margin-top:4px;font-size:${V('--fg-font-sm','0.84em')};`;
  const presetFontLabel = document.createElement('span');
  presetFontLabel.textContent = '字体:';
  presetFontLabel.style.cssText = `color:${V('--fg-text-muted','#999')}`;
  presetFontRow.appendChild(presetFontLabel);
  const presetFontSelect = document.createElement('select');
  presetFontSelect.style.cssText = `font-size:${V('--fg-font-sm','0.84em')};padding:1px 4px;border:1px solid ${V('--fg-input-border','#ccc')};border-radius:3px;background:${V('--fg-surface','#2a2a2a')};color:${V('--fg-text','#d0d0d0')};`;
  [['system-ui, -apple-system, sans-serif', '系统默认'], ['"SiYuan Songti", serif', '思源宋体']].forEach(([val, label]) => {
    const opt = document.createElement('option');
    opt.value = val; opt.textContent = label;
    presetFontSelect.appendChild(opt);
  });
  presetFontSelect.value = (presetDefaults.fontFamily as string) || DEFAULT_SETTINGS.fontFamily || '"SiYuan Songti", serif';
  presetFontSelect.onchange = () => {
    presetDefaults.fontFamily = presetFontSelect.value;
    localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults));
  };
  presetFontRow.appendChild(presetFontSelect);
  presetSetDiv.appendChild(presetFontRow);

  // 构建预设设置面板（在颜色/字体行之后，保证"恢复默认"按钮在最底部）
  const presetSettingsUI = _buildPresetSettings();

  const settingsPanel = createSettingsPanel(document.body, presetSetDiv, {
    onSavePreset: async (name) => {
      const vals = getFocusedSettingValues();
      if (name === '默认') {
        // 保存为"默认"预设 → 同时更新 presetDefaults
        presetDefaults = vals;
        localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(vals));
      }
      const exists = settingPresets.findIndex(p => p.name === name);
      if (exists >= 0) { if (!await confirmAction(`覆盖 "${name}"？`)) return; settingPresets.splice(exists, 1); }
      settingPresets.push({ name, values: vals });
      saveSettingPresets();
    },
    onLoadPreset: (name) => {
      if (name === '默认') {
        applySettingValues(presetDefaults);
      } else {
        const p = settingPresets.find(p => p.name === name);
        if (p) { applySettingValues(p.values); }
      }
      settingsUI.updateInfo(); presetSettingsUI.updateInfo();
      // rebuild() 清空了 presetSetDiv 的 DOM 子元素，需重新挂载自定义控件
      if (presetSetDiv.firstChild) {
        presetSetDiv.insertBefore(presetColorRow, presetSetDiv.firstChild);
        presetSetDiv.insertBefore(presetFontRow, presetSetDiv.firstChild);
      }
      const isExtra = focusedPaneIndex === PANE_RIGHT;
      const sm = isExtra ? simManager1 : simManager;
      scheduleSave(); sm.initSim(); draw();
    },
    onDeletePreset: (name) => {
      settingPresets = settingPresets.filter(p => p.name !== name);
      saveSettingPresets();
    },
    onResetDefaults: () => {
      // 重置预设默认并应用到当前图
      presetDefaults = {
        linkDist: DEFAULT_SETTINGS.linkDist, labelSize: DEFAULT_SETTINGS.labelSize,
        charge: DEFAULT_SETTINGS.charge, linkStr: DEFAULT_SETTINGS.linkStr,
        collideR: DEFAULT_SETTINGS.collideR, centerS: DEFAULT_SETTINGS.centerS,
        groupBound: DEFAULT_SETTINGS.groupBound, heatingTime: DEFAULT_SETTINGS.heatingTime,
        alphaTarget: DEFAULT_SETTINGS.alphaTarget, editPanelOpacity: DEFAULT_SETTINGS.editPanelOpacity,
        useRAFL: DEFAULT_SETTINGS.useRAFL, nodeExpand: DEFAULT_SETTINGS.nodeExpand,
        lineExpand: DEFAULT_SETTINGS.lineExpand, showGLabels: DEFAULT_SETTINGS.showGLabels,
        glMin: DEFAULT_SETTINGS.glMin, glMax: DEFAULT_SETTINGS.glMax,
        gridVis: DEFAULT_SETTINGS.gridVis, gridMode: DEFAULT_SETTINGS.gridMode, axisVis: DEFAULT_SETTINGS.axisVis,
        axisTicks: DEFAULT_SETTINGS.axisTicks, gridSp: DEFAULT_SETTINGS.gridSp,
        gridWidth: DEFAULT_SETTINGS.gridWidth, ar: DEFAULT_SETTINGS.ar,
        graphTheme: DEFAULT_SETTINGS.graphTheme, focusMode: DEFAULT_SETTINGS.focusMode,
        glowAppearance: DEFAULT_SETTINGS.glowAppearance,
        nodeColorStyle: DEFAULT_SETTINGS.nodeColorStyle,
        fontFamily: DEFAULT_SETTINGS.fontFamily || '"SiYuan Songti", serif',
        edgeColorGradient: DEFAULT_SETTINGS.edgeColorGradient,
        edgeWidthByLevel: DEFAULT_SETTINGS.edgeWidthByLevel,
      };
      localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults));
      applySettingValues(presetDefaults);
      settingsUI.updateInfo(); presetSettingsUI.updateInfo();
      // rebuild() 清空了 presetSetDiv 的 DOM 子元素，需重新挂载自定义控件
      presetSetDiv.appendChild(presetColorRow);
      presetSetDiv.appendChild(presetFontRow);
      const isExtra = focusedPaneIndex === PANE_RIGHT;
      const sm = isExtra ? simManager1 : simManager;
      scheduleSave(); sm.initSim(); draw();
    },
    getPresets: () => settingPresets,
    onOpenFolder: async () => {
      // 1. Android SAF 原生目录选择器（Obsidian 式）
      const cap = (window as any).Capacitor;
      if (cap?.Plugins?.SafPlugin) {
        try {
          const dir = await safPickDirectory();
          if (dir) {
            fileSystemMountPath = dir.name;
            await refreshFileTree();
            showToast(`已打开: ${dir.name}`, 'success');
            return;
          }
          showToast('未选中目录', 'warning');
          return;
        } catch (e: any) {
          showToast('SAF 失败: ' + (e.message || '未知'), 'error');
          return;
        }
      }
      // 2. 桌面 Electron
      const ea = (window as any).electronAPI;
      if (ea?.openFolder) {
        const folderPath = await ea.openFolder();
        if (folderPath) {
          ea.configWrite({ folderPath });
          fileSystemMountPath = folderPath;
          await refreshFileTree();
          return;
        }
      }
      // 3. Web File System Access API (showDirectoryPicker)
      try {
        const h = await openFolder();
        if (h) {
          await saveFolderHandle(h);
          fileSystemMountPath = h.name;
          await refreshFileTree();
          return;
        }
      } catch {}
      // 4. 兜底：同步创建 input 并 click
      triggerFileImport();
    },
    getFolderPath: () => fileSystemMountPath || '（未选择）',
    getFileImporter: undefined, // 所有平台统一用 onOpenFolder → 同步 input.click()
    getAutoUpdate: () => false,
    onToggleAutoUpdate: (_val: boolean) => {},
    onCheckUpdate: async () => { showToast('当前已是最新版本', 'success'); },
    onDownloadInstall: () => {},
  });

  // 快捷键说明（预设设置区下方）
  const shortcutsDetails = document.createElement('details');
  shortcutsDetails.style.cssText = 'margin-top:8px;';
  const shortcutsSum = document.createElement('summary');
  shortcutsSum.textContent = '快捷键';
  shortcutsSum.style.cssText = `font-size:${V('--fg-font-sm', '0.84em')};cursor:pointer;opacity:0.6;padding:2px 0;`;
  shortcutsDetails.appendChild(shortcutsSum);
  const shortcutsDiv = document.createElement('div');
  shortcutsDiv.style.cssText = `font-size:${V('--fg-font-xs', '0.72em')};color:${V('--fg-text-muted','#999')};padding:4px 0;line-height:1.6;display:flex;flex-direction:column;gap:2px;`;
  const addShortcut = (key: string, desc: string) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;';
    const kbd = document.createElement('code');
    kbd.textContent = key;
    kbd.style.cssText = `background:${V('--fg-button-bg','#444')};padding:0 5px;border-radius:3px;min-width:50px;text-align:center;font-weight:600;`;
    const d = document.createElement('span');
    d.textContent = desc;
    row.appendChild(kbd); row.appendChild(d);
    shortcutsDiv.appendChild(row);
  };
  addShortcut('F', '有选中节点→切换固定；无选中→回正视口');
  addShortcut('Ctrl+Z', '撤销');
  addShortcut('Ctrl+Shift+Z', '重做');
  addShortcut('Ctrl+S', '保存');
  addShortcut('N', '新建节点');
  addShortcut('Tab', '选中节点→新建子节点');
  addShortcut('Shift+Tab', '选中节点→新建同级节点');
  addShortcut('1-6', '设置选中节点等级');
  addShortcut('Delete', '删除选中');
  addShortcut('Esc', '取消选中 / 取消连线');
  addShortcut('右键拖拽', '节点间快速连线');
  addShortcut('Shift+右键拖拽', '节点间快速连虚线');
  shortcutsDetails.appendChild(shortcutsDiv);
  settingsPanel.panel.appendChild(shortcutsDetails);

  // 节点默认色：统一 / 分级
  const colorStyleRow = document.createElement('div');
  colorStyleRow.style.cssText = `display:flex;align-items:center;gap:8px;margin-top:6px;font-size:${V('--fg-font-sm','0.84em')};`;
  const colorStyleLabel = document.createElement('span');
  colorStyleLabel.textContent = '节点默认色:';
  colorStyleLabel.style.cssText = `color:${V('--fg-text-muted','#999')}`;
  colorStyleRow.appendChild(colorStyleLabel);
  const colorStyleSelect = document.createElement('select');
  colorStyleSelect.style.cssText = `font-size:${V('--fg-font-sm','0.84em')};padding:1px 4px;border:1px solid ${V('--fg-input-border','#ccc')};border-radius:3px;background:${V('--fg-surface','#2a2a2a')};color:${V('--fg-text','#d0d0d0')};`;
  ['uniform','hierarchical','spectrum','spectrum-narrow'].forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v === 'uniform' ? '统一' : v === 'hierarchical' ? '分级' : v === 'spectrum-narrow' ? '分级窄' : '多彩分级';
    colorStyleSelect.appendChild(opt);
  });
  colorStyleSelect.value = nodeColorStyle;
  colorStyleSelect.onchange = () => {
    nodeColorStyle = colorStyleSelect.value as 'uniform' | 'hierarchical' | 'spectrum' | 'spectrum-narrow';
    scheduleSave(); draw();
  };
  colorStyleRow.appendChild(colorStyleSelect);
  settingsDet.appendChild(colorStyleRow);

  // 字体选择
  let fontFamily = (DEFAULT_SETTINGS as any).fontFamily || '"SiYuan Songti", serif';
  const fontStyleRow = document.createElement('div');
  fontStyleRow.style.cssText = `display:flex;align-items:center;gap:8px;margin-top:4px;font-size:${V('--fg-font-sm','0.84em')};`;
  const fontStyleLabel = document.createElement('span');
  fontStyleLabel.textContent = '字体:';
  fontStyleLabel.style.cssText = `color:${V('--fg-text-muted','#999')}`;
  fontStyleRow.appendChild(fontStyleLabel);
  const fontStyleSelect = document.createElement('select');
  fontStyleSelect.style.cssText = `font-size:${V('--fg-font-sm','0.84em')};padding:1px 4px;border:1px solid ${V('--fg-input-border','#ccc')};border-radius:3px;background:${V('--fg-surface','#2a2a2a')};color:${V('--fg-text','#d0d0d0')};`;
  const fontOpts: [string, string][] = [
    ['system-ui, -apple-system, sans-serif', '系统默认'],
    ['"SiYuan Songti", serif', '思源宋体'],
  ];
  fontOpts.forEach(([val, label]) => {
    const opt = document.createElement('option');
    opt.value = val; opt.textContent = label;
    fontStyleSelect.appendChild(opt);
  });
  fontStyleSelect.value = fontFamily;
  fontStyleSelect.onchange = () => {
    fontFamily = fontStyleSelect.value;
    document.documentElement.style.setProperty('--fg-font-family', fontFamily);
    // 覆盖浏览器对表单元素的 font-family 重置
    const styleId = 'fg-font-override';
    let styleEl = document.getElementById(styleId);
    if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = styleId; document.head.appendChild(styleEl); }
    styleEl.textContent = `body,button,input,select,textarea,details,summary,span,a,div,code{font-family:${fontFamily} !important} input[type="checkbox"]{accent-color:var(--fg-accent,#5B8FF9)}`;
    setNodeFontFamily(fontFamily);
    (DEFAULT_SETTINGS as any).fontFamily = fontFamily;
    scheduleSave(); draw();
  };
  fontStyleRow.appendChild(fontStyleSelect);
  settingsDet.appendChild(fontStyleRow);

  updateInfoRef.current = settingsUI.updateInfo;
  updateSelectsRef.current = () => {};

  // --- 搜索事件 ---
  let lastSearchTerm = '';
  let searchMatchIndex = 0;
  fieldSelect.addEventListener('change', () => { sField = fieldSelect.value as any; draw(); });
  matchModeSelect.addEventListener('change', () => { sMatchMode = matchModeSelect.value as any; draw(); });
  modeSelect.addEventListener('change', () => { sDisplayMode = modeSelect.value as any; draw(); });
  searchInput.addEventListener('input', () => {
    search = searchInput.value;
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      searchMatchIndex = 0; lastSearchTerm = search;
      draw();
    }, 150);
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const isExtra = focusedPaneIndex === PANE_RIGHT;
      const sim = isExtra ? getSim1() : getSim();
      const px = isExtra ? pixi1 : pixi;
      const nodes = sim?.nodes() || [];
      const matching = nodes.filter((n: any) => {
        if (!search) return false;
        switch (sField) {
          case 'name': return (n.label || '').toLowerCase().includes(search.toLowerCase());
          case 'tags': return (n.tags || []).some((t: string) => t.toLowerCase().includes(search.toLowerCase()));
          case 'note': return (n.note || '').toLowerCase().includes(search.toLowerCase());
          default: return false;
        }
      });
      if (search !== lastSearchTerm) { searchMatchIndex = 0; lastSearchTerm = search; }
      else { searchMatchIndex = (searchMatchIndex + 1) % (matching.length || 1); }
      if (matching.length > 0 && px) {
        const node = matching[searchMatchIndex];
        const cw = px.app.canvas.clientWidth;
        const ch = px.app.canvas.clientHeight;
        px.viewport.animate({ position: { x: cw / 2 - node.x * px.viewport.scale.x, y: ch / 2 - node.y * px.viewport.scale.y }, time: DURATION.entrance, ease: EASING.easeInOut });
        fillNode(node.id);
      }
    }
  });

  // --- 聚焦窗格状态切换（用于布局/操作等需要访问 singleton 的函数）---
  const withFocusedPane = <T>(fn: () => T): T => {
    if (focusedPaneIndex === PANE_LEFT) return fn();
    // 只交换数据层（graph/sim/config），不交换渲染层（pixi/nodeSprites 保持原样给 pane0Draw）
    saveConfigTo(pane0Config as any);
    const savedGraph = graph, savedSim = simManager, savedUndo = undoManager;
    const savedTree = treeMode, savedCat = categoryMode, savedFull = fullCatMode, savedActive = activeMode;
    const savedSelNode = selNode, savedSelEdge = selEdge, savedSelGroup = selGroup;
    graph = pane1.graph; simManager = simManager1; undoManager = pane1.undoManager;
    loadConfigFrom(pane1);
    treeMode = pane1.treeMode; categoryMode = pane1.categoryMode; fullCatMode = pane1.fullCatMode; activeMode = pane1.activeMode;
    selNode = pane1.selNode; selEdge = pane1.selEdge; selGroup = pane1.selGroup;
    const result = fn();
    saveConfigTo(pane1);
    pane1.treeMode = treeMode; pane1.categoryMode = categoryMode; pane1.fullCatMode = fullCatMode; pane1.activeMode = activeMode;
    pane1.selNode = selNode; pane1.selEdge = selEdge; pane1.selGroup = selGroup;
    graph = savedGraph; simManager = savedSim; undoManager = savedUndo;
    loadConfigFrom(pane0Config as any);
    treeMode = savedTree; categoryMode = savedCat; fullCatMode = savedFull; activeMode = savedActive;
    selNode = savedSelNode; selEdge = savedSelEdge; selGroup = savedSelGroup;
    return result;
  };

  // --- 操作按钮 ---
  const addBtn = document.createElement('button');
  addBtn.textContent = '新建节点'; addBtn.style.cssText = `font-size:${V('--fg-font-md', '0.85em')};padding:2px 8px;cursor:pointer;`;
  // 节点消失动画：标记 _dying，250ms 后真正删除
  function markNodesDying(ids: string[]) {
    const sim = getSim();
    if (sim) {
      for (const sn of sim.nodes()) {
        if (ids.includes(sn.id)) sn._dying = performance.now();
      }
    }
    // 250ms 后清理死节点
    setTimeout(() => {
      const sim2 = getSim();
      if (sim2) {
        const alive = sim2.nodes().filter((n: any) => !n._dying);
        sim2.nodes(alive);
      }
      draw();
    }, 250);
  };

  // 增量添加节点到模拟（避免重启导致画面跳变）
  const addNodeToSim = (node: any) => {
    const sim = getSim();
    if (sim) {
      const sn = { id: node.id, label: node.label, headingLevel: node.headingLevel ?? 6, tags: node.tags ?? [], x: node.x, y: node.y, _isNew: true };
      const currentNodes = sim.nodes();
      currentNodes.push(sn);
      sim.nodes(currentNodes);
      sim.alpha(0.5).alphaTarget(0.3);
      setTimeout(() => sim.alphaTarget(0), 3000);
    }
  };

  // --- 折叠展开动画 ---
  const ANIM_DURATION = 500;

  // 辅助：获取节点等级（数字越小等级越高，默认 6 最低）
  const getNodeLevel = (nodeId: string): number => {
    const gn = graph.nodes.find((n: any) => n.id === nodeId);
    return gn?.headingLevel || 6;
  };

  // BFS 遍历后代，遇到等级更高的节点（headingLevel 更小）时停止向下遍历
  const bfsDescendants = (rootId: string): Map<string, { depth: number; parentId: string | null }> => {
    const info = new Map<string, { depth: number; parentId: string | null }>();
    const queue: Array<{ id: string; depth: number; parentId: string | null }> = [
      { id: rootId, depth: 0, parentId: null },
    ];
    const curLevel = (nodeId: string) => getNodeLevel(nodeId);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (info.has(cur.id)) continue;
      info.set(cur.id, { depth: cur.depth, parentId: cur.parentId });
      const parentLevel = curLevel(cur.id);
      for (const e of graph.edges) {
        const src = typeof e.source === 'object' ? e.source.id : e.source;
        const tgt = typeof e.target === 'object' ? e.target.id : e.target;
        if (src === cur.id && !info.has(tgt)) {
          const tgtLevel = curLevel(tgt);
          if (tgtLevel < parentLevel) continue;
          queue.push({ id: tgt, depth: cur.depth + 1, parentId: cur.id });
        }
      }
    }
    return info;
  };

  // 仅遍历可见后代：遇到 collapsed 节点停止向下。用于展开动画
  const bfsVisibleDescendants = (rootId: string): Map<string, { depth: number; parentId: string | null }> => {
    const info = new Map<string, { depth: number; parentId: string | null }>();
    const queue: Array<{ id: string; depth: number; parentId: string | null }> = [
      { id: rootId, depth: 0, parentId: null },
    ];
    const curLevel = (nodeId: string) => getNodeLevel(nodeId);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (info.has(cur.id)) continue;
      info.set(cur.id, { depth: cur.depth, parentId: cur.parentId });
      // 遇到 collapsed 的非根节点 → 停止向更深遍历
      if (cur.id !== rootId) {
        const gn = graph.nodes.find((n: any) => n.id === cur.id);
        if (gn?.collapsed) continue;
      }
      const parentLevel = curLevel(cur.id);
      for (const e of graph.edges) {
        const src = typeof e.source === 'object' ? e.source.id : e.source;
        const tgt = typeof e.target === 'object' ? e.target.id : e.target;
        if (src === cur.id && !info.has(tgt)) {
          const tgtLevel = curLevel(tgt);
          if (tgtLevel < parentLevel) continue;
          queue.push({ id: tgt, depth: cur.depth + 1, parentId: cur.id });
        }
      }
    }
    return info;
  };

  const animateCollapse = (rootId: string) => {
    const sim = getSim();
    if (!sim) return;

    const rootGn = graph.nodes.find((n: any) => n.id === rootId);
    if (!rootGn?.collapsed) return;

    const descInfo = bfsDescendants(rootId);

    let maxDepth = 0;
    for (const [, info] of descInfo) { if (info.depth > maxDepth) maxDepth = info.depth; }
    if (maxDepth === 0) { draw(); return; }

    const now = performance.now();
    const simNodes = sim.nodes();
    const nodeMap = new Map<string, any>(simNodes.map((n: any) => [n.id, n]));

    for (const [id, info] of descInfo) {
      if (id === rootId) continue;
      const sn = nodeMap.get(id);
      if (!sn) continue;

      if ((sn as any)._expandAnim) delete (sn as any)._expandAnim;
      if ((sn as any)._collapseAnim) continue;

      (sn as any)._collapseAnim = {
        startTime: now + (maxDepth - info.depth) * ANIM_DURATION,
        duration: ANIM_DURATION,
        depth: info.depth,
      };
    }

    // 固定所有不被折叠的 sim 节点，避免被残余力牵扯移动
    const animatingNodeIds = new Set<string>();
    for (const [id] of descInfo) { if (id !== rootId) animatingNodeIds.add(id); }
    const pinnedNodes: any[] = [];
    for (const sn of simNodes) {
      if (!animatingNodeIds.has(sn.id) && sn.fx == null) {
        sn.fx = sn.x; sn.fy = sn.y;
        pinnedNodes.push(sn);
      }
    }
    // 分批逐步解除固定，避免所有节点同时受力突变
    const totalAnimMs = maxDepth * ANIM_DURATION + 400;
    const unpinBatchSize = Math.max(1, Math.floor(pinnedNodes.length / 25));
    const unpinInterval = 40; // ms 每批
    for (let i = 0; i < pinnedNodes.length; i += unpinBatchSize) {
      setTimeout(() => {
        const end = Math.min(i + unpinBatchSize, pinnedNodes.length);
        for (let j = i; j < end; j++) { pinnedNodes[j].fx = null; pinnedNodes[j].fy = null; }
      }, totalAnimMs + (i / unpinBatchSize) * unpinInterval);
    }
    const unpinTotalMs = pinnedNodes.length > 0 ? Math.ceil(pinnedNodes.length / unpinBatchSize) * unpinInterval + 1500 : 1500;
    setTimeout(() => {
      const s = getSim();
      if (s) s.alpha(0.02).alphaTarget(0.003).restart();
    }, totalAnimMs);
    setTimeout(() => {
      const s2 = getSim();
      if (s2) s2.alphaTarget(0);
    }, totalAnimMs + unpinTotalMs);

    // 极低 alpha：够驱动帧刷新，不够产生有感的力学偏移
    sim.alpha(0.05).alphaTarget(0.01).restart();
    draw();
  };

  const animateExpand = (rootId: string) => {
    const sim = getSim();
    if (!sim) return;

    // 边界：根节点已展开 → 跳过
    const rootGn = graph.nodes.find((n: any) => n.id === rootId);
    if (rootGn?.collapsed) return;

    const descInfo = bfsVisibleDescendants(rootId);

    const now = performance.now();
    const simNodes = sim.nodes();
    const nodeMap = new Map<string, any>(simNodes.map((n: any) => [n.id, n]));
    let addedCount = 0;

    // 固定所有不被展开的 sim 节点，避免新增节点瞬间改变力平衡
    const expandNodeIds = new Set<string>([...descInfo.keys()].filter(k => k !== rootId && !nodeMap.has(k)));
    const pinnedNodes2: any[] = [];
    for (const sn of simNodes) {
      if (!expandNodeIds.has(sn.id) && sn.fx == null) {
        sn.fx = sn.x; sn.fy = sn.y;
        pinnedNodes2.push(sn);
      }
    }

    // 按深度排序，确保父节点先处理（子节点可以引用刚添加的父节点位置）
    const sortedDescendants = [...descInfo.entries()]
      .filter(([id]) => id !== rootId && !nodeMap.has(id))
      .sort((a, b) => a[1].depth - b[1].depth);

    for (const [id, info] of sortedDescendants) {
      // 已在 sim 中且正在折叠 → 取消折叠动画，转为展开
      const existing = nodeMap.get(id);
      if (existing && (existing as any)._collapseAnim) {
        delete (existing as any)._collapseAnim;
        (existing as any)._expandAnim = {
          startTime: now + info.depth * ANIM_DURATION,
          duration: ANIM_DURATION,
          depth: info.depth,
        };
        continue;
      }
      if (nodeMap.has(id)) continue;

      const gn = graph.nodes.find((n: any) => n.id === id);
      if (!gn) continue;

      // 放射状均分圆周角
      const depthNodes = sortedDescendants.filter(([_, info2]) => info2.depth === info.depth);
      const idxAtDepth = depthNodes.findIndex(([sId]) => sId === id);
      const angle = (2 * Math.PI * idxAtDepth) / depthNodes.length;
      const spreadR = 60 + info.depth * 50;
      const parentSn = info.parentId ? nodeMap.get(info.parentId) : nodeMap.get(rootId);
      const px = parentSn ? parentSn.x : (gn.x || 0);
      const py = parentSn ? parentSn.y : (gn.y || 0);
      const posX = px + Math.cos(angle) * spreadR;
      const posY = py + Math.sin(angle) * spreadR;

      const sn: any = {
        id: gn.id,
        label: gn.label,
        headingLevel: gn.headingLevel ?? 6,
        tags: gn.tags ?? [],
        x: posX, y: posY,
        _expandAnim: {
          startTime: now + info.depth * ANIM_DURATION,
          duration: ANIM_DURATION,
          depth: info.depth,
        },
      };
      for (const k of ['radius', 'radiusMode', 'color', 'fixed', 'fx', 'fy', 'mediaType', 'mediaUrl', 'hyperlink', 'note', 'collapsed']) {
        if ((gn as any).hasOwnProperty(k)) (sn as any)[k] = (gn as any)[k];
      }

      const currentNodes = sim.nodes();
      currentNodes.push(sn);
      sim.nodes(currentNodes);
      nodeMap.set(id, sn);
      addedCount++;
    }

    if (addedCount > 0) {
      sim.alpha(0.3).alphaTarget(0.1).restart();
      setTimeout(() => sim.alphaTarget(0), 3000);
    }
    // 分批逐步解除固定，与展开动画同步缓和
    let maxExpandDepth = 0;
    for (const [, info] of descInfo) { if (info.depth > maxExpandDepth) maxExpandDepth = info.depth; }
    const expandTotalMs = maxExpandDepth * ANIM_DURATION + 400;
    const unpinBatchSize2 = Math.max(1, Math.floor(pinnedNodes2.length / 25));
    for (let i = 0; i < pinnedNodes2.length; i += unpinBatchSize2) {
      setTimeout(() => {
        const end = Math.min(i + unpinBatchSize2, pinnedNodes2.length);
        for (let j = i; j < end; j++) { pinnedNodes2[j].fx = null; pinnedNodes2[j].fy = null; }
      }, expandTotalMs + (i / unpinBatchSize2) * 40);
    }
    draw();
  };

  addBtn.onclick = () => {
    if (focusedPaneIndex === PANE_RIGHT) {
      const center = pixi1?.viewport?.center ?? { x: pane1.gw / 2, y: pane1.gh / 2 };
      const newNode = { id: 'n_' + Date.now(), label: '新节点', headingLevel: 6, tags: [], x: center.x, y: center.y, _isNew: true };
      pane1.undoManager.pushSnapshot(pane1.graph);
      pane1.graph.nodes.push(newNode); scheduleSave();
      const s1 = simManager1.getSim(); if (s1) { s1.nodes([...s1.nodes(), newNode]); s1.alpha(0.3).restart(); }
      draw();
    } else {
      const center = pixi?.viewport?.center ?? { x: gw / 2, y: gh / 2 };
      const newNode = { id: 'n_' + Date.now(), label: '新节点', headingLevel: 6, tags: [], x: center.x, y: center.y, _isNew: true };
      saveUndo(); graph.nodes.push(newNode); scheduleSave();
      addNodeToSim(newNode);
      draw(); fillNode(newNode.id);
    }
  };
  primaryRow.appendChild(addBtn);
  // 多分屏扩展数组（初始包含 pane1）
  const extraContainers: HTMLDivElement[] = [pane1Container];
  const extraPanes: PaneState[] = [pane1];
  const extraPixis: (PixiLayers | null)[] = [pixi1];
  const extraSims: any[] = [simManager1];
  const extraSprites: Map<string, NodeSprite>[] = [pane1NodeSprites];

  // 即时重绘与聚焦窗格共享 sim 的其他窗格，并同步视觉配置（主题等）
  _syncGraphToOtherPanes_impl = () => {
    const focusedSM = focusedPaneIndex === PANE_LEFT ? simManager
      : (extraSims[focusedPaneIndex - 1] ?? simManager);

    // 聚焦窗格的视觉配置（用于同步到其他窗格）
    const srcTheme = focusedPaneIndex === PANE_LEFT ? graphTheme
      : (extraPanes[focusedPaneIndex - 1]?.graphTheme ?? graphTheme);
    const srcAccentColor = focusedPaneIndex === PANE_LEFT ? _pane0AccentColor
      : (extraPanes[focusedPaneIndex - 1]?.themeAccentColor ?? _pane0AccentColor);
    const srcAccentAltColor = focusedPaneIndex === PANE_LEFT ? _pane0AccentAltColor
      : (extraPanes[focusedPaneIndex - 1]?.themeAccentAltColor ?? _pane0AccentAltColor);

    const renderPane0IfNeeded = () => {
      if (!pixi || simManager !== focusedSM) return;
      const s = pane0St;
      s.graph = graph; s.selNode = selNode; s.selEdge = selEdge; s.selGroup = selGroup;
      s.linkDist = linkDist; s.labelSize = labelSize; s.charge = charge; s.linkStr = linkStr;
      s.collideR = collideR; s.centerS = centerS; s.groupBound = groupBound;
      s.heatingTime = heatingTime; s.alphaTarget = alphaTarget;
      s.editPanelOpacity = editPanelOpacity; s.useRAFL = useRAFL;
      s.nodeExpand = nodeExpand; s.lineExpand = lineExpand;
      s.showGLabels = showGLabels; s.glMin = glMin; s.glMax = glMax;
      s.gridVis = gridVis; s.gridMode = gridMode; s.axisVis = axisVis;
      s.axisTicks = axisTicks; s.gridSp = gridSp; s.gridWidth = gridWidth;
      s.ar = ar; s.graphTheme = graphTheme; s.focusMode = focusMode;
      s.glowAppearance = glowAppearance; s.categoryLayout = categoryLayout;
      s.layoutMode = layoutMode; s.gridSnapEnabled = gridSnapEnabled;
      s.partialGridSnap = partialGridSnap; s.nodeColorStyle = nodeColorStyle;
      s.fixedHollow = fixedHollow; s.fontFamily = fontFamily;
      s.draggingNode = draggingNode; s.wasDragged = wasDragged;
      s.search = search; s.sField = sField; s.sDisplayMode = sDisplayMode; s.sMatchMode = sMatchMode;
      s.linkMode = linkMode; s.linkSrc = linkSrc;
      s.linkCursorX = linkCursorX; s.linkCursorY = linkCursorY;
      s.defArrow = defArrow;
      s.themeAccentColor = _pane0AccentColor; s.themeAccentAltColor = _pane0AccentAltColor;
      s.treeMode = treeMode; s.categoryMode = categoryMode;
      s.fullCatMode = fullCatMode; s.activeMode = activeMode;
      s.gw = gw; s.gh = gh; s.undoManager = undoManager;
      renderPane(pixi!, graph, simManager, nodeSprites, s);
    };

    // 左窗格被其他窗格共享 → 同步主题 + 重绘
    if (focusedPaneIndex !== PANE_LEFT && simManager === focusedSM) {
      graphTheme = srcTheme; _pane0AccentColor = srcAccentColor; _pane0AccentAltColor = srcAccentAltColor;
      applyPaneCanvasBg(pixiContainer, graphTheme);
      renderPane0IfNeeded();
    }
    // 其他窗格共享聚焦窗格的 sim → 同步主题 + 重绘
    for (let i = 0; i < extraPanes.length; i++) {
      if (i + 1 === focusedPaneIndex) continue;
      const sm = extraSims[i]; const px = extraPixis[i]; const pi = extraPanes[i];
      if (!sm || !px || sm !== focusedSM) continue;
      pi.graphTheme = srcTheme;
      pi.themeAccentColor = srcAccentColor;
      pi.themeAccentAltColor = srcAccentAltColor;
      applyPaneCanvasBg(pi.canvasContainer, srcTheme);
      renderPane(px, pi.graph, sm, extraSprites[i], pi);
    }
  };

  function addSplitPane(fileName: string) {
    const newC = dualPane.addPane();
    const idx = extraPanes.length;
    const np = createPaneState(idx, newC);
    extraPanes.push(np);
    extraContainers.push(newC);
    extraPixis.push(null);
    extraSims.push(null);
    extraSprites.push(new Map());
    // 先设置标签（同步），确保 renderAllTabs 能立即显示
    np.openTabs = [fileName]; np.activeTab = fileName;
    createPixiApp(newC).then(async px => {
      extraPixis[idx] = px;
      extraPanes[idx].pixi = px;
      np.pixi = px;
      px.viewport.on('moved', () => { if (readyToDraw) draw(); });
      px.viewport.on('zoomed-end', () => { if (readyToDraw) draw(); });
      extraSims[idx] = createSimManager(
        np.graph, () => np.gw, () => np.gh,
        () => np.linkDist, () => np.linkStr, () => np.charge, () => np.centerS,
        () => np.collideR, () => np.groupBound,
        () => np.alphaTarget, () => np.heatingTime,
        () => sharedState.hiddenNodeIds?.() ?? new Set(),
        () => draw()
      );
      np.simManager = extraSims[idx];
      px.onContextRestored = () => { (extraPanes[idx].simManager || extraSims[idx]).initSim(); draw(); };
      // 加载图数据（可能替换 simManager 为共享的）
      await loadGraphForPane(np, fileName);
      // 在加载之后绑定事件（确保捕获正确的 simManager）
      setupCanvasEvents(px.app.canvas as any, bindPaneEvents(
        np, px, extraSims[idx], extraSprites[idx], { v: null }
      ));
      // 新窗格应用光晕滤镜
      updateBlobFilters();
      // pixi 就绪后刷新标签栏
      renderAllTabs(); draw();
    });
    switchFocusedPane(idx + 1);
    renderAllTabs(); draw();
  }
  function removeSplitPane(idx: number) {
    // idx = extraPanes 索引。idx=0 是 pane1（右窗格），仅隐藏不销毁。
    if (idx < 0 || idx >= extraPanes.length) return;

    if (idx === 0 && extraPanes.length === 1) {
      // 仅剩 pane1 → 隐藏分屏（复用 pane1 数据）
      dualPane.paneContainers[PANE_RIGHT].style.display = 'none';
      for (const d of dualPane.dividers) d.style.display = 'none';
      dualPane.paneContainers[PANE_LEFT].style.width = '100%';
      dualPane.paneContainers[PANE_LEFT].style.left = '0';
      window.dispatchEvent(new CustomEvent('pane-resize'));
      if (focusedPaneIndex === PANE_RIGHT) switchFocusedPane(PANE_LEFT);
      renderAllTabs(); draw();
      return;
    }

    const lastIdx = extraPanes.length - 1;
    const actualIdx = idx + 1;

    // 若移除的是当前聚焦窗格，先切走
    if (focusedPaneIndex === actualIdx) {
      switchFocusedPane(idx > 0 ? idx : PANE_LEFT);
    }

    // 销毁目标窗格的 pixi
    const np = extraPanes[idx];
    if (np.pixi) np.pixi.app.destroy(true);

    // 若不是最后一个，用末尾数据填补空缺（保持各数组索引一致）
    if (idx !== lastIdx) {
      extraPanes[idx] = extraPanes[lastIdx];
      extraPanes[idx].index = idx;
      extraPixis[idx] = extraPixis[lastIdx];
      extraSims[idx] = extraSims[lastIdx];
      extraSprites[idx] = extraSprites[lastIdx];
      extraContainers[idx] = extraContainers[lastIdx];
      extraPanes[idx].canvasContainer = dualPane.paneContainers[idx + 1];
      if (focusedPaneIndex === lastIdx + 1) focusedPaneIndex = idx + 1;
    }

    // 移除末尾
    extraPanes.pop(); extraPixis.pop(); extraSims.pop();
    extraSprites.pop(); extraContainers.pop();
    dualPane.removePane();

    // 修正关联
    for (let i = idx; i < extraPanes.length; i++) {
      extraPanes[i].pixi = extraPixis[i];
      extraPanes[i].simManager = extraSims[i];
      extraPanes[i].index = i;
    }

    // 若 pane1 被替换，同步所有 pane1 快捷引用到新的 extraPanes[0]
    if (idx === 0 && extraPanes.length > 0) {
      const np = extraPanes[0];
      pane1.openTabs = np.openTabs; pane1.activeTab = np.activeTab;
      pane1.graph = np.graph; pane1.dirtyTabs = np.dirtyTabs;
      pane1.saveTimeout = np.saveTimeout;
      pane1.pixi = pixi1 = np.pixi; pane1.simManager = np.simManager;
      pane1.nodeSprites = np.nodeSprites;
      pane1.canvasContainer = np.canvasContainer;
      // simManager1 不变（createSimManager 时已创建，后续通过 np.simManager 访问）
      // pane1NodeSprites 指向 np.nodeSprites
      pane1NodeSprites.clear();
      for (const [k, v] of np.nodeSprites) pane1NodeSprites.set(k, v);
    }

    renderAllTabs(); draw();
  }
  // paneContainers 跟踪（兼容现有引用）
  const paneContainers = dualPane.paneContainers;
  const linkBtn = document.createElement('button');
  linkBtn.textContent = '连线模式'; linkBtn.style.cssText = `font-size:${V('--fg-font-md', '0.85em')};padding:2px 8px;cursor:pointer;`;
  linkBtn.onclick = () => {
    if (focusedPaneIndex === PANE_RIGHT) {
      pane1.linkMode = !pane1.linkMode;
      linkBtn.style.background = pane1.linkMode ? '#5B8FF9' : '';
      linkBtn.style.color = pane1.linkMode ? '#fff' : '';
      if (pane1.linkMode) { pane1.linkSrc = null; showToast('连线模式：点击源节点，再点击目标节点', 'info', 2000); }
      else { showToast('已退出连线模式', 'info'); }
    } else {
      linkMode = !linkMode; linkBtn.style.background = linkMode ? '#5B8FF9' : ''; linkBtn.style.color = linkMode ? '#fff' : '';
      if (linkMode) { linkSrc = null; linkCursorX = 0; linkCursorY = 0; showToast('连线模式：点击源节点，再点击目标节点', 'info', 2000); }
      else { showToast('已退出连线模式', 'info'); }
    }
  };
  primaryRow.appendChild(linkBtn);
  const refreshBtn = document.createElement('button');
  refreshBtn.textContent = '刷新'; refreshBtn.style.cssText = `font-size:${V('--fg-font-md', '0.85em')};padding:2px 8px;cursor:pointer;`;
  refreshBtn.onclick = async () => {
    if (focusedPaneIndex === PANE_RIGHT) {
      if (pane1.activeTab === 'demo') {
        const demo = JSON.parse(JSON.stringify(DEMO_DATA));
        pane1.graph.nodes = demo.nodes; pane1.graph.edges = demo.edges; pane1.graph.groups = demo.groups;
        await writeGraphData('demo', pane1.graph);
      } else {
        const saved = await readGraphData(pane1.activeTab);
        if (saved) { pane1.graph.nodes = saved.nodes; pane1.graph.edges = saved.edges || []; pane1.graph.groups = saved.groups || []; }
      }
      simManager1.initSim(); draw();
      return;
    }
    if (activeMode === 'tree') { applyTreeLayout(); return; }
    if (activeMode === 'category') { applyCategoryLayout(false); return; }
    if (activeMode === 'fullcat') { applyCategoryLayout(true); return; }
    if (activeTab === 'demo') {
      const demo = JSON.parse(JSON.stringify(DEMO_DATA));
      graph.nodes = demo.nodes; graph.edges = demo.edges; graph.groups = demo.groups;
      graph.settings = demo.settings || graph.settings;
      await writeGraphData('demo', graph);
    } else {
      const saved = await readGraphData(activeTab);
      if (saved) { graph.nodes = saved.nodes; graph.edges = saved.edges || []; graph.groups = saved.groups || []; }
    }
    simManager.initSim(); draw();
  };
  primaryRow.appendChild(refreshBtn);
  // --- 布局切换时保存/恢复固定节点 ---
  let savedFixedNodes: { id: string; x: number; y: number; fx: number | null; fy: number | null; fixed: boolean }[] = [];
  let savedGroupModes: { id: string; mode: string; nodeColorMode: string; nodeColor: string }[] = [];
  const saveFixedState = () => {
    savedFixedNodes = graph.nodes.map(n => ({ id: n.id, x: n.x, y: n.y, fx: n.fx, fy: n.fy, fixed: n.fixed || false }));
    savedGroupModes = graph.groups.map(g => ({ id: g.id, mode: g.displayMode, nodeColorMode: g.nodeColorMode || 'off', nodeColor: g.nodeColor || g.color || '#5B8FF9' }));
  };
  const restoreFixedState = () => {
    for (const s of savedFixedNodes) {
      const n = graph.nodes.find(n => n.id === s.id);
      if (n) { n.x = s.x; n.y = s.y; n.fx = s.fx; n.fy = s.fy; n.fixed = s.fixed; }
    }
    for (const gs of savedGroupModes) {
      const g = graph.groups.find(g => g.id === gs.id);
      if (g) { g.displayMode = gs.mode as any; g.nodeColorMode = gs.nodeColorMode as any; g.nodeColor = gs.nodeColor; }
    }
  };

  // --- 树形布局 ---
  let treeMode = false;
  const treeBtn = document.createElement('button');
  treeBtn.textContent = '树形'; treeBtn.style.cssText = `font-size:${V('--fg-font-md', '0.85em')};padding:2px 8px;cursor:pointer;`;
  treeBtn.onclick = () => {
    const isExtra = focusedPaneIndex === PANE_RIGHT;
    const _g = isExtra ? pane1.graph : graph;
    const _sm = isExtra ? simManager1 : simManager;
    if (categoryMode || fullCatMode) { if (!isExtra) saveFixedState(); }
    if (!isExtra) { treeMode = !treeMode; }
    else { pane1.treeMode = !pane1.treeMode; }
    treeBtn.style.background = ((isExtra ? pane1.treeMode : treeMode)) ? '#5B8FF9' : '';
    treeBtn.style.color = ((isExtra ? pane1.treeMode : treeMode)) ? '#fff' : '';
    if (fullCatMode) { fullCatBtn.click(); }
    if (categoryMode) { if (!isExtra) categoryMode = false; catBtn.style.background = ''; catBtn.style.color = ''; }
    if ((isExtra ? pane1.treeMode : treeMode)) {
      for (const n of _g.nodes) { n.fixed = false; n.fx = null; n.fy = null; }
      for (const e of _g.edges) { delete (e as any)._conflict; }
      if (isExtra) {
        // Pane1 tree: simplified BFS layout
        const root = _g.nodes[0];
        if (root) {
          const levels = new Map<string, number>();
          const children = new Map<string, string[]>();
          levels.set(root.id, 0);
          for (const e of _g.edges) {
            const src = typeof e.source === 'object' ? (e.source as any).id : e.source;
            const tgt = typeof e.target === 'object' ? (e.target as any).id : e.target;
            if (!children.has(src)) children.set(src, []);
            children.get(src)!.push(tgt);
          }
          const q = [root.id];
          while (q.length > 0) {
            const pid = q.shift()!;
            const pl = levels.get(pid) || 0;
            const kids = children.get(pid) || [];
            for (const cid of kids) { levels.set(cid, pl + 1); q.push(cid); }
          }
          const levelCounts = new Map<number, number>();
          for (const [nid, lv] of levels) {
            const n = _g.nodes.find(n => n.id === nid);
            if (n) {
              n.x = 0 + lv * 200;
              n.y = (levelCounts.get(lv) || 0) * 80 - ((_g.nodes.filter(n => levels.get(n.id) === lv).length - 1) * 40);
              n.fixed = true; n.fx = n.x; n.fy = n.y;
              levelCounts.set(lv, (levelCounts.get(lv) || 0) + 1);
            }
          }
        }
      } else {
        applyTreeLayout();
      }
    }
    else {
      for (const n of _g.nodes) { n.fixed = false; n.fx = null; n.fy = null; }
      for (const e of _g.edges) { delete (e as any)._conflict; }
      _sm.initSim();
      draw();
    }
  };
  // (treeBtn removed — now in mode bar)

  // 树形布局逻辑
  const applyTreeLayout = () => {
    const nodes = graph.nodes;
    const edges = graph.edges;
    if (nodes.length === 0) return;
    // 找根：headingLevel=1 或半径最大
    let root = nodes.find((n: any) => n.headingLevel === 1) || nodes.reduce((a: any, b: any) => (b.radius || 9) > (a.radius || 9) ? b : a);
    const rootId = root.id;
    // BFS 建树（所有边都参与遍历，包括虚线）
    const children = new Map<string, string[]>();
    const parent = new Map<string, string>();
    const visited = new Set<string>([rootId]);
    const queue = [rootId];
    while (queue.length > 0) {
      const pid = queue.shift()!;
      if (!children.has(pid)) children.set(pid, []);
      for (const e of edges) {
        const src = typeof e.source === 'object' ? e.source.id : e.source;
        const tgt = typeof e.target === 'object' ? e.target.id : e.target;
        let childId: string | null = null;
        if (src === pid && !visited.has(tgt)) childId = tgt;
        else if (tgt === pid && !visited.has(src)) childId = src;
        if (childId) {
          visited.add(childId);
          parent.set(childId, pid);
          children.get(pid)!.push(childId);
          queue.push(childId);
        }
      }
    }
    // 标记冲突边：只标记不在树中的边，用户自设虚线不算冲突
    for (const e of edges) {
      delete (e as any)._conflict;
      const src = typeof e.source === 'object' ? e.source.id : e.source;
      const tgt = typeof e.target === 'object' ? e.target.id : e.target;
      const isParent = parent.get(src) === tgt || parent.get(tgt) === src;
      if (!isParent) {
        (e as any)._conflict = true;
      }
    }
    // 计算子树的叶节点数（决定宽度）
    const leafCount = new Map<string, number>();
    const calcLeaves = (id: string): number => {
      const kids = children.get(id) || [];
      if (kids.length === 0) { leafCount.set(id, 1); return 1; }
      let sum = 0;
      for (const cid of kids) sum += calcLeaves(cid);
      leafCount.set(id, Math.max(sum, 1));
      return leafCount.get(id)!;
    };
    calcLeaves(rootId);

    const levelY = 100;
    const unitX = 110; // 每个叶节点占据的宽度
    const levels = new Map<string, number>();
    const posX = new Map<string, number>();

    const layoutTree = (id: string, depth: number, leftBound: number) => {
      levels.set(id, depth);
      const kids = children.get(id) || [];
      if (kids.length === 0) {
        posX.set(id, leftBound);
        return;
      }
      // 每个子树居中于其叶节点范围
      let cursor = leftBound;
      const kidPositions: number[] = [];
      for (const cid of kids) {
        const w = leafCount.get(cid) || 1;
        layoutTree(cid, depth + 1, cursor);
        const center = cursor + (w - 1) * unitX / 2;
        kidPositions.push(center);
        cursor += w * unitX;
      }
      // 父节点居中于子节点
      posX.set(id, (kidPositions[0] + kidPositions[kidPositions.length - 1]) / 2);
    };
    layoutTree(rootId, 0, 0);

    // 孤立节点
    let maxLv = 0;
    for (const [id, lv] of levels) { if (lv > maxLv) maxLv = lv; }
    for (const n of nodes) {
      if (!visited.has(n.id)) {
        levels.set(n.id, maxLv + 1);
        posX.set(n.id, (children.get(rootId)?.length || 0) * unitX);
        children.get(rootId)!.push(n.id);
      }
    }
    // 居中整个树：找到最左和最右
    let minX = Infinity, maxX = -Infinity;
    for (const [id, x] of posX) { if (x < minX) minX = x; if (x > maxX) maxX = x; }
    const offsetX = -(minX + maxX) / 2;
    // 存储目标位置，由动画逐帧过渡
    for (const n of nodes) {
      (n as any)._treeX = (posX.get(n.id) ?? 0) + offsetX;
      (n as any)._treeY = (levels.get(n.id) ?? 0) * levelY;
    }
    // RAF 动画平滑过渡到目标树位置
    const simNodes = simManager.getSim()?.nodes() || [];
    simManager.getSim()?.stop();
    currentAnimationCancel?.();
    currentAnimationCancel = startNodeAnimation({
      nodes: graph.nodes,
      simNodes,
      getTarget: (n) => {
        const tx = (n as any)._treeX, ty = (n as any)._treeY;
        if (tx == null) return null;
        return { x: tx, y: ty };
      },
      onFrame: () => sharedState.directDraw?.(),
      onComplete: () => simManager.initSim(),
      fixOnComplete: true,
    });
  };

  // --- 逆时针旋转 90°（变换节点坐标）---
  const rotBtn = document.createElement('button');
  rotBtn.textContent = '旋转'; rotBtn.style.cssText = `font-size:${V('--fg-font-md', '0.85em')};padding:2px 8px;cursor:pointer;`;
  rotBtn.onclick = () => {
    // 所有节点绕原点 (0,0) 逆时针旋转 90°：(x,y) → (y, -x)
    for (const n of graph.nodes) {
      const oldX = n.x, oldY = n.y;
      n.x = oldY;
      n.y = -oldX;
      if (n.fx != null) { n.fx = oldY; n.fy = -oldX; }
    }
    scheduleSave();
    if (treeMode) {
      // 树模式：旋转后更新目标位置并重新缓动
      for (const n of graph.nodes) {
        n.fixed = false; n.fx = null; n.fy = null;
        if ((n as any)._treeX != null) {
          const tx = (n as any)._treeX, ty = (n as any)._treeY;
          (n as any)._treeX = ty;
          (n as any)._treeY = -tx;
        }
      }
      // 重新启动缓动到旋转后的目标
      const simNodes = simManager.getSim()?.nodes() || [];
      for (const n of graph.nodes) {
        if ((n as any)._treeX != null) {
          const sn = simNodes.find((s: any) => s.id === n.id);
          (n as any)._sx = sn ? sn.x : n.x;
          (n as any)._sy = sn ? sn.y : n.y;
        }
      }
      simManager.getSim()?.stop();
      currentAnimationCancel?.();
      currentAnimationCancel = startNodeAnimation({
        nodes: graph.nodes,
        simNodes: simManager.getSim()?.nodes() || [],
        getTarget: (n) => {
          const tx = (n as any)._treeX, ty = (n as any)._treeY;
          if (tx == null) return null;
          return { x: tx, y: ty };
        },
        onFrame: () => sharedState.directDraw?.(),
        onComplete: () => simManager.initSim(),
        fixOnComplete: true,
      });
    }
    else { simManager.initSim(); draw(); }
  };
  controlsRow2.appendChild(rotBtn);

  // 导入文件按钮
  const importBtn = document.createElement('button');
  importBtn.textContent = '导入文件'; importBtn.style.cssText = `font-size:${V('--fg-font-md', '0.85em')};padding:2px 8px;cursor:pointer;`;
  importBtn.onclick = async () => {
    // Electron 模式：原生文件对话框，直接存路径
    const ea = (window as any).electronAPI;
    if (ea?.openFile) {
      const filePath = await ea.openFile();
      if (!filePath) return;
      const name = filePath.split(/[\\/]/).pop() || 'file';
      let mediaType = 'md';
      if (/\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i.test(name)) mediaType = 'image';
      else if (/\.(mp3|wav|ogg|flac|aac|m4a)$/i.test(name)) mediaType = 'audio';
      else if (/\.(mp4|webm|mov|avi|mkv)$/i.test(name)) mediaType = 'video';
      const id = 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      graph.nodes.push({ id, label: name, radius: 11, headingLevel: 4, tags: [],
        x: Math.random() * 200 - 100, y: Math.random() * 200 - 100,
        mediaType, mediaUrl: filePath });
      scheduleSave(); simManager.initSim(); draw();
      return;
    }
    // 浏览器模式：blob URL
    const inp = document.createElement('input');
    inp.type = 'file'; inp.multiple = true;
    inp.onchange = () => {
      const files = inp.files;
      if (!files || !pixi) return;
      for (const file of Array.from(files)) {
        let mediaType = 'md';
        if (/\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i.test(file.name)) mediaType = 'image';
        else if (/\.(mp3|wav|ogg|flac|aac|m4a)$/i.test(file.name)) mediaType = 'audio';
        else if (/\.(mp4|webm|mov|avi|mkv)$/i.test(file.name)) mediaType = 'video';
        const id = 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        graph.nodes.push({ id, label: file.name, radius: 11, headingLevel: 4, tags: [],
          x: Math.random() * 200 - 100, y: Math.random() * 200 - 100,
          mediaType, mediaUrl: URL.createObjectURL(file) });
      }
      scheduleSave(); simManager.initSim(); draw();
    };
    inp.click();
  };


  // --- 分类布局 ---
  let categoryMode = false;
  const catBtn = document.createElement('button');
  catBtn.textContent = '分类'; catBtn.style.cssText = `font-size:${V('--fg-font-md', '0.85em')};padding:2px 8px;cursor:pointer;`;
  catBtn.onclick = () => {
    categoryMode = !categoryMode;
    catBtn.style.background = categoryMode ? '#5B8FF9' : '';
    catBtn.style.color = categoryMode ? '#fff' : '';
    if (categoryMode) {
      saveFixedState();
      if (treeMode) { treeMode = false; treeBtn.style.background = ''; treeBtn.style.color = ''; for (const n of graph.nodes) { n.fixed = false; n.fx = null; n.fy = null; } }
      if (fullCatMode) { fullCatBtn.click(); }
      pixi!.groupLayer.removeChildren();
      applyCategoryLayout();
    } else {
      restoreFixedState();
      // 缓动退出
      categoryMode = false; // 立即停止渲染框
      for (const n of graph.nodes) { n.fixed = false; n.fx = null; n.fy = null; (n as any)._sx = n.x; (n as any)._sy = n.y; }
      (graph as any)._categoryBoxes = null;
      delete (graph as any)._categoryBoxes;
      simManager.initSim();
      currentAnimationCancel?.();
      currentAnimationCancel = startNodeAnimation({
        nodes: graph.nodes,
        simNodes: simManager.getSim()?.nodes() || [],
        getSource: (n) => ({ x: (n as any)._sx, y: (n as any)._sy }),
        getTarget: (n) => {
          const sim = simManager.getSim()?.nodes() || [];
          const sn = sim.find((s: any) => s.id === n.id);
          return sn ? { x: sn.x, y: sn.y } : null;
        },
        onFrame: () => sharedState.directDraw?.(),
        unfixSimOnComplete: true,
      });
    }
  };
  // (catBtn removed — now in mode bar)

  // --- 全分类布局 ---
  let fullCatMode = false;
  const fullCatBtn = document.createElement('button');
  fullCatBtn.textContent = '全分类'; fullCatBtn.style.cssText = `font-size:${V('--fg-font-md', '0.85em')};padding:2px 8px;cursor:pointer;`;
  let fullCatSavedModes: { id: string; mode: string }[] = [];
  fullCatBtn.onclick = () => {
    fullCatMode = !fullCatMode;
    fullCatBtn.style.background = fullCatMode ? '#5B8FF9' : '';
    fullCatBtn.style.color = fullCatMode ? '#fff' : '';
    if (fullCatMode) {
      if (treeMode) { treeMode = false; treeBtn.style.background = ''; treeBtn.style.color = ''; for (const n of graph.nodes) { n.fixed = false; n.fx = null; n.fy = null; } }
      if (categoryMode) { categoryMode = false; catBtn.style.background = ''; catBtn.style.color = ''; }
      pixi!.groupLayer.removeChildren();
      (graph as any)._categoryBoxes = null;
      // 临时启用所有集合
      fullCatSavedModes = graph.groups.map(g => ({ id: g.id, mode: g.displayMode }));
      for (const g of graph.groups) { if (g.displayMode === 'none') g.displayMode = 'rect'; }
      applyCategoryLayout(true);
    } else {
      // 恢复集合显示状态
      for (const g of graph.groups) {
        const saved = savedGroupModes.find(s => s.id === g.id);
        if (saved) g.displayMode = saved.mode as any;
      }
      categoryMode = false; catBtn.style.background = ''; catBtn.style.color = '';
      for (const n of graph.nodes) { n.fixed = false; n.fx = null; n.fy = null; (n as any)._sx = n.x; (n as any)._sy = n.y; }
      (graph as any)._categoryBoxes = null; delete (graph as any)._categoryBoxes;
      simManager.initSim();
      currentAnimationCancel?.();
      currentAnimationCancel = startNodeAnimation({
        nodes: graph.nodes,
        simNodes: simManager.getSim()?.nodes() || [],
        getSource: (n) => ({ x: (n as any)._sx, y: (n as any)._sy }),
        getTarget: (n) => {
          const sim = simManager.getSim()?.nodes() || [];
          const sn = sim.find((s: any) => s.id === n.id);
          return sn ? { x: sn.x, y: sn.y } : null;
        },
        onFrame: () => sharedState.directDraw?.(),
        unfixSimOnComplete: true,
      });
    }
  };
  // (fullCatBtn removed — now in mode bar)

  const applyCategoryLayout = (allGroups = false) => {
    const nodes = graph.nodes;
    const groups = allGroups ? graph.groups : graph.groups.filter(g => g.displayMode !== 'none');
    const groupNodes = new Map<string, any[]>();
    const conflictNodes: any[] = [];
    const noGroupNodes: any[] = [];
    for (const n of nodes) {
      n.fixed = false; n.fx = null; n.fy = null;
      const tags: string[] = n.tags || [];
      const matchGroups = groups.filter(g => tags.includes(g.label));
      if (matchGroups.length === 0) noGroupNodes.push(n);
      else if (matchGroups.length === 1) {
        const gid = matchGroups[0].id;
        if (!groupNodes.has(gid)) groupNodes.set(gid, []);
        groupNodes.get(gid)!.push(n);
      } else conflictNodes.push(n);
    }
    const parts: { label: string; nodes: any[]; color: string }[] = [];
    for (const g of groups) {
      const gn = groupNodes.get(g.id) || [];
      if (gn.length > 0) parts.push({ label: g.label, nodes: gn, color: g.color || '#5B8FF9' });
    }
    if (noGroupNodes.length > 0) parts.push({ label: '无', nodes: noGroupNodes, color: '#888' });
    if (conflictNodes.length > 0) parts.push({ label: '冲突', nodes: conflictNodes, color: '#CC4400' });
    if (parts.length === 0) return;

    // 按节点数决定框大小：每节点 18000px²，最小 260×260
    const unitArea = 18000;
    const innerPad = 55;
    const boxMin = 260;
    const gap = 12; // 框间小间距
    parts.sort((a, b) => {
      if (a.label === '冲突') return 1; if (b.label === '冲突') return -1;
      if (a.label === '无') return 1; if (b.label === '无') return -1;
      return 0;
    });
    // 计算每个框的实际宽高
    const sizes = parts.map(p => {
      const area = Math.max(boxMin * boxMin, p.nodes.length * unitArea);
      return { w: Math.sqrt(area), h: Math.sqrt(area) };
    });
    // 紧排：按行打包，每行高度统一
    const maxRowW = Math.max(...sizes.map(s => s.w)) * parts.length + gap * (parts.length - 1);
    let rowY = 0, rowIdx = 0;
    while (rowIdx < parts.length) {
      // 找出这一行能放下的框
      let rowX = 0, rowH = 0, endIdx = rowIdx;
      for (let i = rowIdx; i < parts.length; i++) {
        const testW = rowX + (rowX > 0 ? gap : 0) + sizes[i].w;
        if (testW > maxRowW && rowIdx !== i) break;
        rowX = testW;
        rowH = Math.max(rowH, sizes[i].h);
        endIdx = i + 1;
      }
      // 布局这一行
      let curX = -rowX / 2;
      for (let i = rowIdx; i < endIdx; i++) {
        const s = sizes[i];
        const bx = curX;
        const by = rowY;
        const bw = s.w, bh = rowH;
        const nCount = parts[i].nodes.length;
        const nCols = Math.ceil(Math.sqrt(nCount * bw / bh));
        const nRows = Math.ceil(nCount / nCols);
        const nx = nCols > 1 ? (bw - innerPad * 2) / (nCols - 1) : 0;
        const ny = nRows > 1 ? (bh - innerPad * 2) / (nRows - 1) : 0;
        parts[i].nodes.forEach((n, ni) => {
          const nc = ni % nCols, nr = Math.floor(ni / nCols);
          (n as any)._treeX = bx + innerPad + nc * nx;
          (n as any)._treeY = by + innerPad + nr * ny;
        });
        (parts[i] as any)._box = { x: bx, y: by, w: bw, h: bh, color: parts[i].color, label: parts[i].label };
        curX += bw + gap;
      }
      rowY += rowH + gap;
      rowIdx = endIdx;
    }
    // 整体居中
    const boxes = parts.map(p => (p as any)._box).filter(Boolean);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of boxes) { minX = Math.min(minX, b.x); minY = Math.min(minY, b.y); maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h); }
    const offX = -(minX + maxX) / 2, offY = -(minY + maxY) / 2;
    for (const b of boxes) { b.x += offX; b.y += offY; }
    for (const n of graph.nodes) {
      if ((n as any)._treeX != null) { (n as any)._treeX += offX; (n as any)._treeY += offY; }
    }

    // 冲突节点饼状设色
    for (const n of conflictNodes) {
      const tags: string[] = n.tags || [];
      const matchGroups = groups.filter(g => tags.includes(g.label));
      (n as any)._pieColors = matchGroups.map(g => g.color || '#5B8FF9');
    }

    (graph as any)._categoryBoxes = parts.map(p => (p as any)._box).filter(Boolean);
    // 不调用 scheduleSave：布局是临时视图，不应持久化固定状态

    // 缓动进入
    const simNodes = simManager.getSim()?.nodes() || [];
    simManager.getSim()?.stop();
    currentAnimationCancel?.();
    currentAnimationCancel = startNodeAnimation({
      nodes: graph.nodes,
      simNodes,
      getTarget: (n) => {
        const tx = (n as any)._treeX, ty = (n as any)._treeY;
        if (tx == null) return null;
        return { x: tx, y: ty };
      },
      onFrame: () => sharedState.directDraw?.(),
      onComplete: () => simManager.initSim(),
      fixOnComplete: true,
    });
  };

  // --- 集合搜索 ---
  // --- 统一布局模式选择器 ---
  interface SavedLayout { name: string; nodes: { id: string; x: number; y: number; fx: number | null; fy: number | null; fixed: boolean }[]; groupModes: { id: string; mode: string }[]; }
  let layouts: SavedLayout[] = [];
  const loadLayouts = () => {
    try { layouts = JSON.parse(localStorage.getItem(`fg-layouts-${activeTab}`) || '[]'); } catch { layouts = []; }
  };
  const saveLayouts = () => { localStorage.setItem(`fg-layouts-${activeTab}`, JSON.stringify(layouts)); };
  loadLayouts();

  let modeCollapsed = false;
  const modeToggle = document.createElement('span');
  modeToggle.textContent = '布局 ▾'; modeToggle.style.cssText = `-webkit-app-region:no-drag;font-size:${V('--fg-font-sm', '0.8em')};cursor:pointer;margin-right:4px;`;
  modeToggle.onclick = () => { modeCollapsed = !modeCollapsed; modeToggle.textContent = modeCollapsed ? '布局 ▸' : '布局 ▾'; modeRow.style.display = modeCollapsed ? 'none' : ''; };
  primaryRow.appendChild(modeToggle);

  const modeRow = document.createElement('div');
  modeRow.style.cssText = 'display:flex;gap:3px;align-items:center;flex-wrap:wrap;';
  primaryRow.appendChild(modeRow);

  let activeMode = 'default'; // default | tree | category | fullcat | layout:xxx
  const exitLayoutMode = (toMode = 'default') => {
    currentAnimationCancel?.();
    if (activeMode === 'tree') {
      for (const n of graph.nodes) { n.fixed = false; n.fx = null; n.fy = null; delete (n as any)._pieColors; delete (n as any)._treeX; delete (n as any)._treeY; delete (n as any)._sx; delete (n as any)._sy; }
      for (const e of graph.edges) { delete (e as any)._conflict; }
    } else if (activeMode === 'category' || activeMode === 'fullcat') {
      for (const n of graph.nodes) { n.fixed = false; n.fx = null; n.fy = null; delete (n as any)._pieColors; delete (n as any)._treeX; delete (n as any)._treeY; delete (n as any)._sx; delete (n as any)._sy; }
      for (const e of graph.edges) { delete (e as any)._conflict; }
      (graph as any)._categoryBoxes = null;
      if (activeMode === 'fullcat') {
        for (const g of graph.groups) {
          const saved = (window as any)._savedGroupModes?.find((s: any) => s.id === g.id);
          if (saved) g.displayMode = saved.mode;
        }
      }
    }
    activeMode = toMode;
    renderModeBar();
    if (toMode === 'default') { saveNow(); simManager.initSim(); draw(); }
  };

  // --- 格点吸附 ---
  const snapPosToGrid = (x: number, y: number): [number, number] => {
    const sp = gridSp || 30;
    return [Math.round(x / sp) * sp, Math.round(y / sp) * sp];
  };

  const applyGridSnapLayout = () => {
    const nodes = getSim()?.nodes() || [];
    const targets: { id: string; x: number; y: number }[] = [];
    for (const n of nodes) {
      const [sx, sy] = snapPosToGrid(n.x, n.y);
      targets.push({ id: n.id, x: sx, y: sy });
    }
    // 立即标记 fixed（graph + sim），让样式过渡动画和位移动画同时开始
    for (const n of graph.nodes) {
      const t = targets.find(t => t.id === n.id);
      if (t) { n.fixed = true; }
    }
    const sim = getSim();
    if (sim) {
      for (const sn of sim.nodes()) {
        if (targets.find(t => t.id === sn.id)) sn.fixed = true;
      }
    }
    // Animate to grid positions
    currentAnimationCancel = startNodeAnimation({
      nodes: graph.nodes,
      simNodes: getSim()?.nodes() || [],
      getTarget: (n) => {
        const t = targets.find(t => t.id === n.id);
        return t ? { x: t.x, y: t.y } : null;
      },
      getSource: (n) => {
        const sn = (getSim()?.nodes() || []).find((s: any) => s.id === n.id);
        return sn ? { x: sn.x, y: sn.y } : { x: n.x, y: n.y };
      },
      duration: 400,
      onFrame: () => { if (sharedState.directDraw) sharedState.directDraw(); else draw(); },
      onComplete: () => {
        // 防重叠：记录已占用的格点，冲突时偏移到最近空位
        const occupied = new Set<string>();
        const cellKey = (x: number, y: number) => `${x},${y}`;
        const gridStep = gridSp;
        const findFree = (sx: number, sy: number): [number, number] => {
          for (let r = 0; r <= 8; r++) {
            for (let dx = -r; dx <= r; dx++) {
              for (let dy = -r; dy <= r; dy++) {
                if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                const k = cellKey(sx + dx * gridStep, sy + dy * gridStep);
                if (!occupied.has(k)) return [sx + dx * gridStep, sy + dy * gridStep];
              }
            }
          }
          return [sx, sy];
        };
        for (const n of graph.nodes) {
          let [sx, sy] = snapPosToGrid(n.x, n.y);
          if (occupied.has(cellKey(sx, sy))) {
            [sx, sy] = findFree(sx, sy);
          }
          occupied.add(cellKey(sx, sy));
          n.x = sx; n.y = sy; n.fx = sx; n.fy = sy;
        }
        const sim = getSim();
        if (sim) {
          for (const sn of sim.nodes()) {
            const gn = graph.nodes.find(n => n.id === sn.id);
            if (gn) {
              sn.x = gn.x; sn.y = gn.y; sn.fx = gn.fx; sn.fy = gn.fy; sn.fixed = true;
            }
          }
        }
        simManager.initSim();
        draw();
      },
    });
  };

  const applyLayoutMode = (mode: string) => withFocusedPane(() => {
    currentAnimationCancel?.(); // 取消正在进行的动画
    // 只在离开默认模式时保存一次
    if (activeMode === 'default' && mode !== 'default') saveFixedState();
    // 清理当前模式
    if (activeMode === 'tree') { for (const n of graph.nodes) { n.fixed = false; n.fx = null; n.fy = null; } for (const e of graph.edges) { delete (e as any)._conflict; } }
    if (activeMode === 'category' || activeMode === 'fullcat') { (graph as any)._categoryBoxes = null;
      for (const n of graph.nodes) { delete (n as any)._pieColors; }
      if (activeMode === 'fullcat') { for (const g of graph.groups) { const saved = (window as any)._savedGroupModes?.find((s: any) => s.id === g.id); if (saved) g.displayMode = saved.mode; } }
    }
    activeMode = mode;
    renderModeBar();
    if (mode === 'default') {
      // 彻底清理所有布局残留
      for (const n of graph.nodes) { n.fixed = false; n.fx = null; n.fy = null; delete (n as any)._pieColors; delete (n as any)._treeX; delete (n as any)._treeY; delete (n as any)._sx; delete (n as any)._sy; }
      for (const e of graph.edges) { delete (e as any)._conflict; }
      (graph as any)._categoryBoxes = null;
      // 恢复进入布局前的固定节点和集合状态
      restoreFixedState();
      // 清空保存状态（避免下次恢复时用过期数据）
      savedFixedNodes = [];
      savedGroupModes = [];
      // 持久化：把清理后的状态写入 localStorage，刷新后不加载脏数据
      saveNow(); simManager.initSim(); draw();
    } else if (mode === 'tree') {
      for (const n of graph.nodes) { n.fixed = false; n.fx = null; n.fy = null; }
      for (const e of graph.edges) { delete (e as any)._conflict; }
      applyTreeLayout();
    } else if (mode === 'category') {
      pixi!.groupLayer.removeChildren();
      applyCategoryLayout(false);
    } else if (mode === 'fullcat') {
      (window as any)._savedGroupModes = graph.groups.map(g => ({ id: g.id, mode: g.displayMode }));
      for (const g of graph.groups) { if (g.displayMode === 'none') g.displayMode = 'rect'; }
      pixi!.groupLayer.removeChildren();
      applyCategoryLayout(true);
    } else {
      // 自定义布局
      const l = layouts.find(x => x.name === mode);
      if (l) {
        for (const n of graph.nodes) { n.fixed = false; n.fx = null; n.fy = null; }
        for (const sn of l.nodes) { const n = graph.nodes.find(n => n.id === sn.id); if (n) { n.x = sn.x; n.y = sn.y; n.fx = sn.fx; n.fy = sn.fy; n.fixed = sn.fixed; } }
        for (const gm of l.groupModes) { const g = graph.groups.find(g => g.id === gm.id); if (g) g.displayMode = gm.mode as any; }
        simManager.initSim(); draw();
      }
    }
  });

  const renderModeBar = () => {
    modeRow.innerHTML = '';
    const mkPill = (label: string, mode: string, isActive: boolean) => {
      const pill = document.createElement('span');
      pill.textContent = label;
      pill.style.cssText = `-webkit-app-region:no-drag;font-size:${V('--fg-font-xs', '0.72em')};padding:1px 8px;cursor:pointer;border-radius:3px;white-space:nowrap;user-select:none;${
        isActive ? `background:rgba(91,143,249,0.35);border:1px solid rgba(91,143,249,0.5);color:${V('--fg-text','#fff')};` : `border:1px solid ${V('--fg-border-light','rgba(255,255,255,0.18)')};`
      }`;
      pill.onclick = () => { if (!isActive) applyLayoutMode(mode); };
      return pill;
    };
    modeRow.appendChild(mkPill('默认', 'default', activeMode === 'default'));
    modeRow.appendChild(mkPill('树形', 'tree', activeMode === 'tree'));
    // 分类按钮：三态循环  关闭 → 分类 → 全分类
    const catMode = activeMode === 'category' || activeMode === 'fullcat';
    const catLabel = activeMode === 'fullcat' ? '全分类' : activeMode === 'category' ? '分类' : '分类';
    const catPill = document.createElement('span');
    catPill.textContent = catLabel;
    catPill.style.cssText = `-webkit-app-region:no-drag;font-size:${V('--fg-font-xs', '0.72em')};padding:1px 8px;cursor:pointer;border-radius:3px;white-space:nowrap;user-select:none;${
      catMode ? `background:rgba(245,158,11,0.3);border:1px solid rgba(245,158,11,0.5);color:${V('--fg-text','#fff')};` : `border:1px solid ${V('--fg-border-light','rgba(255,255,255,0.18)')};`
    }`;
    catPill.onclick = () => {
      if (activeMode === 'category') applyLayoutMode('fullcat');
      else if (activeMode === 'fullcat') applyLayoutMode('default');
      else applyLayoutMode('category');
    };
    modeRow.appendChild(catPill);
    // 格点吸附独立 toggle（三态：关闭→部分→全部→关闭），可与任何布局并存
    const snapToggle = document.createElement('span');
    const updateSnapLabel = () => {
      if (gridSnapEnabled) { snapToggle.textContent = '⦿ 全部'; snapToggle.title = '全部格点：所有节点吸附到网格'; }
      else if (partialGridSnap) { snapToggle.textContent = '◉ 部分'; snapToggle.title = '部分格点：仅固定节点吸附到网格'; }
      else { snapToggle.textContent = '○ 格点'; snapToggle.title = '格点吸附：关闭'; }
      snapToggle.style.cssText = `-webkit-app-region:no-drag;font-size:${V('--fg-font-xs', '0.72em')};padding:1px 8px;cursor:pointer;border-radius:3px;white-space:nowrap;user-select:none;${
        gridSnapEnabled ? `background:rgba(91,143,249,0.35);border:1px solid rgba(91,143,249,0.5);color:${V('--fg-text','#fff')};` :
        partialGridSnap ? `background:rgba(245,158,11,0.25);border:1px solid rgba(245,158,11,0.4);color:${V('--fg-text','#fff')};` :
        `border:1px dashed ${V('--fg-border-light','rgba(255,255,255,0.18)')};`
      }`;
    };
    updateSnapLabel();
    snapToggle.onclick = () => {
      if (!gridSnapEnabled && !partialGridSnap) {
        // 关闭 → 部分
        partialGridSnap = true;
      } else if (partialGridSnap) {
        // 部分 → 全部
        partialGridSnap = false; gridSnapEnabled = true;
        applyGridSnapLayout();
      } else {
        // 全部 → 关闭：解固定所有节点
        gridSnapEnabled = false;
        for (const n of graph.nodes) { n.fixed = false; n.fx = null; n.fy = null; }
        const sim = getSim();
        if (sim) { for (const sn of sim.nodes()) { sn.fixed = false; sn.fx = null; sn.fy = null; } }
        simManager.initSim(); draw();
      }
      scheduleSave();
      updateSnapLabel();
    };
    modeRow.appendChild(snapToggle);
    // 固定视图 toggle：镂空 / 实心
    const fixedViewToggle = document.createElement('span');
    fixedViewToggle.textContent = fixedHollow ? '◉ 镂空' : '● 实心';
    fixedViewToggle.title = fixedHollow ? '固定节点镂空显示' : '固定节点实心显示';
    fixedViewToggle.style.cssText = `-webkit-app-region:no-drag;font-size:${V('--fg-font-xs', '0.72em')};padding:1px 8px;cursor:pointer;border-radius:3px;white-space:nowrap;user-select:none;border:1px solid ${V('--fg-border-light','rgba(255,255,255,0.18)')};`;
    fixedViewToggle.onclick = () => {
      fixedHollow = !fixedHollow;
      fixedViewToggle.textContent = fixedHollow ? '◉ 镂空' : '● 实心';
      fixedViewToggle.title = fixedHollow ? '固定节点镂空显示' : '固定节点实心显示';
      scheduleSave(); draw();
    };
    modeRow.appendChild(fixedViewToggle);
    for (const l of layouts) {
      const active = activeMode === l.name;
      const pill = mkPill(l.name, l.name, active);
      pill.oncontextmenu = (e) => {
        e.preventDefault();
        const menu = document.createElement('div');
        menu.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;z-index:${Z_CONTEXT_MENU};background:${V('--fg-surface-glass','rgba(40,42,48,0.9)')};border:1px solid ${V('--fg-glass-border','rgba(255,255,255,0.15)')};border-radius:6px;padding:4px 0;min-width:90px;font-size:${V('--fg-font-sm', '0.8em')};color:${V('--fg-text','#ccc')};box-shadow:${V('--fg-shadow-md','0 4px 16px rgba(0,0,0,0.3)')};backdrop-filter:blur(10px);`;
        const mk = (t: string, fn: () => void) => {
          const mi = document.createElement('div'); mi.textContent = t;
          mi.style.cssText = 'padding:3px 8px;cursor:pointer;';
          mi.onmouseenter = () => mi.style.background = V('--fg-button-hover','rgba(255,255,255,0.12)');
          mi.onmouseleave = () => mi.style.background = '';
          mi.onclick = () => { fn(); menu.remove(); }; return mi;
        };
        menu.appendChild(mk('重命名', async () => { const nn = await safePrompt('新名称：', l.name); if (nn) { const oldActive = activeMode === l.name; l.name = nn; if (oldActive) activeMode = nn; saveLayouts(); renderModeBar(); } }));
                menu.appendChild(mk('删除', async () => { if (await confirmAction(`删除 "${l.name}"？`)) { if (activeMode === l.name) applyLayoutMode('default'); layouts = layouts.filter(x => x !== l); saveLayouts(); renderModeBar(); } }));
        document.body.appendChild(menu);
        const close = () => { menu.remove(); document.removeEventListener('click', close); };
        setTimeout(() => document.addEventListener('click', close), 0);
      };
      modeRow.appendChild(pill);
    }
    // + 保存按钮
    const addBtn = document.createElement('span');
    addBtn.textContent = '+'; addBtn.title = '保存为布局';
    addBtn.style.cssText = `-webkit-app-region:no-drag;font-size:${V('--fg-font-xs', '0.72em')};padding:1px 6px;cursor:pointer;border-radius:3px;border:1px solid ${V('--fg-border-light','rgba(255,255,255,0.18)')};`;
    addBtn.onclick = async () => {
      // 如果在自定义布局模式，直接更新当前布局
      if (activeMode !== 'default' && activeMode !== 'tree' && activeMode !== 'category' && activeMode !== 'fullcat') {
        const l = layouts.find(x => x.name === activeMode);
        if (l) {
          l.nodes = graph.nodes.map(n => ({ id: n.id, x: n.x, y: n.y, fx: n.fx, fy: n.fy, fixed: n.fixed || false }));
          l.groupModes = graph.groups.map(g => ({ id: g.id, mode: g.displayMode }));
          saveLayouts(); renderModeBar(); return;
        }
      }
      const name = await safePrompt('布局名称：');
      if (!name) return;
      const exists = layouts.findIndex(l => l.name === name);
      if (exists >= 0) { if (!await confirmAction(`覆盖 "${name}"？`)) return; layouts.splice(exists, 1); }
      layouts.push({ name,
        nodes: graph.nodes.map(n => ({ id: n.id, x: n.x, y: n.y, fx: n.fx, fy: n.fy, fixed: n.fixed || false })),
        groupModes: graph.groups.map(g => ({ id: g.id, mode: g.displayMode })),
      });
      saveLayouts(); renderModeBar();
    };
    modeRow.appendChild(addBtn);
  };
  renderModeBar();

  // --- 集合搜索 ---
  const groupInput = document.createElement('input');
  groupInput.type = 'text'; groupInput.placeholder = '搜索集合';
  groupInput.style.cssText = `font-size:${V('--fg-font-md', '0.85em')};padding:2px 6px;border:1px solid ${V('--fg-input-border','#ccc')};border-radius:6px;width:240px;`;
  searchRow.appendChild(groupInput);
  // 适配按钮移入更多操作
  const fitBtn = document.createElement('button');
  fitBtn.textContent = '适应'; fitBtn.title = '回到中心并适应所有节点 (F)';
  fitBtn.style.cssText = `font-size:${V('--fg-font-md', '0.85em')};padding:2px 8px;cursor:pointer;`;
  fitBtn.onclick = () => {
    if (focusedPaneIndex === PANE_RIGHT) {
      if (pixi1) {
        const nodes = simManager1.getSim()?.nodes() || [];
        if (nodes.length > 0) {
          const xs = nodes.map((n: any) => n.x), ys = nodes.map((n: any) => n.y);
          const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
          const hw = Math.max(Math.abs(minX), Math.abs(maxX)) + 60;
          const hh = Math.max(Math.abs(minY), Math.abs(maxY)) + 60;
          const cw = pixi1.app.canvas.clientWidth || 400;
          const ch = pixi1.app.canvas.clientHeight || 300;
          const sc = Math.min(cw/(hw*2), ch/(hh*2), 2);
          pixi1.viewport.animate({ scale: sc, position: { x: 0, y: 0 }, time: 300 });
        }
      }
    } else {
      fitAllNodes();
    }
  };
  controlsRow2.appendChild(fitBtn);
  controlsRow2.appendChild(importBtn);
  controlsDiv.appendChild(controlsRow2);

  const groupDropdown = document.createElement('div');
  groupDropdown.style.cssText = `position:absolute;z-index:${Z_DROPDOWN};background:${V('--fg-surface','#fff')};border:1px solid ${V('--fg-border','#d0d0d0')};border-radius:4px;max-height:150px;overflow-y:auto;display:none;font-size:${V('--fg-font-md', '0.85em')};min-width:160px;`;
  groupInput.parentElement!.style.position = 'relative';
  groupInput.parentElement!.appendChild(groupDropdown);
  groupInput.addEventListener('input', () => {
    const q = groupInput.value.trim().toLowerCase();
    groupDropdown.innerHTML = '';
    if (!q) { groupDropdown.style.display = 'none'; return; }
    const matched = graph.groups.filter(g => g.label.toLowerCase().includes(q));
    if (matched.length > 0) {
      matched.forEach(g => {
        const item = document.createElement('div');
        item.style.cssText = 'padding:4px 8px;cursor:pointer;display:flex;align-items:center;gap:6px;';
        const dot = document.createElement('span');
        dot.style.cssText = `display:inline-block;width:10px;height:10px;border-radius:50%;background:${g.color};flex-shrink:0;`;
        item.appendChild(dot); item.appendChild(document.createTextNode(g.label));
        item.onmousedown = (ev) => { ev.preventDefault(); fillGroup(g.id); groupDropdown.style.display = 'none'; };
        item.onmouseenter = () => item.style.background = V('--fg-button-hover','#e8e8e8');
        item.onmouseleave = () => item.style.background = '';
        groupDropdown.appendChild(item);
      });
    }
    const createItem = document.createElement('div');
    createItem.style.cssText = `padding:4px 8px;cursor:pointer;color:#5B8FF9;font-style:italic;border-top:1px solid ${V('--fg-border-light','#eee')};`;
    createItem.textContent = `+ 创建集合 "${q}"`;
    createItem.onmousedown = (ev) => {
      ev.preventDefault();
      saveUndo();
      const newGroup = { id: 'g_' + Date.now(), label: q, color: '#5B8FF9', borderColor: '#3A6FD8', opacity: 0.15, displayMode: 'rect' as any, nodeColorMode: 'off' as any };
      graph.groups.push(newGroup); scheduleSave(); draw(); fillGroup(newGroup.id);
      groupDropdown.style.display = 'none';
    };
    groupDropdown.appendChild(createItem);
    groupDropdown.style.display = 'block';
  });
  groupInput.addEventListener('focus', () => { if (groupInput.value.trim()) groupInput.dispatchEvent(new Event('input')); });
  groupInput.addEventListener('blur', () => { setTimeout(() => { groupDropdown.style.display = 'none'; }, 150); });

  // --- 缩放/平移由 pixi-viewport 处理 ---

  // --- 右键菜单 ---
  const onContextMenu = (type: 'blank'|'node'|'edge'|'group', id: string | null, screenX: number, screenY: number) => {
    const items: { label: string; action: () => void }[] = [];
    const mx = screenX, my = screenY;
    const isExtra = focusedPaneIndex === PANE_RIGHT;
    const _g = isExtra ? pane1.graph : graph;
    const _px = isExtra ? pixi1! : pixi!;
    const _sm = isExtra ? simManager1 : simManager;
    const _getSim = () => isExtra ? getSim1() : getSim();
    const _saveUndo = () => { const um = isExtra ? pane1.undoManager : undoManager; um.pushSnapshot(_g); };
    const _addToSim = (node: any) => { const s = _getSim(); if (s) { s.nodes([...s.nodes(), node]); s.alpha(0.3).restart(); } };
    const _initSim = () => _sm.initSim();
    const _fixNode = (nid: string) => {
      const n = _g.nodes.find(gn => gn.id === nid);
      if (n) { n.fixed = true; n.fx = n.x; n.fy = n.y; }
      const s = _getSim(); if (s) { const sn = s.nodes().find((sn2: any) => sn2.id === nid); if (sn) { sn.fixed = true; sn.fx = sn.x; sn.fy = sn.y; } }
    };
    const _unfixNodes = (ids: string[]) => {
      const s = _getSim();
      for (const nid of ids) {
        const n = _g.nodes.find(gn => gn.id === nid);
        if (n) { n.fixed = false; n.fx = null; n.fy = null; }
        if (s) { const sn = s.nodes().find((sn2: any) => sn2.id === nid); if (sn) { sn.fixed = false; sn.fx = null; sn.fy = null; } }
      }
    };
    if (type === 'blank') {
      items.push({
        label: '新建节点',
        action: () => {
          const center = _px?.viewport?.center ?? { x: 0, y: 0 };
          const cx = center.x, cy = center.y;
          const newId = 'n_' + Date.now();
          const node = { id: newId, label: '新节点', headingLevel: 6, tags: [], x: cx, y: cy, _isNew: true };
          _saveUndo(); _g.nodes.push(node); scheduleSave();
          _addToSim(node);
          draw();
          if (!isExtra) { if (!isExtra) fillNode(newId); };
        },
      });
    } else if (type === 'node' && id) {
      const node = _g.nodes.find(n => n.id === id);
      const isMedia = !!node?.mediaType;

      // 多媒体节点：只有"打开/收起"在顶层，其余折叠进"更多"
      const moreItems: { label: string; action: () => void }[] = [];
      if (!isMedia) items.push({ label: '编辑', action: () => { fillNode(id); } });
      else moreItems.push({ label: '编辑', action: () => { fillNode(id); } });
      const hlNode = node || _g.nodes.find(n => n.id === id);
      if (hlNode?.hyperlink) {
        (isMedia ? moreItems : items).push({ label: '打开链接', action: () => { window.open(hlNode.hyperlink!, '_blank'); } });
      }
      // 复制节点
      const copyAction = { label: '复制节点' as string, action: () => {
        const orig = _g.nodes.find(n => n.id === id);
        if (!orig) return;
        const newId = 'n_' + Date.now();
        const copy = JSON.parse(JSON.stringify(orig));
        copy.id = newId; copy.x = (orig.x || 0) + 60; copy.y = (orig.y || 0) + 40;
        delete copy.fx; delete copy.fy; delete copy.fixed;
        _saveUndo(); _g.nodes.push(copy);
        scheduleSave(); _initSim(); draw(); { if (!isExtra) fillNode(newId); };
      }};
      (isMedia ? moreItems : items).push(copyAction);

      if (node?.mediaType && isExpanded(id) && hoveredMediaId !== id) {
        items.push({ label: '收起', action: () => { hideMedia(id); draw(); } });
      } else if (node?.mediaType) {
        // hover 临时展开 → 先收起，再显示"打开"
        if (isExpanded(id) && hoveredMediaId === id) { hideMedia(id); hoveredMediaId = ''; }
        items.push({ label: '打开', action: () => {
          const n = _g.nodes.find(n => n.id === id)!;
          let displayUrl = n.mediaUrl || '';
          // Electron 本地路径 → file://
          if (displayUrl && /^[A-Z]:[\\/]/.test(displayUrl)) {
            displayUrl = 'file:///' + displayUrl.replace(/\\/g, '/').replace(/^[A-Z]:/, (m: string) => m.toLowerCase());
          }
          showMedia(mediaOverlayContainer, id, n.label || n.id, n.mediaType, displayUrl, n.color || '#5B8FF9', () => {
            const sp = _px.viewport.toScreen(n.x, n.y);
            const rect = _px.app.canvas.getBoundingClientRect();
            return { x: rect.left + sp.x, y: rect.top + sp.y };
          }, () => { _px.viewport.pause = true; }, () => { _px.viewport.pause = false; });
          draw();
        }});
      }
      if (!node?.mediaType) {
        items.push({ label: '设为图片', action: async () => {
          const url = await safePrompt('图片 URL：');
          if (url) { const n = _g.nodes.find(n => n.id === id); if (n) { n.mediaType = 'image'; n.mediaUrl = url; scheduleSave(); } }
        }});
        items.push({ label: '设为文档', action: async () => {
          const url = await safePrompt('文档内容或 URL：');
          if (url) { const n = _g.nodes.find(n => n.id === id); if (n) { n.mediaType = 'md'; n.mediaUrl = url; scheduleSave(); } }
        }});
      }
      // 非多媒体节点有内容 → 可打开查看
      if (!node?.mediaType && node?.note?.trim()) {
        items.push({ label: '打开内容', action: () => {
          const n = _g.nodes.find(n => n.id === id)!;
          showMedia(mediaOverlayContainer, id, n.label || n.id, 'md', n.note || '', n.color || '#5B8FF9', () => {
            const sp = _px.viewport.toScreen(n.x, n.y);
            const rect = _px.app.canvas.getBoundingClientRect();
            return { x: rect.left + sp.x, y: rect.top + sp.y };
          }, () => { _px.viewport.pause = true; }, () => { _px.viewport.pause = false; });
          draw();
        }});
      }
      const fixAction = isFixedNode(id)
        ? { label: '解除固定' as string, action: () => { _unfixNodes([id]); } }
        : { label: '固定' as string, action: () => { _fixNode(id); } };
      (isMedia ? moreItems : items).push(fixAction);

      const nodeForCollapse = node || _g.nodes.find(n => n.id === id);
      // 递归获取所有后代节点
      const getDescendants = (nodeId: string): string[] => {
        const info = bfsDescendants(nodeId);
        return [...info.keys()].filter(k => k !== nodeId);
      };
      const hasCollapsedDescendants = getDescendants(id).some(did => _g.nodes.find((n: any) => n.id === did)?.collapsed);

      if (nodeForCollapse?.collapsed) {
        const expandActions = [
          { label: '展开一级' as string, action: () => { _saveUndo(); nodeForCollapse.collapsed = false; scheduleSave(); animateExpand(id); } },
          { label: '全部展开' as string, action: () => { _saveUndo(); const all = [id, ...getDescendants(id)]; for (const nid of all) { const n = _g.nodes.find(n => n.id === nid); if (n) n.collapsed = false; } scheduleSave(); animateExpand(id); } },
        ];
        if (isMedia) moreItems.push(...expandActions);
        else items.push(...expandActions);
      } else {
        const collapseActions = [
          { label: '折叠一级' as string, action: () => { const hasChild = _g.edges.some((ed: any) => { const srcId = typeof ed.source === 'object' ? ed.source.id : ed.source; return srcId === id; }); if (hasChild) { _saveUndo(); nodeForCollapse!.collapsed = true; scheduleSave(); animateCollapse(id); } } },
          { label: '逐级折叠' as string, action: () => { _saveUndo(); const all = [id, ...getDescendants(id)]; const hasChild = (nid: string) => _g.edges.some((ed: any) => { const srcId = typeof ed.source === 'object' ? ed.source.id : ed.source; return srcId === nid; }); for (const nid of all) { const n = _g.nodes.find(n2 => n2.id === nid); if (n && hasChild(nid)) n.collapsed = true; } scheduleSave(); animateCollapse(id); } },
        ];
        if (isMedia) moreItems.push(...collapseActions);
        else items.push(...collapseActions);
        if (hasCollapsedDescendants) {
          const allExpand = { label: '全部展开' as string, action: () => { _saveUndo(); const all = [id, ...getDescendants(id)]; for (const nid of all) { const n = _g.nodes.find(n2 => n2.id === nid); if (n) n.collapsed = false; } scheduleSave(); animateExpand(id); } };
          if (isMedia) moreItems.push(allExpand);
          else items.push(allExpand);
        }
      }
      const newNodeAction = { label: '新建子节点' as string, action: () => { const parent = _sm.getSim()?.nodes().find(n => n.id === id); const childId = 'n_' + Date.now(); const childLevel = Math.min(6, (parent?.headingLevel || 6) + 1); const child = { id: childId, label: '子节点', headingLevel: childLevel, tags: [], x: (parent?.x || 200) + 60, y: (parent?.y || 200) + 40, _isNew: true }; _saveUndo(); _g.nodes.push(child); _g.edges.push({ source: id, target: childId, label: '', color: '#BFBFBF', arrow: (isExtra ? pane1.defArrow : defArrow) }); scheduleSave(); _addToSim(child); draw(); { if (!isExtra) fillNode(childId); }; } };
      const linkAction = { label: '连线' as string, action: () => { linkMode = true; linkSrc = id; linkCursorX = 0; linkCursorY = 0; } };
      (isMedia ? moreItems : items).push(newNodeAction);
      (isMedia ? moreItems : items).push(linkAction);

      items.push({ label: '删除', action: () => {
        _saveUndo();
        markNodesDying([id]);
        const _nIdx = _g.nodes.findIndex(n => n.id === id);
        if (_nIdx >= 0) _g.nodes.splice(_nIdx, 1);
        // 邻边渐隐，不立即删除
        for (const e of _g.edges) {
          const srcId = typeof e.source === 'object' ? e.source.id : e.source;
          const tgtId = typeof e.target === 'object' ? e.target.id : e.target;
          if (srcId === id || tgtId === id) (e as any)._dyingAt = performance.now();
        }
        if (selNode === id) clearEd();
        scheduleSave(); draw();
        setTimeout(() => {
          for (let i = _g.edges.length - 1; i >= 0; i--) { const e2: any = _g.edges[i]; if (e2._dyingAt != null && performance.now() - e2._dyingAt >= 400) _g.edges.splice(i, 1); }
          const s2 = getSim(); if (s2) { const validEdges = _g.edges.filter(e => (e.lineStyle || 'solid') === 'solid' && !(e as any)._conflict && !(e as any)._dyingAt); s2.force("link", d3.forceLink(validEdges).id((d: any) => d.id).distance(linkDist).strength(linkStr)); }
          scheduleSave(); draw();
        }, 400);
      }});
      if (isMedia && moreItems.length > 0) {
        items.push({ label: '更多', action: () => {}, children: moreItems });
      }
    } else if (type === 'edge' && id !== null) {
      const idx = parseInt(id);
      items.push({ label: '编辑', action: () => { fillEdge(idx); } });
      items.push({ label: '交换方向', action: () => { const e = _g.edges[idx]; if (e) { _saveUndo(); [e.source, e.target] = [e.target, e.source]; scheduleSave(); _initSim(); } } });
      items.push({ label: '删除', action: () => {
        _saveUndo();
        const e = _g.edges[idx];
        if (e) { e._dyingAt = performance.now(); if (selEdge === idx) clearEd(); scheduleSave(); draw(); }
        setTimeout(() => {
          for (let i = _g.edges.length - 1; i >= 0; i--) { const ed: any = _g.edges[i]; if (ed._dyingAt != null && performance.now() - ed._dyingAt >= 400) _g.edges.splice(i, 1); }
          const s = getSim(); if (s) { const validEdges = _g.edges.filter(e => (e.lineStyle || 'solid') === 'solid' && !(e as any)._conflict && !(e as any)._dyingAt); s.force("link", d3.forceLink(validEdges).id((d: any) => d.id).distance(linkDist).strength(linkStr)); }
          scheduleSave(); draw();
        }, 400);
      }});
    } else if (type === 'group' && id) {
      items.push({ label: '编辑', action: () => { fillGroup(id); } });
    }
    if (items.length > 0) showContextMenu(appShell, mx, my, items);
  };

  const handleLinkTap = (x: number, y: number) => {
    if (!linkMode || !linkSrc) return false;
    const nodes = getSim()?.nodes() || [];
    const n = nodes.find((nd: any) => (nd.x - x) ** 2 + (nd.y - y) ** 2 <= ((nd.radius || 9) + nodeExpand) ** 2);
    if (n) {
      if (linkSrc === n.id) { linkMode = false; linkSrc = null; return true; }
      if (graph.edges.some(e => { const srcId = typeof e.source === 'object' ? e.source.id : e.source; const tgtId = typeof e.target === 'object' ? e.target.id : e.target; return srcId === linkSrc && tgtId === n.id; })) { linkMode = false; linkSrc = null; return true; }
      saveUndo(); graph.edges.push({ source: linkSrc, target: n.id, label: '', color: '#BFBFBF', arrow: defArrow, _createdAt: performance.now() });
      scheduleSave();
      // 增量更新模拟的链接力，不重启
      const sim = getSim();
      if (sim) {
        const validEdges = graph.edges.filter(e => (e.lineStyle || 'solid') === 'solid' && !(e as any)._conflict && !(e as any)._dyingAt);
        sim.force("link", d3.forceLink(validEdges).id((d: any) => d.id).distance(linkDist).strength(linkStr));
        sim.alpha(0.3).restart();
        setTimeout(() => sim.alphaTarget(0), 3000);
      }
      draw();
    }
    linkMode = false; linkSrc = null; return true;
  };

  // --- 事件绑定将在 pixiReady 后进行 ---

  // --- 启动（等待 PixiJS 就绪）---
  // 文件拖拽到画布：自动创建多媒体节点
  appShell.addEventListener('dragover', (e) => { e.preventDefault(); });
  appShell.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file || !pixi) return;
    const vp = pixi.viewport;
    const rect = pixi.app.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const wp = vp.toWorld(sx, sy);
    const id = 'n_' + Date.now();
    let mediaType = 'md';
    if (/\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i.test(file.name)) mediaType = 'image';
    else if (/\.(mp3|wav|ogg|flac|aac|m4a)$/i.test(file.name)) mediaType = 'audio';
    else if (/\.(mp4|webm|mov|avi|mkv)$/i.test(file.name)) mediaType = 'video';
    const url = URL.createObjectURL(file);
    saveUndo(); graph.nodes.push({ id, label: file.name, radius: 12, headingLevel: 4, tags: [], x: wp.x, y: wp.y, mediaType, mediaUrl: url });
    scheduleSave(); simManager.initSim(); draw();
  });

  await pixiReady;
  // Pane 1 事件在懒加载时绑定（见 onSplitTab）
  // 不在这里绑定，因为 pixi1 尚未初始化
  // Pane 1 点击聚焦
  // 点击任意分屏 → 聚焦
  paneContainers.forEach((pc, i) => {
    pc.addEventListener('pointerdown', () => {
      if (focusedPaneIndex !== i) switchFocusedPane(i);
    });
  });

  // 光晕滤镜
  const blurF = new BlurFilter({ strength: 14, quality: 4 });
  const updateBlobFilters = () => {
    const apply = glowAppearance ? [blurF] : [];
    pixi!.blobLayer.filters = apply;
    for (const ep of extraPanes) {
      if (ep.pixi) ep.pixi.blobLayer.filters = apply;
    }
  };
  updateBlobFilters();
  // 标记图加载完成后才允许 viewport 事件触发绘制
  let readyToDraw = false;

  // viewport 缩放/平移时触发刷新（用于标签显隐等）
  pixi!.viewport.on('moved', () => { if (readyToDraw) draw(); });
  pixi!.viewport.on('zoomed-end', () => { if (readyToDraw) draw(); });

  const eventsCanvas = pixi!.app.canvas as any;
  // Pane 0 事件
  const bindPaneEvents = (pi: PaneState, px: PixiLayers, _origSM: any, sprites: Map<any,any>, lastDragId: { v: string | null }) => {
    const getSM = () => pi.simManager || _origSM;
    return {
    get graph() { return pi.graph; },
    getSelNode: () => pi.selNode, setSelNode: (v: string | null) => { pi.selNode = v; },
    getSelEdge: () => pi.selEdge, setSelEdge: (v: number | null) => { pi.selEdge = v; },
    getSelGroup: () => pi.selGroup, setSelGroup: (v: string | null) => { pi.selGroup = v; },
    getSimulation: () => getSM().getSim(), getTransform: () => px ? { k: px.viewport.scale.x, x: px.viewport.x, y: px.viewport.y } : { k: 1, x: 0, y: 0 },
    viewport: px.viewport,
    getCanvas: () => px.app.canvas as any,
    getNodeExpand: () => pi.nodeExpand, getLineExpand: () => pi.lineExpand,
    getDraggingNode: () => pi.draggingNode, setDraggingNode: (v: any) => { pi.draggingNode = v; },
    getWasDragged: () => pi.wasDragged, setWasDragged: (v: boolean) => { pi.wasDragged = v; },
    draw, onContextMenu,
    fixNode: (id: string) => { const n = pi.graph.nodes.find(gn => gn.id === id); if (n) { n.fixed = true; n.fx = n.x; n.fy = n.y; } const sim = getSM().getSim(); if (sim) { const sn = sim.nodes().find((sn2: any) => sn2.id === id); if (sn) { sn.fixed = true; sn.fx = sn.x; sn.fy = sn.y; } } scheduleSave(); draw(); },
    isFixedNode: (id: string) => { const n = pi.graph.nodes.find(gn => gn.id === id); return n?.fixed || false; },
    selectionBox, fixNodes: (ids: string[]) => { for (const id of ids) { const n = pi.graph.nodes.find(gn => gn.id === id); if (n) { n.fixed = true; n.fx = n.x; n.fy = n.y; } const sim = getSM().getSim(); if (sim) { const sn = sim.nodes().find((sn2: any) => sn2.id === id); if (sn) { sn.fixed = true; sn.fx = sn.x; sn.fy = sn.y; } } } scheduleSave(); draw(); },
    unfixNodes: (ids: string[]) => { const sim = getSM().getSim(); for (const id of ids) { const n = pi.graph.nodes.find(gn => gn.id === id); if (n) { n.fixed = false; n.fx = null; n.fy = null; } if (sim) { const sn = sim.nodes().find((sn2: any) => sn2.id === id); if (sn) { sn.fixed = false; sn.fx = null; sn.fy = null; } } } scheduleSave(); draw(); },
    appShell, triggerSave: () => scheduleSave(),
    onDragStart: (id: string) => { getSM().setDragNode(id); lastDragId.v = id; },
    onDragEnd: () => {
      if ((pi.gridSnapEnabled || pi.partialGridSnap) && lastDragId.v) {
        const sn = getSM().getSim()?.nodes()?.find((n2: any) => n2.id === lastDragId.v);
        if (sn && (pi.gridSnapEnabled || sn.fixed)) {
          const [sx, sy] = snapPosToGrid(sn.x, sn.y);
          sn.x = sx; sn.y = sy; sn.fx = sx; sn.fy = sy;
          const gn = pi.graph.nodes.find((gn2: any) => gn2.id === lastDragId.v);
          if (gn) { gn.x = sx; gn.y = sy; gn.fx = sx; gn.fy = sy; }
        }
        lastDragId.v = null;
      }
      getSM().setDragNode(null);
    },
    getLinkMode: () => pi.linkMode, getLinkSrc: () => pi.linkSrc,
    onLinkCursorMove: (x: number, y: number) => { pi.linkCursorX = x; pi.linkCursorY = y; if (sharedState.directDraw) sharedState.directDraw(); else draw(); },
    initSim: () => getSM().initSim(),
    clearEd: () => { pi.selNode = null; pi.selEdge = null; pi.selGroup = null; },
    fillNode, fillEdge, fillGroup,
    getGridSnapEnabled: () => pi.gridSnapEnabled || pi.partialGridSnap, getGridSp: () => pi.gridSp,
    getHiddenNodeIds: () => sharedState.hiddenNodeIds?.() ?? new Set(),
    setDragScale: (nodeId: string | null, scale: number) => { if (nodeId) { const sprite = sprites.get(nodeId); if (sprite) sprite.container.scale.set(scale); } },
    onMediaHover: (nodeId) => {
      if (nodeId) {
        if (nodeId === hoveredMediaId) return;
        hideMedia(hoveredMediaId);
        const gn = pi.graph.nodes.find(n => n.id === nodeId);
        if (gn?.mediaType && gn?.mediaUrl && !isExpanded(nodeId)) {
          showMedia(mediaOverlayContainer, nodeId, gn.label || nodeId, gn.mediaType, gn.mediaUrl, gn.color || '#5B8FF9', () => {
            const sp = px.viewport.toScreen(gn.x, gn.y);
            const rect = px.app.canvas.getBoundingClientRect();
            return { x: rect.left + sp.x, y: rect.top + sp.y };
          }, () => {}, () => {});
          const el = document.querySelector(`[data-media-id="${nodeId}"]`) as HTMLElement;
          if (el) el.style.pointerEvents = 'none';
          hoveredMediaId = nodeId;
        }
      } else {
        hideMedia(hoveredMediaId);
        hoveredMediaId = '';
      }
    },
    onTap: (x: number, y: number) => {
      saveCurrent();
      if (handleLinkTap(x, y)) return;
      if (pi.linkMode && !pi.linkSrc) {
        const ns = getSM().getSim()?.nodes() || [];
        const hit = ns.find((nd: any) => (nd.x - x) ** 2 + (nd.y - y) ** 2 <= ((nd.radius || 9) + pi.nodeExpand) ** 2);
        if (hit) { pi.linkSrc = hit.id; showToast(`源: ${hit.label || hit.id}，请点击目标节点`, 'info', 2000); return; }
      }
      const nodes = getSM().getSim()?.nodes() || [];
      const n = nodes.find((nd: any) => (nd.x - x) ** 2 + (nd.y - y) ** 2 <= ((nd.radius || 9) + pi.nodeExpand) ** 2);
      if (n) { pi.selNode = n.id; fillNode(n.id); draw(); return; }
      for (let i2 = 0; i2 < pi.graph.edges.length; i2++) {
        const e = pi.graph.edges[i2];
        const srcId = typeof e.source === 'object' ? e.source.id : e.source;
        const tgtId = typeof e.target === 'object' ? e.target.id : e.target;
        const s = nodes.find((nd: any) => nd.id === srcId), t = nodes.find((nd: any) => nd.id === tgtId);
        if (!s || !t) continue;
        const dx = t.x - s.x, dy = t.y - s.y; const len2 = dx * dx + dy * dy;
        let tp = ((x - s.x) * dx + (y - s.y) * dy) / len2; tp = Math.max(0, Math.min(1, tp));
        if ((x - (s.x + tp * dx)) ** 2 + (y - (s.y + tp * dy)) ** 2 <= (pi.lineExpand + 3) ** 2) { pi.selEdge = i2; fillEdge(i2); draw(); return; }
      }
      for (const g of pi.graph.groups) {
        if (g.displayMode === 'none') continue;
        const members = nodes.filter((nd: any) => (nd.tags || []).includes(g.label));
        if (members.length === 0) continue;
        if (g.displayMode === 'fluid') { for (const m of members) { if ((m.x - x) ** 2 + (m.y - y) ** 2 <= ((m.radius || 9) * (g.fluidRadius || 3)) ** 2) { pi.selGroup = g.id; if (pi.index === PANE_LEFT) fillGroup(g.id); draw(); return; } } continue; }
      }
      pi.selNode = null; pi.selEdge = null; pi.selGroup = null;
      editCtx.editPanel.style.display = 'none'; draw();
    },
    onCreateEdge: (sourceId: string, targetId: string, shiftKey?: boolean) => {
      pi.undoManager.pushSnapshot(pi.graph);
      const edge: any = { source: sourceId, target: targetId, label: '', color: '#BFBFBF', arrow: pi.defArrow, _createdAt: performance.now() };
      if (shiftKey) edge.lineStyle = 'dash-2';
      pi.graph.edges.push(edge);
      scheduleSave();
      const sim = getSM().getSim();
      if (sim) {
        const validEdges = pi.graph.edges.filter((e2: any) => (e2.lineStyle || 'solid') === 'solid' && !e2._conflict && !e2._dyingAt);
        sim.force("link", d3.forceLink(validEdges).id((d: any) => d.id).distance(pi.linkDist).strength(pi.linkStr));
        sim.alpha(0.3).restart();
        setTimeout(() => sim.alphaTarget(0), 3000);
      }
      draw();
    },
  };
};
  // 左窗格事件：直接读写单例变量，不通过假 PaneState
  const lastDragId0 = { v: _lastDragNodeId };
  setupCanvasEvents(eventsCanvas, bindPaneEvents(
    {
      index: 0 as number,
      get graph() { return graph; },
      get selNode() { return selNode; }, set selNode(v) { selNode = v; },
      get selEdge() { return selEdge; }, set selEdge(v) { selEdge = v; },
      get selGroup() { return selGroup; }, set selGroup(v) { selGroup = v; },
      get draggingNode() { return draggingNode; }, set draggingNode(v) { draggingNode = v; },
      get wasDragged() { return wasDragged; }, set wasDragged(v) { wasDragged = v; },
      get linkMode() { return linkMode; }, set linkMode(v) { linkMode = v; },
      get linkSrc() { return linkSrc; }, set linkSrc(v) { linkSrc = v; },
      get linkCursorX() { return linkCursorX; }, set linkCursorX(v) { linkCursorX = v; },
      get linkCursorY() { return linkCursorY; }, set linkCursorY(v) { linkCursorY = v; },
      get defArrow() { return defArrow; }, set defArrow(v) { defArrow = v; },
      get gw() { return gw; }, get gh() { return gh; },
      get linkDist() { return linkDist; }, get labelSize() { return labelSize; },
      get charge() { return charge; }, get linkStr() { return linkStr; },
      get collideR() { return collideR; }, get centerS() { return centerS; },
      get groupBound() { return groupBound; }, get heatingTime() { return heatingTime; },
      get alphaTarget() { return alphaTarget; }, get editPanelOpacity() { return editPanelOpacity; },
      get useRAFL() { return useRAFL; }, get nodeExpand() { return nodeExpand; },
      get lineExpand() { return lineExpand; }, get showGLabels() { return showGLabels; },
      get glMin() { return glMin; }, get glMax() { return glMax; },
      get gridVis() { return gridVis; }, get gridMode() { return gridMode; },
      get axisVis() { return axisVis; }, get axisTicks() { return axisTicks; },
      get gridSp() { return gridSp; }, get gridWidth() { return gridWidth; },
      get ar() { return ar; }, get graphTheme() { return graphTheme; },
      get focusMode() { return focusMode; }, get glowAppearance() { return glowAppearance; },
      get gridSnapEnabled() { return gridSnapEnabled; }, get partialGridSnap() { return partialGridSnap; },
      get nodeColorStyle() { return nodeColorStyle; }, get fixedHollow() { return fixedHollow; },
      get fontFamily() { return fontFamily; },
      get activeTab() { return activeTab; }, get openTabs() { return openTabs; },
      get dirtyTabs() { return dirtyTabs; }, get saveTimeout() { return saveTimeout; },
      get undoManager() { return undoManager; },
      pixi: null as any, canvasContainer: null as any,
      nodeSprites: null as any, readyToDraw: false, get simManager() { return simManager; },
      _lastDragNodeId: null, searchMatchIndex: 0, lastSearchTerm: "",
      searchDebounceTimer: null, currentAnimationCancel: null,
      savedFixedNodes: [], savedGroupModes: [], layouts: [],
      updateInfoRef: { current: () => {} }, updateSelectsRef: { current: () => {} },
    } as unknown as PaneState,
    pixi!, simManager, nodeSprites, lastDragId0
  ));
  if (pixi1) {
    const p1x = pixi1 as PixiLayers;
    const eventsCanvas1 = p1x.app.canvas as any;
    setupCanvasEvents(eventsCanvas1, bindPaneEvents(
      pane1, p1x, simManager1, pane1NodeSprites, { v: null }
    ));
  }

  // 启动时强制重建 demo 数据（仅当 demo 标签未开启时，保留用户修改）
  if (!restoreTabs()?.tabs?.includes('demo')) {
    localStorage.removeItem('fg-data-demo');
  }

  // 恢复上次打开的标签页（保证 demo 始终存在）
  const restored = restoreTabs();
  if (restored && restored.tabs.length > 0) {
    openTabs = restored.tabs;
    if (!openTabs.includes('demo')) openTabs.unshift('demo');
    activeTab = restored.active || 'demo';
  } else {
    openTabs = ['demo'];
    activeTab = 'demo';
  }
  // 恢复 pane1 标签
  try {
    const p1tabs = JSON.parse(localStorage.getItem(TABS_KEY + '-p1') || '[]');
    const p1active = localStorage.getItem(ACTIVE_KEY + '-p1') || 'demo';
    if (p1tabs.length > 0) { pane1.openTabs = p1tabs; pane1.activeTab = p1active || 'demo'; }
    else { pane1.openTabs = ['demo']; pane1.activeTab = 'demo'; }
  } catch { pane1.openTabs = ['demo']; pane1.activeTab = 'demo'; }
  renderAllTabs();

  // 尝试恢复文件夹（优先级: SAF > showDirectoryPicker > Capacitor > localStorage）
  const safDir = safIsAvailable() ? await safRestoreDirectory() : null;
  if (safDir) {
    fileSystemMountPath = safDir.name;
    await refreshFileTree();
  } else {
    fileSystemMountPath = 'graphs';
  await refreshFileTree();
  // Capacitor 可能还没初始化 → 延迟重试几次
  let _retry = 0;
  const _retryRefresh = () => {
    if (_retry++ > 4) return;
    setTimeout(async () => { await refreshFileTree(); }, _retry === 1 ? 500 : 1500);
  };
  try {
    if ((await listFilesMobile()).length === 0) _retryRefresh();
  } catch { _retryRefresh(); }
  // Electron / 桌面模式：有额外文件夹恢复路径
  const ea2 = (window as any).electronAPI;
  if (ea2) {
    const config = await ea2.configRead();
    const savedPath = config.folderPath;
    if (savedPath && await ea2.exists(savedPath)) {
      fileSystemMountPath = savedPath;
      await refreshFileTree();
    }
  } else {
    try {
      const savedHandle = await loadFolderHandle();
      if (savedHandle) {
        const ok = await restoreFolder(savedHandle);
        if (ok) { fileSystemMountPath = savedHandle.name; await refreshFileTree(); }
      }
    } catch {}
  }
  } // end else (SAF not available or not restored)

  // 在 loadGraphData（触发模拟）之前就把原点屏中
  {
    const p = pixi!;
    if (p.app.canvas.clientWidth > 0) {
      p.viewport.position.set(p.app.canvas.clientWidth / 2, p.app.canvas.clientHeight / 2);
    }
  }
  await loadGraphData(activeTab);
  requestAnimationFrame(() => requestAnimationFrame(() => draw())); // 双重 rAF 确保 canvas 已布局
  loadLayouts(); renderModeBar();
  updateGwGh();
  // Pane 1 加载 demo
  const demo1 = JSON.parse(JSON.stringify(DEMO_DATA));
  pane1.graph.nodes = demo1.nodes;
  pane1.graph.edges = demo1.edges;
  pane1.graph.groups = demo1.groups || [];
  if (demo1.settings) {
    for (const [k, v] of Object.entries(demo1.settings)) {
      (pane1 as any)[k] = v;
    }
    pane1.graphTheme = (demo1.settings as any).graphTheme || pane1.graphTheme;
  }
  // 设置 pane1 的画布背景（独立于 pane0）
  applyPaneCanvasBg(pane1Container, pane1.graphTheme);
  { const ac = getAccentColorsForTheme(pane1.graphTheme);
    pane1.themeAccentColor = ac.accent; pane1.themeAccentAltColor = ac.accentAlt; }
  simManager1.initSim();
  readyToDraw = true;

  // ===== 键盘快捷键 =====
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    // 输入控件中不处理快捷键
    const tag = (e.target as HTMLElement)?.tagName;
    const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable;
    if (isInput) return;

    const ctrl = e.ctrlKey || e.metaKey;
    const isExtra = focusedPaneIndex > PANE_LEFT;
    const fp = isExtra ? extraPanes[focusedPaneIndex - 1] : null;
    const fg = () => isExtra && fp ? fp.graph : graph;
    const fsim = () => isExtra && fp ? fp.simManager : simManager;
    const fsim1 = () => isExtra && fp ? fp.simManager : simManager; // unified

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (isExtra) {
        if (pane1.selNode) {
          pane1.undoManager.pushSnapshot(pane1.graph);
          const nIdx = pane1.graph.nodes.findIndex(n => n.id === pane1.selNode);
          if (nIdx >= 0) pane1.graph.nodes.splice(nIdx, 1);
          for (const ed of pane1.graph.edges) { if (ed.source === pane1.selNode || ed.target === pane1.selNode) (ed as any)._dyingAt = performance.now(); }
          pane1.selNode = null; pane1.selEdge = null; pane1.selGroup = null;
          scheduleSave(); pixiDrawPane1();
          setTimeout(() => {
            for (let i = pane1.graph.edges.length - 1; i >= 0; i--) { const e2: any = pane1.graph.edges[i]; if (e2._dyingAt != null && performance.now() - e2._dyingAt >= 400) pane1.graph.edges.splice(i, 1); }
            simManager1.initSim(); pixiDrawPane1();
          }, 400);
        } else if (pane1.selEdge !== null) {
          pane1.undoManager.pushSnapshot(pane1.graph);
          const e2 = pane1.graph.edges[pane1.selEdge]; if (e2) (e2 as any)._dyingAt = performance.now();
          pane1.selNode = null; pane1.selEdge = null; pane1.selGroup = null;
          scheduleSave(); pixiDrawPane1();
          setTimeout(() => {
            for (let i = pane1.graph.edges.length - 1; i >= 0; i--) { const e3: any = pane1.graph.edges[i]; if (e3._dyingAt != null && performance.now() - e3._dyingAt >= 400) pane1.graph.edges.splice(i, 1); }
            simManager1.initSim(); pixiDrawPane1();
          }, 400);
          showToast('连线已删除', 'info');
        } else if (pane1.selGroup) {
          pane1.undoManager.pushSnapshot(pane1.graph);
          const gIdx = pane1.graph.groups.findIndex(g => g.id === pane1.selGroup);
          if (gIdx >= 0) pane1.graph.groups.splice(gIdx, 1);
          pane1.selNode = null; pane1.selEdge = null; pane1.selGroup = null;
          scheduleSave(); pixiDrawPane1();
          showToast('集合已删除', 'info');
        }
      } else if (selNode) {
        saveUndo(); markNodesDying([selNode]);
        const nIdx = graph.nodes.findIndex(n => n.id === selNode);
        if (nIdx >= 0) graph.nodes.splice(nIdx, 1);
        for (const e of graph.edges) { const srcId = typeof e.source === 'object' ? e.source.id : e.source; const tgtId = typeof e.target === 'object' ? e.target.id : e.target; if (srcId === selNode || tgtId === selNode) (e as any)._dyingAt = performance.now(); }
        clearEd(); scheduleSave(); draw();
        setTimeout(() => {
          for (let i = graph.edges.length - 1; i >= 0; i--) { const e2: any = graph.edges[i]; if (e2._dyingAt != null && performance.now() - e2._dyingAt >= 400) graph.edges.splice(i, 1); }
          // 更新模拟链接力
          const s = getSim(); if (s) { const validEdges = graph.edges.filter(e => (e.lineStyle || 'solid') === 'solid' && !(e as any)._conflict && !(e as any)._dyingAt); s.force("link", d3.forceLink(validEdges).id((d: any) => d.id).distance(linkDist).strength(linkStr)); }
          scheduleSave(); draw();
        }, 400);
      } else if (selEdge !== null) {
        saveUndo(); const e2 = graph.edges[selEdge]; if (e2) e2._dyingAt = performance.now();
        clearEd(); scheduleSave(); draw();
        setTimeout(() => {
          for (let i = graph.edges.length - 1; i >= 0; i--) { const e3: any = graph.edges[i]; if (e3._dyingAt != null && performance.now() - e3._dyingAt >= 400) graph.edges.splice(i, 1); }
          const s = getSim(); if (s) { const validEdges = graph.edges.filter(e => (e.lineStyle || 'solid') === 'solid' && !(e as any)._conflict && !(e as any)._dyingAt); s.force("link", d3.forceLink(validEdges).id((d: any) => d.id).distance(linkDist).strength(linkStr)); }
          scheduleSave(); draw();
        }, 400);
        showToast('连线已删除', 'info');
      } else if (selGroup) {
        saveUndo(); const gIdx = graph.groups.findIndex(g => g.id === selGroup);
        if (gIdx >= 0) graph.groups.splice(gIdx, 1);
        clearEd(); scheduleSave(); draw();
        showToast('集合已删除', 'info');
      }
    } else if (ctrl && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      if (isExtra) {
        if (pane1.undoManager.undo(pane1.graph)) {
          pane1.selNode = null; pane1.selEdge = null; pane1.selGroup = null;
          simManager1.initSim(); draw();
        }
      } else {
        if (undoManager.undo(graph)) { clearEd(); simManager.initSim(); draw(); }
      }
    } else if (ctrl && e.key === 'z' && e.shiftKey) {
      e.preventDefault();
      if (isExtra) {
        if (pane1.undoManager.redo(pane1.graph)) {
          pane1.selNode = null; pane1.selEdge = null; pane1.selGroup = null;
          simManager1.initSim(); draw();
        }
      } else {
        if (undoManager.redo(graph)) { clearEd(); simManager.initSim(); draw(); }
      }
    } else if (ctrl && e.key === 's') {
      e.preventDefault(); saveNow(); showToast('已保存', 'success');
    } else if (e.key === 'f' && !ctrl) {
      e.preventDefault();
      // F 键：有选中 → 切换固定；无选中 → 回正视口
      if (isExtra) {
        if (pane1.selNode) {
          const n = pane1.graph.nodes.find(n2 => n2.id === pane1.selNode);
          if (n) {
            if (n.fixed) { n.fixed = false; n.fx = null; n.fy = null; }
            else { n.fixed = true; n.fx = n.x; n.fy = n.y; }
            const sn = simManager1.getSim()?.nodes().find((s: any) => s.id === pane1.selNode);
            if (sn) { sn.fixed = n.fixed; sn.fx = n.fx ?? null; sn.fy = n.fy ?? null; }
          }
          scheduleSave(); pixiDrawPane1();
        } else {
          // fit pane 1 viewport
          if (pixi1) {
            const nodes = simManager1.getSim()?.nodes() || [];
            if (nodes.length > 0) {
              const xs = nodes.map((n: any) => n.x), ys = nodes.map((n: any) => n.y);
              const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
              const halfW = Math.max(Math.abs(minX), Math.abs(maxX)) + 60;
              const halfH = Math.max(Math.abs(minY), Math.abs(maxY)) + 60;
              const cw = pixi1.app.canvas.clientWidth || 400;
              const ch = pixi1.app.canvas.clientHeight || 300;
              const scale = Math.min(cw/(halfW*2), ch/(halfH*2), 2);
              pixi1.viewport.animate({ scale, position: { x: 0, y: 0 }, time: 300 });
            }
          }
        }
        return;
      }
      const boxIds = sharedState.selectedNodeIds;
      if (boxIds.length >= 2) {
        const allFixed = boxIds.every(id => isFixedNode(id));
        if (allFixed) { unfixNodes(boxIds); }
        else { fixNodes(boxIds); }
      } else if (selNode) {
        if (isFixedNode(selNode)) { unfixNodes([selNode]); }
        else { fixNode(selNode); }
      } else {
        fitAllNodes();
      }
    } else if (e.key === 'n' && !ctrl) {
      e.preventDefault();
      if (isExtra) {
        const c = pixi1?.viewport?.center ?? { x: pane1.gw / 2, y: pane1.gh / 2 };
        const nid = 'n_' + Date.now();
        const nn = { id: nid, label: '新节点', headingLevel: 6, tags: [], x: c.x, y: c.y, _isNew: true };
        pane1.undoManager.pushSnapshot(pane1.graph);
        pane1.graph.nodes.push(nn); scheduleSave();
        const s1 = simManager1.getSim(); if (s1) { s1.nodes([...s1.nodes(), nn]); s1.alpha(0.3).restart(); }
        pixiDrawPane1();
      } else {
        addBtn.click();
      }
    } else if (/^[1-6]$/.test(e.key) && !ctrl && !e.shiftKey && !e.metaKey) {
      // 数字键 1-6：设置选中节点等级（输入框/可编辑元素聚焦时跳过）
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || (activeEl as any).isContentEditable)) return;
      e.preventDefault();
      const lv = parseInt(e.key);
      const levelR = [22, 19, 16, 13, 10, 7][lv - 1] || 9;
      if (isExtra) {
        const targets = pane1.selNode ? [pane1.selNode] : [];
        for (const nid of targets) {
          const n = pane1.graph.nodes.find(n2 => n2.id === nid);
          if (n) { n.headingLevel = lv; n.radius = undefined; n.radiusMode = undefined; }
          const sn = getSim1()?.nodes().find((s: any) => s.id === nid);
          if (sn) { sn.headingLevel = lv; sn.radius = levelR; sn.radiusMode = undefined; }
        }
        if (targets.length > 0) { scheduleSave(); pixiDrawPane1(); }
        return;
      }
      const targets = sharedState.selectedNodeIds.length >= 2 ? sharedState.selectedNodeIds : selNode ? [selNode] : [];
      for (const nid of targets) {
        const n = graph.nodes.find(n2 => n2.id === nid);
        if (n) { n.headingLevel = lv; n.radius = undefined; n.radiusMode = undefined; }
        const sn = getSim()?.nodes().find((s: any) => s.id === nid);
        if (sn) { sn.headingLevel = lv; sn.radius = levelR; sn.radiusMode = undefined; }
      }
      if (targets.length > 0) {
        scheduleSave(); draw();
        // 同步编辑面板
        if (selNode && targets.includes(selNode)) fillNode(selNode);
      }
    } else if (ctrl && e.key === 'd') {
      e.preventDefault();
      if (isExtra && pane1.selNode) {
        const g = pane1.graph; const orig = g.nodes.find(n => n.id === pane1.selNode);
        if (orig) {
          const newId = 'n_' + Date.now();
          const copy = JSON.parse(JSON.stringify(orig));
          copy.id = newId; copy.x = (orig.x || 0) + 60; copy.y = (orig.y || 0) + 40;
          delete copy.fx; delete copy.fy; delete copy.fixed;
          pane1.undoManager.pushSnapshot(g); g.nodes.push(copy);
          scheduleSave(); simManager1.initSim(); draw();
          showToast('节点已复制', 'success');
        }
      } else if (selNode) {
        const orig = graph.nodes.find(n => n.id === selNode);
        if (orig) {
          const newId = 'n_' + Date.now();
          const copy = JSON.parse(JSON.stringify(orig));
          copy.id = newId; copy.x = (orig.x || 0) + 60; copy.y = (orig.y || 0) + 40;
          delete copy.fx; delete copy.fy; delete copy.fixed;
          saveUndo(); graph.nodes.push(copy);
          scheduleSave(); simManager.initSim(); draw(); fillNode(newId);
          showToast('节点已复制', 'success');
        }
      }
    } else if (e.key === 'Escape') {
      if (sharedState.rightDragLink) { sharedState.rightDragLink = null; draw(); }
      else if (linkMode) { linkMode = false; linkSrc = null; linkBtn.style.background = ''; linkBtn.style.color = ''; showToast('已退出连线模式', 'info'); }
      else if (isExtra) {
        if (pane1.selNode || pane1.selEdge !== null || pane1.selGroup) {
          pane1.selNode = null; pane1.selEdge = null; pane1.selGroup = null;
          pixiDrawPane1();
        }
      }
      else if (selNode || selEdge !== null || selGroup) { clearEd(); }
    } else if (e.key === 'Tab' && !ctrl && !e.metaKey) {
      e.preventDefault();
      if (isExtra) {
        if (!pane1.selNode) return;
        const isShift2 = e.shiftKey;
        const _g = pane1.graph;
        if (isShift2) {
          const parentEdge = _g.edges.find(ed => ed.target === pane1.selNode);
          const parentId = parentEdge?.source;
          const p1sim = simManager1.getSim()?.nodes();
          const parent2 = parentId ? p1sim?.find(n => n.id === parentId) : null;
          const siblingId = 'n_' + Date.now();
          const sel2 = p1sim?.find(n => n.id === pane1.selNode);
          const siblingLevel = (sel2?.headingLevel as number) || 6;
          const cx = parent2 ? parent2.x : (sel2?.x || 200);
          const cy = parent2 ? parent2.y : (sel2?.y || 200);
          const sibling = { id: siblingId, label: '子节点', headingLevel: siblingLevel, tags: [], x: cx + 120, y: cy + 30, _isNew: true };
          pane1.undoManager.pushSnapshot(_g); _g.nodes.push(sibling);
          if (parentId) _g.edges.push({ source: parentId, target: siblingId, label: '', color: '#BFBFBF', arrow: pane1.defArrow });
          scheduleSave();
          // add to sim
          const s1 = simManager1.getSim(); if (s1) { s1.nodes([...s1.nodes(), sibling]); s1.alpha(0.3).restart(); }
          pixiDrawPane1();
        } else {
          const parent2 = simManager1.getSim()?.nodes().find(n => n.id === pane1.selNode);
          const childId = 'n_' + Date.now();
          const childLevel = Math.min(6, ((parent2?.headingLevel as number) || 6) + 1);
          const child = { id: childId, label: '子节点', headingLevel: childLevel, tags: [], x: (parent2?.x || 200) + 60, y: (parent2?.y || 200) + 40, _isNew: true };
          pane1.undoManager.pushSnapshot(_g); _g.nodes.push(child);
          _g.edges.push({ source: pane1.selNode, target: childId, label: '', color: '#BFBFBF', arrow: pane1.defArrow });
          scheduleSave();
          const s1 = simManager1.getSim(); if (s1) { s1.nodes([...s1.nodes(), child]); s1.alpha(0.3).restart(); }
          pixiDrawPane1();
        }
        return;
      }
      if (!selNode) return;
      const isShift = e.shiftKey;
      if (isShift) {
        // Shift+Tab：给选中节点的父级新建子节点（同级节点）
        const parentEdge = graph.edges.find(ed => ed.target === selNode);
        const parentId = parentEdge?.source;
        const simNodes = getSim()?.nodes();
        const parent = parentId ? simNodes?.find(n => n.id === parentId) : null;
        const siblingId = 'n_' + Date.now();
        const sel = simNodes?.find(n => n.id === selNode);
        const siblingLevel = (sel?.headingLevel as number) || 6;
        const cx = parent ? parent.x : (sel?.x || 200);
        const cy = parent ? parent.y : (sel?.y || 200);
        const sibling = { id: siblingId, label: '子节点', headingLevel: siblingLevel, tags: [], x: cx + 120, y: cy + 30, _isNew: true };
        saveUndo(); graph.nodes.push(sibling);
        if (parentId) {
          graph.edges.push({ source: parentId, target: siblingId, label: '', color: '#BFBFBF', arrow: defArrow, _createdAt: performance.now() });
        }
        scheduleSave(); addNodeToSim(sibling); draw(); fillNode(siblingId);
      } else {
        // Tab：给选中节点新建子节点
        const parent = getSim()?.nodes().find(n => n.id === selNode);
        const childId = 'n_' + Date.now();
        const childLevel = Math.min(6, ((parent?.headingLevel as number) || 6) + 1);
        const child = { id: childId, label: '子节点', headingLevel: childLevel, tags: [], x: (parent?.x || 200) + 60, y: (parent?.y || 200) + 40, _isNew: true };
        saveUndo(); graph.nodes.push(child);
        graph.edges.push({ source: selNode, target: childId, label: '', color: '#BFBFBF', arrow: defArrow, _createdAt: performance.now() });
        scheduleSave(); addNodeToSim(child); draw(); fillNode(childId);
      }
    }
  });

  // fitAllNodes 辅助函数
  const fitAllNodes = () => {
    const nodes = getSim()?.nodes() || [];
    if (!pixi) return;
    // 以世界原点 (0,0) 为中心，计算能容纳所有节点的缩放
    let maxX = 0, maxY = 0;
    for (const n of nodes) {
      maxX = Math.max(maxX, Math.abs(n.x));
      maxY = Math.max(maxY, Math.abs(n.y));
    }
    maxX += 60; maxY += 60;
    const vp = pixi!.viewport;
    const scale = Math.min(vp.screenWidth / (maxX * 2), vp.screenHeight / (maxY * 2), 2);
    // animate position 传入世界坐标，viewport 将其设为视口中心
    vp.animate({ scale, position: { x: 0, y: 0 }, time: FIT_ALL_DURATION });
  };

  // 侧边栏折叠动画同步
  window.addEventListener('sidebar-toggle', ((e: CustomEvent) => {
    const collapsed = e.detail?.collapsed;
    const newLeft = collapsed ? `${sidebarCollapsedLeft()}px` : `${sidebarExpandedLeft()}px`;
    floatingTop.style.left = newLeft;
    settingsDet.style.left = newLeft;
  }) as EventListener);

  // 响应式窗口大小调整（移动端横竖屏切换）
  let resizeDebounceTimer: ReturnType<typeof setTimeout>;
  window.addEventListener('resize', () => {
    clearTimeout(resizeDebounceTimer);
    resizeDebounceTimer = setTimeout(() => {
      const newWidth = getResponsiveSidebarWidth();
      // 仅在展开状态下更新侧边栏宽度
      if (sidebar.sidebar.style.width !== `${SIDEBAR_COLLAPSED_WIDTH}px`) {
        sidebar.sidebar.style.width = `${newWidth}px`;
        const newLeft = `${sidebarExpandedLeft()}px`;
        floatingTop.style.left = newLeft;
        settingsDet.style.left = newLeft;
      }
      // 更新两个 viewport 尺寸
      if (pixi) {
        pixi.viewport.resize(pixi.app.canvas.clientWidth, pixi.app.canvas.clientHeight);
      }
      if (pixi1) {
        pixi1.viewport.resize(pixi1.app.canvas.clientWidth, pixi1.app.canvas.clientHeight);
      }
      draw();
    }, 200);
  });

  // 分屏调整时更新所有 viewport 尺寸
  window.addEventListener('pane-resize', () => {
    setTimeout(() => {
      if (pixi) { pixi.viewport.resize(pixiContainer.clientWidth, pixiContainer.clientHeight); pixi.app.renderer.resize(pixiContainer.clientWidth, pixiContainer.clientHeight); }
      for (let i = 0; i < extraPixis.length; i++) {
        const px = extraPixis[i];
        if (px) {
          px.viewport.resize(extraContainers[i].clientWidth, extraContainers[i].clientHeight);
          px.app.renderer.resize(extraContainers[i].clientWidth, extraContainers[i].clientHeight);
        }
      }
      draw();
    }, 16);
  });

  // 模拟启动后可能短暂抖动，延迟一帧重新居中两个 viewport
  requestAnimationFrame(() => {
    if (pixi) {
      const cw0 = pixi.app.canvas.clientWidth;
      const ch0 = pixi.app.canvas.clientHeight;
      if (cw0 > 0 && ch0 > 0) pixi.viewport.position.set(cw0 / 2, ch0 / 2);
    }
    if (pixi1) {
      const cw1 = pixi1.app.canvas.clientWidth;
      const ch1 = pixi1.app.canvas.clientHeight;
      if (cw1 > 0 && ch1 > 0) pixi1.viewport.position.set(cw1 / 2, ch1 / 2);
    }
    draw();
  });

  // [阉割] 自动更新检查已移除

  // 页面关闭前强制同步保存当前图数据（防止 300ms 防抖期间的修改丢失）
  window.addEventListener('beforeunload', () => {
    if (graph && graph.nodes.length > 0) {
      graph.settings = collectSettings();
      const key = 'fg-data-' + activeTab;
      try { localStorage.setItem(key, JSON.stringify(graph, null, 2)); } catch {}
    }
  });
}

main().catch(console.error);
