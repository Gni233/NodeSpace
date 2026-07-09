/// <reference types="vite/client" />
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
import { openFolder, restoreFolder, listFileTree, flatFilePaths, getDirHandle } from './file-system';
import { saveFolderHandle, loadFolderHandle, clearFolderHandle } from './folder-store';
import { isCapacitor, importFilesMobile, pickDirectoryAndImport, downloadApk, downloadReleaseApk, installApk } from './fs-mobile';
import { safPickDirectory, safRestoreDirectory, safIsAvailable } from './saf-bridge';
import { isHarmonyOS } from './utils/platform';
import { FileAdapter } from './file-adapter';
import { createFSAAdapter } from './file-system';
import { createCapacitorAdapter } from './fs-mobile';
import { createHarmonyAdapter } from './fs-harmony';
import { createSAFAdapter } from './saf-bridge';
import { createElectronAdapter } from './fs-electron';
import { createStorageAdapter } from './data/storage';
import { importFilesHarmony } from './fs-harmony';
import { safePrompt, safeTextareaPrompt } from './dialog';
import { checkUpdate, UpdateInfo } from './update-checker';
import { showUpdateDialog } from './update-dialog';
import { BUILTIN_GRAPHS, BUILTIN_NAMES, BUILTIN_NAMES_SET, isBuiltin } from './demo-data';
import { computeRadialLayout } from './layouts/radial';
import { BlurFilter, Container, Graphics, Text } from 'pixi.js';
import { showMedia, positionMedia, hideMedia, isExpanded, clearAllMedia } from './media-nodes';
import { createSettingsPanel } from './settings-panel';
import { createMobileToolbar } from './ui-mobile-toolbar';
import { UndoManager } from './undo-redo';
import { showToast, confirmAction } from './toast';
import { startNodeAnimation } from './utils/animate-nodes';
import { EASING, DURATION } from './utils/easing';
import { createPaneState, PANE_LEFT, PANE_RIGHT, PaneState } from './pane-state';
import { PaneManager, PaneExternals } from './pane-manager';
import { createMultiPaneLayout, MultiPaneDOM } from './dual-pane-layout';
import { SIDEBAR_LEFT, SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_MIN_WIDTH, sidebarExpandedLeft, sidebarCollapsedLeft, getResponsiveSidebarWidth, Z_CANVAS, Z_LOADING, Z_FLOATING_UI, Z_MOBILE_TOOLBAR, Z_MEDIA_OVERLAY, Z_EDIT_PANEL, Z_SELECTION_BOX, Z_SETTINGS_PANEL, Z_DROPDOWN, Z_CONTEXT_MENU, Z_WINDOW_CONTROLS, Z_STATS, Z_TOAST, WIN_CONTROLS_WIDTH, LAYOUT_ANIM_DURATION, SEARCH_MOVE_DURATION, FIT_ALL_DURATION } from './layout-constants';
const ANIM_DURATION = 500;
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
  ar: 0.75, graphTheme: 'nord-dark', focusMode: false, centerMode: false, glowAppearance: true, selectedTooltip: false, gridWidth: 0.5, categoryLayout: false,
  edgeColorGradient: false, edgeWidthByLevel: false,
};

async function main() {
  const appEl = document.getElementById('app');
  if (!appEl) return;

  // CSS variable helper for inline styles (fallback for pre-theme state)
  const V = (name: string, fallback: string) => `var(${name},${fallback})`;

  // ===== 布局：全屏画布 + 玻璃悬浮 UI =====
  const appShell = document.createElement('div');
  appShell.style.cssText = 'position:relative;width:100vw;height:100vh;height:100dvh;overflow:hidden;padding-bottom:env(safe-area-inset-bottom,0px);';
  appEl.appendChild(appShell);

  // 选中节点 tooltip（独立于各窗格的 tooltip，全局唯一）
  const selTooltip = document.createElement('div');
  selTooltip.style.cssText = 'position:absolute;z-index:50;background:rgba(0,0,0,0.8);color:#fff;padding:4px 8px;border-radius:6px;font-size:12px;max-width:200px;pointer-events:none;display:none;white-space:pre-wrap;word-break:break-word;';
  appShell.appendChild(selTooltip);

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

    // ---- 外部文件变更监听（MCP Server 等外部工具修改了图文件） ----
    api.onExternalFileChange((graphName: string) => {
      handleExternalGraphChange(graphName);
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
        dualPane.layoutPanes();
        // 懒加载：确保右窗格 pixi 和 sim 就绪后再加载数据
        const initAndLoad = async () => {
          if (!extraPixis[0]) {
            extraPixis[0] = await createPixiApp(pane1Container);
            pixi1 = extraPixis[0];
            pixi1.viewport.on('moved', () => { if (readyToDraw) drawGridOnly(); });
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
          if (extraPixis[0]) {
            const pw = pane1Container.clientWidth, ph = pane1Container.clientHeight;
            extraPixis[0].app.renderer.resize(pw, ph);
            extraPixis[0].viewport.resize(pw, ph);
            extraPixis[0].viewport.position.set(pw / 2, ph / 2);
          }
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
        dualPane.layoutPanes();
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
  statsEl.style.cssText = `position:fixed;right:10px;bottom:calc(4px + env(safe-area-inset-bottom,0px));z-index:${Z_STATS};font-size:${V('--fg-font-xs', '0.72em')};color:${V('--fg-text-muted','#aaa')};pointer-events:none;`;
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
  let hoveredMediaId = '';
  const manuallyOpenedMediaIds = new Set<string>();

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
  const MINIMAP_BTN_SIZE = 30;
  const settingsDet = document.createElement('details');
  const settingsSum = document.createElement('summary');
  settingsSum.textContent = '图区自定义';
  settingsSum.style.cssText = `font-size:${V('--fg-font-sm', '0.84em')};cursor:pointer;opacity:0.7;padding:4px 0;`;
  settingsDet.appendChild(settingsSum);
  const setDiv = document.createElement('div');
  setDiv.style.cssText = 'padding:2px 0 6px 0;';
  settingsDet.appendChild(setDiv);
  settingsDet.className = 'fg-glass';
  const CONSOLE_BTN_SIZE = 30;
  settingsDet.style.cssText = `position:absolute;left:${sidebarExpandedLeft()}px;right:${CONSOLE_BTN_SIZE + MINIMAP_BTN_SIZE + 20}px;bottom:calc(6px + env(safe-area-inset-bottom,0px));z-index:${Z_FLOATING_UI};max-height:40vh;overflow-y:auto;padding:6px 12px;`;
  appShell.appendChild(settingsDet);

  // --- 全局视图按钮（右下角，与图区自定义同行） ---
  const minimapBtn = document.createElement('button');
  minimapBtn.textContent = '◉';
  minimapBtn.title = '全局视图';
  minimapBtn.className = 'fg-glass';
  minimapBtn.style.cssText = `position:absolute;right:6px;bottom:calc(6px + env(safe-area-inset-bottom,0px));z-index:${Z_FLOATING_UI};width:${MINIMAP_BTN_SIZE}px;height:28px;padding:0;font-size:14px;line-height:1;display:flex;align-items:center;justify-content:center;`;
  appShell.appendChild(minimapBtn);

  // --- 控制台按钮（右下角，minimap 左边） ---
  const consoleBtn = document.createElement('button');
  consoleBtn.textContent = '>';
  consoleBtn.title = '控制台 (Ctrl+Shift+P)';
  consoleBtn.className = 'fg-glass';
  consoleBtn.style.cssText = `position:absolute;right:${CONSOLE_BTN_SIZE + 12}px;bottom:calc(6px + env(safe-area-inset-bottom,0px));z-index:${Z_FLOATING_UI};width:${CONSOLE_BTN_SIZE}px;height:28px;padding:0;font-size:14px;line-height:1;display:flex;align-items:center;justify-content:center;font-weight:bold;`;
  appShell.appendChild(consoleBtn);

  // --- 控制台面板 ---
  const consolePanel = document.createElement('div');
  consolePanel.className = 'fg-glass';
  consolePanel.style.cssText = `position:absolute;left:${sidebarExpandedLeft()}px;right:74px;bottom:42px;z-index:${Z_FLOATING_UI};display:none;padding:6px 8px;gap:4px;flex-direction:column;`;
  appShell.appendChild(consolePanel);

  const consoleInput = document.createElement('textarea');
  consoleInput.placeholder = 'create_node label=test x=500 y=500';
  consoleInput.rows = 1;
  consoleInput.style.cssText = `background:var(--fg-input-bg,#3f3f3f);color:var(--fg-text,#fff);border:1px solid var(--fg-border,#7e7e7e);border-radius:4px;padding:4px 8px;font-size:13px;font-family:monospace;width:100%;resize:none;overflow:hidden;line-height:1.4;`;
  consolePanel.appendChild(consoleInput);

  const consoleResult = document.createElement('div');
  consoleResult.style.cssText = `font-size:11px;opacity:0.7;min-height:14px;font-family:monospace;color:var(--fg-text-muted);`;
  consolePanel.appendChild(consoleResult);

  // --- 控制台逻辑 ---
  let consoleVisible = false;
  const CMDS_KEY = 'fg-console-history';
  let cmdHistory: string[] = (() => { try { return JSON.parse(localStorage.getItem(CMDS_KEY) || '[]'); } catch { return []; } })();
  let cmdHistIdx = cmdHistory.length;

  const toggleConsole = () => {
    consoleVisible = !consoleVisible;
    consoleBtn.style.background = consoleVisible ? 'var(--fg-accent)' : '';
    consoleBtn.style.color = consoleVisible ? 'var(--fg-accent-text)' : '';
    consolePanel.style.display = consoleVisible ? 'flex' : 'none';
    if (consoleVisible) setTimeout(() => consoleInput.focus(), 50);
  };
  consoleBtn.addEventListener('click', toggleConsole);

  // 参数解析：create_node label=foo x=100 tags=a,b,c
  const parseArgs = (raw: string) => {
    const args: Record<string, string> = {};
    const regex = /(\w+)=("[^"]*"|'[^']*'|[^\s]+)/g;
    let m;
    while ((m = regex.exec(raw)) !== null) {
      let val = m[2];
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      args[m[1]] = val;
    }
    return args;
  };

  const execConsole = async () => {
    const input = consoleInput.value.trim();
    if (!input) return;
    // 保存历史
    cmdHistory.push(input); if (cmdHistory.length > 50) cmdHistory.shift();
    cmdHistIdx = cmdHistory.length;
    localStorage.setItem(CMDS_KEY, JSON.stringify(cmdHistory));

    // 按换行拆分，逐行执行
    const lines = input.split('\n').map(l => l.trim()).filter(l => l);
    const results: string[] = [];
    for (const line of lines) {
      const space = line.indexOf(' ');
      const cmd = (space >= 0 ? line.slice(0, space) : line).toLowerCase();
      const rawArgs = space >= 0 ? line.slice(space + 1) : '';
      const args = parseArgs(rawArgs);

    try {
      switch (cmd) {
        case 'create_node': {
          const label = args.label || 'unnamed';
          const x = parseFloat(args.x) || (pixi?.viewport?.center.x ?? 400);
          const y = parseFloat(args.y) || (pixi?.viewport?.center.y ?? 300);
          const color = args.color || '';
          const hl = parseInt(args.headinglevel || args.hl) || 1;
          const tags = args.tags ? args.tags.split(',').map((t: string) => t.trim()) : [];
          const id = label.replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fff\-]/g, '').slice(0, 30) + '-' + Math.random().toString(36).slice(2, 8);
          const node: any = { id, label, x, y, headingLevel: Math.max(1, Math.min(6, hl)), tags, note: '', color, radius: [0,20,17,14,12,10,8][Math.min(6,hl)], hyperlink: '', fixed: false, fx: null, fy: null, collapsed: hl >= 3, _isNew: false, mediaType: null, mediaUrl: null, radiusMode: 'level' };
          saveUndo();
          graph.nodes.push(node); scheduleSave();
          const sim = simManager.getSim();
          if (sim) {
            const sn: any = { id: node.id, label: node.label, headingLevel: node.headingLevel, tags: node.tags, x: node.x, y: node.y, _isNew: true };
            const curr = sim.nodes(); curr.push(sn); sim.nodes(curr);
            sim.alpha(0.05).alphaTarget(0.005).restart();
            sn.fx = sn.x; sn.fy = sn.y;
          }
          draw();
          results.push(`created: ${id}`); break;
        }
        case 'delete_node': {
          const id = args.id; const label = args.label;
          let found: any;
          if (id) found = graph.nodes.find((n: any) => n.id === id);
          else if (label) found = graph.nodes.find((n: any) => n.label === label);
          if (!found) { results.push('node not found'); break; }
          saveUndo();
          markNodesDying([found.id]);
          const idx = graph.nodes.findIndex((n: any) => n.id === found.id);
          if (idx >= 0) graph.nodes.splice(idx, 1);
          for (const e of graph.edges) {
            const s = typeof e.source === 'object' ? e.source.id : e.source;
            const t = typeof e.target === 'object' ? e.target.id : e.target;
            if (s === found.id || t === found.id) (e as any)._dyingAt = performance.now();
          }
          scheduleSave(); draw();
          setTimeout(() => { for (let i = graph.edges.length - 1; i >= 0; i--) { if ((graph.edges[i] as any)._dyingAt) graph.edges.splice(i, 1); } draw(); }, 400);
          results.push(`deleted: ${found.id}`); break;
        }
        case 'create_edge': {
          const src = graph.nodes.find((n: any) => n.id === args.source || n.label === args.source);
          const tgt = graph.nodes.find((n: any) => n.id === args.target || n.label === args.target);
          if (!src || !tgt) { results.push('source or target not found'); break; }
          saveUndo();
          const edge: any = { source: src.id, target: tgt.id, label: args.label || '', color: args.color || '#BFBFBF', lineStyle: args.linestyle || 'solid', arrow: args.arrow === 'forward', index: graph.edges.length };
          graph.edges.push(edge); scheduleSave();
          const s = simManager.getSim();
          if (s) {
            const validEdges = graph.edges.filter((e: any) => (e.lineStyle || 'solid') === 'solid' && !(e as any)._conflict);
            s.force("link", d3.forceLink(validEdges).id((d: any) => d.id).distance(linkDist).strength(linkStr));
          }
          draw();
          results.push(`edge: ${src.id} → ${tgt.id}`); break;
        }
        case 'delete_edge': {
          const idx = parseInt(args.index);
          if (isNaN(idx) || idx < 0 || idx >= graph.edges.length) { results.push(`invalid index (0-${graph.edges.length - 1})`); break; }
          saveUndo();
          (graph.edges[idx] as any)._dyingAt = performance.now(); scheduleSave(); draw();
          setTimeout(() => { for (let i = graph.edges.length - 1; i >= 0; i--) { if ((graph.edges[i] as any)._dyingAt) graph.edges.splice(i, 1); } draw(); }, 400);
          results.push('edge deleted'); break;
        }
        case 'create_graph': {
          const name = args.name || args.label;
          if (!name) { results.push('need "name" arg'); break; }
          const fn = name + '.json';
          if (openTabs.includes(fn)) { results.push(`"${name}" already open`); break; }
          await writeGraphData(fn, { nodes: [], edges: [], groups: [], settings: { ...DEFAULT_SETTINGS } });
          openTabs.push(fn); activeTab = fn;
          persistTabs(); renderAllTabs(); refreshFileTree();
          await loadGraphData(fn);
          results.push(`created & opened: ${name}`); break;
        }
        case 'delete_graph': {
          const name = args.name || args.label;
          if (!name) { results.push('need "name" arg'); break; }
          await createStorage(name).deleteData(); await adapter.deleteFile(name);
          openTabs = openTabs.filter(t => t !== name);
          if (activeTab === name) activeTab = openTabs[0] || '';
          persistTabs(); renderAllTabs();
          if (activeTab) await loadGraphData(activeTab);
          results.push(`deleted: ${name}`); break;
        }
        case 'switch':
        case 'open': {
          const raw = args.name || args.label;
          if (!raw) { results.push('need "name" arg'); break; }
          const name = raw.endsWith('.json') ? raw : raw + '.json';
          if (!openTabs.includes(name)) openTabs.push(name);
          activeTab = name; persistTabs(); renderAllTabs();
          await loadGraphData(name);
          results.push(`switched to: ${name}`); break;
        }
        case 'refresh': {
          await refreshFileTree(); renderAllTabs();
          results.push('file tree refreshed'); break;
        }
        case 'list': {
          const names = graph.nodes.slice(-20).map((n: any) => n.label).join(', ');
          results.push(`${graph.nodes.length} nodes, ${graph.edges.length} edges. Recent: ${names || '(none)'}`); break;
        }
        case 'help': {
          results.push('create_graph|delete_graph|create_node|delete_node|create_edge|delete_edge|switch|refresh|list|help'); break;
        }
        default:
          results.push(`unknown: ${cmd} (try "help")`); break;
        }
      } catch (e: any) {
        results.push(`error: ${e.message}`);
      }
    }
    consoleResult.textContent = results.join(' | ') || 'ok';
    consoleInput.value = '';
  };

  consoleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); execConsole(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (cmdHistIdx > 0) { cmdHistIdx--; consoleInput.value = cmdHistory[cmdHistIdx]; } }
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (cmdHistIdx < cmdHistory.length - 1) { cmdHistIdx++; consoleInput.value = cmdHistory[cmdHistIdx]; } else { cmdHistIdx = cmdHistory.length; consoleInput.value = ''; } }
    else if (e.key === 'Escape') { toggleConsole(); }
  });

  // Ctrl+Shift+P 快捷键
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'P') { e.preventDefault(); toggleConsole(); }
  });

  // 全局视图面板
  const MINIMAP_W = 180, MINIMAP_H = 130;
  const minimapPanel = document.createElement('div');
  minimapPanel.className = 'fg-glass-elevated';
  minimapPanel.style.cssText = `position:absolute;right:6px;bottom:42px;width:${MINIMAP_W}px;height:${MINIMAP_H}px;z-index:${Z_FLOATING_UI};display:none;overflow:hidden;padding:3px;`;
  appShell.appendChild(minimapPanel);

  const minimapCanvas = document.createElement('canvas');
  minimapCanvas.width = MINIMAP_W;
  minimapCanvas.height = MINIMAP_H;
  minimapCanvas.style.cssText = 'width:100%;height:100%;display:block;border-radius:4px;';
  minimapPanel.appendChild(minimapCanvas);
  const minimapCtx = minimapCanvas.getContext('2d')!;

  let minimapVisible = false;
  minimapBtn.addEventListener('click', () => {
    minimapVisible = !minimapVisible;
    minimapBtn.style.background = minimapVisible ? 'var(--fg-accent)' : '';
    minimapBtn.style.color = minimapVisible ? 'var(--fg-accent-text)' : '';
    minimapPanel.style.display = minimapVisible ? 'block' : 'none';
    if (minimapVisible) renderMinimap();
  });

  // 点击 minimap 跳转到对应位置
  minimapCanvas.addEventListener('click', (e) => {
    if (!pixi) return;
    const rect = minimapCanvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) / rect.width;
    const sy = (e.clientY - rect.top) / rect.height;

    // 计算图节点包围盒
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const ns = graph.nodes.length > 0 ? graph.nodes : simManager?.getSim()?.nodes() || [];
    for (const n of ns) {
      const r = (n.radius || 20) + 20;
      if (n.x - r < minX) minX = n.x - r;
      if (n.x + r > maxX) maxX = n.x + r;
      if (n.y - r < minY) minY = n.y - r;
      if (n.y + r > maxY) maxY = n.y + r;
    }
    if (!isFinite(minX)) return;
    minX -= 50; maxX += 50; minY -= 50; maxY += 50;

    const worldX = minX + sx * (maxX - minX);
    const worldY = minY + sy * (maxY - minY);

    const cw = pixi.app.canvas.clientWidth;
    const ch = pixi.app.canvas.clientHeight;
    pixi.viewport.moveCenter(worldX, worldY);
    draw();
  });

  // 全局视图渲染（缓存包围盒，仅节点数变化时重算）
  let _mmBbox: { minX: number; maxX: number; minY: number; maxY: number; count: number } | null = null;
  function renderMinimap() {
    if (!minimapVisible || !pixi) return;
    const ctx = minimapCtx;
    const w = MINIMAP_W, h = MINIMAP_H;

    // 优先从 sim 读取实时位置，无 sim 时回退到 graph.nodes
    const simNodes = simManager?.getSim()?.nodes() as any[] | undefined;
    const ns: { x: number; y: number }[] = simNodes?.length
      ? simNodes.filter((n: any) => !n._deleted && !n._dying)
      : graph.nodes;
    if (ns.length === 0) return;

    // 包围盒缓存：节点数不变时复用，每 30 帧强制刷新（覆盖节点移动导致的范围变化）
    let minX: number, maxX: number, minY: number, maxY: number;
    if (_mmBbox && _mmBbox.count === ns.length && frameCount % 30 !== 0) {
      ({ minX, maxX, minY, maxY } = _mmBbox);
    } else {
      minX = Infinity; maxX = -Infinity; minY = Infinity; maxY = -Infinity;
      for (const n of ns) {
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.y > maxY) maxY = n.y;
      }
      if (!isFinite(minX)) return;
      _mmBbox = { minX, maxX, minY, maxY, count: ns.length };
    }
    minX -= 30; maxX += 30; minY -= 30; maxY += 30;

    const worldW = maxX - minX || 1;
    const worldH = maxY - minY || 1;
    const scale = Math.min((w - 8) / worldW, (h - 8) / worldH);
    const offsetX = (w - worldW * scale) / 2;
    const offsetY = (h - worldH * scale) / 2;
    const mx = (wx: number) => offsetX + (wx - minX) * scale;
    const my = (wy: number) => offsetY + (wy - minY) * scale;

    // 绘制：单次路径批量画点 + 视口矩形
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    for (const n of ns) {
      ctx.moveTo(mx(n.x) + 0.8, my(n.y));
      ctx.arc(mx(n.x), my(n.y), 0.8, 0, Math.PI * 2);
    }
    ctx.fill();

    const vp = pixi.viewport;
    const vpScale = vp.scale.x;
    const cw = pixi.app.canvas.clientWidth;
    const ch = pixi.app.canvas.clientHeight;
    const vpLeft = vp.center.x - cw / (2 * vpScale);
    const vpTop = vp.center.y - ch / (2 * vpScale);
    const vpW = cw / vpScale;
    const vpH = ch / vpScale;

    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx(vpLeft), my(vpTop), vpW * scale, vpH * scale);
  }

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
  let activeTab = '开始';
  let fileSystemMountPath: string | null = null; // Electron 模式下的文件夹路径
  const capApp = isCapacitor();
  const isHarmony = !capApp && isHarmonyOS();

  // ---- 文件适配器（统一五平台 I/O） ----
  let adapter: FileAdapter = createStorageAdapter();
  const selectAdapter = () => {
    if (safIsAvailable()) { adapter = createSAFAdapter(); return; }
    const ea = (window as any).electronAPI;
    if (ea && fileSystemMountPath && fileSystemMountPath !== 'graphs') { adapter = createElectronAdapter(fileSystemMountPath); return; }
    if (fileSystemMountPath && fileSystemMountPath !== 'graphs') { adapter = createFSAAdapter(() => getDirHandle()); return; }
    if (capApp) { adapter = createCapacitorAdapter(); return; }
    if (isHarmony) { adapter = createHarmonyAdapter(); return; }
    adapter = createStorageAdapter();
  };
  const reinitAdapter = () => { selectAdapter(); };

  // 存储适配器：所有图统一走 localStorage
  const readGraphData = async (fileName: string): Promise<GraphData | null> => {
    const r = await adapter.readFile(fileName);
    if (r.ok && r.value) {
      const parsed = JSON.parse(r.value) as GraphData;
      const lsData = await createStorage(fileName).readData();
      if (lsData?.settings) { parsed.settings = { ...parsed.settings, ...lsData.settings }; }
      return parsed;
    }
    return await createStorage(fileName).readData();
  };

  const writeGraphData = async (fileName: string, data: GraphData): Promise<void> => {
    // 剥离运行时内部标记，防止下次加载时 initSimulation 过滤掉边
    const cleanEdges = (data.edges || []).map((e: any) => {
      const { _createdAt, _dyingAt, _conflict, ...rest } = e;
      return rest;
    });
    const cleanData = { ...data, edges: cleanEdges };
    await createStorage(fileName).writeData(cleanData);
    await adapter.writeFile(fileName, JSON.stringify(cleanData));
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
      await writeGraphData(path, empty);
      await refreshFileTree();
      await openTab(path);
    },
    onDeleteFile: async (path) => {
      await createStorage(path).deleteData();
      if (fileSystemMountPath) { await adapter.deleteFile(path); }
      openTabs = openTabs.filter(t => t !== path);
      if (activeTab === path) {
        activeTab = openTabs.length > 0 ? openTabs[openTabs.length - 1] : BUILTIN_NAMES[0];
        await loadGraphData(activeTab);
      }
      renderAllTabs();
      persistTabs();
      await refreshFileTree();
    },
    onRenameFile: async (oldPath, newName) => {
      const newPath = newName.endsWith('.json') ? newName : newName + '.json';
      await adapter.renameFile(oldPath, newPath);
      if (activeTab === oldPath) {
        openTabs = openTabs.map(t => t === oldPath ? newPath : t);
        await loadGraphData(newPath);
        renderAllTabs();
        persistTabs();
      }
      await refreshFileTree();
    },
    onCopyFile: async (path) => {
      const content = await readGraphData(path);
      const r = await adapter.suggestCopyName(path);
      const newPath = r.ok ? r.value : path.replace(/\.json$/, '') + ' 2.json';
      await writeGraphData(newPath, content || { nodes: [], edges: [], groups: [], settings: { ...DEFAULT_SETTINGS } });
      await refreshFileTree();
    },
    onNewFolder: async (_path) => {
      await adapter.createDirectory(_path);
      await refreshFileTree();
    },
    onMoveFile: async (src, dstDir) => {
      const parts = src.split('/'); const name = parts.pop()!;
      const dstPath = dstDir + '/' + name;
      const content = await readGraphData(src);
      await writeGraphData(dstPath, content || { nodes: [], edges: [], groups: [] });
      await adapter.moveFile(src, dstDir);
      if (activeTab === src) { await loadGraphData(dstPath); }
      await refreshFileTree();
    },
    onApplyPreset: () => { settingsPanel.show(); },
    onResetPresets: () => { settingsPanel.show(); },
    onOpenFolder: () => {},
  });

  // 侧边栏玻璃效果
  sidebar.sidebar.className = 'fg-glass';
  sidebar.sidebar.style.cssText = `position:absolute;left:${SIDEBAR_LEFT}px;top:6px;bottom:calc(6px + env(safe-area-inset-bottom,0px));z-index:${Z_FLOATING_UI};width:${getResponsiveSidebarWidth()}px;min-width:${SIDEBAR_MIN_WIDTH}px;display:flex;flex-direction:column;font-size:${V('--fg-font-md', '0.85em')};overflow:hidden;`;

  const buildFileTree = (files: { name: string; kind: 'file' | 'directory'; children: any[] }[]): any[] => {
    // 已有目录节点 → 已经是树状结构，直接返回
    if (files.some(f => f.kind === 'directory')) return files;
    // 扁平路径 → 构建嵌套树
    const root: Record<string, any> = {};
    for (const f of files) {
      const parts = f.name.split('/');
      let node = root;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!node[parts[i]]) node[parts[i]] = { _dir: true, _kids: {} };
        node = node[parts[i]]._kids;
      }
      node[parts[parts.length - 1]] = f;
    }
    const convert = (obj: Record<string, any>): any[] =>
      Object.entries(obj).sort(([a, va], [b, vb]) => {
        const aDir = va._dir, bDir = vb._dir;
        if (aDir !== bDir) return aDir ? -1 : 1;
        return a.localeCompare(b);
      }).map(([name, val]) => {
        if (val._dir) return { name, kind: 'directory', children: convert(val._kids) };
        return { name, kind: 'file', children: [] };
      });
    return convert(root);
  };

  // 文件树扁平路径缓存（Shift+上下导航用）
  let _flatTreePaths: string[] = [];

  const refreshFileTree = async () => {
    reinitAdapter();
    const r = await adapter.listFiles();
    if (r.ok && r.value.length > 0) {
      _flatTreePaths = flatFilePaths(r.value as any);
      // 确保路径统一（activeTab 本身带 .json）
      sidebar.updateFileTree(buildFileTree(r.value), activeTab);
      return;
    }
    // localStorage fallback
    const lsFiles: { name: string; kind: 'file' | 'directory'; children: any[] }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('fg-data-')) {
        const name = key.slice(8);
        if (name !== 'demo') lsFiles.push({ name, kind: 'file', children: [] });
      }
    }
    _flatTreePaths = lsFiles.map(f => f.name);
    sidebar.updateFileTree(buildFileTree(lsFiles), activeTab);
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

  // 恢复持久化的展开媒体
  function restoreExpandedMedia(paneGraph: any, px: any, sm: any) {
    const expanded = paneGraph.settings?.expandedMedia as string[] | undefined;
    if (!expanded?.length) return;
    for (const nodeId of expanded) {
      if (manuallyOpenedMediaIds.has(nodeId)) continue;
      const n = paneGraph.nodes.find((n2: any) => n2.id === nodeId);
      if (!n) continue;
      const type = n.mediaType || (n.note?.trim() ? 'md' : null);
      if (!type) continue;
      const sn = sm.getSim()?.nodes()?.find((sn2: any) => sn2.id === nodeId);
      if (!sn) continue;
      let displayUrl = n.mediaType ? (n.mediaUrl || '') : (n.note || '');
      if (displayUrl && /^[A-Z]:[\\/]/.test(displayUrl)) {
        displayUrl = 'file:///' + displayUrl.replace(/\\/g, '/').replace(/^[A-Z]:/, (m: string) => m.toLowerCase());
      }
      showMedia(mediaOverlayContainer, nodeId, n.label || nodeId, type, displayUrl, n.color || '#5B8FF9', () => {
        const sp = px.viewport.toScreen(sn.x, sn.y);
        const rect = px.app.canvas.getBoundingClientRect();
        return { x: rect.left + sp.x, y: rect.top + sp.y };
      }, () => { px.viewport.pause = true; }, () => { px.viewport.pause = false; });
      manuallyOpenedMediaIds.add(nodeId);
    }
  }

  // ===== 外部修改动画热更新（MCP Server / 其他工具修改图文件时触发） =====
  /**
   * handleExternalGraphChange — 响应外部修改
   * 计算新旧差异，以动画方式应用变更（新节点从中心扩散、删除节点渐变消失、移动节点平滑过渡）
   */
  const _extChangeLast = new Map<string, number>(); // graph → timestamp，防重复触发
  const EXT_CHANGE_DEBOUNCE = 500; // ms，与 fs.watch 防抖一致

  async function handleExternalGraphChange(graphName: string) {
    // 防抖：500ms 内同一图不重复处理（与 electron main.cjs 的 fs.watch 防抖一致）
    const now = Date.now();
    const last = _extChangeLast.get(graphName) || 0;
    if (now - last < 500) return;
    _extChangeLast.set(graphName, now);

    refreshFileTree();

    // strip .json 后缀，因为 activeTab 可能带后缀（来自文件系统）也可能不带
    const clean = (s: string) => s.replace(/\.json$/, '');
    const gnClean = clean(graphName);

    // 检查该图是否在任意窗格中被打开
    const isMain = clean(activeTab) === gnClean;
    const isPane1 = clean(pane1.activeTab) === gnClean;
    const extraIdx = extraPanes.slice(1).findIndex(ep => clean(ep.activeTab) === gnClean);

    if (!isMain && !isPane1 && extraIdx < 0) return;

    // 设置冷却标记，阻止 reload 后的 auto-save 覆盖外部修改
    externalChangeCooldown = true;
    setTimeout(() => { externalChangeCooldown = false; }, EXTERNAL_COOLDOWN_MS);

    // ---- 主窗格：动画热更新 ----
    if (isMain) {
      if (saveTimeout) { clearTimeout(saveTimeout); saveTimeout = null; }

      // 1) 保存旧状态快照
      const oldNodes = new Map<string, { x: number; y: number }>(
        graph.nodes.map(n => [n.id, { x: n.x, y: n.y }])
      );

      // 2) 读取新数据
      let newData: GraphData;
      if (import.meta.hot) {
        const resp = await fetch(`/api/graph/${graphName}`);
        newData = await resp.json();
        // 合并 localStorage settings（与 readGraphData 逻辑一致）
        const lsData = await createStorage(graphName).readData();
        if (lsData?.settings) {
          newData.settings = { ...(newData.settings || {}), ...lsData.settings };
        }
      } else {
        const saved = await readGraphData(graphName);
        newData = saved || { nodes: [], edges: [], groups: [] };
      }

      // 3) 计算差异
      const newIds = new Set((newData.nodes || []).map(n => n.id));
      const oldIds = new Set(graph.nodes.map(n => n.id));
      const addedNodes = (newData.nodes || []).filter(n => !oldIds.has(n.id));
      const removedNodeIds = graph.nodes.filter(n => !newIds.has(n.id)).map(n => n.id);
      const changedNodes = (newData.nodes || []).filter(n => {
        const old = oldNodes.get(n.id);
        return old && (old.x !== n.x || old.y !== n.y);
      });
      // 4) 计算差异（仅用于动画决策，不对节点做 dying 标记）（仅用于动画决策，不对节点做 dying 标记）

      // 5) 推送 undo 快照
      saveUndo();

      // 6) 更新 graph 数据（in-place 替换，保证多窗格共享同一 graph 引用时同步更新）
      const newNodesClean = (newData.nodes || []).map((n: any) => {
        const { _pieColors, ...rest } = n;
        return rest;
      });
      const newEdgesClean = (newData.edges || []).map((e: any) => {
        const { _createdAt, _dyingAt, _conflict, ...c } = e;
        return { ...c, source: typeof c.source === 'object' ? c.source.id : c.source, target: typeof c.target === 'object' ? c.target.id : c.target };
      });
      const newGroupsClean = newData.groups || [];
      graph.nodes.length = 0; Array.prototype.push.apply(graph.nodes, newNodesClean);
      graph.edges.length = 0; Array.prototype.push.apply(graph.edges, newEdgesClean);
      graph.groups.length = 0; Array.prototype.push.apply(graph.groups, newGroupsClean);

      // 7) 应用 settings
      if (newData.settings) {
        const s = newData.settings;
        linkDist = s.linkDist ?? linkDist; labelSize = s.labelSize ?? labelSize;
        charge = s.charge ?? charge; linkStr = s.linkStr ?? linkStr;
        collideR = s.collideR ?? collideR; centerS = s.centerS ?? centerS;
        groupBound = s.groupBound ?? groupBound;
        heatingTime = s.heatingTime ?? heatingTime; alphaTarget = s.alphaTarget ?? alphaTarget;
        editPanelOpacity = s.editPanelOpacity ?? editPanelOpacity;
        useRAFL = s.useRAFL ?? useRAFL;
        nodeExpand = s.nodeExpand ?? nodeExpand; lineExpand = s.lineExpand ?? lineExpand;
        showGLabels = s.showGLabels ?? showGLabels; glMin = s.glMin ?? glMin; glMax = s.glMax ?? glMax;
        gridVis = s.gridVis ?? gridVis; axisVis = s.axisVis ?? axisVis; axisTicks = s.axisTicks ?? axisTicks;
        gridSp = s.gridSp ?? gridSp; gridWidth = s.gridWidth ?? gridWidth;
        gridMode = (s.gridMode as 'line' | 'dot') || gridMode;
        ar = s.ar ?? ar; graphTheme = s.graphTheme || graphTheme;
        layoutMode = (s as any).layoutMode || layoutMode;
        gridSnapEnabled = (s as any).gridSnap || gridSnapEnabled;
        partialGridSnap = (s as any).partialGridSnap || partialGridSnap;
        nodeColorStyle = (s as any).nodeColorStyle || nodeColorStyle;
        fontFamily = (s as any).fontFamily || fontFamily;
        focusMode = s.focusMode ?? focusMode;
        centerMode = s.centerMode ?? centerMode;
        glowAppearance = s.glowAppearance ?? glowAppearance;
        categoryLayout = s.categoryLayout ?? categoryLayout;
        edgeColorGradient = s.edgeColorGradient ?? edgeColorGradient;
        edgeWidthByLevel = s.edgeWidthByLevel ?? edgeWidthByLevel;
        fixedHollow = (s as any).fixedHollow ?? fixedHollow;
        document.documentElement.style.setProperty('--fg-font-family', fontFamily);
        setNodeFontFamily(fontFamily);
      }

      // 8) 增量更新：先保存目标位置，再把节点放到视口中心，推入 sim
      const sim = simManager.getSim();
      const vp = pixi?.viewport;
      const vcx = vp?.center.x ?? gw / 2, vcy = vp?.center.y ?? gh / 2;
      // 先保存目标（从 newData 中取，此时 graph.nodes 已 in-place 更新但尚未移动到中心）
      const addedTargets = new Map<string, { x: number; y: number }>();
      for (const n of addedNodes) {
        addedTargets.set(n.id, { x: n.x, y: n.y });
      }
      // 再移到中心
      for (const n of addedNodes) {
        n.x = vcx; n.y = vcy; n.fx = vcx; n.fy = vcy;
        if (sim) {
          // 完全对齐 addNodeToSim 行为：先推入再设 fx/fy，避免 D3 初始化异常
          const sn: any = { id: n.id, label: n.label, headingLevel: n.headingLevel ?? 6, tags: n.tags ?? [], x: vcx, y: vcy, _isNew: true };
          const currentNodes = sim.nodes();
          currentNodes.push(sn);
          sim.nodes(currentNodes);
          sim.alpha(0.05).alphaTarget(0.005).restart();
          sn.fx = vcx; sn.fy = vcy;
        }
      }
      // 有新边时更新 link force
      const hasNewEdges = (newEdgesClean || []).length !== graph.edges.length;
      if (sim && hasNewEdges) {
        const validEdges = graph.edges.filter((e: any) => (e.lineStyle || 'solid') === 'solid' && !(e as any)._conflict);
        sim.force("link", d3.forceLink(validEdges).id((d: any) => d.id).distance(linkDist).strength(linkStr));
      }
      if (sim && addedNodes.length > 0) sim.alpha(0.05).restart();

      // 8b) 删除节点：标记 dying 渐变消失，250ms 后从 sim 移除
      if (removedNodeIds.length > 0 && sim) {
        const removedSet = new Set(removedNodeIds);
        for (const sn of sim.nodes()) {
          if (removedSet.has(sn.id)) (sn as any)._dying = performance.now();
        }
        setTimeout(() => {
          const sim2 = simManager.getSim();
          if (sim2) {
            const alive = sim2.nodes().filter((sn: any) => !(sn as any)._dying);
            sim2.nodes(alive);
            const validEdges = graph.edges.filter((e: any) => (e.lineStyle || 'solid') === 'solid' && !(e as any)._conflict);
            sim2.force("link", d3.forceLink(validEdges).id((d: any) => d.id).distance(linkDist).strength(linkStr));
          }
          draw();
        }, 250);
      }

      // 10) 新节点入场动画：从视口中心弹飞到目标位置（addedTargets 在步骤 8 已保存）
      if (addedNodes.length > 0) {
        const addedIds = new Set(addedNodes.map(n => n.id));
        startNodeAnimation({
          nodes: graph.nodes,
          simNodes: simManager.getSim()?.nodes() || [],
          getSource: n => addedIds.has(n.id) ? { x: vcx, y: vcy } : { x: n.x, y: n.y },
          getTarget: n => addedTargets.get(n.id) || null,
          duration: 800,
          easing: EASING.easeOut,
          onFrame: () => draw(),
          onComplete: () => {
            // 动画结束，新节点保持固定，用户拖拽后自然释放
            draw();
          },
        });
      }

      // 11) 最终渲染
      draw();
      return;
    }

    // ---- Pane1：回退到完整重载 ----
    if (isPane1) {
      if (pane1.saveTimeout) { clearTimeout(pane1.saveTimeout); pane1.saveTimeout = null; }
      loadGraphDataPane1(graphName);
      return;
    }

    // ---- Extra pane：回退到完整重载 ----
    if (extraIdx >= 0) {
      const ep = extraPanes[extraIdx + 1];
      if (ep.saveTimeout) { clearTimeout(ep.saveTimeout); ep.saveTimeout = null; }
      loadGraphForPane(ep, graphName);
    }
  }

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
    if (pixi) { for (const c of pixi.blobLayer.children.slice()) c.destroy({ children: true }); for (const c of pixi.nodeLayer.children.slice()) c.destroy({ children: true }); pixi.nodeLayer.removeChildren(); for (const c of pixi.edgeLayer.children.slice()) c.destroy({ children: true }); pixi.edgeLayer.removeChildren(); }
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
      if (activeTab !== fileName) { loadingOverlay.style.display = 'none'; return; }
      if (isBuiltin(fileName)) {
        // 首次从硬编码加载；后续从 localStorage 读取用户的修改
        if (saved && saved.nodes && saved.nodes.length > 0) {
          graph.nodes = saved.nodes;
          graph.edges = (saved.edges || []).map((e: any) => { const { _createdAt, _dyingAt, ...c } = e; return { ...c, source: typeof c.source === 'object' ? c.source.id : c.source, target: typeof c.target === 'object' ? c.target.id : c.target }; });
          graph.groups = saved.groups || [];
          graph.settings = saved.settings;
        } else {
          const builtin = JSON.parse(JSON.stringify(BUILTIN_GRAPHS[fileName]));
          graph.nodes = builtin.nodes;
          graph.edges = builtin.edges;
          graph.groups = builtin.groups;
          graph.settings = { ...DEFAULT_SETTINGS, ...builtin.settings };
          await writeGraphData(fileName, graph);
        }
      } else if (saved && saved.nodes && saved.nodes.length > 0) {
        graph.nodes = saved.nodes;
        graph.edges = (saved.edges || []).map((e: any) => {
          const { _createdAt, _dyingAt, ...clean } = e;
          return { ...clean, source: typeof clean.source === 'object' ? clean.source.id : clean.source, target: typeof clean.target === 'object' ? clean.target.id : clean.target };
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
      selectedTooltip = (s as any).selectedTooltip ?? false;
      centerMode = s.centerMode ?? false;
      starRotateMode = s.starRotateMode ?? false;
      glowAppearance = s.glowAppearance ?? false;
      categoryLayout = s.categoryLayout ?? false;
      edgeColorGradient = s.edgeColorGradient ?? false;
      edgeWidthByLevel = s.edgeWidthByLevel ?? false;
      fixedHollow = (s as any).fixedHollow ?? true;
    }
    sharedState.setFocusModeFn(() => $.focusMode);
    applyPaneCanvasBg(pixiContainer, graphTheme);
    { const ac = getAccentColorsForTheme(graphTheme);
      _pane0AccentColor = ac.accent; _pane0AccentAltColor = ac.accentAlt; }
    if (focusedPaneIndex === PANE_LEFT) applyUIToFocusedPane(graphTheme);
    // 切图时：根据文件布局模式重置按钮状态（默认就归零，非默认由 applyLayoutMode 恢复）
    const savedMode = layoutMode || 'default';
    if (savedMode === 'default' || savedMode === 'gridsnap') {
      treeMode = false; categoryMode = false; fullCatMode = false;
      activeMode = 'default'; layoutMode = 'default';
    } else {
      // 非默认布局：清空保存的固定状态，防止 restoreFixedState() 把初始布局的固定节点重新锁定
      savedFixedNodes = [];
    }
    // 无条件清除运行时标记：不管什么布局模式，initSim 前必须清理
    for (const n of graph.nodes) { delete (n as any)._pieColors; }
    for (const e of graph.edges) { delete (e as any)._conflict; delete (e as any)._dyingAt; }
    if (savedMode === 'default' && !sharing) {
      // 保留手动固定的节点，仅清除非固定节点的 fx/fy（可能残留自上轮动画的临时固定）
      for (const n of graph.nodes) {
        if (!n.fixed) { n.fx = null; n.fy = null; }
      }
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
    setTimeout(() => { draw(); restoreExpandedMedia(graph, pixi, simManager); }, 100);
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
    if (pixi1) { for (const c of pixi1.blobLayer.children.slice()) c.destroy({ children: true }); pixi1.blobLayer.removeChildren(); for (const c of pixi1.nodeLayer.children.slice()) c.destroy({ children: true }); pixi1.nodeLayer.removeChildren(); for (const c of pixi1.edgeLayer.children.slice()) c.destroy({ children: true }); pixi1.edgeLayer.removeChildren(); }
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
      if (pane1.activeTab !== fileName) { if (pixi1) { loadingOverlay.style.display = 'none'; } return; }
      if (isBuiltin(fileName)) {
        if (saved && saved.nodes && saved.nodes.length > 0) {
          pane1.graph.nodes = saved.nodes;
          pane1.graph.edges = (saved.edges || []).map((e: any) => { const { _createdAt, _dyingAt, ...c } = e; return c; });
          pane1.graph.groups = saved.groups || [];
          pane1.graph.settings = saved.settings;
        } else {
          const builtin = JSON.parse(JSON.stringify(BUILTIN_GRAPHS[fileName]));
          pane1.graph.nodes = builtin.nodes;
          pane1.graph.edges = builtin.edges;
          pane1.graph.groups = builtin.groups;
          pane1.graph.settings = { ...DEFAULT_SETTINGS, ...builtin.settings };
          await writeGraphData(fileName, pane1.graph);
        }
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
    setTimeout(() => restoreExpandedMedia(pane1.graph, pixi1, simManager1), 100);
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
    if (pane.pixi) { for (const c of pane.pixi.nodeLayer.children.slice()) c.destroy({ children: true }); pane.pixi.nodeLayer.removeChildren(); for (const c of pane.pixi.edgeLayer.children.slice()) c.destroy({ children: true }); pane.pixi.edgeLayer.removeChildren(); for (const c of pane.pixi.blobLayer.children.slice()) c.destroy({ children: true }); pane.pixi.blobLayer.removeChildren(); }
    pane.nodeSprites.clear();

    // 检查是否已有其他窗格持有同文件 → 共享 graph 引用 + simManager
    const existing = findExistingForFile(fileName, pane);
    if (existing) {
      pane.graph.nodes = existing.graph.nodes;
      pane.graph.edges = existing.graph.edges;
      pane.graph.groups = existing.graph.groups;
      pane.simManager = existing.simManager;
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
      if (pane.activeTab !== fileName) { loadingOverlay.style.display = 'none'; return; }
      if (isBuiltin(fileName)) {
        if (saved && saved.nodes && saved.nodes.length > 0) {
          pane.graph.nodes = saved.nodes;
          pane.graph.edges = (saved.edges || []).map((e: any) => { const { _createdAt, _dyingAt, ...c } = e; return c; });
          pane.graph.groups = saved.groups || [];
          pane.graph.settings = saved.settings;
        } else {
          const builtin = JSON.parse(JSON.stringify(BUILTIN_GRAPHS[fileName]));
          pane.graph.nodes = builtin.nodes; pane.graph.edges = builtin.edges; pane.graph.groups = builtin.groups;
          pane.graph.settings = { ...DEFAULT_SETTINGS, ...builtin.settings };
          await writeGraphData(fileName, pane.graph);
        }
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
    setTimeout(() => restoreExpandedMedia(pane.graph, pane.pixi, pane.simManager), 100);
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
    pane.selectedTooltip = (s as any).selectedTooltip ?? false;
    pane.centerMode = (s as any).centerMode ?? false;
    pane.glowAppearance = s.glowAppearance ?? false;
    pane.fixedHollow = (s as any).fixedHollow ?? true;
  }

  /** 查找已持有 fileName 的现有 pane 数据（graph + simManager），不含自身 self */
  function findExistingForFile(fileName: string, self?: PaneState): { graph: GraphData; simManager: any } | null {
    const selfIdx = self ? self.index : undefined;
    // 已有窗格的 graph 必须有内容（非空 nodes），否则视为未加载
    const isValid = (g: GraphData) => g.nodes && g.nodes.length > 0;
    // 左窗格（selfIdx !== undefined 防止左窗格自己加载时把自己当成已有窗格）
    if (activeTab === fileName && selfIdx !== undefined && selfIdx !== PANE_LEFT && isValid(graph)) return { graph, simManager };
    // pane1
    if (pane1.activeTab === fileName && pane1 !== self && isValid(pane1.graph)) return { graph: pane1.graph, simManager: simManager1 };
    // extraPanes beyond pane1
    for (let i = 1; i < extraPanes.length; i++) {
      if (extraPanes[i] !== self && extraPanes[i].activeTab === fileName && isValid(extraPanes[i].graph)) return { graph: extraPanes[i].graph, simManager: extraSims[i] };
    }
    return null;
  }

  async function openTab(fileName: string) {
    const ts = focusedTabState();
    if (ts.st) clearTimeout(ts.st);
    if (ts.at !== fileName) {
      ts.g.settings = collectSettings();
      await writeGraphData(ts.at, ts.g);
      clearAllMedia(); manuallyOpenedMediaIds.clear(); hoveredMediaId = '';
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
    draw();
  }

  async function switchTab(fileName: string) {
    const ts = focusedTabState();
    if (fileName === ts.at) return;
    if (ts.st) clearTimeout(ts.st);
    ts.g.settings = collectSettings();
    await writeGraphData(ts.at, ts.g);
    clearAllMedia(); manuallyOpenedMediaIds.clear(); hoveredMediaId = '';
    if (focusedPaneIndex === PANE_LEFT) {
      activeTab = fileName; await loadGraphData(fileName);
    } else {
      const ep = extraPanes[focusedPaneIndex - 1];
      if (ep) await loadGraphForPane(ep, fileName);
    }
    try { loadLayouts(); renderModeBar(); } catch {}
    renderAllTabs();
    persistTabs();
    sidebar.syncActiveFile(fileName);
    draw();
  }

  async function closeTab(fileName: string) {
    clearAllMedia(); manuallyOpenedMediaIds.clear(); hoveredMediaId = '';
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
    // 保存当前标签数据（与 switchTab/openTab 一致）
    if (ep) {
      if (ep.saveTimeout) clearTimeout(ep.saveTimeout);
      await writeGraphData(ep.activeTab, ep.graph);
    } else {
      if (saveTimeout) { clearTimeout(saveTimeout); saveTimeout = null; }
      await writeGraphData(activeTab, graph);
    }
    const presetSettings = Object.keys(presetDefaults).length > 0 ? { ...DEFAULT_SETTINGS, ...presetDefaults } : { ...DEFAULT_SETTINGS };
    const empty: GraphData = { nodes: [], edges: [], groups: [], settings: presetSettings };
    await writeGraphData(fileName, empty);
    if (ep) {
      ep.graph = { nodes: [], edges: [], groups: [], settings: { ...DEFAULT_SETTINGS } };
      ep.openTabs.push(fileName);
      ep.activeTab = fileName;
      await loadGraphForPane(ep, fileName);
    } else {
      graph.nodes = []; graph.edges = []; graph.groups = [];
      graph.settings = { ...DEFAULT_SETTINGS };
      openTabs.push(fileName);
      activeTab = fileName;
      await loadGraphData(fileName);
    }
    renderAllTabs();
    persistTabs();
    await refreshFileTree();
  }

  // ===== PaneManager + 单例兼容层 =====
  // pm.$ Proxy 将所有属性访问代理到当前焦点窗格
  // 同时保留所有单例变量，初始时指向 pane 0 的状态，焦点切换时换入/换出
  const pm = new PaneManager();
  // Proxy: routes to pane0 singletons or pane1 based on focusedPaneIndex
  const $ = new Proxy({} as any, {
    get(_: any, prop: string) {
      return (focusedPaneIndex === PANE_RIGHT ? pane1 as any : pane0)[prop];
    },
    set(_: any, prop: string, val: any) {
      (focusedPaneIndex === PANE_RIGHT ? pane1 as any : pane0)[prop] = val;
      return true;
    }
  });

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
      focusMode = DEFAULT_SETTINGS.focusMode, centerMode = DEFAULT_SETTINGS.centerMode, starRotateMode = DEFAULT_SETTINGS.starRotateMode || false, glowAppearance = DEFAULT_SETTINGS.glowAppearance, selectedTooltip = DEFAULT_SETTINGS.selectedTooltip || false, categoryLayout = DEFAULT_SETTINGS.categoryLayout,
    layoutMode = DEFAULT_SETTINGS.layoutMode || 'default', gridSnapEnabled = DEFAULT_SETTINGS.gridSnap || false, partialGridSnap = DEFAULT_SETTINGS.partialGridSnap || false, nodeColorStyle = (DEFAULT_SETTINGS.nodeColorStyle as 'uniform' | 'hierarchical' | 'spectrum' | 'spectrum-narrow') || 'spectrum-narrow', fixedHollow = true,
    edgeColorGradient = DEFAULT_SETTINGS.edgeColorGradient || false, edgeWidthByLevel = DEFAULT_SETTINGS.edgeWidthByLevel || false,
    fontFamily = (DEFAULT_SETTINGS as any).fontFamily || '"SiYuan Songti", serif';

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
  let boxSelectMode = false;
  let _lastDragNodeId: string | null = null;
  let defArrow = false;
  let linkCursorX = 0, linkCursorY = 0;

  // 节点剪贴板（跨图复制粘贴）— 通过 sharedState.sharedState.nodeClipboard 共享

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

  // ═══ 纯 RAF 星型物理循环 ═══
  // WASD 视口移动 + Alt+方向键连续缩放（共用 RAF 循环）
  const _wasd = { pressed: { w: false, a: false, s: false, d: false } as Record<string,boolean>, vx: 0, vy: 0,
    zoom: { up: false, down: false, left: false, right: false } as Record<string,boolean> };
  let _wasdRaf: number | null = null;
  const ACCEL = 3, MAX_SPEED = 20, FRICTION = 0.85;
  const ZOOM_COARSE = 1.02, ZOOM_FINE = 1.005; // 每帧倍率：粗≈0.5秒翻倍，细≈2秒翻倍
  function _wasdLoop() {
    if (!pixi) { _wasdRaf = requestAnimationFrame(_wasdLoop); return; }
    let needsDraw = false;

    // ── Alt+方向键：连续缩放 ──
    const zooming = _wasd.zoom.up || _wasd.zoom.down || _wasd.zoom.left || _wasd.zoom.right;
    if (zooming) {
      const vp = pixi!.viewport;
      let s = vp.scale.x;
      if (_wasd.zoom.up) s *= ZOOM_COARSE;
      if (_wasd.zoom.down) s /= ZOOM_COARSE;
      if (_wasd.zoom.right) s *= ZOOM_FINE;
      if (_wasd.zoom.left) s /= ZOOM_FINE;
      s = Math.max(0.05, Math.min(20, s));
      vp.scale.set(s); (vp as any).dirty = true;
      needsDraw = true;
    }

    // ── WASD：视口平移 ──
    const active = _wasd.pressed.w || _wasd.pressed.s || _wasd.pressed.a || _wasd.pressed.d;
    if (centerMode && selNode) {
      if (Math.abs(_wasd.vx) > 0.01 || Math.abs(_wasd.vy) > 0.01) {
        _wasd.vx *= FRICTION; _wasd.vy *= FRICTION;
        if (Math.abs(_wasd.vx) < 0.05) _wasd.vx = 0;
        if (Math.abs(_wasd.vy) < 0.05) _wasd.vy = 0;
        sharedState.viewportDragging = true;
        pixi!.viewport.moveCenter(pixi!.viewport.center.x + _wasd.vx, pixi!.viewport.center.y + _wasd.vy);
        sharedState.viewportDragging = false;
        needsDraw = true;
      }
    } else if (active) {
      if (_wasd.pressed.w) _wasd.vy -= ACCEL;
      if (_wasd.pressed.s) _wasd.vy += ACCEL;
      if (_wasd.pressed.a) _wasd.vx -= ACCEL;
      if (_wasd.pressed.d) _wasd.vx += ACCEL;
      const len = Math.sqrt(_wasd.vx ** 2 + _wasd.vy ** 2);
      if (len > MAX_SPEED) { _wasd.vx *= MAX_SPEED / len; _wasd.vy *= MAX_SPEED / len; }
      sharedState.viewportDragging = true;
      pixi!.viewport.moveCenter(pixi!.viewport.center.x + _wasd.vx, pixi!.viewport.center.y + _wasd.vy);
      sharedState.viewportDragging = false;
      needsDraw = true;
    } else if (Math.abs(_wasd.vx) > 0.01 || Math.abs(_wasd.vy) > 0.01) {
      _wasd.vx *= FRICTION; _wasd.vy *= FRICTION;
      if (Math.abs(_wasd.vx) < 0.05) _wasd.vx = 0;
      if (Math.abs(_wasd.vy) < 0.05) _wasd.vy = 0;
      sharedState.viewportDragging = true;
      pixi!.viewport.moveCenter(pixi!.viewport.center.x + _wasd.vx, pixi!.viewport.center.y + _wasd.vy);
      sharedState.viewportDragging = false;
      needsDraw = true;
    }
    if (needsDraw && sharedState.directDraw) sharedState.directDraw();
    _wasdRaf = requestAnimationFrame(_wasdLoop);
  }
  function _startWasdLoop() { if (_wasdRaf === null) { _wasdRaf = requestAnimationFrame(_wasdLoop); } }
  _startWasdLoop();

  window.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
    if (e.key === 'w' || e.key === 'a' || e.key === 's' || e.key === 'd') {
      _wasd.pressed[e.key] = true; e.preventDefault();
    }
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
      if (dir) { _wasd.zoom[dir] = true; e.preventDefault(); }
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'w' || e.key === 'a' || e.key === 's' || e.key === 'd') { _wasd.pressed[e.key] = false; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const dir = ({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' } as Record<string,string>)[e.key];
      if (dir) _wasd.zoom[dir] = false;
    }
    if (e.key === 'Alt') { _wasd.zoom.up = _wasd.zoom.down = _wasd.zoom.left = _wasd.zoom.right = false; }
  });

  let _starRaf: number | null = null;
  let _starLastNodeCount = 0;
  let _starLastFrameTime = 0;
  /** 最外层线速度 px/s，保持人眼可跟随 */
  const ROTATE_LINEAR_SPEED = 200;

  function startStarLoop() {
    if (_starRaf !== null) return;
    const sim = simManager.getSim();
    if (sim) sim.stop();
    _starLastNodeCount = graph.nodes.length;
    _starLastFrameTime = performance.now();
    _starRaf = requestAnimationFrame(starFrame);
  }

  function stopStarLoop() {
    if (_starRaf !== null) { cancelAnimationFrame(_starRaf); _starRaf = null; }
    starRotateMode = false;
    const sim = simManager.getSim();
    if (sim) { for (const n of sim.nodes()) { n.fx = null; n.fy = null; } sim.alpha(0.3).restart(); }
    renderModeBar();
  }

  function starFrame() {
    if (activeMode !== 'radial') { stopStarLoop(); return; }
    const sim = simManager.getSim();
    if (!sim) { stopStarLoop(); return; }
    if ((sim as any)._animating) { _starRaf = requestAnimationFrame(starFrame); return; }
    sim.stop();
    const all = sim.nodes() as any[];
    const gn = graph.nodes;

    // 保存根当前位置
    const rootPos = new Map<string, {x:number,y:number,angle:number}>();
    const now = performance.now();
    const dt = _starLastFrameTime > 0 ? (now - _starLastFrameTime) / 1000 : 0;
    _starLastFrameTime = now;
    for (const n of all) {
      if ((n as any)._starRoot) {
        let angle = (n as any)._starAngle || 0;
        if (starRotateMode && dt > 0 && dt < 0.5) {
          const maxR = (n as any)._starRadius || 400;
          const angularSpeed = ROTATE_LINEAR_SPEED / Math.max(maxR, 50);
          angle += angularSpeed * dt;
        }
        rootPos.set(n.id, { x: n.fx ?? n.x, y: n.fy ?? n.y, angle });
      }
    }
    // 每帧以 graph 为源头重算，消除 sim/graph 不同步
    // 旋转模式下结构不变，跳过重算（除非节点数变了）
    const nodeCountChanged = gn.length !== _starLastNodeCount;
    if (!starRotateMode || nodeCountChanged) {
      computeRadialLayout(gn, graph.edges);
      _starLastNodeCount = gn.length;
    }
    // 恢复根位置（computeRadialLayout 会覆写为网格初始位置）
    for (const n of gn) {
      if (!(n as any)._starRoot) continue;
      const p = rootPos.get(n.id);
      if (p) { n.x = p.x; n.y = p.y; (n as any)._starAngle = p.angle; }
    }
    const gm = new Map(gn.map(n => [n.id, n]));
    const gidSet = new Set(gn.map(n => n.id));
    const simIds = new Set(all.map(n => n.id));
    for (const g of gn) {
      if (!simIds.has(g.id)) all.push({ ...g, vx:0, vy:0, fx:null, fy:null, _slfx:null, _slfy:null });
    }
    for (const sn of all) {
      if (!gidSet.has(sn.id)) { (sn as any)._deleted = true; continue; }
      const g = gm.get(sn.id)!;
      (sn as any)._deleted = false;
      for (const k of ['_starId','_starRoot','_radialX','_radialY','_starAngle','_starRadius'])
        if (k in g) (sn as any)[k] = (g as any)[k];
    }

    // 构建星数据
    const roots: any[] = [];
    const starData = new Map<string, { root: any; children: any[]; cosA: number; sinA: number; maxR: number }>();
    for (const n of all) {
      if ((n as any)._deleted) continue;
      if ((n as any)._starRoot) { roots.push(n); starData.set(n.id, { root: n, children: [], cosA: 0, sinA: 0, maxR: 0 }); }
    }
    for (const n of all) {
      if ((n as any)._deleted) continue;
      const sid = (n as any)._starId; if (!sid || (n as any)._starRoot) continue;
      const sd = starData.get(sid); if (!sd) continue;
      sd.children.push(n);
      const r = Math.sqrt(((n as any)._radialX||0)**2 + ((n as any)._radialY||0)**2);
      if (r > sd.maxR) sd.maxR = r;
    }
    if (roots.length === 0) { draw(); _starRaf = requestAnimationFrame(starFrame); return; }

    // 拖拽检测：只有 fx/fy 与上帧定位值不同的节点才是真拖拽
    for (const n of all) {
      if ((n as any)._deleted) continue;
      const lastFx = (n as any)._slfx, lastFy = (n as any)._slfy;
      if ((n as any)._starRoot || n.fx == null || !(n as any)._starId) continue;
      if (lastFx === n.fx && lastFy === n.fy) continue; // 不是用户拖拽，跳过
      const sd = starData.get((n as any)._starId); if (!sd) continue;
      const lx = (n as any)._radialX||0, ly = (n as any)._radialY||0;
      const dx = n.fx - (n as any)._slfx;
      const dy = n.fy - (n as any)._slfy;
      if (Math.sqrt(lx*lx+ly*ly) >= sd.maxR * 0.65) {
        (sd.root as any)._starAngle = Math.atan2(n.fy - sd.root.y, n.fx - sd.root.x) - Math.atan2(ly, lx);
      } else {
        sd.root.x += dx;
        sd.root.y += dy;
        sd.root.fx = sd.root.x; sd.root.fy = sd.root.y;
      }
    }
    for (const [, sd] of starData) {
      const a = (sd.root as any)._starAngle || 0;
      sd.cosA = Math.cos(a); sd.sinA = Math.sin(a);
    }

    // 星星间凸包碰撞（迭代求解，杜绝穿透）
    const convexHull = (pts: {x:number,y:number}[]): {x:number,y:number}[] => {
      if (pts.length <= 2) return pts;
      const sorted = pts.slice().sort((a,b) => a.x-b.x || a.y-b.y);
      const cross = (o:any,a:any,b:any) => (a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
      const lo: typeof pts = [], hi: typeof pts = [];
      for (const p of sorted) { while (lo.length>=2&&cross(lo[lo.length-2],lo[lo.length-1],p)<=0) lo.pop(); lo.push(p); }
      for (const p of sorted.reverse()) { while (hi.length>=2&&cross(hi[hi.length-2],hi[hi.length-1],p)<=0) hi.pop(); hi.push(p); }
      lo.pop(); hi.pop(); return lo.concat(hi);
    };
    const allHulls = new Map<string, {x:number,y:number}[]>();
    for (const r of roots) {
      const sd = starData.get(r.id)!;
      allHulls.set(r.id, convexHull([r, ...sd.children].filter(n => !(n as any)._deleted).map(n => ({x:n.x,y:n.y}))));
    }
    // 同步非拖拽根 fx→x，保证凸包计算基于一致位置
    for (const r of roots) {
      if ((r as any)._deleted) continue;
      if ((r as any)._slfx !== r.fx) continue; // 拖拽中，不碰
      if (r.fx != null) { r.x = r.fx; r.y = r.fy; }
    }
    for (let i = 0; i < roots.length; i++) {
      for (let j = i + 1; j < roots.length; j++) {
        const ra = roots[i], rb = roots[j];
        if ((ra as any)._slfx !== ra.fx || (rb as any)._slfx !== rb.fx) continue; // 至少一方在拖拽
        const ha = allHulls.get(ra.id)!, hb = allHulls.get(rb.id)!;
        const sdA = starData.get(ra.id)!, sdB = starData.get(rb.id)!;
        const refDist = (sdA.maxR + sdB.maxR) * 0.15 + 12;
        let minD2 = Infinity, ax = 0, ay = 0, bx = 0, by = 0;
        for (const pa of ha) for (const pb of hb) {
          const d2 = (pb.x-pa.x)**2 + (pb.y-pa.y)**2;
          if (d2 < minD2) { minD2 = d2; ax = pa.x; ay = pa.y; bx = pb.x; by = pb.y; }
        }
        if (minD2 < refDist * refDist && minD2 > 0.001) {
          let d = Math.sqrt(minD2); if (d < 0.5) d = 0.5;
          const step = Math.min(refDist - d, 6);
          const s = step / d * 0.5;
          const px = (bx - ax) * s, py = (by - ay) * s;
          if (ra.fx == null) { ra.x -= px; ra.y -= py; }
          else { ra.fx -= px; ra.fy -= py; }
          if (rb.fx == null) { rb.x += px; rb.y += py; }
          else { rb.fx += px; rb.fy += py; }
        }
      }
    }
    // 碰撞修改了 fx，同步到 x 保证凸包一致
    for (const r of roots) { if (r.fx != null) { r.x = r.fx; r.y = r.fy; } }

    // 微弱向心趋势：星星缓缓向中心靠拢（公转模式下由轨道半径约束，跳过）
    if (!starRotateMode) {
      for (const r of roots) {
        if ((r as any)._deleted) continue;
        const lastFx = (r as any)._slfx, lastFy = (r as any)._slfy;
        if (lastFx != null && lastFy != null && (r.fx !== lastFx || r.fy !== lastFy)) continue;
        const dist = Math.sqrt(r.x * r.x + r.y * r.y);
        if (dist > 5) {
          const pull = Math.min(dist * 0.0003, 0.3);
          r.x -= (r.x / dist) * pull;
          r.y -= (r.y / dist) * pull;
          if (r.fx != null) { r.fx = r.x; r.fy = r.y; }
        }
      }
    }

    // 公转模式：所有星星绕原点公转（极其缓慢的角速度，~100秒一圈）
    if (starRotateMode) {
      const ORBIT_SPEED = 0.06; // rad/s，约 105 秒完成一圈
      for (const r of roots) {
        if ((r as any)._deleted) continue;
        // 拖拽中的星星：实时更新轨道为当前位置
        const lastFx = (r as any)._slfx, lastFy = (r as any)._slfy;
        const isDragging = lastFx != null && lastFy != null && (r.fx !== lastFx || r.fy !== lastFy);
        if (isDragging) {
          const nr = Math.sqrt(r.fx * r.fx + r.fy * r.fy);
          (r as any)._orbitRadius = nr > 10 ? nr : (r as any)._orbitRadius || 200;
          (r as any)._orbitAngle = Math.atan2(r.fy, r.fx);
        } else {
          // 首次初始化轨道参数
          let orbitR = (r as any)._orbitRadius;
          let orbitA = (r as any)._orbitAngle;
          if (orbitR == null || orbitR < 10) {
            orbitR = Math.sqrt(r.x * r.x + r.y * r.y) || 200;
            orbitA = Math.atan2(r.y, r.x);
            (r as any)._orbitRadius = orbitR;
            (r as any)._orbitAngle = orbitA;
          }
          // 公转
          if (dt > 0 && dt < 0.5) {
            orbitA += ORBIT_SPEED * dt;
            (r as any)._orbitAngle = orbitA;
          }
          r.x = (r as any)._orbitRadius * Math.cos(orbitA);
          r.y = (r as any)._orbitRadius * Math.sin(orbitA);
          r.fx = r.x; r.fy = r.y;
        }
      }
    }

    // 定位所有节点（每帧重算，拖拽时根已调整故位置一致）
    for (const [, sd] of starData) {
      const rx = sd.root.fx != null ? sd.root.fx : sd.root.x;
      const ry = sd.root.fy != null ? sd.root.fy : sd.root.y;
      for (const n of sd.children) {
        n.x = rx + ((n as any)._radialX||0) * sd.cosA - ((n as any)._radialY||0) * sd.sinA;
        n.y = ry + ((n as any)._radialX||0) * sd.sinA + ((n as any)._radialY||0) * sd.cosA;
        n.fx = n.x; n.fy = n.y; n.vx = 0; n.vy = 0;
        (n as any)._slfx = n.fx; (n as any)._slfy = n.fy;
      }
      if (sd.root.fx == null) { sd.root.fx = rx; sd.root.fy = ry; }
      (sd.root as any)._slfx = sd.root.fx; (sd.root as any)._slfy = sd.root.fy;
      sd.root.vx = 0; sd.root.vy = 0;
    }

    draw();
    _starRaf = requestAnimationFrame(starFrame);
  }
  // 外部文件变更冷却标记：MCP Server 写文件后阻止 auto-save 覆盖
  let externalChangeCooldown = false;
  const EXTERNAL_COOLDOWN_MS = 2000;

  const pane0 = {
  get graph() { return graph; }, set graph(v) { graph = v; },
  get linkDist() { return linkDist; }, set linkDist(v) { linkDist = v; },
  get labelSize() { return labelSize; }, set labelSize(v) { labelSize = v; },
  get charge() { return charge; }, set charge(v) { charge = v; },
  get linkStr() { return linkStr; }, set linkStr(v) { linkStr = v; },
  get collideR() { return collideR; }, set collideR(v) { collideR = v; },
  get centerS() { return centerS; }, set centerS(v) { centerS = v; },
  get groupBound() { return groupBound; }, set groupBound(v) { groupBound = v; },
  get heatingTime() { return heatingTime; }, set heatingTime(v) { heatingTime = v; },
  get alphaTarget() { return alphaTarget; }, set alphaTarget(v) { alphaTarget = v; },
  get editPanelOpacity() { return editPanelOpacity; }, set editPanelOpacity(v) { editPanelOpacity = v; },
  get useRAFL() { return useRAFL; }, set useRAFL(v) { useRAFL = v; },
  get nodeExpand() { return nodeExpand; }, set nodeExpand(v) { nodeExpand = v; },
  get lineExpand() { return lineExpand; }, set lineExpand(v) { lineExpand = v; },
  get showGLabels() { return showGLabels; }, set showGLabels(v) { showGLabels = v; },
  get glMin() { return glMin; }, set glMin(v) { glMin = v; },
  get glMax() { return glMax; }, set glMax(v) { glMax = v; },
  get gridVis() { return gridVis; }, set gridVis(v) { gridVis = v; },
  get gridMode() { return gridMode; }, set gridMode(v) { gridMode = v; },
  get axisVis() { return axisVis; }, set axisVis(v) { axisVis = v; },
  get axisTicks() { return axisTicks; }, set axisTicks(v) { axisTicks = v; },
  get gridSp() { return gridSp; }, set gridSp(v) { gridSp = v; },
  get gridWidth() { return gridWidth; }, set gridWidth(v) { gridWidth = v; },
  get ar() { return ar; }, set ar(v) { ar = v; },
  get graphTheme() { return graphTheme; }, set graphTheme(v) { graphTheme = v; },
  get focusMode() { return focusMode; }, set focusMode(v) { focusMode = v; },
  get centerMode() { return centerMode; }, set centerMode(v) { centerMode = v; },
  get selectedTooltip() { return selectedTooltip; }, set selectedTooltip(v) { selectedTooltip = v; },
  get starRotateMode() { return starRotateMode; }, set starRotateMode(v) { starRotateMode = v; },
  get glowAppearance() { return glowAppearance; }, set glowAppearance(v) { glowAppearance = v; },
  get categoryLayout() { return categoryLayout; }, set categoryLayout(v) { categoryLayout = v; },
  get layoutMode() { return layoutMode; }, set layoutMode(v) { layoutMode = v; },
  get gridSnapEnabled() { return gridSnapEnabled; }, set gridSnapEnabled(v) { gridSnapEnabled = v; },
  get partialGridSnap() { return partialGridSnap; }, set partialGridSnap(v) { partialGridSnap = v; },
  get nodeColorStyle() { return nodeColorStyle; }, set nodeColorStyle(v) { nodeColorStyle = v; },
  get fixedHollow() { return fixedHollow; }, set fixedHollow(v) { fixedHollow = v; },
  get edgeColorGradient() { return edgeColorGradient; }, set edgeColorGradient(v) { edgeColorGradient = v; },
  get edgeWidthByLevel() { return edgeWidthByLevel; }, set edgeWidthByLevel(v) { edgeWidthByLevel = v; },
  get fontFamily() { return fontFamily; }, set fontFamily(v) { fontFamily = v; },
  get gw() { return gw; }, set gw(v) { gw = v; },
  get gh() { return gh; }, set gh(v) { gh = v; },
  get search() { return search; }, set search(v) { search = v; },
  get sField() { return sField; }, set sField(v) { sField = v; },
  get sDisplayMode() { return sDisplayMode; }, set sDisplayMode(v) { sDisplayMode = v; },
  get sMatchMode() { return sMatchMode; }, set sMatchMode(v) { sMatchMode = v; },
  get selNode() { return selNode; }, set selNode(v) { selNode = v; },
  get selEdge() { return selEdge; }, set selEdge(v) { selEdge = v; },
  get selGroup() { return selGroup; }, set selGroup(v) { selGroup = v; },
  get draggingNode() { return draggingNode; }, set draggingNode(v) { draggingNode = v; },
  get wasDragged() { return wasDragged; }, set wasDragged(v) { wasDragged = v; },
  get linkMode() { return linkMode; }, set linkMode(v) { linkMode = v; },
  get linkSrc() { return linkSrc; }, set linkSrc(v) { linkSrc = v; },
  get _lastDragNodeId() { return _lastDragNodeId; }, set _lastDragNodeId(v) { _lastDragNodeId = v; },
  get defArrow() { return defArrow; }, set defArrow(v) { defArrow = v; },
  get linkCursorX() { return linkCursorX; }, set linkCursorX(v) { linkCursorX = v; },
  get linkCursorY() { return linkCursorY; }, set linkCursorY(v) { linkCursorY = v; },
  get undoManager() { return undoManager; }, set undoManager(v) { undoManager = v; },
  get saveTimeout() { return saveTimeout; }, set saveTimeout(v) { saveTimeout = v; },
  get dirtyTabs() { return dirtyTabs; },
  get currentAnimationCancel() { return currentAnimationCancel; }, set currentAnimationCancel(v) { currentAnimationCancel = v; },
  get searchDebounceTimer() { return searchDebounceTimer; }, set searchDebounceTimer(v) { searchDebounceTimer = v; },
  get searchMatchIndex() { return searchMatchIndex; }, set searchMatchIndex(v) { searchMatchIndex = v; },
  get lastSearchTerm() { return lastSearchTerm; }, set lastSearchTerm(v) { lastSearchTerm = v; },
  get treeMode() { return treeMode; }, set treeMode(v) { treeMode = v; },
  get categoryMode() { return categoryMode; }, set categoryMode(v) { categoryMode = v; },
  get fullCatMode() { return fullCatMode; }, set fullCatMode(v) { fullCatMode = v; },
  get activeMode() { return activeMode; }, set activeMode(v) { activeMode = v; },
  get simManager() { return simManager; }, set simManager(v) { simManager = v; },
  get pixi() { return pixi; }, set pixi(v) { pixi = v; },
  get nodeSprites() { return nodeSprites; }, set nodeSprites(v) { nodeSprites = v; }
};

  // --- 存储辅助函数 ---
  const collectSettings = (): GraphSettings => ({
    linkDist, labelSize, charge, linkStr, collideR, centerS, groupBound,
    heatingTime, alphaTarget, editPanelOpacity, useRAFL,
    nodeExpand, lineExpand, showGLabels, glMin, glMax,
    gridVis, gridMode, axisVis, axisTicks, gridSp, gridWidth, ar, graphTheme, focusMode, centerMode, starRotateMode, glowAppearance, selectedTooltip, categoryLayout,
    layoutMode: activeMode, gridSnap: gridSnapEnabled, partialGridSnap, nodeColorStyle, fontFamily, fixedHollow,
    edgeColorGradient, edgeWidthByLevel, expandedMedia: [...manuallyOpenedMediaIds],
  });

  const scheduleSave = () => {
    // 外部变更冷却期内跳过自动保存（防止覆盖 MCP Server 等外部工具的修改）
    if (externalChangeCooldown) return;

    if (focusedPaneIndex > PANE_LEFT) {
      const ep = extraPanes[focusedPaneIndex - 1];
      if (!ep) return;
      clearTimeout(ep.saveTimeout);
      ep.dirtyTabs.add(ep.activeTab);
      const settings = collectSettings(); // 立即捕获，避免计时器触发时模块变量已被其他窗格污染
      ep.saveTimeout = setTimeout(async () => {
        ep.graph.settings = settings;
        await writeGraphData(ep.activeTab, ep.graph);
        ep.dirtyTabs.delete(ep.activeTab);
        renderAllTabs();
      }, 300);
      return;
    }
    clearTimeout(saveTimeout);
    dirtyTabs.add(activeTab);
    const settings = collectSettings(); // 同上：立即捕获
    saveTimeout = setTimeout(async () => {
      graph.settings = settings;
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
      .map((e: any) => { const { _createdAt, _dyingAt, _conflict, ...rest } = e; return rest; });
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
    // 同步到模拟副本（否则样式不会变），restart 刷新 charge 缓存
    const sim = getSim();
    if (sim) { const sn = sim.nodes().find((sn: any) => sn.id === id); if (sn) { sn.fixed = true; sn.fx = sn.x; sn.fy = sn.y; } sim.nodes(sim.nodes()); sim.alpha(Math.max(sim.alpha(), 0.01)).restart(); }
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
    if (sim) { sim.nodes(sim.nodes()); sim.alpha(Math.max(sim.alpha(), 0.01)).restart(); }
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
  const configKeys = ['linkDist','labelSize','charge','linkStr','collideR','centerS','groupBound','heatingTime','alphaTarget','editPanelOpacity','useRAFL','nodeExpand','lineExpand','showGLabels','glMin','glMax','gridVis','gridMode','axisVis','axisTicks','gridSp','gridWidth','ar','graphTheme','focusMode','selectedTooltip','glowAppearance','layoutMode','gridSnapEnabled','partialGridSnap','nodeColorStyle','fixedHollow','fontFamily','gw','gh'] as const;

  function saveConfigTo(to: PaneState) {
    const all: any = { linkDist, labelSize, charge, linkStr, collideR, centerS, groupBound, heatingTime, alphaTarget, editPanelOpacity, useRAFL, nodeExpand, lineExpand, showGLabels, glMin, glMax, gridVis, gridMode, axisVis, axisTicks, gridSp, gridWidth, ar, graphTheme, focusMode, centerMode, selectedTooltip, glowAppearance, layoutMode: activeMode, gridSnapEnabled, partialGridSnap, nodeColorStyle, fixedHollow, fontFamily, gw, gh };
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
    centerMode = from.centerMode; selectedTooltip = (from as any).selectedTooltip ?? false;
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
      : (extraPanes[toIndex - 1]?.activeTab ?? BUILTIN_NAMES[0]);
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
    const t = getTheme($.graphTheme);
    return parseInt(t.labelColor.replace('#', ''), 16);
  };
  const themeNodeColor = () => {
    const t = getTheme($.graphTheme);
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

    // 居中模式：视口跟随选中节点
    // 居中模式：视口平滑跟随选中节点（per-viewport 状态存在 viewport 对象上）
    if (st.centerMode && st.selNode) {
      const sel = nodes.find((n: any) => n.id === st.selNode);
      if (sel && !sharedState.viewportDragging) {
        const vp = pixi.viewport as any;
        const target = vp._ct = vp._ct || { x: sel.x, y: sel.y, _nid: '' };
        if (target._nid !== st.selNode) { target.x = sel.x; target.y = sel.y; target._nid = st.selNode; }
        else { target.x = sel.x; target.y = sel.y; }
        target.x = sel.x; target.y = sel.y;
        const t = 0.12;
        pixi.viewport.moveCenter(
          vp.center.x + (target.x - vp.center.x) * t,
          vp.center.y + (target.y - vp.center.y) * t
        );
      }
    }
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
      const grp = (pixi.nodeLayer as any)._emptyGroup;
      grp.destroy({ children: true });
      (pixi.nodeLayer as any)._emptyGroup = null;
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
    const resolveNodeColor = (n: any) => {
      if (n.color && n.color !== '#000000') return n.color;
      switch (st.nodeColorStyle) {
        case 'uniform': return theme.nodeDefaultColor;
        case 'spectrum': return '#' + getSpectrumColor(n.headingLevel || 6, isDarkTheme, accentHex).toString(16).padStart(6, '0');
        case 'spectrum-narrow': return '#' + getNarrowSpectrumColor(n.headingLevel || 6, isDarkTheme, accentHex).toString(16).padStart(6, '0');
        default: return defaultNodeColor(n.headingLevel || 6);
      }
    };

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

    // 有子节点的集合（用于折叠省略号判断）
    const hasChildrenSet = new Set<string>();
    graph.edges.forEach((e: any) => {
      hasChildrenSet.add(typeof e.source === 'object' ? e.source.id : e.source);
    });

    // 每帧重新检测鼠标悬停（节点可能移出鼠标）
    sharedState.reevaluateHover?.();

    // 聚焦邻居集（hover + 选中 并行，取并集）
    const focusNeighborIds = new Set<string>();
    const focusEdgeIndices = new Set<number>();
    let focusActive = false;

    function addFocusNode(nodeId: string) {
      focusNeighborIds.add(nodeId);
      graph.edges.forEach((e, idx) => {
        const src = typeof e.source === 'object' ? e.source.id : e.source;
        const tgt = typeof e.target === 'object' ? e.target.id : e.target;
        if (src === nodeId) { focusNeighborIds.add(tgt); focusEdgeIndices.add(idx); }
        if (tgt === nodeId) { focusNeighborIds.add(src); focusEdgeIndices.add(idx); }
      });
    }

    if (sharedState.focusMode) {
      // 悬浮聚焦
      if (sharedState.hoverNodeId) {
        focusActive = true;
        addFocusNode(sharedState.hoverNodeId);
      }
      // 单击选中聚焦（与悬浮并行，不互斥）
      if (st.selNode) {
        focusActive = true;
        addFocusNode(st.selNode);
      }
      // 框选聚焦（与悬浮并行，不互斥）
      const selIds = sharedState.selectedNodeIds;
      if (selIds.length > 0) {
        focusActive = true;
        for (const sid of selIds) addFocusNode(sid);
      }
    }

    // 动画中的节点暂不视为隐藏（光晕、节点、连线保持一致）
    const animatingIds = new Set<string>();
    for (const n of nodes) {
      if ((n as any)._collapseAnim || (n as any)._expandAnim) animatingIds.add(n.id);
    }
    for (const aid of animatingIds) hiddenNodes.delete(aid);

    // --- 光晕层 ---
    if (st.glowAppearance) {
      updateBlobFilters();
      pixi.blobLayer.visible = true;
      let bg = (pixi.blobLayer as any)._cachedGfx;
      if (!bg || bg.destroyed) {
        bg = new Graphics();
        (pixi.blobLayer as any)._cachedGfx = bg;
        pixi.blobLayer.addChild(bg);
      }
      bg.clear();
      for (const n of nodes) {
        if (hiddenNodes.has(n.id)) continue;
        const levelR = [22, 19, 16, 13, 10, 7][(n.headingLevel || 6) - 1] || 9;
        const nr = (n.radiusMode === 'custom' || (!n.radiusMode && n.radius)) ? (n.radius || 9) : levelR;
        const colorStr = resolveNodeColor(n);
        const color = parseInt(colorStr.replace('#', ''), 16);
        // 光晕跟随节点视觉动画同步过渡，使用与 pixi-nodes.ts applyNodeVisual 相同的公式
        const ca = (n as any)._collapseAnim;
        const ea = (n as any)._expandAnim;
        let glowScale: number;
        let glowAlpha: number;
        if (ca) {
          const t = Math.min(1, Math.max(0, (performance.now() - ca.startTime) / ANIM_DURATION));
          const scaleT = Math.min(1, t / 0.65);
          if (scaleT < 0.15) {
            glowScale = 1 + (scaleT / 0.15) * 0.12;
          } else {
            const ts = (scaleT - 0.15) / 0.85;
            glowScale = 1.12 * (1 - ts * ts * ts);
            glowScale = Math.max(0.01, glowScale);
          }
          glowAlpha = 0.5 * Math.max(0, 1 - scaleT * scaleT);
        } else if (ea) {
          const t = Math.min(1, Math.max(0, (performance.now() - ea.startTime) / ANIM_DURATION));
          glowScale = Math.max(0.01, 1 - Math.pow(1 - t, 3));
          glowAlpha = 0.5 * Math.min(1, t);
        } else {
          glowScale = 1;
          glowAlpha = 0.5;
        }
        const r = nr * 1.8 * glowScale;
        if (glowAlpha > 0.01) bg.circle(n.x, n.y, r).fill({ color, alpha: glowAlpha });
      }
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
      const colorStr = resolveNodeColor(n);
      nodeColorMap.set(n.id, parseInt(colorStr.replace('#', ''), 16));
    }
    const finishedCollapsing = new Set<string>();

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
        const colorStr = resolveNodeColor(n);
        const color = parseInt(colorStr.replace('#', ''), 16);
        const nodeLabelSize = Math.max(12, Math.min(28, Math.round(nodeRadius * 0.8 + 7)));
        sprite = createNodeSprite(id, n.label || id, n.x, n.y, nodeRadius, color, lblColor, nodeLabelSize);
        pixi.nodeLayer.addChild(sprite.container);
        nodeSprites.set(id, sprite);
      } else {
        updateNodePosition(sprite, n.x, n.y);
        sprite.label.text = n.label || id;
      }

      // 标签在缩放 0.3-0.45 区间淡入淡出，并与折叠/展开动画同步过渡
      sprite.radius = nodeRadius;
	      const zoom = pixi.viewport.scale.x;
      const zoomAlpha = Math.max(0, Math.min(1, (zoom - 0.3) / 0.15));
      // 折叠/展开动画中标签与节点同步淡入淡出
      let animLabelMult = 1;
      if (collapseProgress >= 0) animLabelMult = Math.max(0, 1 - collapseProgress * collapseProgress);
      else if (expandProgress >= 0) animLabelMult = Math.min(1, expandProgress);
      const labelAlpha = zoomAlpha * animLabelMult;
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

      const colorStr = resolveNodeColor(n);
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
        hasChildren: hasChildrenSet.has(id),
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

    // --- 展开/折叠动画完成后的处理 ---
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
        const filteredNodes = sim.nodes().filter((n: any) => !finishedCollapsing.has(n.id));
        const simNodeIds = new Set(filteredNodes.map((n: any) => n.id));
        // 先重建 link force（排除已移除节点的边），再 setNodes（触发所有 force 的 initialize）
        const validEdges = graph.edges
          .filter((e: any) =>
            (e.lineStyle || 'solid') === 'solid' && !e._conflict && !e._dyingAt &&
            simNodeIds.has(typeof e.source === 'object' ? e.source.id : e.source) &&
            simNodeIds.has(typeof e.target === 'object' ? e.target.id : e.target)
          )
          .map((e: any) => ({ ...e, source: typeof e.source === 'object' ? (e.source as any).id ?? e.source : e.source, target: typeof e.target === 'object' ? (e.target as any).id ?? e.target : e.target }));
        if (validEdges.length > 0) {
          sim.force("link", d3.forceLink(validEdges).id((d: any) => d.id).distance(
            focusedPaneIndex === PANE_RIGHT ? pane1.linkDist : linkDist
          ).strength(
            focusedPaneIndex === PANE_RIGHT ? pane1.linkStr : linkStr
          ));
        }
        // 先替换 link force，再 setNodes 触发 initialize
        sim.nodes(filteredNodes);
        // 节点移除后力场不对称，让 alpha 自然衰减防止残余力推飞节点
        if (sim.alpha() > 0.002) sim.alphaTarget(0);
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
        let lg = (pixi.edgeLayer as any)._linkGfx;
        if (!lg || lg.destroyed) {
          lg = new Graphics();
          (pixi.edgeLayer as any)._linkGfx = lg;
        }
        pixi.edgeLayer.addChild(lg);
        lg.clear();
        // 贝塞尔曲线预览
        const midX = (srcNode.x + previewX) / 2;
        const midY = (srcNode.y + previewY) / 2;
        const cpX = midX + (previewY - srcNode.y) * 0.15;
        const cpY = midY - (previewX - srcNode.x) * 0.15;
        lg.moveTo(srcNode.x, srcNode.y)
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
      const linkGfx = (pixi.edgeLayer as any)._linkGfx;
      if (!linkGfx.destroyed) linkGfx.clear();
      else (pixi.edgeLayer as any)._linkGfx = null;
    }
    // 分类布局矩形框
    if ((st.activeMode === 'category' || st.activeMode === 'fullcat') && (graph as any)._categoryBoxes) {
      const boxes = (graph as any)._categoryBoxes;
      let cg = (pixi.groupLayer as any)._catGfx;
      if (!cg || cg.destroyed) {
        cg = new Graphics();
        (pixi.groupLayer as any)._catGfx = cg;
        pixi.groupLayer.addChild(cg);
      }
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
          const lbl = new Text({ text: b.label, resolution: 2, style: { fontSize: 13, fill: b.color, fontFamily: 'system-ui, -apple-system, sans-serif', fontWeight: '600' } as any });
          lbl.anchor.set(0.5, 0); lbl.position.set(sx + sw / 2, sy - 18); lbl.alpha = 0.55;
          catLabels.push(lbl); pixi.groupLayer.addChild(lbl);
        }
        if (!cg.parent) pixi.groupLayer.addChild(cg);
      }
      (pixi.groupLayer as any)._catLabels = catLabels;
    } else {
      const cg = (pixi.groupLayer as any)._catGfx;
      if (cg) { if (!cg.destroyed) { cg.clear(); pixi.groupLayer.removeChild(cg); } (pixi.groupLayer as any)._catGfx = null; }
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

    // 选中节点 tooltip（仅当启用且未在悬停其他节点时）
    if (st.selectedTooltip && st.selNode && !sharedState.hoverNodeId) {
      const sn = nodes.find((n: any) => n.id === st.selNode); // sim nodes：当前位置
      const gn = graph.nodes.find((n: any) => n.id === st.selNode); // graph node：元数据
      if (gn?.note?.trim() && sn) {
        const sp2 = pixi.viewport.toScreen(sn.x, sn.y);
        const cRect = pixi.app.canvas.getBoundingClientRect();
        const aRect = appShell.getBoundingClientRect();
        const nr = gn.radius || ([22,19,16,13,10,7][(gn.headingLevel || 6) - 1] || 9);
        selTooltip.textContent = gn.note.trim();
        selTooltip.style.display = 'block';
        selTooltip.style.left = (cRect.left - aRect.left + sp2.x + nr + 8) + 'px';
        selTooltip.style.top = (cRect.top - aRect.top + sp2.y - nr) + 'px';
      } else {
        selTooltip.style.display = 'none';
      }
    } else if (!sharedState.hoverNodeId) {
      selTooltip.style.display = 'none';
    }
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
    let hasFixedAnim = false;
    for (const [, sprite] of nodeSprites) {
      if ((sprite as any)._fixedAnimRaf) { hasFixedAnim = true; break; }
    }
    if (hasFixedAnim && ((renderPane as any)._lastAnimFrame !== frameCount)) {
      (renderPane as any)._lastAnimFrame = frameCount;
      requestAnimationFrame(() => renderPane(px, g, sm, sp, st));
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
    (s as any).selectedTooltip = selectedTooltip;
    s.centerMode = centerMode ?? false;
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
  // 视口平移/缩放时只刷新网格（节点/边由 GPU 矩阵变换处理，无需 CPU 重绘）
  let _gridRAF: number | null = null;
  const drawGridOnly = () => {
    if (_gridRAF !== null) return;
    _gridRAF = requestAnimationFrame(() => {
      _gridRAF = null;
      if (pixi) {
        const cw = pixi.app.canvas.clientWidth, ch = pixi.app.canvas.clientHeight;
        const nodes = getSim()?.nodes() || [];
        const vp = pixi.viewport;
        const t = vp ? { k: vp.scale.x, x: vp.x, y: vp.y } : { k: 1, x: 0, y: 0 };
        updateGrid(pixi.gridLayer, cw, ch, { gridVis: $.gridVis, gridMode: $.gridMode, axisVis: $.axisVis, axisTicks: $.axisTicks, gridSp: $.gridSp, gridWidth: $.gridWidth, nodes, transform: t, dragX: $.draggingNode?.x ?? null, dragY: $.draggingNode?.y ?? null });
      }
      for (let i = 0; i < extraPanes.length; i++) {
        const px = extraPixis[i]; const pi = extraPanes[i];
        if (!px || !pi) continue;
        const cw = px.app.canvas.clientWidth, ch = px.app.canvas.clientHeight;
        const sm = extraSims[i]; const nodes = sm?.getSim()?.nodes() || [];
        const vp = px.viewport;
        const t = vp ? { k: vp.scale.x, x: vp.x, y: vp.y } : { k: 1, x: 0, y: 0 };
        updateGrid(px.gridLayer, cw, ch, { gridVis: pi.gridVis, gridMode: pi.gridMode, axisVis: pi.axisVis, axisTicks: pi.axisTicks, gridSp: pi.gridSp, gridWidth: pi.gridWidth, nodes, transform: t, dragX: pi.draggingNode?.x ?? null, dragY: pi.draggingNode?.y ?? null });
      }
    });
  };
  let _skipDraw = false; // 布局过渡期间抑制模拟驱动的绘制，防止闪烁
  const draw = () => { if (_skipDraw) return;
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
    // 全局视图：每 3 帧刷新一次
    if (minimapVisible && frameCount % 3 === 0) renderMinimap();
  };

  // --- 编辑面板 ---
  const updateInfoRef = { current: () => {} };
  const updateSelectsRef = { current: () => {} };
  const _fg = () => $.graph;

  // 延迟赋值的同步回调：将当前图节点显示属性同步到其他持有同文件的窗格
  let _syncGraphToOtherPanes_impl: (() => void) | undefined;
  const editCtx = createEditPanel(appShell, {
    get graph() { return $.graph; },
    getSelNode: () => $.selNode, setSelNode: v => { $.selNode = v; },
    getSelEdge: () => $.selEdge, setSelEdge: v => { $.selEdge = v; },
    getSelGroup: () => $.selGroup, setSelGroup: v => { $.selGroup = v; },
    getLinkMode: () => $.linkMode, setLinkMode: v => { $.linkMode = v; },
    setLinkSrc: v => { $.linkSrc = v; },
    getBoxSelectMode: () => boxSelectMode, setBoxSelectMode: v => { boxSelectMode = v; },
    getSaveData: () => saveNow,
    getInitSim: () => $.simManager.initSim.bind($.simManager),
    getUpdateInfo: () => updateInfoRef.current,
    getUpdateSelects: () => updateSelectsRef.current,
    draw,
    triggerSave: () => scheduleSave(),
    getSimulation: () => $.simManager?.getSim() ?? null,
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
          const simNodeIds = new Set((s.nodes() as any[]).map((n: any) => n.id));
          const validEdges = pane1.graph.edges.filter(e => {
            if ((e.lineStyle || 'solid') !== 'solid' || (e as any)._conflict || (e as any)._dyingAt) return false;
            const src = typeof e.source === 'object' ? e.source.id : e.source;
            const tgt = typeof e.target === 'object' ? e.target.id : e.target;
            return simNodeIds.has(src) && simNodeIds.has(tgt);
          });
          s.force("link", d3.forceLink(validEdges).id((d: any) => d.id).distance(pane1.linkDist).strength(pane1.linkStr));
          s.alpha(0.1).restart();
        }
        return;
      }
      const s = getSim();
      if (s) {
        const simNodeIds = new Set((s.nodes() as any[]).map((n: any) => n.id));
        const validEdges = graph.edges.filter(e => {
          if ((e.lineStyle || 'solid') !== 'solid' || (e as any)._conflict || (e as any)._dyingAt) return false;
          const src = typeof e.source === 'object' ? e.source.id : e.source;
          const tgt = typeof e.target === 'object' ? e.target.id : e.target;
          return simNodeIds.has(src) && simNodeIds.has(tgt);
        });
        s.force("link", d3.forceLink(validEdges).id((d: any) => d.id).distance(linkDist).strength(linkStr));
        s.alpha(0.1).restart();
      }
    },
    syncGraphToOtherPanes: () => _syncGraphToOtherPanes_impl?.(),
    onToast: (msg: string, type?: 'info' | 'error' | 'success' | 'warning') => showToast(msg, type),
  }, () => editPanelOpacity);
  const { fillNode, fillEdge, fillGroup, clearEd, updateOpacity, saveCurrent } = editCtx;

  // --- 设置面板 ---
  const settingsUI = buildSettings(setDiv, {
    getLinkDist: () => $.linkDist, setLinkDist: v => { $.linkDist = v; },
    getLabelSize: () => $.labelSize, setLabelSize: v => { $.labelSize = v; },
    getCharge: () => $.charge, setCharge: v => { $.charge = v; },
    getLinkStr: () => $.linkStr, setLinkStr: v => { $.linkStr = v; },
    getCollideR: () => $.collideR, setCollideR: v => { $.collideR = v; },
    getCenterS: () => $.centerS, setCenterS: v => { $.centerS = v; },
    getGroupBound: () => $.groupBound, setGroupBound: v => { $.groupBound = v; },
    getHeatingTime: () => $.heatingTime, setHeatingTime: v => { $.heatingTime = v; },
    getAlphaTarget: () => $.alphaTarget, setAlphaTarget: v => { $.alphaTarget = v; },
    getEditPanelOpacity: () => $.editPanelOpacity, setEditPanelOpacity: v => { $.editPanelOpacity = v; updateOpacity(v); },
    getUseRAFL: () => $.useRAFL, setUseRAFL: v => { $.useRAFL = v; },
    getNodeExpand: () => $.nodeExpand, setNodeExpand: v => { $.nodeExpand = v; },
    getLineExpand: () => $.lineExpand, setLineExpand: v => { $.lineExpand = v; },
    getShowGLabels: () => $.showGLabels, setShowGLabels: v => { $.showGLabels = v; },
    getGlMin: () => $.glMin, setGlMin: v => { $.glMin = v; },
    getGlMax: () => $.glMax, setGlMax: v => { $.glMax = v; },
    getGridVis: () => $.gridVis, setGridVis: v => { $.gridVis = v; },
    getGridMode: () => $.gridMode, setGridMode: v => { $.gridMode = v; },
    getAxisVis: () => $.axisVis, setAxisVis: v => { $.axisVis = v; },
    getAxisTicks: () => $.axisTicks, setAxisTicks: v => { $.axisTicks = v; },
    getGridSp: () => $.gridSp, setGridSp: v => { $.gridSp = v; },
    getAr: () => $.ar, setAr: v => { $.ar = v; if ($.pixi) { $.pixi.app.renderer.resize($.pixi.app.canvas.clientWidth, Math.max(300, $.pixi.app.canvas.clientWidth * $.ar)); $.simManager.updateCenter(); } draw(); },
    getSimulation: () => $.simManager?.getSim() ?? null,
    getGw: () => $.gw, getGh: () => $.gh,
    draw, getInitSim: () => $.simManager?.initSim?.bind($.simManager),
    getSaveData: () => saveNow,
    get graph() { return $.graph; },
    getGraphTheme: () => $.graphTheme,
    setGraphTheme: v => { $.graphTheme = v; applyPaneCanvasBg(focusedPaneIndex === PANE_RIGHT ? pane1Container : pixiContainer, v); applyUIToFocusedPane(v); saveNow(); _syncGraphToOtherPanes_impl?.(); draw(); },
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
        defaultSelectedTooltip: (preset.selectedTooltip as boolean) ?? false,
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
    getFocusMode: () => $.focusMode, setFocusMode: v => { $.focusMode = v; },
    getCenterMode: () => $.centerMode, setCenterMode: v => { $.centerMode = v; },
    getSelectedTooltip: () => $.selectedTooltip, setSelectedTooltip: v => { $.selectedTooltip = v; },
    getGlowAppearance: () => $.glowAppearance, setGlowAppearance: v => { $.glowAppearance = v; draw(); },
    getEdgeColorGradient: () => edgeColorGradient, setEdgeColorGradient: v => { edgeColorGradient = v; draw(); },
    getEdgeWidthByLevel: () => edgeWidthByLevel, setEdgeWidthByLevel: v => { edgeWidthByLevel = v; draw(); },
    getGridWidth: () => $.gridWidth, setGridWidth: v => { $.gridWidth = v; },
    getNodeColorStyle: () => $.nodeColorStyle, setNodeColorStyle: v => { $.nodeColorStyle = v; scheduleSave(); draw(); },
    getFontFamily: () => $.fontFamily, setFontFamily: v => { $.fontFamily = v; document.documentElement.style.setProperty('--fg-font-family', v); setNodeFontFamily(v); scheduleSave(); draw(); },
  });
  // 图区自定义保留在底部（滑块/复选框直接修改当前图）

  // 设置面板 + 预设
  const SETTING_PRESETS_KEY = `fg-setting-presets`;
  let settingPresets: { name: string; values: Partial<GraphSettings> }[] = [];
  try { settingPresets = JSON.parse(localStorage.getItem(SETTING_PRESETS_KEY) || '[]'); } catch {}
  const saveSettingPresets = () => localStorage.setItem(SETTING_PRESETS_KEY, JSON.stringify(settingPresets));

  const getFocusedSettingValues = (): Partial<GraphSettings> => {
    const isExtra = focusedPaneIndex === PANE_RIGHT;
    const src = isExtra ? pane1 : { linkDist, labelSize, charge, linkStr, collideR, centerS, groupBound, heatingTime, alphaTarget, editPanelOpacity, useRAFL, nodeExpand, lineExpand, showGLabels, glMin, glMax, gridVis, gridMode, axisVis, axisTicks, gridSp, gridWidth, ar, graphTheme, focusMode, centerMode, selectedTooltip, glowAppearance, activeMode, gridSnapEnabled, partialGridSnap, nodeColorStyle, fontFamily };
    return {
      linkDist: src.linkDist, labelSize: src.labelSize, charge: src.charge, linkStr: src.linkStr,
      collideR: src.collideR, centerS: src.centerS, groupBound: src.groupBound,
      heatingTime: src.heatingTime, alphaTarget: src.alphaTarget, editPanelOpacity: src.editPanelOpacity,
      useRAFL: src.useRAFL, nodeExpand: src.nodeExpand, lineExpand: src.lineExpand,
      showGLabels: src.showGLabels, glMin: src.glMin, glMax: src.glMax,
      gridVis: src.gridVis, gridMode: src.gridMode, axisVis: src.axisVis,
      axisTicks: src.axisTicks, gridSp: src.gridSp, gridWidth: src.gridWidth,
      ar: src.ar, graphTheme: src.graphTheme, focusMode: src.focusMode,
      centerMode: src.centerMode, selectedTooltip: src.selectedTooltip, glowAppearance: src.glowAppearance, edgeColorGradient, edgeWidthByLevel,
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
      else if (k === 'centerMode') { if (isExtra) pane1.centerMode = v as boolean; else centerMode = v as boolean; }
      else if (k === 'selectedTooltip') { if (isExtra) pane1.selectedTooltip = v as boolean; else selectedTooltip = v as boolean; }
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
  const presetSettingsUI = buildSettings(presetSetDiv, {
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
      defaultSelectedTooltip: (DEFAULT_SETTINGS as any).selectedTooltip ?? false,
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
    getSelectedTooltip: () => (presetDefaults.selectedTooltip as boolean) ?? false,
    setSelectedTooltip: v => { presetDefaults.selectedTooltip = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    getCenterMode: () => (presetDefaults.centerMode as boolean) ?? DEFAULT_SETTINGS.centerMode,
    setCenterMode: v => { presetDefaults.centerMode = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    getGlowAppearance: () => (presetDefaults.glowAppearance as boolean) ?? DEFAULT_SETTINGS.glowAppearance,
    setGlowAppearance: v => { presetDefaults.glowAppearance = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    getEdgeColorGradient: () => (presetDefaults.edgeColorGradient as boolean) ?? false, setEdgeColorGradient: v => { presetDefaults.edgeColorGradient = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    getEdgeWidthByLevel: () => (presetDefaults.edgeWidthByLevel as boolean) ?? false, setEdgeWidthByLevel: v => { presetDefaults.edgeWidthByLevel = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    getGridWidth: () => (presetDefaults.gridWidth as number) ?? DEFAULT_SETTINGS.gridWidth,
    setGridWidth: v => { presetDefaults.gridWidth = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
  });

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
      // rebuild() 清空了 presetSetDiv，重挂载自定义控件
      presetSetDiv.insertBefore(presetColorRow, presetSetDiv.firstChild);
      presetSetDiv.insertBefore(presetFontRow, presetSetDiv.firstChild);
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
      // rebuild() 清空了 presetSetDiv，重挂载自定义控件并保持在最上面
      presetSetDiv.insertBefore(presetColorRow, presetSetDiv.firstChild);
      presetSetDiv.insertBefore(presetFontRow, presetSetDiv.firstChild);
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
    getAutoUpdate: () => localStorage.getItem('fg-auto-update') === 'true',
    onToggleAutoUpdate: (val) => { localStorage.setItem('fg-auto-update', val ? 'true' : 'false'); },
    onCheckUpdate: async () => {
      const info = await checkUpdate();
      if (!info) { showToast('当前已是最新版本', 'success'); return; }
      showUpdateDialog(info, () => {
        const asset = info.assets.find(a => a.name.endsWith('.apk'));
        const dlUrl = asset?.downloadUrl || info.htmlUrl;
        installApk(dlUrl);
      });
    },
    onDownloadInstall: () => {
      downloadReleaseApk();
    },
    getDemoEnabled: () => localStorage.getItem('fg-demo-enabled') !== 'false',
    onToggleDemo: (enabled: boolean) => {
      demoEnabled = enabled;
      localStorage.setItem(DEMO_ENABLED_KEY, String(enabled));
      if (!enabled) {
        // 移除演示标签
        openTabs = openTabs.filter(t => !BUILTIN_NAMES_SET.has(t));
        if (BUILTIN_NAMES_SET.has(activeTab)) {
          activeTab = openTabs[0] || '';
        }
        pane1.openTabs = pane1.openTabs.filter(t => !BUILTIN_NAMES_SET.has(t));
        pane1.activeTab = pane1.openTabs[0] || '';
        for (const ep of extraPanes) {
          ep.openTabs = ep.openTabs.filter((t: string) => !BUILTIN_NAMES_SET.has(t));
          ep.activeTab = ep.openTabs[0] || '';
        }
        // 清除演示图数据（localStorage + 文件系统）
        for (const name of BUILTIN_NAMES) {
          localStorage.removeItem('fg-data-' + name);
          adapter.deleteFile(name).catch(() => {});
        }
      } else {
        // 恢复演示标签
        for (const name of BUILTIN_NAMES) {
          if (!openTabs.includes(name)) openTabs.unshift(name);
          if (!pane1.openTabs.includes(name)) pane1.openTabs.unshift(name);
        }
        activeTab = BUILTIN_NAMES[0];
      }
      if (activeTab) {
        loadGraphData(activeTab);
      } else {
        // 没有标签页 → 清空画布
        graph.nodes = []; graph.edges = []; graph.groups = [];
        clearEd(); simManager?.initSim(); draw();
      }
      renderAllTabs();
      settingsPanel.hide();
    },
    onResetDemo: async () => {
      if (!await confirmAction('重置三个内置演示图到初始状态？你的修改将被清除。')) return;
      for (const name of BUILTIN_NAMES) {
        localStorage.removeItem('fg-data-' + name);
        adapter.deleteFile(name).catch(() => {});
      }
      const currentFile = focusedPaneIndex === PANE_LEFT ? activeTab
        : (extraPanes[focusedPaneIndex - 1]?.activeTab ?? activeTab);
      await loadGraphData(currentFile);
      settingsPanel.hide();
      showToast('已重置为初始演示', 'success');
    },
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
  fontFamily = (DEFAULT_SETTINGS as any).fontFamily || '"SiYuan Songti", serif';
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
    try {
      const result = fn();
      return result;
    } finally {
      saveConfigTo(pane1);
      pane1.treeMode = treeMode; pane1.categoryMode = categoryMode; pane1.fullCatMode = fullCatMode; pane1.activeMode = activeMode;
      pane1.selNode = selNode; pane1.selEdge = selEdge; pane1.selGroup = selGroup;
      graph = savedGraph; simManager = savedSim; undoManager = savedUndo;
      loadConfigFrom(pane0Config as any);
      treeMode = savedTree; categoryMode = savedCat; fullCatMode = savedFull; activeMode = savedActive;
      selNode = savedSelNode; selEdge = savedSelEdge; selGroup = savedSelGroup;
    }
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
      const sn: any = { id: node.id, label: node.label, headingLevel: node.headingLevel ?? 6, tags: node.tags ?? [], x: node.x, y: node.y, _isNew: true };
      const currentNodes = sim.nodes();
      currentNodes.push(sn);
      sim.nodes(currentNodes);
      sim.alpha(0.05).alphaTarget(0.005).restart();
      sn.fx = sn.x; sn.fy = sn.y;
      // 1.5s 硬固定 → 弹簧过渡释放（避免被固定节点的电荷力瞬间弹飞）
      setTimeout(() => {
        const anchorX = sn.x, anchorY = sn.y;
        let spring = 0.25;
        const relax = () => {
          spring *= 0.88;
          if (spring < 0.015) { sn.fx = null; sn.fy = null; sim.alphaTarget(0); return; }
          sn.fx = sn.x + (anchorX - sn.x) * spring;
          sn.fy = sn.y + (anchorY - sn.y) * spring;
          requestAnimationFrame(relax);
        };
        relax();
      }, 1500);
    }
  };

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
  /** BFS 变体：遇到 collapsed 节点停止向下遍历（用于"展开一级"动画） */
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
      if (cur.id !== rootId) {
        const curGn = graph.nodes.find((n: any) => n.id === cur.id);
        if (curGn?.collapsed) continue;
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
    // 动画结束后一次性解除所有固定，刷新电荷缓存
    const totalAnimMs = maxDepth * ANIM_DURATION + 400;
    setTimeout(() => {
      for (const pn of pinnedNodes) { pn.fx = null; pn.fy = null; }
      const s2 = getSim();
      if (s2) { s2.nodes(s2.nodes()); s2.alphaTarget(0); }
    }, totalAnimMs);

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

    // 重建 link force：用 sim 中所有节点的 ID 过滤，避免 D3 构造时找折叠节点抛错
    {
      const simNodeIds = new Set((sim.nodes() as any[]).map((n: any) => n.id));
      const validEdges = graph.edges
        .filter((e: any) =>
          (e.lineStyle || 'solid') === 'solid' && !e._conflict && !e._dyingAt &&
          simNodeIds.has(typeof e.source === 'object' ? e.source.id : e.source) &&
          simNodeIds.has(typeof e.target === 'object' ? e.target.id : e.target)
        )
        .map((e: any) => ({ ...e, source: typeof e.source === 'object' ? (e.source as any).id ?? e.source : e.source, target: typeof e.target === 'object' ? (e.target as any).id ?? e.target : e.target }));
      if (validEdges.length > 0) {
        sim.force("link", d3.forceLink(validEdges).id((d: any) => d.id).distance(
          focusedPaneIndex === PANE_RIGHT ? pane1.linkDist : linkDist
        ).strength(
          focusedPaneIndex === PANE_RIGHT ? pane1.linkStr : linkStr
        ));
      }
    }
    // 重新 setNodes 触发新 link force 的 initialize（解析 edge source/target → node 引用）
    sim.nodes(sim.nodes());
    sim.alpha(0.3).alphaTarget(0.01).restart();
    // 动画结束后一次性解除所有固定，刷新电荷缓存
    let maxExpandDepth = 0;
    for (const [, info] of descInfo) { if (info.depth > maxExpandDepth) maxExpandDepth = info.depth; }
    const expandTotalMs = maxExpandDepth * ANIM_DURATION + 400;
    setTimeout(() => {
      for (const pn of pinnedNodes2) { pn.fx = null; pn.fy = null; }
      const s = getSim();
      if (s) { s.nodes(s.nodes()); s.alphaTarget(0); }
    }, expandTotalMs);
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
      (s as any).selectedTooltip = selectedTooltip;
      s.centerMode = centerMode ?? false;
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
      px.viewport.on('moved', () => { if (readyToDraw) drawGridOnly(); });
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
      dualPane.layoutPanes();
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

  // --- 移动端浮动工具栏 ---
  const mobileToolbar = createMobileToolbar({
    undo: () => {
      if (focusedPaneIndex === PANE_RIGHT) {
        if (pane1.undoManager.undo(pane1.graph)) {
          pane1.selNode = null; pane1.selEdge = null; pane1.selGroup = null;
          simManager1.initSim(); draw();
        }
      } else {
        if (undoManager.undo(graph)) { clearEd(); simManager.initSim(); draw(); }
      }
    },
    redo: () => {
      if (focusedPaneIndex === PANE_RIGHT) {
        if (pane1.undoManager.redo(pane1.graph)) {
          pane1.selNode = null; pane1.selEdge = null; pane1.selGroup = null;
          simManager1.initSim(); draw();
        }
      } else {
        if (undoManager.redo(graph)) { clearEd(); simManager.initSim(); draw(); }
      }
    },
    toggleLinkMode: () => {
      if (focusedPaneIndex === PANE_RIGHT) {
        pane1.linkMode = !pane1.linkMode;
        linkBtn.style.background = pane1.linkMode ? '#5B8FF9' : '';
        linkBtn.style.color = pane1.linkMode ? '#fff' : '';
        if (pane1.linkMode) { pane1.linkSrc = null; showToast('连线模式：点击源节点，再点击目标节点', 'info', 2000); }
        else { showToast('已退出连线模式', 'info'); }
        return pane1.linkMode;
      } else {
        linkMode = !linkMode; linkBtn.style.background = linkMode ? '#5B8FF9' : ''; linkBtn.style.color = linkMode ? '#fff' : '';
        if (linkMode) { linkSrc = null; linkCursorX = 0; linkCursorY = 0; showToast('连线模式：点击源节点，再点击目标节点', 'info', 2000); }
        else { showToast('已退出连线模式', 'info'); }
        return linkMode;
      }
    },
    toggleBoxSelectMode: () => { boxSelectMode = !boxSelectMode; return boxSelectMode; },
    getLinkActive: () => focusedPaneIndex === PANE_RIGHT ? pane1.linkMode : linkMode,
    getBoxSelectActive: () => boxSelectMode,
  });
  appShell.appendChild(mobileToolbar);

  const refreshBtn = document.createElement('button');
  refreshBtn.textContent = '刷新'; refreshBtn.style.cssText = `font-size:${V('--fg-font-md', '0.85em')};padding:2px 8px;cursor:pointer;`;
  refreshBtn.onclick = async () => {
    if (focusedPaneIndex === PANE_RIGHT) {
      if (pane1.activeMode === 'radial') { applyLayoutMode('radial'); return; }
      if (isBuiltin(pane1.activeTab)) {
        const builtin = JSON.parse(JSON.stringify(BUILTIN_GRAPHS[pane1.activeTab]));
        pane1.graph.nodes = builtin.nodes; pane1.graph.edges = builtin.edges; pane1.graph.groups = builtin.groups;
        await writeGraphData(pane1.activeTab, pane1.graph);
      } else {
        const saved = await readGraphData(pane1.activeTab);
        if (saved) { pane1.graph.nodes = saved.nodes; pane1.graph.edges = saved.edges || []; pane1.graph.groups = saved.groups || []; }
      }
      simManager1.initSim(); draw();
      return;
    }
    if (activeMode === 'tree') { applyTreeLayout(); return; }
    if (activeMode === 'radial') { applyLayoutMode('radial'); return; }
    if (activeMode === 'category') { applyCategoryLayout(false); return; }
    if (activeMode === 'fullcat') { applyCategoryLayout(true); return; }
    if (isBuiltin(activeTab)) {
      const builtin = JSON.parse(JSON.stringify(BUILTIN_GRAPHS[activeTab]));
      graph.nodes = builtin.nodes; graph.edges = builtin.edges; graph.groups = builtin.groups;
      graph.settings = builtin.settings || graph.settings;
      await writeGraphData(activeTab, graph);
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

  // 导入多媒体按钮
  const importBtn = document.createElement('button');
  importBtn.textContent = '导入多媒体'; importBtn.style.cssText = `font-size:${V('--fg-font-md', '0.85em')};padding:2px 8px;cursor:pointer;`;
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
          mediaType, mediaUrl: URL.createObjectURL(file), _blobUrl: true });
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
      for (const c of pixi!.groupLayer.children.slice()) c.destroy({ children: true });
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
      for (const c of pixi!.groupLayer.children.slice()) c.destroy({ children: true });
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
      for (const n of graph.nodes) { n.fixed = false; n.fx = null; n.fy = null; delete (n as any)._pieColors; delete (n as any)._treeX; delete (n as any)._treeY; delete (n as any)._radialX; delete (n as any)._radialY; delete (n as any)._sx; delete (n as any)._sy; }
      for (const e of graph.edges) { delete (e as any)._conflict; }
    } else if (activeMode === 'category' || activeMode === 'fullcat') {
      for (const n of graph.nodes) { n.fixed = false; n.fx = null; n.fy = null; delete (n as any)._pieColors; delete (n as any)._treeX; delete (n as any)._treeY; delete (n as any)._radialX; delete (n as any)._radialY; delete (n as any)._sx; delete (n as any)._sy; }
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
  const snapPosToGrid = (x: number, y: number, sp?: number): [number, number] => {
    const s = sp ?? (gridSp || 30);
    return [Math.round(x / s) * s, Math.round(y / s) * s];
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
    if (activeMode === 'radial') {
      stopStarLoop();
      for (const n of graph.nodes) { delete (n as any)._starId; delete (n as any)._starRoot; delete (n as any)._radialX; delete (n as any)._radialY; delete (n as any)._starRadius; delete (n as any)._starAngle; }
    }
    activeMode = mode;
    renderModeBar();
    if (mode === 'default') {
      // 保存当前位置作为动画起点
      for (const n of graph.nodes) { (n as any)._sx = n.x; (n as any)._sy = n.y; }
      // 彻底清理所有布局残留和固定状态
      for (const n of graph.nodes) { n.fixed = false; n.fx = null; n.fy = null; delete (n as any)._pieColors; delete (n as any)._treeX; delete (n as any)._treeY; delete (n as any)._starId; delete (n as any)._starRoot; delete (n as any)._radialX; delete (n as any)._radialY; delete (n as any)._starRadius; delete (n as any)._starAngle; }
      for (const e of graph.edges) { delete (e as any)._conflict; }
      (graph as any)._categoryBoxes = null;
      // 持久化并启动模拟（抑制首帧绘制，防止闪烁）
      saveNow();
      _skipDraw = true;
      simManager.initSim();
      currentAnimationCancel = startNodeAnimation({
        nodes: graph.nodes,
        simNodes: simManager.getSim()?.nodes() || [],
        getSource: (n) => ({ x: (n as any)._sx, y: (n as any)._sy }),
        getTarget: (n) => {
          const sim = simManager.getSim()?.nodes() || [];
          const sn = sim.find((s: any) => s.id === n.id);
          return sn ? { x: sn.x, y: sn.y } : null;
        },
        duration: LAYOUT_ANIM_DURATION, // 900ms，匹配布局切换
        easing: EASING.smoothStep, // 比 easeInOutCubic 更柔和
        onFrame: () => { _skipDraw = false; draw(); },
        onComplete: () => {
          const sim = simManager.getSim();
          // 收集固定节点 ID
          const fixedIds = new Set(savedFixedNodes.filter(s => s.fixed).map(s => s.id));
          // 恢复手动固定节点到进入布局前的原始位置（graph + sim 同步）
          for (const s of savedFixedNodes) {
            const n = graph.nodes.find(n => n.id === s.id);
            if (n && s.fixed) { n.x = s.x; n.y = s.y; n.fixed = true; n.fx = s.fx; n.fy = s.fy; }
            if (sim && s.fixed) {
              const sn = sim.nodes().find((sn2: any) => sn2.id === s.id);
              if (sn) { sn.x = s.x; sn.y = s.y; sn.fx = s.fx ?? s.x; sn.fy = s.fy ?? s.y; sn.fixed = true; }
            }
          }
          // 释放非固定节点的 sim 约束
          if (sim) {
            for (const sn of sim.nodes()) {
              if (!fixedIds.has(sn.id)) { sn.fx = null; sn.fy = null; }
            }
          }
          // 恢复集合显示状态
          for (const gs of savedGroupModes) {
            const g = graph.groups.find(g => g.id === gs.id);
            if (g) { g.displayMode = gs.mode as any; g.nodeColorMode = gs.nodeColorMode as any; g.nodeColor = gs.nodeColor; }
          }
          savedFixedNodes = [];
          savedGroupModes = [];
          draw();
        },
      });
    } else if (mode === 'tree') {
      for (const n of graph.nodes) { n.fixed = false; n.fx = null; n.fy = null; }
      for (const e of graph.edges) { delete (e as any)._conflict; }
      applyTreeLayout();
    } else if (mode === 'radial') {
      for (const n of graph.nodes) { (n as any)._sx = n.x; (n as any)._sy = n.y; }
      computeRadialLayout(graph.nodes, graph.edges);
      for (const n of graph.nodes) { (n as any)._tx = n.x; (n as any)._ty = n.y; }
      for (const n of graph.nodes) { n.x = (n as any)._sx; n.y = (n as any)._sy; }
      simManager.initSim();
      const aSim = simManager.getSim();
      if (aSim) (aSim as any)._animating = true;
      currentAnimationCancel = startNodeAnimation({
        nodes: graph.nodes,
        simNodes: aSim?.nodes() || [],
        getTarget: (n) => {
          const tx = (n as any)._tx, ty = (n as any)._ty;
          return (tx != null) ? { x: tx, y: ty } : null;
        },
        duration: 600,
        easing: EASING.smoothStep,
        onFrame: () => { if (sharedState.directDraw) sharedState.directDraw(); else draw(); },
        onComplete: () => {
          for (const n of graph.nodes) { delete (n as any)._sx; delete (n as any)._sy; delete (n as any)._tx; delete (n as any)._ty; n.fx = null; n.fy = null; }
          // 动画期间节点可能已变化 → 用当前 graph 重算，保证数据一致
          computeRadialLayout(graph.nodes, graph.edges);
          simManager.initSim();
          const s2 = simManager.getSim();
          if (s2) (s2 as any)._animating = false;
          startStarLoop();
        },
      });
    } else if (mode === 'category') {
      for (const c of pixi!.groupLayer.children.slice()) c.destroy({ children: true });
      applyCategoryLayout(false);
    } else if (mode === 'fullcat') {
      (window as any)._savedGroupModes = graph.groups.map(g => ({ id: g.id, mode: g.displayMode }));
      for (const g of graph.groups) { if (g.displayMode === 'none') g.displayMode = 'rect'; }
      for (const c of pixi!.groupLayer.children.slice()) c.destroy({ children: true });
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
    // 星型：点一次 → 静态径向，再点一次 → 恒星星系自转（黄色高亮）
    (() => {
      const isRadial = activeMode === 'radial';
      const label = isRadial && starRotateMode ? '星型 ⟳' : '星型';
      const pill = document.createElement('span');
      pill.textContent = label;
      const bg = isRadial && starRotateMode
        ? `background:rgba(245,158,11,0.35);border:1px solid rgba(245,158,11,0.5);color:${V('--fg-text','#fff')};`
        : isRadial
        ? `background:rgba(91,143,249,0.35);border:1px solid rgba(91,143,249,0.5);color:${V('--fg-text','#fff')};`
        : `border:1px solid ${V('--fg-border-light','rgba(255,255,255,0.18)')};`;
      pill.style.cssText = `-webkit-app-region:no-drag;font-size:${V('--fg-font-xs', '0.72em')};padding:1px 8px;cursor:pointer;border-radius:3px;white-space:nowrap;user-select:none;${bg}`;
      pill.onclick = () => {
        if (!isRadial) { applyLayoutMode('radial'); return; }
        starRotateMode = !starRotateMode;
        scheduleSave();
        _starLastFrameTime = performance.now();
        renderModeBar();
      };
      modeRow.appendChild(pill);
    })();
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
    const items: { label: string; action: () => void; children?: { label: string; action: () => void }[] }[] = [];
    const mx = screenX, my = screenY;
    const isExtra = focusedPaneIndex === PANE_RIGHT;
    const _g = isExtra ? pane1.graph : graph;
    const _px = isExtra ? pixi1! : pixi!;
    const _sm = isExtra ? simManager1 : simManager;
    const _getSim = () => isExtra ? getSim1() : getSim();
    const _saveUndo = () => { const um = isExtra ? pane1.undoManager : undoManager; um.pushSnapshot(_g); };
    const _addToSim = (node: any) => {
      const s = _getSim();
      if (s) {
        node.fx = node.x; node.fy = node.y;
        s.nodes([...s.nodes(), node]); s.alpha(0.05).alphaTarget(0.005).restart();
        // 弹簧过渡释放
        setTimeout(() => {
          const anchorX = node.x, anchorY = node.y;
          let spring = 0.25;
          const relax = () => {
            spring *= 0.88;
            if (spring < 0.015) { node.fx = null; node.fy = null; s.alphaTarget(0); return; }
            node.fx = node.x + (anchorX - node.x) * spring;
            node.fy = node.y + (anchorY - node.y) * spring;
            requestAnimationFrame(relax);
          };
          relax();
        }, 1500);
      }
    };
    const _initSim = () => _sm.initSim();
    const _fixNode = (nid: string) => {
      const n = _g.nodes.find(gn => gn.id === nid);
      if (n) { n.fixed = true; n.fx = n.x; n.fy = n.y; }
      const s = _getSim(); if (s) { const sn = s.nodes().find((sn2: any) => sn2.id === nid); if (sn) { sn.fixed = true; sn.fx = sn.x; sn.fy = sn.y; } s.nodes(s.nodes()); s.alpha(Math.max(s.alpha(), 0.01)).restart(); }
    };
    const _unfixNodes = (ids: string[]) => {
      const s = _getSim();
      for (const nid of ids) {
        const n = _g.nodes.find(gn => gn.id === nid);
        if (n) { n.fixed = false; n.fx = null; n.fy = null; }
        if (s) { const sn = s.nodes().find((sn2: any) => sn2.id === nid); if (sn) { sn.fixed = false; sn.fx = null; sn.fy = null; } }
      }
      if (s) { s.nodes(s.nodes()); s.alpha(Math.max(s.alpha(), 0.01)).restart(); }
    };
    if (type === 'blank') {
      // 复制框选节点
      if (sharedState.selectedNodeIds.length >= 1) {
        items.push({
          label: `复制所选 (${sharedState.selectedNodeIds.length})`,
          action: () => {
            const selIds = new Set(sharedState.selectedNodeIds);
            const selNodes = _g.nodes.filter(n => selIds.has(n.id));
            const selEdges = _g.edges.filter(e => {
              const s = typeof e.source === 'object' ? (e.source as any).id : e.source;
              const t = typeof e.target === 'object' ? (e.target as any).id : e.target;
              return selIds.has(s) && selIds.has(t);
            });
            sharedState.nodeClipboard = {
              nodes: JSON.parse(JSON.stringify(selNodes)),
              edges: JSON.parse(JSON.stringify(selEdges)),
            };
            showToast(`已复制 ${selNodes.length} 个节点${selEdges.length ? `及 ${selEdges.length} 条内部边` : ''}`, 'success');
          },
        });
      }
      // 粘贴剪贴板节点
      if (sharedState.nodeClipboard && sharedState.nodeClipboard.nodes.length > 0) {
        items.push({
          label: `粘贴 (${sharedState.nodeClipboard.nodes.length} 节点)`,
          action: () => {
            _saveUndo();
            const idMap: Record<string, string> = {};
            const center = _px?.viewport?.center ?? { x: 0, y: 0 };
            // 计算偏移：把剪贴板节点的中心移到视口中心
            const cbCenterX = sharedState.nodeClipboard!.nodes.reduce((a, n) => a + (n.x || 0), 0) / sharedState.nodeClipboard!.nodes.length;
            const cbCenterY = sharedState.nodeClipboard!.nodes.reduce((a, n) => a + (n.y || 0), 0) / sharedState.nodeClipboard!.nodes.length;
            const offsetX = center.x - cbCenterX;
            const offsetY = center.y - cbCenterY;
            // 生成新 ID
            for (const n of sharedState.nodeClipboard!.nodes) {
              idMap[n.id] = 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
            }
            const newNodes = sharedState.nodeClipboard!.nodes.map((n: any) => ({
              ...JSON.parse(JSON.stringify(n)),
              id: idMap[n.id],
              x: (n.x || 0) + offsetX,
              y: (n.y || 0) + offsetY,
              fx: null, fy: null, fixed: false,
              _isNew: true,
            }));
            const newEdges = sharedState.nodeClipboard!.edges.map((e: any) => ({
              ...JSON.parse(JSON.stringify(e)),
              source: idMap[e.source],
              target: idMap[e.target],
            }));
            _g.nodes.push(...newNodes);
            _g.edges.push(...newEdges);
            scheduleSave();
            // 加入模拟
            const s = _getSim();
            if (s) {
              for (const n of newNodes) s.nodes([...s.nodes(), n]);
              s.alpha(0.3).restart();
              setTimeout(() => {
                newNodes.forEach((n: any) => { n.fx = null; n.fy = null; });
                s.alphaTarget(0);
              }, 2000);
            }
            draw();
            showToast(`已粘贴 ${newNodes.length} 个节点${newEdges.length ? `及 ${newEdges.length} 条边` : ''}`, 'success');
          },
        });
      }
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
      const moreItems: { label: string; action: () => void }[] = [];
      const addItem = (item: { label: string; action: () => void }) => {
        if (isMedia) moreItems.push(item); else items.push(item);
      };

      addItem({ label: '编辑', action: () => { fillNode(id); } });
      const hlNode = _g.nodes.find(n => n.id === id);
      if (hlNode?.hyperlink) {
        addItem({ label: '打开链接', action: () => { window.open(hlNode.hyperlink!, '_blank'); } });
      }
      // 复制框选节点（>1 个时显示）
      if (sharedState.selectedNodeIds.length >= 2) {
        const ids = sharedState.selectedNodeIds;
        items.unshift({
          label: `复制所选 (${ids.length})`,
          action: () => {
            const selIds = new Set(ids);
            const selNodes = _g.nodes.filter(n => selIds.has(n.id));
            const selEdges = _g.edges.filter(e => {
              const s = typeof e.source === 'object' ? (e.source as any).id : e.source;
              const t = typeof e.target === 'object' ? (e.target as any).id : e.target;
              return selIds.has(s) && selIds.has(t);
            });
            sharedState.nodeClipboard = {
              nodes: JSON.parse(JSON.stringify(selNodes)),
              edges: JSON.parse(JSON.stringify(selEdges)),
            };
            showToast(`已复制 ${selNodes.length} 个节点${selEdges.length ? `及 ${selEdges.length} 条内部边` : ''}`, 'success');
          },
        });
      }
      // 复制节点
      addItem({ label: '复制节点', action: () => {
        const orig = _g.nodes.find(n => n.id === id);
        if (!orig) return;
        const newId = 'n_' + Date.now();
        const copy = JSON.parse(JSON.stringify(orig));
        copy.id = newId; copy.x = (orig.x || 0) + 60; copy.y = (orig.y || 0) + 40;
        delete copy.fx; delete copy.fy; delete copy.fixed;
        _saveUndo(); _g.nodes.push(copy);
        scheduleSave(); _initSim(); draw(); { if (!isExtra) fillNode(newId); };
      }});
      if (node?.mediaType && isExpanded(id) && hoveredMediaId !== id) {
        items.push({ label: '收起', action: () => { hideMedia(id); manuallyOpenedMediaIds.delete(id); draw(); } });
      } else if (node?.mediaType) {
        // 悬停临时展开的先收起，再显示"打开"
        if (hoveredMediaId === id) { hideMedia(id); hoveredMediaId = ''; }
        items.push({ label: '打开', action: () => {
          const n = _g.nodes.find(n => n.id === id)!;
          let displayUrl = n.mediaUrl || '';
          if (displayUrl && /^[A-Z]:[\\/]/.test(displayUrl)) {
            displayUrl = 'file:///' + displayUrl.replace(/\\/g, '/').replace(/^[A-Z]:/, (m: string) => m.toLowerCase());
          }
          showMedia(mediaOverlayContainer, id, n.label || n.id, n.mediaType, displayUrl, n.color || '#5B8FF9', () => {
            const sp = _px.viewport.toScreen(n.x, n.y);
            const rect = _px.app.canvas.getBoundingClientRect();
            return { x: rect.left + sp.x, y: rect.top + sp.y };
          }, () => { _px.viewport.pause = true; }, () => { _px.viewport.pause = false; });
          manuallyOpenedMediaIds.add(id);
          draw();
        }});
      }
      addItem({ label: '设为图片', action: async () => {
        const url = await safePrompt('图片 URL：');
        if (url) { const n = _g.nodes.find(n => n.id === id); if (n) { n.mediaType = 'image'; n.mediaUrl = url; scheduleSave(); } }
      }});
      addItem({ label: '设为文档', action: async () => {
        const url = await safeTextareaPrompt('文档内容或 URL：');
        if (url) { const n = _g.nodes.find(n => n.id === id); if (n) { n.mediaType = 'md'; n.mediaUrl = url; scheduleSave(); } }
      }});
      // 非多媒体节点有内容 → 可打开查看
      if (!node?.mediaType && node?.note?.trim()) {
        items.push({ label: '打开内容', action: () => {
          const n = _g.nodes.find(n => n.id === id)!;
          showMedia(mediaOverlayContainer, id, n.label || n.id, 'md', n.note || '', n.color || '#5B8FF9', () => {
            const sp = _px.viewport.toScreen(n.x, n.y);
            const rect = _px.app.canvas.getBoundingClientRect();
            return { x: rect.left + sp.x, y: rect.top + sp.y };
          }, () => { _px.viewport.pause = true; }, () => { _px.viewport.pause = false; });
          manuallyOpenedMediaIds.add(id);
          draw();
        }});
      }
      if (isFixedNode(id)) {
        addItem({ label: '解除固定', action: () => { _unfixNodes([id]); } });
      } else {
        addItem({ label: '固定', action: () => { _fixNode(id); } });
      }
      const nodeForCollapse = _g.nodes.find(n => n.id === id);
      // 检查当前节点是否有子节点（至少一条以它为 source 的边）
      const hasChild = _g.edges.some(e => {
        const src = typeof e.source === 'object' ? e.source.id : e.source;
        return src === id;
      });
      const getDescendants = (nodeId: string): string[] => {
        const info = bfsDescendants(nodeId);
        return [...info.keys()].filter(k => k !== nodeId);
      };
      const hasCollapsedDescendants = getDescendants(id).some(did => _g.nodes.find((n: any) => n.id === did)?.collapsed);

      if (nodeForCollapse?.collapsed && hasChild) {
        addItem({ label: '展开一级', action: () => {
          _saveUndo(); nodeForCollapse.collapsed = false; scheduleSave(); animateExpand(id);
        }});
        addItem({ label: '全部展开', action: () => {
          _saveUndo();
          const all = [id, ...getDescendants(id)];
          for (const nid of all) { const n = _g.nodes.find(n => n.id === nid); if (n) n.collapsed = false; }
          scheduleSave(); animateExpand(id);
        }});
      } else if (nodeForCollapse?.collapsed && !hasChild) {
        // 叶子节点被误标记为折叠，自动修复
        nodeForCollapse.collapsed = false;
      } else if (hasChild) {
        addItem({ label: '折叠一级', action: () => {
          _saveUndo(); nodeForCollapse!.collapsed = true; scheduleSave(); animateCollapse(id);
        }});
        addItem({ label: '逐级折叠', action: () => {
          _saveUndo();
          const all = [id, ...getDescendants(id)];
          for (const nid of all) { const n = _g.nodes.find(n2 => n2.id === nid); if (n) n.collapsed = true; }
          scheduleSave(); animateCollapse(id);
        }});
        if (hasCollapsedDescendants) {
          addItem({ label: '展开一级', action: () => {
            _saveUndo();
            const descInfo = bfsDescendants(id);
            const collapsedDesc = [...descInfo.entries()]
              .filter(([nid]) => nid !== id)
              .filter(([nid]) => _g.nodes.find(gn => gn.id === nid)?.collapsed)
              .sort((a, b) => a[1].depth - b[1].depth);
            if (collapsedDesc.length > 0) {
              const minDepth = collapsedDesc[0][1].depth;
              const targets = collapsedDesc.filter(([, info]) => info.depth === minDepth).map(([nid]) => nid);
              for (const nid of targets) {
                const n = _g.nodes.find(gn => gn.id === nid);
                if (n) n.collapsed = false;
              }
              scheduleSave();
              for (const nid of targets) animateExpand(nid);
              draw();
            }
          }});
          addItem({ label: '全部展开', action: () => {
            _saveUndo();
            const all = [id, ...getDescendants(id)];
            for (const nid of all) { const n = _g.nodes.find(n2 => n2.id === nid); if (n) n.collapsed = false; }
            scheduleSave(); animateExpand(id);
          }});
        }
      }
      addItem({ label: '新建子节点', action: () => { const sim = _sm.getSim()?.nodes(); const simParent = sim?.find((n: any) => n.id === id); const parent = _g.nodes.find(n => n.id === id); const px = simParent?.x ?? parent?.x ?? 200; const py = simParent?.y ?? parent?.y ?? 200; const childId = 'n_' + Date.now(); const childLevel = Math.min(6, (parent?.headingLevel || 6) + 1); const child = { id: childId, label: '子节点', headingLevel: childLevel, tags: [], x: px + 60, y: py + 40, _isNew: true }; _saveUndo(); _g.nodes.push(child); _g.edges.push({ source: id, target: childId, label: '', color: '#BFBFBF', arrow: (isExtra ? pane1.defArrow : defArrow) }); scheduleSave(); _addToSim(child); draw(); { if (!isExtra) fillNode(childId); }; } });
      addItem({ label: '连线', action: () => { linkMode = true; linkSrc = id; linkCursorX = 0; linkCursorY = 0; } });
      items.push({ label: '删除', action: () => {
        _saveUndo();
        markNodesDying([id]);
        const _nIdx = _g.nodes.findIndex(n => n.id === id);
        if (_nIdx >= 0) _g.nodes.splice(_nIdx, 1);
        // 邻边渐隐，不立即删除
        for (const e of _g.edges) {
          if ((typeof e.source === "object" ? e.source.id : e.source) === id || (typeof e.target === "object" ? e.target.id : e.target) === id) e._dyingAt = performance.now();
        }
        if (selNode === id) clearEd();
        scheduleSave(); draw();
        setTimeout(() => {
          for (let i = _g.edges.length - 1; i >= 0; i--) { const e2: any = _g.edges[i]; if (e2._dyingAt && performance.now() - e2._dyingAt >= 400) _g.edges.splice(i, 1); }
          const s2 = getSim(); if (s2) { const validEdges = _g.edges.filter(e => (e.lineStyle || 'solid') === 'solid' && !(e as any)._conflict && !(e as any)._dyingAt); s2.force("link", d3.forceLink(validEdges).id((d: any) => d.id).distance(linkDist).strength(linkStr)); }
          scheduleSave(); draw();
        }, 400);
      }});
      // 多媒体节点：其余操作收入"更多"子菜单
      if (isMedia && moreItems.length > 0) {
        items.push({ label: '更多', children: moreItems, action: () => {} });
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
          for (let i = _g.edges.length - 1; i >= 0; i--) { const ed: any = _g.edges[i]; if (ed._dyingAt && performance.now() - ed._dyingAt >= 400) _g.edges.splice(i, 1); }
          const s = getSim(); if (s) { const validEdges = _g.edges.filter(e => (e.lineStyle || 'solid') === 'solid' && !(e as any)._conflict && !(e as any)._dyingAt); s.force("link", d3.forceLink(validEdges).id((d: any) => d.id).distance(linkDist).strength(linkStr)); }
          scheduleSave(); draw();
        }, 400);
      }});
    } else if (type === 'group' && id) {
      items.push({ label: '编辑', action: () => { fillGroup(id); } });
    }
    if (items.length > 0) showContextMenu(appShell, mx, my, items);
  };

  const handleLinkTap = (x: number, y: number, pi?: PaneState): boolean => {
    const lm = pi ? pi.linkMode : linkMode;
    const ls = pi ? pi.linkSrc : linkSrc;
    if (!lm || !ls) return false;
    const sim = pi ? pi.simManager.getSim() : getSim();
    const nodes = sim?.nodes() || [];
    const g = pi ? pi.graph : graph;
    const ne = pi ? pi.nodeExpand : nodeExpand;
    const n = nodes.find((nd: any) => (nd.x - x) ** 2 + (nd.y - y) ** 2 <= ((nd.radius || 9) + ne) ** 2);
    if (n) {
      if (ls === n.id) { if (pi) { pi.linkMode = false; pi.linkSrc = null; } else { linkMode = false; linkSrc = null; } return true; }
      if (g.edges.some(e => (typeof e.source === "object" ? e.source.id : e.source) === ls && (typeof e.target === "object" ? e.target.id : e.target) === n.id)) { if (pi) { pi.linkMode = false; pi.linkSrc = null; } else { linkMode = false; linkSrc = null; } return true; }
      saveUndo(); g.edges.push({ source: ls, target: n.id, label: '', color: '#BFBFBF', arrow: defArrow, _createdAt: performance.now() });
      scheduleSave();
      if (sim) {
        const validEdges = g.edges.filter(e => (e.lineStyle || 'solid') === 'solid' && !(e as any)._conflict && !(e as any)._dyingAt);
        const ld = pi ? pi.linkDist : linkDist;
        const lstr = pi ? pi.linkStr : linkStr;
        sim.force("link", d3.forceLink(validEdges).id((d: any) => d.id).distance(ld).strength(lstr));
        sim.alpha(0.3).restart();
        setTimeout(() => sim.alphaTarget(0), 3000);
      }
      draw();
    }
    if (pi) { pi.linkMode = false; pi.linkSrc = null; } else { linkMode = false; linkSrc = null; }
    return true;
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
    saveUndo(); graph.nodes.push({ id, label: file.name, radius: 12, headingLevel: 4, tags: [], x: wp.x, y: wp.y, mediaType, mediaUrl: url, _blobUrl: true });
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
  pixi!.viewport.on('moved', () => { if (readyToDraw) drawGridOnly(); });
  pixi!.viewport.on('zoomed-end', () => { if (readyToDraw) draw(); });

  const eventsCanvas = pixi!.app.canvas as any;
  // Pane 0 事件
  const bindPaneEvents = (pi: PaneState, px: PixiLayers, _origSM: any, sprites: Map<any,any>, lastDragId: { v: string | null }) => {
    const getSM = () => pi.simManager || _origSM;
    return {
    graph: pi.graph,
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
    fixNode: (id: string) => { const n = pi.graph.nodes.find(gn => gn.id === id); if (n) { n.fixed = true; n.fx = n.x; n.fy = n.y; } const sim = getSM().getSim(); if (sim) { const sn = sim.nodes().find((sn2: any) => sn2.id === id); if (sn) { sn.fixed = true; sn.fx = sn.x; sn.fy = sn.y; } sim.nodes(sim.nodes()); sim.alpha(Math.max(sim.alpha(), 0.01)).restart(); } scheduleSave(); draw(); },
    isFixedNode: (id: string) => { const n = pi.graph.nodes.find(gn => gn.id === id); return n?.fixed || false; },
    selectionBox, fixNodes: (ids: string[]) => { for (const id of ids) { const n = pi.graph.nodes.find(gn => gn.id === id); if (n) { n.fixed = true; n.fx = n.x; n.fy = n.y; } const sim = getSM().getSim(); if (sim) { const sn = sim.nodes().find((sn2: any) => sn2.id === id); if (sn) { sn.fixed = true; sn.fx = sn.x; sn.fy = sn.y; } } } scheduleSave(); draw(); },
    unfixNodes: (ids: string[]) => { const sim = getSM().getSim(); for (const id of ids) { const n = pi.graph.nodes.find(gn => gn.id === id); if (n) { n.fixed = false; n.fx = null; n.fy = null; } if (sim) { const sn = sim.nodes().find((sn2: any) => sn2.id === id); if (sn) { sn.fixed = false; sn.fx = null; sn.fy = null; } } } if (sim) { sim.nodes(sim.nodes()); sim.alpha(Math.max(sim.alpha(), 0.01)).restart(); } scheduleSave(); draw(); },
    appShell, triggerSave: () => scheduleSave(),
    onDragStart: (id: string) => { getSM().setDragNode(id); lastDragId.v = id; },
    onDragEnd: () => {
      if ((pi.gridSnapEnabled || pi.partialGridSnap) && lastDragId.v) {
        const sn = getSM().getSim()?.nodes()?.find((n2: any) => n2.id === lastDragId.v);
        if (sn && (pi.gridSnapEnabled || sn.fixed)) {
          const [sx, sy] = snapPosToGrid(sn.x, sn.y, pi.gridSp);
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
    getGridSnapEnabled: () => pi.gridSnapEnabled || pi.partialGridSnap, getGridSp: () => pi.gridSp,
    getHiddenNodeIds: () => sharedState.hiddenNodeIds?.() ?? new Set(),
    setDragScale: (nodeId: string | null, scale: number) => { if (nodeId) { const sprite = sprites.get(nodeId); if (sprite) sprite.container.scale.set(scale); } },
    onTap: (x: number, y: number) => {
      saveCurrent();
      if (handleLinkTap(x, y, pi)) return;
      if (pi.linkMode && !pi.linkSrc) {
        const ns = getSM().getSim()?.nodes() || [];
        const hit = ns.find((nd: any) => (nd.x - x) ** 2 + (nd.y - y) ** 2 <= ((nd.radius || 9) + pi.nodeExpand) ** 2);
        if (hit) { pi.linkSrc = hit.id; showToast(`源: ${hit.label || hit.id}，请点击目标节点`, 'info', 2000); return; }
      }
      const nodes = getSM().getSim()?.nodes() || [];
      const n = nodes.find((nd: any) => (nd.x - x) ** 2 + (nd.y - y) ** 2 <= ((nd.radius || 9) + pi.nodeExpand) ** 2);
      if (n) { pi.selNode = n.id; fillNode(n.id); draw(); return; }
      for (let i2 = 0; i2 < pi.graph.edges.length; i2++) {
        const e = pi.graph.edges[i2]; const s = nodes.find((nd: any) => nd.id === (typeof e.source === 'object' ? e.source.id : e.source)), t = nodes.find((nd: any) => nd.id === (typeof e.target === 'object' ? e.target.id : e.target));
        if (!s || !t) continue;
        const dx = t.x - s.x, dy = t.y - s.y; const len2 = dx * dx + dy * dy;
        let tp = ((x - s.x) * dx + (y - s.y) * dy) / len2; tp = Math.max(0, Math.min(1, tp));
        if ((x - (s.x + tp * dx)) ** 2 + (y - (s.y + tp * dy)) ** 2 <= (pi.lineExpand + 3) ** 2) { pi.selEdge = i2; if (pi.index === PANE_LEFT) fillEdge(i2); draw(); return; }
      }
      for (const g of pi.graph.groups) {
        if (g.displayMode === 'none') continue;
        const members = nodes.filter((nd: any) => (nd.tags || []).includes(g.label));
        if (members.length === 0) continue;
        if (g.displayMode === 'fluid') { for (const m of members) { if ((m.x - x) ** 2 + (m.y - y) ** 2 <= ((m.radius || 9) * (g.fluidRadius || 3)) ** 2) { pi.selGroup = g.id; if (pi.index === PANE_LEFT) fillGroup(g.id); draw(); return; } } continue; }
      }
      pi.selNode = null; pi.selEdge = null; pi.selGroup = null; clearEd(); draw();
    },
    fillNode,
    fillEdge,
    fillGroup,
    onMediaHover: (nodeId: string | null) => {
      if (nodeId) {
        if (nodeId === hoveredMediaId) return;
        if (manuallyOpenedMediaIds.has(nodeId)) return; // 手动打开的不遮挡
        hideMedia(hoveredMediaId);
        hoveredMediaId = '';
        const gn = pi.graph.nodes.find(n => n.id === nodeId);
        if (gn?.mediaType && gn?.mediaUrl) {
          const px = pi.pixi || pixi!;
          const vp = px.viewport;
          const sn = (pi.simManager || simManager)?.getSim()?.nodes()?.find((n: any) => n.id === nodeId);
          if (sn) {
            let displayUrl = gn.mediaUrl;
            if (displayUrl && /^[A-Z]:[\\/]/.test(displayUrl)) {
              displayUrl = 'file:///' + displayUrl.replace(/\\/g, '/').replace(/^[A-Z]:/, (m: string) => m.toLowerCase());
            }
            showMedia(mediaOverlayContainer, nodeId, gn.label || nodeId, gn.mediaType, displayUrl, gn.color || '#5B8FF9', () => {
              const sp = vp.toScreen(sn.x, sn.y);
              const rect = pi.pixi?.app.canvas.getBoundingClientRect() || pixi!.app.canvas.getBoundingClientRect();
              return { x: rect.left + sp.x, y: rect.top + sp.y };
            });
            // hover 媒体框不拦截鼠标事件，让 canvas 正常接收 pointerleave
            const hoverEl = mediaOverlayContainer.querySelector(`[data-media-id="${nodeId}"]`) as HTMLElement | null;
            if (hoverEl) { hoverEl.style.pointerEvents = 'none'; }
            hoveredMediaId = nodeId;
          }
        }
      } else {
        hideMedia(hoveredMediaId);
        hoveredMediaId = '';
      }
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
      pixi: null as any, canvasContainer: null as any,
      nodeSprites: null as any, readyToDraw: false, get simManager() { return simManager; },
      _lastDragNodeId: null, searchMatchIndex: 0, lastSearchTerm: "",
      searchDebounceTimer: null, currentAnimationCancel: null,
      savedFixedNodes: [], savedGroupModes: [], layouts: [],
      get undoManager() { return undoManager; },
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

  // 清理旧 demo 数据（仅首次迁移）
  localStorage.removeItem('fg-data-demo');
  const DEMO_ENABLED_KEY = 'fg-demo-enabled';
  const getDemoEnabled = () => localStorage.getItem(DEMO_ENABLED_KEY) !== 'false';
  let demoEnabled = getDemoEnabled();

  // 恢复上次打开的标签页（保证三个内置图始终存在）
  // 恢复上次打开的标签页（演示关闭时跳过内置演示图）
  const restored = restoreTabs();
  const defaultOpen = demoEnabled ? [...BUILTIN_NAMES] : [] as string[];
  if (restored && restored.tabs.length > 0) {
    openTabs = restored.tabs.filter((t: string) => t !== 'demo');
    if (demoEnabled) {
      for (let i = BUILTIN_NAMES.length - 1; i >= 0; i--) {
        const name = BUILTIN_NAMES[i];
        if (!openTabs.includes(name)) openTabs.unshift(name);
      }
    }
    activeTab = (restored.active && restored.active !== 'demo' && openTabs.includes(restored.active)) ? restored.active : (openTabs[0] || '');
  } else {
    openTabs = [...defaultOpen];
    activeTab = defaultOpen[0] || '';
    if (!demoEnabled) {
      // 演示关闭且无历史标签 → 创建空白起始页
      openTabs = ['未命名'];
      activeTab = '未命名';
    }
  }
  // 恢复 pane1 标签
  const fallbackFirst = demoEnabled ? BUILTIN_NAMES[0] : '';
  try {
    const p1tabs = JSON.parse(localStorage.getItem(TABS_KEY + '-p1') || '[]');
    const p1active = localStorage.getItem(ACTIVE_KEY + '-p1') || fallbackFirst;
    if (p1tabs.length > 0) {
      pane1.openTabs = p1tabs.filter((t: string) => t !== 'demo');
      if (demoEnabled) {
        for (const name of BUILTIN_NAMES) {
          if (!pane1.openTabs.includes(name)) pane1.openTabs.unshift(name);
        }
      }
      pane1.activeTab = (p1active && p1active !== 'demo' && pane1.openTabs.includes(p1active)) ? p1active : (pane1.openTabs[0] || fallbackFirst);
    } else {
      pane1.openTabs = [...(demoEnabled ? BUILTIN_NAMES : [])];
      pane1.activeTab = fallbackFirst;
    }
  } catch {
    pane1.openTabs = [...(demoEnabled ? BUILTIN_NAMES : [])];
    pane1.activeTab = fallbackFirst;
  }
  renderAllTabs();

  // 尝试恢复文件夹（优先级: SAF > showDirectoryPicker > Capacitor > localStorage）
  const safDir = safIsAvailable() ? await safRestoreDirectory() : null;
  if (safDir) {
    fileSystemMountPath = safDir.name;
    await refreshFileTree();
  } else {
    fileSystemMountPath = capApp ? 'graphs' : null;
  await refreshFileTree();
  // Capacitor 可能还没初始化 → 延迟重试几次
  let _retry = 0;
  const _retryRefresh = () => {
    if (_retry++ > 4) return;
    setTimeout(async () => { await refreshFileTree(); }, _retry === 1 ? 500 : 1500);
  };
  try {
    const r = await adapter.listFiles();
    if (r.ok && r.value.length === 0) _retryRefresh();
  } catch { _retryRefresh(); }
  // Electron / 桌面模式：有额外文件夹恢复路径
  const ea2 = (window as any).electronAPI;
  if (ea2) {
    const config = await ea2.configRead();
    const savedPath = config.folderPath;
    if (savedPath && await ea2.exists(savedPath)) {
      await ea2.addAllowedDir(savedPath); // 注册到主进程安全白名单
      fileSystemMountPath = savedPath;
      await refreshFileTree();
    }
  } else {
    const savedHandle = await loadFolderHandle();
    if (savedHandle) {
      const ok = await restoreFolder(savedHandle);
      if (ok) { fileSystemMountPath = savedHandle.name; await refreshFileTree(); }
    }
  }
  } // end else (SAF not available or not restored)

  // 在 loadGraphData（触发模拟）之前就把原点屏中
  {
    const p = pixi!;
    if (p.app.canvas.clientWidth > 0) {
      p.viewport.position.set(p.app.canvas.clientWidth / 2, p.app.canvas.clientHeight / 2);
    }
  }
  if (activeTab) { try { await loadGraphData(activeTab); } catch (e) { console.error('init load error:', e); } }
  loadLayouts(); renderModeBar();
  updateGwGh();
  // Pane 1 加载内置图（演示关闭时跳过）
  if (demoEnabled && pane1.activeTab) {
    try {
      const builtin1 = JSON.parse(JSON.stringify(BUILTIN_GRAPHS[pane1.activeTab] || BUILTIN_GRAPHS[BUILTIN_NAMES[0]]));
      pane1.graph.nodes = builtin1.nodes;
      pane1.graph.edges = builtin1.edges;
      pane1.graph.groups = builtin1.groups || [];
      if (builtin1.settings) {
        for (const [k, v] of Object.entries(builtin1.settings)) {
          (pane1 as any)[k] = v;
        }
        pane1.graphTheme = (builtin1.settings as any).graphTheme || pane1.graphTheme;
      }
      applyPaneCanvasBg(pane1Container, pane1.graphTheme);
      { const ac = getAccentColorsForTheme(pane1.graphTheme);
        pane1.themeAccentColor = ac.accent; pane1.themeAccentAltColor = ac.accentAlt; }
      simManager1.initSim();
    } catch (e) { console.error('pane1 init error:', e); }
  }
  readyToDraw = true;
  // 首次打开立即同步绘制（模拟切标签后的行为）
  draw();

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
          for (const ed of pane1.graph.edges) { if ((typeof ed.source === "object" ? ed.source.id : ed.source) === pane1.selNode || (typeof ed.target === "object" ? ed.target.id : ed.target) === pane1.selNode) (ed as any)._dyingAt = performance.now(); }
          pane1.selNode = null; pane1.selEdge = null; pane1.selGroup = null;
          scheduleSave(); pixiDrawPane1();
          setTimeout(() => {
            for (let i = pane1.graph.edges.length - 1; i >= 0; i--) { const e2: any = pane1.graph.edges[i]; if (e2._dyingAt && performance.now() - e2._dyingAt >= 400) pane1.graph.edges.splice(i, 1); }
            simManager1.initSim(); pixiDrawPane1();
          }, 400);
        } else if (pane1.selEdge !== null) {
          pane1.undoManager.pushSnapshot(pane1.graph);
          const e2 = pane1.graph.edges[pane1.selEdge]; if (e2) (e2 as any)._dyingAt = performance.now();
          pane1.selNode = null; pane1.selEdge = null; pane1.selGroup = null;
          scheduleSave(); pixiDrawPane1();
          setTimeout(() => {
            for (let i = pane1.graph.edges.length - 1; i >= 0; i--) { const e3: any = pane1.graph.edges[i]; if (e3._dyingAt && performance.now() - e3._dyingAt >= 400) pane1.graph.edges.splice(i, 1); }
            simManager1.initSim(); pixiDrawPane1();
          }, 400);
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
        for (const e of graph.edges) { if ((typeof e.source === "object" ? e.source.id : e.source) === selNode || (typeof e.target === "object" ? e.target.id : e.target) === selNode) e._dyingAt = performance.now(); }
        clearEd(); scheduleSave(); draw();
        setTimeout(() => {
          for (let i = graph.edges.length - 1; i >= 0; i--) { const e2: any = graph.edges[i]; if (e2._dyingAt && performance.now() - e2._dyingAt >= 400) graph.edges.splice(i, 1); }
          // 更新模拟链接力
          const s = getSim(); if (s) { const validEdges = graph.edges.filter(e => (e.lineStyle || 'solid') === 'solid' && !(e as any)._conflict && !(e as any)._dyingAt); s.force("link", d3.forceLink(validEdges).id((d: any) => d.id).distance(linkDist).strength(linkStr)); }
          scheduleSave(); draw();
        }, 400);
      } else if (selEdge !== null) {
        saveUndo(); const e2 = graph.edges[selEdge]; if (e2) e2._dyingAt = performance.now();
        clearEd(); scheduleSave(); draw();
        setTimeout(() => {
          for (let i = graph.edges.length - 1; i >= 0; i--) { const e3: any = graph.edges[i]; if (e3._dyingAt && performance.now() - e3._dyingAt >= 400) graph.edges.splice(i, 1); }
          const s = getSim(); if (s) { const validEdges = graph.edges.filter(e => (e.lineStyle || 'solid') === 'solid' && !(e as any)._conflict && !(e as any)._dyingAt); s.force("link", d3.forceLink(validEdges).id((d: any) => d.id).distance(linkDist).strength(linkStr)); }
          scheduleSave(); draw();
        }, 400);
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
            const s1 = simManager1.getSim();
            if (s1) { const sn = s1.nodes().find((s: any) => s.id === pane1.selNode); if (sn) { sn.fixed = n.fixed; sn.fx = n.fx ?? null; sn.fy = n.fy ?? null; } s1.nodes(s1.nodes()); s1.alpha(Math.max(s1.alpha(), 0.01)).restart(); }
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
          const parentEdge = _g.edges.find(ed => (typeof ed.target === "object" ? ed.target.id : ed.target) === pane1.selNode);
          const parentId = parentEdge?.source;
          const parent2 = parentId ? _g.nodes.find(n => n.id === parentId) : null;
          const siblingId = 'n_' + Date.now();
          const sel2 = _g.nodes.find(n => n.id === pane1.selNode);
          const siblingLevel = sel2?.headingLevel || 6;
          const simNodesSib = simManager1.getSim()?.nodes();
          const simParentSib = parent2 ? simNodesSib?.find((n: any) => n.id === parent2.id) : null;
          const simSelSib = simNodesSib?.find((n: any) => n.id === pane1.selNode);
          const cx = simParentSib ? simParentSib.x : (simSelSib?.x ?? sel2?.x ?? 200);
          const cy = simParentSib ? simParentSib.y : (simSelSib?.y ?? sel2?.y ?? 200);
          const sibling = { id: siblingId, label: '子节点', headingLevel: siblingLevel, tags: [], x: cx + 120, y: cy + 30, _isNew: true };
          pane1.undoManager.pushSnapshot(_g); _g.nodes.push(sibling);
          if (parentId) _g.edges.push({ source: parentId, target: siblingId, label: '', color: '#BFBFBF', arrow: pane1.defArrow });
          scheduleSave();
          // add to sim
          const s1 = simManager1.getSim(); if (s1) { s1.nodes([...s1.nodes(), sibling]); s1.alpha(0.3).restart(); }
          pixiDrawPane1();
        } else {
          const parent2 = _g.nodes.find(n => n.id === pane1.selNode);
          const simNodes2 = simManager1.getSim()?.nodes();
          const simParent2 = simNodes2?.find((n: any) => n.id === pane1.selNode);
          const px2 = simParent2?.x ?? parent2?.x ?? 200;
          const py2 = simParent2?.y ?? parent2?.y ?? 200;
          const childId = 'n_' + Date.now();
          const childLevel = Math.min(6, (parent2?.headingLevel || 6) + 1);
          const child = { id: childId, label: '子节点', headingLevel: childLevel, tags: [], x: px2 + 60, y: py2 + 40, _isNew: true };
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
        const parentEdge = graph.edges.find(ed => (typeof ed.target === "object" ? ed.target.id : ed.target) === selNode);
        const parentId = parentEdge?.source;
        const parent = parentId ? graph.nodes.find(n => n.id === parentId) : null;
        const siblingId = 'n_' + Date.now();
        const sel = graph.nodes.find(n => n.id === selNode);
        const siblingLevel = sel?.headingLevel || 6;
        const simNodes3 = getSim()?.nodes();
        const simPar = parent ? simNodes3?.find((n: any) => n.id === parent.id) : null;
        const simSel = simNodes3?.find((n: any) => n.id === selNode);
        const cx = simPar?.x ?? (simSel?.x ?? sel?.x ?? 200);
        const cy = simPar?.y ?? (simSel?.y ?? sel?.y ?? 200);
        const sibling = { id: siblingId, label: '子节点', headingLevel: siblingLevel, tags: [], x: cx + 120, y: cy + 30, _isNew: true };
        saveUndo(); graph.nodes.push(sibling);
        if (parentId) {
          graph.edges.push({ source: parentId, target: siblingId, label: '', color: '#BFBFBF', arrow: defArrow, _createdAt: performance.now() });
        }
        scheduleSave(); addNodeToSim(sibling); draw(); fillNode(siblingId);
      } else {
        // Tab：给选中节点新建子节点
        const sim = getSim()?.nodes();
        const simParent = sim?.find((n: any) => n.id === selNode);
        const parent = graph.nodes.find(n => n.id === selNode);
        const px = simParent?.x ?? parent?.x ?? 200;
        const py = simParent?.y ?? parent?.y ?? 200;
        const childId = 'n_' + Date.now();
        const childLevel = Math.min(6, (parent?.headingLevel || 6) + 1);
        const child = { id: childId, label: '子节点', headingLevel: childLevel, tags: [], x: px + 60, y: py + 40, _isNew: true };
        saveUndo(); graph.nodes.push(child);
        graph.edges.push({ source: selNode, target: childId, label: '', color: '#BFBFBF', arrow: defArrow, _createdAt: performance.now() });
        scheduleSave(); addNodeToSim(child); draw(); fillNode(childId);
      }
    }

    // ═══ 方向键：沿线跳转节点 ═══
    // ═══ Shift+方向键：左右切换标签页，上下导航文件树 ═══
    if (e.shiftKey && !e.ctrlKey && !e.altKey) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const step = e.key === 'ArrowRight' ? 1 : -1;
        const idx = openTabs.indexOf(activeTab);
        if (idx >= 0 && openTabs.length > 1) {
          const newIdx = (idx + step + openTabs.length) % openTabs.length;
          switchTab(openTabs[newIdx]);
        }
        return;
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const files = _flatTreePaths;
        if (files.length > 1) {
          const idx = files.indexOf(activeTab);
          const step = e.key === 'ArrowDown' ? 1 : -1;
          const newIdx = idx < 0 ? 0 : ((idx + step + files.length) % files.length);
          switchTab(files[newIdx]);
        }
        return;
      }
    }

    const ARROW_KEYS: Record<string, { dx: number; dy: number }> = {
      ArrowUp: { dx: 0, dy: -1 }, ArrowDown: { dx: 0, dy: 1 },
      ArrowLeft: { dx: -1, dy: 0 }, ArrowRight: { dx: 1, dy: 0 },
    };
    if (ARROW_KEYS[e.key] && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      const g = fg();
      const sim = fsim1().getSim();
      const simNodes: any[] = sim?.nodes() || [];
      const { dx, dy } = ARROW_KEYS[e.key];

      let currentId = selNode;
      if (!currentId) {
        // 未选中：取鼠标位置该方向最近的节点
        const mx = sharedState.mouseWorldX ?? 0, my = sharedState.mouseWorldY ?? 0;
        let bestNode: any = null, bestScore = Infinity;
        for (const n of simNodes) {
          const ndx = n.x - mx, ndy = n.y - my;
          const dot = ndx * dx + ndy * dy;
          const dist = Math.sqrt(ndx * ndx + ndy * ndy);
          if (dot > 0) { const score = dist - dot * 3; if (score < bestScore) { bestScore = score; bestNode = n; } }
        }
        // 该方向无 → 临近方向
        if (!bestNode) {
          for (const n of simNodes) {
            const ndx = n.x - mx, ndy = n.y - my;
            const dot = ndx * dx + ndy * dy;
            const dist = Math.sqrt(ndx * ndx + ndy * ndy);
            const score = dist - dot * 2;
            if (score < bestScore) { bestScore = score; bestNode = n; }
          }
        }
        if (bestNode) currentId = bestNode.id;
      }

      if (currentId) {
        const current = simNodes.find((n: any) => n.id === currentId);
        if (!current) return;

        // 收集候选节点
        const neighbors: { id: string; x: number; y: number }[] = [];
        if (!ctrl) {
          // 普通方向键：沿线跳转（只考虑相邻节点）
          const seen = new Set<string>([currentId]);
          for (const ed of g.edges) {
            const s = typeof ed.source === 'object' ? (ed.source as any).id : ed.source;
            const t = typeof ed.target === 'object' ? (ed.target as any).id : ed.target;
            if (s === currentId && !seen.has(t)) {
              seen.add(t); const tn = simNodes.find((n: any) => n.id === t);
              if (tn) neighbors.push({ id: t, x: tn.x, y: tn.y });
            }
            if (t === currentId && !seen.has(s)) {
              seen.add(s); const sn = simNodes.find((n: any) => n.id === s);
              if (sn) neighbors.push({ id: s, x: sn.x, y: sn.y });
            }
          }
        } else {
          // Ctrl+方向键：越过线（不考虑连线，全校节点）
          for (const n of simNodes) {
            if (n.id !== currentId) neighbors.push({ id: n.id, x: n.x, y: n.y });
          }
        }

        if (neighbors.length > 0) {
          const cx = current.x, cy = current.y;
          // 过滤出在目标方向的邻居（dot > ε 避免 0 夹角）
          const dirNeighbors = neighbors.filter(nb => {
            return (nb.x - cx) * dx + (nb.y - cy) * dy > 0.001;
          });
          const candidates = dirNeighbors.length > 0 ? dirNeighbors : neighbors;
          if (ctrl) {
            // Ctrl：距离优先（最近）、方向对齐次之
            candidates.sort((a, b) => {
              const aDist = Math.sqrt((a.x - cx) ** 2 + (a.y - cy) ** 2);
              const bDist = Math.sqrt((b.x - cx) ** 2 + (b.y - cy) ** 2);
              if (Math.abs(aDist - bDist) > 0.5) return aDist - bDist;
              const aDot = (a.x - cx) * dx + (a.y - cy) * dy;
              const bDot = (b.x - cx) * dx + (b.y - cy) * dy;
              return bDot - aDot;
            });
          } else {
            // 普通模式：方向优先（沿线跳转）
            candidates.sort((a, b) => {
              const aDot = (a.x - cx) * dx + (a.y - cy) * dy;
              const bDot = (b.x - cx) * dx + (b.y - cy) * dy;
              if (Math.abs(aDot - bDot) > 0.01) return bDot - aDot;
              const aDist = Math.sqrt((a.x - cx) ** 2 + (a.y - cy) ** 2);
              const bDist = Math.sqrt((b.x - cx) ** 2 + (b.y - cy) ** 2);
              return aDist - bDist;
            });
          }
          const targetId = candidates[0].id;
          if (fp) {
            fp.selNode = targetId; fp.selEdge = null; fp.selGroup = null;
            pixiDrawPane1();
          } else {
            selNode = targetId; selEdge = null; selGroup = null;
            fillNode(targetId); draw();
          }
        }
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
      // 更新 viewport 尺寸：renderer 先 resize（会触发 viewport 的 resize 事件），
      // 再显式 resize viewport 以覆盖 pixi-viewport 的自动调整，最后居中
      if (pixi) {
        const pw = pixiContainer.clientWidth;
        const ph = pixiContainer.clientHeight;
        pixi.app.renderer.resize(pw, ph);
        pixi.viewport.resize(pw, ph);
        pixi.viewport.position.set(pw / 2, ph / 2);
      }
      if (pixi1 && pane1Container.clientWidth > 0) {
        const pw = pane1Container.clientWidth;
        const ph = pane1Container.clientHeight;
        pixi1.app.renderer.resize(pw, ph);
        pixi1.viewport.resize(pw, ph);
        pixi1.viewport.position.set(pw / 2, ph / 2);
      }
      draw();
    }, 200);
  });

  // 分屏调整时更新所有 viewport 尺寸
  window.addEventListener('pane-resize', () => {
    setTimeout(() => {
      if (pixi) {
        const pw = pixiContainer.clientWidth, ph = pixiContainer.clientHeight;
        pixi.app.renderer.resize(pw, ph);
        pixi.viewport.resize(pw, ph);
        pixi.viewport.position.set(pw / 2, ph / 2);
      }
      for (let i = 0; i < extraPixis.length; i++) {
        const px = extraPixis[i];
        if (px) {
          const pw = extraContainers[i].clientWidth, ph = extraContainers[i].clientHeight;
          if (pw > 0) {
            px.app.renderer.resize(pw, ph);
            px.viewport.resize(pw, ph);
            px.viewport.position.set(pw / 2, ph / 2);
          }
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
    if (readyToDraw) draw();
  });
  // 首帧强刷：连刷 5 次取保，消除时序导致的部分元素不渲染问题
  let _initDraws = 5;
  const _forceInitDraw = () => {
    if (!readyToDraw || !pixi) return;
    try { draw(); } catch {}
    if (--_initDraws > 0) requestAnimationFrame(_forceInitDraw);
  };
  requestAnimationFrame(_forceInitDraw);


  // 自定义字体加载完成后重新渲染（修复初次打开时线不显示/字体不刷新的问题）
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => {
      if (pixi) {
        // 更新 fontSize/fontFamily 到所有已有 text，触发刷新
        setNodeFontFamily(fontFamily);
        draw();
      }
    });
  }

  // 自动检查 GitHub 更新（延迟 3 秒，不阻塞启动）
  setTimeout(async () => {
    const autoUpdate = localStorage.getItem('fg-auto-update') === 'true';
    if (!autoUpdate) return;
    const info = await checkUpdate();
    if (!info) return;
    showUpdateDialog(info, () => {
      const ea = (window as any).electronAPI;
      if (ea?.openExternal) { ea.openExternal(info.htmlUrl); }
      else { window.open(info.htmlUrl, '_blank'); }
    });
  }, 3000);

  // 页面关闭前强制同步保存所有窗格数据（防止 300ms 防抖期间的修改丢失）
  window.addEventListener('beforeunload', () => {
    try {
      const saved = new Set<string>();
      const savePane = (g: any, tab: string) => {
        if (!g || !g.nodes || g.nodes.length === 0) return;
        const key = 'fg-data-' + tab;
        if (saved.has(key)) return;
        localStorage.setItem(key, JSON.stringify(g));
        saved.add(key);
      };
      // 主窗格
      if (graph && graph.nodes.length > 0) {
        graph.settings = collectSettings();
        savePane(graph, activeTab);
      }
      // 副窗格 pane1
      if (pane1?.graph?.nodes?.length > 0) savePane(pane1.graph, pane1.activeTab);
      // 额外窗格
      for (const ep of extraPanes) {
        if (ep?.graph?.nodes?.length > 0) savePane(ep.graph, ep.activeTab);
      }
    } catch {}
  });

  // ---- Vite HMR：监听数据目录的文件变更（开发模式） ----
  if (import.meta.hot) {
    import.meta.hot.on('graph-external-change', (data: { graph: string }) => {
      handleExternalGraphChange(data.graph);
    });
  }
}

main().catch(console.error);
