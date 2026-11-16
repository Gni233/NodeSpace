/// <reference types="vite/client" />
import './workspace-ui.css';
import * as d3 from 'd3';
(window as any).d3 = d3;

import { sharedState } from './shared-state';
import { GraphData, GraphSettings } from './data/storage';
import { createRecoveryStorage } from './recovery-storage';
import { createSimManager } from './graph-sim';
import { getCollapsedHierarchyHiddenNodeIds, getHierarchyFoldActions, type HierarchyFoldAction } from './graph-visibility';
import { setupCanvasEvents, type CanvasBoxSelection } from './ui-events';
import { showActionWheel, showContextWheel, type ContextMenuItem } from './ui-contextmenu';
import { bindContextMenuTrigger } from './context-menu-trigger';
import { nodeContextActions } from './node-context-actions';
import { createEditPanel, createNodeTextEditor, type NodeTextField } from './ui-edit';
import { createInlineNodeTitleEditor } from './inline-node-title';
import { buildSettings } from './ui-settings';
import { getTheme, applyThemeVars, getAccentColorsForTheme, isThemeDark, ThemeConfig, DEFAULT_GRAPH_THEME, DEFAULT_CANVAS_FONT } from './theme';
import { createSidebar } from './ui-sidebar';
import { restoreFolder, getDirHandle } from './file-system';
import { saveFolderHandle, loadFolderSelection, findSavedFolderId } from './folder-store';
import { isCapacitor, importFilesMobile, pickDirectoryAndImport, downloadApk, downloadReleaseApk, installApk } from './fs-mobile';
import { safPickDirectory, safRestoreDirectory, safIsAvailable, safSaveBackup } from './saf-bridge';
import { isHarmonyOS } from './utils/platform';
import { FileAdapter, FileEntry, Result, createFileWithFallback, joinPath, replacePathName } from './file-adapter';
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
import { computeTreeLayout } from './layouts/tree';
import { computeSemanticLayout, SemanticLayoutController, stabilizeSemanticLayout } from './layouts/semantic';
import { computeSemanticLens, resolveSemanticLensBand, DEFAULT_SEMANTIC_CARD_DENSITY } from './semantic-lens';
import { createCanvasEmptyState } from './canvas-empty-state';
import { computeRevealTranslation, type RevealRect } from './canvas-reveal';
import { semanticZoomProfile } from './semantic-zoom';
import { CardGridController, getCardLabelSize } from './cardgrid';
import { clearCards } from './cardgrid/render';
import { BlurFilter, Container, Graphics, Text } from 'pixi.js';
import { showMedia, positionMedia, hideMedia, isExpanded, clearAllMedia, toFileUrl } from './media-nodes';
import { createMarkdownSourceEditor, type MarkdownProjectionField, type MarkdownSourceEditor } from './markdown-source-editor';
import type { MarkdownProjectionTarget } from './markdown-projection-edit';
import { createSettingsPanel } from './settings-panel';
import { createMobileToolbar } from './ui-mobile-toolbar';
import { createMobileViewportCoordinator } from './mobile-viewport';
import { isNodeInGroup, isStructureCollection } from './group-membership';
import { searchGraph, searchResultViewport, type SearchField, type SearchMatchMode } from './search';
import { UndoManager } from './undo-redo';
import { getConfiguredNodeRadius } from './node-radius';
import { createNodeNotePreview, type NodeNoteEdit } from './node-note-preview';
import { renderedNodeTitleHitBounds } from './node-title-hit';
import { createMediaImportSession, readBrowserMediaSources, mediaTypeForFile, MEDIA_FILE_ACCEPT } from './media-import';
import { createMediaTextEditor } from './media-text-editor';
import { prepareGraphCopy } from './graph-copy';
import { setupGroupSearch } from './group-search';
import { createSpaceBackup, inspectSpaceBackup, restoreSpaceBackup, SPACE_BACKUP_EXTENSION, SPACE_BACKUP_MAX_FILE_BYTES } from './space-backup';
import { backupFileStem, findAvailableSpacePath, findRestoreCopyPath, describeBackupContents } from './space-backup-ui';
import { createWorkbenchHome, type WorkbenchSpace } from './workbench-home';
import { getVaultWallFolder } from './vault-wall';
import { createWindowControls } from './window-controls';
import type { WorkbenchCoverAnchor, WorkbenchCoverPalette } from './workbench-gallery';
import { animateWorkbenchCoverNodes, WORKBENCH_MORPH_DURATION, type ScreenNode } from './workbench-morph';
import { buildWorkbenchCover, type WorkbenchCover } from './workbench-cover';
import { createWorkbenchCoverCache } from './workbench-cover-cache';
import { resolveObsidianLink } from './obsidian-links';
import { createWorkbenchHistory } from './workbench-history';
import { darken, getExplicitGraphColor } from './utils/color';
import { showToast, confirmAction } from './toast';
import { startNodeAnimation } from './utils/animate-nodes';
import { EASING, DURATION } from './utils/easing';
import { clearMembershipDragPreview, clearPaneStructureBoundaries, createPaneState, hitPaneStructureBoundary, isOutsideMembershipSourceSnapshot, paneAtGlobalIndex, paneGraphFacade, paneIndexForExtra, paneStructureBoundaryEndpoints, pickMembershipBoundaryTarget, PANE_LEFT, PANE_RIGHT, PaneState, reindexExtraPanes, type MembershipDragSourceSnapshot } from './pane-state';
import { LayoutSlot } from './layout-controller';
import { GraphRuntime, GraphRuntimeRegistry } from './graph-runtime';
import { InternalGraphWriteGuard } from './external-change-guard';
import { userFacingGraphPaths } from './file-tree-visibility';
import { GRAPH_STORAGE_PREFIX } from './storage-keys';
import { serializeGraphSnapshot } from './graph-snapshot';
import { PaneManager, PaneExternals } from './pane-manager';
import { createMultiPaneLayout, MultiPaneDOM } from './dual-pane-layout';
import { SIDEBAR_COLLAPSED_WIDTH, getResponsiveSidebarWidth, Z_CANVAS, Z_LOADING, Z_FLOATING_UI, Z_MOBILE_TOOLBAR, Z_MEDIA_OVERLAY, Z_EDIT_PANEL, Z_SELECTION_BOX, Z_SETTINGS_PANEL, Z_TOOLBAR_POPOVER, Z_STATS, Z_TOAST, LAYOUT_ANIM_DURATION, SEARCH_MOVE_DURATION, FIT_ALL_DURATION } from './layout-constants';
const ANIM_DURATION = 260;
import { clearBlobLayer, createPixiApp, PixiLayers } from './pixi-app';
import { canDissolveStructure, createStructureNode, detachNodeFromStructure, dissolveStructureNode, getDirectStructureEdges, getExpandedStructureBoundaryModels, getStructureProjection, isStructureNode, normalizeStructureNodeSizing, normalizeStructureRelations, previewStructureMembershipTransaction, setStructureCollapsed, syncStructureCollections, transactStructureMembership, type StructureMembershipRequest, type StructureMembershipTransactionResult } from './structure-nodes';
import { createPaneStructureView, createStructureBreadcrumb, getPaneOriginalEdgeIndex, isPaneStructureProxyEdge, isPaneStructureProxyNode, PaneStructureView, StructureNavigationState } from './structure-view';
import { assignCreatedOrder, assignCreatedOrders, repairCreatedOrders, createNodeId, createGroupId } from './node-order';
import { createTextViewEditor, TextViewEditor } from './text-view/editor';
import { createNodeSprite, updateNodePosition, applyNodeVisual, getHeadingColor, getSpectrumColor, getNarrowSpectrumColor, NodeSprite, NodeVisualState, setNodeFontFamily, updateSemanticBodiesForViewport } from './pixi-nodes';
import { getNodeVisualRadius, updateEdges } from './pixi-edges';
import { hitTestEdge, nodeContainsPoint } from './geometry/hit';
import { semanticEdgePolyline } from './semantic-edge-grammar';
import { computeStructureBoundary } from './geometry/structure-boundary';
import { resolveMembershipDragBoundaryModel, updateStructureBoundaries } from './pixi-structure-boundaries';
import { updateGroups } from './pixi-groups';
import { clearSemanticScene, renderSemanticScene } from './pixi-semantic-scene';
import { updateGrid, clearGridCache } from './pixi-grid';
import { attachmentToGraph, isVaultLocationTabId, isVaultSpaceTabId, joinVaultPath, markdownToGraph, normalizeVaultPath, vaultDisplayName, vaultFolderToGraph, vaultGraphFileName, vaultPathFromTabId, vaultSpacePathFromTabId, vaultSpaceTabId, vaultTabId, type VaultIndex, type VaultResource, type VaultResourceKind, type VaultSourceRef } from './vault';
import { createVaultSpaceBreadcrumb, VaultViewportMemory } from './vault-navigation';
import { resolveNodeDisplayLabel } from './node-display';
import { createResourceReferenceNode, createVaultResourceReference, isResourceReferenceLoadingPreview, isResourceReferenceNode, markdownResourceReferenceExcerpt, markdownSectionForResourceReference, reconcileGraphResourceReferences, resourceReferenceCardFallback, resourceReferenceForPath, resourceReferencePreviewMarkdown, rewriteGraphResourceReferencePaths, type ResourceReference } from './resource-references';
import { createFragmentSpaceReference, createNodeSpaceReference, createSpaceFragment, createSpaceReferenceNode, createWholeSpaceReference, hydrateSpaceReferenceNode, isSpaceReferenceNode, navigationWouldCycle, normalizeSpaceGraphId, resolveSpaceReference, rewriteSpaceReferenceGraphIds, spaceReferenceKey, type ResolvedSpaceReference, type SpaceReference } from './space-composition';
import { expandedSpacePortalRect, normalizeSpacePortalAnchor, resolveSpacePortalAnchor, type NormalizedSpacePortalAnchor, type RectLike } from './space-navigation';
import { backLocalContext, buildLocalContext, extendLocalContext, localContextInternalEdgeIndexes, localContextMemberIds, startLocalContext, type LocalContextState } from './local-context';
import { createLocalContextNavigator } from './local-context-navigation';
import { composeCrossSpaceProjection, createCrossSpaceBranch, isCrossSpaceProxyEdge, isCrossSpaceProxyNode, retainCrossSpaceBranches, type CrossSpaceBranch, type CrossSpaceTarget } from './cross-space-context';
import { applyVaultProjectionDefaults } from './vault-defaults';

const DEFAULT_SETTINGS: GraphSettings = {
  linkDist: 120, labelSize: 18, charge: -100, linkStr: 0.3,
  collideR: 10, centerS: 0.02, groupBound: 0.8,
  heatingTime: 2, alphaTarget: 0.3, editPanelOpacity: 0.9,
  useRAFL: true, nodeExpand: 8, lineExpand: 6,
  showGLabels: true, glMin: 10, glMax: 28,
  gridVis: true, gridMode: 'dot' as 'line' | 'dot', axisVis: false, axisTicks: false, gridSp: 30, layoutMode: 'auto', gridSnap: false, partialGridSnap: false, fixedHollow: true, nodeColorStyle: 'hierarchical', fontFamily: DEFAULT_CANVAS_FONT,
  cardBorderStyle: 'straight' as 'straight' | 'rounded',
  ar: 0.75, graphTheme: DEFAULT_GRAPH_THEME, focusMode: false, centerMode: false, glowAppearance: true, selectedTooltip: false, gridWidth: 0.5, categoryLayout: false,
  edgeColorGradient: false, edgeWidthByLevel: false,
  semanticCardDensity: DEFAULT_SEMANTIC_CARD_DENSITY,
};

const PRESET_DEFAULT_KEY = 'fg-preset-default';
let presetDefaults: Partial<GraphSettings> = {};
try { presetDefaults = JSON.parse(localStorage.getItem(PRESET_DEFAULT_KEY) || '{}'); } catch {}

/** `default` was the pre-semantic force mode. Existing files migrate to auto. */
export function normalizeLayoutMode(mode?: string | null): string {
  if (!mode || mode === 'default' || mode === 'gridsnap') return 'auto';
  return mode;
}

export function mediaAccentForNode(node: any, theme: ThemeConfig): string {
  return getExplicitGraphColor(node, 'node') || theme.accentColor || theme.nodeDefaultColor;
}

export interface ToolbarDropdownPanel {
  details: HTMLDetailsElement;
  summary: HTMLElement;
  popover?: HTMLElement;
  align?: 'start' | 'end';
}

export function calculateToolbarPopoverPosition(
  trigger: { left: number; right: number; bottom: number },
  popoverWidth: number,
  viewportWidth: number,
  align: 'start' | 'end' = 'start',
  margin = 8,
) {
  const preferredLeft = align === 'end' ? trigger.right - popoverWidth : trigger.left;
  const maxLeft = Math.max(margin, viewportWidth - popoverWidth - margin);
  return {
    left: Math.min(Math.max(preferredLeft, margin), maxLeft),
    top: trigger.bottom + 6,
  };
}

export function setupToolbarDropdowns(
  panels: ToolbarDropdownPanel[],
  eventRoot: Pick<Document, 'addEventListener' | 'removeEventListener'> = document,
) {
  const positionPanel = (panel: ToolbarDropdownPanel) => {
    if (!panel.details.open || !panel.popover || typeof window === 'undefined') return;
    requestAnimationFrame(() => {
      if (!panel.details.open || !panel.popover) return;
      const trigger = panel.summary.getBoundingClientRect();
      const dockBottom = panel.details.parentElement?.getBoundingClientRect().bottom ?? trigger.bottom;
      const popoverWidth = panel.popover.offsetWidth;
      const position = calculateToolbarPopoverPosition(
        { left: trigger.left, right: trigger.right, bottom: dockBottom },
        popoverWidth,
        window.innerWidth,
        panel.align,
      );
      panel.popover.style.left = `${position.left}px`;
      panel.popover.style.setProperty('--fg-toolbar-popover-top', `${position.top}px`);
    });
  };
  const syncPanel = ({ details, summary }: ToolbarDropdownPanel) => {
    summary.classList.toggle('is-active', details.open);
    summary.setAttribute('aria-expanded', String(details.open));
  };
  const closePanel = (panel: ToolbarDropdownPanel) => {
    if (!panel.details.open) return;
    panel.details.open = false;
    syncPanel(panel);
  };
  const toggleHandlers = panels.map(panel => {
    const handler = () => {
      if (panel.details.open) {
        for (const other of panels) {
          if (other !== panel) closePanel(other);
        }
        positionPanel(panel);
      }
      syncPanel(panel);
    };
    panel.details.addEventListener('toggle', handler);
    syncPanel(panel);
    return handler;
  });
  const closeOutside = (event: Event) => {
    for (const panel of panels) {
      if (panel.details.open && !panel.details.contains(event.target as Node)) closePanel(panel);
    }
  };
  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const panel = panels.find(candidate => candidate.details.open);
    if (!panel) return;
    event.preventDefault();
    closePanel(panel);
    panel.summary.focus();
  };
  const repositionOpenPanels = () => {
    for (const panel of panels) positionPanel(panel);
  };
  eventRoot.addEventListener('pointerdown', closeOutside as EventListener);
  eventRoot.addEventListener('touchstart', closeOutside as EventListener);
  eventRoot.addEventListener('keydown', closeOnEscape as EventListener);
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', repositionOpenPanels);
    window.addEventListener('sidebar-toggle', repositionOpenPanels);
  }
  return () => {
    panels.forEach((panel, index) => panel.details.removeEventListener('toggle', toggleHandlers[index]));
    eventRoot.removeEventListener('pointerdown', closeOutside as EventListener);
    eventRoot.removeEventListener('touchstart', closeOutside as EventListener);
    eventRoot.removeEventListener('keydown', closeOnEscape as EventListener);
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', repositionOpenPanels);
      window.removeEventListener('sidebar-toggle', repositionOpenPanels);
    }
  };
}

async function main() {
  const appEl = document.getElementById('app');
  if (!appEl) return;

  // CSS variable helper for inline styles (fallback for pre-theme state)
  const V = (name: string, fallback: string) => `var(${name},${fallback})`;

  // ===== 布局：全屏画布 + 玻璃悬浮 UI =====
  const appShell = document.createElement('div');
  appShell.className = 'fg-app-shell';
  appShell.style.cssText = 'position:relative;width:100vw;height:100vh;height:100dvh;overflow:hidden;padding-bottom:env(safe-area-inset-bottom,0px);';
  appEl.appendChild(appShell);
  const mobileViewport = createMobileViewportCoordinator(appShell);
  window.addEventListener('beforeunload', () => mobileViewport.destroy(), { once: true });

  const selectedNotePreview = createNodeNotePreview(appShell);
  const inlineNodeTitle = createInlineNodeTitleEditor(appShell);

  // 玻璃效果现在通过 CSS 类 .fg-glass 实现，定义在 index.html 中
  // 所有 UI 组件使用 CSS 变量 var(--fg-xxx)，由 applyThemeVars() 统一设置

  const desktopApi = (window as any).electronAPI;
  const isElectron = Boolean(desktopApi);
  const windowControls = desktopApi ? createWindowControls(desktopApi) : undefined;
  if (windowControls) {
    appShell.classList.add('fg-desktop-window');
    appShell.append(windowControls);
    // ---- 外部文件变更监听（MCP Server 等外部工具修改了图文件） ----
    desktopApi.onExternalFileChange((graphName: string) => {
      handleExternalGraphChange(graphName);
    });
    desktopApi.onVaultFileChange?.((relativePath: string) => {
      void handleExternalVaultChange(relativePath);
    });

  }

  // --- 画布导航与工具 ---
  const editorShell = document.createElement('header');
  editorShell.className = 'fg-editor-shell';
  const editorNavigation = document.createElement('nav');
  editorNavigation.className = 'fg-shell-toolbar fg-shell-navigation';
  editorNavigation.setAttribute('aria-label', '空间导航');
  editorShell.appendChild(editorNavigation);
  appShell.appendChild(editorShell);
  const floatingTop = document.createElement('div');
  floatingTop.className = 'fg-glass fg-command-center';
  floatingTop.style.cssText = `position:absolute;left:var(--fg-shell-inset-inline, 12px);right:6px;z-index:${Z_FLOATING_UI};display:flex;flex-direction:column;gap:4px;`;
  appShell.appendChild(floatingTop);
  interface SpacePortalTransitionSnapshot {
    anchor: NormalizedSpacePortalAnchor;
    label: string;
    kind: 'node' | 'space' | 'fragment' | VaultResourceKind;
    miniMap: ResolvedSpaceReference['miniMap'];
  }
  interface ReferenceJourneyState {
    originTab: string;
    originLabel: string;
    targetTab: string;
    targetLabel: string;
    targetKind: 'vault' | 'graph';
    viewport: { centerX: number; centerY: number; scale: number } | null;
    spaceTransition?: SpacePortalTransitionSnapshot;
  }
  const referenceJourneys = new Map<number, ReferenceJourneyState[]>();
  let returnFromResourceReference: () => Promise<void> = async () => {};

  let blockForTextDraft = (_action: string) => false;
  let showWorkbench: () => Promise<void> = async () => {};
  let updateOpenWorkbench = (_invalidateCovers = false) => {};
  let workbenchHistory = createWorkbenchHistory(localStorage);
  let hasActiveTextDraft = () => false;
  let blockExternalForTextDraft = (_graphName: string) => false;
  let markdownSourceEditor: MarkdownSourceEditor | null = null;
  let openMarkdownSourceEditor: (_pane: PaneState, _node: any, _field?: MarkdownProjectionField) => Promise<boolean> = async () => {
    showToast('Markdown 编辑器尚未就绪', 'warning', 2200);
    return false;
  };
  let syncSplitControls = () => {};
  const vaultSpaceBreadcrumb = createVaultSpaceBreadcrumb(floatingTop, {
    navigate: tabId => { void openTab(tabId); },
    returnToOrigin: () => { void returnFromResourceReference(); },
  });

  // --- 工具面板内的搜索 ---
  const searchHeader = document.createElement('div');
  searchHeader.className = 'fg-tool-search-header';
  const searchModes = document.createElement('div');
  searchModes.className = 'fg-tool-search-modes';
  searchModes.setAttribute('role', 'group');
  searchModes.setAttribute('aria-label', '搜索类型');
  const nodeSearchButton = document.createElement('button');
  nodeSearchButton.type = 'button';
  nodeSearchButton.textContent = '节点';
  nodeSearchButton.setAttribute('aria-pressed', 'true');
  nodeSearchButton.setAttribute('aria-controls', 'ns-node-search');
  const groupSearchButton = document.createElement('button');
  groupSearchButton.type = 'button';
  groupSearchButton.textContent = '集合';
  groupSearchButton.setAttribute('aria-pressed', 'false');
  groupSearchButton.setAttribute('aria-controls', 'ns-group-search');
  searchModes.append(nodeSearchButton, groupSearchButton);
  const searchFiltersButton = document.createElement('button');
  searchFiltersButton.type = 'button';
  searchFiltersButton.className = 'fg-search-filter-toggle';
  searchFiltersButton.textContent = '筛选';
  searchFiltersButton.setAttribute('aria-expanded', 'false');
  searchFiltersButton.setAttribute('aria-controls', 'ns-node-search-filters');
  const searchRow = document.createElement('div');
  searchRow.className = 'fg-search-row';
  searchRow.id = 'ns-node-search';
  const searchFilterControls = document.createElement('div');
  searchFilterControls.className = 'fg-search-filter-controls';
  searchFilterControls.id = 'ns-node-search-filters';
  searchFilterControls.hidden = true;
  searchFiltersButton.onclick = () => {
    const open = searchFilterControls.hidden;
    searchFilterControls.hidden = !open;
    searchFiltersButton.setAttribute('aria-expanded', String(open));
  };
  const fieldSelect = document.createElement('select');
  fieldSelect.setAttribute('aria-label', '搜索范围');
  ['全部', '名称', '标签', '内容'].forEach((t, i) => { const o = document.createElement('option'); o.value = ['all', 'name', 'tags', 'note'][i]; o.textContent = t; fieldSelect.appendChild(o); });
  const matchModeSelect = document.createElement('select');
  matchModeSelect.setAttribute('aria-label', '搜索匹配方式');
  ['包含', '开头', '结尾', '模糊'].forEach((t, i) => { const o = document.createElement('option'); o.value = ['contains', 'startsWith', 'endsWith', 'fuzzy'][i]; o.textContent = t; matchModeSelect.appendChild(o); });
  const modeSelect = document.createElement('select');
  modeSelect.setAttribute('aria-label', '搜索显示方式');
  ['高亮', '仅显示'].forEach((t, i) => { const o = document.createElement('option'); o.value = ['highlight', 'show'][i]; o.textContent = t; modeSelect.appendChild(o); });
  for (const [label, select] of [['范围', fieldSelect], ['匹配', matchModeSelect], ['画布', modeSelect]] as const) {
    const field = document.createElement('label');
    field.append(label, select);
    searchFilterControls.appendChild(field);
  }
  const searchQueryRow = document.createElement('div');
  searchQueryRow.className = 'fg-search-query';
  searchRow.appendChild(searchQueryRow);
  const searchInput = document.createElement('input');
  searchInput.type = 'text'; searchInput.placeholder = '搜索节点';
  searchInput.autocomplete = 'off';
  searchInput.enterKeyHint = 'search';
  searchInput.setAttribute('aria-label', '搜索当前空间');
  searchInput.setAttribute('role', 'combobox');
  searchInput.setAttribute('aria-autocomplete', 'list');
  searchInput.setAttribute('aria-controls', 'ns-search-results');
  searchInput.setAttribute('aria-expanded', 'false');
  searchQueryRow.appendChild(searchInput);
  const searchPrevBtn = document.createElement('button');
  searchPrevBtn.type = 'button'; searchPrevBtn.className = 'fg-search-nav'; searchPrevBtn.textContent = '↑'; searchPrevBtn.title = '上一个结果（Shift+Enter）';
  searchPrevBtn.setAttribute('aria-label', '上一个搜索结果');
  const searchNextBtn = document.createElement('button');
  searchNextBtn.type = 'button'; searchNextBtn.className = 'fg-search-nav'; searchNextBtn.textContent = '↓'; searchNextBtn.title = '下一个结果（Enter）';
  searchNextBtn.setAttribute('aria-label', '下一个搜索结果');
  const searchClearBtn = document.createElement('button');
  searchClearBtn.type = 'button'; searchClearBtn.className = 'fg-search-nav'; searchClearBtn.textContent = '×'; searchClearBtn.title = '清除搜索（Esc）';
  searchClearBtn.setAttribute('aria-label', '清除搜索');
  searchPrevBtn.hidden = searchNextBtn.hidden = searchClearBtn.hidden = true;
  searchQueryRow.append(searchPrevBtn, searchNextBtn, searchClearBtn);
  const searchStatus = document.createElement('span');
  searchStatus.className = 'fg-search-status';
  searchStatus.setAttribute('role', 'status');
  searchStatus.hidden = true;
  searchHeader.append(searchModes, searchFiltersButton, searchStatus);
  searchRow.appendChild(searchFilterControls);
  const searchResults = document.createElement('div');
  searchResults.className = 'fg-search-results';
  searchResults.id = 'ns-search-results';
  searchResults.setAttribute('role', 'listbox');
  searchResults.setAttribute('aria-label', '当前空间搜索结果');
  searchResults.hidden = true;
  const searchResultRowHeight = 56;
  const searchResultTrack = document.createElement('div');
  searchResultTrack.className = 'fg-search-result-track';
  searchResultTrack.setAttribute('role', 'presentation');
  searchResultTrack.style.setProperty('--ns-search-result-row-height', `${searchResultRowHeight}px`);
  searchResults.appendChild(searchResultTrack);
  searchRow.appendChild(searchResults);
  const groupSearchPanel = document.createElement('div');
  groupSearchPanel.className = 'fg-search-row';
  groupSearchPanel.id = 'ns-group-search';
  groupSearchPanel.hidden = true;
  const groupInput = document.createElement('input');
  groupInput.type = 'text';
  groupInput.placeholder = '搜索集合';
  groupInput.enterKeyHint = 'search';
  const groupDropdown = document.createElement('div');
  groupDropdown.className = 'fg-search-results fg-group-dropdown';
  groupSearchPanel.append(groupInput, groupDropdown);

  // --- 主要操作按钮行（始终可见）---
  const primaryRow = document.createElement('div');
  primaryRow.className = 'fg-shell-toolbar fg-editor-tools';
  editorShell.appendChild(primaryRow);

  // --- 操作栏下拉：低频工具 ---
  const toolbarSummaryClass = 'fg-toolbar-summary fg-action fg-shell-control';
  const controlsDetails = document.createElement('details');
  controlsDetails.className = 'fg-toolbar-panel fg-tools-panel';
  const controlsSum = document.createElement('summary');
  controlsSum.className = toolbarSummaryClass;
  controlsSum.textContent = '工具';
  controlsDetails.appendChild(controlsSum);
  const controlsDiv = document.createElement('div');
  controlsDiv.className = 'fg-toolbar-popover fg-tools-content';
  controlsDiv.append(searchHeader, searchRow, groupSearchPanel);
  controlsDetails.appendChild(controlsDiv);

  // --- 分屏布局 ---
  const dualPane: MultiPaneDOM = createMultiPaneLayout(appShell);
  const pixiContainer = dualPane.paneContainers[PANE_LEFT]; // pane 0 保持原名兼容
  const pane1Container = dualPane.paneContainers[PANE_RIGHT];

  // 统计栏
  const statsEl = document.createElement('div');
  statsEl.className = 'fg-status-line';
  statsEl.style.cssText = `position:fixed;right:10px;bottom:calc(4px + env(safe-area-inset-bottom,0px));z-index:${Z_STATS};font-size:${V('--fg-font-xs', '0.72em')};color:${V('--fg-text-muted','#aaa')};pointer-events:none;`;
  appShell.appendChild(statsEl);

  // 加载遮罩
  const loadingOverlay = document.createElement('div');
  loadingOverlay.className = 'fg-loading-overlay';
  loadingOverlay.style.cssText = `position:absolute;inset:0;z-index:${Z_LOADING};background:rgba(0,0,0,0.3);display:none;align-items:center;justify-content:center;font-size:1.2em;color:${V('--fg-text-muted','#999')};`;
  loadingOverlay.textContent = '加载中...';
  appShell.appendChild(loadingOverlay);

  // 多媒体覆盖层容器
  const mediaOverlayContainer = document.createElement('div');
  mediaOverlayContainer.className = 'fg-media-overlay-root';
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

  // --- 操作栏下拉：外观设置 ---
  const MINIMAP_BTN_SIZE = 30;
  const settingsDet = document.createElement('details');
  settingsDet.className = 'fg-toolbar-panel fg-appearance-panel';
  const settingsSum = document.createElement('summary');
  settingsSum.className = toolbarSummaryClass;
  settingsSum.textContent = '外观';
  settingsDet.appendChild(settingsSum);
  const setDiv = document.createElement('div');
  setDiv.className = 'fg-toolbar-popover fg-appearance-content';
  settingsDet.appendChild(setDiv);
  const CONSOLE_BTN_SIZE = 30;

  // --- 全局视图按钮（右下角，与图区自定义同行） ---
  const minimapBtn = document.createElement('button');
  minimapBtn.textContent = '◉';
  minimapBtn.title = '全局视图';
  minimapBtn.className = 'fg-glass fg-corner-tool';
  minimapBtn.style.cssText = `position:absolute;right:6px;bottom:calc(6px + env(safe-area-inset-bottom,0px));z-index:${Z_FLOATING_UI};width:${MINIMAP_BTN_SIZE}px;height:28px;padding:0;font-size:14px;line-height:1;display:flex;align-items:center;justify-content:center;`;
  appShell.appendChild(minimapBtn);

  // --- 控制台按钮（右下角，minimap 左边） ---
  const consoleBtn = document.createElement('button');
  consoleBtn.textContent = '>';
  consoleBtn.title = '控制台 (Ctrl+Shift+P)';
  consoleBtn.className = 'fg-glass fg-corner-tool';
  consoleBtn.style.cssText = `position:absolute;right:${CONSOLE_BTN_SIZE + 12}px;bottom:calc(6px + env(safe-area-inset-bottom,0px));z-index:${Z_FLOATING_UI};width:${CONSOLE_BTN_SIZE}px;height:28px;padding:0;font-size:14px;line-height:1;display:flex;align-items:center;justify-content:center;font-weight:bold;`;
  appShell.appendChild(consoleBtn);

  // --- 控制台面板 ---
  const consolePanel = document.createElement('div');
  consolePanel.className = 'fg-glass fg-console-panel';
  consolePanel.style.cssText = `position:absolute;left:var(--fg-shell-inset-inline, 12px);right:74px;bottom:42px;z-index:${Z_FLOATING_UI};display:none;padding:6px 8px;gap:4px;flex-direction:column;`;
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
          if (args.color) node.colorMode = 'custom';
          assignCreatedOrder(node, graph.nodes);
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
          const deleted = deleteNodesForPane(pane0 as unknown as PaneState, [found.id]);
          results.push(deleted ? `deleted: ${found.id}` : 'deletion blocked'); break;
        }
        case 'create_edge': {
          const src = graph.nodes.find((n: any) => n.id === args.source || n.label === args.source);
          const tgt = graph.nodes.find((n: any) => n.id === args.target || n.label === args.target);
          if (!src || !tgt) { results.push('source or target not found'); break; }
          saveUndo();
          const edge: any = { source: src.id, target: tgt.id, label: args.label || '', color: args.color || '#BFBFBF', lineStyle: args.linestyle || 'solid', arrow: args.arrow === 'forward', index: graph.edges.length };
          if (args.color) edge.colorMode = 'custom';
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
          const pane = pane0 as unknown as PaneState;
          const projectedIndex = projectedEdgeIndexForPane(pane, idx);
          const deleted = projectedIndex !== null && deleteEdgesForPane(pane, [projectedIndex]);
          results.push(deleted ? 'edge deleted' : 'deletion blocked'); break;
        }
        case 'create_graph': {
          const name = args.name || args.label;
          if (!name) { results.push('need "name" arg'); break; }
          const fn = name + '.json';
          if (openTabs.includes(fn)) { results.push(`"${name}" already open`); break; }
          await writeGraphData(fn, { nodes: [], edges: [], groups: [], settings: { ...DEFAULT_SETTINGS } });
          openTabs.push(fn); activeTab = fn;
          persistTabs(); syncSpaceNavigation(); refreshFileTree();
          await loadGraphData(fn);
          results.push(`created & opened: ${name}`); break;
        }
        case 'delete_graph': {
          const name = args.name || args.label;
          if (!name) { results.push('need "name" arg'); break; }
          graphRecovery(name).delete(); await adapter.deleteFile(name);
          openTabs = openTabs.filter(t => t !== name);
          if (activeTab === name) activeTab = openTabs[0] || '';
          persistTabs(); syncSpaceNavigation();
          if (activeTab) await loadGraphData(activeTab);
          results.push(`deleted: ${name}`); break;
        }
        case 'switch':
        case 'open': {
          const raw = args.name || args.label;
          if (!raw) { results.push('need "name" arg'); break; }
          const name = raw.endsWith('.json') ? raw : raw + '.json';
          if (!openTabs.includes(name)) openTabs.push(name);
          activeTab = name; persistTabs(); syncSpaceNavigation();
          await loadGraphData(name);
          results.push(`switched to: ${name}`); break;
        }
        case 'refresh': {
          await refreshFileTree(); syncSpaceNavigation();
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
    if ((e.target as Element)?.closest?.('.ns-home')) return;
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
    const focusedExtra = focusedPaneIndex > PANE_LEFT ? extraPanes[focusedPaneIndex - 1] : null;
    if (focusedExtra) {
      focusedExtra.themeAccentColor = acc; focusedExtra.themeAccentAltColor = alt;
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
  let graphStorageMountPath: string | null = null;
  let configuredGraphFolderRelative: string | null = null;
  let mountedStorageScope: string | null = null;
  let workspacePickerActive = false;
  let mountWritesPaused = false;
  const workspaceStateKey = (key: string) => mountedStorageScope === null
    ? key : `${key}:mount:${encodeURIComponent(mountedStorageScope)}`;
  const graphRecovery = (fileName: string) => createRecoveryStorage(fileName, localStorage, mountedStorageScope);
  const readRecoveryGraph = (fileName: string): GraphData | null => {
    try {
      const raw = graphRecovery(fileName).readSnapshot();
      return raw ? JSON.parse(raw) as GraphData : null;
    } catch { return null; }
  };
  let vaultIndex: VaultIndex | null = null;
  let refreshOpenResourceReferences: () => void = () => {};
  let hydrateGraphResourceReferencePreviews: (data: GraphData) => Promise<boolean> = async () => false;
  let ensureGraphResourceReferencePreviews: (data: GraphData) => void = () => {};
  let hydrateGraphSpaceReferences: (data: GraphData, ownerGraph: string) => Promise<boolean> = async () => false;
  let ensureGraphSpaceReferences: (data: GraphData, ownerGraph: string) => void = () => {};
  let refreshOpenSpaceReferences: (sourceGraph?: string) => Promise<void> = async () => {};
  let referenceVaultPathIntoFocusedGraph: (path: string, kind: VaultResourceKind) => Promise<void> = async () => {
    showToast('引用功能尚未就绪', 'warning', 2200);
  };
  const vaultViewportMemory = new VaultViewportMemory(localStorage);
  const capApp = isCapacitor();
  const isHarmony = !capApp && isHarmonyOS();

  // ---- 文件适配器（统一五平台 I/O） ----
  let adapter: FileAdapter = createStorageAdapter();
  let adapterScope: string | FileSystemDirectoryHandle = 'storage';
  const selectAdapter = () => {
    const ea = (window as any).electronAPI;
    const mountedPath = fileSystemMountPath && fileSystemMountPath !== 'graphs' ? fileSystemMountPath : null;
    const electronRoot = ea && mountedPath ? graphStorageMountPath || mountedPath : null;
    const handle = !ea && mountedPath ? getDirHandle() : null;
    const safMounted = mountedStorageScope?.startsWith('saf:') && safIsAvailable();
    const scope = safMounted ? 'saf' : electronRoot ? `electron:${electronRoot}` : handle ?? (capApp ? 'capacitor' : isHarmony ? 'harmony' : 'storage');
    if (scope === adapterScope) return;
    adapterScope = scope;
    if (scope === 'saf') adapter = createSAFAdapter();
    else if (electronRoot) adapter = createElectronAdapter(electronRoot);
    else if (handle) adapter = createFSAAdapter(() => handle);
    else if (capApp) adapter = createCapacitorAdapter();
    else if (isHarmony) adapter = createHarmonyAdapter();
    else adapter = createStorageAdapter();
  };
  const reinitAdapter = () => { selectAdapter(); };

  const clearTransientCategoryVisuals = (data: GraphData) => {
    for (const node of data.nodes || []) delete (node as any)._pieColors;
    delete (data as any)._categoryBoxes;
  };

  const repairGraphCreatedOrders = (data: GraphData): GraphData => {
    repairCreatedOrders(data.nodes || []);
    normalizeStructureNodeSizing(data);
    if (vaultIndex && data.settings?.sourceMode !== 'vault-readonly') {
      reconcileGraphResourceReferences(data, vaultIndex, fileSystemMountPath || vaultIndex.rootPath);
    }
    return data;
  };

  const vaultResourceForPath = (relativePath: string): VaultResource | null => {
    const normalized = normalizeVaultPath(relativePath);
    return [...(vaultIndex?.notes || []), ...(vaultIndex?.attachments || []), ...(vaultIndex?.graphs || [])]
      .find(resource => normalizeVaultPath(resource.path) === normalized) || null;
  };

  const readVaultGraphData = async (fileName: string): Promise<GraphData | null> => {
    const finishProjection = (data: GraphData) => repairGraphCreatedOrders(
      applyVaultProjectionDefaults(data, DEFAULT_SETTINGS, presetDefaults),
    );
    if (isVaultSpaceTabId(fileName)) {
      const spacePath = vaultSpacePathFromTabId(fileName);
      if (spacePath === null || !vaultIndex) return null;
      return finishProjection(vaultFolderToGraph(vaultIndex, spacePath, fileSystemMountPath || vaultIndex.rootPath));
    }
    const relativePath = vaultPathFromTabId(fileName);
    const ea = (window as any).electronAPI;
    if (!relativePath || !fileSystemMountPath || !ea) return null;
    const resource = vaultResourceForPath(relativePath);
    const absolutePath = joinVaultPath(fileSystemMountPath, relativePath);
    const kind = resource?.kind || (/\.md$/i.test(relativePath) ? 'markdown' : null);
    if (kind === 'markdown') {
      const raw = await ea.readFile(absolutePath);
      if (typeof raw !== 'string') return null;
      return finishProjection(markdownToGraph(
        relativePath,
        raw,
        resource || undefined,
        vaultIndex || undefined,
        fileSystemMountPath || vaultIndex?.rootPath || '',
      ));
    }
    if (kind === 'image' || kind === 'audio' || kind === 'video' || kind === 'pdf') {
      return finishProjection(attachmentToGraph(relativePath, absolutePath, kind));
    }
    return null;
  };

  const readGraphData = async (fileName: string, diskOnly = false): Promise<GraphData | null> => {
    if (isVaultLocationTabId(fileName)) return readVaultGraphData(fileName);
    const recovery = graphRecovery(fileName);
    const r = await adapter.readFile(fileName);
    if (r.ok && r.value) {
      if (!diskOnly && recovery.hasUnsynced()) {
        const useRecovery = await confirmAction(
          `“${fileName.replace(/\.json$/, '')}”有尚未同步到文件的恢复副本。`,
          { confirm: '使用恢复副本', cancel: '使用磁盘版本' },
        );
        if (useRecovery) {
          const snapshot = recovery.readSnapshot();
          if (snapshot) {
            const parsed = repairGraphCreatedOrders(JSON.parse(snapshot) as GraphData);
            clearTransientCategoryVisuals(parsed);
            return parsed;
          }
        } else {
          recovery.clearUnsynced();
        }
      }
      const parsed = repairGraphCreatedOrders(JSON.parse(r.value) as GraphData);
      const cached = diskOnly ? null : readRecoveryGraph(fileName);
      if (cached?.settings) parsed.settings = { ...cached.settings, ...(parsed.settings || {}) };
      clearTransientCategoryVisuals(parsed);
      return parsed;
    }
    if (diskOnly) return null;
    const stored = readRecoveryGraph(fileName);
    if (!stored) return null;
    if (recovery.hasUnsynced()) {
      const useRecovery = await confirmAction(
        `无法读取“${fileName.replace(/\.json$/, '')}”的磁盘版本，是否打开本地恢复副本？`,
        { confirm: '打开恢复副本', cancel: '取消' },
      );
      if (!useRecovery) return null;
      showToast('正在使用未同步的本地恢复副本', 'warning', 5000);
    }
    repairGraphCreatedOrders(stored);
    clearTransientCategoryVisuals(stored);
    return stored;
  };

  let lastSaveErrorAt = 0;
  const internalGraphWriteGuard = new InternalGraphWriteGuard();
  const reportSaveFailure = (fileName: string, detail: string) => {
    const now = Date.now();
    if (now - lastSaveErrorAt < 3000) return;
    lastSaveErrorAt = now;
    showToast(`“${fileName.replace(/\.json$/, '')}”保存失败：${detail}`, 'error', 6000);
  };

  const writeGraphSnapshot = async (fileName: string, snapshot: string, targetAdapter = adapter): Promise<boolean> => {
    if (isVaultLocationTabId(fileName)) return true;
    if (mountWritesPaused) return false;
    const recovery = graphRecovery(fileName);
    const result = await targetAdapter.writeFile(fileName, snapshot).catch(error => ({
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
    }));
    if (!result.ok || result.value !== true) {
      const recovered = recovery.writeSnapshot(snapshot) && recovery.markUnsynced();
      const recoveryStatus = recovered ? '，已保留恢复副本' : '，且无法写入恢复缓存';
      reportSaveFailure(fileName, `${result.ok ? '存储设备拒绝了写入' : result.error}${recoveryStatus}`);
      return false;
    }
    internalGraphWriteGuard.mark(fileName);
    recovery.writeSnapshot(snapshot);
    recovery.clearUnsynced();
    return true;
  };

  const writeGraphData = async (fileName: string, data: GraphData): Promise<boolean> =>
    writeGraphSnapshot(fileName, serializeGraphSnapshot(data, data.settings));

  const isNewGraphPathReserved = (path: string) => Boolean(runtimeRegistry.get(path) || graphRecovery(path).hasUnsynced());
  const writeNewGraph = async (destination: FileAdapter, path: string, data: GraphData) => {
    const canWrite = () => destination === adapter && !mountWritesPaused && !isNewGraphPathReserved(path);
    const result = await createFileWithFallback(destination, path, serializeGraphSnapshot(data, data.settings), canWrite);
    if (!result.ok) {
      throw new Error(canWrite() ? '存储未能新建空间' : '存储位置或目标文件已变更，请重试');
    }
    if (result.value === 'exists') throw new Error('已有同名空间，请重试');
  };

  // --- 标签页持久化 ---
  const TABS_KEY = 'fg-open-tabs';
  const ACTIVE_KEY = 'fg-active-tab';
  function persistTabs() {
    localStorage.setItem(workspaceStateKey(TABS_KEY), JSON.stringify(openTabs));
    localStorage.setItem(workspaceStateKey(ACTIVE_KEY), activeTab);
    // 持久化所有分屏窗格标签
    for (let i = 0; i < extraPanes.length; i++) {
      const ep = extraPanes[i];
      localStorage.setItem(workspaceStateKey(TABS_KEY + '-ep' + i), JSON.stringify(ep.openTabs));
      localStorage.setItem(workspaceStateKey(ACTIVE_KEY + '-ep' + i), ep.activeTab);
    }
  }
  function restoreTabs(): { tabs: string[]; active: string } | null {
    try {
      const raw = localStorage.getItem(workspaceStateKey(TABS_KEY));
      const active = localStorage.getItem(workspaceStateKey(ACTIVE_KEY));
      if (raw) {
        const tabs = JSON.parse(raw);
        if (Array.isArray(tabs) && tabs.length > 0) return { tabs, active: active || tabs[0] };
      }
    } catch {}
    return null;
  }

  const replaceTabPath = (tabs: string[], oldPath: string, newPath: string): string[] =>
    [...new Set(tabs.map(tab => tab === oldPath ? newPath : tab))];

  const renameOpenFile = (oldPath: string, newPath: string) => {
    openTabs = replaceTabPath(openTabs, oldPath, newPath);
    if (activeTab === oldPath) activeTab = newPath;
    if (dirtyTabs.delete(oldPath)) dirtyTabs.add(newPath);
    for (const pane of extraPanes) {
      pane.openTabs = replaceTabPath(pane.openTabs, oldPath, newPath);
      if (pane.activeTab === oldPath) pane.activeTab = newPath;
      if (pane.dirtyTabs.delete(oldPath)) pane.dirtyTabs.add(newPath);
    }
  };

  const removeOpenFile = async (path: string) => {
    const fallback = _flatTreePaths.find(name => name !== path)
      ?? (path === '未命名.json' ? '未命名 2.json' : '未命名.json');
    openTabs = openTabs.filter(tab => tab !== path);
    dirtyTabs.delete(path);
    if (activeTab === path) {
      if (openTabs.length === 0) openTabs.push(fallback);
      activeTab = openTabs[openTabs.length - 1];
      await loadGraphData(activeTab);
    }
    for (const pane of extraPanes) {
      pane.openTabs = pane.openTabs.filter(tab => tab !== path);
      pane.dirtyTabs.delete(path);
      if (pane.activeTab !== path) continue;
      if (pane.openTabs.length === 0) pane.openTabs.push(fallback);
      await loadGraphForPane(pane, pane.openTabs[pane.openTabs.length - 1]);
    }
  };

  const migrateOpenFile = async (oldPath: string, newPath: string, operation: () => Promise<Result<boolean>>) => {
    if (oldPath === newPath) return true;
    const destinationRuntime = runtimeRegistry.get(newPath);
    if (destinationRuntime && destinationRuntime !== runtimeRegistry.get(oldPath)) {
      showToast(`目标文件已打开：${newPath}`, 'error');
      return false;
    }
    const runtime = runtimeRegistry.get(oldPath);
    const oldRecovery = graphRecovery(oldPath);
    const hadUnsyncedRecovery = oldRecovery.hasUnsynced();
    const data = runtime?.graph ?? await readGraphData(oldPath);
    const finishRuntimeOperation = () => {
      if (!runtime) return;
      runtime.fileOperationActive = false;
      if (!runtime.dirty || runtime.externalConflict) return;
      runtime.cancelPendingSave();
      runtime.saveTimeout = setTimeout(async () => {
        runtime.saveTimeout = null;
        await saveRuntimeNow(runtime);
      }, 300);
    };
    if (runtime?.fileOperationActive) return false;
    if (runtime) {
      runtime.fileOperationActive = true;
      if (!await saveRuntimeNow(runtime, undefined, true)) {
        finishRuntimeOperation();
        return false;
      }
      await runtime.invalidateSaves();
    }
    try {
      const result = await operation();
      if (!result.ok || result.value !== true) {
        showToast(`文件操作失败：${result.ok ? '存储设备拒绝了操作' : result.error}`, 'error', 6000);
        return false;
      }
      if (vaultIndex?.graphRootRelative) {
        const graphPrefix = normalizeVaultPath(vaultIndex.graphRootRelative).replace(/\/$/, '');
        const oldVaultPath = `${graphPrefix}/${normalizeVaultPath(oldPath)}`;
        const newVaultPath = `${graphPrefix}/${normalizeVaultPath(newPath)}`;
        for (const openRuntime of runtimeRegistry.values()) {
          if (rewriteGraphResourceReferencePaths(openRuntime.graph, oldVaultPath, newVaultPath) > 0) {
            scheduleSaveForRuntime(openRuntime);
          }
        }
      }
      for (const openRuntime of runtimeRegistry.values()) {
        if (rewriteSpaceReferenceGraphIds(openRuntime.graph, oldPath, newPath) > 0) {
          scheduleSaveForRuntime(openRuntime);
        }
      }
      if (data) {
        const targetRecovery = graphRecovery(newPath);
        targetRecovery.writeSnapshot(serializeGraphSnapshot(data, data.settings));
        if (hadUnsyncedRecovery) targetRecovery.markUnsynced();
      }
      oldRecovery.delete();
      if (runtimeRegistry.get(oldPath)) runtimeRegistry.rename(oldPath, newPath);
      renameOpenFile(oldPath, newPath);
      syncSpaceNavigation();
      persistTabs();
      sidebar.syncActiveFile(activeTab);
      return true;
    } finally {
      finishRuntimeOperation();
    }
  };

  const openVaultResourceInObsidian = async (path: string, heading?: string) => {
    const ea = (window as any).electronAPI;
    if (!ea?.openInObsidian || !fileSystemMountPath) return;
    const result = await ea.openInObsidian(fileSystemMountPath, path, heading);
    if (result?.error) showToast(`无法打开原文：${result.error}`, 'error', 5000);
  };

  const deleteSpaceFile = async (path: string, expectedContents?: string) => {
    if (blockForTextDraft('删除文件')) return false;
    const destination = adapter;
    const runtime = runtimeRegistry.get(path);
    if (runtime?.fileOperationActive) return false;
    if (runtime) {
      runtime.fileOperationActive = true;
      await runtime.invalidateSaves();
    }
    const remove = async (): Promise<Result<boolean>> => {
      if (expectedContents !== undefined) {
        const current = await destination.readFile(path);
        if (!current.ok) return current;
        if (current.value !== expectedContents) return { ok: false, error: '文件已变化，请重新确认' };
      }
      if (destination !== adapter || mountWritesPaused) return { ok: false, error: '存储位置已切换' };
      return destination.deleteFile(path, expectedContents === undefined ? undefined : { recursive: false });
    };
    const result = await remove();
    if (!result.ok || result.value !== true) {
      if (runtime) {
        runtime.fileOperationActive = false;
        if (runtime.dirty && destination === adapter) scheduleSaveForRuntime(runtime);
      }
      showToast(`删除失败：${result.ok ? '存储设备拒绝了操作' : result.error}`, 'error', 6000);
      return false;
    }
    await removeOpenFile(path);
    runtimeRegistry.delete(path);
    graphRecovery(path).delete();
    syncSpaceNavigation();
    persistTabs();
    await refreshFileTree();
    return true;
  };

  const renameSpaceFile = async (oldPath: string, name: string) => {
    if (blockForTextDraft('重命名文件')) return false;
    const stem = name.trim().replace(/\.json$/i, '').trim();
    if (!stem || /^\.|[<>:"/\\|?*\u0000-\u001f\u007f]|\.$/u.test(stem)) {
      showToast('请输入有效的文件名', 'warning');
      return false;
    }
    const normalizedName = stem + '.json';
    const newPath = replacePathName(oldPath, normalizedName);
    if (oldPath === newPath) return false;
    const destination = adapter;
    const renamed = await migrateOpenFile(oldPath, newPath, async () => {
      if (isNewGraphPathReserved(newPath)) return { ok: false, error: '目标名称已存在' };
      const existing = await destination.readFile(newPath);
      if (!existing.ok) return existing;
      if (existing.value !== null) return { ok: false, error: '目标名称已存在' };
      if (destination !== adapter || mountWritesPaused) return { ok: false, error: '存储位置已切换' };
      return destination.renameFile(oldPath, normalizedName);
    });
    if (renamed) await refreshFileTree();
    return renamed;
  };

  const copySpaceFile = async (path: string) => {
    const destination = adapter;
    const content = runtimeRegistry.get(path)?.graph ?? await readGraphData(path);
    if (!content) throw new Error('无法读取源空间');
    const result = await destination.suggestCopyName(path);
    if (!result.ok) throw new Error(result.error);
    await writeNewGraph(destination, result.value, content);
    await refreshFileTree();
    return result.value;
  };

  const sidebar = createSidebar(appShell, {
    onSelectFile: async (path) => {
      if (blockForTextDraft('切换文件')) return;
      await openTab(path);
    },
    onNewFile: async (path) => {
      if (blockForTextDraft('新建并切换文件')) return;
      const presetSettings = Object.keys(presetDefaults).length > 0 ? { ...DEFAULT_SETTINGS, ...presetDefaults } : { ...DEFAULT_SETTINGS };
      const empty: GraphData = { nodes: [], edges: [], groups: [], settings: presetSettings };
      await writeGraphData(path, empty);
      await refreshFileTree();
      await openTab(path);
    },
    onDeleteFile: path => { void deleteSpaceFile(path).catch(reportWorkbenchActionError); },
    onRenameFile: (path, name) => { void renameSpaceFile(path, name).catch(reportWorkbenchActionError); },
    onCopyFile: path => { void copySpaceFile(path).catch(reportWorkbenchActionError); },
    onNewFolder: async (_path) => {
      await adapter.createDirectory(_path);
      await refreshFileTree();
    },
    onMoveFile: async (src, dstDir) => {
      if (blockForTextDraft('移动文件')) return;
      const name = src.split('/').pop()!;
      const dstPath = joinPath(dstDir, name);
      if (src === dstPath) return;
      if (await migrateOpenFile(src, dstPath, () => adapter.moveFile(src, dstDir))) {
        await refreshFileTree();
      }
    },
    onSelectVaultFolder: async (path) => {
      if (blockForTextDraft('切换空间')) return;
      await openTab(vaultSpaceTabId(path));
    },
    onSelectVaultResource: async (path) => {
      if (blockForTextDraft('切换文件')) return;
      await openTab(vaultTabId(path));
    },
    onEditVaultMarkdown: desktopApi?.writeFile ? path => {
      if (blockForTextDraft('编辑原文')) return;
      const resource = vaultResourceForPath(path);
      if (resource?.kind !== 'markdown') return;
      void openMarkdownSourceEditor(focusedPaneState(), { label: resource.title || resource.name, sourceRef: { path: resource.path, kind: 'markdown' } })
        .catch(error => showToast(`打开原文失败：${error instanceof Error ? error.message : String(error)}`, 'error'));
    } : undefined,
    onReferenceVaultFolder: path => { void referenceVaultPathIntoFocusedGraph(path, 'folder'); },
    onReferenceVaultResource: path => {
      const kind = vaultResourceForPath(path)?.kind;
      if (kind) void referenceVaultPathIntoFocusedGraph(path, kind);
      else showToast('找不到这个 Vault 资源', 'warning', 3000);
    },
    onOpenVaultResourceInObsidian: path => { void openVaultResourceInObsidian(path); },
    onApplyPreset: () => { settingsPanel.show(); },
    onResetPresets: () => { settingsPanel.show(); },
    onOpenFolder: () => {},
  }, editorNavigation);

  // 侧边栏玻璃效果
  // createSidebar() 已经设置好折叠状态和对应宽度；这里只补充外壳，避免覆盖
  // is-collapsed 后造成“看起来展开、按钮却提示展开”的状态错位。
  sidebar.sidebar.classList.add('fg-glass');
  Object.assign(sidebar.sidebar.style, {
    position: 'absolute',
    left: 'var(--fg-shell-inset-inline, 12px)',
    top: 'calc(var(--fg-editor-shell-bottom, 50px) + 7px)',
    height: 'auto',
    zIndex: String(Z_FLOATING_UI + 1),
    overflow: 'hidden',
  });

  // 文件树扁平路径缓存（Shift+上下导航用）
  let _flatTreePaths: string[] = [];
  let fileTreeRevision = 0;
  let fileTreeAdapter: FileAdapter | null = null;

  const buildFileTree = (paths: readonly string[]): FileEntry[] => {
    const entries: FileEntry[] = [];
    const directories = new Map<string, FileEntry[]>([['', entries]]);
    for (const path of paths) {
      const parts = path.split('/');
      const fileName = parts.pop()!;
      let prefix = '';
      let parent = entries;
      for (const part of parts) {
        prefix = joinPath(prefix, part);
        let children = directories.get(prefix);
        if (!children) {
          children = [];
          directories.set(prefix, children);
          parent.push({ name: part, kind: 'directory', children });
        }
        parent = children;
      }
      parent.push({ name: fileName, kind: 'file', children: [] });
    }
    for (const group of directories.values()) group.sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1);
    return entries;
  };

  const refreshVaultIndex = async (): Promise<VaultIndex | null> => {
    const ea = (window as any).electronAPI;
    if (!ea?.scanVault || !fileSystemMountPath || fileSystemMountPath === 'graphs') {
      vaultIndex = null;
      graphStorageMountPath = null;
      sidebar.updateVaultIndex(null);
      syncVaultSpaceBreadcrumb();
      return null;
    }
    const scanned = await ea.scanVault(fileSystemMountPath, configuredGraphFolderRelative || undefined);
    if (!scanned || scanned.error) {
      vaultIndex = null;
      graphStorageMountPath = fileSystemMountPath;
      sidebar.updateVaultIndex(null);
      syncVaultSpaceBreadcrumb();
      return null;
    }
    vaultIndex = scanned as VaultIndex;
    configuredGraphFolderRelative = vaultIndex.graphRootRelative || null;
    graphStorageMountPath = vaultIndex.graphRootPath || fileSystemMountPath;
    if (vaultIndex.isObsidianVault && graphStorageMountPath && !(await ea.exists(graphStorageMountPath))) {
      const created = await ea.mkdir(graphStorageMountPath);
      if (created?.error) {
        showToast(`无法创建图文件夹：${created.error}`, 'error', 6000);
      }
    }
    sidebar.updateVaultIndex(vaultIndex);
    refreshOpenResourceReferences();
    syncVaultSpaceBreadcrumb();
    updateOpenWorkbench(true);
    return vaultIndex;
  };

  const refreshFileTree = async (invalidateCovers = false) => {
    reinitAdapter();
    const destination = adapter;
    const revision = ++fileTreeRevision;
    const result = await destination.listFiles();
    if (destination !== adapter || revision !== fileTreeRevision) return;
    if (!result.ok && destination === fileTreeAdapter) return;
    fileTreeAdapter = destination;
    _flatTreePaths = result.ok ? userFacingGraphPaths(result.value) : [];
    sidebar.updateFileTree(buildFileTree(_flatTreePaths), activeTab);
    updateOpenWorkbench(invalidateCovers);
  };
  window.addEventListener('storage', event => {
    if ((adapterScope === 'storage' || adapterScope === 'harmony') && event.storageArea === localStorage
      && (event.key === null || event.key.startsWith(GRAPH_STORAGE_PREFIX))) void refreshFileTree();
  });

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
      if (Array.from(files).some(file => file.name.toLowerCase().endsWith(SPACE_BACKUP_EXTENSION))) {
        showToast('请选择「工具 → 从备份恢复」打开空间备份', 'info', 5000);
        return;
      }
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
        displayUrl = toFileUrl(displayUrl);
      }
      showMedia(mediaOverlayContainer, nodeId, n.label || nodeId, type, displayUrl, mediaAccentForNode(n, getTheme(paneGraph.settings?.graphTheme || DEFAULT_GRAPH_THEME)), () => {
        const sp = px.viewport.toScreen(sn.x, sn.y);
        const rect = px.app.canvas.getBoundingClientRect();
        return { x: rect.left + sp.x, y: rect.top + sp.y };
      }, () => { px.viewport.pause = true; }, () => { px.viewport.pause = false; }, false, () => {
        manuallyOpenedMediaIds.delete(nodeId);
        draw();
      }, 'reader', undefined, mediaTextEditorForPane(
        allPaneOwners().find(owner => panePixi(owner) === px), n, n.mediaType ? 'mediaUrl' : 'note'));
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
  let reloadVaultResourceViews: (tabId: string) => Promise<void> = async () => {};

  async function handleExternalVaultChange(relativePath: string) {
    const normalized = normalizeVaultPath(relativePath);
    if (!normalized || (!/\.md$/i.test(normalized) && !vaultResourceForPath(normalized))) return;
    const key = `vault:${normalized}`;
    const now = Date.now();
    const last = _extChangeLast.get(key) || 0;
    if (now - last < EXT_CHANGE_DEBOUNCE) return;
    _extChangeLast.set(key, now);
    await markdownSourceEditor?.handleExternalChange(normalized);
    await refreshVaultIndex();
    const affectedTabs = new Set<string>([vaultTabId(normalized)]);
    for (const runtime of runtimeRegistry.values()) {
      // A single note edit can change another open note's backlinks as well as
      // every open folder projection. Refresh only live Vault views, not the
      // user's writable NodeSpace graphs.
      if (isVaultLocationTabId(runtime.fileName)) affectedTabs.add(runtime.fileName);
    }
    for (const tabId of affectedTabs) await reloadVaultResourceViews(tabId);
  }

  async function handleExternalGraphChange(graphName: string, fromVite = false) {
    graphName = normalizeVaultPath(graphName);
    const graphPrefix = normalizeVaultPath(vaultIndex?.graphRootRelative || '');
    if (graphPrefix && graphName.startsWith(`${graphPrefix}/`)) graphName = graphName.slice(graphPrefix.length + 1);
    // fs.watch/HMR delivers writes with a delay. Do not feed our own save back
    // through the external-merge path, which would rebuild the active layout.
    if (internalGraphWriteGuard.shouldIgnore(graphName)) return;
    if (blockExternalForTextDraft(graphName)) return;
    // 防抖：500ms 内同一图不重复处理（与 electron main.cjs 的 fs.watch 防抖一致）
    const now = Date.now();
    const last = _extChangeLast.get(graphName) || 0;
    if (now - last < 500) return;
    _extChangeLast.set(graphName, now);
    setTimeout(() => {
      if (_extChangeLast.get(graphName) === now) _extChangeLast.delete(graphName);
    }, EXT_CHANGE_DEBOUNCE);

    void refreshFileTree(true);

    // strip .json 后缀，因为 activeTab 可能带后缀（来自文件系统）也可能不带
    const clean = (s: string) => s.replace(/\.json$/, '');
    const gnClean = clean(graphName);

    // 检查该图是否在任意窗格中被打开
    const targetRuntime = runtimeRegistry.values().find(runtime => clean(runtime.fileName) === gnClean) ?? null;
    if (!targetRuntime) {
      await refreshOpenSpaceReferences(graphName);
      return;
    }

    if (targetRuntime.fileOperationActive) return;
    const hadLocalChanges = targetRuntime.dirty || targetRuntime.savePending || targetRuntime.externalConflict;
    targetRuntime.markExternalConflict();
    const oldSaves = targetRuntime.invalidateSaves();
    const reloadGeneration = targetRuntime.saveGeneration;
    const revision = targetRuntime.changeRevision;
    await oldSaves;
    const canApplyExternalVersion = () => targetRuntime.saveGeneration === reloadGeneration
      && targetRuntime.changeRevision === revision
      && !targetRuntime.textEditActive && !targetRuntime.fileOperationActive;
    if (!canApplyExternalVersion()) return;
    if (hadLocalChanges) {
      const useDisk = await confirmAction(
        `“${targetRuntime.fileName.replace(/\.json$/, '')}”在本地和磁盘上都已修改。`,
        { confirm: '使用磁盘版本', cancel: '保留本地版本' },
      );
      if (!useDisk) {
        showToast('已保留本地版本；自动保存已暂停，请手动保存后选择是否覆盖磁盘', 'warning', 6000);
        syncSpaceNavigation();
        return;
      }
    }
    if (!canApplyExternalVersion()) return;
    let newData: GraphData | null = null;
    try {
      if (fromVite) {
        const response = await fetch(`/api/graph/${encodeURIComponent(graphName)}`);
        if (response.ok) newData = repairGraphCreatedOrders(await response.json());
      } else {
        newData = await readGraphData(targetRuntime.fileName, true);
      }
      if (newData) await hydrateGraphSpaceReferences(newData, graphName);
    } catch { newData = null; }
    if (!canApplyExternalVersion()) return;
    if (!newData) {
      showToast('无法读取外部版本，已保留本地内容', 'error', 5000);
      return;
    }
    targetRuntime.undoManager?.pushSnapshot?.(targetRuntime.graph);
    const paneModesBeforeReload = new Map(extraPanes.filter(owner => owner.runtime === targetRuntime)
      .map(owner => [owner, owner.activeMode]));
    const finishExternalUpdate = () => {
      targetRuntime.markSaved();
      targetRuntime.clearExternalConflict();
      graphRecovery(targetRuntime.fileName).clearUnsynced();
      clearRuntimeDirty(targetRuntime);
      runtimeRegistry.prune(targetRuntime);
      syncSpaceNavigation();
    };

    // ---- 主窗格：动画热更新 ----
    if (primaryRuntime === targetRuntime) {
      const primaryModeBeforeReload = activeMode;
      targetRuntime.cancelPendingSave();
      saveTimeout = null;

      // 1) 保存旧状态快照
      const oldNodes = new Map<string, { x: number; y: number }>(
        graph.nodes.map(n => [n.id, { x: n.x, y: n.y }])
      );

      // 3) 计算差异
      const newIds = new Set((newData.nodes || []).map(n => n.id));
      const oldIds = new Set(graph.nodes.map(n => n.id));
      const addedNodeIds = new Set((newData.nodes || []).filter(n => !oldIds.has(n.id)).map(n => n.id));
      const removedNodeIds = graph.nodes.filter(n => !newIds.has(n.id)).map(n => n.id);
      const changedNodes = (newData.nodes || []).filter(n => {
        const old = oldNodes.get(n.id);
        return old && (old.x !== n.x || old.y !== n.y);
      });
      // 4) 计算差异（仅用于动画决策，不对节点做 dying 标记）（仅用于动画决策，不对节点做 dying 标记）

      // 5) undo 快照已按目标 runtime 推送，避免依赖当前焦点窗格。

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
      normalizeStructureRelations(graph);
      const addedNodes = graph.nodes.filter(node => addedNodeIds.has(node.id));
      refreshStructureViews(primaryRuntime);

      // 7) 应用 settings
      if (newData.settings) {
        const s = newData.settings;
        primaryRuntime.graph.settings = s;
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
        // A content refresh must not steal the live pane's layout choice. The
        // disk setting is used when opening a graph, not while that graph is in use.
        layoutMode = primaryModeBeforeReload ?? ((s as any).layoutMode || layoutMode);
        gridSnapEnabled = s.gridSnap ?? gridSnapEnabled;
        partialGridSnap = s.partialGridSnap ?? partialGridSnap;
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
        for (const owner of extraPanes) {
          if (owner.runtime !== primaryRuntime) continue;
          const retainedMode = paneModesBeforeReload.get(owner) ?? owner.activeMode;
          applyPaneSettings(owner, s);
          owner.activeMode = retainedMode;
        }
      }

      if (primaryModeBeforeReload) {
        activeMode = primaryModeBeforeReload;
        layoutMode = primaryModeBeforeReload;
        primaryRuntime.graph.settings = {
          ...DEFAULT_SETTINGS,
          ...(primaryRuntime.graph.settings || {}),
          layoutMode: primaryModeBeforeReload,
        };
      }

      // Automatic layout owns a static simulation whose node array may be the
      // graph array itself. Incrementally pushing into it would append every
      // externally-added node twice. Rebuild the cheap static source instead.
      if (activeMode === 'auto') {
        simManager.setStaticMode(true);
        simManager.initStatic();
        activateSemanticLayoutForPane(pane0 as unknown as PaneState, false);
        finishExternalUpdate();
        draw();
        await refreshOpenSpaceReferences(graphName);
        return;
      }

      // Presentation layouts are derived views, just like semantic auto. A
      // content refresh should recompute that view without turning it into a
      // force simulation or changing the selected mode.
      if (activeMode !== 'force') {
        if (activeMode === 'tree') {
          applyTreeLayoutV3();
        } else if (activeMode === 'radial') {
          const projection = getStructureProjection(graph);
          computeRadialLayout(projection.nodes, projection.edges);
          simManager.setStaticMode(true);
          simManager.initStatic();
          startStarLoop();
        } else if (coordinateLayoutModes.has(activeMode)) {
          pane0.layout.onGraphChanged();
        } else {
          simManager.setStaticMode(true);
          simManager.initStatic();
        }
        finishExternalUpdate();
        draw();
        await refreshOpenSpaceReferences(graphName);
        return;
      }

      // 8) 增量更新：先保存目标位置，再把节点放到视口中心，推入 sim
      const sim = simManager.getSim();
      const vp = pixi?.viewport;
      const vcx = vp?.center.x ?? gw / 2, vcy = vp?.center.y ?? gh / 2;
      // 先保存目标（从 newData 中取，此时 graph.nodes 已 in-place 更新但尚未移动到中心）
      const addedTargets = new Map<string, { x: number; y: number }>();
      for (const n of addedNodes) {
        if (!n.fixed) {
          addedTargets.set(n.id, { x: n.x, y: n.y });
          n.x = vcx; n.y = vcy; n.fx = vcx; n.fy = vcy;
        }
        if (!sim) continue;
        const sn = { ...n, _isNew: true, fx: n.x, fy: n.y };
        const currentNodes = sim.nodes();
        currentNodes.push(sn);
        sim.nodes(currentNodes);
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
          if (primaryRuntime !== targetRuntime) return;
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
      if (addedTargets.size > 0) {
        startNodeAnimation({
          nodes: graph.nodes,
          simNodes: sim?.nodes() || [],
          getSource: () => ({ x: vcx, y: vcy }),
          getTarget: n => {
            if (primaryRuntime !== targetRuntime || targetRuntime.saveGeneration !== reloadGeneration || simManager.getSim() !== sim) return null;
            if (n.fixed || simManager.getDragNode() === n.id) addedTargets.delete(n.id);
            return addedTargets.get(n.id) ?? null;
          },
          duration: 800,
          easing: EASING.easeOut,
          onFrame: () => draw(),
          onComplete: () => {
            // 动画结束，新节点保持固定，用户拖拽后自然释放
            draw();
          },
        });
      }

      // 外部版本已成为当前权威数据，不再保留本地 dirty 标记。
      finishExternalUpdate();

      // 11) 最终渲染
      draw();
      await refreshOpenSpaceReferences(graphName);
      return;
    }

    // ---- 非主窗格：原地更新共享 runtime，再刷新所有 owner 的 simulation ----
    {
      const saved = newData;
      targetRuntime.graph.nodes.length = 0;
      targetRuntime.graph.nodes.push(...(saved.nodes || []));
      targetRuntime.graph.edges.length = 0;
      targetRuntime.graph.edges.push(...(saved.edges || []).map((edge: any) => ({
        ...edge,
        source: typeof edge.source === 'object' ? edge.source.id : edge.source,
        target: typeof edge.target === 'object' ? edge.target.id : edge.target,
      })));
      targetRuntime.graph.groups.length = 0;
      targetRuntime.graph.groups.push(...(saved.groups || []));
      targetRuntime.graph.settings = saved.settings;
      normalizeStructureRelations(targetRuntime.graph);
      refreshStructureViews(targetRuntime);
      const initializedSims = new Set<any>();
      if (primaryRuntime === targetRuntime) {
        if (activeMode === 'auto') {
          simManager.setStaticMode(true);
          simManager.initStatic();
          activateSemanticLayoutForPane(pane0, false);
        } else if (activeMode === 'force') {
          simManager.setStaticMode(false);
          simManager.initSim();
        } else {
          simManager.setStaticMode(true);
          simManager.initStatic();
          pane0.layout.onGraphChanged();
        }
        initializedSims.add(simManager);
      }
      for (const owner of extraPanes) {
        if (owner.runtime !== targetRuntime) continue;
        const retainedMode = paneModesBeforeReload.get(owner) ?? owner.activeMode;
        if (saved.settings) applyPaneSettings(owner, saved.settings);
        owner.activeMode = retainedMode;
        const ownerSim = owner.simManager;
        if (retainedMode === 'auto') {
          if (!initializedSims.has(ownerSim)) {
            ownerSim?.setStaticMode(true);
            ownerSim?.initStatic();
            initializedSims.add(ownerSim);
          }
          activateSemanticLayoutForPane(owner, false);
        } else if (retainedMode === 'force') {
          if (!initializedSims.has(ownerSim)) {
            ownerSim?.setStaticMode(false);
            ownerSim?.initSim();
            initializedSims.add(ownerSim);
          }
        } else {
          if (!initializedSims.has(ownerSim)) {
            ownerSim?.setStaticMode(true);
            ownerSim?.initStatic();
            initializedSims.add(ownerSim);
          }
          owner.layout.onGraphChanged();
        }
      }
      finishExternalUpdate();
      draw();
      await refreshOpenSpaceReferences(graphName);
    }
  }

  function clearPaneLayout(pane: Pick<PaneState, 'layout' | 'pixi' | 'activeMode' | 'structureBoundaryShapes' | 'hoverStructureId' | 'membershipDragPreview' | 'membershipDragSession'>) {
    clearMembershipDragPreview(pane);
    pane.layout.clear();
    pane.activeMode = 'auto';
    clearPaneStructureBoundaries(pane);
    if (pane.pixi) {
      clearCards(pane.pixi.cardLayer);
      clearBlobLayer(pane.pixi);
    }
  }

  const coordinateLayoutModes = new Set(['cardgrid', 'category', 'fullcat']);
  const prepareRuntimeForSharing = (runtime: GraphRuntime) => {
    if (primaryRuntime === runtime && coordinateLayoutModes.has(activeMode)) clearPaneLayout(pane0);
    for (const owner of extraPanes) {
      if (owner.runtime === runtime && coordinateLayoutModes.has(owner.activeMode)) clearPaneLayout(owner);
    }
  };

  let exitStructureForPane: (pane: PaneState, fit?: boolean) => boolean = () => false;
  let refreshStructureViews: (runtime: GraphRuntime) => void = () => {};
  let activateSemanticLayoutForPane: (pane: PaneState | any, animate?: boolean) => void = () => {};
  let refreshSemanticLensForPane: (pane: PaneState | any) => void = () => {};
  let openLocalContextForPane: (pane: PaneState, nodeId: string) => void = () => {};
  let backLocalContextForPane: (pane: PaneState) => void = () => {};
  let closeLocalContextForPane: (pane: PaneState) => void = () => {};
  let jumpLocalContextForPane: (pane: PaneState, pathIndex: number) => void = () => {};
  let syncLocalContextNavigator: (pane: PaneState) => void = () => {};
  let expandCrossSpaceLocalContextForPane: (pane: PaneState, nodeId: string) => Promise<void> = async () => {};

  // ===== 图加载函数 =====
  async function loadGraphData(fileName: string) {
    exitStructureForPane(pane0 as unknown as PaneState);
    clearPaneStructureBoundaries(pane0 as unknown as PaneState);
    sharedState.hoverNodeId = null;
    sharedState.focusHoverNodeId = null;
    clearPaneLayout(pane0);
    pane0.spaceFocusNodeIds = null;
    pane0.localContext = null;
    pane0.localContextNavigator?.update(null, () => '');
    pane0.localContextProjection?.simManager?.getSim?.()?.stop?.();
    pane0.localContextProjection = null;
    const ownsLoad = beginPaneGraphLoad(pane0 as unknown as PaneState, fileName);
    loadingOverlay.style.display = 'flex';
    activeTab = fileName;
    const isCurrent = () => {
      if (!ownsLoad()) return false;
      if (activeTab === fileName) return true;
      loadingOverlay.style.display = 'none';
      return false;
    };
    updateGwGh();
    // 先停掉旧模拟（仅当不与其他窗格共享时，否则会影响另一窗格）
    if (simManager !== simManager1 && !extraSims.slice(1).some(es => es === simManager)) {
      simManager.getSim()?.stop();
    }
    // 清除旧节点精灵
    if (pixi) { clearBlobLayer(pixi); for (const c of pixi.nodeLayer.children.slice()) c.destroy({ children: true }); pixi.nodeLayer.removeChildren(); for (const c of pixi.edgeLayer.children.slice()) c.destroy({ children: true }); pixi.edgeLayer.removeChildren(); }
    nodeSprites.clear(); clearGridCache();

    // 检查是否已有其他窗格持有同文件 → 共享完整文档运行时
    const previousRuntime = primaryRuntime;
    const existing = findExistingForFile(fileName, previousRuntime);
    const sharing = !!existing;
    runtimeRegistry.release(previousRuntime, pane0);
    primaryRuntime = runtimeRegistry.acquire(fileName, pane0, () => existing ?? new GraphRuntime(fileName, { nodes: [], edges: [], groups: [] }, new UndoManager()));
    graph = primaryRuntime.graph;
    undoManager = primaryRuntime.undoManager;
    if (existing) {
      prepareRuntimeForSharing(existing);
      simManager = primaryRuntime.simManager;
    } else {
      simManager = createSimManager(graph, () => gw, () => gh,
        () => linkDist, () => linkStr, () => charge, () => centerS,
        () => collideR, () => groupBound,
        () => alphaTarget, () => heatingTime,
        () => getCollapsedHierarchyHiddenNodeIds(graph),
        () => draw()
      );
      primaryRuntime.simManager = simManager;
      const saved = await readGraphData(fileName);
      if (!isCurrent()) return;
      if (isBuiltin(fileName)) {
        // 首次从硬编码加载；后续从 localStorage 读取用户的修改
        if (saved && saved.nodes && saved.nodes.length > 0) {
          graph.nodes = saved.nodes;
          graph.edges = (saved.edges || []).map((e: any) => { const { _createdAt, _dyingAt, ...c } = e; return { ...c, source: typeof c.source === 'object' ? c.source.id : c.source, target: typeof c.target === 'object' ? c.target.id : c.target }; });
          graph.groups = saved.groups || [];
          graph.settings = saved.settings;
        } else {
          const builtin = repairGraphCreatedOrders(JSON.parse(JSON.stringify(BUILTIN_GRAPHS[fileName])));
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
    if (!isCurrent()) return;
    graph.settings = { ...DEFAULT_SETTINGS, ...(graph.settings || {}) };
    await hydrateGraphResourceReferencePreviews(graph);
    if (!isCurrent()) return;
    await hydrateGraphSpaceReferences(graph, fileName);
    if (!isCurrent()) return;
    const hasViewport = restorePaneOpeningViewport(pane0 as unknown as PaneState, fileName);
    applyPrimaryPaneSettings(graph.settings);
    sharedState.setFocusModeFn(() => $.focusMode);
    applyPaneCanvasBg(pixiContainer, graphTheme);
    { const ac = getAccentColorsForTheme(graphTheme);
      _pane0AccentColor = ac.accent; _pane0AccentAltColor = ac.accentAlt; }
    if (focusedPaneIndex === PANE_LEFT) applyUIToFocusedPane(graphTheme);
    // 切图时：根据文件布局模式重置按钮状态（默认就归零，非默认由 applyLayoutMode 恢复）
    const savedMode = normalizeLayoutMode(layoutMode);
    if (savedMode === 'force') {
      treeMode = false; categoryMode = false; fullCatMode = false;
      activeMode = 'force'; layoutMode = 'force';
    } else {
      // 非默认布局：清空保存的固定状态，防止 restoreFixedState() 把初始布局的固定节点重新锁定
      savedFixedNodes = [];
    }
    // 无条件清除运行时标记：不管什么布局模式，initSim 前必须清理
    for (const n of graph.nodes) { delete (n as any)._pieColors; }
    for (const e of graph.edges) { delete (e as any)._conflict; delete (e as any)._dyingAt; }
    if (savedMode === 'force' && !sharing) {
      // 保留手动固定的节点，仅清除非固定节点的 fx/fy（可能残留自上轮动画的临时固定）
      for (const n of graph.nodes) {
        if (!n.fixed) { n.fx = null; n.fy = null; }
      }
      (graph as any)._categoryBoxes = null;
    }
    clearEd();
    simManager.setStaticMode(savedMode === 'auto');
    if (savedMode === 'auto') simManager.initStatic();
    else simManager.initSim();
    // 恢复该图已保存的布局模式（必须在 initSim 之后，保证 sim 有正确的节点）
    if (savedMode === 'auto') {
      activateSemanticLayoutForPane(pane0, false);
    } else if (savedMode !== 'force') {
      applyLayoutMode(savedMode, false, PANE_LEFT);
    }
    // 格点吸附恢复（新格式 gridSnap 或旧格式 layoutMode='gridsnap'）
    if (gridSnapEnabled) applyGridSnapLayout(pane0 as unknown as PaneState);
    if (!hasViewport && savedMode === 'auto') {
      syncVaultSpaceBreadcrumb();
      fitPaneNodes(pane0, getSim()?.nodes() ?? [], 0);
    }
    updateInfoRef.current();
    draw();
    loadingOverlay.style.display = 'none';
    setTimeout(() => { if (isCurrent()) restoreExpandedMedia(graph, pixi, simManager); }, 100);
  }

  // Pane 1 加载文件
  async function loadGraphDataPane1(fileName: string) {
    const isCurrent = beginPaneGraphLoad(pane1, fileName);
    exitStructureForPane(pane1);
    clearPaneStructureBoundaries(pane1);
    sharedState.hoverNodeId = null;
    sharedState.focusHoverNodeId = null;
    clearPaneLayout(pane1);
    pane1.spaceFocusNodeIds = null;
    pane1.localContext = null;
    pane1.localContextNavigator?.update(null, () => '');
    pane1.localContextProjection?.simManager?.getSim?.()?.stop?.();
    pane1.localContextProjection = null;
    if (pane1.activeTab !== fileName) {
      await saveRuntimeNow(pane1.runtime, collectPaneSettings(pane1));
      if (!isCurrent()) return;
    }
    pane1.activeTab = fileName;
    if (!pane1.openTabs.includes(fileName)) pane1.openTabs.push(fileName);

    // 清除旧 sprites
    if (pixi1) { clearBlobLayer(pixi1); for (const c of pixi1.nodeLayer.children.slice()) c.destroy({ children: true }); pixi1.nodeLayer.removeChildren(); for (const c of pixi1.edgeLayer.children.slice()) c.destroy({ children: true }); pixi1.edgeLayer.removeChildren(); }
    pane1NodeSprites.clear();

    // 重新打开右窗格时复用仍在使用的运行时，保留未保存的内容和定时保存。
    const existing = pane1.runtime.fileName === fileName ? pane1.runtime : findExistingForFile(fileName, pane1.runtime);
    if (existing) {
      prepareRuntimeForSharing(existing);
      if (existing !== pane1.runtime) {
        runtimeRegistry.release(pane1.runtime, pane1);
        pane1.runtime = runtimeRegistry.acquire(fileName, pane1, () => existing);
      }
      simManager1 = pane1.simManager; extraSims[0] = pane1.simManager;
      pane1.graph.settings = { ...DEFAULT_SETTINGS, ...(pane1.graph.settings || {}) };
      applyPaneSettings(pane1, pane1.graph.settings);
    } else {
      runtimeRegistry.release(pane1.runtime, pane1);
      pane1.runtime = runtimeRegistry.acquire(fileName, pane1, () => new GraphRuntime(fileName, { nodes: [], edges: [], groups: [] }, new UndoManager()));
      simManager1 = createSimManager(pane1.graph, () => pane1.gw, () => pane1.gh,
        () => pane1.linkDist, () => pane1.linkStr, () => pane1.charge, () => pane1.centerS,
        () => pane1.collideR, () => pane1.groupBound,
        () => pane1.alphaTarget, () => pane1.heatingTime,
        () => getCollapsedHierarchyHiddenNodeIds(pane1.graph),
        () => pixiDrawPane1()
      );
      pane1.simManager = simManager1;
      extraSims[0] = simManager1;
      const saved = await readGraphData(fileName);
      if (!isCurrent() || pane1.activeTab !== fileName) return;
      if (isBuiltin(fileName)) {
        if (saved && saved.nodes && saved.nodes.length > 0) {
          pane1.graph.nodes = saved.nodes;
          pane1.graph.edges = (saved.edges || []).map((e: any) => { const { _createdAt, _dyingAt, ...c } = e; return c; });
          pane1.graph.groups = saved.groups || [];
          pane1.graph.settings = saved.settings;
        } else {
          const builtin = repairGraphCreatedOrders(JSON.parse(JSON.stringify(BUILTIN_GRAPHS[fileName])));
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
      if (!isCurrent() || pane1.activeTab !== fileName) return;
      if (pane1.graph.settings) applyPaneSettings(pane1, pane1.graph.settings);
    }
    pane1.graph.settings = { ...DEFAULT_SETTINGS, ...(pane1.graph.settings || {}) };
    await hydrateGraphResourceReferencePreviews(pane1.graph);
    if (!isCurrent() || pane1.activeTab !== fileName) return;
    await hydrateGraphSpaceReferences(pane1.graph, fileName);
    if (!isCurrent() || pane1.activeTab !== fileName) return;
    const hasViewport = restorePaneOpeningViewport(pane1, fileName);
    applyPaneSettings(pane1, pane1.graph.settings);
    // 自动模式直接建立静态位置源；其他模式按需创建 D3 simulation。
    simManager1.setStaticMode(pane1.activeMode === 'auto');
    if (pane1.activeMode === 'auto') simManager1.initStatic();
    else simManager1.initSim();
    if (pane1.activeMode === 'auto') activateSemanticLayoutForPane(pane1, false);
    loadingOverlay.style.display = 'none';
    // 右窗格画布背景独立设置（不受左窗格/UI 主题影响）
    applyPaneCanvasBg(pane1Container, pane1.graphTheme);
    { const ac = getAccentColorsForTheme(pane1.graphTheme);
      pane1.themeAccentColor = ac.accent; pane1.themeAccentAltColor = ac.accentAlt; }
    // 若右窗格为当前焦点，同步其主题到 UI CSS 变量
    if (focusedPaneIndex === PANE_RIGHT) {
      applyUIToFocusedPane(pane1.graphTheme);
    }
    if (!hasViewport && pane1.activeMode === 'auto') {
      syncVaultSpaceBreadcrumb();
      fitPaneNodes(pane1, simManager1.getSim()?.nodes() ?? [], 0);
    }
    pixiDrawPane1();
    setTimeout(() => { if (isCurrent()) restoreExpandedMedia(pane1.graph, pixi1, simManager1); }, 100);
  }

  // 聚焦窗格状态访问辅助（兼容多分屏）
  const focusedExtraPane = () => focusedPaneIndex > PANE_LEFT ? extraPanes[focusedPaneIndex - 1] : null;
  const focusedTabs = () => {
    const ep = focusedExtraPane();
    return ep ? ep : { openTabs, get activeTab() { return activeTab; }, set activeTab(v: string) { activeTab = v; }, graph, dirtyTabs, saveTimeout };
  };

  /** 通用：加载图到指定窗格 */
  async function loadGraphForPane(pane: PaneState, fileName: string) {
    exitStructureForPane(pane);
    clearPaneStructureBoundaries(pane);
    sharedState.hoverNodeId = null;
    sharedState.focusHoverNodeId = null;
    clearPaneLayout(pane);
    pane.spaceFocusNodeIds = null;
    pane.localContext = null;
    pane.localContextNavigator?.update(null, () => '');
    pane.localContextProjection?.simManager?.getSim?.()?.stop?.();
    pane.localContextProjection = null;
    const isCurrent = beginPaneGraphLoad(pane, fileName);
    const extraIndex = extraPanes.indexOf(pane);
    pane.activeTab = fileName;
    if (!pane.openTabs.includes(fileName)) pane.openTabs.push(fileName);
    // 清除旧 sprites
    if (pane.pixi) { clearBlobLayer(pane.pixi); for (const c of pane.pixi.nodeLayer.children.slice()) c.destroy({ children: true }); pane.pixi.nodeLayer.removeChildren(); for (const c of pane.pixi.edgeLayer.children.slice()) c.destroy({ children: true }); pane.pixi.edgeLayer.removeChildren(); }
    pane.nodeSprites.clear();

    // 检查是否已有其他窗格持有同文件 → 共享 graph 引用 + simManager
    const existing = findExistingForFile(fileName, pane.runtime);
    if (existing) {
      prepareRuntimeForSharing(existing);
      runtimeRegistry.release(pane.runtime, pane);
      pane.runtime = runtimeRegistry.acquire(fileName, pane, () => existing);
      if (extraIndex >= 0) extraSims[extraIndex] = pane.simManager;
      const ss = pane.graph.settings;
      if (ss) applyPaneSettings(pane, ss);
    } else {
      runtimeRegistry.release(pane.runtime, pane);
      pane.runtime = runtimeRegistry.acquire(fileName, pane, () => new GraphRuntime(fileName, { nodes: [], edges: [], groups: [] }, new UndoManager()));
      const newSM = createSimManager(pane.graph, () => pane.gw, () => pane.gh,
        () => pane.linkDist, () => pane.linkStr, () => pane.charge, () => pane.centerS,
        () => pane.collideR, () => pane.groupBound,
        () => pane.alphaTarget, () => pane.heatingTime,
        () => getCollapsedHierarchyHiddenNodeIds(pane.graph),
        () => draw()
      );
      pane.simManager = newSM;
      if (extraIndex >= 0) extraSims[extraIndex] = newSM;
      const saved = await readGraphData(fileName);
      if (!isCurrent() || pane.activeTab !== fileName) return;
      if (isBuiltin(fileName)) {
        if (saved && saved.nodes && saved.nodes.length > 0) {
          pane.graph.nodes = saved.nodes;
          pane.graph.edges = (saved.edges || []).map((e: any) => { const { _createdAt, _dyingAt, ...c } = e; return c; });
          pane.graph.groups = saved.groups || [];
          pane.graph.settings = saved.settings;
        } else {
          const builtin = repairGraphCreatedOrders(JSON.parse(JSON.stringify(BUILTIN_GRAPHS[fileName])));
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
      if (!isCurrent() || pane.activeTab !== fileName) return;
      pane.graph.settings = { ...DEFAULT_SETTINGS, ...(pane.graph.settings || {}) };
      applyPaneSettings(pane, pane.graph.settings);
    }
    pane.graph.settings = { ...DEFAULT_SETTINGS, ...(pane.graph.settings || {}) };
    await hydrateGraphResourceReferencePreviews(pane.graph);
    if (!isCurrent() || pane.activeTab !== fileName) return;
    await hydrateGraphSpaceReferences(pane.graph, fileName);
    if (!isCurrent() || pane.activeTab !== fileName) return;
    const hasViewport = restorePaneOpeningViewport(pane, fileName);
    applyPaneSettings(pane, pane.graph.settings);
    // 自动模式直接建立静态位置源；其他模式按需创建 D3 simulation。
    pane.simManager?.setStaticMode(pane.activeMode === 'auto');
    if (pane.activeMode === 'auto') pane.simManager?.initStatic();
    else pane.simManager?.initSim();
    if (pane.activeMode === 'auto') activateSemanticLayoutForPane(pane, false);
    else if (!existing && pane.activeMode !== 'force') applyLayoutMode(pane.activeMode, false, pane.index);
    // 画布背景 + 强调色（各自独立）
    applyPaneCanvasBg(pane.canvasContainer, pane.graphTheme);
    const ac = getAccentColorsForTheme(pane.graphTheme);
    pane.themeAccentColor = ac.accent; pane.themeAccentAltColor = ac.accentAlt;
    if (!hasViewport && pane.activeMode === 'auto') {
      syncVaultSpaceBreadcrumb();
      fitPaneNodes(pane, pane.simManager?.getSim()?.nodes() ?? [], 0);
    }
    draw();
    setTimeout(() => { if (isCurrent()) restoreExpandedMedia(pane.graph, pane.pixi, pane.simManager); }, 100);
  }

  /** 从 settings 对象恢复窗格配置 */
  function applyPaneSettings(pane: PaneState, s: any) {
    s ||= {};
    pane.linkDist = s.linkDist ?? pane.linkDist; pane.labelSize = s.labelSize ?? pane.labelSize;
    pane.charge = s.charge ?? pane.charge; pane.linkStr = s.linkStr ?? pane.linkStr;
    pane.collideR = s.collideR ?? pane.collideR; pane.centerS = s.centerS ?? pane.centerS;
    pane.groupBound = s.groupBound ?? pane.groupBound; pane.heatingTime = s.heatingTime ?? pane.heatingTime;
    pane.alphaTarget = s.alphaTarget ?? pane.alphaTarget; pane.editPanelOpacity = s.editPanelOpacity ?? pane.editPanelOpacity;
    pane.useRAFL = s.useRAFL ?? pane.useRAFL; pane.nodeExpand = s.nodeExpand ?? pane.nodeExpand;
    pane.lineExpand = s.lineExpand ?? pane.lineExpand; pane.showGLabels = s.showGLabels ?? pane.showGLabels;
    pane.glMin = s.glMin ?? pane.glMin; pane.glMax = s.glMax ?? pane.glMax;
    pane.gridVis = s.gridVis ?? pane.gridVis; pane.axisVis = s.axisVis ?? pane.axisVis;
    pane.axisTicks = s.axisTicks ?? pane.axisTicks; pane.gridSp = s.gridSp ?? pane.gridSp;
    pane.gridWidth = s.gridWidth ?? pane.gridWidth;
    pane.gridMode = (s.gridMode as 'line' | 'dot') || pane.gridMode;
    pane.ar = s.ar ?? pane.ar; pane.graphTheme = s.graphTheme || pane.graphTheme;
    pane.categoryLayout = s.categoryLayout ?? pane.categoryLayout;
    pane.activeMode = normalizeLayoutMode(s.layoutMode ?? pane.activeMode);
    pane.gridSnapEnabled = (s as any).gridSnap ?? pane.gridSnapEnabled;
    pane.partialGridSnap = (s as any).partialGridSnap ?? pane.partialGridSnap;
    pane.nodeColorStyle = (s as any).nodeColorStyle || pane.nodeColorStyle;
    pane.fontFamily = (s as any).fontFamily || pane.fontFamily;
    pane.focusMode = s.focusMode ?? pane.focusMode;
    pane.selectedTooltip = (s as any).selectedTooltip ?? pane.selectedTooltip;
    pane.centerMode = (s as any).centerMode ?? pane.centerMode;
    pane.glowAppearance = s.glowAppearance ?? pane.glowAppearance;
    pane.edgeColorGradient = s.edgeColorGradient ?? pane.edgeColorGradient;
    pane.edgeWidthByLevel = s.edgeWidthByLevel ?? pane.edgeWidthByLevel;
    pane.fixedHollow = (s as any).fixedHollow ?? pane.fixedHollow;
    pane.cardBorderStyle = (s as any).cardBorderStyle || pane.cardBorderStyle;
  }

  function applyPrimaryPaneSettings(settings?: Partial<GraphSettings> | null) {
    const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
    applyPaneSettings(pane0 as unknown as PaneState, s);
    layoutMode = normalizeLayoutMode(s.layoutMode);
    starRotateMode = s.starRotateMode ?? starRotateMode;
    if (focusedPaneIndex === PANE_LEFT) {
      document.documentElement.style.setProperty('--fg-font-family', fontFamily);
      setNodeFontFamily(fontFamily);
    }
  }

  /** 查找已持有 fileName 的文档运行时，不含调用方当前 runtime */
  function findExistingForFile(fileName: string, exclude?: GraphRuntime): GraphRuntime | null {
    if (primaryRuntime !== exclude && primaryRuntime?.fileName === fileName) return primaryRuntime;
    for (const pane of extraPanes) {
      if (pane.runtime !== exclude && pane.runtime.fileName === fileName) return pane.runtime;
    }
    const registered = runtimeRegistry.get(fileName);
    return registered !== exclude ? registered : null;
  }

  const openTabRequests = new WeakMap<PaneState, symbol>();
  async function openTab(fileName: string, pane = focusedPaneState()) {
    if (focusedPaneState() === pane) commitAppearanceInput();
    const request = Symbol();
    openTabRequests.set(pane, request);
    const destination = adapter;
    const primary = pane.index === PANE_LEFT;
    const runtime = paneRuntime(pane);
    const isCurrent = () => openTabRequests.get(pane) === request && destination === adapter
      && (primary || splitActive && extraPanes.includes(pane));
    const syncSelection = () => sidebar.syncActiveFile(paneLoadedTab(focusedPaneState()));
    if (runtime.fileName === fileName) {
      syncSelection();
      return;
    }
    const saved = await saveRuntimeNow(runtime, primary ? collectSettings() : collectPaneSettings(pane));
    if (!isCurrent()) return;
    if (!saved || runtime !== paneRuntime(pane)) {
      syncSelection();
      return;
    }
    clearAllMedia(); manuallyOpenedMediaIds.clear(); hoveredMediaId = '';
    if (primary) {
      if (!openTabs.includes(fileName)) openTabs.push(fileName);
      await loadGraphData(fileName);
    } else {
      await loadGraphForPane(pane, fileName);
    }
    if (!isCurrent()) return;
    if (focusedPaneState() === pane) {
      syncFocusedGraphAppearance();
      syncSearchControlsFromFocusedPane();
    }
    renderModeBar();
    syncSpaceNavigation();
    persistTabs();
    syncSelection();
    draw();
  }

  // ===== PaneManager + 单例兼容层 =====
  // pm.$ Proxy 将所有属性访问代理到当前焦点窗格
  // 同时保留所有单例变量，初始时指向 pane 0 的状态，焦点切换时换入/换出
  const pm = new PaneManager();
  // Proxy routes every property through the actual globally focused pane.
  const resolveFocusedPaneState = () => paneAtGlobalIndex<PaneState>(pane0 as unknown as PaneState, extraPanes, focusedPaneIndex) ?? pane0 as unknown as PaneState;
  const $ = new Proxy({} as any, {
    get(_: any, prop: string) {
      return (resolveFocusedPaneState() as any)[prop];
    },
    set(_: any, prop: string, val: any) {
      (resolveFocusedPaneState() as any)[prop] = val;
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
    layoutMode = DEFAULT_SETTINGS.layoutMode || 'auto', gridSnapEnabled = DEFAULT_SETTINGS.gridSnap || false, partialGridSnap = DEFAULT_SETTINGS.partialGridSnap || false, nodeColorStyle = (DEFAULT_SETTINGS.nodeColorStyle as 'uniform' | 'hierarchical' | 'spectrum' | 'spectrum-narrow') || 'spectrum-narrow', fixedHollow = true,
    edgeColorGradient = DEFAULT_SETTINGS.edgeColorGradient || false, edgeWidthByLevel = DEFAULT_SETTINGS.edgeWidthByLevel || false,
    fontFamily = (DEFAULT_SETTINGS as any).fontFamily || DEFAULT_CANVAS_FONT,
    cardBorderStyle = (DEFAULT_SETTINGS as any).cardBorderStyle || 'straight';
  let gw = 800, gh = 600;
  const getViewportTransform = () => {
    if (!pixi) return { k: 1, x: 0, y: 0 };
    const vp = pixi.viewport;
    return { k: vp.scale.x, x: vp.x, y: vp.y };
  };
  const updateGwGh = () => {
    if (pixi) { gw = pixi.viewport.worldWidth; gh = pixi.viewport.worldHeight; }
  };
  let search = '', sField: SearchField = "all",
      sDisplayMode: "highlight"|"show" = "highlight",
      sMatchMode: "contains"|"startsWith"|"endsWith"|"fuzzy" = "contains";
  let selNode: string | null = null, selEdge: number | null = null, selGroup: string | null = null;
  let draggingNode: any = null, wasDragged = false;
  let linkMode = false, linkSrc: string | null = null;
  let boxSelectMode = false;
  let activeMode = 'auto'; // auto | force | tree | radial | category | fullcat | layout:xxx
  let dragCount = 0; // 节点拖拽计数器，用于 pointer-events 穿透
  let _lastDragNodeId: string | null = null;
  let defArrow = false;
  let linkCursorX = 0, linkCursorY = 0;

  // 节点剪贴板（跨图复制粘贴）— 通过 sharedState.sharedState.nodeClipboard 共享

  let undoManager = new UndoManager();
  let primaryRuntime: GraphRuntime;
  const runtimeRegistry = new GraphRuntimeRegistry();
  const saveUndo = () => {
    const g = focusedPaneIndex === PANE_LEFT ? graph : (extraPanes[focusedPaneIndex - 1]?.graph ?? graph);
    const um = focusedPaneIndex === PANE_LEFT ? undoManager : (extraPanes[focusedPaneIndex - 1]?.undoManager ?? undoManager);
    um.pushSnapshot(g);
    syncFocusedCommands();
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
      if (dir) {
        _wasd.zoom[dir] = false;
        requestAnimationFrame(() => refreshSemanticLensForPane(pane0));
      }
    }
    if (e.key === 'Alt') { _wasd.zoom.up = _wasd.zoom.down = _wasd.zoom.left = _wasd.zoom.right = false; }
  });

  let _starRaf: number | null = null;
  let _starLastNodeCount = 0;
  let _starLastEdgeCount = 0;
  let _starFrameIndex = 0;
  let _starLastFrameTime = 0;
  /** 最外层线速度 px/s，保持人眼可跟随 */
  const ROTATE_LINEAR_SPEED = 200;

  function startStarLoop() {
    if (_starRaf !== null) return;
    const sim = simManager.getSim();
    if (sim) sim.stop();
    const projection = getStructureProjection(graph);
    _starLastNodeCount = projection.nodes.length;
    _starLastEdgeCount = projection.edges.length;
    _starFrameIndex = 0;
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
    const projection = getStructureProjection(graph);
    const gn = projection.nodes;

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
    // 星型几何只在拓扑改变时重算；平移、旋转和拖拽直接复用局部坐标。
    // 旧实现静止时仍逐帧 BFS，移动端会把本应便宜的展示布局变成持续高负载。
    const topologyChanged = gn.length !== _starLastNodeCount || projection.edges.length !== _starLastEdgeCount;
    if (topologyChanged) {
      computeRadialLayout(gn, projection.edges);
      _starLastNodeCount = gn.length;
      _starLastEdgeCount = projection.edges.length;
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

    // 星星间凸包碰撞（低频求解；渲染仍保持 60fps）
    const convexHull = (pts: {x:number,y:number}[]): {x:number,y:number}[] => {
      if (pts.length <= 2) return pts;
      const sorted = pts.slice().sort((a,b) => a.x-b.x || a.y-b.y);
      const cross = (o:any,a:any,b:any) => (a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
      const lo: typeof pts = [], hi: typeof pts = [];
      for (const p of sorted) { while (lo.length>=2&&cross(lo[lo.length-2],lo[lo.length-1],p)<=0) lo.pop(); lo.push(p); }
      for (const p of sorted.reverse()) { while (hi.length>=2&&cross(hi[hi.length-2],hi[hi.length-1],p)<=0) hi.pop(); hi.push(p); }
      lo.pop(); hi.pop(); return lo.concat(hi);
    };
    // 同步非拖拽根 fx→x，保证凸包计算基于一致位置
    for (const r of roots) {
      if ((r as any)._deleted) continue;
      if ((r as any)._slfx !== r.fx) continue; // 拖拽中，不碰
      if (r.fx != null) { r.x = r.fx; r.y = r.fy; }
    }
    const resolveHullCollisions = topologyChanged || (_starFrameIndex++ % (starRotateMode ? 3 : 6) === 0);
    if (resolveHullCollisions) {
      const allHulls = new Map<string, {x:number,y:number}[]>();
      for (const r of roots) {
        const sd = starData.get(r.id)!;
        allHulls.set(r.id, convexHull([r, ...sd.children].filter(n => !(n as any)._deleted).map(n => ({x:n.x,y:n.y}))));
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

  const pane0Layout = new LayoutSlot();
  const pane0 = {
  index: PANE_LEFT,
  layout: pane0Layout,
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
  semanticLensState: null as PaneState['semanticLensState'],
  localContext: null as LocalContextState | null,
  localContextNavigator: null as PaneState['localContextNavigator'],
  localContextProjection: null as PaneState['localContextProjection'],
  spaceFocusNodeIds: null as string[] | null,
  get searchDebounceTimer() { return searchDebounceTimer; }, set searchDebounceTimer(v) { searchDebounceTimer = v; },
  get searchMatchIndex() { return searchMatchIndex; }, set searchMatchIndex(v) { searchMatchIndex = v; },
  get lastSearchTerm() { return lastSearchTerm; }, set lastSearchTerm(v) { lastSearchTerm = v; },
  get treeMode() { return treeMode; }, set treeMode(v) { treeMode = v; },
  get categoryMode() { return categoryMode; }, set categoryMode(v) { categoryMode = v; },
  get fullCatMode() { return fullCatMode; }, set fullCatMode(v) { fullCatMode = v; },
  get activeMode() { return activeMode; }, set activeMode(v) { activeMode = v; },
  get simManager() { return simManager; }, set simManager(v) { simManager = v; },
  get pixi() { return pixi; }, set pixi(v) { pixi = v; },
  get nodeSprites() { return nodeSprites; }, set nodeSprites(v) { nodeSprites = v; },
  canvasContainer: pixiContainer,
  readyToDraw: false,
  textViewActive: false,
  disposeCanvasEvents: null as (() => void) | null,
  activeTab: '',
  openTabs: [] as string[],
  structurePath: [] as string[],
  structureView: null as PaneStructureView | null,
  structureController: new StructureNavigationState({ maxDepth: 1 }),
  disposeStructureBreadcrumb: null as (() => void) | null,
  structureBreadcrumb: null as ReturnType<typeof createStructureBreadcrumb> | null,
  structureBoundaryShapes: new Map(),
  hoverStructureId: null as string | null,
  membershipDragPreview: null,
  membershipDragSession: null,
};

  // --- 存储辅助函数 ---
  const collectSettings = (): GraphSettings => ({
    ...(graph.settings ?? DEFAULT_SETTINGS),
    linkDist, labelSize, charge, linkStr, collideR, centerS, groupBound,
    heatingTime, alphaTarget, editPanelOpacity, useRAFL,
    nodeExpand, lineExpand, showGLabels, glMin, glMax,
    gridVis, gridMode, axisVis, axisTicks, gridSp, gridWidth, ar, graphTheme, focusMode, centerMode, starRotateMode, glowAppearance, selectedTooltip, categoryLayout,
    layoutMode: activeMode, gridSnap: gridSnapEnabled, partialGridSnap, nodeColorStyle, fontFamily, fixedHollow, cardBorderStyle,
    edgeColorGradient, edgeWidthByLevel, expandedMedia: [...manuallyOpenedMediaIds],
  });

  const collectPaneSettings = (pane: PaneState): GraphSettings => ({
    ...(pane.graph.settings ?? DEFAULT_SETTINGS),
    linkDist: pane.linkDist, labelSize: pane.labelSize, charge: pane.charge, linkStr: pane.linkStr,
    collideR: pane.collideR, centerS: pane.centerS, groupBound: pane.groupBound,
    heatingTime: pane.heatingTime, alphaTarget: pane.alphaTarget, editPanelOpacity: pane.editPanelOpacity,
    useRAFL: pane.useRAFL, nodeExpand: pane.nodeExpand, lineExpand: pane.lineExpand,
    showGLabels: pane.showGLabels, glMin: pane.glMin, glMax: pane.glMax,
    gridVis: pane.gridVis, gridMode: pane.gridMode, axisVis: pane.axisVis, axisTicks: pane.axisTicks,
    gridSp: pane.gridSp, gridWidth: pane.gridWidth, ar: pane.ar, graphTheme: pane.graphTheme,
    focusMode: pane.focusMode, centerMode: pane.centerMode, selectedTooltip: pane.selectedTooltip,
    glowAppearance: pane.glowAppearance, categoryLayout: pane.categoryLayout,
    edgeColorGradient: pane.edgeColorGradient, edgeWidthByLevel: pane.edgeWidthByLevel,
    layoutMode: pane.activeMode, gridSnap: pane.gridSnapEnabled, partialGridSnap: pane.partialGridSnap,
    nodeColorStyle: pane.nodeColorStyle, fontFamily: pane.fontFamily, fixedHollow: pane.fixedHollow,
    cardBorderStyle: pane.cardBorderStyle,
  });

  const collectRuntimeSettings = (runtime: GraphRuntime): GraphSettings => {
    if (primaryRuntime === runtime) return collectSettings();
    const owner = extraPanes.find(pane => pane.runtime === runtime);
    return owner ? collectPaneSettings(owner) : (runtime.graph.settings ?? DEFAULT_SETTINGS);
  };

  const clearRuntimeDirty = (runtime: GraphRuntime) => {
    dirtyTabs.delete(runtime.fileName);
    for (const pane of extraPanes) {
      pane.dirtyTabs.delete(runtime.fileName);
    }
  };

  const persistRuntimeSnapshot = async (runtime: GraphRuntime, settings: GraphSettings, allowConflictOverwrite = false): Promise<boolean> => {
    const fileName = runtime.fileName;
    const targetAdapter = adapter;
    const snapshot = serializeGraphSnapshot(runtime.graph, settings);
    const generation = runtime.saveGeneration;
    const result = await runtime.enqueueSave(snapshot, savedSnapshot => writeGraphSnapshot(fileName, savedSnapshot, targetAdapter), allowConflictOverwrite);
    const saved = result.saved && result.current && generation === runtime.saveGeneration && runtime.markSaved(result.revision);
    if (saved) {
      runtime.graph.settings = { ...(runtime.graph.settings || {}), ...settings };
      runtime.clearExternalConflict();
      clearRuntimeDirty(runtime);
      void refreshOpenSpaceReferences(fileName);
    }
    runtimeRegistry.prune(runtime);
    syncSpaceNavigation();
    return saved;
  };

  const scheduleSaveForRuntime = (runtime: GraphRuntime, settings?: GraphSettings) => {
    if (isVaultLocationTabId(runtime.fileName)) return;
    syncFocusedCommands();
    if (runtime === primaryRuntime) {
      pane0.layout.onGraphChanged();
      dirtyTabs.add(runtime.fileName);
    }
    for (const owner of extraPanes) {
      if (owner.runtime !== runtime) continue;
      owner.layout.onGraphChanged();
      owner.dirtyTabs.add(runtime.fileName);
    }
    runtime.cancelPendingSave();
    runtime.markDirty();
    const snapshotSettings = settings ?? collectRuntimeSettings(runtime);
    runtime.graph.settings = { ...(runtime.graph.settings || {}), ...snapshotSettings };
    if (runtime.externalConflict || runtime.fileOperationActive) return;
    runtime.saveTimeout = setTimeout(async () => {
      runtime.saveTimeout = null;
      await persistRuntimeSnapshot(runtime, snapshotSettings);
    }, 300);
    if (runtime === primaryRuntime) saveTimeout = runtime.saveTimeout;
  };

  const scheduleSaveForPane = (pane: PaneState) => scheduleSaveForRuntime(pane.runtime, collectPaneSettings(pane));

  const reinitializeRuntimeViews = (runtime: GraphRuntime) => {
    const initialized = new Set<any>();
    if (primaryRuntime === runtime && simManager) {
      simManager.initSim();
      initialized.add(simManager);
    }
    for (const owner of extraPanes) {
      if (owner.runtime !== runtime || !owner.simManager || initialized.has(owner.simManager)) continue;
      owner.simManager.initSim();
      initialized.add(owner.simManager);
    }
    refreshStructureViews(runtime);
  };

  const clearRuntimeMembershipDragState = (runtime: GraphRuntime) => {
    if (runtime === primaryRuntime) clearMembershipDragPreview(pane0 as unknown as PaneState);
    for (const owner of extraPanes) {
      if (owner.runtime === runtime) clearMembershipDragPreview(owner);
    }
  };

  const applyStructureMembershipTransaction = async (
    runtime: GraphRuntime,
    request: StructureMembershipRequest,
  ): Promise<StructureMembershipTransactionResult> => {
    const graph = runtime.graph;
    const structureLabel = graph.nodes.find(node => node.id === request.structureId)?.label || request.structureId;
    let executionRequest = request;
    let preview = previewStructureMembershipTransaction(graph, executionRequest);

    if (preview.status === 'needs-confirmation') {
      if (preview.directEdgeCount > 0) {
        showToast(`请先删除或改接 ${preview.directEdgeCount} 条结构整体关系`, 'warning', 4500);
        clearRuntimeMembershipDragState(runtime);
        draw();
        return preview;
      }
      const confirmed = await confirmAction(
        '移出后结构不足两个成员，将解散结构',
        { confirm: '移出并解散', cancel: '取消' },
      );
      if (!confirmed) {
        clearRuntimeMembershipDragState(runtime);
        draw();
        return preview;
      }
      // Confirmation is asynchronous: revalidate the captured runtime, never the focused pane.
      executionRequest = {
        action: 'remove',
        structureId: request.structureId,
        nodeId: request.nodeId,
        confirmDissolve: true,
      };
      preview = previewStructureMembershipTransaction(graph, executionRequest);
    }

    if (preview.status !== 'changed') {
      clearRuntimeMembershipDragState(runtime);
      if (preview.status === 'rejected' && preview.reason === 'direct-edges') {
        showToast(`请先删除或改接 ${preview.directEdgeCount ?? 0} 条结构整体关系`, 'warning', 4500);
      } else if (preview.status === 'rejected') {
        showToast('结构成员关系已变化，本次操作未执行', 'warning', 3000);
      }
      draw();
      return preview;
    }

    let snapshotPushed = false;
    const result = transactStructureMembership(graph, executionRequest, () => {
      // The transaction invokes this only after its final synchronous validation and before mutation.
      runtime.undoManager.pushSnapshot(graph);
      snapshotPushed = true;
    });
    clearRuntimeMembershipDragState(runtime);
    if (result.status !== 'changed') {
      // No callback means no empty undo entry was created if facts diverged from the preview.
      if (!snapshotPushed) showToast('结构成员关系已变化，本次操作未执行', 'warning', 3000);
      draw();
      return result;
    }

    if (result.action === 'dissolve') {
      for (const owner of [pane0 as unknown as PaneState, ...extraPanes]) {
        const ownerRuntime = owner.index === PANE_LEFT ? primaryRuntime : owner.runtime;
        if (ownerRuntime !== runtime || owner.selNode !== request.structureId) continue;
        owner.selNode = null;
        owner.selEdge = null;
        owner.selGroup = null;
      }
      if (runtime === primaryRuntime && selNode === request.structureId) clearEd();
    }
    reinitializeRuntimeViews(runtime);
    scheduleSaveForRuntime(runtime);
    draw();
    showToast(
      result.action === 'add'
        ? `已加入「${structureLabel}」`
        : result.action === 'remove'
          ? `已移出「${structureLabel}」`
          : `已移出并解散「${structureLabel}」`,
      'success',
      2500,
    );
    return result;
  };

  const applyCompiledTextGraph = (runtime: GraphRuntime, compiled: GraphData) => {
    const repaired = repairGraphCreatedOrders(compiled);
    normalizeStructureRelations(repaired);
    const cleanEdges = (repaired.edges || []).map((edge: any) => {
      const { _createdAt, _dyingAt, _conflict, ...cleanEdge } = edge;
      return {
        ...cleanEdge,
        source: typeof cleanEdge.source === 'object' ? cleanEdge.source.id : cleanEdge.source,
        target: typeof cleanEdge.target === 'object' ? cleanEdge.target.id : cleanEdge.target,
      };
    });
    runtime.undoManager.pushSnapshot(runtime.graph);
    runtime.graph.nodes.length = 0;
    runtime.graph.nodes.push(...(repaired.nodes || []));
    runtime.graph.edges.length = 0;
    runtime.graph.edges.push(...cleanEdges);
    runtime.graph.groups.length = 0;
    runtime.graph.groups.push(...(repaired.groups || []));
    runtime.graph.settings = repaired.settings ? { ...repaired.settings } : undefined;
    if (runtime.graph.settings) {
      if (runtime === primaryRuntime) applyPrimaryPaneSettings(runtime.graph.settings);
      for (const owner of extraPanes) {
        if (owner.runtime === runtime) applyPaneSettings(owner, runtime.graph.settings);
      }
    }
    refreshStructureViews(runtime);
    syncFocusedCommands();
  };

  const createStructureForPane = async (
    pane: Pick<PaneState, 'activeMode' | 'graph' | 'undoManager' | 'selNode' | 'selEdge' | 'selGroup' | 'index'>,
    runtime: GraphRuntime,
    ids: string[],
  ) => {
    if (runtime.graph.settings?.sourceMode === 'vault-readonly') {
      showToast('这是由 Vault 原文生成的只读视图；结构不会写回笔记', 'info', 3500);
      return;
    }
    if (coordinateLayoutModes.has(pane.activeMode)) {
      showToast('请先退出卡片或分类布局，再创建结构', 'info', 3000);
      return;
    }
    const members = ids
      .map(id => pane.graph.nodes.find(node => node.id === id))
      .filter(Boolean);
    if (members.length < 2 || members.some(node => isStructureNode(node) || node.structureParentId)) {
      showToast('请选择至少两个尚未属于结构的普通节点', 'info', 3000);
      return;
    }
    const suggested = `结构 (${members.length})`;
    const label = await safePrompt('结构名称：', suggested);
    if (label === null) return;
    pane.undoManager.pushSnapshot(pane.graph);
    const structureNode = createStructureNode(pane.graph, ids, label);
    pane.selNode = structureNode.id;
    pane.selEdge = null;
    pane.selGroup = null;
    sharedState.clearSelection?.();
    reinitializeRuntimeViews(runtime);
    if (runtime === primaryRuntime) scheduleSave();
    else {
      const owner = extraPanes.find(candidate => candidate.runtime === runtime);
      if (owner) scheduleSaveForPane(owner);
    }
    if (pane.index === PANE_LEFT) fillNode(structureNode.id);
    draw();
  };

  const scheduleSave = () => {
    const focusedOwner = focusedPaneIndex > PANE_LEFT ? extraPanes[focusedPaneIndex - 1] : null;
    scheduleSaveForRuntime(focusedOwner?.runtime ?? primaryRuntime);
  };

  const saveRuntimeNow = async (
    runtime: GraphRuntime,
    settings?: GraphSettings,
    forFileOperation = false,
    manual = false,
  ): Promise<boolean> => {
    if (runtime.fileOperationActive && !forFileOperation) return false;
    if (!runtime.dirty && !runtime.externalConflict && !runtime.savePending && !forFileOperation && !manual) return true;
    const operationGeneration = runtime.saveGeneration;
    const fileName = runtime.fileName;
    const snapshotSettings = settings ?? collectRuntimeSettings(runtime);
    runtime.cancelPendingSave();
    const needsOverwrite = runtime.externalConflict;
    if (needsOverwrite) {
      const revision = runtime.changeRevision;
      const overwrite = await confirmAction(
        `“${fileName.replace(/\.json$/, '')}”已被外部修改，是否用本地内容覆盖磁盘版本？`,
        { confirm: '覆盖磁盘', cancel: '暂不保存' },
      );
      if (!overwrite) return false;
      if (runtime.saveGeneration !== operationGeneration || runtime.changeRevision !== revision
        || runtime.fileName !== fileName || (runtime.fileOperationActive && !forFileOperation)) {
        showToast('确认保存期间文件发生变化，请重新保存', 'warning', 4000);
        return false;
      }
      const oldSaves = runtime.invalidateSaves();
      const overwriteGeneration = runtime.saveGeneration;
      await oldSaves;
      if (runtime.saveGeneration !== overwriteGeneration || runtime.changeRevision !== revision
        || runtime.fileName !== fileName || (runtime.fileOperationActive && !forFileOperation)) {
        showToast('确认保存期间文件发生变化，请重新保存', 'warning', 4000);
        return false;
      }
    }
    return persistRuntimeSnapshot(runtime, snapshotSettings, needsOverwrite);
  };

  const saveNow = async (): Promise<void> => {
    const ep = focusedPaneIndex > PANE_LEFT ? extraPanes[focusedPaneIndex - 1] : null;
    if (ep) scheduleSaveForPane(ep);
    else scheduleSaveForRuntime(primaryRuntime, collectSettings());
  };

  const saveFocusedGraphWithFeedback = async (): Promise<void> => {
    const ep = focusedPaneIndex > PANE_LEFT ? extraPanes[focusedPaneIndex - 1] : null;
    const runtime = ep?.runtime ?? primaryRuntime;
    const fileName = runtime.fileName;
    if (isVaultLocationTabId(fileName)) {
      showToast('此视图为只读，无需保存', 'info');
      return;
    }
    if (runtime.fileOperationActive) {
      showToast('文件正在移动、重命名或删除，请稍后保存', 'warning');
      return;
    }
    if (await saveRuntimeNow(runtime, ep ? collectPaneSettings(ep) : collectSettings(), false, true)) {
      showToast(`已保存“${fileName.replace(/\.json$/, '')}”`, 'success');
    }
  };

  let splitActive = false;
  // 初始单窗格：隐藏右窗格
  dualPane.paneContainers[PANE_RIGHT].style.display = 'none';
  dualPane.paneContainers[PANE_LEFT].style.width = '100%';
  dualPane.paneContainers[PANE_LEFT].style.left = '0';
  for (const d of dualPane.dividers) d.style.display = 'none';

  const syncSpaceNavigation = () => {
    syncSplitControls();
    syncVaultSpaceBreadcrumb();
    const owner = focusedPaneIndex === PANE_LEFT ? null : extraPanes[focusedPaneIndex - 1];
    const fileName = owner?.activeTab ?? activeTab;
    if (fileName && fileName === (owner?.runtime ?? primaryRuntime).fileName && !isBuiltin(fileName) && !isVaultLocationTabId(fileName)) {
      workbenchHistory.visit(fileName);
    }
  };

  // --- 模拟管理器 ---
  let simManager = createSimManager(
    graph, () => gw, () => gh,
    () => linkDist, () => linkStr, () => charge, () => centerS,
    () => collideR, () => groupBound,
    () => alphaTarget, () => heatingTime,
    () => getCollapsedHierarchyHiddenNodeIds(graph),
    () => draw()
  );
  primaryRuntime = new GraphRuntime('demo', graph, undoManager);
  primaryRuntime.simManager = simManager;
  runtimeRegistry.acquire('demo', pane0, () => primaryRuntime);
  const getSim = () => simManager.getSim();

  // --- Pane 1 (右窗格) ---
  let pane1 = createPaneState(PANE_RIGHT, pane1Container);
  pane1.pixi = null; // will be synced from pixi1 after init
  // This must exist before buildSettings reads through the focused-pane proxy.
  // The remaining parallel arrays depend on Pixi/simulation values initialized later.
  const extraPanes: PaneState[] = [pane1];
  let disposePane0CanvasEvents: (() => void) | null = null;
  const bindCanvasEvents = (pane: PaneState, canvas: HTMLCanvasElement, ctx: ReturnType<typeof bindPaneEvents>) => {
    pane.disposeCanvasEvents?.();
    pane.disposeCanvasEvents = setupCanvasEvents(canvas, ctx);
  };
  const bindPane0CanvasEvents = (canvas: HTMLCanvasElement, ctx: ReturnType<typeof bindPaneEvents>) => {
    disposePane0CanvasEvents?.();
    disposePane0CanvasEvents = setupCanvasEvents(canvas, ctx);
  };
  let focusedPaneIndex = PANE_LEFT;
  let syncFocusedCommands = () => {};
  const referenceNavigationInFlight = new Set<number>();
  const syncVaultSpaceBreadcrumb = () => {
    const tabId = focusedPaneIndex === PANE_LEFT
      ? activeTab
      : (extraPanes[focusedPaneIndex - 1]?.activeTab || '');
    const stack = referenceJourneys.get(focusedPaneIndex) || [];
    const candidate = stack[stack.length - 1];
    const journey = candidate && (
      (candidate.targetKind === 'vault' && isVaultLocationTabId(tabId))
      || (candidate.targetKind === 'graph' && candidate.targetTab === tabId)
    ) ? candidate : null;
    if (
      candidate
      && !journey
      && !isVaultLocationTabId(tabId)
      && !referenceNavigationInFlight.has(focusedPaneIndex)
    ) referenceJourneys.delete(focusedPaneIndex);
    vaultSpaceBreadcrumb.update(vaultIndex, tabId, journey ? {
      originLabel: journey.originLabel,
      targetLabel: journey.targetLabel,
    } : null);
  };
  const vaultViewportSaveTimers = new WeakMap<object, ReturnType<typeof setTimeout>>();
  const paneGraphLoads = new WeakMap<PaneState, symbol>();
  const panePixi = (pane: PaneState) => pane.index === PANE_LEFT ? pixi : pane.pixi;
  const paneBoxSelection = new WeakMap<PaneState, () => CanvasBoxSelection>();
  const paneLoadedTab = (pane: PaneState) => pane.index === PANE_LEFT
    ? (primaryRuntime?.fileName || activeTab)
    : (pane.runtime?.fileName || pane.activeTab);
  const saveVaultViewportForPane = (pane: PaneState, tabId = paneLoadedTab(pane)) => {
    if (!isVaultLocationTabId(tabId)) return;
    const viewport = panePixi(pane)?.viewport;
    if (!viewport) return;
    vaultViewportMemory.save(tabId, {
      centerX: viewport.center.x,
      centerY: viewport.center.y,
      scale: viewport.scale.x,
    });
  };
  const scheduleVaultViewportSave = (pane: PaneState) => {
    const tabId = paneLoadedTab(pane);
    if (!isVaultLocationTabId(tabId)) return;
    const loading = paneGraphLoads.get(pane);
    const prior = vaultViewportSaveTimers.get(pane);
    if (prior) clearTimeout(prior);
    const timer = setTimeout(() => {
      vaultViewportSaveTimers.delete(pane);
      if (paneGraphLoads.get(pane) === loading && paneLoadedTab(pane) === tabId) saveVaultViewportForPane(pane, tabId);
    }, 160);
    vaultViewportSaveTimers.set(pane, timer);
  };
  const restoreVaultViewportForPane = (pane: PaneState, tabId: string): boolean => {
    const state = vaultViewportMemory.load(tabId);
    const viewport = panePixi(pane)?.viewport;
    if (!state || !viewport) return false;
    viewport.setZoom(state.scale, false);
    viewport.moveCenter(state.centerX, state.centerY);
    return true;
  };

  function beginPaneGraphLoad(pane: PaneState, nextFile: string) {
    const token = Symbol();
    paneGraphLoads.set(pane, token);
    const pendingSave = vaultViewportSaveTimers.get(pane);
    if (pendingSave) clearTimeout(pendingSave);
    vaultViewportSaveTimers.delete(pane);
    saveVaultViewportForPane(pane);

    if (paneLoadedTab(pane) !== nextFile) {
      if (pane.searchDebounceTimer) clearTimeout(pane.searchDebounceTimer);
      pane.searchDebounceTimer = null;
      pane.search = '';
      pane.searchMatchIndex = -1;
      pane.lastSearchTerm = '';
    }
    pane.currentAnimationCancel?.();
    pane.currentAnimationCancel = null;
    pane.selNode = null;
    pane.selEdge = null;
    pane.selGroup = null;
    pane.semanticLensState = null;
    const viewport = panePixi(pane)?.viewport;
    viewport?.plugins.remove('animate');
    viewport?.plugins.reset();
    if (pane.index === PANE_LEFT) {
      savedFixedNodes = [];
      savedGroupModes = [];
      if (_starRaf !== null) cancelAnimationFrame(_starRaf);
      _starRaf = null;
      _wasd.vx = _wasd.vy = 0;
      _skipDraw = false;
    } else {
      pane.savedFixedNodes = [];
      pane.savedGroupModes = [];
    }
    return () => paneGraphLoads.get(pane) === token;
  }

  function restorePaneOpeningViewport(pane: PaneState, tabId: string): boolean {
    if (restoreVaultViewportForPane(pane, tabId)) return true;
    const viewport = panePixi(pane)?.viewport;
    if (viewport) {
      viewport.setZoom(1, false);
      viewport.moveCenter(0, 0);
    }
    return false;
  }

  // 配置同步：singletons ↔ PaneState
  function saveConfigTo(to: PaneState) {
    const all: any = { linkDist, labelSize, charge, linkStr, collideR, centerS, groupBound, heatingTime, alphaTarget, editPanelOpacity, useRAFL, nodeExpand, lineExpand, showGLabels, glMin, glMax, gridVis, gridMode, axisVis, axisTicks, gridSp, gridWidth, ar, graphTheme, focusMode, centerMode, selectedTooltip, glowAppearance, layoutMode: activeMode, gridSnapEnabled, partialGridSnap, nodeColorStyle, fixedHollow, fontFamily, cardBorderStyle, gw, gh };
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
    glowAppearance = from.glowAppearance; layoutMode = normalizeLayoutMode(from.layoutMode);
    gridSnapEnabled = from.gridSnapEnabled; partialGridSnap = from.partialGridSnap;
    nodeColorStyle = from.nodeColorStyle; fixedHollow = from.fixedHollow;
    fontFamily = from.fontFamily; cardBorderStyle = from.cardBorderStyle || 'straight'; gw = from.gw; gh = from.gh;
    activeMode = from.activeMode; treeMode = from.treeMode;
    categoryMode = from.categoryMode; fullCatMode = from.fullCatMode;
  }

  // pane0 配置备份（切到 pane1 时暂存 singletons）
  const pane0Config: Record<string, any> = {};

  let syncSearchControlsFromFocusedPane: () => void = () => {};
  let refreshOpenViewMenu = () => {};
  function commitAppearanceInput() {
    const control = document.activeElement;
    if (control instanceof HTMLInputElement && control.type === 'number' && setDiv.contains(control)) control.blur();
  }

  function syncFocusedGraphAppearance() {
    const pane = focusedPaneState();
    applyUIToFocusedPane(pane.graphTheme);
    document.documentElement.style.setProperty('--fg-font-family', pane.fontFamily);
    setNodeFontFamily(pane.fontFamily);
    updateOpacity(pane.editPanelOpacity);
    settingsUI.updateInfo();
  }

  function switchFocusedPane(toIndex: number) {
    if (focusedPaneIndex === toIndex || toIndex >= extraPanes.length + 1) return;
    commitAppearanceInput();
    focusedPaneIndex = toIndex;
    const targetMode = toIndex === PANE_LEFT ? activeMode : extraPanes[toIndex - 1]?.activeMode;
    if (targetMode && ['cardgrid', 'category', 'fullcat'].includes(targetMode)) boxSelectMode = false;
    syncFocusedGraphAppearance();
    // 文件树同步到聚焦窗格的活动文件
    const targetFile = toIndex === PANE_LEFT ? activeTab
      : toIndex === PANE_RIGHT ? pane1.activeTab
      : (extraPanes[toIndex - 1]?.activeTab ?? BUILTIN_NAMES[0]);
    sidebar.syncActiveFile(targetFile);
    syncVaultSpaceBreadcrumb();
    syncSpaceNavigation();
    syncFocusedCommands();
    syncSearchControlsFromFocusedPane();
    refreshOpenViewMenu();
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
    () => getCollapsedHierarchyHiddenNodeIds(pane1.graph),
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

  const canvasEmptyStates = new WeakMap<HTMLElement, ReturnType<typeof createCanvasEmptyState>>();
function renderPane(px: PixiLayers, g: GraphData, sm: any, sp: Map<string, NodeSprite>, st: PaneState) {
    if (st.textViewActive) {
      canvasEmptyStates.get(st.canvasContainer)?.update(false, false);
      clearPaneStructureBoundaries(st);
      return;
    }
    ensureGraphResourceReferencePreviews(g);
    ensureGraphSpaceReferences(g, paneLoadedTab(st));
    const graph = st.structureView?.graph ?? g;
    const pixi = px;
    const simManager = st.structureView?.simManager ?? sm;
    const nodeSprites = sp;
    const undoManager = st.undoManager;
    const getSim = () => simManager.getSim();

    if (!pixi) return;
    const sim = getSim();
    if (!sim) return;
    const isCardMode = st.activeMode === 'cardgrid' || st.activeMode === 'category' || st.activeMode === 'fullcat';
    const cardController = isCardMode && st.layout.current instanceof CardGridController
      ? st.layout.current
      : null;
    // 卡片坐标必须先于节点和共享光晕层绘制同步，避免重画上一帧/上一张图的位置。
    if (isCardMode && st.layout.current) st.layout.update();
    const structureProjection = st.structureView
      ? { nodes: graph.nodes || [], edges: graph.edges || [], hiddenNodeIds: new Set<string>() }
      : getStructureProjection(graph);
    const nodes = isCardMode ? structureProjection.nodes : (sim.nodes() || []);
    // The simulation is authoritative only for coordinates. In auto-layout
    // transitions it may deliberately contain id-only views, so every visible
    // title must come from the graph data whenever that node still exists.
    const graphNodeById = new Map<string, any>(graph.nodes.map((node: any) => [node.id, node]));
    const theme = getTheme(st.graphTheme);
    const lblColor = parseInt(theme.labelColor.replace('#', ''), 16);
    const surfaceColor = parseInt(theme.uiPanelBackground.replace('#', ''), 16);
    const defColor = parseInt(theme.nodeDefaultColor.replace('#', ''), 16);
    const isDarkTheme = ((c: string) => {
      const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(c);
      if (!m) return true;
      return (parseInt(m[1], 16) * 299 + parseInt(m[2], 16) * 587 + parseInt(m[3], 16) * 114) / 1000 < 128;
    })(theme.canvasBackground);
    const expandedBoundaryIds = new Set<string>();
    if (st.structureView || isCardMode) {
      if (st.structureBoundaryShapes.size > 0 || st.hoverStructureId) clearPaneStructureBoundaries(st);
    } else {
      const simNodesById = new Map<string, any>(nodes.map((node: any) => [node.id, node]));
      const boundaryModels = getExpandedStructureBoundaryModels(graph).flatMap(model => {
        const memberPositions = model.memberIds.flatMap(memberId => {
          const member = simNodesById.get(memberId);
          return member && Number.isFinite(member.x) && Number.isFinite(member.y)
            ? [{ id: memberId, x: member.x, y: member.y, visualRadius: getNodeVisualRadius(member) }]
            : [];
        });
        const shape = computeStructureBoundary(memberPositions);
        if (!shape) return [];
        st.structureBoundaryShapes.set(model.structureId, shape);
        expandedBoundaryIds.add(model.structureId);
        return [resolveMembershipDragBoundaryModel({
          id: model.structureId,
          label: model.label,
          summary: model.summary,
          color: model.color,
          shape,
          memberCount: model.memberCount,
          externalLinkCount: model.externalEdgeCount,
          selected: st.selNode === model.structureId,
          hovered: st.hoverStructureId === model.structureId,
          memberPositions,
        }, st.membershipDragPreview)];
      });
      for (const structureId of [...st.structureBoundaryShapes.keys()]) {
        if (!expandedBoundaryIds.has(structureId)) st.structureBoundaryShapes.delete(structureId);
      }
      if (st.hoverStructureId && !expandedBoundaryIds.has(st.hoverStructureId)) st.hoverStructureId = null;
      const selectedStructure = st.selNode
        ? graph.nodes.find((node: any) => node.id === st.selNode && isStructureNode(node))
        : null;
      if (selectedStructure && !selectedStructure.structure.collapsed && !expandedBoundaryIds.has(selectedStructure.id)) st.selNode = null;
      updateStructureBoundaries(pixi.structureLayer, boundaryModels, {
        theme: {
          accent: st.themeAccentColor,
          labelColor: lblColor,
          isDark: isDarkTheme,
          zoom: pixi.viewport.scale.x,
        },
        membershipDragPreview: st.membershipDragPreview,
        drawMembershipLines: true,
      });
    }

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

    let emptyState = canvasEmptyStates.get(st.canvasContainer);
    if (!emptyState && nodes.length === 0) {
      emptyState = createCanvasEmptyState(st.canvasContainer, () => {
        switchFocusedPane(st.index);
        createNodeInFocusedPane();
      }, () => {
        switchFocusedPane(st.index);
        void showWorkbench();
      });
      canvasEmptyStates.set(st.canvasContainer, emptyState);
    }
    emptyState?.update(nodes.length === 0,
      graph.settings?.sourceMode === 'vault-readonly' || !!st.structureView || !!st.localContextProjection);
    const accentHex = '#' + st.themeAccentColor.toString(16).padStart(6, '0');
    const defaultNodeColor = (lv?: number) => {
      const level = Math.max(1, Math.min(6, Number.isFinite(lv) && lv !== 0 ? Math.round(lv!) : 6));
      return theme.headingColors?.[level - 1]
        ?? '#' + getHeadingColor(lv || 6, accentHex, isDarkTheme).toString(16).padStart(6, '0');
    };
    const resolveNodeColor = (n: any) => {
      const visualNode = graphNodeById.get(n.id) ?? n;
      const explicitColor = getExplicitGraphColor(visualNode, 'node');
      if (explicitColor) return explicitColor;
      switch (st.nodeColorStyle) {
        case 'uniform': return theme.nodeDefaultColor;
        case 'spectrum': return '#' + getSpectrumColor(visualNode.headingLevel || 6, isDarkTheme, accentHex).toString(16).padStart(6, '0');
        case 'spectrum-narrow': return '#' + getNarrowSpectrumColor(visualNode.headingLevel || 6, isDarkTheme, accentHex).toString(16).padStart(6, '0');
        default: return defaultNodeColor(visualNode.headingLevel || 6);
      }
    };

    // 搜索、结果跳转和高亮共用一套规则；结构成员关系作为计算标签参与搜索。
    const graphSearchResults = st.search
      ? searchGraph(graph, st.search, st.sField as SearchField, st.sMatchMode as SearchMatchMode)
      : [];
    const searchMatchIds = new Set(graphSearchResults.map(result => result.nodeId));
    // A hit inside a collapsed structure should illuminate its visible shell as
    // well; otherwise “only show” can correctly find a note yet display nothing.
    for (const result of graphSearchResults) {
      const sourceNode = graphNodeById.get(result.nodeId);
      if (sourceNode?.structureParentId && structureProjection.hiddenNodeIds.has(result.nodeId)) {
        searchMatchIds.add(sourceNode.structureParentId);
      }
    }
    const showOnlyMode = st.sDisplayMode === 'show' && st.search;

    // 框选集
    const boxSelIds = new Set(sharedState.selectedNodeIds);

    // --- 计算隐藏节点（搜索 + 层级折叠 + 结构收束）---
    const hiddenNodes = new Set<string>(structureProjection.hiddenNodeIds);
    if (showOnlyMode) {
      for (const n of nodes) { if (!searchMatchIds.has(n.id)) hiddenNodes.add(n.id); }
    }
    for (const id of getCollapsedHierarchyHiddenNodeIds(graph)) hiddenNodes.add(id);
    sharedState.hiddenNodeIds = () => hiddenNodes;

    const semanticScene = (graph as any)._semanticScene;
    const semanticRegions = semanticScene?.regions;
    const semanticLens = semanticScene?.lens ?? st.semanticLensState;
    const showTextHints = !!st.localContext
      || (graph.settings?.semanticCardDensity ?? DEFAULT_SEMANTIC_CARD_DENSITY) !== 'nodes';
    if (st.activeMode === 'auto' && showTextHints && Array.isArray(semanticRegions)) {
      renderSemanticScene(pixi.semanticLayer, semanticRegions, {
        nodes,
        echoes: Array.isArray(semanticScene?.echoes) ? semanticScene.echoes : [],
        focusNodeId: st.localContext?.currentId || st.selNode || sharedState.focusHoverNodeId || null,
        localContext: st.localContext,
        accentColor: st.themeAccentColor,
        accentAltColor: st.themeAccentAltColor,
        zoom: pixi.viewport.scale.x,
        regionLabelBudget: semanticLens?.regionLabelBudget,
        echoBudget: semanticLens?.echoBudget,
      });
    } else {
      clearSemanticScene(pixi.semanticLayer);
    }

    // 有子节点的集合（用于折叠省略号判断）
    const hasChildrenSet = new Set<string>();
    for (const edge of structureProjection.edges) {
      if (edge._dyingAt || edge._structureMembership) continue;
      const source = typeof edge.source === 'object' ? edge.source?.id : edge.source;
      const target = typeof edge.target === 'object' ? edge.target?.id : edge.target;
      const from = graphNodeById.get(source), to = graphNodeById.get(target);
      if (source !== target && from && to && (to.headingLevel || 6) >= (from.headingLevel || 6)) hasChildrenSet.add(source);
    }

    // 每帧重新检测鼠标悬停（节点可能移出鼠标）
    sharedState.reevaluateHover?.();

    // 聚焦邻居集（hover + 选中 并行，取并集）
    const focusNeighborIds = new Set<string>();
    const focusEdgeIndices = new Set<number>();
    let focusActive = false;

    function addFocusNode(nodeId: string) {
      focusNeighborIds.add(nodeId);
      structureProjection.edges.forEach((e, idx) => {
        const src = typeof e.source === 'object' ? e.source.id : e.source;
        const tgt = typeof e.target === 'object' ? e.target.id : e.target;
        if (src === nodeId) { focusNeighborIds.add(tgt); focusEdgeIndices.add(idx); }
        if (tgt === nodeId) { focusNeighborIds.add(src); focusEdgeIndices.add(idx); }
      });
    }
    if (sharedState.focusMode && !st.localContext) {
      // 悬浮聚焦锁存到下一节点或点击节点外区域
      if (sharedState.focusHoverNodeId) {
        focusActive = true;
        addFocusNode(sharedState.focusHoverNodeId);
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
    if (st.spaceFocusNodeIds?.length) {
      const fragmentIds = new Set(st.spaceFocusNodeIds);
      focusActive = true;
      for (const id of fragmentIds) focusNeighborIds.add(id);
      structureProjection.edges.forEach((edge, index) => {
        const source = String(typeof edge.source === 'object' ? edge.source.id : edge.source);
        const target = String(typeof edge.target === 'object' ? edge.target.id : edge.target);
        if (fragmentIds.has(source) && fragmentIds.has(target)) focusEdgeIndices.add(index);
      });
    }
    if (st.localContext) {
      const memberIds = localContextMemberIds(st.localContext);
      focusActive = true;
      for (const id of memberIds) focusNeighborIds.add(id);
      const internalEdges = localContextInternalEdgeIndexes(graph, st.localContext);
      for (const index of internalEdges) focusEdgeIndices.add(index);
    }
    syncLocalContextNavigator(st);

    // 动画中的节点暂不视为隐藏（光晕、节点、连线保持一致）
    const animatingIds = new Set<string>();
    for (const n of nodes) {
      if ((n as any)._collapseAnim || (n as any)._expandAnim) animatingIds.add(n.id);
    }
    for (const aid of animatingIds) {
      if (!structureProjection.hiddenNodeIds.has(aid) && (!showOnlyMode || searchMatchIds.has(aid))) hiddenNodes.delete(aid);
    }

    // Dragged nodes snap on release. Fixed anchors follow their snapped coordinates.
    if (st.gridSnapEnabled || st.partialGridSnap) {
      for (const n of nodes) {
        if (n.id === st.draggingNode?.id || !st.gridSnapEnabled && !n.fixed) continue;
        const [sx, sy] = snapPosToGrid(n.x, n.y, st.gridSp);
        n.x = sx; n.y = sy;
        if (n.fx != null) n.fx = sx;
        if (n.fy != null) n.fy = sy;
      }
    }

    const now = performance.now();
    // --- 光晕层 ---
    if (st.glowAppearance) {
      const darkCanvas = isThemeDark(theme);
      const blur = darkCanvas ? darkNodeGlow : lightNodeGlow;
      if (pixi.blobLayer.filters?.[0] !== blur) pixi.blobLayer.filters = [blur];
      const minimumGlowSpread = (darkCanvas ? 11 : 13) / Math.max(0.45, pixi.viewport.scale.x);
      pixi.blobLayer.visible = true;
      let bg = pixi.blobLayerGfx;
      if (!bg || bg.destroyed) {
        bg = new Graphics();
        pixi.blobLayerGfx = bg;
        pixi.blobLayer.addChild(bg);
      }
      bg.clear();
      for (const n of nodes) {
        if (hiddenNodes.has(n.id) || expandedBoundaryIds.has(n.id)) continue;
        if (st.activeMode === 'auto' && (n as any)._semanticCard?.form !== 'node') continue;
        const nr = getNodeVisualRadius(n);
        const colorStr = resolveNodeColor(n);
        const color = parseInt((darkCanvas ? colorStr : darken(colorStr, 0.18)).replace('#', ''), 16);
        // 光晕跟随节点视觉动画同步过渡，使用与 pixi-nodes.ts applyNodeVisual 相同的公式
        const ca = (n as any)._collapseAnim;
        const ea = (n as any)._expandAnim;
        const baseGlowAlpha = (n.headingLevel || 6) <= 2 ? 0.18 : 0.13;
        let glowScale: number;
        let glowAlpha: number;
        if (ca) {
          const t = Math.min(1, Math.max(0, (now - ca.startTime) / ANIM_DURATION));
          const scaleT = Math.min(1, t / 0.65);
          if (scaleT < 0.15) {
            glowScale = 1 + (scaleT / 0.15) * 0.12;
          } else {
            const ts = (scaleT - 0.15) / 0.85;
            glowScale = 1.12 * (1 - ts * ts * ts);
            glowScale = Math.max(0.01, glowScale);
          }
          glowAlpha = baseGlowAlpha * Math.max(0, 1 - scaleT * scaleT);
        } else if (ea) {
          const t = Math.min(1, Math.max(0, (now - ea.startTime) / ANIM_DURATION));
          glowScale = Math.max(0.01, 1 - Math.pow(1 - t, 3));
          glowAlpha = baseGlowAlpha * t;
        } else {
          glowScale = 1;
          glowAlpha = baseGlowAlpha;
        }
        const r = (nr + Math.max(nr * 0.8, minimumGlowSpread)) * glowScale;
        const alpha = darkCanvas ? glowAlpha : Math.min(0.58, glowAlpha * 1.7);
        if (alpha > 0.01) bg.circle(n.x, n.y, r).fill({ color, alpha });
      }
    } else {
      const bg = pixi.blobLayerGfx;
      bg?.clear?.();
      pixi.blobLayer.visible = false;
    }

    // 同步折叠状态：graph node → sim node（确保 applyNodeVisual 读到正确值）
    for (const n of nodes) {
      const gn = graphNodeById.get(n.id);
      if (gn) n.collapsed = gn.collapsed || false;
    }

    // 先清理隐藏/不存在节点的 sprite（避免旧光晕残留）
    const aliveIds = new Set(nodes.map((n: any) => n.id));
    for (const [id, sprite] of nodeSprites) {
      if (!aliveIds.has(id) || expandedBoundaryIds.has(id) || (hiddenNodes.has(id) && !animatingIds.has(id))) {
        pixi.nodeLayer.removeChild(sprite.container);
        sprite.container.destroy({ children: true });
        nodeSprites.delete(id);
      }
    }

    // --- 节点 ---
    // 构建所有节点的显色映射（含隐藏节点，供连线渐变色用）
    const nodeColorMap = new Map<string, number>();
    for (const n of nodes) {
      const colorStr = resolveNodeColor(n);
      nodeColorMap.set(n.id, parseInt(colorStr.replace('#', ''), 16));
    }
    for (const n of nodes) {
      if (hiddenNodes.has(n.id) || expandedBoundaryIds.has(n.id)) continue;
      const id = n.id;
      const displayLabel = resolveNodeDisplayLabel(n, graphNodeById);
      const graphNodeForVisual = graphNodeById.get(id) as any;
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

      const nodeRadius = getConfiguredNodeRadius(n);
      const baseNodeLabelSize = Math.max(12, Math.min(28, Math.round(nodeRadius * 0.8 + 7)));
      const cardViewScale = cardController?.getNodeViewScale(id) ?? 1;
      const nodeLabelSize = isCardMode
        ? getCardLabelSize(baseNodeLabelSize, cardViewScale)
        : baseNodeLabelSize;
      let sprite = nodeSprites.get(id);
      if (!sprite) {
        const colorStr = resolveNodeColor(n);
        const color = parseInt(colorStr.replace('#', ''), 16);
        sprite = createNodeSprite(id, displayLabel, n.x, n.y, nodeRadius, color, lblColor, nodeLabelSize);
        pixi.nodeLayer.addChild(sprite.container);
        nodeSprites.set(id, sprite);
      } else {
        updateNodePosition(sprite, n.x, n.y);
        sprite.label.text = displayLabel;
      }

      // 标签在缩放 0.3-0.45 区间淡入淡出，并与折叠/展开动画同步过渡
      sprite.radius = nodeRadius;
	      const zoom = pixi.viewport.scale.x;
      const zoomAlpha = st.activeMode === 'auto'
        ? semanticZoomProfile(zoom, semanticLens?.band).titleAlpha
        : Math.max(0, Math.min(1, (zoom - 0.3) / 0.15));
      // 折叠/展开动画中标签与节点同步淡入淡出
      let animLabelMult = 1;
      if (collapseProgress >= 0) animLabelMult = Math.max(0, 1 - collapseProgress * collapseProgress);
      else if (expandProgress >= 0) animLabelMult = Math.min(1, expandProgress);
      const labelAlpha = zoomAlpha * animLabelMult;
      sprite.label.visible = labelAlpha > 0;
      sprite.label.alpha = labelAlpha;

      // 组颜色
      const matchingGroups = (graph.groups || []).filter((g: any) => g.displayMode !== 'none' && g.nodeColorMode && g.nodeColorMode !== 'off' && isNodeInGroup(n, g));
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
      const nodeLabelSize2 = nodeLabelSize;

      applyNodeVisual(sprite, baseColor, lblColor, nodeLabelSize2, {
        fontFamily: st.fontFamily,
        selected: n.id === st.selNode,
        boxSelected: boxSelIds.has(id),
        searchMatch: searchMatchIds.has(id),
        fixed: n.fixed || false,
        fixedHollow: st.fixedHollow,
        collapsed: !!graphNodeForVisual?.collapsed,
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
        mediaType: graphNodeForVisual?.mediaType || n.mediaType || undefined,
        surfaceColor,
        vaultResourceKind: graphNodeForVisual?.sourceRef?.kind || n.sourceRef?.kind || (n as any).vaultRole || undefined,
        resourceReferenceKind: graphNodeForVisual?.resourceRef?.kind || n.resourceRef?.kind || undefined,
        resourceReferenceStatus: graphNodeForVisual?._resourceReferenceStatus || n._resourceReferenceStatus || undefined,
        resourceReferencePreview: graphNodeForVisual?._resourceReferencePreview || n._resourceReferencePreview || undefined,
        spaceReferenceKind: graphNodeForVisual?.spaceRef?.kind || n.spaceRef?.kind || undefined,
        spaceReferenceStatus: graphNodeForVisual?._spaceReferenceStatus || n._spaceReferenceStatus || undefined,
        spaceReferencePreview: graphNodeForVisual?._spaceReferencePreview || n._spaceReferencePreview || undefined,
        spaceReferenceMiniMap: graphNodeForVisual?._spaceReferenceMiniMap || n._spaceReferenceMiniMap || undefined,
        localContextProxy: isCrossSpaceProxyNode(graphNodeForVisual || n),
        mediaExpanded: isExpanded(n.id),
        mediaUrl: n.mediaUrl || undefined,
        hyperlink: n.hyperlink || undefined,
        structureMemberCount: isStructureNode(n) ? n.structure.memberIds.length : undefined,
        semanticCard: st.activeMode === 'auto' ? (n as any)._semanticCard : undefined,
        semanticZoom: st.activeMode === 'auto' ? pixi.viewport.scale.x : undefined,
        semanticTransitionAlpha: st.activeMode === 'auto' ? animLabelMult : undefined,
      });
      if ((n as any)._isNew) (n as any)._isNew = false;

    }

    // 以实际绘制的连线索引计算折叠、分组隐藏与动画透明度。
    const cardHiddenEdgeIndices = isCardMode ? new Set(st.layout.hiddenEdgeIndices(structureProjection.edges)) : null;
    const renderEdgesWithIndexes = structureProjection.edges.flatMap((edge: any, projectionIndex: number) =>
      edge._structureMembership && !isCardMode ? [] : [{ edge, projectionIndex }],
    );
    const renderEdges = renderEdgesWithIndexes.map(item => item.edge);
    const edgeGraph = { ...graph, edges: renderEdges };
    const collapsedEdgeIndices = new Set<number>();
    const collapseEdgeFade = new Map<number, number>();
    const nodeAnimationById = new Map<string, any>(
      nodes.filter((node: any) => animatingIds.has(node.id)).map((node: any) => [node.id, node]),
    );
    const edgeEndpointAlpha = (node: any) => {
      const animation = node?._collapseAnim ?? node?._expandAnim;
      if (!animation) return 1;
      const progress = Math.min(1, Math.max(0, (now - animation.startTime) / ANIM_DURATION));
      return node._collapseAnim ? 1 - progress : progress;
    };
    renderEdgesWithIndexes.forEach(({ edge, projectionIndex }, renderIndex) => {
      const source = typeof edge.source === 'object' ? edge.source?.id : edge.source;
      const target = typeof edge.target === 'object' ? edge.target?.id : edge.target;
      const sourceNode = graphNodeById.get(source);
      const targetNode = graphNodeById.get(target);
      const sourceAnim = nodeAnimationById.get(source), targetAnim = nodeAnimationById.get(target);
      const foldedBranch = !edge._structureMembership && source !== target && sourceNode?.collapsed
        && (targetNode?.headingLevel || 6) >= (sourceNode.headingLevel || 6)
        && !sourceAnim?._collapseAnim && !targetAnim?._collapseAnim;
      if (cardHiddenEdgeIndices?.has(projectionIndex) || foldedBranch) {
        collapsedEdgeIndices.add(renderIndex);
        return;
      }
      const alpha = Math.min(edgeEndpointAlpha(sourceAnim), edgeEndpointAlpha(targetAnim));
      if (alpha < 1) collapseEdgeFade.set(renderIndex, alpha);
    });
    const hasProjectedEdges = renderEdges.some((edge: any) => edge._originalIndex !== undefined);
    const boxEdges = paneBoxSelection.get(st.index === PANE_LEFT ? pane0 as unknown as PaneState : st)?.().edges;
    const boxSelectedEdgeIndices = boxEdges && new Set(renderEdges.flatMap((edge, index) => {
      const original = edge._originalIndex === undefined ? edge : graph.edges[edge._originalIndex];
      return boxEdges.has(original) ? [index] : [];
    }));
    const renderFocusEdgeIndices = focusActive
      ? new Set(renderEdgesWithIndexes.flatMap((item, renderIndex) => focusEdgeIndices.has(item.projectionIndex) ? [renderIndex] : []))
      : undefined;
    const edgeRenderNodes = expandedBoundaryIds.size === 0
      ? nodes
      : nodes
        .filter((node: any) => !expandedBoundaryIds.has(node.id))
        .concat(paneStructureBoundaryEndpoints(st));
    updateEdges(pixi.edgeLayer, edgeGraph, edgeRenderNodes, {
      hiddenNodes,
      focusNeighborIds: focusActive ? focusNeighborIds : undefined,
      focusEdgeIndices: renderFocusEdgeIndices,
      collapsedEdgeIndices: collapsedEdgeIndices.size > 0 ? collapsedEdgeIndices : undefined,
      collapseEdgeFade: collapseEdgeFade.size > 0 ? collapseEdgeFade : undefined,
      selectedEdgeIndex: hasProjectedEdges ? null : st.selEdge,
      boxSelectedEdgeIndices: boxSelectedEdgeIndices ?? undefined,
      nodeColorMap: (st.edgeColorGradient || st.edgeWidthByLevel) ? nodeColorMap : undefined,
      edgeColorGradient: st.edgeColorGradient,
      edgeWidthByLevel: st.edgeWidthByLevel,
      semanticMode: st.activeMode === 'auto',
      darkTheme: isDarkTheme,
      semanticColors: theme.edgeColors,
      labelColor: theme.labelColor,
      fontFamily: st.fontFamily,
      treeMode: st.activeMode === 'tree',
      semanticZoom: pixi.viewport.scale.x,
      semanticFocusNodeId: st.localContext?.currentId || st.selNode || null,
      semanticLabelBudget: semanticLens?.edgeLabelBudget,
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
          .stroke({ color: st.themeAccentColor, width: 2, alpha: 0.5 });
        // 端点头
        lg.circle(previewX, previewY, 3).fill({ color: st.themeAccentColor, alpha: 0.6 });
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
      // 卡片模式/分类模式下跳过集合渲染（卡片层已处理）
      if (st.activeMode !== 'cardgrid' && st.activeMode !== 'category' && st.activeMode !== 'fullcat') {
        updateGroups(pixi.groupLayer, graph, nodes.filter((n: any) => !hiddenNodes.has(n.id)), st.showGLabels, st.glMin, st.glMax, { enabled: st.gridSnapEnabled, spacing: st.gridSp });
      }
    }
    // 卡片网格渲染（卡片布局 / 分类 / 全分类）
    if (isCardMode && st.layout.current) {
      st.layout.render(st.themeAccentColor);
    } else if (!isCardMode) {
      clearCards(pixi.cardLayer);
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
        if (ov?.dataset.mediaPresentation === 'preview') ov.style.transform = `scale(${scale})`;
      }
    }
    updateGwGh();
    // 网格用 canvas 实际 CSS 尺寸
    const cw = pixi.app.canvas.clientWidth;
    const ch = pixi.app.canvas.clientHeight;
    updateGrid(pixi.gridLayer, cw, ch, {
      gridVis: st.gridVis, gridMode: st.gridMode, axisVis: st.axisVis, axisTicks: st.axisTicks, gridSp: st.gridSp, gridWidth: st.gridWidth,
      color: parseInt((theme.gridColor ?? '#888888').slice(1), 16),
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

    // 选中节点的内容预览让位于悬停预览。
    if (st.index === focusedPaneIndex) {
      if (st.selectedTooltip && st.selNode && !sharedState.hoverNodeId && !inlineNodeTitle.isActive()) {
        const sn = nodes.find((n: any) => n.id === st.selNode);
        const gn = graph.nodes.find((n: any) => n.id === st.selNode);
        if (gn?.note?.trim() && sn) {
          const point = pixi.viewport.toScreen(sn.x, sn.y);
          const canvas = pixi.app.canvas.getBoundingClientRect();
          const radius = sn._semanticCard?.form === 'card' ? sn._semanticCard.width / 2 : getNodeVisualRadius(sn);
          selectedNotePreview.show(gn.label ?? '', gn.note, canvas.left + point.x, canvas.top + point.y, radius * pixi.viewport.scale.x, canvas);
        } else selectedNotePreview.hide();
      } else selectedNotePreview.hide();
    }
    // 节点固定动画自保持：即使模拟停止也继续渲染直到过渡完成
    let hasFixedAnim = false;
    for (const [, sprite] of nodeSprites) {
      if ((sprite as any)._fixedAnimRaf) { hasFixedAnim = true; break; }
    }
    if (hasFixedAnim && ((renderPane as any)._lastAnimFrame !== frameCount)) {
      (renderPane as any)._lastAnimFrame = frameCount;
      requestAnimationFrame(() => sharedState.directDraw?.());
    }
    } catch (e) { console.error('pixiDraw error:', e); }
  
}
  // 帧计数器用于降频和非聚焦优化
  let frameCount = 0;
  // 左窗格预分配 state（复用对象，避免每帧 GC）
  const pane0St = {
    index: 0, activeTab: '', openTabs: [] as string[], dirtyTabs: new Set<string>(),
    layout: pane0Layout,
    pixi: null as any, canvasContainer: null as any,
    nodeSprites: null as any, readyToDraw: false, textViewActive: false, get simManager() { return simManager; },
    _lastDragNodeId: null, searchMatchIndex: -1, lastSearchTerm: "",
    searchDebounceTimer: null, currentAnimationCancel: null,
    savedFixedNodes: [] as any[], savedGroupModes: [] as any[], layouts: [] as any[],
    updateInfoRef: { current: () => {} }, updateSelectsRef: { current: () => {} },
    saveTimeout: null,
  } as PaneState;
  const pane0Draw = () => {
    if (pane0St.textViewActive) return;
    // 刷新动态属性（引用型直接赋，不改对象结构）
    const s = pane0St;
    s.canvasContainer = pixiContainer;
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
    s.edgeColorGradient = edgeColorGradient; s.edgeWidthByLevel = edgeWidthByLevel;
    s.cardBorderStyle = cardBorderStyle;
    s.draggingNode = draggingNode; s.wasDragged = wasDragged;
    s.search = search; s.sField = sField; s.sDisplayMode = sDisplayMode; s.sMatchMode = sMatchMode;
    s.linkMode = linkMode; s.linkSrc = linkSrc;
    s.linkCursorX = linkCursorX; s.linkCursorY = linkCursorY;
    s.defArrow = defArrow;
    s.themeAccentColor = _pane0AccentColor; s.themeAccentAltColor = _pane0AccentAltColor;
    s.treeMode = treeMode; s.categoryMode = categoryMode;
    s.fullCatMode = fullCatMode; s.activeMode = activeMode;
    s.gw = gw; s.gh = gh; s.undoManager = undoManager;
    s.structureView = pane0.structureView;
    s.structureController = pane0.structureController;
    s.structurePath = [...pane0.structurePath];
    s.structureBoundaryShapes = pane0.structureBoundaryShapes;
    s.hoverStructureId = pane0.hoverStructureId;
    s.localContext = pane0.localContext;
    s.localContextNavigator = pane0.localContextNavigator;
    s.localContextProjection = pane0.localContextProjection;
    s.semanticLensState = pane0.semanticLensState;
    renderPane(pixi!, scopedPaneGraph(s), scopedPaneSimulationManager(s), nodeSprites, s);
    pane0.hoverStructureId = s.hoverStructureId;
  };

  function pixiDrawPane1() {
    // 现在通过 draw() 里的状态快照换入机制统一绘制，两个窗格能力平等
    draw();
  }

  const drawExtraPanes = () => {
    for (let i = 0; i < extraPanes.length; i++) {
      const px = extraPixis[i]; const pi = extraPanes[i]; const sm = extraSims[i];
      if (!px || !sm || pi.textViewActive) continue;
      // 与聚焦窗格共享 sim → 每帧渲染，不降频不跳过；结构内部 sim 始终 pane 私有。
      const effectiveSM = scopedPaneSimulationManager(pi);
      const focusedEffectiveSM = focusedPaneIndex === PANE_LEFT
        ? scopedPaneSimulationManager(pane0 as unknown as PaneState)
        : scopedPaneSimulationManager(extraPanes[focusedPaneIndex - 1]);
      const isShared = (focusedPaneIndex !== i + 1) && (effectiveSM === focusedEffectiveSM);
      // Card layouts animate through their pane-owned controller, while the
      // compatibility graph simulation deliberately stays static. Do not use
      // that facade's alpha to suppress the frames requested by the controller.
      const hasPaneOwnedMotion = coordinateLayoutModes.has(pi.activeMode);
      if (!hasPaneOwnedMotion && !isShared && focusedPaneIndex !== i + 1 && frameCount % 4 !== 0) continue;
      const s = effectiveSM.getSim();
      if (!hasPaneOwnedMotion && !isShared && focusedPaneIndex !== i + 1 && s && s.alpha() < 0.01) continue;
      renderPane(px!, scopedPaneGraph(pi), scopedPaneSimulationManager(pi), extraSprites[i], pi);
    }
  };
  const renderPixiFrames = () => {
    pixi?.app.render();
    for (const px of extraPixis) px?.app.render();
  };
  sharedState.directDraw = () => { frameCount++; pane0Draw(); drawExtraPanes(); renderPixiFrames(); };
  let drawPending = false;
  let scheduleNameRender: () => void = () => {};
  let beforeRafDraw: (() => void) | null = null;
  const rafDraw = (beforeDraw?: () => void) => {
    if (beforeDraw) beforeRafDraw = beforeDraw;
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(() => {
      drawPending = false;
      const pendingWork = beforeRafDraw;
      beforeRafDraw = null;
      pendingWork?.();
      frameCount++;
      pane0Draw();
      drawExtraPanes();
      renderPixiFrames();
    });
  };
  scheduleNameRender = () => rafDraw(() => _syncGraphToOtherPanes_impl?.(false));
  // 视口平移/缩放时只刷新网格（节点/边由 GPU 矩阵变换处理，无需 CPU 重绘）
  let _gridRAF: number | null = null;
  const drawGridOnly = () => {
    if (_gridRAF !== null) return;
    _gridRAF = requestAnimationFrame(() => {
      _gridRAF = null;
      if (pixi) {
        const cw = pixi.app.canvas.clientWidth, ch = pixi.app.canvas.clientHeight;
        const nodes = scopedPaneSimulationManager(pane0 as unknown as PaneState)?.getSim()?.nodes() || [];
        const vp = pixi.viewport;
        const t = vp ? { k: vp.scale.x, x: vp.x, y: vp.y } : { k: 1, x: 0, y: 0 };
        updateSemanticBodiesForViewport(nodeSprites.values(), t.k);
        updateGrid(pixi.gridLayer, cw, ch, { gridVis: $.gridVis, gridMode: $.gridMode, axisVis: $.axisVis, axisTicks: $.axisTicks, gridSp: $.gridSp, gridWidth: $.gridWidth, color: parseInt((getTheme($.graphTheme).gridColor ?? '#888888').slice(1), 16), nodes, transform: t, dragX: $.draggingNode?.x ?? null, dragY: $.draggingNode?.y ?? null });
      }
      for (let i = 0; i < extraPanes.length; i++) {
        const px = extraPixis[i]; const pi = extraPanes[i];
        if (!px || !pi) continue;
        const cw = px.app.canvas.clientWidth, ch = px.app.canvas.clientHeight;
        const sm = scopedPaneSimulationManager(pi); const nodes = sm?.getSim()?.nodes() || [];
        const vp = px.viewport;
        const t = vp ? { k: vp.scale.x, x: vp.x, y: vp.y } : { k: 1, x: 0, y: 0 };
        updateSemanticBodiesForViewport(extraSprites[i]?.values() || [], t.k);
        updateGrid(px.gridLayer, cw, ch, { gridVis: pi.gridVis, gridMode: pi.gridMode, axisVis: pi.axisVis, axisTicks: pi.axisTicks, gridSp: pi.gridSp, gridWidth: pi.gridWidth, color: parseInt((getTheme(pi.graphTheme).gridColor ?? '#888888').slice(1), 16), nodes, transform: t, dragX: pi.draggingNode?.x ?? null, dragY: pi.draggingNode?.y ?? null });
      }
      renderPixiFrames();
    });
  };
  let _skipDraw = false; // 布局过渡期间抑制模拟驱动的绘制，防止闪烁
  const draw = () => { if (_skipDraw) return;
    frameCount++;
    pane0Draw();
    drawExtraPanes();
    renderPixiFrames();
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
  let _syncGraphToOtherPanes_impl: ((render?: boolean) => void) | undefined;
  let deleteNodesForPane: (pane: PaneState, ids: string[]) => boolean = () => false;
  let deleteEdgesForPane: (pane: PaneState, projectedIndexes: number[]) => boolean = () => false;
  let deleteGroupForPane: (pane: PaneState, id: string) => boolean = () => false;
  const focusedPaneState = () => resolveFocusedPaneState();
  const originalEdgeIndexForPane = (pane: PaneState, projectedIndex: number | null): number | null =>
    getPaneOriginalEdgeIndex(pane.structureView, projectedIndex);
  const projectedEdgeIndexForPane = (pane: PaneState, originalIndex: number | null): number | null => {
    if (originalIndex === null || !pane.structureView) return originalIndex;
    for (let projectedIndex = 0; projectedIndex < pane.structureView.graph.edges.length; projectedIndex++) {
      if (pane.structureView.getOriginalEdgeIndex(projectedIndex) === originalIndex) return projectedIndex;
    }
    return null;
  };
  const editCtx = createEditPanel(appShell, {
    get graph() { return paneRuntimeGraph(focusedPaneState()); },
    getSelNode: () => $.selNode, setSelNode: v => { $.selNode = v; syncFocusedCommands(); },
    getSelEdge: () => originalEdgeIndexForPane(focusedPaneState(), $.selEdge),
    setSelEdge: v => { $.selEdge = projectedEdgeIndexForPane(focusedPaneState(), v); },
    getSelGroup: () => $.selGroup, setSelGroup: v => { $.selGroup = v; },
    getLinkMode: () => $.linkMode, setLinkMode: v => { $.linkMode = v; },
    setLinkSrc: v => { $.linkSrc = v; },
    clearLinkMode: () => finishLinkMode(),
    saveUndo,
    getBoxSelectMode: () => boxSelectMode, setBoxSelectMode: v => { boxSelectMode = v; syncFocusedCommands(); },
    getInitSim: () => {
      const pane = focusedPaneState();
      const manager = pane.structureView ? (pane.index === PANE_LEFT ? simManager : pane.simManager) : scopedPaneSimulationManager(pane);
      return manager.initSim.bind(manager);
    },
    deleteNode: (id: string) => deleteNodesForPane(focusedPaneState(), [id]),
    deleteEdge: (originalIndex: number) => {
      const pane = focusedPaneState();
      const projectedIndex = projectedEdgeIndexForPane(pane, originalIndex);
      return projectedIndex !== null && deleteEdgesForPane(pane, [projectedIndex]);
    },
    deleteGroup: (id: string) => deleteGroupForPane(focusedPaneState(), id),
    draw,
    triggerSave: () => scheduleSave(),
    getSimulation: () => focusedPaneState().structureView ? null : scopedPaneSimulationManager(focusedPaneState())?.getSim() ?? null,
    updateLinkForce: () => {
      const focusedPane = focusedPaneState();
      const simulation = scopedPaneSimulationManager(focusedPane)?.getSim();
      if (!simulation) return;
      const runtimeGraph = paneRuntimeGraph(focusedPane);
      const simNodeIds = new Set((simulation.nodes() as any[]).map((node: any) => node.id));
      const validEdges = runtimeGraph.edges.filter(edge => {
        if ((edge.lineStyle || 'solid') !== 'solid' || (edge as any)._conflict || (edge as any)._dyingAt) return false;
        const source = typeof edge.source === 'object' ? edge.source.id : edge.source;
        const target = typeof edge.target === 'object' ? edge.target.id : edge.target;
        return simNodeIds.has(source) && simNodeIds.has(target);
      });
      simulation.force("link", d3.forceLink(validEdges).id((node: any) => node.id).distance(focusedPane.linkDist).strength(focusedPane.linkStr));
      simulation.alpha(0.1).restart();
    },
    syncGraphToOtherPanes: () => _syncGraphToOtherPanes_impl?.(),
    scheduleNameRender: () => scheduleNameRender(),
    canMutate: () => paneRuntimeGraph(focusedPaneState()).settings?.sourceMode !== 'vault-readonly',
    reportImportError: message => showToast(message, 'info', 3500),
    openNodeAttachment: node => openVaultNodeContent(focusedPaneState(), node, true),
    revealSelection: occluder => revealEditedSelection(occluder),
  }, () => editPanelOpacity);
  const { fillNode, fillEdge, fillGroup, clearEd, updateOpacity, saveCurrent } = editCtx;

  const setFocusedEdgeAppearance = (key: 'edgeColorGradient' | 'edgeWidthByLevel', value: boolean) => {
    const runtime = paneRuntime(focusedPaneState());
    for (const owner of allPaneOwners()) {
      if (paneRuntime(owner) === runtime) owner[key] = value;
    }
  };

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
    draw, getInitSim: () => $.simManager?.initSim?.bind($.simManager),
    getSaveData: () => saveNow,
    getGraphTheme: () => $.graphTheme,
    setGraphTheme: v => {
      $.graphTheme = v;
      applyPaneCanvasBg(focusedPaneState().canvasContainer, v);
      applyUIToFocusedPane(v);
      _syncGraphToOtherPanes_impl?.(false);
    },
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
        defaultFocusMode: (preset.focusMode as boolean) ?? DEFAULT_SETTINGS.focusMode,
        defaultCenterMode: (preset.centerMode as boolean) ?? DEFAULT_SETTINGS.centerMode ?? false,
        defaultSelectedTooltip: (preset.selectedTooltip as boolean) ?? false,
        defaultGlowAppearance: (preset.glowAppearance as boolean) ?? DEFAULT_SETTINGS.glowAppearance,
        defaultEdgeColorGradient: (preset.edgeColorGradient as boolean) ?? DEFAULT_SETTINGS.edgeColorGradient ?? false,
        defaultEdgeWidthByLevel: (preset.edgeWidthByLevel as boolean) ?? DEFAULT_SETTINGS.edgeWidthByLevel ?? false,
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
        defaultGraphTheme: (preset.graphTheme as string) ?? DEFAULT_SETTINGS.graphTheme,
        defaultCardBorderStyle: (preset.cardBorderStyle as string) ?? DEFAULT_SETTINGS.cardBorderStyle,
        defaultNodeColorStyle: (preset.nodeColorStyle as string) ?? DEFAULT_SETTINGS.nodeColorStyle,
        defaultFontFamily: (preset.fontFamily as string) ?? DEFAULT_SETTINGS.fontFamily,
      };
    },
    getFocusMode: () => $.focusMode, setFocusMode: v => { $.focusMode = v; },
    getCenterMode: () => $.centerMode, setCenterMode: v => { $.centerMode = v; },
    getSelectedTooltip: () => $.selectedTooltip, setSelectedTooltip: v => { $.selectedTooltip = v; },
    getGlowAppearance: () => $.glowAppearance, setGlowAppearance: v => { $.glowAppearance = v; },
    getEdgeColorGradient: () => $.edgeColorGradient, setEdgeColorGradient: v => setFocusedEdgeAppearance('edgeColorGradient', v),
    getEdgeWidthByLevel: () => $.edgeWidthByLevel, setEdgeWidthByLevel: v => setFocusedEdgeAppearance('edgeWidthByLevel', v),
    getGridWidth: () => $.gridWidth, setGridWidth: v => { $.gridWidth = v; },
    getNodeColorStyle: () => $.nodeColorStyle, setNodeColorStyle: v => { $.nodeColorStyle = v; },
    getFontFamily: () => $.fontFamily, setFontFamily: v => {
      $.fontFamily = v;
      document.documentElement.style.setProperty('--fg-font-family', v);
      setNodeFontFamily(v);
    },
    getCardBorderStyle: () => $.cardBorderStyle, setCardBorderStyle: v => { $.cardBorderStyle = v as 'straight' | 'rounded'; },
    scope: 'current',
  });
  // 图区自定义保留在底部（滑块/复选框直接修改当前图）

  // 设置面板 + 预设
  const SETTING_PRESETS_KEY = `fg-setting-presets`;
  let settingPresets: { name: string; values: Partial<GraphSettings> }[] = [];
  try { settingPresets = JSON.parse(localStorage.getItem(SETTING_PRESETS_KEY) || '[]'); } catch {}
  const saveSettingPresets = () => localStorage.setItem(SETTING_PRESETS_KEY, JSON.stringify(settingPresets));

  const getFocusedSettingValues = (): Partial<GraphSettings> => {
    const src = focusedPaneState();
    return {
      linkDist: src.linkDist, labelSize: src.labelSize, charge: src.charge, linkStr: src.linkStr,
      collideR: src.collideR, centerS: src.centerS, groupBound: src.groupBound,
      heatingTime: src.heatingTime, alphaTarget: src.alphaTarget, editPanelOpacity: src.editPanelOpacity,
      useRAFL: src.useRAFL, nodeExpand: src.nodeExpand, lineExpand: src.lineExpand,
      showGLabels: src.showGLabels, glMin: src.glMin, glMax: src.glMax,
      gridVis: src.gridVis, gridMode: src.gridMode, axisVis: src.axisVis,
      axisTicks: src.axisTicks, gridSp: src.gridSp, gridWidth: src.gridWidth,
      ar: src.ar, graphTheme: src.graphTheme, focusMode: src.focusMode,
      centerMode: src.centerMode, selectedTooltip: src.selectedTooltip, glowAppearance: src.glowAppearance,
      edgeColorGradient: src.edgeColorGradient, edgeWidthByLevel: src.edgeWidthByLevel,
      layoutMode: src.activeMode, gridSnap: src.gridSnapEnabled, partialGridSnap: src.partialGridSnap,
      nodeColorStyle: src.nodeColorStyle, fontFamily: src.fontFamily,
      cardBorderStyle: (src as any).cardBorderStyle,
    };
  };

  const applySettingValues = (vals: Partial<GraphSettings>) => {
    const pane = focusedPaneState();
    const directKeys = new Set([
      'linkDist', 'labelSize', 'charge', 'linkStr', 'collideR', 'centerS',
      'groupBound', 'heatingTime', 'alphaTarget', 'editPanelOpacity', 'useRAFL',
      'nodeExpand', 'lineExpand', 'showGLabels', 'glMin', 'glMax', 'gridVis',
      'gridMode', 'axisVis', 'axisTicks', 'gridSp', 'gridWidth', 'ar', 'focusMode',
      'centerMode', 'selectedTooltip', 'glowAppearance', 'nodeColorStyle',
      'partialGridSnap', 'categoryLayout', 'cardBorderStyle',
    ]);
    for (const [k, v] of Object.entries(vals)) {
      if (directKeys.has(k)) {
        (pane as any)[k] = v;
        if (k === 'editPanelOpacity') updateOpacity(v as number);
      }
      else if (k === 'graphTheme') {
        pane.graphTheme = v as string;
        applyPaneCanvasBg(pane.canvasContainer, pane.graphTheme);
        applyUIToFocusedPane(pane.graphTheme);
      }
      else if (k === 'edgeColorGradient' || k === 'edgeWidthByLevel') setFocusedEdgeAppearance(k, v as boolean);
      else if (k === 'gridSnap') pane.gridSnapEnabled = v as boolean;
      else if (k === 'fontFamily') {
        pane.fontFamily = v as string;
        document.documentElement.style.setProperty('--fg-font-family', pane.fontFamily);
        setNodeFontFamily(pane.fontFamily);
      }
      else if (k === 'layoutMode') {
        pane.activeMode = normalizeLayoutMode(v as string);
        renderModeBar();
      }
    }
  };

  // 预设编辑面板（独立于图区自定义，读写 presetDefaults）
  const presetSetDiv = document.createElement('div');
  presetSetDiv.style.cssText = 'padding:4px 0;';
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
    draw: () => {}, getInitSim: () => () => {}, getSaveData: () => async () => {},
    setGraphTheme: v => { presetDefaults.graphTheme = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
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
      defaultFocusMode: DEFAULT_SETTINGS.focusMode,
      defaultCenterMode: DEFAULT_SETTINGS.centerMode ?? false,
      defaultSelectedTooltip: (DEFAULT_SETTINGS as any).selectedTooltip ?? false,
      defaultGlowAppearance: DEFAULT_SETTINGS.glowAppearance,
      defaultEdgeColorGradient: DEFAULT_SETTINGS.edgeColorGradient ?? false,
      defaultEdgeWidthByLevel: DEFAULT_SETTINGS.edgeWidthByLevel ?? false,
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
      defaultGraphTheme: DEFAULT_SETTINGS.graphTheme,
      defaultCardBorderStyle: DEFAULT_SETTINGS.cardBorderStyle ?? 'straight',
      defaultNodeColorStyle: DEFAULT_SETTINGS.nodeColorStyle ?? 'hierarchical',
      defaultFontFamily: DEFAULT_SETTINGS.fontFamily ?? DEFAULT_CANVAS_FONT,
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
    getNodeColorStyle: () => (presetDefaults.nodeColorStyle as string) ?? DEFAULT_SETTINGS.nodeColorStyle,
    setNodeColorStyle: v => { presetDefaults.nodeColorStyle = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    getFontFamily: () => (presetDefaults.fontFamily as string) ?? DEFAULT_SETTINGS.fontFamily,
    setFontFamily: v => { presetDefaults.fontFamily = v; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    getCardBorderStyle: () => (presetDefaults.cardBorderStyle as string) ?? DEFAULT_SETTINGS.cardBorderStyle,
    setCardBorderStyle: v => { presetDefaults.cardBorderStyle = v === 'rounded' ? 'rounded' : 'straight'; localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults)); },
    scope: 'defaults',
  });

  const saveBeforeWorkspaceSwitch = async () => {
    if (markdownSourceEditor?.hasDraft() || hasActiveTextDraft()) {
      showToast('请先保存正在编辑的内容，再打开其他资料库', 'warning', 4500);
      return false;
    }
    const saved = await flushAllGraphs();
    if (!saved) showToast('仍有图未保存，已保留当前资料库', 'warning', 5000);
    return saved;
  };

  const reloadMountedWorkspace = () => {
    // Keep this renderer's recovery scope on the old mount through beforeunload.
    mountWritesPaused = true;
    window.location.reload();
  };

  const openWorkspaceFolder = async () => {
    if (workspacePickerActive || mountWritesPaused) return;
    workspacePickerActive = true;
    try {
      if (safIsAvailable()) {
        // Android commits the selected URI before JS receives the result.
        if (!await saveBeforeWorkspaceSwitch()) return;
        mountWritesPaused = true;
        let selected = false;
        try {
          const dir = await safPickDirectory();
          if (!dir) return;
          selected = true;
          reloadMountedWorkspace();
        } finally {
          if (!selected) mountWritesPaused = false;
        }
        return;
      }
      const ea = (window as any).electronAPI;
      if (ea?.openFolder) {
        const folderPath = await ea.openFolder();
        if (!folderPath || folderPath === fileSystemMountPath || !await saveBeforeWorkspaceSwitch()) return;
        const written = await ea.configWrite({ folderPath, graphFolderRelative: null });
        if (!written?.ok) throw new Error(written?.error || '无法保存新资料库的位置');
        reloadMountedWorkspace();
        return;
      }
      if (typeof (window as any).showDirectoryPicker === 'function') {
        let handle: FileSystemDirectoryHandle;
        try {
          // Select during user activation without changing the active FSA handle.
          handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          throw error;
        }
        const id = await findSavedFolderId(handle) ?? crypto.randomUUID();
        if (mountedStorageScope === `fsa:${id}` || !await saveBeforeWorkspaceSwitch()) return;
        if (!await saveFolderHandle(handle, id)) throw new Error('浏览器无法保存资料库位置');
        reloadMountedWorkspace();
        return;
      }
      triggerFileImport();
    } finally {
      workspacePickerActive = false;
    }
  };

  function reportWorkbenchActionError(error: unknown) {
    showToast(error instanceof Error ? error.message : '操作失败，请重试', 'error', 5000);
  }

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
      scheduleSave(); focusedPaneState().simManager.initSim(); draw();
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
        fontFamily: DEFAULT_SETTINGS.fontFamily || DEFAULT_CANVAS_FONT,
        edgeColorGradient: DEFAULT_SETTINGS.edgeColorGradient,
        edgeWidthByLevel: DEFAULT_SETTINGS.edgeWidthByLevel,
      };
      localStorage.setItem(PRESET_DEFAULT_KEY, JSON.stringify(presetDefaults));
      applySettingValues(presetDefaults);
      settingsUI.updateInfo(); presetSettingsUI.updateInfo();
      scheduleSave(); focusedPaneState().simManager.initSim(); draw();
    },
    getPresets: () => settingPresets,
    onOpenFolder: () => { void openWorkspaceFolder().catch(reportWorkbenchActionError); },
    getFolderPath: () => fileSystemMountPath || '（未选择）',
    getGraphFolderPath: () => vaultIndex?.isObsidianVault
      ? `./${vaultIndex.graphRootRelative || 'NodeSpace'}`
      : '（普通目录直接保存）',
    canSetGraphFolder: () => !!(window as any).electronAPI && !!vaultIndex?.isObsidianVault,
    onSetGraphFolder: async (relativePath: string) => {
      const ea = (window as any).electronAPI;
      if (!ea?.scanVault || !fileSystemMountPath || !vaultIndex?.isObsidianVault) {
        showToast('图文件夹设置只用于桌面端 Obsidian 资料库', 'warning', 3600);
        return;
      }
      if (markdownSourceEditor?.hasDraft() || hasActiveTextDraft()) {
        showToast('请先保存正在编辑的内容，再切换图文件夹', 'warning', 4200);
        return;
      }
      const scanned = await ea.scanVault(fileSystemMountPath, relativePath);
      if (!scanned || scanned.error) {
        showToast(scanned?.error || '图文件夹无效', 'error', 5000);
        return;
      }
      if (!await saveBeforeWorkspaceSwitch()) return;
      if (!(await ea.exists(scanned.graphRootPath))) {
        const created = await ea.mkdir(scanned.graphRootPath);
        if (created?.error) {
          showToast(`无法创建图文件夹：${created.error}`, 'error', 6000);
          return;
        }
      }
      const written = await ea.configWrite({ folderPath: fileSystemMountPath, graphFolderRelative: scanned.graphRootRelative });
      if (!written?.ok) {
        showToast(written?.error || '无法保存图文件夹的位置', 'error', 5000);
        return;
      }
      reloadMountedWorkspace();
    },
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
      syncSpaceNavigation();
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
  shortcutsDetails.className = 'fg-settings-section fg-shortcuts-details';
  shortcutsDetails.style.cssText = 'margin-top:8px;';
  const shortcutsSum = document.createElement('summary');
  shortcutsSum.className = 'fg-settings-section-title fg-shortcuts-summary';
  shortcutsSum.textContent = '快捷键';
  shortcutsSum.style.cssText = `font-size:${V('--fg-font-sm', '0.84em')};cursor:pointer;opacity:0.6;padding:2px 0;`;
  shortcutsDetails.appendChild(shortcutsSum);
  const shortcutsDiv = document.createElement('div');
  shortcutsDiv.className = 'fg-shortcuts-list';
  shortcutsDiv.style.cssText = `font-size:${V('--fg-font-xs', '0.72em')};color:${V('--fg-text-muted','#999')};padding:4px 0;line-height:1.6;display:flex;flex-direction:column;gap:2px;`;
  const addShortcut = (key: string, desc: string) => {
    const row = document.createElement('div');
    row.className = 'fg-shortcut-row';
    row.style.cssText = 'display:flex;gap:10px;';
    const kbd = document.createElement('code');
    kbd.className = 'fg-shortcut-key';
    kbd.textContent = key;
    kbd.style.cssText = `background:${V('--fg-button-bg','#444')};padding:0 5px;border-radius:3px;min-width:50px;text-align:center;font-weight:600;`;
    const d = document.createElement('span');
    d.className = 'fg-shortcut-description';
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

  updateInfoRef.current = settingsUI.updateInfo;
  updateSelectsRef.current = () => {};

  // --- 搜索事件 ---
  let lastSearchTerm = '';
  let searchMatchIndex = -1;
  let searchPreviewing = false;
  let searchComposing = false;
  const searchAnimations = new WeakSet<object>();
  const focusedSearchState = () => {
    const pane = focusedPaneState();
    return pane.index === PANE_LEFT
      ? { pane, query: search, field: sField, mode: sMatchMode, display: sDisplayMode, index: searchMatchIndex, last: lastSearchTerm }
      : { pane, query: pane.search, field: pane.sField, mode: pane.sMatchMode, display: pane.sDisplayMode, index: pane.searchMatchIndex, last: pane.lastSearchTerm };
  };
  const mutateFocusedSearch = (values: Partial<{ query: string; field: SearchField; mode: SearchMatchMode; display: 'highlight' | 'show'; index: number; last: string }>) => {
    const pane = focusedPaneState();
    if (pane.index === PANE_LEFT) {
      if (values.query !== undefined) search = values.query;
      if (values.field !== undefined) sField = values.field;
      if (values.mode !== undefined) sMatchMode = values.mode;
      if (values.display !== undefined) sDisplayMode = values.display;
      if (values.index !== undefined) searchMatchIndex = values.index;
      if (values.last !== undefined) lastSearchTerm = values.last;
    } else {
      if (values.query !== undefined) pane.search = values.query;
      if (values.field !== undefined) pane.sField = values.field;
      if (values.mode !== undefined) pane.sMatchMode = values.mode;
      if (values.display !== undefined) pane.sDisplayMode = values.display;
      if (values.index !== undefined) pane.searchMatchIndex = values.index;
      if (values.last !== undefined) pane.lastSearchTerm = values.last;
    }
  };
  const currentSearchResults = () => {
    const state = focusedSearchState();
    return searchGraph(scopedPaneGraph(state.pane), state.query, state.field, state.mode);
  };
  type SearchState = ReturnType<typeof focusedSearchState>;
  const matchesSearch = (a: SearchState, b: SearchState) => a.pane === b.pane && a.query === b.query
    && a.field === b.field && a.mode === b.mode;
  let previousSearchRender: { state: SearchState; graph: GraphData } | null = null;
  let renderSearchViewport = () => {};
  searchResults.addEventListener('scroll', () => renderSearchViewport(), { passive: true });
  if (typeof ResizeObserver !== 'undefined') {
    const searchResize = new ResizeObserver(() => renderSearchViewport());
    searchResize.observe(searchResults);
  }
  const renderSearchResults = () => {
    const state = focusedSearchState();
    const searchGraphAtRender = scopedPaneGraph(state.pane);
    const results = currentSearchResults();
    const hasQuery = !!state.query.trim();
    searchStatus.hidden = !hasQuery || searchRow.hidden;
    searchStatus.style.color = results.length > 0 ? V('--fg-text-muted', '#999') : V('--fg-danger', '#e03030');
    searchStatus.textContent = hasQuery ? (results.length > 0
      ? state.index >= 0 ? `${Math.min(state.index + 1, results.length)}/${results.length}` : `${results.length} 条结果`
      : '无结果') : '';
    searchPrevBtn.disabled = searchNextBtn.disabled = results.length === 0;
    searchClearBtn.disabled = !hasQuery;
    searchPrevBtn.hidden = searchNextBtn.hidden = results.length < 2;
    searchClearBtn.hidden = !hasQuery;
    searchResults.hidden = !hasQuery || results.length === 0 || searchRow.hidden || !controlsDetails.open;
    searchInput.setAttribute('aria-expanded', String(!searchResults.hidden));
    if (searchResults.hidden) {
      renderSearchViewport = () => {};
      if (!hasQuery || results.length === 0) previousSearchRender = null;
      searchResultTrack.replaceChildren();
      searchInput.removeAttribute('aria-activedescendant');
      return;
    }
    searchResultTrack.style.height = `${results.length * searchResultRowHeight}px`;
    if (!previousSearchRender || !matchesSearch(previousSearchRender.state, state) || previousSearchRender.graph !== searchGraphAtRender) {
      searchResults.scrollTop = 0;
    }
    previousSearchRender = { state, graph: searchGraphAtRender };
    const active = state.index >= 0 && state.index < results.length;
    if (active) {
      const top = state.index * searchResultRowHeight;
      const bottom = top + searchResultRowHeight - searchResults.clientHeight;
      searchResults.scrollTop = Math.min(Math.max(searchResults.scrollTop, bottom), top);
    }
    let renderedStart = -1, renderedEnd = -1;
    renderSearchViewport = () => {
      const { start, end } = searchResultViewport(results.length, searchResults.scrollTop, searchResults.clientHeight, searchResultRowHeight);
      if (renderedStart === start && renderedEnd === end) return;
      renderedStart = start;
      renderedEnd = end;
      const rows: HTMLButtonElement[] = [];
      for (let index = start; index < end; index++) {
        const result = results[index];
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'fg-search-result' + (index === state.index ? ' is-current' : '');
        item.style.top = `${index * searchResultRowHeight}px`;
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', String(index === state.index));
        item.id = `ns-search-result-${index}`;
        item.setAttribute('tabindex', '-1');
        item.setAttribute('aria-posinset', String(index + 1));
        item.setAttribute('aria-setsize', String(results.length));
        const title = document.createElement('strong');
        title.textContent = result.label;
        item.appendChild(title);
        if (result.context && result.context !== result.label) {
          const detail = document.createElement('span');
          detail.textContent = result.context;
          item.appendChild(detail);
        }
        item.onpointerdown = event => event.preventDefault();
        item.onclick = () => {
          if (matchesSearch(state, focusedSearchState()) && scopedPaneGraph(state.pane) === searchGraphAtRender) {
            focusSearchResult(index, false, result.nodeId);
          }
        };
        rows.push(item);
      }
      searchResultTrack.replaceChildren(...rows);
      if (active && state.index >= start && state.index < end) {
        searchInput.setAttribute('aria-activedescendant', `ns-search-result-${state.index}`);
      } else searchInput.removeAttribute('aria-activedescendant');
    };
    renderSearchViewport();
  };
  const focusSearchResult = (requestedIndex: number, wrap = true, expectedNodeId?: string) => {
    const state = focusedSearchState();
    const results = currentSearchResults();
    if (results.length === 0) { renderSearchResults(); draw(); return; }
    const index = wrap
      ? (requestedIndex % results.length + results.length) % results.length
      : Math.max(0, Math.min(results.length - 1, requestedIndex));
    const result = results[index];
    if (expectedNodeId !== undefined && result.nodeId !== expectedNodeId) return;
    mutateFocusedSearch({ index, last: state.query });
    const sourceGraph = scopedPaneGraph(state.pane);
    const sourceNode = sourceGraph.nodes.find((node: any) => node.id === result.nodeId);
    const sim = scopedPaneSimulationManager(state.pane)?.getSim();
    const nodes = sim?.nodes() || [];
    const visibleId = nodes.some((node: any) => node.id === result.nodeId)
      ? result.nodeId
      : typeof sourceNode?.structureParentId === 'string' ? sourceNode.structureParentId : result.nodeId;
    const node = nodes.find((candidate: any) => candidate.id === visibleId);
    const px = state.pane.index === PANE_LEFT ? pixi : state.pane.pixi;
    if (node && px && Number.isFinite(node.x) && Number.isFinite(node.y)) {
      const graphAtFocus = paneRuntimeGraph(state.pane);
      searchPreviewing = false;
      controlsDetails.open = false;
      searchInput.blur();
      withFocusedPane(() => fillNode(visibleId));
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) px.viewport.moveCenter(node.x, node.y);
      else {
        px.viewport.animate({ position: { x: node.x, y: node.y }, time: SEARCH_MOVE_DURATION, ease: EASING.easeInOut, removeOnInterrupt: true,
          callbackOnComplete: () => {
            if (focusedPaneState() === state.pane && paneRuntimeGraph(state.pane) === graphAtFocus && state.pane.selNode === visibleId)
              editCtx.revealSelection();
          } });
        const animation = px.viewport.plugins.get('animate');
        if (animation) searchAnimations.add(animation);
      }
    }
    renderSearchResults();
    draw();
  };
  const nextSearchIndex = (direction: number) => {
    const count = currentSearchResults().length, index = focusedSearchState().index;
    return count === 0 ? -1 : index < 0 ? direction < 0 ? count - 1 : 0 : (index + direction + count) % count;
  };
  const selectToolSearch = (kind: 'node' | 'group') => {
    const isNode = kind === 'node';
    searchRow.hidden = !isNode;
    groupSearchPanel.hidden = isNode;
    searchFiltersButton.hidden = !isNode;
    nodeSearchButton.setAttribute('aria-pressed', String(isNode));
    groupSearchButton.setAttribute('aria-pressed', String(!isNode));
    renderSearchResults();
  };
  nodeSearchButton.onclick = () => { selectToolSearch('node'); searchInput.focus(); };
  groupSearchButton.onclick = () => { selectToolSearch('group'); groupInput.focus(); };
  controlsDetails.addEventListener('toggle', () => renderSearchResults());
  syncSearchControlsFromFocusedPane = () => {
    searchPreviewing = false; searchComposing = false;
    const state = focusedSearchState();
    searchInput.value = state.query;
    fieldSelect.value = state.field;
    matchModeSelect.value = state.mode;
    modeSelect.value = state.display;
    renderSearchResults();
  };
  fieldSelect.addEventListener('change', () => { searchPreviewing = false; mutateFocusedSearch({ field: fieldSelect.value as SearchField, index: -1 }); renderSearchResults(); draw(); });
  matchModeSelect.addEventListener('change', () => { searchPreviewing = false; mutateFocusedSearch({ mode: matchModeSelect.value as SearchMatchMode, index: -1 }); renderSearchResults(); draw(); });
  modeSelect.addEventListener('change', () => { mutateFocusedSearch({ display: modeSelect.value as 'highlight' | 'show' }); draw(); });
  const updateSearchInput = () => {
    if (searchComposing) return;
    searchPreviewing = false;
    mutateFocusedSearch({ query: searchInput.value, index: -1, last: searchInput.value });
    const pane = focusedPaneState();
    if (pane.searchDebounceTimer) clearTimeout(pane.searchDebounceTimer);
    pane.searchDebounceTimer = setTimeout(() => { pane.searchDebounceTimer = null; renderSearchResults(); draw(); }, 80);
  };
  searchInput.addEventListener('input', updateSearchInput);
  searchInput.addEventListener('compositionstart', () => { searchComposing = true; });
  searchInput.addEventListener('compositionend', () => { searchComposing = false; updateSearchInput(); });
  searchInput.addEventListener('focus', () => { clearEd(); renderSearchResults(); });
  const onSearchKeyDown = (e: KeyboardEvent) => {
    if (searchComposing || e.isComposing || e.keyCode === 229) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      mutateFocusedSearch({ index: nextSearchIndex(e.key === 'ArrowDown' ? 1 : -1) });
      searchPreviewing = true; renderSearchResults();
    } else if (e.key === 'Enter') {
      e.preventDefault(); focusSearchResult(e.shiftKey ? nextSearchIndex(-1) : searchPreviewing ? focusedSearchState().index : nextSearchIndex(1));
    }
    else if (e.key === 'Escape' && searchInput.value) {
      e.preventDefault();
      mutateFocusedSearch({ query: '', index: -1, last: '' });
      searchInput.value = '';
      renderSearchResults(); draw();
    }
  };
  searchInput.addEventListener('keydown', onSearchKeyDown);
  searchPrevBtn.onclick = () => focusSearchResult(nextSearchIndex(-1));
  searchNextBtn.onclick = () => focusSearchResult(nextSearchIndex(1));
  searchClearBtn.onclick = () => {
    mutateFocusedSearch({ query: '', index: -1, last: '' });
    searchInput.value = '';
    renderSearchResults(); draw(); searchInput.focus();
  };
  window.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'f') return;
    if ((event.target as HTMLElement)?.closest('.ns-md-editor')) return;
    event.preventDefault();
    controlsDetails.open = true;
    selectToolSearch('node');
    requestAnimationFrame(() => { syncSearchControlsFromFocusedPane(); searchInput.focus(); searchInput.select(); });
  });
  // --- 聚焦窗格状态切换（用于布局/操作等需要访问 singleton 的函数）---
  const withFocusedPane = <T>(fn: () => T, paneIndex = focusedPaneIndex): T => {
    if (paneIndex === PANE_LEFT) return fn();
    const targetPane = extraPanes[paneIndex - 1];
    const targetSim = extraSims[paneIndex - 1] ?? targetPane?.simManager;
    if (!targetPane || !targetSim) return fn();
    // 只交换数据层（graph/sim/config），不交换渲染层（pixi/nodeSprites 保持原样给 pane0Draw）
    saveConfigTo(pane0Config as any);
    const savedGraph = graph, savedSim = simManager, savedUndo = undoManager;
    const savedPrimaryPins = savedFixedNodes, savedPrimaryGroups = savedGroupModes;
    const savedPrimaryAnimation = currentAnimationCancel;
    const savedTree = treeMode, savedCat = categoryMode, savedFull = fullCatMode, savedActive = activeMode;
    const savedSelNode = selNode, savedSelEdge = selEdge, savedSelGroup = selGroup;
    graph = targetPane.graph; simManager = targetSim; undoManager = targetPane.undoManager;
    savedFixedNodes = targetPane.savedFixedNodes; savedGroupModes = targetPane.savedGroupModes;
    currentAnimationCancel = targetPane.currentAnimationCancel;
    loadConfigFrom(targetPane);
    treeMode = targetPane.treeMode; categoryMode = targetPane.categoryMode; fullCatMode = targetPane.fullCatMode; activeMode = targetPane.activeMode;
    selNode = targetPane.selNode; selEdge = targetPane.selEdge; selGroup = targetPane.selGroup;
    try {
      return fn();
    } finally {
      saveConfigTo(targetPane);
      targetPane.treeMode = treeMode; targetPane.categoryMode = categoryMode; targetPane.fullCatMode = fullCatMode; targetPane.activeMode = activeMode;
      targetPane.selNode = selNode; targetPane.selEdge = selEdge; targetPane.selGroup = selGroup;
      targetPane.savedFixedNodes = savedFixedNodes; targetPane.savedGroupModes = savedGroupModes;
      targetPane.currentAnimationCancel = currentAnimationCancel;
      graph = savedGraph; simManager = savedSim; undoManager = savedUndo;
      savedFixedNodes = savedPrimaryPins; savedGroupModes = savedPrimaryGroups;
      currentAnimationCancel = savedPrimaryAnimation;
      loadConfigFrom(pane0Config as any);
      treeMode = savedTree; categoryMode = savedCat; fullCatMode = savedFull; activeMode = savedActive;
      selNode = savedSelNode; selEdge = savedSelEdge; selGroup = savedSelGroup;
    }
  };

  // --- 操作按钮 ---
  const addBtn = document.createElement('button');
  addBtn.className = 'fg-action fg-action-primary';
  addBtn.textContent = '新建节点'; addBtn.style.cssText = `font-size:${V('--fg-font-md', '0.85em')};padding:2px 8px;cursor:pointer;`;
  const temporaryNodeAnchors = new WeakSet<object>();
  // 增量添加节点到模拟（避免重启导致画面跳变）
  const addNodeToSim = (node: any) => {
    // Static views share the document's nodes. The caller already inserted the
    // node; appending a simulation copy would duplicate persisted graph data.
    if (simManager.isStaticMode()) {
      simManager.initStatic();
      return;
    }
    const manager = simManager;
    const sim = manager.getSim();
    if (sim) {
      const sn: any = { id: node.id, label: node.label, headingLevel: node.headingLevel ?? 6, tags: node.tags ?? [], x: node.x, y: node.y, _isNew: true };
      const currentNodes = sim.nodes();
      currentNodes.push(sn);
      sim.nodes(currentNodes);
      sim.alpha(0.05).alphaTarget(0.005).restart();
      sn.fx = sn.x; sn.fy = sn.y;
      temporaryNodeAnchors.add(sn);
      // 1.5s 硬固定 → 弹簧过渡释放（避免被固定节点的电荷力瞬间弹飞）
      setTimeout(() => {
        const anchorX = sn.x, anchorY = sn.y;
        let spring = 0.25;
        const relax = () => {
          if (manager.getSim() !== sim || !sim.nodes().includes(sn)) return;
          if (!temporaryNodeAnchors.has(sn) || sn.fixed || node.fixed || manager.getDragNode() === sn.id) {
            temporaryNodeAnchors.delete(sn);
            sim.alphaTarget(0);
            return;
          }
          spring *= 0.88;
          if (spring < 0.015) {
            temporaryNodeAnchors.delete(sn);
            sn.fx = null; sn.fy = null; sim.alphaTarget(0);
            return;
          }
          sn.fx = sn.x + (anchorX - sn.x) * spring;
          sn.fy = sn.y + (anchorY - sn.y) * spring;
          requestAnimationFrame(relax);
        };
        relax();
      }, 1500);
    }
  };

  const hierarchyAnimations = new WeakMap<ReturnType<typeof createSimManager>, () => void>();

  const hierarchyViewsForRuntime = (runtime: GraphRuntime) => {
    const views = new Map<ReturnType<typeof createSimManager>, GraphData>();
    for (const pane of allPaneOwners()) {
      if ((pane.index === PANE_LEFT ? primaryRuntime : pane.runtime) !== runtime) continue;
      const base = pane.index === PANE_LEFT ? simManager : pane.simManager;
      if (base) views.set(base, runtime.graph);
      const scopedSim = scopedPaneSimulationManager(pane);
      if (scopedSim && scopedSim !== base) views.set(scopedSim, scopedPaneGraph(pane));
    }
    return views;
  };

  const animateHierarchyChange = (
    runtime: GraphRuntime,
    manager: ReturnType<typeof createSimManager>,
    view: GraphData,
    previousHidden: ReadonlySet<string>,
  ) => {
    const simulation = manager.getSim();
    if (!simulation) return;
    hierarchyAnimations.get(manager)?.();
    const hidden = getCollapsedHierarchyHiddenNodeIds(view);
    const animate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    const disappearing = simulation.nodes().filter((node: any) => !previousHidden.has(node.id) && hidden.has(node.id));
    if (!manager.isStaticMode() && view === runtime.graph && disappearing.length) {
      const positions = new Map<string, { x: number; y: number }>(disappearing.map((node: any) => [node.id, node]));
      for (const node of view.nodes) {
        const position = positions.get(node.id);
        if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
          node.x = position.x;
          node.y = position.y;
        }
      }
    }
    const retained = new Set<string>(animate ? disappearing.map((node: any) => node.id) : []);
    manager.refreshHierarchyNodes(hidden, retained);

    const startTime = performance.now();
    const animated: Array<{
      node: any;
      key: '_collapseAnim' | '_expandAnim';
      marker: { startTime: number; duration: number };
    }> = [];
    if (animate) {
      for (const node of simulation.nodes()) {
        const key = retained.has(node.id) ? '_collapseAnim' : previousHidden.has(node.id) && !hidden.has(node.id) ? '_expandAnim' : null;
        if (!key) continue;
        // Static simulations may reference persisted nodes; keep animation fields out of undo snapshots.
        const marker = { startTime, duration: ANIM_DURATION };
        Object.defineProperty(node, key, { value: marker, configurable: true });
        animated.push({ node, key, marker });
      }
    }
    if (!animated.length) return;

    const clear = () => {
      hierarchyAnimations.delete(manager);
      for (const { node, key, marker } of animated) {
        if (node[key] === marker) delete node[key];
      }
    };
    hierarchyAnimations.set(manager, clear);
    const frame = (now: number) => {
      if (hierarchyAnimations.get(manager) !== clear) return;
      const active = hierarchyViewsForRuntime(runtime).get(manager) === view;
      if (!active || manager.getSim() !== simulation || now - startTime >= ANIM_DURATION) {
        clear();
        if (active && manager.getSim() === simulation) manager.refreshHierarchyNodes(getCollapsedHierarchyHiddenNodeIds(view));
      } else requestAnimationFrame(frame);
      if (active) draw();
    };
    requestAnimationFrame(frame);
  };

  const applyHierarchyFoldForPane = (
    pane: PaneState,
    runtime: GraphRuntime,
    view: GraphData,
    nodeId: string,
    action: HierarchyFoldAction,
  ) => {
    if (!canMutateCanvasPane(pane) || paneRuntimeGraph(pane) !== runtime.graph
      || scopedPaneGraph(pane) !== view || pane.localContextProjection) return;
    const ids = new Set(getHierarchyFoldActions(view, nodeId).get(action));
    const nodes = runtime.graph.nodes.filter(node => ids.has(node.id) && !isStructureNode(node));
    if (!nodes.length) return;

    const views = [...hierarchyViewsForRuntime(runtime)].map(([manager, model]) => ({
      manager, model, previousHidden: getCollapsedHierarchyHiddenNodeIds(model),
    }));
    runtime.undoManager.pushSnapshot(runtime.graph);
    const collapsed = action === 'collapse' || action === 'collapseAll';
    for (const node of nodes) node.collapsed = collapsed;
    for (const { manager, model, previousHidden } of views) {
      animateHierarchyChange(runtime, manager, model, previousHidden);
    }
    scheduleSaveForRuntime(runtime);
    draw();
  };

  const focusedInteractionBlocked = (action: string) => {
    if (blockForTextDraft(action)) return true;
    const targetPane = focusedExtraPane();
    const runtime = targetPane?.runtime ?? primaryRuntime;
    const owner = targetPane ?? pane0;
    if (runtime.canInteract(owner)) return false;
    showToast('此图正在另一窗格的文字视图中编辑', 'warning', 3500);
    return true;
  };

  const selectAndEditFocusedNode = (nodeId: string, targetPane: PaneState | null) => {
    if (targetPane) {
      targetPane.selNode = nodeId;
      targetPane.selEdge = null;
      targetPane.selGroup = null;
    } else {
      selNode = nodeId;
      selEdge = null;
      selGroup = null;
    }
    sharedState.clearSelection?.();
    fillNode(nodeId);
  };

  const createChildNodeForPane = (parentId: string, targetPane = focusedExtraPane(), placement?: { x: number; y: number; dashed?: boolean }): string | null => {
    if (focusedInteractionBlocked('新建子节点')) return null;
    const targetGraph = targetPane?.graph ?? graph;
    if (targetGraph.settings?.sourceMode === 'vault-readonly') {
      showToast('请在 Obsidian 中编辑原文；NodeSpace 会自动重新投影', 'info', 3500);
      return null;
    }
    const parent = targetGraph.nodes.find(node => node.id === parentId);
    if (!parent || isStructureNode(parent)) return null;
    const targetSimManager = targetPane?.simManager ?? simManager;
    const simParent = targetSimManager?.getSim()?.nodes().find((node: any) => node.id === parentId);
    const px = simParent?.x ?? parent.x ?? 200;
    const py = simParent?.y ?? parent.y ?? 200;
    const childId = createNodeId(targetGraph.nodes);
    const childLevel = Math.min(6, (parent.headingLevel || 6) + 1);
    const child = {
      id: childId,
      label: '子节点',
      headingLevel: childLevel,
      tags: [],
      x: placement?.x ?? px + 60,
      y: placement?.y ?? py + 40,
      _isNew: true,
    };
    assignCreatedOrder(child, targetGraph.nodes);
    (targetPane?.undoManager ?? undoManager).pushSnapshot(targetGraph);
    targetGraph.nodes.push(child);
    targetGraph.edges.push({
      source: parentId,
      target: childId,
      label: '',
      color: '#BFBFBF',
      arrow: targetPane?.defArrow ?? defArrow,
      lineStyle: placement?.dashed ? 'dash-2' : 'solid',
      _createdAt: performance.now(),
    });
    selectAndEditFocusedNode(childId, targetPane);
    reinitializeRuntimeViews(targetPane?.runtime ?? primaryRuntime);
    if (targetPane) scheduleSaveForPane(targetPane); else scheduleSave();
    syncFocusedCommands();
    draw();
    beginNodeTitleEditForPane(targetPane ?? pane0 as unknown as PaneState, childId, true);
    return childId;
  };

  const createChildNodeInFocusedPane = () => {
    const targetPane = focusedExtraPane();
    const parentId = targetPane?.selNode ?? selNode;
    if (parentId) createChildNodeForPane(parentId, targetPane);
  };

  const changeFocusedHeading = (delta: -1 | 1, requestedNodeId?: string) => {
    if (focusedInteractionBlocked(delta < 0 ? '提升层级' : '降低层级')) return;
    const targetPane = focusedExtraPane();
    const targetGraph = targetPane?.graph ?? graph;
    if (targetGraph.settings?.sourceMode === 'vault-readonly') {
      showToast('标题层级来自 Markdown 原文，请在 Obsidian 中修改', 'info', 3500);
      return;
    }
    const nodeId = requestedNodeId ?? targetPane?.selNode ?? selNode;
    const node = nodeId ? targetGraph.nodes.find(candidate => candidate.id === nodeId) : null;
    if (!node || isStructureNode(node)) return;
    const currentLevel = Math.max(1, Math.min(6, node.headingLevel || 6));
    const nextLevel = Math.max(1, Math.min(6, currentLevel + delta));
    if (nextLevel === currentLevel) return;
    (targetPane?.undoManager ?? undoManager).pushSnapshot(targetGraph);
    node.headingLevel = nextLevel;
    node.radius = undefined;
    node.radiusMode = undefined;
    const levelRadius = [22, 19, 16, 13, 10, 7][nextLevel - 1] || 9;
    const targetSimulation = (targetPane?.simManager ?? simManager)?.getSim();
    const simNode = targetSimulation?.nodes().find((candidate: any) => candidate.id === node.id);
    if (simNode) {
      simNode.headingLevel = nextLevel;
      simNode.radius = levelRadius;
      simNode.radiusMode = undefined;
      targetSimulation.nodes(targetSimulation.nodes());
      targetSimulation.alpha(Math.max(targetSimulation.alpha(), 0.05)).restart();
    }
    if (targetPane) scheduleSaveForPane(targetPane); else scheduleSave();
    fillNode(node.id);
    syncFocusedCommands();
    draw();
  };

  const focusedMobileSelectionState = () => {
    const targetPane = focusedExtraPane();
    const targetGraph = targetPane?.graph ?? graph;
    const nodeId = targetPane?.selNode ?? selNode;
    const node = nodeId ? targetGraph.nodes.find(candidate => candidate.id === nodeId) : null;
    const boxSelection = sharedState.selectedNodeIds;
    const hasSingleSelection = !!node && (boxSelection.length === 0 || (boxSelection.length === 1 && boxSelection[0] === node.id));
    const isSingleOrdinaryNode = !!node && hasSingleSelection && !isStructureNode(node);
    const level = node?.headingLevel || 6;
    return {
      hasSelection: !!node && hasSingleSelection,
      isSingleOrdinaryNode,
      canRaiseHeading: isSingleOrdinaryNode && level > 1,
      canLowerHeading: isSingleOrdinaryNode && level < 6,
    };
  };

  const createNodeInFocusedPane = (initialLabel?: string) => {
    if (focusedInteractionBlocked('新建节点')) return;
    const targetPane = focusedExtraPane();
    const targetGraph = targetPane?.graph ?? graph;
    if (targetGraph.settings?.sourceMode === 'vault-readonly') {
      showToast('这是只读文档空间；新想法请写入图空间或原文', 'info', 3500);
      return;
    }
    if (targetPane) {
      const center = targetPane.pixi?.viewport?.center ?? { x: targetPane.gw / 2, y: targetPane.gh / 2 };
      const newNode = { id: createNodeId(targetGraph.nodes), label: initialLabel?.trim() || '新记录', headingLevel: 6, tags: [], x: center.x, y: center.y, _isNew: true };
      assignCreatedOrder(newNode, targetPane.graph.nodes);
      targetPane.undoManager.pushSnapshot(targetPane.graph);
      targetPane.graph.nodes.push(newNode);
      selectAndEditFocusedNode(newNode.id, targetPane);
      targetPane.simManager.initSim();
      scheduleSaveForPane(targetPane);
      syncFocusedCommands();
      draw();
      if (!initialLabel) beginNodeTitleEditForPane(targetPane, newNode.id, true);
      return;
    }

    const center = pixi?.viewport?.center ?? { x: gw / 2, y: gh / 2 };
    const newNode = { id: createNodeId(graph.nodes), label: initialLabel?.trim() || '新记录', headingLevel: 6, tags: [], x: center.x, y: center.y, _isNew: true };
    assignCreatedOrder(newNode, graph.nodes);
    saveUndo();
    graph.nodes.push(newNode);
    selectAndEditFocusedNode(newNode.id, null);
    scheduleSave();
    addNodeToSim(newNode);
    draw();
    if (!initialLabel) beginNodeTitleEditForPane(pane0 as unknown as PaneState, newNode.id, true);
  };
  addBtn.onclick = () => createNodeInFocusedPane();
  addBtn.textContent = '+ 记录';
  addBtn.title = '记下一段内容';
  addBtn.dataset.mobileDuplicate = 'true';
  primaryRow.appendChild(addBtn);
  // 多分屏扩展数组（初始包含 pane1）
  const extraContainers: HTMLDivElement[] = [pane1Container];
  const extraPixis: (PixiLayers | null)[] = [pixi1];
  const extraSims: any[] = [simManager1];
  const extraSprites: Map<string, NodeSprite>[] = [pane1NodeSprites];

  const allPaneOwners = (): PaneState[] => [pane0 as unknown as PaneState, ...extraPanes];
  const paneRuntimeGraph = (pane: PaneState): GraphData => pane.index === PANE_LEFT ? graph : pane.runtime.graph;
  const mediaTextEditorForPane = (pane: PaneState | undefined, node: any, field: 'note' | 'mediaUrl') => {
    if (!pane || !canMutateCanvasPane(pane) || !paneRuntimeGraph(pane).nodes.includes(node)) return null;
    const runtime = pane.index === PANE_LEFT ? primaryRuntime : pane.runtime;
    return createMediaTextEditor({
      getGraph: () => paneRuntimeGraph(pane), node, field,
      canMutate: () => canMutateCanvasPane(pane),
      saveUndo: destination => runtime.undoManager.pushSnapshot(destination),
      onChange: () => {
        for (const owner of allPaneOwners()) {
          if ((owner.index === PANE_LEFT ? primaryRuntime : owner.runtime) !== runtime) continue;
          const simulated = scopedPaneSimulationManager(owner)?.getSim()?.nodes()?.find((candidate: any) => candidate.id === node.id);
          if (simulated && simulated !== node) simulated[field] = node[field];
        }
        scheduleSaveForRuntime(runtime);
        if (focusedPaneState() === pane && pane.selNode === node.id) fillNode(node.id);
        syncFocusedCommands(); rafDraw();
      },
    });
  };
  const canMutateCanvasPane = (pane: PaneState): boolean => {
    const runtime = pane.index === PANE_LEFT ? primaryRuntime : pane.runtime;
    if (!allPaneOwners().includes(pane) || !appShell.isConnected || !panePixi(pane)
      || pane.index !== PANE_LEFT && (!splitActive || pane.canvasContainer.style.display === 'none')) return false;
    return paneRuntimeGraph(pane).settings?.sourceMode !== 'vault-readonly'
      && !pane.textViewActive && !runtime.textEditActive && runtime.canInteract(pane);
  };
  const createPaneNodeTextChange = (pane: PaneState, id: string, field: NodeTextField) => {
    const destination = paneRuntimeGraph(pane);
    const node = destination.nodes.find(candidate => candidate.id === id);
    if (!node || !canMutateCanvasPane(pane) || isPaneStructureProxyNode(pane.structureView, id)
      || isCrossSpaceProxyNode(scopedPaneGraph(pane).nodes.find(candidate => candidate.id === id))) return null;

    const runtime = pane.index === PANE_LEFT ? primaryRuntime : pane.runtime;
    const initialValue = node[field] ?? '';
    const isCurrent = () => canMutateCanvasPane(pane) && paneRuntimeGraph(pane) === destination
      && destination.nodes.includes(node) && (node[field] ?? '') === initialValue;
    const commit = (value: string) => {
      const editor = createNodeTextEditor({
        getGraph: () => paneRuntimeGraph(pane),
        getSelectedNode: () => node,
        canMutate: isCurrent,
        saveUndo: () => runtime.undoManager.pushSnapshot(destination),
        onChange: () => {
          if (field === 'label' && isStructureNode(node)) syncStructureCollections(destination);
          const managers = new Set([runtime.simManager]);
          for (const owner of allPaneOwners()) {
            if ((owner.index === PANE_LEFT ? primaryRuntime : owner.runtime) === runtime) managers.add(scopedPaneSimulationManager(owner));
          }
          for (const manager of managers) {
            const simulated = manager?.getSim()?.nodes().find((candidate: any) => candidate.id === id);
            if (simulated) simulated[field] = node[field];
          }
          scheduleSaveForRuntime(runtime);
          if (focusedPaneState() === pane && pane.selNode === id) fillNode(id);
          scheduleNameRender();
        },
      });
      editor.begin(field);
      editor.update(field, value);
      editor.end();
    };
    return { node, initialValue, isCurrent, commit };
  };

  const noteEditSessionForPane = (pane: PaneState, id: string): NodeNoteEdit | null => {
    const change = createPaneNodeTextChange(pane, id, 'note');
    return change ? { note: change.initialValue, commit: change.commit } : null;
  };

  const beginNodeNoteEditForPane = (pane: PaneState, id: string): boolean => {
    const change = createPaneNodeTextChange(pane, id, 'note');
    const px = panePixi(pane);
    if (!change || !px) return false;
    const live = scopedPaneSimulationManager(pane)?.getSim()?.nodes().find((candidate: any) => candidate.id === id) ?? change.node;
    const canvas = px.app.canvas.getBoundingClientRect();
    const point = px.viewport.toScreen(live.x, live.y);
    const radius = live._semanticCard?.form === 'card' ? live._semanticCard.width / 2 : getNodeVisualRadius(live);
    return selectedNotePreview.show(change.node.label ?? '', change.initialValue, canvas.left + point.x, canvas.top + point.y,
      radius * px.viewport.scale.x, canvas, () => ({ note: change.initialValue, commit: change.commit })) && selectedNotePreview.edit();
  };

  const beginNodeTitleEditForPane = (pane: PaneState, id: string, selectContents = false): boolean => {
    const change = createPaneNodeTextChange(pane, id, 'label');
    if (!change) return false;
    const { node } = change;

    if (focusedPaneState() !== pane) switchFocusedPane(pane.index);
    if (pane.selNode !== id) fillNode(id);
    selectedNotePreview.hide();

    let hiddenTitle: NodeSprite['label'] | undefined;
    const restoreTitle = () => {
      if (!hiddenTitle) return;
      if (!hiddenTitle.destroyed) hiddenTitle.renderable = true;
      hiddenTitle = undefined;
      panePixi(pane)?.app.render();
    };

    return inlineNodeTitle.begin({
      label: change.initialValue,
      selectContents,
      fontFamily: (pane.index === PANE_LEFT ? fontFamily : pane.fontFamily) || DEFAULT_CANVAS_FONT,
      restoreTitle,
      anchor: () => {
        const px = panePixi(pane);
        if (!px || !change.isCurrent() || focusedPaneState() !== pane || pane.selNode !== id) return null;
        const sprite = (pane.index === PANE_LEFT ? nodeSprites : extraSprites[pane.index - 1])?.get(id);
        const { viewport } = px;
        const canvas = px.app.canvas.getBoundingClientRect();
        const scaleX = canvas.width / (viewport.screenWidth || canvas.width || 1);
        const scaleY = canvas.height / (viewport.screenHeight || canvas.height || 1);
        const title = sprite?.label;
        const bounds = renderedNodeTitleHitBounds(sprite, viewport, undefined, undefined, title === hiddenTitle);
        if (bounds && title) {
          const start = viewport.toScreen(bounds.left, bounds.top);
          const end = viewport.toScreen(bounds.right, bounds.bottom);
          const height = (end.y - start.y) * scaleY;
          const fontSize = title.style.fontSize * height / Math.max(1, title.bounds.height);
          const fill = title.style.fill;
          const color = typeof fill === 'number' ? `#${fill.toString(16).padStart(6, '0')}` : typeof fill === 'string' ? fill : undefined;
          if (hiddenTitle !== title) {
            restoreTitle();
            hiddenTitle = title;
            title.renderable = false;
            px.app.render();
          }
          return { x: canvas.left + start.x * scaleX, y: canvas.top + start.y * scaleY,
            width: (end.x - start.x) * scaleX, height, fontSize, fontWeight: title.style.fontWeight, color,
            startAligned: title.anchor.x === 0, canvas };
        }
        const simulated = scopedPaneSimulationManager(pane)?.getSim()?.nodes().find((candidate: any) => candidate.id === id) ?? node;
        const point = viewport.toScreen(simulated.x, simulated.y + getNodeVisualRadius(simulated) + 3);
        return { x: canvas.left + point.x * scaleX, y: canvas.top + point.y * scaleY,
          width: 0, height: 18, fontSize: 15 * viewport.scale.y * scaleY, startAligned: false, canvas };
      },
      commit: change.commit,
    });
  };
  const commitCreatedPaneNodes = (pane: PaneState, destination: GraphData, nodes: any[], structureId: string | null, edges: any[] = []): boolean => {
    if (!canMutateCanvasPane(pane) || paneRuntimeGraph(pane) !== destination
      || (pane.structureView?.structureId ?? null) !== structureId || nodes.length === 0) return false;
    const runtime = pane.index === PANE_LEFT ? primaryRuntime : pane.runtime;
    const ids = new Set(destination.nodes.map(node => String(node.id)));
    for (const node of nodes) {
      if (ids.has(String(node.id))) return false;
      ids.add(String(node.id));
    }
    if (edges.some(edge => !ids.has(String(typeof edge.source === 'object' ? edge.source.id : edge.source))
      || !ids.has(String(typeof edge.target === 'object' ? edge.target.id : edge.target)))) return false;
    if (structureId) {
      const preview = { ...destination, nodes: [...destination.nodes, ...nodes] };
      if (nodes.some(node => previewStructureMembershipTransaction(preview,
        { action: 'add', structureId, nodeId: node.id }).status !== 'changed')) return false;
    }
    // Check order capacity without repairing the live document before its snapshot.
    assignCreatedOrders(nodes, destination.nodes.map(node => ({ ...node })));
    runtime.undoManager.pushSnapshot(destination);
    assignCreatedOrders(nodes, destination.nodes);
    destination.nodes.push(...nodes);
    destination.edges.push(...edges);
    if (structureId) for (const node of nodes) {
      transactStructureMembership(destination, { action: 'add', structureId, nodeId: node.id });
    }
    scheduleSaveForRuntime(runtime);
    reinitializeRuntimeViews(runtime);
    pane.selNode = nodes[0].id; pane.selEdge = null; pane.selGroup = null;
    if (focusedPaneState() === pane) fillNode(nodes[0].id);
    syncFocusedCommands(); draw();
    return true;
  };
  const duplicateNodeForPane = (pane: PaneState, nodeId: string, expectedGraph = paneRuntimeGraph(pane)): string | null => {
    if (!canMutateCanvasPane(pane) || paneRuntimeGraph(pane) !== expectedGraph) return null;
    const node = expectedGraph.nodes.find(candidate => candidate.id === nodeId);
    if (!node || node._structureInteriorProxy || node._localContextProxy) return null;
    const copy = prepareGraphCopy(expectedGraph, { nodes: [node], edges: [] },
      { x: (node.x || 0) + 60, y: (node.y || 0) + 40 });
    return commitCreatedPaneNodes(pane, expectedGraph, copy.nodes, pane.structureView?.structureId ?? null)
      ? copy.nodes[0].id : null;
  };
  const captureMediaImport = (pane: PaneState, placement?: { x: number; y: number }) => {
    if (!canMutateCanvasPane(pane)) {
      showToast(paneRuntimeGraph(pane).settings?.sourceMode === 'vault-readonly'
        ? '这是只读来源；请把附件放入图空间' : '请先完成这个空间的文字编辑，再导入附件', 'info', 3500);
      return null;
    }
    return createMediaImportSession(pane, {
      getGraph: paneRuntimeGraph, canMutate: canMutateCanvasPane,
      getContextKey: owner => owner.structureView?.structureId ?? null,
      getOrigin: owner => panePixi(owner)?.viewport.center ?? { x: 0, y: 0 },
      commit: commitCreatedPaneNodes,
    }, placement);
  };
  const importBrowserFiles = async (session: NonNullable<ReturnType<typeof captureMediaImport>>, files: File[]) => {
    try {
      const { sources, unsupported } = await readBrowserMediaSources(files);
      const created = session.add(sources);
      if (created.length) showToast(`已导入 ${created.length} 个附件${unsupported.length ? `，另 ${unsupported.length} 个文件类型暂不支持` : ''}`, 'success');
      else if (sources.length) showToast('目标空间已变化，未导入附件', 'info', 3000);
      else if (unsupported.length) showToast('这些文件类型暂不支持，请选择图片、音视频、PDF 或文本', 'info', 3500);
    } catch (error) {
      showToast('无法读取附件，请重新选择文件', 'error', 3500);
      console.warn('[nodespace] Attachment import:', error);
    }
  };
  const scopedPaneGraph = (pane: PaneState): GraphData => pane.structureView?.graph
    ?? pane.localContextProjection?.graph
    ?? paneRuntimeGraph(pane);
  const scopedPaneSimulationManager = (pane: PaneState): any => pane.structureView?.simManager
    ?? pane.localContextProjection?.simManager
    ?? (pane.index === PANE_LEFT ? simManager : pane.simManager);

  function setPaneNodesFixed(pane: PaneState, ids: readonly string[], desired?: boolean, expectedView = scopedPaneGraph(pane)): boolean {
    const view = scopedPaneGraph(pane);
    if (view !== expectedView || !canMutateCanvasPane(pane)) return false;
    const runtime = pane.index === PANE_LEFT ? primaryRuntime : pane.runtime;
    if (runtime.fileOperationActive) return false;
    const nodesById = new Map(runtime.graph.nodes.map(node => [String(node.id), node]));
    const visibleById = view === runtime.graph ? nodesById : new Map(view.nodes.map(node => [String(node.id), node]));
    const requested = [...new Set(ids.map(String))];
    if (!requested.length || requested.some(id => !nodesById.has(id) || !visibleById.has(id)
      || isPaneStructureProxyNode(pane.structureView, id) || isCrossSpaceProxyNode(visibleById.get(id)))) return false;

    const fixed = desired ?? !requested.every(id => nodesById.get(id).fixed);
    const manager = scopedPaneSimulationManager(pane);
    const rendered = coordinateLayoutModes.has(pane.activeMode) ? view.nodes : manager?.getSim()?.nodes() ?? [];
    const renderedById = new Map<string, { x: number; y: number }>(rendered.map((node: any) => [String(node.id), node]));
    const changes = new Map<string, { fixed: boolean; fx: number | null; fy: number | null }>();
    for (const id of requested) {
      const node = nodesById.get(id);
      if (Boolean(node.fixed) === fixed) continue;
      const position = renderedById.get(id) ?? node;
      if (fixed && (!Number.isFinite(position.x) || !Number.isFinite(position.y))) return false;
      changes.set(id, { fixed, fx: fixed ? position.x : null, fy: fixed ? position.y : null });
    }
    if (changes.size === 0) return false;

    runtime.undoManager.pushSnapshot(runtime.graph);
    const managers = new Set([runtime.simManager]);
    for (const owner of allPaneOwners()) {
      if ((owner.index === PANE_LEFT ? primaryRuntime : owner.runtime) !== runtime) continue;
      const savedPins = owner.index === PANE_LEFT ? savedFixedNodes : owner.savedFixedNodes;
      for (const pin of savedPins) {
        const change = changes.get(pin.id);
        if (!change) continue;
        Object.assign(pin, change);
        if (change.fx !== null && change.fy !== null) { pin.x = change.fx; pin.y = change.fy; }
      }
      // An in-flight semantic animation still owns its displayed coordinates.
      // The pin becomes authoritative before the next automatic layout pass.
      if (owner.layout.current instanceof SemanticLayoutController) {
        owner.currentAnimationCancel?.();
        owner.currentAnimationCancel = null;
      }
      managers.add(scopedPaneSimulationManager(owner));
    }
    for (const [id, change] of changes) {
      const node = nodesById.get(id);
      Object.assign(node, change);
      if (change.fixed) { node.x = change.fx; node.y = change.fy; }
    }
    for (const simulationManager of managers) {
      const simulation = simulationManager?.getSim();
      if (!simulation) continue;
      const members = simulation.nodes();
      let changed = false;
      for (const node of members) {
        const change = changes.get(String(node.id));
        if (!change) continue;
        temporaryNodeAnchors.delete(node);
        Object.assign(node, change);
        if (change.fixed) { node.x = change.fx; node.y = change.fy; }
        changed = true;
      }
      if (changed && !simulationManager.isStaticMode()) {
        simulation.nodes(members);
        simulation.alpha(Math.max(simulation.alpha(), 0.01)).restart();
      }
    }
    scheduleSaveForRuntime(runtime);
    draw();
    return true;
  }

  // Search depends on pane-scope helpers; initialize its view only after those
  // helpers exist (startup executes this path synchronously).
  syncSearchControlsFromFocusedPane();

  const canStartMembershipDrag = (pane: PaneState, runtime: GraphRuntime, nodeId: string): boolean => {
    if (pane.structureView || pane.textViewActive || runtime.textEditActive || coordinateLayoutModes.has(pane.activeMode)) return false;
    if (isPaneStructureProxyNode(pane.structureView, nodeId)) return false;
    const node = runtime.graph.nodes.find(candidate => candidate.id === nodeId);
    return Boolean(node && !isStructureNode(node) && !node._structureInteriorProxy);
  };

  const beginMembershipDrag = (pane: PaneState, nodeId: string, worldX: number, worldY: number) => {
    const runtime = pane.index === PANE_LEFT ? primaryRuntime : pane.runtime;
    clearMembershipDragPreview(pane);
    if (!canStartMembershipDrag(pane, runtime, nodeId)) return;

    const node = runtime.graph.nodes.find(candidate => candidate.id === nodeId)!;
    const sourceStructureId = typeof node.structureParentId === 'string' && node.structureParentId.length > 0
      ? node.structureParentId
      : null;
    const expandedModels = getExpandedStructureBoundaryModels(runtime.graph);
    const sourceModel = sourceStructureId
      ? expandedModels.find(model => model.structureId === sourceStructureId && model.memberIds.includes(nodeId))
      : null;
    let sourceSnapshot: MembershipDragSourceSnapshot | null = null;
    if (sourceModel) {
      const simNodes = scopedPaneSimulationManager(pane)?.getSim?.()?.nodes?.() ?? [];
      const simNodesById = new Map<string, any>(simNodes.map((candidate: any) => [candidate.id, candidate]));
      const otherMembers = sourceModel.memberIds.flatMap(memberId => {
        if (memberId === nodeId) return [];
        const member = simNodesById.get(memberId);
        return member && Number.isFinite(member.x) && Number.isFinite(member.y)
          ? [{ x: member.x, y: member.y, visualRadius: getNodeVisualRadius(member) }]
          : [];
      });
      const shape = computeStructureBoundary(otherMembers) ?? undefined;
      const currentShape = pane.structureBoundaryShapes.get(sourceStructureId!);
      const center = shape?.center ?? currentShape?.center ?? { x: worldX, y: worldY };
      const fallbackRadius = currentShape
        ? Math.max(48, Math.hypot(currentShape.bounds.maxX - currentShape.bounds.minX, currentShape.bounds.maxY - currentShape.bounds.minY) / 2)
        : 64;
      sourceSnapshot = { shape, center, escapeRadius: fallbackRadius };
    }

    pane.hoverStructureId = null;
    pane.membershipDragSession = {
      runtime,
      nodeId,
      sourceStructureId,
      sourceExpanded: Boolean(sourceModel),
      sourceSnapshot,
    };
    pane.membershipDragPreview = {
      nodeId,
      sourceStructureId,
      targetStructureId: null,
      mode: 'none',
      message: sourceStructureId && !sourceModel ? '当前归属结构未展开' : '拖动以调整结构成员',
      sourceBoundaryShape: sourceSnapshot?.shape,
    };
    draw();
  };

  const resolveMembershipDragPreview = (pane: PaneState, nodeId: string, worldX: number, worldY: number) => {
    const session = pane.membershipDragSession;
    if (!session || session.nodeId !== nodeId) return null;
    const expandedIds = getExpandedStructureBoundaryModels(session.runtime.graph).map(model => model.structureId);
    if (!session.sourceStructureId) {
      const targetStructureId = pickMembershipBoundaryTarget(
        pane.structureBoundaryShapes,
        expandedIds,
        worldX,
        worldY,
      );
      return {
        nodeId,
        sourceStructureId: null,
        targetStructureId,
        mode: targetStructureId ? 'add' as const : 'none' as const,
        message: targetStructureId ? '松手加入结构' : '未命中展开结构',
      };
    }

    const otherTargetId = pickMembershipBoundaryTarget(
      pane.structureBoundaryShapes,
      expandedIds,
      worldX,
      worldY,
      session.sourceStructureId,
    );
    if (otherTargetId) {
      return {
        nodeId,
        sourceStructureId: session.sourceStructureId,
        targetStructureId: otherTargetId,
        mode: 'reject' as const,
        message: '节点已属于其他结构，不能直接转移',
        sourceBoundaryShape: session.sourceSnapshot?.shape,
      };
    }
    if (!session.sourceExpanded || !session.sourceSnapshot) {
      return {
        nodeId,
        sourceStructureId: session.sourceStructureId,
        targetStructureId: null,
        mode: 'none' as const,
        message: '仅可从展开结构移出成员',
      };
    }
    const remove = isOutsideMembershipSourceSnapshot(session.sourceSnapshot, worldX, worldY);
    return {
      nodeId,
      sourceStructureId: session.sourceStructureId,
      targetStructureId: null,
      mode: remove ? 'remove' as const : 'none' as const,
      message: remove ? '松手移出结构' : '仍在结构边界内',
      sourceBoundaryShape: session.sourceSnapshot.shape,
    };
  };

  const moveMembershipDrag = (pane: PaneState, nodeId: string, worldX: number, worldY: number) => {
    const preview = resolveMembershipDragPreview(pane, nodeId, worldX, worldY);
    if (!preview) return;
    pane.membershipDragPreview = preview;
    pane.hoverStructureId = null;
    draw();
  };

  const endMembershipDrag = (pane: PaneState, nodeId: string, worldX: number, worldY: number, cancelled: boolean) => {
    const session = pane.membershipDragSession;
    if (!session || session.nodeId !== nodeId) {
      clearMembershipDragPreview(pane);
      draw();
      return;
    }
    const finalPreview = cancelled ? null : resolveMembershipDragPreview(pane, nodeId, worldX, worldY);
    clearMembershipDragPreview(pane);
    draw();
    if (!finalPreview || finalPreview.mode === 'none' || finalPreview.mode === 'reject') return;
    const request: StructureMembershipRequest = finalPreview.mode === 'add'
      ? { action: 'add', structureId: finalPreview.targetStructureId!, nodeId }
      : { action: 'remove', structureId: finalPreview.sourceStructureId!, nodeId };
    void applyStructureMembershipTransaction(session.runtime, request);
  };

  const structureNodeForPane = (pane: PaneState) => {
    const id = pane.structureController.currentId;
    return id ? paneRuntimeGraph(pane).nodes.find(node => node.id === id && isStructureNode(node)) ?? null : null;
  };
  const updateStructureBreadcrumb = (pane: PaneState) => {
    const structureNode = structureNodeForPane(pane);
    if (!structureNode || !pane.structureBreadcrumb || !pane.structureView) {
      pane.structureBreadcrumb?.hide();
      return;
    }
    pane.structureBreadcrumb.update(
      [graphDisplayName(pane.index === PANE_LEFT ? activeTab : pane.activeTab), structureNode.label || structureNode.id],
      {
        purpose: structureNode.structure.purpose,
        summary: structureNode.structure.summary,
        directStructureEdgeCount: pane.structureView.directStructureEdgeCount,
      },
    );
    pane.structureBreadcrumb.show();
  };
  const commitStructureMemberDrag = (pane: PaneState, nodeId: string) => {
    const view = pane.structureView;
    if (!view || view.proxyNodeIds.has(nodeId)) return;
    const simNode = view.simManager?.getSim?.()?.nodes?.().find((node: any) => node.id === nodeId);
    const runtimeNode = paneRuntimeGraph(pane).nodes.find(node => node.id === nodeId);
    if (!simNode || !runtimeNode) return;
    runtimeNode.x = simNode.x;
    runtimeNode.y = simNode.y;
    if (simNode.fixed) {
      runtimeNode.fx = simNode.fx;
      runtimeNode.fy = simNode.fy;
    }
    if (pane.index === PANE_LEFT) scheduleSave();
    else scheduleSaveForPane(pane);
    reinitializeRuntimeViews(pane.index === PANE_LEFT ? primaryRuntime : pane.runtime);
  };
  exitStructureForPane = (pane: PaneState, fit = false): boolean => {
    clearMembershipDragPreview(pane);
    if (!pane.structureView) return false;
    pane.structureView.simManager?.getSim?.()?.stop?.();
    clearPaneStructureBoundaries(pane);
    pane.structureView = null;
    pane.structureController.exitTo(-1);
    pane.structurePath = [];
    pane.selNode = null;
    pane.selEdge = null;
    pane.selGroup = null;
    pane.draggingNode = null;
    pane.linkMode = false;
    pane.linkSrc = null;
    pane.structureBreadcrumb?.hide();
    if (pane.index === PANE_LEFT) {
      selNode = null; selEdge = null; selGroup = null;
    }
    draw();
    if (fit) requestAnimationFrame(fitFocusedPane);
    return true;
  };
  const buildStructureViewForPane = (pane: PaneState, structureId: string): PaneStructureView | null => {
    const base = createPaneStructureView(paneRuntimeGraph(pane), structureId);
    if (!base) return null;
    const view = { ...base, simManager: null } as PaneStructureView;
    view.simManager = createSimManager(
      view.graph,
      () => pane.gw, () => pane.gh,
      () => pane.linkDist, () => pane.linkStr, () => pane.charge, () => pane.centerS,
      () => pane.collideR, () => pane.groupBound,
      () => pane.alphaTarget, () => pane.heatingTime,
      () => getCollapsedHierarchyHiddenNodeIds(view.graph),
      () => draw(),
    );
    view.simManager.initSim();
    return view;
  };
  const rebuildStructureViewForPane = (pane: PaneState): boolean => {
    const structureId = pane.structureController.currentId;
    if (!structureId) return false;
    const next = buildStructureViewForPane(pane, structureId);
    if (!next) {
      exitStructureForPane(pane);
      return false;
    }
    pane.structureView?.simManager?.getSim?.()?.stop?.();
    pane.structureView = next;
    pane.structurePath = [...pane.structureController.path];
    pane.selNode = null;
    pane.selEdge = null;
    updateStructureBreadcrumb(pane);
    return true;
  };
  refreshStructureViews = (runtime: GraphRuntime) => {
    for (const pane of allPaneOwners()) {
      const ownerRuntime = pane.index === PANE_LEFT ? primaryRuntime : pane.runtime;
      if (ownerRuntime !== runtime || !pane.structureView) continue;
      rebuildStructureViewForPane(pane);
    }
  };
  const enterStructureForPane = (pane: PaneState, id: string): void => {
    const runtime = pane.index === PANE_LEFT ? primaryRuntime : pane.runtime;
    const node = scopedPaneGraph(pane).nodes.find(candidate => candidate.id === id);
    const markdownSource = node?.resourceRef?.kind === 'markdown'
      ? node.resourceRef
      : node?.sourceRef?.kind === 'markdown' ? node.sourceRef : null;
    if (markdownSource) {
      void openMarkdownSourceEditor(pane, node);
      return;
    }
    if (isCrossSpaceProxyNode(node)) {
      openLocalContextForPane(pane, id);
      return;
    }
    if (isSpaceReferenceNode(node)) {
      void openSpaceReferenceTarget(pane, node);
      return;
    }
    if (isResourceReferenceNode(node)) {
      void openResourceReferenceTarget(pane, node);
      return;
    }
    if (runtime.graph.settings?.sourceMode === 'vault-readonly' && node?.sourceRef) {
      void openVaultProjectionTarget(pane, node);
      return;
    }
    if (!isStructureNode(node)) {
      openLocalContextForPane(pane, id);
      return;
    }
    if (pane.textViewActive || runtime.textEditActive) {
      showToast('文字视图或文字编辑锁已激活，无法进入结构内部', 'warning', 4000);
      return;
    }
    if (pane.structureView || !pane.structureController.enter(id)) return;
    closeLocalContextForPane(pane);
    clearPaneStructureBoundaries(pane);
    pane.currentAnimationCancel?.();
    pane.currentAnimationCancel = null;
    if (pane.index === PANE_LEFT && activeMode === 'radial') stopStarLoop();
    clearPaneLayout(pane);
    const view = buildStructureViewForPane(pane, id);
    if (!view) {
      pane.structureController.exit();
      showToast('结构已失效，无法进入', 'warning', 3000);
      return;
    }
    pane.structureView = view;
    pane.structurePath = [...pane.structureController.path];
    pane.selNode = null;
    pane.selEdge = null;
    pane.selGroup = null;
    pane.linkMode = false;
    pane.linkSrc = null;
    updateStructureBreadcrumb(pane);
    draw();
    requestAnimationFrame(fitFocusedPane);
  };
  const attachStructureNavigation = (pane: PaneState) => {
    pane.structureController = new StructureNavigationState({ maxDepth: 1 });
    pane.structurePath = [];
    pane.structureBreadcrumb?.dispose();
    pane.structureBreadcrumb = createStructureBreadcrumb(pane.index === PANE_LEFT ? pixiContainer : pane.canvasContainer, {
      exit: () => exitStructureForPane(pane, true),
      exitTo: index => { if (index < 0) exitStructureForPane(pane, true); },
      editStructure: () => {
        const id = pane.structureController.currentId;
        if (!id) return;
        exitStructureForPane(pane);
        switchFocusedPane(pane.index);
        pane.selNode = id;
        if (pane.index === PANE_LEFT) selNode = id;
        fillNode(id);
      },
    });
    pane.disposeStructureBreadcrumb = () => pane.structureBreadcrumb?.dispose();
  };
  const attachLocalContextNavigation = (pane: PaneState) => {
    pane.localContextNavigator?.dispose();
    pane.localContextNavigator = createLocalContextNavigator(
      pane.index === PANE_LEFT ? pixiContainer : pane.canvasContainer,
      {
        back: () => backLocalContextForPane(pane),
        close: () => closeLocalContextForPane(pane),
        jump: pathIndex => jumpLocalContextForPane(pane, pathIndex),
      },
    );
  };
  attachStructureNavigation(pane0 as unknown as PaneState);
  attachLocalContextNavigation(pane0 as unknown as PaneState);
  attachStructureNavigation(pane1);
  attachLocalContextNavigation(pane1);

  deleteNodesForPane = (pane, requestedIds) => {
    const runtime = pane.index === PANE_LEFT ? primaryRuntime : pane.runtime;
    const runtimeGraph = paneRuntimeGraph(pane);
    if (runtimeGraph.settings?.sourceMode === 'vault-readonly') {
      showToast('这是由 Vault 原文生成的只读视图，不能删除投影卡片', 'info', 3500);
      return false;
    }
    if (runtime.textEditActive || pane.textViewActive) {
      showToast('请先完成文字编辑，再删除节点', 'info', 3000);
      return false;
    }
    const ids = [...new Set(requestedIds)].filter(id => !isPaneStructureProxyNode(pane.structureView, id));
    const nodes = ids.map(id => runtimeGraph.nodes.find(node => node.id === id)).filter(Boolean);
    if (nodes.length === 0) return false;

    const protectedEdgeIndexes = new Set<number>();
    for (const node of nodes) {
      if (!isStructureNode(node)) continue;
      for (const edge of getDirectStructureEdges(runtimeGraph, node.id)) protectedEdgeIndexes.add(edge.originalIndex);
    }
    if (protectedEdgeIndexes.size > 0) {
      showToast(`请先删除或改接 ${protectedEdgeIndexes.size} 条结构整体关系；未删除任何节点`, 'warning', 4500);
      return false;
    }

    pane.undoManager.pushSnapshot(runtimeGraph);
    const beforeIds = new Set(runtimeGraph.nodes.map(node => node.id));
    for (const node of nodes) {
      if (isStructureNode(node)) {
        dissolveStructureNode(runtimeGraph, node.id);
        continue;
      }
      detachNodeFromStructure(runtimeGraph, node.id);
      const nodeIndex = runtimeGraph.nodes.findIndex(candidate => candidate.id === node.id);
      if (nodeIndex >= 0) runtimeGraph.nodes.splice(nodeIndex, 1);
    }
    const remainingIds = new Set(runtimeGraph.nodes.map(node => node.id));
    const removedIds = new Set([...beforeIds].filter(id => !remainingIds.has(id)));
    // Deletion belongs to the document transaction, not a later animation
    // callback. Undo, redo and immediate saves must all see the complete result.
    for (let index = runtimeGraph.edges.length - 1; index >= 0; index--) {
      const edge = runtimeGraph.edges[index];
      const source = typeof edge.source === 'object' ? edge.source.id : edge.source;
      const target = typeof edge.target === 'object' ? edge.target.id : edge.target;
      if (removedIds.has(source) || removedIds.has(target)) runtimeGraph.edges.splice(index, 1);
    }
    pane.selNode = null;
    pane.selEdge = null;
    pane.selGroup = null;
    if (focusedPaneState() === pane) clearEd();
    reinitializeRuntimeViews(runtime);
    scheduleSaveForRuntime(runtime);
    draw();
    return true;
  };

  deleteEdgesForPane = (pane, projectedIndexes) => {
    const runtime = pane.index === PANE_LEFT ? primaryRuntime : pane.runtime;
    const runtimeGraph = paneRuntimeGraph(pane);
    if (runtimeGraph.settings?.sourceMode === 'vault-readonly') {
      showToast('这些关系来自 Markdown 原文（显式链接或标题层级），不能在投影视图中删除', 'info', 3800);
      return false;
    }
    if (runtime.textEditActive || pane.textViewActive) {
      showToast('请先完成文字编辑，再删除关系', 'info', 3000);
      return false;
    }
    const originalIndexes = [...new Set(projectedIndexes.map(index => originalEdgeIndexForPane(pane, index)))];
    if (originalIndexes.some(index => index === null)) {
      showToast('这是只读代理关系；请退出内部视图后编辑', 'info', 3500);
      return false;
    }
    const indexes = (originalIndexes as number[]).filter(index => Number.isInteger(index) && index >= 0 && runtimeGraph.edges[index]);
    if (indexes.length === 0) return false;
    pane.undoManager.pushSnapshot(runtimeGraph);
    for (const index of indexes.sort((a, b) => b - a)) runtimeGraph.edges.splice(index, 1);
    pane.selEdge = null;
    if (focusedPaneState() === pane) clearEd();
    reinitializeRuntimeViews(runtime);
    scheduleSaveForRuntime(runtime);
    draw();
    return true;
  };

  deleteGroupForPane = (pane, id) => {
    const runtime = pane.index === PANE_LEFT ? primaryRuntime : pane.runtime;
    const runtimeGraph = paneRuntimeGraph(pane);
    if (runtimeGraph.settings?.sourceMode === 'vault-readonly') {
      showToast('这是由 Vault 原文生成的只读视图，不能删除集合', 'info', 3500);
      return false;
    }
    if (runtime.textEditActive || pane.textViewActive) {
      showToast('请先完成文字编辑，再删除集合', 'info', 3000);
      return false;
    }
    const index = runtimeGraph.groups.findIndex(group => group.id === id);
    if (index < 0) return false;
    if (isStructureCollection(runtimeGraph.groups[index])) {
      showToast('结构集合随对应结构管理，请从结构卡片调整成员', 'info', 3500);
      return false;
    }
    pane.undoManager.pushSnapshot(runtimeGraph);
    runtimeGraph.groups.splice(index, 1);
    pane.selGroup = null;
    if (focusedPaneState() === pane) clearEd();
    reinitializeRuntimeViews(runtime);
    scheduleSaveForRuntime(runtime);
    draw();
    return true;
  };

  const textEditors = new Map<object, TextViewEditor>();
  const textEditorRuntimes = new Map<object, GraphRuntime>();
  const textRuntimeLocks = new Map<HTMLElement, HTMLDivElement>();
  const textHiddenGlobalUi = new Map<HTMLElement, string>();
  const setTextGlobalUiHidden = (hidden: boolean) => {
    const elements = [
      floatingTop, sidebar.sidebar, minimapBtn, consoleBtn, consolePanel,
      editCtx.editPanel, statsEl, selectionBox,
      document.querySelector('.fg-mobile-toolbar') as HTMLElement | null,
    ].filter((element): element is HTMLElement => Boolean(element));
    if (hidden) {
      for (const element of elements) {
        if (textHiddenGlobalUi.has(element)) continue;
        textHiddenGlobalUi.set(element, element.style.visibility);
        element.style.visibility = 'hidden';
      }
      return;
    }
    for (const [element, visibility] of textHiddenGlobalUi) element.style.visibility = visibility;
    textHiddenGlobalUi.clear();
  };
  const graphDisplayName = (fileName: string) => vaultDisplayName(fileName);
  const paneRuntime = (pane: object) => pane === pane0 ? primaryRuntime : (pane as PaneState).runtime;
  const paneContainer = (pane: object) => pane === pane0 ? pixiContainer : (pane as PaneState).canvasContainer;
  const setPaneTextActive = (pane: object, active: boolean) => {
    const paneState = pane === pane0 ? pane0St as unknown as PaneState : pane as PaneState;
    if (active) clearMembershipDragPreview(paneState);
    paneState.textViewActive = active;
  };
  const setRuntimeInteractionLock = (runtime: GraphRuntime, editingPane: object, locked: boolean) => {
    const owners: object[] = [pane0, ...extraPanes];
    for (const owner of owners) {
      if (owner === editingPane || paneRuntime(owner) !== runtime) continue;
      const container = paneContainer(owner);
      const existing = textRuntimeLocks.get(container);
      if (!locked) {
        if (!existing) continue;
        existing.remove();
        textRuntimeLocks.delete(container);
        continue;
      }
      if (existing) continue;
      const overlay = document.createElement('div');
      overlay.className = 'fg-text-runtime-lock';
      overlay.textContent = '此图正在另一窗格的文字视图中编辑';
      overlay.style.cssText = 'position:absolute;inset:0;z-index:999;display:flex;align-items:center;justify-content:center;padding:20px;text-align:center;background:rgba(20,22,28,.28);color:var(--fg-text,#fff);font-size:13px;pointer-events:auto;';
      overlay.addEventListener('pointerdown', event => {
        event.stopPropagation();
        showToast('请先在文字视图中“应用并返回”，再编辑这个共享图。', 'warning', 3500);
      });
      container.appendChild(overlay);
      textRuntimeLocks.set(container, overlay);
    }
  };
  const mountTextEditor = (pane: object) => {
    if (textEditors.has(pane)) return;
    const root = paneContainer(pane);
    let editingRuntime: GraphRuntime | null = null;
    const editor = createTextViewEditor(root, {
      getGraph: () => (editingRuntime ?? paneRuntime(pane)).graph as any,
      getGraphName: () => graphDisplayName((editingRuntime ?? paneRuntime(pane)).fileName),
      pauseSimulation: () => editingRuntime?.simManager?.getSim?.()?.stop?.(),
      resumeSimulation: () => {
        if (!editingRuntime) return;
        const runtime = editingRuntime;
        runtime.endTextEdit(pane);
        textEditorRuntimes.delete(pane);
        setPaneTextActive(pane, false);
        setRuntimeInteractionLock(runtime, pane, false);
        setTextGlobalUiHidden(false);
        editingRuntime = null;
        reinitializeRuntimeViews(runtime);
        refreshStructureViews(runtime);
        draw();
      },
      applyGraph: compiled => {
        if (!editingRuntime) throw new Error('文字编辑 runtime 已失效');
        applyCompiledTextGraph(editingRuntime, compiled as GraphData);
        editingRuntime.simManager?.getSim?.()?.stop?.();
      },
      markDirty: () => {
        if (!editingRuntime) return;
        const runtime = editingRuntime;
        runtime.cancelPendingSave();
        runtime.markDirty();
        if (runtime === primaryRuntime) {
          dirtyTabs.add(activeTab);
          pane0.layout.onGraphChanged();
        }
        for (const owner of extraPanes) {
          if (owner.runtime !== runtime) continue;
          owner.dirtyTabs.add(owner.activeTab);
          owner.layout.onGraphChanged();
        }
        if (!runtime.externalConflict && !runtime.fileOperationActive) {
          runtime.saveTimeout = setTimeout(async () => {
            runtime.saveTimeout = null;
            await persistRuntimeSnapshot(runtime, collectRuntimeSettings(runtime));
          }, 300);
        }
        syncSpaceNavigation();
      },
      draw,
      toast: (message, type) => showToast(message, type, 4000),
    });
    const wrapped: TextViewEditor = {
      isActive: editor.isActive,
      enter: () => {
        if (editor.isActive()) return;
        const targetPane = pane === pane0 ? pane0 as unknown as PaneState : pane as PaneState;
        const runtime = paneRuntime(pane);
        if (runtime.graph.settings?.sourceMode === 'vault-readonly') return;
        if (targetPane.structureView && !exitStructureForPane(targetPane)) {
          showToast('当前结构内部视图无法安全退出，暂不能进入文字视图', 'warning', 4000);
          return;
        }
        if (!runtime.beginTextEdit(pane)) {
          showToast('此图已在另一窗格的文字视图中编辑。', 'warning', 4000);
          return;
        }
        try {
          if (coordinateLayoutModes.has(targetPane.activeMode)) clearPaneLayout(targetPane);
          if (pane === pane0) {
            currentAnimationCancel?.();
            currentAnimationCancel = null;
            if (activeMode === 'radial') stopStarLoop();
          } else {
            (pane as PaneState).currentAnimationCancel?.();
            (pane as PaneState).currentAnimationCancel = null;
          }
          editingRuntime = runtime;
          textEditorRuntimes.set(pane, runtime);
          setPaneTextActive(pane, true);
          setRuntimeInteractionLock(runtime, pane, true);
          setTextGlobalUiHidden(true);
          editor.enter();
        } catch (error) {
          runtime.endTextEdit(pane);
          editingRuntime = null;
          textEditorRuntimes.delete(pane);
          setPaneTextActive(pane, false);
          setRuntimeInteractionLock(runtime, pane, false);
          setTextGlobalUiHidden(false);
          showToast(`无法进入文字视图：${error instanceof Error ? error.message : String(error)}`, 'error', 5000);
        }
      },
      requestExit: editor.requestExit,
      preserveDraft: editor.preserveDraft,
      dispose: () => {
        const runtime = editingRuntime;
        editor.dispose();
        if (runtime) {
          runtime.endTextEdit(pane);
          setRuntimeInteractionLock(runtime, pane, false);
        }
        textEditorRuntimes.delete(pane);
        setPaneTextActive(pane, false);
        setTextGlobalUiHidden(false);
        editingRuntime = null;
        textEditors.delete(pane);
      },
    };
    textEditors.set(pane, wrapped);
  };
  const activeTextPane = () => [...textEditors.entries()].find(([, editor]) => editor.isActive())?.[0] ?? null;
  hasActiveTextDraft = () => activeTextPane() !== null;
  blockForTextDraft = action => {
    if (!hasActiveTextDraft()) return false;
    showToast(`文字草稿尚未应用，请先点“应用并返回”再${action}。`, 'warning', 4500);
    return true;
  };
  blockExternalForTextDraft = graphName => {
    const clean = (value: string) => value.replace(/\.json$/, '');
    const affected = [...textEditorRuntimes.values()].some(runtime => clean(runtime.fileName) === clean(graphName));
    if (!affected) return false;
    for (const runtime of textEditorRuntimes.values()) {
      if (clean(runtime.fileName) !== clean(graphName)) continue;
      runtime.markExternalConflict();
      void runtime.invalidateSaves();
    }
    showToast('检测到外部修改；为保护文字草稿，已阻止自动合并。请先应用并返回，再处理冲突。', 'warning', 7000);
    return true;
  };
  mountTextEditor(pane0);
  mountTextEditor(pane1);

  // 即时重绘与聚焦窗格共享 sim 的其他窗格，并同步视觉配置（主题等）
  _syncGraphToOtherPanes_impl = (render = true) => {
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
      s.edgeColorGradient = edgeColorGradient; s.edgeWidthByLevel = edgeWidthByLevel;
      s.cardBorderStyle = cardBorderStyle;
      s.draggingNode = draggingNode; s.wasDragged = wasDragged;
      s.search = search; s.sField = sField; s.sDisplayMode = sDisplayMode; s.sMatchMode = sMatchMode;
      s.linkMode = linkMode; s.linkSrc = linkSrc;
      s.linkCursorX = linkCursorX; s.linkCursorY = linkCursorY;
      s.defArrow = defArrow;
      s.themeAccentColor = _pane0AccentColor; s.themeAccentAltColor = _pane0AccentAltColor;
      s.treeMode = treeMode; s.categoryMode = categoryMode;
      s.fullCatMode = fullCatMode; s.activeMode = activeMode;
      s.gw = gw; s.gh = gh; s.undoManager = undoManager;
      s.structureView = pane0.structureView;
      s.structureController = pane0.structureController;
      s.structurePath = [...pane0.structurePath];
      s.structureBoundaryShapes = pane0.structureBoundaryShapes;
      s.hoverStructureId = pane0.hoverStructureId;
      if (render) {
        renderPane(pixi!, scopedPaneGraph(s), scopedPaneSimulationManager(s), nodeSprites, s);
        pane0.hoverStructureId = s.hoverStructureId;
      }
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
      if (render) renderPane(px, scopedPaneGraph(pi), scopedPaneSimulationManager(pi), extraSprites[i], pi);
    }
  };

  async function openFirstSplitPane(fileName: string) {
    splitActive = true;
    pane1Container.style.display = '';
    dualPane.layoutPanes();
    if (!extraPixis[0]) {
      const px = await createPixiApp(pane1Container);
      extraPixis[0] = pixi1 = pane1.pixi = px;
      px.viewport.on('moved', () => { scheduleVaultViewportSave(pane1); if (readyToDraw) drawGridOnly(); });
      px.viewport.on('zoomed-end', () => { scheduleVaultViewportSave(pane1); if (readyToDraw) { draw(); refreshSemanticLensForPane(pane1); } });
      px.onContextRestored = () => { simManager1.initSim(); draw(); };
      bindCanvasEvents(pane1, px.app.canvas as any, bindPaneEvents(pane1, px, simManager1, pane1NodeSprites, { v: null }));
    }
    await loadGraphDataPane1(fileName);
    dualPane.layoutPanes();
    const px = extraPixis[0];
    const { clientWidth: width, clientHeight: height } = pane1Container;
    const center = { x: px.viewport.center.x, y: px.viewport.center.y };
    px.app.renderer.resize(width, height);
    px.viewport.resize(width, height);
    px.viewport.moveCenter(center.x, center.y);
    switchFocusedPane(PANE_RIGHT);
    draw();
  }

  function addSplitPane(fileName: string) {
    if (blockForTextDraft('调整分屏')) return;
    const newC = dualPane.addPane();
    const idx = extraPanes.length;
    const np = createPaneState(paneIndexForExtra(idx), newC);
    extraPanes.push(np);
    extraContainers.push(newC);
    extraPixis.push(null);
    extraSims.push(null);
    extraSprites.push(new Map());
    attachStructureNavigation(np);
    attachLocalContextNavigation(np);
    mountTextEditor(np);
    // Keep the graph selection while the renderer initializes.
    np.openTabs = [fileName]; np.activeTab = fileName;
    const ready = createPixiApp(newC).then(async px => {
      extraPixis[idx] = px;
      extraPanes[idx].pixi = px;
      np.pixi = px;
      px.viewport.on('moved', () => { scheduleVaultViewportSave(np); if (readyToDraw) drawGridOnly(); });
      px.viewport.on('zoomed-end', () => { scheduleVaultViewportSave(np); if (readyToDraw) { draw(); refreshSemanticLensForPane(np); } });
      extraSims[idx] = createSimManager(
        np.graph, () => np.gw, () => np.gh,
        () => np.linkDist, () => np.linkStr, () => np.charge, () => np.centerS,
        () => np.collideR, () => np.groupBound,
        () => np.alphaTarget, () => np.heatingTime,
        () => getCollapsedHierarchyHiddenNodeIds(np.graph),
        () => draw()
      );
      np.simManager = extraSims[idx];
      px.onContextRestored = () => { (extraPanes[idx].simManager || extraSims[idx]).initSim(); draw(); };
      // 加载图数据（可能替换 simManager 为共享的）
      await loadGraphForPane(np, fileName);
      // 在加载之后绑定事件（确保捕获正确的 simManager）
      bindCanvasEvents(np, px.app.canvas as any, bindPaneEvents(
        np, px, extraSims[idx], extraSprites[idx], { v: null }
      ));
      switchFocusedPane(np.index);
      syncSpaceNavigation(); draw();
    });
    syncSpaceNavigation(); draw();
    return ready;
  }
  function removeSplitPane(idx: number) {
    if (blockForTextDraft('关闭窗格')) return;
    // idx = extraPanes 索引。idx=0 是 pane1（右窗格），仅隐藏不销毁。
    if (idx < 0 || idx >= extraPanes.length) return;

    if (idx === 0 && extraPanes.length === 1) {
      splitActive = false;
      paneGraphLoads.delete(pane1);
      openTabRequests.delete(pane1);
      // 仅剩 pane1 → 隐藏分屏（复用 pane1 数据）
      exitStructureForPane(extraPanes[0]);
      extraPanes[0].localContextProjection?.simManager?.getSim?.()?.stop?.();
      extraPanes[0].localContextProjection = null;
      extraPanes[0].localContext = null;
      extraPanes[0].localContextNavigator?.update(null, () => '');
      clearPaneStructureBoundaries(extraPanes[0]);
      clearPaneLayout(extraPanes[0]);
      dualPane.paneContainers[PANE_RIGHT].style.display = 'none';
      dualPane.layoutPanes();
      if (focusedPaneIndex === PANE_RIGHT) switchFocusedPane(PANE_LEFT);
      syncSpaceNavigation(); draw();
      return;
    }

    const lastIdx = extraPanes.length - 1;
    const actualIdx = idx + 1;

    // 若移除的是当前聚焦窗格，先切走
    if (focusedPaneIndex === actualIdx) {
      switchFocusedPane(idx > 0 ? idx : PANE_LEFT);
    }

    // 销毁目标窗格的布局与 pixi
    const np = extraPanes[idx];
    paneGraphLoads.delete(np);
    openTabRequests.delete(np);
    exitStructureForPane(np);
    np.localContextProjection?.simManager?.getSim?.()?.stop?.();
    np.localContextProjection = null;
    np.localContext = null;
    np.localContextNavigator?.dispose();
    np.localContextNavigator = null;
    np.disposeStructureBreadcrumb?.();
    np.disposeStructureBreadcrumb = null;
    textEditors.get(np)?.dispose();
    np.disposeCanvasEvents?.();
    np.disposeCanvasEvents = null;
    clearPaneStructureBoundaries(np, true);
    clearPaneLayout(np);
    runtimeRegistry.release(np.runtime, np);
    if (np.pixi) np.pixi.app.destroy(true);

    // 若不是最后一个，用末尾数据填补空缺（保持各数组索引一致）
    if (idx !== lastIdx) {
      extraPanes[idx] = extraPanes[lastIdx];
      extraPanes[idx].index = paneIndexForExtra(idx);
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

    // 修正关联；全局 pane 索引始终为 extra 数组索引 + 1。
    reindexExtraPanes(extraPanes);
    for (let i = idx; i < extraPanes.length; i++) {
      extraPanes[i].pixi = extraPixis[i];
      extraPanes[i].simManager = extraSims[i];
    }

    if (idx === 0 && extraPanes.length > 0) {
      pane1 = extraPanes[0];
      pixi1 = pane1.pixi;
      simManager1 = pane1.simManager;
      extraSims[0] = pane1.simManager;
      pane1NodeSprites.clear();
      for (const [key, sprite] of pane1.nodeSprites) pane1NodeSprites.set(key, sprite);
    }

    syncSpaceNavigation(); draw();
  }
  // paneContainers 跟踪（兼容现有引用）
  const paneContainers = dualPane.paneContainers;
  const focusedUndoManager = () => focusedExtraPane()?.undoManager ?? undoManager;
  const focusedGraph = () => focusedExtraPane()?.graph ?? graph;
  const focusedLinkActive = () => focusedExtraPane()?.linkMode ?? linkMode;
  const clearLinkPreview = (pane: Pick<PaneState, 'pixi'> | null | undefined) => {
    const linkGfx = pane?.pixi && (pane.pixi.edgeLayer as any)._linkGfx;
    if (!linkGfx) return;
    if (!linkGfx.destroyed) linkGfx.clear();
    else (pane!.pixi!.edgeLayer as any)._linkGfx = null;
  };
  const finishLinkMode = (pane = focusedExtraPane()) => {
    if (pane) {
      pane.linkMode = false;
      pane.linkSrc = null;
      pane.linkCursorX = 0;
      pane.linkCursorY = 0;
      clearLinkPreview(pane);
    } else {
      linkMode = false;
      linkSrc = null;
      linkCursorX = 0;
      linkCursorY = 0;
      clearLinkPreview(pane0);
    }
    syncFocusedCommands();
    draw();
  };
  const focusedLayoutMode = () => focusedExtraPane()?.activeMode ?? activeMode;
  const isFocusedCardLayout = () => ['cardgrid', 'category', 'fullcat'].includes(focusedLayoutMode());

  const runFocusedHistory = (direction: 'undo' | 'redo') => {
    const targetPane = focusedExtraPane();
    const ownerPane = targetPane ?? pane0 as unknown as PaneState;
    if (ownerPane.structureView) {
      showToast('请先退出结构内部视图，再撤销或重做整图', 'warning', 3000);
      return;
    }
    const targetGraph = targetPane?.graph ?? graph;
    const manager = targetPane?.undoManager ?? undoManager;
    if (!manager[direction](targetGraph)) return;
    if (targetPane) {
      targetPane.selNode = null;
      targetPane.selEdge = null;
      targetPane.selGroup = null;
      targetPane.simManager?.initSim();
      scheduleSaveForPane(targetPane);
    } else {
      clearEd();
      simManager.initSim();
      scheduleSave();
    }
    syncFocusedCommands();
    draw();
  };

  const toggleFocusedLinkMode = () => {
    const targetPane = focusedExtraPane();
    const wasActive = targetPane?.linkMode ?? linkMode;
    if (wasActive) {
      finishLinkMode(targetPane);
      showToast('已退出连线模式', 'info', 2500);
      return false;
    }
    const initialSource = focusedMobileSelectionState().isSingleOrdinaryNode
      ? targetPane?.selNode ?? selNode
      : null;
    const sourceNode = initialSource
      ? (targetPane?.simManager ?? simManager).getSim()?.nodes().find((node: any) => node.id === initialSource)
      : null;
    if (targetPane) {
      targetPane.linkMode = true;
      targetPane.linkSrc = initialSource;
      targetPane.linkCursorX = sourceNode?.x ?? 0;
      targetPane.linkCursorY = sourceNode?.y ?? 0;
      clearLinkPreview(targetPane);
    } else {
      linkMode = true;
      linkSrc = initialSource;
      linkCursorX = sourceNode?.x ?? 0;
      linkCursorY = sourceNode?.y ?? 0;
      clearLinkPreview(pane0);
    }
    draw();
    syncFocusedCommands();
    showToast(initialSource
      ? '选择目标节点，或点击空白处长出新想法'
      : '点击源节点，再点击目标；点击空白处可以长出新想法', 'info', 3000);
    return true;
  };

  function syncEditorShellGeometry(): DOMRect {
    const shell = editorShell.getBoundingClientRect();
    const bottom = `${Math.ceil(shell.bottom - appShell.getBoundingClientRect().top)}px`;
    if (appShell.style.getPropertyValue('--fg-editor-shell-bottom') !== bottom) {
      appShell.style.setProperty('--fg-editor-shell-bottom', bottom);
    }
    return shell;
  }

  function graphTopClearance(canvas: DOMRect): number {
    const chrome = [syncEditorShellGeometry(), floatingTop.getBoundingClientRect()];
    let bottom = canvas.top;
    for (const rect of chrome) {
      if (rect.width > 0 && rect.height > 0 && rect.right > canvas.left && rect.left < canvas.right
        && rect.bottom > canvas.top && rect.top < canvas.bottom) bottom = Math.max(bottom, rect.bottom);
    }
    return bottom - canvas.top;
  }

  function fitPaneNodes(targetPane: PaneState | any, nodes: any[], time = FIT_ALL_DURATION) {
    const targetPixi = targetPane?.pixi ?? (targetPane === pane0 ? pixi : null);
    const positionedNodes = nodes.filter(node => Number.isFinite(node.x) && Number.isFinite(node.y));
    if (!targetPixi || positionedNodes.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of positionedNodes) {
      const card = node._semanticCard;
      const halfWidth = card?.width ? card.width / 2 : (node.radius || 9);
      const halfHeight = card?.height ? card.height / 2 : (node.radius || 9);
      minX = Math.min(minX, node.x - halfWidth);
      maxX = Math.max(maxX, node.x + halfWidth);
      minY = Math.min(minY, node.y - halfHeight);
      maxY = Math.max(maxY, node.y + halfHeight);
    }
    const viewport = targetPixi.viewport;
    const canvasRect = targetPixi.app.canvas.getBoundingClientRect();
    const sidebarRect = sidebar.sidebar.getBoundingClientRect();
    const leftInset = sidebarRect.right > canvasRect.left && sidebarRect.left < canvasRect.right
      ? Math.max(14, sidebarRect.right - canvasRect.left + 14)
      : 14;
    const topInset = graphTopClearance(canvasRect) + 14;
    const mobileBar = document.querySelector<HTMLElement>('.fg-mobile-toolbar');
    const mobileBarStyle = mobileBar ? getComputedStyle(mobileBar) : null;
    const mobileBarRect = mobileBar && mobileBarStyle?.display !== 'none' && mobileBarStyle?.visibility !== 'hidden'
      ? mobileBar.getBoundingClientRect() : null;
    const rightInset = 22;
    const bottomInset = mobileBarRect
      ? Math.max(30, canvasRect.bottom - mobileBarRect.top + 18)
      : 30;
    const availableWidth = Math.max(1, viewport.screenWidth - leftInset - rightInset);
    const availableHeight = Math.max(1, viewport.screenHeight - topInset - bottomInset);
    const compact = positionedNodes.every(node => node._semanticCard?.form === 'node')
      && !targetPane.localContext && !targetPane.structureBoundaryShapes?.size;
    // Node view has no card excerpts or region captions. Its existing label
    // footprints already reserve space, so an extra card-sized margin would
    // needlessly shrink even a handful of ideas on a phone.
    const width = Math.max(1, maxX - minX + (compact ? 28 : 90));
    const height = Math.max(1, maxY - minY + (compact ? 36 : 100));
    let scale = Math.min(availableWidth / width, availableHeight / height, 1.35) * (compact ? 0.96 : 0.9);
    if (time === 0) {
      viewport.setZoom(scale, false);
      scale = viewport.scale.x;
    }
    const screenCenterX = leftInset + availableWidth / 2;
    const screenCenterY = topInset + availableHeight / 2;
    const worldCenterX = (minX + maxX) / 2 - (screenCenterX - viewport.screenWidth / 2) / scale;
    const worldCenterY = (minY + maxY) / 2 - (screenCenterY - viewport.screenHeight / 2) / scale;
    if (time === 0) viewport.moveCenter(worldCenterX, worldCenterY);
    else viewport.animate({ scale, position: { x: worldCenterX, y: worldCenterY }, time });
  }

  /** Keep the reader's zoom and framing unless newly revealed content falls
   * outside the usable canvas. In that case, pan only by the missing margin. */
  function revealPaneNodes(targetPane: PaneState | any, nodes: any[], time = 280) {
    const targetPixi = targetPane?.pixi ?? (targetPane === pane0 ? pixi : null);
    if (!targetPixi || nodes.length === 0) return;
    const viewport = targetPixi.viewport;
    const scale = Math.max(0.01, viewport.scale.x || 1);
    const canvasRect = targetPixi.app.canvas.getBoundingClientRect();
    const sidebarRect = sidebar.sidebar.getBoundingClientRect();
    const left = (sidebarRect.right > canvasRect.left && sidebarRect.left < canvasRect.right
      ? Math.max(18, sidebarRect.right - canvasRect.left + 18)
      : 18) + 22;
    const top = graphTopClearance(canvasRect) + 40;
    const right = viewport.screenWidth - 42;
    const mobileBar = document.querySelector<HTMLElement>('.fg-mobile-toolbar');
    const mobileBarStyle = mobileBar ? getComputedStyle(mobileBar) : null;
    const mobileBarRect = mobileBar && mobileBarStyle?.display !== 'none' && mobileBarStyle?.visibility !== 'hidden'
      ? mobileBar.getBoundingClientRect() : null;
    const bottom = viewport.screenHeight - (mobileBarRect
      ? Math.max(50, canvasRect.bottom - mobileBarRect.top + 20)
      : 50);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of nodes) {
      const screen = viewport.toScreen(node.x, node.y);
      const card = node._semanticCard;
      const halfWidth = (card?.width ? card.width / 2 : (node.radius || 9)) * scale;
      const halfHeight = (card?.height ? card.height / 2 : (node.radius || 9)) * scale;
      minX = Math.min(minX, screen.x - halfWidth);
      maxX = Math.max(maxX, screen.x + halfWidth);
      minY = Math.min(minY, screen.y - halfHeight);
      maxY = Math.max(maxY, screen.y + halfHeight);
    }
    let dx = 0, dy = 0;
    if (minX < left) dx = minX - left;
    else if (maxX > right) dx = maxX - right;
    if (minY < top) dy = minY - top;
    else if (maxY > bottom) dy = maxY - bottom;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    viewport.animate({
      position: { x: viewport.center.x + dx / scale, y: viewport.center.y + dy / scale },
      time,
    });
  }

  function revealEditedSelection(occluder: HTMLElement) {
    const pane = focusedPaneState();
    const targetPixi = panePixi(pane);
    if (!targetPixi || pane.centerMode || pane.draggingNode || targetPixi.viewport.pause
      || ['cardgrid', 'category', 'fullcat'].includes(pane.activeMode)) return;
    const incoming = targetPixi.viewport.plugins.get('animate');
    if (incoming && searchAnimations.has(incoming)) {
      return () => { if (targetPixi.viewport.plugins.get('animate') === incoming) targetPixi.viewport.plugins.remove('animate'); };
    }
    const ids = new Set<string>();
    if (pane.selNode) ids.add(pane.selNode);
    else if (pane.selEdge !== null) {
      const index = originalEdgeIndexForPane(pane, pane.selEdge);
      const edge = index === null ? null : paneRuntimeGraph(pane).edges[index];
      if (edge) for (const endpoint of [edge.source, edge.target]) ids.add(typeof endpoint === 'object' ? endpoint.id : endpoint);
    }
    const sprites = pane.index === PANE_LEFT ? nodeSprites : extraSprites[pane.index - 1];
    const targets: RevealRect[] = [];
    for (const id of ids) {
      const sprite = sprites?.get(id);
      if (!sprite || !sprite.container.visible || sprite.container.destroyed) continue;
      const bounds = sprite.container.getBounds().rectangle;
      targets.push({ left: bounds.x, top: bounds.y, right: bounds.x + bounds.width, bottom: bounds.y + bounds.height });
    }
    const viewport = targetPixi.viewport, canvas = targetPixi.app.canvas.getBoundingClientRect();
    if (!canvas.width || !canvas.height) return;
    const scaleX = viewport.screenWidth / canvas.width, scaleY = viewport.screenHeight / canvas.height;
    const localRect = (rect: DOMRect): RevealRect => ({
      left: (rect.left - canvas.left) * scaleX, top: (rect.top - canvas.top) * scaleY,
      right: (rect.right - canvas.left) * scaleX, bottom: (rect.bottom - canvas.top) * scaleY,
    });
    const obstacles = [occluder, sidebar.sidebar, editorShell, floatingTop, document.querySelector<HTMLElement>('.fg-mobile-toolbar')]
      .filter((element): element is HTMLElement => !!element && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden')
      .map(element => localRect(element.getBoundingClientRect()));
    const visual = window.visualViewport;
    const screen = {
      left: Math.max(16, ((visual?.offsetLeft || 0) - canvas.left) * scaleX + 16),
      top: Math.max(16, ((visual?.offsetTop || 0) - canvas.top) * scaleY + 16),
      right: Math.min(viewport.screenWidth - 16, ((visual?.offsetLeft || 0) + (visual?.width || window.innerWidth) - canvas.left) * scaleX - 16),
      bottom: Math.min(viewport.screenHeight - 16, ((visual?.offsetTop || 0) + (visual?.height || window.innerHeight) - canvas.top) * scaleY - 16),
    };
    const shift = computeRevealTranslation(targets, screen, obstacles);
    if (!shift) return;
    const center = { x: viewport.center.x - shift.x / viewport.scale.x, y: viewport.center.y - shift.y / viewport.scale.y };
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      viewport.moveCenter(center.x, center.y); draw();
    } else {
      viewport.animate({ position: center, time: 240, removeOnInterrupt: true });
      const animation = viewport.plugins.get('animate');
      return () => { if (viewport.plugins.get('animate') === animation) viewport.plugins.remove('animate'); };
    }
  }

  function fitFocusedPane() {
    const targetPane = focusedExtraPane();
    const focusedPane = targetPane ?? pane0 as unknown as PaneState;
    const controller = focusedPane.layout.current;
    const automatic = controller instanceof SemanticLayoutController;
    if (automatic && controller.flush()) draw();
    const sprites = focusedPane.index === PANE_LEFT ? nodeSprites : extraSprites[focusedPane.index - 1];
    const finalNodes = automatic
      ? new Map(scopedPaneGraph(focusedPane).nodes.map(node => [node.id, node]))
      : null;
    const nodes = (scopedPaneSimulationManager(focusedPane)?.getSim()?.nodes() ?? [])
      .filter((node: any) => !sprites || sprites.has(node.id))
      .map((node: any) => finalNodes?.get(node.id) ?? node);
    fitPaneNodes(focusedPane, nodes);
  }

  const linkBtn = document.createElement('button');
  linkBtn.className = 'fg-action fg-action-toggle';
  linkBtn.setAttribute('aria-pressed', 'false');
  linkBtn.textContent = '关系';
  linkBtn.title = '在两条内容之间建立关系';
  linkBtn.dataset.mobileDuplicate = 'true';
  linkBtn.style.cssText = `font-size:${V('--fg-font-md', '0.85em')};padding:2px 8px;cursor:pointer;`;
  linkBtn.onclick = toggleFocusedLinkMode;
  primaryRow.appendChild(linkBtn);

  // --- 移动端浮动工具栏 ---
  const mobileToolbar = createMobileToolbar({
    createNode: createNodeInFocusedPane,
    createChildNode: createChildNodeInFocusedPane,
    activateSelection: () => {
      const pane = focusedPaneState();
      const nodeId = pane.selNode;
      if (nodeId) enterStructureForPane(pane, nodeId);
    },
    raiseHeading: () => changeFocusedHeading(-1),
    lowerHeading: () => changeFocusedHeading(1),
    getSelectionState: focusedMobileSelectionState,
    undo: () => { if (!focusedInteractionBlocked('撤销')) runFocusedHistory('undo'); },
    redo: () => { if (!focusedInteractionBlocked('重做')) runFocusedHistory('redo'); },
    fitView: () => { if (!focusedInteractionBlocked('调整视图')) fitFocusedPane(); },
    toggleLinkMode: () => focusedInteractionBlocked('切换连线模式') ? focusedLinkActive() : toggleFocusedLinkMode(),
    toggleBoxSelectMode: () => {
      if (focusedInteractionBlocked('切换框选模式') || isFocusedCardLayout()) return false;
      boxSelectMode = !boxSelectMode;
      syncFocusedCommands();
      return boxSelectMode;
    },
    getLinkActive: focusedLinkActive,
    getBoxSelectActive: () => boxSelectMode,
    getBoxSelectEnabled: () => !hasActiveTextDraft() && !isFocusedCardLayout(),
    canUndo: () => !hasActiveTextDraft() && focusedUndoManager().canUndo(),
    canRedo: () => !hasActiveTextDraft() && focusedUndoManager().canRedo(),
  });
  appShell.appendChild(mobileToolbar.element);
  syncFocusedCommands = () => {
    const linkActive = focusedLinkActive();
    linkBtn.setAttribute('aria-pressed', String(linkActive));
    mobileToolbar.sync();
  };
  syncFocusedCommands();
  window.addEventListener('beforeunload', () => mobileToolbar.destroy(), { once: true });

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

  const applyTreeLayoutV3 = (runtime = primaryRuntime) => {
    const manager = simManager;
    const projection = getStructureProjection(graph);
    if (projection.nodes.length === 0) return;
    const result = computeTreeLayout(projection.nodes, projection.edges);
    const originalIndexByEdge = new Map(graph.edges.map((edge, index) => [edge, index]));
    for (const edge of graph.edges) {
      delete (edge as any)._conflict;
      delete (edge as any)._treeRoute;
    }
    for (const projectionIndex of result.treeEdgeIndices) {
      const edge = projection.edges[projectionIndex];
      if (!edge || edge._structureMembership) continue;
      const originalIndex = Number.isInteger(edge._originalIndex)
        ? edge._originalIndex
        : originalIndexByEdge.get(edge);
      if (originalIndex != null && graph.edges[originalIndex]) (graph.edges[originalIndex] as any)._treeRoute = true;
    }
    for (const projectionIndex of result.crossEdgeIndices) {
      const edge = projection.edges[projectionIndex];
      if (!edge || edge._structureMembership) continue;
      const originalIndex = Number.isInteger(edge._originalIndex)
        ? edge._originalIndex
        : originalIndexByEdge.get(edge);
      if (originalIndex != null && graph.edges[originalIndex]) (graph.edges[originalIndex] as any)._conflict = true;
    }
    for (const node of projection.nodes) {
      const target = result.positions.get(node.id);
      if (!target) continue;
      (node as any)._treeX = target.x;
      (node as any)._treeY = target.y;
      (node as any)._treeDepth = target.depth;
      (node as any)._treeParentId = result.parentByNode.get(node.id) ?? null;
    }
    const simNodes = manager.getSim()?.nodes() || [];
    manager.getSim()?.stop();
    manager.setStaticMode(true);
    currentAnimationCancel?.();
    currentAnimationCancel = startNodeAnimation({
      nodes: projection.nodes,
      simNodes,
      getTarget: node => {
        if (node.fixed) return null;
        const point = result.positions.get(node.id);
        return point ? { x: point.x, y: point.y } : null;
      },
      duration: 520,
      easing: EASING.smoothStep,
      onFrame: () => sharedState.directDraw?.(),
      onComplete: () => {
        for (const node of projection.nodes) {
          if (!node.fixed) { node.fx = null; node.fy = null; }
        }
        manager.initStatic();
        draw();
        scheduleSaveForRuntime(runtime);
      },
    });
  };

  // 导入多媒体按钮
  const importBtn = document.createElement('button');
  importBtn.type = 'button';
  importBtn.textContent = '导入附件';
  importBtn.onclick = async () => {
    const session = captureMediaImport(focusedPaneState());
    if (!session) return;
    controlsDetails.open = false;
    const ea = (window as any).electronAPI;
    if (ea?.openFile) {
      try {
        const filePath = await ea.openFile();
        if (!filePath) return;
        const name = filePath.split(/[\\/]/).pop() || 'file';
        const type = mediaTypeForFile(name);
        if (!type) { showToast('请选择图片、音视频、PDF 或文本文件', 'info'); return; }
        if (!session.valid()) { showToast('目标空间已变化，未导入附件', 'info'); return; }
        const value = type === 'md' ? await ea.readFile(filePath) : filePath;
        if (typeof value !== 'string') throw new Error(value?.error || 'Cannot read attachment');
        if (session.add([{ name, type, value }]).length) showToast('已导入附件', 'success');
        else showToast('目标空间已变化，未导入附件', 'info');
      } catch (error) {
        showToast('无法读取附件，请重新选择文件', 'error', 3500);
        console.warn('[nodespace] Attachment import:', error);
      }
      return;
    }
    const inp = document.createElement('input');
    inp.type = 'file'; inp.multiple = true; inp.accept = MEDIA_FILE_ACCEPT;
    inp.onchange = () => { if (inp.files?.length) void importBrowserFiles(session, Array.from(inp.files)); };
    inp.click();
  };

  const backupActions = document.createElement('div');
  backupActions.className = 'fg-backup-actions';
  backupActions.setAttribute('role', 'group');
  backupActions.setAttribute('aria-label', '图文件操作');
  const exportBackupButton = document.createElement('button');
  exportBackupButton.type = 'button';
  exportBackupButton.textContent = '导出备份';
  const restoreBackupButton = document.createElement('button');
  restoreBackupButton.type = 'button';
  restoreBackupButton.textContent = '从备份恢复';
  backupActions.append(importBtn, exportBackupButton, restoreBackupButton);

  exportBackupButton.onclick = async () => {
    const pane = focusedPaneState();
    const runtime = pane.index === PANE_LEFT ? primaryRuntime : pane.runtime;
    const graphId = runtime.fileName;
    if (!graphId || graphId !== (pane.index === PANE_LEFT ? activeTab : pane.activeTab)) {
      showToast('请等空间加载完再导出备份', 'info');
      return;
    }
    if (isVaultLocationTabId(graphId) || runtime.graph.settings?.sourceMode === 'vault-readonly') {
      showToast('备份只适用于可编辑的图空间。资料库原文请单独备份。', 'info', 5000);
      return;
    }
    if (blockForTextDraft('导出备份') || runtime.textEditActive) return;
    exportBackupButton.disabled = true;
    exportBackupButton.textContent = '正在整理…';
    try {
      const name = graphId.split(/[\\/]/).pop()!.replace(/\.json$/i, '');
      const settings = pane.index === PANE_LEFT ? collectSettings() : collectPaneSettings(pane);
      const { text, summary } = await createSpaceBackup({ name, graphId, graph: { ...runtime.graph, settings } });
      const fileName = backupFileStem(name) + SPACE_BACKUP_EXTENSION;
      const contents = describeBackupContents(summary);
      const messageType = summary.missingAttachments ? 'warning' : 'success';
      if (safIsAvailable()) {
        const saved = await safSaveBackup(fileName, text);
        if (saved) showToast(`已保存备份 · ${contents}`, messageType, 5500);
        return;
      }
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      try { link.click(); }
      finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30_000); }
      showToast(`已提交备份下载 · ${contents}`, messageType, 5500);
    } catch (error) {
      showToast(`无法导出备份：${error instanceof Error ? error.message : '请重试'}`, 'error', 5500);
    } finally {
      exportBackupButton.disabled = false;
      exportBackupButton.textContent = '导出备份';
    }
  };

  restoreBackupButton.onclick = () => {
    if (blockForTextDraft('恢复备份')) return;
    const destination = adapter;
    const pane = focusedPaneState();
    const originatingTab = paneLoadedTab(pane);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || restoreBackupButton.disabled) return;
      if (file.size > SPACE_BACKUP_MAX_FILE_BYTES) { showToast('备份文件太大，无法读取', 'error'); return; }
      restoreBackupButton.disabled = true;
      restoreBackupButton.textContent = '正在检查…';
      let restoredPath: string | null = null;
      try {
        const text = await file.text();
        const { name, summary } = inspectSpaceBackup(text);
        if (destination !== adapter) { showToast('存储位置已切换，请重新选择备份', 'info'); return; }
        if (!await confirmAction(`恢复「${name}」为一个新空间？原有图不会被覆盖。${describeBackupContents(summary)}。`,
          { confirm: '恢复为新空间', cancel: '取消' })) return;
        if (destination !== adapter || blockForTextDraft('恢复备份')) {
          if (destination !== adapter) showToast('存储位置已切换，请重新选择备份', 'info');
          return;
        }
        restoreBackupButton.textContent = '正在恢复…';
        const path = await findRestoreCopyPath(name, destination, isNewGraphPathReserved);
        await restoreSpaceBackup(text, {
          restoredGraphId: path,
          saveGraph: data => writeNewGraph(destination, path, data),
        });
        restoredPath = path;
        showToast(`已恢复为「${path.replace(/\.json$/i, '')}」`, 'success', 5000);
        if (destination === adapter) {
          await refreshFileTree();
          if (focusedPaneState() === pane && paneLoadedTab(pane) === originatingTab && !blockForTextDraft('打开恢复的空间')) {
            controlsDetails.open = false;
            await openTab(path);
          }
        }
      } catch (error) {
        if (restoredPath) showToast(`备份已恢复，暂时无法打开「${restoredPath.replace(/\.json$/i, '')}」；请从侧栏打开。`, 'warning', 6500);
        else showToast(`无法恢复备份：${error instanceof Error ? error.message : '请重试'}`, 'error', 6500);
      } finally {
        restoreBackupButton.disabled = false;
        restoreBackupButton.textContent = '从备份恢复';
      }
    };
    input.click();
  };


  let categoryMode = false;
  let fullCatMode = false;

  // --- 统一布局模式选择器 ---
  interface SavedLayout { name: string; nodes: { id: string; x: number; y: number; fx: number | null; fy: number | null; fixed: boolean }[]; groupModes: { id: string; mode: string }[]; }
  const readSavedLayouts = (fileName: string): SavedLayout[] => {
    try {
      const items = JSON.parse(localStorage.getItem(`fg-layouts-${fileName}`) || '[]');
      return Array.isArray(items) ? items.filter(item => item && typeof item.name === 'string'
        && Array.isArray(item.nodes) && Array.isArray(item.groupModes)) : [];
    } catch { return []; }
  };
  const writeSavedLayouts = (fileName: string, layouts: SavedLayout[]) => {
    localStorage.setItem(`fg-layouts-${fileName}`, JSON.stringify(layouts));
  };

  const layoutDetails = document.createElement('details');
  layoutDetails.className = 'fg-toolbar-panel fg-layout-panel';
  layoutDetails.addEventListener('toggle', () => {
    if (layoutDetails.open) renderModeBar();
  });
  const layoutSum = document.createElement('summary');
  layoutSum.className = toolbarSummaryClass;
  layoutSum.textContent = '视图';
  layoutDetails.appendChild(layoutSum);
  const layoutPopover = document.createElement('div');
  layoutPopover.className = 'fg-toolbar-popover fg-layout-popover';
  layoutDetails.appendChild(layoutPopover);
  const modeRow = document.createElement('div');
  modeRow.className = 'fg-mode-switcher';
  layoutPopover.appendChild(modeRow);
  const viewAlternatives = document.createElement('details');
  viewAlternatives.className = 'fg-view-alternatives';
  const viewAlternativesSummary = document.createElement('summary');
  viewAlternativesSummary.textContent = '其他观察方式';
  viewAlternatives.appendChild(viewAlternativesSummary);
  const alternateModeRow = document.createElement('div');
  alternateModeRow.className = 'fg-view-alternate-modes';
  viewAlternatives.appendChild(alternateModeRow);
  layoutPopover.appendChild(viewAlternatives);
  const formRow = document.createElement('div');
  formRow.className = 'fg-semantic-form-switcher';
  formRow.style.cssText = `display:flex;align-items:center;gap:5px;padding:8px 1px 1px;border-top:1px solid ${V('--fg-border-light','rgba(255,255,255,0.12)')};`;
  layoutPopover.appendChild(formRow);
  const viewToolsRow = document.createElement('div');
  viewToolsRow.className = 'fg-view-tools';
  layoutPopover.appendChild(viewToolsRow);
  const semanticLegendDetails = document.createElement('details');
  semanticLegendDetails.className = 'fg-semantic-legend-details';
  const semanticLegendSummary = document.createElement('summary');
  semanticLegendSummary.textContent = '关系与内容标记';
  semanticLegendDetails.appendChild(semanticLegendSummary);
  const semanticLegend = document.createElement('div');
  semanticLegend.className = 'fg-semantic-legend';
  semanticLegend.style.cssText = `display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:7px 2px 1px;font-size:${V('--fg-font-xs','0.72em')};opacity:.72;`;
  semanticLegendDetails.appendChild(semanticLegend);
  layoutPopover.appendChild(semanticLegendDetails);
  const updateSemanticModeLabel = () => {
    const pill = modeRow.querySelector<HTMLElement>('.fg-semantic-auto-pill');
    if (!pill) return;
    const pane = focusedPaneState();
    const model = scopedPaneGraph(pane);
    const lens = pane.semanticLensState;
    const adaptive = pane.activeMode === 'auto'
      && (model.settings?.semanticCardDensity ?? DEFAULT_SEMANTIC_CARD_DENSITY) === 'mixed' && lens;
    pill.textContent = `自动整理${adaptive ? ` · ${lens.expandedNodeIds.length} 张展开` : ''}`;
    const baseTitle = '自动整理 · 根据连线、层级和文字线索在本机排布';
    pill.title = adaptive
      ? `${baseTitle} · 自适应展开 ${lens.expandedNodeIds.length}/${model.nodes.length}`
      : baseTitle;
  };

  // Keep the dropdowns in their visual and keyboard order.
  primaryRow.appendChild(controlsDetails);
  primaryRow.appendChild(layoutDetails);
  primaryRow.appendChild(settingsDet);
  const splitDetails = document.createElement('details');
  splitDetails.className = 'fg-toolbar-panel fg-split-panel';
  const splitSummary = document.createElement('summary');
  splitSummary.className = toolbarSummaryClass;
  splitSummary.textContent = '分屏';
  const splitMenu = document.createElement('div');
  splitMenu.className = 'fg-toolbar-popover fg-split-menu';
  const addPaneControl = document.createElement('button');
  addPaneControl.type = 'button';
  addPaneControl.textContent = '添加窗格';
  const closePaneControl = document.createElement('button');
  closePaneControl.type = 'button';
  closePaneControl.textContent = '关闭最右窗格';
  splitMenu.append(addPaneControl, closePaneControl);
  splitDetails.append(splitSummary, splitMenu);
  primaryRow.appendChild(splitDetails);
  let splitPending = false;
  syncSplitControls = () => {
    addPaneControl.disabled = splitPending || !paneLoadedTab(focusedPaneState());
    closePaneControl.disabled = splitPending || !splitActive;
  };
  const changeSplit = async (add: boolean) => {
    if (splitPending || blockForTextDraft(add ? '添加窗格' : '关闭窗格')) return;
    const count = splitActive ? extraPanes.length : 0;
    const fileName = paneLoadedTab(focusedPaneState());
    if (add ? !fileName : count === 0) return;
    splitDetails.open = false;
    splitPending = true;
    syncSplitControls();
    try {
      if (add) {
        if (count) await addSplitPane(fileName);
        else await openFirstSplitPane(fileName);
      } else {
        const pane = extraPanes[count - 1];
        if (!await saveRuntimeNow(pane.runtime, collectPaneSettings(pane))) return;
        removeSplitPane(count - 1);
      }
      persistTabs();
    } catch (error) {
      if (add && extraPanes.length > count) removeSplitPane(extraPanes.length - 1);
      reportWorkbenchActionError(error);
    } finally {
      splitPending = false;
      syncSpaceNavigation();
    }
  };
  addPaneControl.onclick = () => { void changeSplit(true); };
  closePaneControl.onclick = () => { void changeSplit(false); };
  for (const control of primaryRow.querySelectorAll(':scope > .fg-action')) {
    control.classList.add('fg-shell-control');
  }
  setupToolbarDropdowns([
    { details: controlsDetails, summary: controlsSum, popover: controlsDiv, align: 'start' },
    { details: layoutDetails, summary: layoutSum, popover: layoutPopover, align: 'end' },
    { details: settingsDet, summary: settingsSum, popover: setDiv, align: 'end' },
    { details: splitDetails, summary: splitSummary, popover: splitMenu, align: 'end' },
  ]);
  const toolbarDropdownDetails = [controlsDetails, layoutDetails, settingsDet, splitDetails];
  const syncToolbarStacking = () => {
    editorShell.style.zIndex = String(
      toolbarDropdownDetails.some(details => details.open) ? Z_TOOLBAR_POPOVER : Z_FLOATING_UI,
    );
  };
  for (const details of toolbarDropdownDetails) details.addEventListener('toggle', syncToolbarStacking);

  const applySemanticPositions = (
    targetPane: PaneState | any,
    animate = true,
    fitAfter = false,
    animationDuration = 260,
  ) => {
    const targetGraph = scopedPaneGraph(targetPane as PaneState);
    const targetSimManager = scopedPaneSimulationManager(targetPane as PaneState);
    if (!targetGraph || !targetSimManager) return;
    const density = targetGraph.settings?.semanticCardDensity ?? DEFAULT_SEMANTIC_CARD_DENSITY;
    const localContext = targetPane.localContext as LocalContextState | null | undefined;
    const localContextForms = { ...(targetGraph.settings?.semanticCardForms || {}) };
    for (const member of localContext?.members || []) localContextForms[member.id] = 'card';
    const viewport = targetPane.pixi?.viewport;
    const previousScene = (targetGraph as any)._semanticScene;
    const lens = computeSemanticLens({
      nodes: targetGraph.nodes,
      edges: targetGraph.edges,
      echoes: Array.isArray(previousScene?.echoes) ? previousScene.echoes : [],
      density: localContext && density === 'nodes' ? 'mixed' : density,
      zoom: viewport?.scale?.x ?? 1,
      viewportWidth: targetPane.pixi?.app?.screen?.width ?? targetPane.gw ?? 960,
      viewportHeight: targetPane.pixi?.app?.screen?.height ?? targetPane.gh ?? 640,
      focusNodeId: localContext?.currentId ?? targetPane.selNode ?? null,
      previous: targetPane.semanticLensState,
      manualForms: localContext ? localContextForms : targetGraph.settings?.semanticCardForms,
    });
    const collapsedNodeIds = lens.collapsedNodeIds;
    targetPane.semanticLensState = {
      band: lens.band,
      budget: lens.budget,
      edgeLabelBudget: lens.edgeLabelBudget,
      regionLabelBudget: lens.regionLabelBudget,
      echoBudget: lens.echoBudget,
      focusNodeId: lens.focusNodeId,
      expandedNodeIds: lens.expandedNodeIds,
    };
    const ideal = computeSemanticLayout(targetGraph, { collapsedNodeIds });
    const stabilized = stabilizeSemanticLayout(
      targetGraph,
      ideal,
      targetGraph.settings?.semanticLayoutMemory,
    );
    const result = stabilized.result;
    targetGraph.settings = {
      ...(targetGraph.settings ?? DEFAULT_SETTINGS),
      semanticLayoutMemory: stabilized.memory,
    };
    const regionByNode = new Map<string, number>();
    for (const region of result.regions) {
      for (const id of region.nodeIds) regionByNode.set(id, region.colorIndex);
    }
    (targetGraph as any)._semanticScene = {
      regions: result.regions,
      semanticEdgeCount: result.semanticEdgeCount,
      echoes: result.echoes,
      changedNodeCount: stabilized.changedNodeIds.length,
      newNodeCount: stabilized.newNodeIds.length,
      movedNodeCount: stabilized.movedNodeIds.length,
      globalReframe: stabilized.globalReframe,
      lens: targetPane.semanticLensState,
    };
    if (targetPane === focusedPaneState()) updateSemanticModeLabel();

    targetPane.currentAnimationCancel?.();
    const previousNodes = targetSimManager.getSim()?.nodes?.() || targetGraph.nodes;
    const sourcePositions = new Map<string, { x: number; y: number }>();
    for (const node of previousNodes) {
      if (Number.isFinite(node.x) && Number.isFinite(node.y)) {
        sourcePositions.set(node.id, { x: node.x, y: node.y });
      }
    }

    // Graph coordinates are a cache of the derived result. The visible transition
    // runs on simulation nodes, so a save during animation still writes final data.
    for (const node of targetGraph.nodes) {
      const target = result.positions.get(node.id);
      if (!target) continue;
      node.x = target.x;
      node.y = target.y;
      node._semanticCard = { ...target.card, regionColorIndex: regionByNode.get(node.id) ?? -1 };
      if (node.fixed) { node.fx = target.x; node.fy = target.y; }
      else { node.fx = null; node.fy = null; }
    }

    // Auto mode owns no d3-force runtime. Position-only prototype views are
    // allocated during the short transition, then released on settle.
    targetSimManager.initStatic(animate ? sourcePositions : undefined);
    const simulation = targetSimManager.getSim();
    const simNodes = simulation?.nodes?.() || [];

    const settle = () => {
      for (const simNode of simNodes) {
        const target = result.positions.get(simNode.id);
        const graphNode = targetGraph.nodes.find(node => node.id === simNode.id);
        if (!target || !graphNode) continue;
        simNode.x = target.x; simNode.y = target.y;
        simNode.fx = target.x; simNode.fy = target.y;
        simNode.vx = 0; simNode.vy = 0;
        simNode.fixed = !!graphNode.fixed;
        if (simNode._isNew === false) graphNode._isNew = false;
      }
      // Replace transition views with direct references to graph nodes. This is
      // the steady state: one node array, no force/link structures or timers.
      targetSimManager.initStatic();
      const controller = targetPane.layout.current;
      if (controller instanceof SemanticLayoutController) controller.markApplied();
      draw();
      // Camera fitting is an explicit interaction. A synchronous/background
      // layout pass is not permission to recenter the viewport.
      if (fitAfter) {
        const load = paneGraphLoads.get(targetPane);
        const fittedNodes = [...result.positions.values()].map(position => ({
          x: position.x,
          y: position.y,
          _semanticCard: position.card,
        }));
        requestAnimationFrame(() => {
          if (paneGraphLoads.get(targetPane) === load && scopedPaneGraph(targetPane) === targetGraph) {
            fitPaneNodes(targetPane, fittedNodes);
          }
        });
      }
    };

    if (!animate || targetGraph.nodes.length === 0) {
      settle();
      return;
    }
    const animationNodes = targetGraph.nodes.map(node => ({ id: node.id }));
    targetPane.currentAnimationCancel = startNodeAnimation({
      nodes: animationNodes,
      simNodes,
      getTarget: node => result.positions.get(node.id) ?? null,
      duration: animationDuration,
      easing: EASING.smoothStep,
      onFrame: () => { if (sharedState.directDraw) sharedState.directDraw(); else draw(); },
      onComplete: settle,
    });
  };

  activateSemanticLayoutForPane = (targetPane, animate = true) => {
    let controller = targetPane.layout.current;
    if (!(controller instanceof SemanticLayoutController)) {
      controller = new SemanticLayoutController(
        () => scopedPaneGraph(targetPane as PaneState),
        () => applySemanticPositions(targetPane, true),
      );
      targetPane.layout.set(controller);
    }
    applySemanticPositions(targetPane, animate);
  };

  const LOCAL_CONTEXT_OPTIONS = { maxPerStep: 6, maxMembers: 24, maxDepth: 6 } as const;
  const localContextEchoes = (pane: PaneState): readonly any[] => {
    const scene = (scopedPaneGraph(pane) as any)._semanticScene
      ?? (paneRuntimeGraph(pane) as any)._semanticScene;
    return Array.isArray(scene?.echoes) ? scene.echoes : [];
  };
  const localContextNodeLabel = (pane: PaneState, id: string): string => {
    const contextGraph = scopedPaneGraph(pane);
    const node = contextGraph.nodes.find(candidate => String(candidate.id) === id);
    if (!node) return '已离开的节点';
    return resolveNodeDisplayLabel(node, new Map(contextGraph.nodes.map(candidate => [String(candidate.id), candidate])));
  };
  const installCrossSpaceProjection = (pane: PaneState, branches: readonly CrossSpaceBranch[]): void => {
    pane.localContextProjection?.simManager?.getSim?.()?.stop?.();
    if (branches.length === 0) {
      pane.localContextProjection = null;
      return;
    }
    const projection = composeCrossSpaceProjection(paneRuntimeGraph(pane), branches);
    const view = { ...projection, simManager: null as any };
    view.simManager = createSimManager(
      view.graph,
      () => pane.gw, () => pane.gh,
      () => pane.linkDist, () => pane.linkStr, () => pane.charge, () => pane.centerS,
      () => pane.collideR, () => pane.groupBound,
      () => pane.alphaTarget, () => pane.heatingTime,
      () => getCollapsedHierarchyHiddenNodeIds(view.graph),
      () => draw(),
    );
    view.simManager.setStaticMode(true);
    view.simManager.initStatic();
    pane.localContextProjection = view;
  };
  const pruneCrossSpaceProjection = (pane: PaneState, next: LocalContextState | null): boolean => {
    const projection = pane.localContextProjection;
    if (!projection) return false;
    const retained = next ? retainCrossSpaceBranches(projection.branches, next.path) : [];
    if (retained.length === projection.branches.length) return false;
    installCrossSpaceProjection(pane, retained);
    return true;
  };
  const applyLocalContextState = (pane: PaneState, next: LocalContextState | null, animate = true): void => {
    const projectionChanged = pruneCrossSpaceProjection(pane, next);
    const resolved = projectionChanged && next
      ? buildLocalContext(scopedPaneGraph(pane), localContextEchoes(pane), next.path, LOCAL_CONTEXT_OPTIONS)
      : next;
    pane.localContext = resolved;
    if (resolved) {
      pane.selNode = resolved.currentId;
      pane.selEdge = null;
      pane.selGroup = null;
    }
    syncLocalContextNavigator(pane);
    if (pane.activeMode === 'auto' && !pane.structureView) activateSemanticLayoutForPane(pane, animate);
    else draw();
  };
  syncLocalContextNavigator = pane => {
    pane.localContextNavigator?.update(pane.localContext, id => localContextNodeLabel(pane, id));
  };
  openLocalContextForPane = (pane, nodeId) => {
    if (pane.structureView || pane.activeMode !== 'auto') {
      showToast('局部空间目前只在自动布局的整图中展开', 'info', 3000);
      return;
    }
    const targetGraph = scopedPaneGraph(pane);
    if (!targetGraph.nodes.some(node => String(node.id) === String(nodeId))) return;
    const echoes = localContextEchoes(pane);
    const previous = pane.localContext;
    const next = previous
      ? extendLocalContext(targetGraph, echoes, previous, nodeId, LOCAL_CONTEXT_OPTIONS)
      : startLocalContext(targetGraph, echoes, nodeId, LOCAL_CONTEXT_OPTIONS);
    if (!next) return;
    if (previous && previous.path.length >= LOCAL_CONTEXT_OPTIONS.maxDepth && next.path.join('\u0000') === previous.path.join('\u0000')
      && next.currentId !== String(nodeId)) {
      showToast(`已经展开到 ${LOCAL_CONTEXT_OPTIONS.maxDepth} 层；可以先退回一层，再选择另一条脉络`, 'info', 3200);
      return;
    }
    const first = !previous || next.rootId !== previous.rootId;
    applyLocalContextState(pane, next, true);
    if (first) showToast('已展开局部上下文 · 双击周围卡片可以继续深入', 'info', 3200);
  };
  backLocalContextForPane = pane => {
    const current = pane.localContext;
    if (!current) return;
    applyLocalContextState(pane, backLocalContext(scopedPaneGraph(pane), localContextEchoes(pane), current, LOCAL_CONTEXT_OPTIONS), true);
  };
  closeLocalContextForPane = pane => applyLocalContextState(pane, null, true);
  jumpLocalContextForPane = (pane, pathIndex) => {
    const current = pane.localContext;
    if (!current || pathIndex < 0 || pathIndex >= current.path.length) return;
    const next = buildLocalContext(
      scopedPaneGraph(pane),
      localContextEchoes(pane),
      current.path.slice(0, pathIndex + 1),
      LOCAL_CONTEXT_OPTIONS,
    );
    applyLocalContextState(pane, next, true);
  };

  reloadVaultResourceViews = async (tabId: string) => {
    const runtime = runtimeRegistry.get(tabId);
    if (!runtime) return;
    const retainedPrimaryMode = runtime === primaryRuntime ? activeMode : null;
    const retainedPaneModes = new Map<PaneState, string>();
    for (const owner of extraPanes) {
      if (owner.runtime === runtime) retainedPaneModes.set(owner, owner.activeMode);
    }
    const updated = await readVaultGraphData(tabId);
    if (!updated) {
      showToast(`原文已移动或删除：${vaultDisplayName(tabId)}`, 'warning', 4500);
      return;
    }
    runtime.cancelPendingSave();
    runtime.graph.nodes.splice(0, runtime.graph.nodes.length, ...updated.nodes);
    runtime.graph.edges.splice(0, runtime.graph.edges.length, ...updated.edges);
    runtime.graph.groups.splice(0, runtime.graph.groups.length, ...(updated.groups || []));
    runtime.graph.settings = { ...DEFAULT_SETTINGS, ...(updated.settings || {}) };
    if (runtime === primaryRuntime) {
      applyPrimaryPaneSettings(runtime.graph.settings);
      activeMode = retainedPrimaryMode ?? activeMode;
      layoutMode = activeMode;
      if (activeMode === 'auto') {
        simManager.setStaticMode(true);
        activateSemanticLayoutForPane(pane0, false);
      } else if (activeMode === 'force') {
        simManager.setStaticMode(false);
        simManager.initSim();
      } else if (activeMode === 'tree') {
        applyTreeLayoutV3();
      } else if (activeMode === 'radial') {
        const projection = getStructureProjection(graph);
        computeRadialLayout(projection.nodes, projection.edges);
        simManager.setStaticMode(true);
        simManager.initStatic();
        startStarLoop();
      } else if (coordinateLayoutModes.has(activeMode)) {
        pane0.layout.onGraphChanged();
      } else {
        simManager.setStaticMode(true);
        simManager.initStatic();
      }
    }
    for (const owner of extraPanes) {
      if (owner.runtime !== runtime) continue;
      const retainedMode = retainedPaneModes.get(owner) ?? owner.activeMode;
      applyPaneSettings(owner, runtime.graph.settings);
      owner.activeMode = retainedMode;
      if (retainedMode === 'auto') {
        owner.simManager?.setStaticMode(true);
        activateSemanticLayoutForPane(owner, false);
      } else if (retainedMode === 'force') {
        owner.simManager?.setStaticMode(false);
        owner.simManager?.initSim();
      } else if (retainedMode === 'radial') {
        const projection = getStructureProjection(owner.graph);
        computeRadialLayout(projection.nodes, projection.edges);
        owner.simManager?.setStaticMode(true);
        owner.simManager?.initStatic();
      } else if (coordinateLayoutModes.has(retainedMode)) {
        owner.layout.onGraphChanged();
      } else {
        owner.simManager?.setStaticMode(true);
        owner.simManager?.initStatic();
      }
    }
    clearAllMedia();
    draw();
    if (!isVaultSpaceTabId(tabId)) showToast(`已同步原文：${vaultDisplayName(tabId)}`, 'info', 1800);
  };

  const semanticLensTimers = new WeakMap<object, ReturnType<typeof setTimeout>>();
  refreshSemanticLensForPane = (targetPane) => {
    const targetGraph = targetPane ? scopedPaneGraph(targetPane as PaneState) : undefined;
    if (!targetGraph || targetPane.activeMode !== 'auto'
      || (targetGraph.settings?.semanticCardDensity ?? DEFAULT_SEMANTIC_CARD_DENSITY) !== 'mixed') return;
    const previous = targetPane.semanticLensState;
    const nextBand = resolveSemanticLensBand(targetPane.pixi?.viewport?.scale?.x ?? 1, previous?.band);
    const focusNodeId = targetPane.selNode ?? null;
    if (previous?.band === nextBand && previous.focusNodeId === focusNodeId) return;
    const priorTimer = semanticLensTimers.get(targetPane);
    if (priorTimer) clearTimeout(priorTimer);
    const focusChanged = previous?.focusNodeId !== focusNodeId;
    if (focusChanged) {
      semanticLensTimers.delete(targetPane);
      applySemanticPositions(targetPane, true, false, 120);
      return;
    }
    const load = paneGraphLoads.get(targetPane);
    const timer = setTimeout(() => {
      semanticLensTimers.delete(targetPane);
      if (paneGraphLoads.get(targetPane) === load && targetPane.activeMode === 'auto' && scopedPaneGraph(targetPane as PaneState) === targetGraph) {
        applySemanticPositions(targetPane, true, false, 160);
      }
    }, 24);
    semanticLensTimers.set(targetPane, timer);
  };

  // --- 格点吸附 ---
  const snapPosToGrid = (x: number, y: number, spacing: number): [number, number] => {
    const step = spacing || 30;
    return [Math.round(x / step) * step, Math.round(y / step) * step];
  };

  const applyGridSnapLayout = (pane: PaneState) => {
    const destination = paneRuntimeGraph(pane);
    if (scopedPaneGraph(pane) !== destination || destination.settings?.sourceMode === 'vault-readonly') return;
    const nodes: GraphData['nodes'] = scopedPaneSimulationManager(pane)?.getSim()?.nodes() ?? [];
    const nodesById = new Map(destination.nodes.map(node => [node.id, node]));
    const step = pane.gridSp || 30;
    const occupied = new Set<string>();
    const cellKey = (x: number, y: number) => `${x},${y}`;
    const held = (node: GraphData['nodes'][number]) => node.fixed || nodesById.get(node.id)?.fixed || node.id === pane.draggingNode?.id;
    for (const node of nodes) {
      if (held(node) && Number.isFinite(node.x) && Number.isFinite(node.y)) {
        occupied.add(cellKey(...snapPosToGrid(node.x, node.y, step)));
      }
    }
    const findFree = (sx: number, sy: number): [number, number] => {
      for (let radius = 0; radius <= 8; radius++) {
        for (let dx = -radius; dx <= radius; dx++) {
          for (let dy = -radius; dy <= radius; dy++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
            const x = sx + dx * step, y = sy + dy * step;
            if (!occupied.has(cellKey(x, y))) return [x, y];
          }
        }
      }
      return [sx, sy];
    };
    for (const node of nodes) {
      const saved = nodesById.get(node.id);
      if (!saved || held(node) || !Number.isFinite(node.x) || !Number.isFinite(node.y)) continue;
      const [x, y] = findFree(...snapPosToGrid(node.x, node.y, step));
      occupied.add(cellKey(x, y));
      node.x = saved.x = x;
      node.y = saved.y = y;
    }
  };

  const cycleGridSnapForPane = (pane: PaneState) => {
    const enableAll = !pane.gridSnapEnabled && pane.partialGridSnap;
    const enablePartial = !pane.gridSnapEnabled && !pane.partialGridSnap;
    const runtime = paneRuntime(pane);
    for (const owner of allPaneOwners()) {
      if (paneRuntime(owner) !== runtime) continue;
      owner.gridSnapEnabled = enableAll;
      owner.partialGridSnap = enablePartial;
    }
    if (enableAll) applyGridSnapLayout(pane);
    scheduleSaveForRuntime(runtime, pane.index === PANE_LEFT ? collectSettings() : collectPaneSettings(pane));
    draw();
  };

  const applyLayoutMode = (mode: string, persistSelection = true, paneIndex = focusedPaneIndex) => withFocusedPane(() => {
    const extraPane = paneIndex === PANE_LEFT ? null : extraPanes[paneIndex - 1];
    const targetRuntime = extraPane?.runtime ?? primaryRuntime;
    const layoutPane = extraPane ?? pane0;
    if (coordinateLayoutModes.has(mode) && targetRuntime.ownerCount > 1) {
      showToast('同一文件正在多个窗格中打开，当前布局需要独占文档', 'warning', 4000);
      return;
    }
    currentAnimationCancel?.(); // 取消正在进行的动画
    if (mode !== 'auto' && layoutPane?.localContext) closeLocalContextForPane(layoutPane as PaneState);
    // 自动和力导向都尊重用户固定状态；进入展示布局前暂存。
    if ((activeMode === 'auto' || activeMode === 'force') && activeMode !== mode) saveFixedState();
    // 清理当前模式
    if (activeMode === 'auto') layoutPane?.layout.clear();
    if (activeMode === 'tree') {
      for (const node of graph.nodes) if (!node.fixed) { node.fx = null; node.fy = null; }
      for (const edge of graph.edges) { delete (edge as any)._conflict; delete (edge as any)._treeRoute; }
    }
    if (activeMode === 'category' || activeMode === 'fullcat') clearTransientCategoryVisuals(graph);
    if (activeMode === 'radial') {
      if (paneIndex === PANE_LEFT) stopStarLoop();
      for (const n of graph.nodes) { delete (n as any)._starId; delete (n as any)._starRoot; delete (n as any)._radialX; delete (n as any)._radialY; delete (n as any)._starRadius; delete (n as any)._starAngle; }
    }
    if (activeMode === 'cardgrid' || activeMode === 'category' || activeMode === 'fullcat') {
      clearPaneLayout(layoutPane);
    }
    layoutPane.activeMode = activeMode = mode;
    const usesStaticSimulation = mode === 'auto' || coordinateLayoutModes.has(mode);
    layoutPane?.simManager?.setStaticMode(usesStaticSimulation);
    // Card controllers own their small, bounded simulations. Keep the legacy
    // graph simulation as a direct-reference static facade so later settings
    // refreshes cannot restart a second, invisible coordinate source.
    if (coordinateLayoutModes.has(mode)) layoutPane?.simManager?.initStatic();
    if (paneIndex === focusedPaneIndex) {
      if (['cardgrid', 'category', 'fullcat'].includes(mode)) boxSelectMode = false;
      syncFocusedCommands();
      renderModeBar();
    }
    // Persist the selection itself for every mode. Derived coordinates may be
    // saved again when their animation settles, but the mode must survive an
    // immediate file refresh or app restart.
    if (persistSelection) {
      const settings = extraPane ? collectPaneSettings(extraPane) : collectSettings();
      scheduleSaveForRuntime(targetRuntime, settings);
    }
    const getCardLayoutBounds = (targetPixi: any) => () => {
      const canvasRect = targetPixi.app.canvas.getBoundingClientRect();
      const topRect = floatingTop.getBoundingClientRect();
      const x = Math.max(4, topRect.left - canvasRect.left);
      const y = Math.max(4, topRect.bottom - canvasRect.top + 4);
      // Appearance settings are a floating inspector, so they should not shrink
      // the graph or the card-grid layout area.
      const bottom = 4;
      return {
        x,
        y,
        w: Math.max(1, canvasRect.width - x - 4),
        h: Math.max(1, canvasRect.height - y - bottom),
      };
    };
    const clearCardBackgroundSelection = () => {
      selNode = null;
      selEdge = null;
      selGroup = null;
      clearEd();
    };
    const activateCardMode = (cardSource: 'components' | 'groups', allGroups = false) => {
      const simParams = {
        getLinkDist: () => linkDist,
        getLinkStr: () => linkStr,
        getCharge: () => charge,
        getCenterS: () => centerS,
        getCollideR: () => collideR,
      };
      const modeId = cardSource === 'components' ? 'cardgrid' : allGroups ? 'fullcat' : 'category';
      const controller = new CardGridController(modeId);
      const targetPane = layoutPane;
      const focusPixi = targetPane?.pixi ?? null;
      if (!targetPane || !focusPixi) return;
      const targetRuntime = extraPane?.runtime ?? primaryRuntime;
      const stillOwnsGraph = () => (extraPane?.runtime ?? primaryRuntime) === targetRuntime;
      controller.drawFn = () => { if (sharedState.directDraw) sharedState.directDraw(); else draw(); };
      controller.saveFn = () => {
        if (!stillOwnsGraph()) return;
        if (extraPane) scheduleSaveForPane(extraPane);
        else scheduleSaveForRuntime(targetRuntime, collectSettings());
      };
      controller.directSaveFn = controller.saveFn;
      targetPane.layout.clear();
      controller.activate(graph, focusPixi, simManager, simParams, {
        borderStyle: cardBorderStyle,
        gap: 4,
        cardSource,
        allGroups,
        onBackgroundTap: clearCardBackgroundSelection,
        getLayoutBounds: getCardLayoutBounds(focusPixi),
      });
      targetPane.layout.set(controller);
      controller.layoutAndAnimate();
    };
    if (mode === 'auto') {
      restoreFixedState();
      if (layoutPane) activateSemanticLayoutForPane(layoutPane, true);
    } else if (mode === 'force') {
      // 保存当前位置作为动画起点
      for (const n of graph.nodes) { (n as any)._sx = n.x; (n as any)._sy = n.y; }
      const previousPins = new Map(savedFixedNodes.map(node => [node.id, node]));
      for (const node of graph.nodes) {
        const previous = previousPins.get(node.id);
        if (previous) {
          node.fixed = previous.fixed;
          if (previous.fixed) { node.x = previous.x; node.y = previous.y; }
        }
        node.fx = node.fixed ? node.x : null;
        node.fy = node.fixed ? node.y : null;
        delete node._pieColors; delete node._treeX; delete node._treeY;
        delete node._starId; delete node._starRoot; delete node._radialX; delete node._radialY;
        delete node._starRadius; delete node._starAngle;
      }
      for (const e of graph.edges) { delete (e as any)._conflict; }
      (graph as any)._categoryBoxes = null;
      // 持久化并启动模拟（抑制首帧绘制，防止闪烁）
      _skipDraw = true;
      const forceGraph = graph;
      const forceManager = simManager;
      const forceGroups = savedGroupModes;
      savedFixedNodes = [];
      savedGroupModes = [];
      forceManager.initSim();
      const forceSimulation = forceManager.getSim();
      currentAnimationCancel = startNodeAnimation({
        nodes: forceGraph.nodes,
        simNodes: forceSimulation?.nodes() || [],
        getSource: (n) => ({ x: (n as any)._sx, y: (n as any)._sy }),
        getTarget: (n) => {
          if (n.fixed || forceManager.getSim() !== forceSimulation) return null;
          const sim = forceSimulation?.nodes() || [];
          const sn = sim.find((s: any) => s.id === n.id);
          return sn ? { x: sn.x, y: sn.y } : null;
        },
        duration: LAYOUT_ANIM_DURATION, // 900ms，匹配布局切换
        easing: EASING.smoothStep, // 比 easeInOutCubic 更柔和
        onFrame: () => { _skipDraw = false; draw(); },
        onComplete: () => {
          if (forceManager.getSim() !== forceSimulation) return;
          for (const node of forceGraph.nodes) if (!node.fixed) { node.fx = null; node.fy = null; }
          for (const node of forceSimulation?.nodes() ?? []) if (!node.fixed) { node.fx = null; node.fy = null; }
          // 恢复集合显示状态
          for (const gs of forceGroups) {
            const g = forceGraph.groups.find(g => g.id === gs.id);
            if (g) { g.displayMode = gs.mode as any; g.nodeColorMode = gs.nodeColorMode as any; g.nodeColor = gs.nodeColor; }
          }
          draw();
        },
      });
    } else if (mode === 'tree') {
      applyTreeLayoutV3(targetRuntime);
    } else if (mode === 'radial') {
      const radialGraph = graph;
      const radialManager = simManager;
      for (const n of graph.nodes) { (n as any)._sx = n.x; (n as any)._sy = n.y; }
      const radialProjection = getStructureProjection(graph);
      computeRadialLayout(radialProjection.nodes, radialProjection.edges);
      for (const n of radialProjection.nodes) { (n as any)._tx = n.x; (n as any)._ty = n.y; }
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
          for (const n of radialGraph.nodes) { delete (n as any)._sx; delete (n as any)._sy; delete (n as any)._tx; delete (n as any)._ty; n.fx = null; n.fy = null; }
          // 动画期间节点或结构可能已变化 → 用当前投影重算，保证数据一致
          const currentProjection = getStructureProjection(radialGraph);
          computeRadialLayout(currentProjection.nodes, currentProjection.edges);
          radialManager.initSim();
          const s2 = radialManager.getSim();
          if (s2) (s2 as any)._animating = false;
          radialManager.setStaticMode(true);
          radialManager.initStatic();
          if (paneIndex === PANE_LEFT) startStarLoop();
          draw();
        },
      });
    } else if (mode === 'cardgrid') {
      activateCardMode('components');
    } else if (mode === 'category') {
      activateCardMode('groups');
    } else if (mode === 'fullcat') {
      activateCardMode('groups', true);
    } else {
      // 自定义布局
      const l = readSavedLayouts(targetRuntime.fileName).find(x => x.name === mode);
      if (l) {
        for (const n of graph.nodes) { n.fixed = false; n.fx = null; n.fy = null; }
        for (const sn of l.nodes) { const n = graph.nodes.find(n => n.id === sn.id); if (n) { n.x = sn.x; n.y = sn.y; n.fx = sn.fx; n.fy = sn.fy; n.fixed = sn.fixed; } }
        for (const gm of l.groupModes) { const g = graph.groups.find(g => g.id === gm.id); if (g) g.displayMode = gm.mode as any; }
        simManager.initSim(); draw();
      }
    }
  }, paneIndex);

  let previousViewPane: PaneState | undefined;
  let previousViewMode = '';
  const renderModeBar = () => {
    const pane = focusedPaneState();
    const runtime = paneRuntime(pane);
    const fileName = runtime.fileName;
    const destination = adapter;
    const load = paneGraphLoads.get(pane);
    const isCurrent = () => adapter === destination && paneRuntime(pane) === runtime
      && runtime.fileName === fileName && paneGraphLoads.get(pane) === load;
    const mode = pane.activeMode;
    const model = runtime.graph;
    const layouts = readSavedLayouts(fileName);
    const focusedControl = document.activeElement instanceof HTMLButtonElement && layoutPopover.contains(document.activeElement)
      ? document.activeElement.dataset.viewAction : undefined;
    modeRow.innerHTML = '';
    alternateModeRow.innerHTML = '';
    formRow.innerHTML = '';
    viewToolsRow.innerHTML = '';
    semanticLegend.innerHTML = '';
    const modeNames: Record<string, string> = {
      auto: '自动整理',
      force: '自由布局',
      tree: '树形观察',
      radial: '星型观察',
      category: '分组观察',
      fullcat: '完整分组观察',
      cardgrid: '卡片平铺',
    };
    const activeViewName = modeNames[mode] || mode || '自动整理';
    viewAlternativesSummary.textContent = mode === 'auto'
      ? '其他观察方式'
      : `其他观察方式 · ${activeViewName}`;
    if (previousViewPane !== pane || previousViewMode !== mode) viewAlternatives.open = mode !== 'auto';
    previousViewPane = pane;
    previousViewMode = mode;
    const viewButton = (label: string, action: () => void, pressed?: boolean, key = label) => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'fg-mode-pill' + (pressed ? ' is-active' : '');
      pill.textContent = label;
      pill.dataset.viewAction = key;
      if (pressed !== undefined) pill.setAttribute('aria-pressed', String(pressed));
      pill.onclick = () => {
        if (!isCurrent() || focusedInteractionBlocked('调整视图')) return;
        action();
      };
      return pill;
    };
    const layoutButton = (label: string, option: string) => viewButton(label, () => {
      if (pane.activeMode !== option) applyLayoutMode(option, true, pane.index);
    }, mode === option, `layout:${option}`);
    const automaticPill = layoutButton('自动整理', 'auto');
    automaticPill.classList.add('fg-semantic-auto-pill');
    modeRow.appendChild(automaticPill);
    updateSemanticModeLabel();
    alternateModeRow.append(
      layoutButton('自由（力导向）', 'force'),
      layoutButton('树形', 'tree'),
      layoutButton('星型', 'radial'),
      layoutButton('分组', 'category'),
      layoutButton('完整分组', 'fullcat'),
      layoutButton('卡片平铺', 'cardgrid'),
    );
    if (mode === 'radial' && pane.index === PANE_LEFT) {
      alternateModeRow.appendChild(viewButton('星型旋转', () => {
        starRotateMode = !starRotateMode;
        scheduleSaveForRuntime(runtime, collectSettings());
        _starLastFrameTime = performance.now();
        renderModeBar();
      }, starRotateMode));
    }
    const fitAction = viewButton('全览', () => {
      layoutDetails.open = false;
      fitFocusedPane();
    });
    fitAction.title = '显示所有节点 (F)';
    fitAction.dataset.mobileDuplicate = 'true';
    viewToolsRow.appendChild(fitAction);
    if (model.settings?.sourceMode !== 'vault-readonly') {
      const textViewPill = viewButton('文字编辑', async () => {
        if (markdownSourceEditor?.isOpen()) {
          if (!await markdownSourceEditor.requestClose() || !isCurrent() || focusedPaneState() !== pane
            || focusedInteractionBlocked('打开文字编辑')) return;
        }
        mountTextEditor(pane);
        const editor = textEditors.get(pane);
        editor?.enter();
        if (editor?.isActive()) layoutDetails.open = false;
      });
      textViewPill.classList.add('fg-text-view-entry');
      textViewPill.title = '在当前窗格中以文字编辑整张图';
      viewToolsRow.appendChild(textViewPill);
    } else if (vaultPathFromTabId(fileName) && vaultIndex && desktopApi?.writeFile) {
      const note = model.nodes[0];
      if (note?.sourceRef?.kind === 'markdown') {
        viewToolsRow.appendChild(viewButton('编辑 Markdown', async () => {
          if (await openMarkdownSourceEditor(pane, note)) layoutDetails.open = false;
        }));
      }
    }
    const snapToggle = document.createElement('button');
    snapToggle.type = 'button';
    snapToggle.className = 'fg-mode-pill fg-grid-snap-control';
    snapToggle.dataset.viewAction = 'grid-snap';
    const fixedViewToggle = document.createElement('button');
    fixedViewToggle.type = 'button';
    fixedViewToggle.className = 'fg-mode-pill fg-fixed-view-control';
    fixedViewToggle.dataset.viewAction = 'fixed-node-style';
    const syncCanvasViewControls = () => {
      const snapMode = pane.gridSnapEnabled ? '全部' : pane.partialGridSnap ? '固定' : '关';
      snapToggle.textContent = `格点 · ${snapMode}`;
      snapToggle.title = pane.gridSnapEnabled ? '所有节点吸附到网格'
        : pane.partialGridSnap ? '仅固定节点吸附到网格' : '格点吸附已关闭';
      snapToggle.classList.toggle('is-active', pane.gridSnapEnabled || pane.partialGridSnap);
      fixedViewToggle.textContent = pane.fixedHollow ? '固定 · 镂空' : '固定 · 实心';
      fixedViewToggle.title = '切换固定节点的显示样式';
    };
    syncCanvasViewControls();
    snapToggle.onclick = () => {
      if (!isCurrent() || focusedInteractionBlocked('调整视图')) return;
      cycleGridSnapForPane(pane);
      syncCanvasViewControls();
    };
    fixedViewToggle.onclick = () => {
      if (!isCurrent() || focusedInteractionBlocked('调整视图')) return;
      const hollow = !pane.fixedHollow;
      for (const owner of allPaneOwners()) {
        if (paneRuntime(owner) === runtime) owner.fixedHollow = hollow;
      }
      scheduleSaveForRuntime(runtime, pane.index === PANE_LEFT ? collectSettings() : collectPaneSettings(pane));
      syncCanvasViewControls();
      draw();
    };
    viewToolsRow.append(snapToggle, fixedViewToggle);
    for (const layout of layouts) {
      const pill = layoutButton(layout.name, layout.name);
      bindContextMenuTrigger(pill, (x, y) => {
        const { left, top } = appShell.getBoundingClientRect();
        showActionWheel(appShell, x - left, y - top, [
          { label: '重命名', icon: 'edit', action: async () => {
            const name = (await safePrompt('排布名称', layout.name))?.trim();
            if (!name || !isCurrent() || name === layout.name) return;
            const latest = readSavedLayouts(fileName);
            const original = latest.find(item => item.name === layout.name);
            if (!original) return;
            if (Object.prototype.hasOwnProperty.call(modeNames, name) || latest.some(item => item.name === name)) {
              showToast('这个排布名称已在使用', 'warning');
              return;
            }
            original.name = name;
            writeSavedLayouts(fileName, latest);
            for (const owner of allPaneOwners()) {
              if (paneRuntime(owner) !== runtime || owner.activeMode !== layout.name) continue;
              owner.activeMode = name;
              scheduleSaveForRuntime(runtime, owner.index === PANE_LEFT ? collectSettings() : collectPaneSettings(owner));
            }
            renderModeBar();
          } },
          { label: '删除', icon: 'delete', destructive: true, action: async () => {
            if (!await confirmAction('删除「' + layout.name + '」？') || !isCurrent()) return;
            writeSavedLayouts(fileName, readSavedLayouts(fileName).filter(item => item.name !== layout.name));
            for (const owner of allPaneOwners()) {
              if (paneRuntime(owner) === runtime && owner.activeMode === layout.name) applyLayoutMode('auto', true, owner.index);
            }
            renderModeBar();
          } },
        ], { label: '排布操作', returnFocus: pill, clearSelection: false });
      });
      alternateModeRow.appendChild(pill);
    }

    const saveLayoutButton = viewButton('+ 保存当前排布', async () => {
      const current = readSavedLayouts(fileName).find(layout => layout.name === pane.activeMode);
      const name = current?.name ?? (await safePrompt('排布名称'))?.trim();
      if (!name || !isCurrent()) return;
      if (Object.prototype.hasOwnProperty.call(modeNames, name)) {
        showToast('这个排布名称已在使用', 'warning');
        return;
      }
      let latest = readSavedLayouts(fileName);
      if (!current && latest.some(layout => layout.name === name)) {
        if (!await confirmAction('覆盖「' + name + '」？') || !isCurrent()) return;
        latest = readSavedLayouts(fileName);
      }
      const visible: GraphData['nodes'] = pane.simManager?.getSim()?.nodes() ?? [];
      const byId = new Map(visible.map(node => [node.id, node]));
      const saved: SavedLayout = {
        name,
        nodes: model.nodes.map(node => {
          const position = byId.get(node.id) ?? node;
          return { id: node.id, x: position.x, y: position.y, fx: node.fx ?? null, fy: node.fy ?? null, fixed: !!node.fixed };
        }),
        groupModes: model.groups.map(group => ({ id: group.id, mode: group.displayMode })),
      };
      const index = latest.findIndex(layout => layout.name === name);
      if (index === -1) latest.push(saved);
      else latest[index] = saved;
      writeSavedLayouts(fileName, latest);
      renderModeBar();
    });
    saveLayoutButton.title = '把当前节点位置保存为一种观察方式';
    alternateModeRow.appendChild(saveLayoutButton);

    const density = model.settings?.semanticCardDensity ?? DEFAULT_SEMANTIC_CARD_DENSITY;
    const formLabel = document.createElement('span');
    formLabel.textContent = '信息粒度';
    formLabel.title = '自动整理中，内容以卡片或节点呈现的密度';
    formLabel.style.cssText = 'font-size:var(--fg-font-xs,.72em);opacity:.58;margin-right:2px;white-space:nowrap;';
    formRow.appendChild(formLabel);
    const densityChoices = [
      { value: 'nodes', label: '节点', title: '显示节点与明确连线，保持简洁的网络图' },
      { value: 'full', label: '阅读', title: '尽可能全部展开为卡片' },
      { value: 'mixed', label: '自适应', title: '根据缩放、焦点、关系和画面空间自动分配卡片' },
    ] as const;
    for (const choice of densityChoices) {
      const active = density === choice.value;
      const pill = viewButton(choice.label, () => {
        if (active) return;
        model.settings = {
          ...(model.settings ?? DEFAULT_SETTINGS),
          semanticCardDensity: choice.value,
          semanticLayoutMemory: undefined,
        };
        pane.semanticLensState = null;
        scheduleSaveForRuntime(runtime, pane.index === PANE_LEFT ? collectSettings() : collectPaneSettings(pane));
        if (pane.activeMode === 'auto') applySemanticPositions(pane, true, true);
        renderModeBar();
      }, active);
      pill.classList.add('fg-semantic-form-pill');
      pill.title = choice.title;
      formRow.appendChild(pill);
    }


    const legendEntries = [
      { text: '⌒ 明确', title: '用户创建的明确关系：稳定浅弧，不暗示方向' },
      { text: '↗ 引用', title: '来自 Obsidian 原文的双链、嵌入与反向链接' },
      { text: '⌁ 方向', title: '箭头、因果、依赖或先后关系：弧线与方向记号' },
      { text: '└ 结构', title: '层级、包含或归属关系：骨架式曲线' },
      { text: '┄ 文字线索', title: '本机文字匹配得到的共同词语：在阅读、自适应或局部上下文中显示' },
      { text: '□ 待办', title: '文字看起来像待办或提醒' },
      { text: '◎ 问题', title: '文字看起来像一个问题' },
      { text: '● 摘要隐藏', title: '可能包含密码或密钥，自动排布时跳过文字匹配' },
    ];
    formRow.style.display = mode === 'auto' ? 'flex' : 'none';
    semanticLegendDetails.style.display = mode === 'auto' ? 'block' : 'none';
    for (const entry of legendEntries) {
      const item = document.createElement('span');
      item.textContent = entry.text;
      item.title = entry.title;
      item.style.whiteSpace = 'nowrap';
      semanticLegend.appendChild(item);
    }
    if (focusedControl && layoutDetails.open && document.activeElement === document.body) {
      const replacement = [...layoutPopover.querySelectorAll<HTMLButtonElement>('button[data-view-action]')]
        .find(button => button.dataset.viewAction === focusedControl && button.getClientRects().length);
      (replacement ?? layoutSum).focus({ preventScroll: true });
    }
  };
  refreshOpenViewMenu = () => { if (layoutDetails.open) renderModeBar(); };
  renderModeBar();

  controlsDiv.appendChild(backupActions);

  setupGroupSearch(groupInput, groupDropdown, () => {
    const targetPane = focusedPaneState();
    const targetGraph = paneRuntimeGraph(targetPane);
    if (canMutateCanvasPane(targetPane)) syncStructureCollections(targetGraph);
    const groups = targetGraph.groups;
    const isCurrent = () => allPaneOwners().includes(targetPane) && focusedPaneState() === targetPane
      && paneRuntimeGraph(targetPane) === targetGraph && targetGraph.groups === groups;
    return {
      groups, isCurrent, canCreate: () => isCurrent() && canMutateCanvasPane(targetPane),
      open: group => {
        if (!isCurrent() || !groups.includes(group)) return;
        controlsDetails.open = false; fillGroup(group.id);
      },
      create: label => {
        if (!isCurrent() || !canMutateCanvasPane(targetPane) || groups.some(group => group.label === label)) return;
        const color = '#' + getAccentColorsForTheme(targetPane.graphTheme).accent.toString(16).padStart(6, '0');
        const newGroup = { id: createGroupId(groups), label, color, borderColor: color,
          opacity: 0.15, displayMode: 'rect', nodeColorMode: 'off' };
        const runtime = targetPane.index === PANE_LEFT ? primaryRuntime : targetPane.runtime;
        runtime.undoManager.pushSnapshot(targetGraph); groups.push(newGroup);
        scheduleSaveForRuntime(runtime); controlsDetails.open = false; fillGroup(newGroup.id); draw();
      },
    };
  });

  // --- 缩放/平移由 pixi-viewport 处理 ---

  // --- 右键菜单 ---
  const graphTabLabel = (tabId: string): string => vaultDisplayName(tabId).replace(/\.json$/i, '') || '未命名图';

  const referenceDestinationTabs = (sourcePane: PaneState): string[] => {
    const paneTabs = sourcePane.index === PANE_LEFT ? openTabs : sourcePane.openTabs;
    const journeyStack = referenceJourneys.get(sourcePane.index) || [];
    const journeyOrigin = journeyStack[journeyStack.length - 1]?.originTab;
    const current = paneLoadedTab(sourcePane);
    return [...new Set([
      ...(!isVaultLocationTabId(current) ? [current] : []),
      ...(journeyOrigin ? [journeyOrigin] : []),
      ...[...paneTabs].reverse(),
      ..._flatTreePaths,
    ])].filter(tab => tab && !isVaultLocationTabId(tab) && !isBuiltin(tab));
  };

  const resourceReferencePreviewCache = new Map<string, Promise<string>>();
  const vaultReadPermissionCache = new Map<string, Promise<boolean>>();
  const referencePreviewHydrations = new WeakMap<object, Promise<boolean>>();

  const graphReferenceCardSummary = (target: GraphData): string => {
    const labels = (target.nodes || []).slice(0, 7)
      .map((candidate: any) => String(candidate.label || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const counts = `${target.nodes?.length || 0} 个节点 · ${target.edges?.length || 0} 条线`;
    return labels.length > 0 ? `${counts} · ${labels.join(' · ')}` : counts;
  };

  const unavailableReferenceCardPreview = (reference: ResourceReference): string => {
    if (reference.kind === 'markdown') return '暂时无法读取笔记摘要 · 双击阅读';
    if (reference.kind === 'graph') return '暂时无法读取图空间摘要 · 双击进入';
    return vaultIndex ? resourceReferenceCardFallback(reference, vaultIndex) : '引用内容暂时不可用';
  };

  const ensureVaultReadPermission = (rootPath: string): Promise<boolean> => {
    const cached = vaultReadPermissionCache.get(rootPath);
    if (cached) return cached;
    const ea = (window as any).electronAPI;
    const request = Promise.resolve(ea?.addAllowedDir ? ea.addAllowedDir(rootPath) : { ok: true })
      .then((result: any) => result?.error == null)
      .catch(() => false);
    vaultReadPermissionCache.set(rootPath, request);
    return request;
  };

  const readVaultTextForPreview = async (relativePath: string): Promise<string | null> => {
    const ea = (window as any).electronAPI;
    const rootPath = vaultIndex?.rootPath || fileSystemMountPath;
    if (!ea?.readFile || !rootPath || !await ensureVaultReadPermission(rootPath)) return null;
    const raw = await ea.readFile(joinVaultPath(rootPath, relativePath));
    return typeof raw === 'string' ? raw : null;
  };

  const readMarkdownEditorSource = async (target: { absolutePath: string }): Promise<string> => {
    const ea = (window as any).electronAPI;
    const rootPath = vaultIndex?.rootPath || fileSystemMountPath;
    if (!ea?.readFile || !rootPath || !await ensureVaultReadPermission(rootPath)) {
      throw new Error('Vault 目录尚未获得读取权限');
    }
    const raw = await ea.readFile(target.absolutePath);
    if (typeof raw !== 'string') throw new Error(raw?.error || '文件无法读取');
    return raw;
  };

  markdownSourceEditor = createMarkdownSourceEditor(appShell, {
    createLiveInput: async (host, onInput) => (await import('./markdown-live-input')).createMarkdownLiveInput(host, onInput),
    readFile: readMarkdownEditorSource,
    writeFile: async (target, content, expectedContent) => {
      const ea = (window as any).electronAPI;
      const rootPath = vaultIndex?.rootPath || fileSystemMountPath;
      if (!ea?.writeFile || !rootPath || !await ensureVaultReadPermission(rootPath)) {
        throw new Error('当前环境不能写入 Vault 原文');
      }
      const result = await ea.writeFile(target.absolutePath, content, expectedContent);
      if (result?.conflict === true && typeof result.content === 'string') {
        return { conflict: true, content: result.content };
      }
      if (!result?.ok) throw new Error(result?.error || '写入没有完成');
      return { ok: true };
    },
    confirmDiscard: title => confirmAction(
      `“${title}”还有尚未保存的原文修改。`,
      { confirm: '放弃修改', cancel: '继续编辑' },
    ),
    openInObsidian: target => {
      void openVaultResourceInObsidian(target.path, target.block ? `^${target.block}` : target.heading);
    },
    notify: (message, type = 'info') => showToast(message, type, type === 'error' ? 6000 : 3200),
    onSaved: async target => {
      resourceReferencePreviewCache.clear();
      await refreshVaultIndex();
      const affectedTabs = new Set<string>([vaultTabId(target.path)]);
      for (const runtime of runtimeRegistry.values()) {
        if (isVaultLocationTabId(runtime.fileName)) affectedTabs.add(runtime.fileName);
      }
      for (const tabId of affectedTabs) await reloadVaultResourceViews(tabId);
      draw();
    },
  });

  const markdownProjectionTarget = (pane: PaneState, node: any): MarkdownProjectionTarget | null => {
    const source = node?.sourceRef as VaultSourceRef | undefined;
    const runtimeGraph = paneRuntimeGraph(pane);
    if (!vaultIndex || !(window as any).electronAPI?.writeFile || runtimeGraph.settings?.sourceMode !== 'vault-readonly'
      || source?.kind !== 'markdown' || source.block || node.mediaType !== 'md' || typeof node.mediaUrl !== 'string') return null;
    if (source.heading && source.line) {
      return { kind: 'section', heading: source.heading, headingPath: source.headingPath, line: source.line };
    }
    if (source.heading || source.line !== 1) return null;
    return { kind: 'document', wholeBody: true };
  };

  openMarkdownSourceEditor = async (sourcePane, node, field) => {
    if (blockForTextDraft('编辑原文')) return false;
    const reference = (node?.resourceRef?.kind === 'markdown'
      ? node.resourceRef
      : node?.sourceRef?.kind === 'markdown' ? node.sourceRef : null) as VaultSourceRef | null;
    const rootPath = vaultIndex?.rootPath || fileSystemMountPath;
    if (!reference?.path || !rootPath || !markdownSourceEditor) {
      showToast('Vault 尚未连接，暂时无法编辑原文', 'warning', 3500);
      return false;
    }
    if (node?._resourceReferenceStatus === 'broken') {
      showToast(`引用目标不存在：${reference.path}`, 'warning', 4200);
      return false;
    }
    const projectionTarget = field && markdownProjectionTarget(sourcePane, node);
    if (field && (!projectionTarget || field === 'title' && projectionTarget.kind !== 'section')) return false;
    const title = String(node?.label || reference.displayLabel || vaultDisplayName(vaultTabId(reference.path))).trim() || '未命名笔记';
    const opened = await markdownSourceEditor.open({
      path: normalizeVaultPath(reference.path),
      absolutePath: joinVaultPath(rootPath, reference.path),
      title,
      heading: reference.heading,
      headingPath: reference.headingPath,
      block: reference.block,
      line: reference.line,
      editable: !!(window as any).electronAPI?.writeFile,
      projection: field && projectionTarget ? { target: projectionTarget, field } : undefined,
    });
    if (opened && focusedPaneIndex !== sourcePane.index) switchFocusedPane(sourcePane.index);
    return opened;
  };

  const vaultReaderEditAction = (pane: PaneState, node: any) => {
    if (!vaultIndex || !(window as any).electronAPI?.writeFile || node?._resourceReferenceStatus === 'broken') return undefined;
    if (node?.sourceRef?.kind !== 'markdown' && node?.resourceRef?.kind !== 'markdown') return undefined;
    const field = markdownProjectionTarget(pane, node) ? 'body' : undefined;
    return {
      label: field ? '修改内容' : '编辑原文',
      onSelect: async () => {
        if (await openMarkdownSourceEditor(pane, node, field)) hideMedia(node.id, true);
      },
    };
  };

  const loadResourceReferenceCardPreview = (reference: ResourceReference): Promise<string> => {
    if (!vaultIndex) return Promise.resolve('连接 Vault 后读取内容');
    const fallback = resourceReferenceCardFallback(reference, vaultIndex);
    if (reference.kind === 'folder') return Promise.resolve(fallback);
    const fingerprint = reference.fingerprint
      ? `${reference.fingerprint.size}:${reference.fingerprint.mtime}`
      : 'unversioned';
    const key = `${normalizeVaultPath(vaultIndex.rootPath || fileSystemMountPath || '')}:${reference.kind}:${normalizeVaultPath(reference.path)}:${reference.heading || ''}:${reference.block || ''}:${reference.line || ''}:${fingerprint}`;
    const cached = resourceReferencePreviewCache.get(key);
    if (cached) return cached;
    let cacheable = true;
    const request = (async () => {
      if (reference.kind === 'markdown') {
        const raw = await readVaultTextForPreview(reference.path);
        if (typeof raw !== 'string') {
          cacheable = false;
          return unavailableReferenceCardPreview(reference);
        }
        return markdownResourceReferenceExcerpt(raw, reference) || '空白笔记';
      }
      if (reference.kind === 'graph') {
        const graphFile = vaultGraphFileName(vaultIndex!, reference.path);
        if (!graphFile) {
          cacheable = false;
          return unavailableReferenceCardPreview(reference);
        }
        let target = runtimeRegistry.get(graphFile)?.graph || null;
        if (!target) {
          const result = await adapter.readFile(graphFile);
          if (result.ok && result.value) {
            try { target = JSON.parse(result.value) as GraphData; } catch { target = null; }
          }
        }
        if (!target) cacheable = false;
        return target ? graphReferenceCardSummary(target) : unavailableReferenceCardPreview(reference);
      }
      return fallback;
    })().catch(() => {
      cacheable = false;
      return unavailableReferenceCardPreview(reference);
    });
    resourceReferencePreviewCache.set(key, request);
    void request.finally(() => {
      if (!cacheable && resourceReferencePreviewCache.get(key) === request) {
        resourceReferencePreviewCache.delete(key);
      }
    });
    return request;
  };

  const hydrateResourceReferenceNodePreview = async (node: any): Promise<boolean> => {
    if (!isResourceReferenceNode(node)) return false;
    const preview = node._resourceReferenceStatus === 'broken'
      ? '引用目标暂时不可用'
      : await loadResourceReferenceCardPreview(node.resourceRef);
    if (node._resourceReferencePreview === preview) return false;
    node._resourceReferencePreview = preview;
    return true;
  };

  hydrateGraphResourceReferencePreviews = async (data: GraphData): Promise<boolean> => {
    if (!vaultIndex || data.settings?.sourceMode === 'vault-readonly') return false;
    const changes = await Promise.all((data.nodes || []).map(hydrateResourceReferenceNodePreview));
    return changes.some(Boolean);
  };

  const referenceSourceNode = (reference: ResourceReference): any => {
    const resource = reference.kind === 'folder' ? null : vaultResourceForPath(reference.path);
    const label = reference.displayLabel || resource?.title || resource?.name?.replace(/\.[^.]+$/, '')
      || reference.path.split('/').pop() || '引用';
    return {
      label,
      headingLevel: reference.kind === 'folder' ? 2 : reference.kind === 'markdown' ? 3 : 4,
      tags: reference.kind === 'folder' ? ['文件夹'] : reference.kind === 'graph' ? ['图空间'] : [reference.kind],
      note: '',
      _resourceReferencePreview: vaultIndex && reference.kind === 'folder'
        ? resourceReferenceCardFallback(reference, vaultIndex)
        : '',
    };
  };

  const refreshRuntimeForReferenceChange = (runtime: GraphRuntime, animate = true) => {
    normalizeStructureRelations(runtime.graph);
    for (const owner of allPaneOwners()) {
      const ownerRuntime = owner.index === PANE_LEFT ? primaryRuntime : owner.runtime;
      if (ownerRuntime !== runtime) continue;
      if (owner.activeMode === 'auto') activateSemanticLayoutForPane(owner, animate);
      else scopedPaneSimulationManager(owner)?.initSim?.();
    }
    refreshStructureViews(runtime);
    draw();
  };

  ensureGraphResourceReferencePreviews = (data: GraphData) => {
    if (!vaultIndex || data.settings?.sourceMode === 'vault-readonly' || referencePreviewHydrations.has(data)) return;
    const needsPreview = (data.nodes || []).some((node: any) => isResourceReferenceNode(node)
      && (!String(node._resourceReferencePreview || '').trim()
        || isResourceReferenceLoadingPreview(node._resourceReferencePreview)));
    if (!needsPreview) return;
    const request = hydrateGraphResourceReferencePreviews(data);
    referencePreviewHydrations.set(data, request);
    void request.then(changed => {
      referencePreviewHydrations.delete(data);
      if (!changed) return;
      const runtime = [...runtimeRegistry.values()].find(candidate => candidate.graph === data);
      if (runtime) refreshRuntimeForReferenceChange(runtime, false);
      else draw();
    }).catch(() => {
      referencePreviewHydrations.delete(data);
    });
  };

  const spaceReferenceHydrations = new WeakMap<object, Promise<boolean>>();
  const sameGraphId = (left: string, right: string) =>
    normalizeSpaceGraphId(left).toLocaleLowerCase('zh-CN') === normalizeSpaceGraphId(right).toLocaleLowerCase('zh-CN');

  const readSpaceReferenceSourceGraph = async (graphId: string, ownerGraph?: string, ownerData?: GraphData): Promise<GraphData | null> => {
    const normalized = normalizeSpaceGraphId(graphId);
    if (ownerData && ownerGraph && sameGraphId(normalized, ownerGraph)) return ownerData;
    const openRuntime = [...runtimeRegistry.values()].find(runtime => sameGraphId(runtime.fileName, normalized));
    if (openRuntime) return openRuntime.graph;
    const result = await adapter.readFile(normalized);
    if (result.ok && result.value) {
      try { return repairGraphCreatedOrders(JSON.parse(result.value) as GraphData); } catch { return null; }
    }
    const stored = readRecoveryGraph(normalized);
    return stored ? repairGraphCreatedOrders(stored) : null;
  };

  const resolveSpaceReferenceTarget = async (
    reference: SpaceReference,
    ownerGraph = '',
    ownerData?: GraphData,
  ): Promise<ResolvedSpaceReference> => {
    const source = await readSpaceReferenceSourceGraph(reference.graph, ownerGraph, ownerData);
    return resolveSpaceReference(reference, source);
  };

  hydrateGraphSpaceReferences = async (data: GraphData, ownerGraph: string): Promise<boolean> => {
    const changes = await Promise.all((data.nodes || []).map(async node => {
      if (!isSpaceReferenceNode(node)) return false;
      const before = JSON.stringify([
        node.label,
        node._spaceReferenceStatus,
        node._spaceReferencePreview,
        node._spaceReferenceLabel,
        node._spaceReferenceNodeIds,
        node._spaceReferenceMiniMap,
      ]);
      hydrateSpaceReferenceNode(node, await resolveSpaceReferenceTarget(node.spaceRef, ownerGraph, data));
      return before !== JSON.stringify([
        node.label,
        node._spaceReferenceStatus,
        node._spaceReferencePreview,
        node._spaceReferenceLabel,
        node._spaceReferenceNodeIds,
        node._spaceReferenceMiniMap,
      ]);
    }));
    return changes.some(Boolean);
  };

  ensureGraphSpaceReferences = (data: GraphData, ownerGraph: string) => {
    if (spaceReferenceHydrations.has(data)) return;
    const needsHydration = (data.nodes || []).some(node => isSpaceReferenceNode(node)
      && (!node._spaceReferenceStatus || !String(node._spaceReferencePreview || '').trim()));
    if (!needsHydration) return;
    const request = hydrateGraphSpaceReferences(data, ownerGraph);
    spaceReferenceHydrations.set(data, request);
    void request.then(changed => {
      spaceReferenceHydrations.delete(data);
      if (!changed) return;
      const runtime = [...runtimeRegistry.values()].find(candidate => candidate.graph === data);
      if (runtime) refreshRuntimeForReferenceChange(runtime, false);
      else draw();
    }).catch(() => { spaceReferenceHydrations.delete(data); });
  };

  refreshOpenSpaceReferences = async (sourceGraph?: string) => {
    const jobs: Promise<void>[] = [];
    const seen = new Set<GraphRuntime>();
    for (const runtime of runtimeRegistry.values()) {
      if (seen.has(runtime)) continue;
      seen.add(runtime);
      const relevant = !sourceGraph || runtime.graph.nodes.some(node => isSpaceReferenceNode(node)
        && sameGraphId(node.spaceRef.graph, sourceGraph));
      if (!relevant) continue;
      jobs.push(hydrateGraphSpaceReferences(runtime.graph, runtime.fileName).then(changed => {
        if (changed) refreshRuntimeForReferenceChange(runtime, false);
      }));
    }
    await Promise.all(jobs);
  };

  interface SpacePlacementEntry {
    reference: SpaceReference;
    source: any;
    sourceLocalId?: string;
  }

  const placeSpaceReferencesInGraph = async (
    targetTab: string,
    entries: SpacePlacementEntry[],
    sourceEdges: any[] = [],
  ): Promise<boolean> => {
    if (isVaultLocationTabId(targetTab) || isBuiltin(targetTab)) return false;
    const runtime = runtimeRegistry.get(targetTab) || [...runtimeRegistry.values()].find(candidate => sameGraphId(candidate.fileName, targetTab)) || null;
    const owner = runtime
      ? allPaneOwners().find(candidate => (candidate.index === PANE_LEFT ? primaryRuntime : candidate.runtime) === runtime) || null
      : null;
    const center = (owner ? panePixi(owner)?.viewport.center : null) ?? { x: 0, y: 0 };
    const targetGraph = runtime?.graph ?? await readGraphData(targetTab);
    if (!targetGraph || targetGraph.settings?.sourceMode === 'vault-readonly') {
      showToast(`无法写入“${graphTabLabel(targetTab)}”`, 'warning', 3200);
      return false;
    }
    const existingByKey = new Map<string, any>((targetGraph.nodes || [])
      .filter(isSpaceReferenceNode)
      .map(node => [spaceReferenceKey(node.spaceRef), node]));
    const occurrenceBySourceId = new Map<string, string>();
    const created: any[] = [];
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      const existing = existingByKey.get(spaceReferenceKey(entry.reference));
      if (existing) {
        if (entry.sourceLocalId) occurrenceBySourceId.set(entry.sourceLocalId, existing.id);
        continue;
      }
      const columns = Math.max(1, Math.ceil(Math.sqrt(entries.length)));
      const row = Math.floor(index / columns);
      const column = index % columns;
      const node = createSpaceReferenceNode(entry.reference, entry.source, {
        x: center.x + (column - (columns - 1) / 2) * 190,
        y: center.y + (row - (Math.ceil(entries.length / columns) - 1) / 2) * 130,
      });
      hydrateSpaceReferenceNode(node, await resolveSpaceReferenceTarget(entry.reference));
      created.push(node);
      existingByKey.set(spaceReferenceKey(entry.reference), node);
      if (entry.sourceLocalId) occurrenceBySourceId.set(entry.sourceLocalId, node.id);
    }
    if (created.length === 0) {
      showToast('这些内容已经在目标空间中', 'info', 2400);
      return true;
    }
    runtime?.undoManager.pushSnapshot(targetGraph);
    assignCreatedOrders(created, targetGraph.nodes);
    targetGraph.nodes.push(...created);
    const createdEdges: any[] = [];
    for (const sourceEdge of sourceEdges) {
      const sourceId = String(typeof sourceEdge.source === 'object' ? sourceEdge.source.id : sourceEdge.source);
      const targetId = String(typeof sourceEdge.target === 'object' ? sourceEdge.target.id : sourceEdge.target);
      const occurrenceSource = occurrenceBySourceId.get(sourceId);
      const occurrenceTarget = occurrenceBySourceId.get(targetId);
      if (!occurrenceSource || !occurrenceTarget || targetGraph.edges.some(edge => {
        const currentSource = String(typeof edge.source === 'object' ? edge.source.id : edge.source);
        const currentTarget = String(typeof edge.target === 'object' ? edge.target.id : edge.target);
        return currentSource === occurrenceSource && currentTarget === occurrenceTarget;
      })) continue;
      createdEdges.push({
        ...JSON.parse(JSON.stringify(sourceEdge)),
        source: occurrenceSource,
        target: occurrenceTarget,
        spaceRelationRef: {
          provider: 'nodespace', version: 1,
          graph: entries[0]?.reference.graph || '',
          sourceNodeId: sourceId, targetNodeId: targetId,
        },
      });
    }
    targetGraph.edges.push(...createdEdges);
    targetGraph.settings = {
      ...DEFAULT_SETTINGS,
      ...(targetGraph.settings || {}),
      semanticCardForms: {
        ...(targetGraph.settings?.semanticCardForms || {}),
        ...Object.fromEntries(created.map(node => [node.id, 'card'])),
      },
    };
    if (runtime) {
      scheduleSaveForRuntime(runtime);
      refreshRuntimeForReferenceChange(runtime);
    } else if (!await writeGraphData(targetTab, targetGraph)) {
      return false;
    }
    showToast(`已在「${graphTabLabel(targetTab)}」放入 ${created.length} 个实时引用${createdEdges.length ? ` · ${createdEdges.length} 条关系` : ''}`, 'success', 3400);
    return true;
  };

  const compositionDestinationTabs = (sourcePane: PaneState): string[] => {
    const source = paneLoadedTab(sourcePane);
    return referenceDestinationTabs(sourcePane)
      .filter(tab => /\.json$/i.test(tab))
      .filter(tab => !sameGraphId(tab, source));
  };

  const shareNodesToSpace = async (sourcePane: PaneState, nodeIds: string[], targetTab: string) => {
    const sourceGraphId = paneLoadedTab(sourcePane);
    const sourceGraph = paneRuntimeGraph(sourcePane);
    if (sourceGraph.settings?.sourceMode === 'vault-readonly' || isBuiltin(sourceGraphId)) {
      showToast('只读空间和示例图不能作为共享内容的本体', 'warning', 3200);
      return;
    }
    const selected = new Set(nodeIds.map(String));
    const entries = sourceGraph.nodes.filter(node => selected.has(String(node.id))).map(node => ({
      reference: isSpaceReferenceNode(node) ? { ...node.spaceRef } : createNodeSpaceReference(sourceGraphId, node),
      source: node,
      sourceLocalId: String(node.id),
    }));
    const edges = sourceGraph.edges.filter(edge => {
      const source = String(typeof edge.source === 'object' ? edge.source.id : edge.source);
      const target = String(typeof edge.target === 'object' ? edge.target.id : edge.target);
      return selected.has(source) && selected.has(target);
    });
    await placeSpaceReferencesInGraph(targetTab, entries, edges);
  };

  const placeWholeSpacePortal = async (sourcePane: PaneState, targetTab: string) => {
    const sourceGraphId = paneLoadedTab(sourcePane);
    if (sourcePane.graph.settings?.sourceMode === 'vault-readonly' || isBuiltin(sourceGraphId)) return;
    const reference = createWholeSpaceReference(sourceGraphId, graphTabLabel(sourceGraphId));
    await placeSpaceReferencesInGraph(targetTab, [{ reference, source: { label: reference.displayLabel, headingLevel: 2 } }]);
  };

  const placeFragmentPortal = async (sourcePane: PaneState, nodeIds: string[], targetTab: string) => {
    const runtime = sourcePane.index === PANE_LEFT ? primaryRuntime : sourcePane.runtime;
    const sourceGraphId = runtime.fileName;
    if (runtime.graph.settings?.sourceMode === 'vault-readonly' || isBuiltin(sourceGraphId)) return;
    runtime.undoManager.pushSnapshot(runtime.graph);
    const fragment = createSpaceFragment(runtime.graph, nodeIds);
    if (fragment.nodeIds.length === 0) return;
    scheduleSaveForRuntime(runtime);
    const reference = createFragmentSpaceReference(sourceGraphId, fragment);
    await placeSpaceReferencesInGraph(targetTab, [{ reference, source: { label: fragment.label, headingLevel: 2 } }]);
  };

  const rectLike = (rect: DOMRect): RectLike => ({
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  });

  const transitionPause = (duration: number) => new Promise<void>(resolve => window.setTimeout(resolve, duration));
  const transitionPaint = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const transitionDuration = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 1 : 315;

  const setSpaceTransitionRect = (surface: HTMLElement, rect: RectLike) => {
    surface.style.left = `${Math.round(rect.left)}px`;
    surface.style.top = `${Math.round(rect.top)}px`;
    surface.style.width = `${Math.round(rect.width)}px`;
    surface.style.height = `${Math.round(rect.height)}px`;
  };

  const usableSpaceTransitionRect = (pane: PaneState): RectLike | null => {
    const px = panePixi(pane);
    if (!px) return null;
    const canvas = rectLike(px.app.canvas.getBoundingClientRect());
    const side = sidebar.sidebar.getBoundingClientRect();
    const top = floatingTop.getBoundingClientRect();
    const overlapsSidebar = side.right > canvas.left && side.left < canvas.left + canvas.width;
    const overlapsTop = top.bottom > canvas.top && top.top < canvas.top + canvas.height;
    return expandedSpacePortalRect(canvas, {
      left: overlapsSidebar ? Math.max(16, side.right - canvas.left + 14) : 16,
      top: overlapsTop ? Math.max(16, top.bottom - canvas.top + 14) : 16,
      right: 18,
      bottom: 22,
    });
  };

  const captureSpacePortalAnchorForNode = (pane: PaneState, node: any): NormalizedSpacePortalAnchor | null => {
    const px = panePixi(pane);
    if (!px) return null;
    const simNode = scopedPaneSimulationManager(pane)?.getSim()?.nodes()
      .find((candidate: any) => String(candidate.id) === String(node.id)) || node;
    if (!Number.isFinite(Number(simNode?.x)) || !Number.isFinite(Number(simNode?.y))) return null;
    const canvas = rectLike(px.app.canvas.getBoundingClientRect());
    const screen = px.viewport.toScreen(Number(simNode.x), Number(simNode.y));
    const card = simNode._semanticCard || node._semanticCard;
    const zoom = Math.max(0.05, Number(px.viewport.scale.x) || 1);
    const nodeRadius = Math.max(9, Number(card?.nodeRadius) || Number(simNode.radius) || 12);
    const width = Math.max(48, Math.min(canvas.width * 0.72, Number(card?.width || nodeRadius * 2 + 28) * zoom));
    const height = Math.max(48, Math.min(canvas.height * 0.68, Number(card?.height || nodeRadius * 2 + 28) * zoom));
    const portal = {
      left: canvas.left + screen.x - width / 2,
      top: canvas.top + screen.y - height / 2,
      width,
      height,
    };
    return normalizeSpacePortalAnchor(canvas, portal);
  };

  const captureSpacePortalTransition = (
    pane: PaneState,
    node: any,
    resolved: ResolvedSpaceReference,
    capturedAnchor?: NormalizedSpacePortalAnchor | null,
  ): SpacePortalTransitionSnapshot | null => {
    const anchor = capturedAnchor || captureSpacePortalAnchorForNode(pane, node);
    if (!anchor) return null;
    return {
      anchor,
      label: resolved.label,
      kind: resolved.reference.kind,
      miniMap: resolved.miniMap,
    };
  };

  const captureVaultReferenceTransition = (
    pane: PaneState,
    node: any,
    reference: ResourceReference,
    capturedAnchor?: NormalizedSpacePortalAnchor | null,
  ): SpacePortalTransitionSnapshot | null => {
    const anchor = capturedAnchor || captureSpacePortalAnchorForNode(pane, node);
    if (!anchor) return null;
    return {
      anchor,
      label: node.label || reference.displayLabel || vaultDisplayName(vaultTabId(reference.path)),
      kind: reference.kind,
      miniMap: { points: [], edges: [] },
    };
  };

  const createSpaceTransitionMap = (snapshot: SpacePortalTransitionSnapshot): SVGSVGElement => {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.classList.add('fg-space-transition-map');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const points = new Map(snapshot.miniMap.points.map(point => [point.id, point]));
    for (const edge of snapshot.miniMap.edges) {
      const source = points.get(edge.source), target = points.get(edge.target);
      if (!source || !target) continue;
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', String(8 + source.x * 84));
      line.setAttribute('y1', String(9 + source.y * 76));
      line.setAttribute('x2', String(8 + target.x * 84));
      line.setAttribute('y2', String(9 + target.y * 76));
      svg.appendChild(line);
    }
    const labels = [...snapshot.miniMap.points]
      .filter(point => String(point.label || '').trim())
      .sort((left, right) => (Number(left.level) || 6) - (Number(right.level) || 6))
      .slice(0, 8);
    for (const point of snapshot.miniMap.points) {
      const x = 8 + point.x * 84, y = 9 + point.y * 76;
      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', String(x));
      circle.setAttribute('cy', String(y));
      circle.setAttribute('r', String(1.55 + (6 - Math.max(1, Math.min(6, Number(point.level) || 6))) * 0.18));
      svg.appendChild(circle);
      if (labels.includes(point)) {
        const text = document.createElementNS(ns, 'text');
        const characters = Array.from(String(point.label || '').trim());
        text.textContent = characters.length > 9 ? `${characters.slice(0, 8).join('')}…` : characters.join('');
        text.setAttribute('x', String(x));
        text.setAttribute('y', String(Math.min(95, y + 5.5)));
        svg.appendChild(text);
      }
    }
    if (snapshot.miniMap.points.length === 0) {
      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', '50');
      circle.setAttribute('cy', '48');
      circle.setAttribute('r', '4');
      svg.appendChild(circle);
    }
    return svg;
  };

  const createSpaceTransitionOverlay = (snapshot: SpacePortalTransitionSnapshot, initialRect: RectLike) => {
    const overlay = document.createElement('div');
    overlay.className = 'fg-space-transition';
    overlay.setAttribute('aria-hidden', 'true');
    const surface = document.createElement('div');
    surface.className = 'fg-space-transition-surface';
    surface.dataset.kind = snapshot.kind;
    setSpaceTransitionRect(surface, initialRect);
    const header = document.createElement('div');
    header.className = 'fg-space-transition-header';
    const title = document.createElement('div');
    title.className = 'fg-space-transition-title';
    title.textContent = snapshot.label;
    const kind = document.createElement('div');
    kind.className = 'fg-space-transition-kind';
    kind.textContent = snapshot.kind === 'node'
      ? '共享节点'
      : snapshot.kind === 'fragment'
        ? '空间片段'
        : snapshot.kind === 'space'
          ? '空间'
          : snapshot.kind === 'markdown'
            ? 'Obsidian 笔记'
            : snapshot.kind === 'folder'
              ? '资料夹空间'
              : snapshot.kind === 'graph'
                ? 'NodeSpace 图空间'
                : snapshot.kind === 'pdf'
                  ? 'PDF 文档'
                  : 'Vault 资源';
    header.append(title, kind);
    surface.append(createSpaceTransitionMap(snapshot), header);
    overlay.appendChild(surface);
    appShell.appendChild(overlay);
    return { overlay, surface };
  };

  const playSpacePortalEntryTransition = async (
    pane: PaneState,
    snapshot: SpacePortalTransitionSnapshot | null,
    enter: () => Promise<void>,
  ) => {
    const px = panePixi(pane);
    const expanded = usableSpaceTransitionRect(pane);
    if (!snapshot || !px || !expanded) {
      await enter();
      return;
    }
    const canvas = rectLike(px.app.canvas.getBoundingClientRect());
    const initial = resolveSpacePortalAnchor(canvas, snapshot.anchor);
    const { overlay, surface } = createSpaceTransitionOverlay(snapshot, initial);
    const duration = transitionDuration();
    try {
      await transitionPaint();
      overlay.classList.add('is-active');
      setSpaceTransitionRect(surface, expanded);
      await transitionPause(duration);
      await enter();
      await transitionPaint();
      overlay.classList.add('is-complete');
      await transitionPause(duration === 1 ? 1 : 180);
    } finally {
      overlay.remove();
    }
  };

  const playSpacePortalReturnTransition = async (
    pane: PaneState,
    snapshot: SpacePortalTransitionSnapshot,
    leave: () => Promise<void>,
  ) => {
    const expanded = usableSpaceTransitionRect(pane);
    const px = panePixi(pane);
    if (!expanded || !px) {
      await leave();
      return;
    }
    const { overlay, surface } = createSpaceTransitionOverlay(snapshot, expanded);
    overlay.classList.add('is-active');
    const duration = transitionDuration();
    try {
      await transitionPaint();
      await leave();
      await transitionPaint();
      const currentPixi = panePixi(pane);
      const canvas = currentPixi ? rectLike(currentPixi.app.canvas.getBoundingClientRect()) : expanded;
      overlay.classList.remove('is-active');
      overlay.classList.add('is-returning');
      setSpaceTransitionRect(surface, resolveSpacePortalAnchor(canvas, snapshot.anchor));
      await transitionPause(duration);
      overlay.classList.add('is-complete');
      await transitionPause(duration === 1 ? 1 : 150);
    } finally {
      overlay.remove();
    }
  };

  const showSpaceReferencePreview = async (sourcePane: PaneState, node: any) => {
    if (!isSpaceReferenceNode(node)) return;
    const resolved = await resolveSpaceReferenceTarget(node.spaceRef, paneLoadedTab(sourcePane), paneRuntimeGraph(sourcePane));
    hydrateSpaceReferenceNode(node, resolved);
    if (resolved.status === 'broken') {
      showToast('引用的节点、片段或空间已经不存在', 'warning', 3800);
      draw();
      return;
    }
    const px = panePixi(sourcePane);
    const simNode = scopedPaneSimulationManager(sourcePane)?.getSim()?.nodes()
      .find((candidate: any) => candidate.id === node.id) || node;
    if (!px || !simNode) return;
    const nodeContent = node.spaceRef.kind === 'node' ? String(resolved.nodes[0]?.note || resolved.preview) : '';
    const content = node.spaceRef.kind === 'node'
      ? [`# ${resolved.label}`, '', nodeContent || '空白节点'].join('\n')
      : [`# ${resolved.label}`, '', `${resolved.nodes.length} 个节点 · ${resolved.edges.length} 条线`, '',
        ...resolved.nodes.slice(0, 48).map(candidate => `- ${candidate.label || candidate.id}`),
        ...(resolved.nodes.length > 48 ? ['', `另有 ${resolved.nodes.length - 48} 个节点…`] : [])].join('\n');
    showMedia(mediaOverlayContainer, node.id, resolved.label, 'md', content, mediaAccentForNode(node, getTheme(sourcePane.graphTheme)), () => {
      const screen = px.viewport.toScreen(simNode.x, simNode.y);
      const rect = px.app.canvas.getBoundingClientRect();
      return { x: rect.left + screen.x, y: rect.top + screen.y };
    }, () => { px.viewport.pause = true; }, () => { px.viewport.pause = false; }, true, () => {
      manuallyOpenedMediaIds.delete(node.id);
      draw();
    });
    manuallyOpenedMediaIds.add(node.id);
    draw();
  };

  const focusSpaceReferenceTarget = (pane: PaneState, resolved: ResolvedSpaceReference) => {
    pane.spaceFocusNodeIds = resolved.reference.kind === 'fragment' ? [...resolved.nodeIds] : null;
    if (resolved.reference.kind === 'space') return;
    const load = paneGraphLoads.get(pane);
    setTimeout(() => {
      if (paneGraphLoads.get(pane) !== load) return;
      const targetGraph = paneRuntimeGraph(pane);
      const wanted = new Set(resolved.nodeIds);
      const targets = targetGraph.nodes.filter(candidate => wanted.has(String(candidate.id)));
      if (targets.length === 0) return;
      sharedState.setSelectedNodeIds?.(targets.map(candidate => candidate.id));
      pane.selNode = targets.length === 1 ? targets[0].id : null;
      fitPaneNodes(pane, targets, 420);
      draw();
    }, 620);
  };

  const openSpaceReferenceTarget = async (sourcePane: PaneState, node: any) => {
    if (!isSpaceReferenceNode(node)) return;
    // Double-click also produces ordinary tap/focus work. Capture the camera and
    // entrance synchronously so async source resolution cannot move either.
    const entryViewport = panePixi(sourcePane)?.viewport;
    const entryViewportState = entryViewport
      ? { centerX: entryViewport.center.x, centerY: entryViewport.center.y, scale: entryViewport.scale.x }
      : null;
    const entryPortalAnchor = captureSpacePortalAnchorForNode(sourcePane, node);
    const resolved = await resolveSpaceReferenceTarget(node.spaceRef, paneLoadedTab(sourcePane), paneRuntimeGraph(sourcePane));
    hydrateSpaceReferenceNode(node, resolved);
    if (resolved.status === 'broken') {
      showToast('引用目标已经不存在', 'warning', 3800);
      draw();
      return;
    }
    if (blockForTextDraft('进入引用')) return;
    if (focusedPaneIndex !== sourcePane.index) switchFocusedPane(sourcePane.index);
    const originTab = paneLoadedTab(sourcePane);
    const targetTab = normalizeSpaceGraphId(node.spaceRef.graph);
    if (sameGraphId(originTab, targetTab)) {
      focusSpaceReferenceTarget(sourcePane, resolved);
      showToast(node.spaceRef.kind === 'space' ? '这个入口指向当前空间' : '已定位到当前空间中的本体', 'info', 2400);
      return;
    }
    const stack = referenceJourneys.get(sourcePane.index) || [];
    if (navigationWouldCycle([...stack.map(item => item.originTab), originTab], targetTab)) {
      showToast('这个入口会回到当前进入路径，已阻止循环进入', 'warning', 3500);
      return;
    }
    const spaceTransition = captureSpacePortalTransition(sourcePane, node, resolved, entryPortalAnchor) || undefined;
    stack.push({
      originTab,
      originLabel: graphTabLabel(originTab),
      targetTab,
      targetLabel: resolved.label,
      targetKind: 'graph',
      viewport: entryViewportState,
      spaceTransition,
    });
    referenceJourneys.set(sourcePane.index, stack);
    referenceNavigationInFlight.add(sourcePane.index);
    try {
      await playSpacePortalEntryTransition(sourcePane, spaceTransition || null, async () => {
        await openTab(targetTab);
        syncVaultSpaceBreadcrumb();
        focusSpaceReferenceTarget(sourcePane, resolved);
      });
    } finally {
      referenceNavigationInFlight.delete(sourcePane.index);
    }
    syncVaultSpaceBreadcrumb();
  };

  const placeResourceReferenceInGraph = async (
    targetTab: string,
    reference: ResourceReference,
    sourceNode = referenceSourceNode(reference),
  ): Promise<boolean> => {
    if (isVaultLocationTabId(targetTab)) return false;
    const runtime = runtimeRegistry.get(targetTab) || null;
    const owner = runtime
      ? allPaneOwners().find(candidate => (candidate.index === PANE_LEFT ? primaryRuntime : candidate.runtime) === runtime) || null
      : null;
    const viewport = owner ? panePixi(owner)?.viewport : null;
    const center = viewport?.center ?? { x: 0, y: 0 };
    const targetGraph = runtime?.graph ?? await readGraphData(targetTab);
    if (!targetGraph || targetGraph.settings?.sourceMode === 'vault-readonly') {
      showToast(`无法写入“${graphTabLabel(targetTab)}”`, 'warning', 3200);
      return false;
    }
    const node = createResourceReferenceNode(sourceNode, reference, { x: center.x, y: center.y });
    await hydrateResourceReferenceNodePreview(node);
    assignCreatedOrder(node, targetGraph.nodes);
    runtime?.undoManager.pushSnapshot(targetGraph);
    targetGraph.nodes.push(node);
    targetGraph.settings = {
      ...DEFAULT_SETTINGS,
      ...(targetGraph.settings || {}),
      semanticCardForms: {
        ...(targetGraph.settings?.semanticCardForms || {}),
        [node.id]: 'card',
      },
    };
    if (vaultIndex) reconcileGraphResourceReferences(targetGraph, vaultIndex, fileSystemMountPath || vaultIndex.rootPath);
    if (runtime) {
      scheduleSaveForRuntime(runtime);
      refreshRuntimeForReferenceChange(runtime);
    } else if (!await writeGraphData(targetTab, targetGraph)) {
      return false;
    }
    showToast(`已把“${node.label}”作为引用放入「${graphTabLabel(targetTab)}」`, 'success', 3200);
    return true;
  };

  referenceVaultPathIntoFocusedGraph = async (path: string, kind: VaultResourceKind) => {
    if (!vaultIndex) {
      showToast('请先打开 Vault 目录', 'warning', 3000);
      return;
    }
    const reference = resourceReferenceForPath(vaultIndex, path, kind);
    if (!reference) {
      showToast('这个资源已经不在 Vault 中', 'warning', 3200);
      return;
    }
    const pane = focusedPaneState();
    const destination = referenceDestinationTabs(pane)[0];
    if (!destination) {
      showToast('请先打开或创建一个可写图，再放入引用', 'warning', 4000);
      return;
    }
    await placeResourceReferenceInGraph(destination, reference);
  };

  refreshOpenResourceReferences = () => {
    if (!vaultIndex) return;
    const seen = new Set<GraphRuntime>();
    const previewJobs: Promise<void>[] = [];
    for (const runtime of runtimeRegistry.values()) {
      if (seen.has(runtime) || runtime.graph.settings?.sourceMode === 'vault-readonly') continue;
      seen.add(runtime);
      const report = reconcileGraphResourceReferences(runtime.graph, vaultIndex, fileSystemMountPath || vaultIndex.rootPath);
      if (report.repaired > 0 || report.cleaned > 0) scheduleSaveForRuntime(runtime);
      previewJobs.push(hydrateGraphResourceReferencePreviews(runtime.graph).then(changed => {
        if (changed) refreshRuntimeForReferenceChange(runtime);
      }));
    }
    draw();
    void Promise.all(previewJobs);
  };

  const showReferencePreview = async (sourcePane: PaneState, node: any) => {
    const reference = node?.resourceRef as ResourceReference | undefined;
    if (!reference || !vaultIndex || !fileSystemMountPath) {
      showToast('Vault 尚未连接，暂时无法读取引用', 'warning', 3500);
      return;
    }
    reconcileGraphResourceReferences({ nodes: [node], edges: [], groups: [] }, vaultIndex, fileSystemMountPath);
    if (node._resourceReferenceStatus === 'broken') {
      showToast(`引用目标不存在：${reference.path}`, 'warning', 4200);
      draw();
      return;
    }
    const px = sourcePane.index === PANE_LEFT ? pixi : sourcePane.pixi;
    const simNode = scopedPaneSimulationManager(sourcePane)?.getSim()?.nodes()
      .find((candidate: any) => candidate.id === node.id) || node;
    if (!px || !simNode) return;
    let type = reference.kind as any;
    let content = '';
    if (reference.kind === 'folder') {
      type = 'md';
      content = resourceReferencePreviewMarkdown(reference, vaultIndex);
    } else if (reference.kind === 'markdown') {
      type = 'md';
      const ea = (window as any).electronAPI;
      const raw = await ea?.readFile?.(joinVaultPath(fileSystemMountPath, reference.path));
      if (typeof raw !== 'string') {
        showToast('无法读取 Markdown 原文', 'error', 3500);
        return;
      }
      content = markdownSectionForResourceReference(raw, reference);
    } else if (reference.kind === 'graph') {
      type = 'md';
      const graphFile = vaultGraphFileName(vaultIndex, reference.path);
      const target = graphFile ? await readGraphData(graphFile) : null;
      content = target
        ? [`# ${reference.displayLabel || graphTabLabel(graphFile!)}`, '', `${target.nodes.length} 个节点 · ${target.edges.length} 条线 · ${target.groups.length} 个集合`, '',
          ...target.nodes.slice(0, 36).map((candidate: any) => `- ${candidate.label || candidate.id}`),
          ...(target.nodes.length > 36 ? ['', `另有 ${target.nodes.length - 36} 个节点…`] : [])].join('\n')
        : resourceReferencePreviewMarkdown(reference, vaultIndex);
    } else {
      content = joinVaultPath(fileSystemMountPath, reference.path);
    }
    const displayLabel = node.label || reference.displayLabel || reference.path;
    showMedia(mediaOverlayContainer, node.id, displayLabel, type, content, mediaAccentForNode(node, getTheme(sourcePane.graphTheme)), () => {
      const screen = px.viewport.toScreen(simNode.x, simNode.y);
      const rect = px.app.canvas.getBoundingClientRect();
      return { x: rect.left + screen.x, y: rect.top + screen.y };
    }, () => { px.viewport.pause = true; }, () => { px.viewport.pause = false; }, true, () => {
      manuallyOpenedMediaIds.delete(node.id);
      draw();
    }, 'reader', reference.kind !== 'folder' ? {
      label: '在 Obsidian 中打开',
      onSelect: () => { void openVaultResourceInObsidian(reference.path, reference.block ? `^${reference.block}` : reference.heading); },
    } : undefined, null, vaultReaderEditAction(sourcePane, node));
    manuallyOpenedMediaIds.add(node.id);
    draw();
  };

  const referencedNodeAnchor = (targetGraph: GraphData, reference: ResourceReference): string | null => {
    const target = targetGraph.nodes.find((candidate: any) =>
      (reference.block && candidate.sourceRef?.block === reference.block)
      || (reference.headingPath && candidate.sourceRef?.headingPath === reference.headingPath)
      || (reference.heading?.includes('#') && String(candidate.sourceRef?.headingPath || '').endsWith(reference.heading))
      || (reference.heading && candidate.sourceRef?.heading === reference.heading)
      || (reference.line && candidate.sourceRef?.line === reference.line));
    return target ? String(target.id) : targetGraph.nodes[0] ? String(targetGraph.nodes[0].id) : null;
  };

  const resolveCrossSpaceTarget = async (sourcePane: PaneState, node: any): Promise<CrossSpaceTarget | null> => {
    if (isSpaceReferenceNode(node)) {
      const proxySource = node._localContextProxy;
      const ownerGraph = proxySource?.sourceGraph || paneLoadedTab(sourcePane);
      const ownerData = proxySource ? undefined : paneRuntimeGraph(sourcePane);
      const resolved = await resolveSpaceReferenceTarget(node.spaceRef, ownerGraph, ownerData);
      hydrateSpaceReferenceNode(node, resolved);
      if (resolved.status === 'broken' || resolved.nodes.length === 0) return null;
      const sourceGraph = normalizeSpaceGraphId(node.spaceRef.graph);
      return {
        sourceKey: `nodespace:${sourceGraph.toLocaleLowerCase('zh-CN')}`,
        sourceKind: 'nodespace',
        sourceLabel: resolved.label,
        sourceGraph,
        graph: { nodes: resolved.nodes, edges: resolved.edges, groups: [] },
        anchorNodeId: node.spaceRef.kind === 'node' ? node.spaceRef.nodeId : resolved.nodeIds[0],
      };
    }

    const reference = node?.resourceRef as ResourceReference | undefined;
    if (!reference || !vaultIndex) return null;
    reconcileGraphResourceReferences({ nodes: [node], edges: [], groups: [] }, vaultIndex, fileSystemMountPath || vaultIndex.rootPath);
    if (node._resourceReferenceStatus === 'broken') return null;
    let targetTab = '';
    if (reference.kind === 'folder') targetTab = vaultSpaceTabId(reference.path);
    else if (reference.kind === 'graph') targetTab = vaultGraphFileName(vaultIndex, reference.path) || '';
    else if (reference.kind === 'markdown') targetTab = vaultTabId(reference.path);
    else return null;
    if (!targetTab) return null;
    const targetGraph = await readGraphData(targetTab);
    if (!targetGraph || targetGraph.nodes.length === 0) return null;
    return {
      sourceKey: `vault:${targetTab.toLocaleLowerCase('zh-CN')}`,
      sourceKind: 'vault',
      sourceLabel: reference.displayLabel || graphTabLabel(targetTab),
      sourceGraph: targetTab,
      graph: targetGraph,
      anchorNodeId: referencedNodeAnchor(targetGraph, reference),
    };
  };

  expandCrossSpaceLocalContextForPane = async (pane, nodeId) => {
    if (pane.structureView || pane.activeMode !== 'auto') {
      showToast('跨空间上下文目前只在自动布局的整图中展开', 'info', 3200);
      return;
    }
    const entryNode = scopedPaneGraph(pane).nodes.find(candidate => String(candidate.id) === String(nodeId));
    if (!entryNode || (!isSpaceReferenceNode(entryNode) && !isResourceReferenceNode(entryNode))) {
      showToast('这张卡片没有可展开的空间引用', 'info', 2800);
      return;
    }
    const target = await resolveCrossSpaceTarget(pane, entryNode);
    if (!target) {
      showToast('引用目标不可用，或它不是可以展开为卡片的空间', 'warning', 3800);
      draw();
      return;
    }
    const branch = createCrossSpaceBranch(entryNode, target, LOCAL_CONTEXT_OPTIONS.maxPerStep);
    if (!branch) {
      showToast('引用目标中暂时没有可以展开的内容', 'info', 3000);
      return;
    }
    const previous = pane.localContext;
    let path: string[];
    if (!previous || !previous.members.some(member => member.id === String(entryNode.id))) {
      path = [String(entryNode.id)];
    } else {
      const entryPathIndex = previous.path.indexOf(String(entryNode.id));
      path = entryPathIndex >= 0
        ? previous.path.slice(0, entryPathIndex + 1)
        : [...previous.path, String(entryNode.id)];
    }
    if (path.includes(branch.anchorProxyId)) {
      showToast(`“${branch.sourceLabel}”已经在这条观察路径中`, 'info', 2600);
      return;
    }
    if (path.length + 1 > LOCAL_CONTEXT_OPTIONS.maxDepth) {
      showToast(`已经展开到 ${LOCAL_CONTEXT_OPTIONS.maxDepth} 层；可以先退回一层，再进入另一空间`, 'info', 3400);
      return;
    }
    const branches = [
      ...(pane.localContextProjection?.branches || []).filter(candidate => candidate.id !== branch.id),
      branch,
    ];
    installCrossSpaceProjection(pane, branches);
    const next = buildLocalContext(
      scopedPaneGraph(pane),
      localContextEchoes(pane),
      [...path, branch.anchorProxyId],
      LOCAL_CONTEXT_OPTIONS,
    );
    if (!next) {
      installCrossSpaceProjection(pane, branches.filter(candidate => candidate.id !== branch.id));
      return;
    }
    applyLocalContextState(pane, next, true);
    setTimeout(() => {
      const currentProjection = pane.localContextProjection;
      if (!currentProjection?.branches.some(candidate => candidate.id === branch.id)) return;
      const anchor = currentProjection.graph.nodes.find(candidate => String(candidate.id) === branch.anchorProxyId);
      if (anchor) revealPaneNodes(pane, [anchor], 300);
    }, 300);
    showToast(
      `已在原地展开“${branch.sourceLabel}” · ${branch.proxyNodes.length} 张卡片${branch.omittedCount ? ` · 另 ${branch.omittedCount} 张已收束` : ''}`,
      'success',
      3800,
    );
  };

  const focusEnteredReference = (pane: PaneState, reference: ResourceReference) => {
    if (!reference.heading && !reference.block && !reference.line) return;
    const load = paneGraphLoads.get(pane);
    setTimeout(() => {
      if (paneGraphLoads.get(pane) !== load) return;
      const targetGraph = paneRuntimeGraph(pane);
      const target = targetGraph.nodes.find((candidate: any) =>
        (reference.block && candidate.sourceRef?.block === reference.block)
        || (reference.headingPath && candidate.sourceRef?.headingPath === reference.headingPath)
        || (reference.heading?.includes('#') && String(candidate.sourceRef?.headingPath || '').endsWith(reference.heading))
        || candidate.sourceRef?.heading === reference.heading
        || (reference.line && candidate.sourceRef?.line === reference.line));
      const viewport = panePixi(pane)?.viewport;
      if (!target || !viewport) return;
      pane.selNode = target.id;
      viewport.moveCenter(target.x, target.y);
      draw();
    }, 620);
  };

  const openResourceReferenceTarget = async (sourcePane: PaneState, node: any) => {
    const reference = node?.resourceRef as ResourceReference | undefined;
    if (!reference || !vaultIndex) {
      showToast('Vault 尚未连接，暂时无法进入引用', 'warning', 3500);
      return;
    }
    // Capture before reconciliation/opening can trigger a redraw or auto-layout.
    // Explicit Obsidian-link cards therefore return to the exact visual doorway.
    const entryViewport = panePixi(sourcePane)?.viewport;
    const entryViewportState = entryViewport
      ? { centerX: entryViewport.center.x, centerY: entryViewport.center.y, scale: entryViewport.scale.x }
      : null;
    const entryAnchor = node?._obsidianLinkRole ? captureSpacePortalAnchorForNode(sourcePane, node) : null;
    reconcileGraphResourceReferences({ nodes: [node], edges: [], groups: [] }, vaultIndex, fileSystemMountPath || vaultIndex.rootPath);
    if (node._resourceReferenceStatus === 'broken') {
      showToast(`引用目标不存在：${reference.path}`, 'warning', 4200);
      draw();
      return;
    }
    if (reference.kind === 'image' || reference.kind === 'audio' || reference.kind === 'video' || reference.kind === 'pdf') {
      await showReferencePreview(sourcePane, node);
      return;
    }
    if (blockForTextDraft('进入引用')) return;
    if (focusedPaneIndex !== sourcePane.index) switchFocusedPane(sourcePane.index);
    const originTab = paneLoadedTab(sourcePane);
    let targetTab = '';
    if (reference.kind === 'folder') targetTab = vaultSpaceTabId(reference.path);
    else if (reference.kind === 'graph') targetTab = vaultGraphFileName(vaultIndex, reference.path) || '';
    else targetTab = vaultTabId(reference.path);
    if (!targetTab) {
      showToast('引用目标不在当前图文件夹中', 'warning', 3500);
      return;
    }
    if (originTab === targetTab) {
      showToast('这个引用指向当前图', 'info', 2200);
      return;
    }
    const viewport = panePixi(sourcePane)?.viewport;
    const referenceTransition = node?._obsidianLinkRole
      ? captureVaultReferenceTransition(sourcePane, node, reference, entryAnchor)
      : null;
    const stack = referenceJourneys.get(sourcePane.index) || [];
    const graphPath = [...stack.map(item => item.originTab), originTab];
    if (navigationWouldCycle(graphPath, targetTab)) {
      showToast('这个入口会回到当前进入路径，已阻止循环进入', 'warning', 3500);
      return;
    }
    stack.push({
      originTab,
      originLabel: graphTabLabel(originTab),
      targetTab,
      targetLabel: reference.displayLabel || graphTabLabel(targetTab),
      targetKind: isVaultLocationTabId(targetTab) ? 'vault' : 'graph',
      viewport: entryViewportState || (viewport ? { centerX: viewport.center.x, centerY: viewport.center.y, scale: viewport.scale.x } : null),
      ...(referenceTransition ? { spaceTransition: referenceTransition } : {}),
    });
    referenceJourneys.set(sourcePane.index, stack);
    referenceNavigationInFlight.add(sourcePane.index);
    try {
      await playSpacePortalEntryTransition(sourcePane, referenceTransition, async () => {
        await openTab(targetTab);
        syncVaultSpaceBreadcrumb();
        focusEnteredReference(sourcePane, reference);
      });
    } finally {
      referenceNavigationInFlight.delete(sourcePane.index);
    }
    syncVaultSpaceBreadcrumb();
  };

  returnFromResourceReference = async () => {
    const stack = referenceJourneys.get(focusedPaneIndex) || [];
    const journey = stack.pop();
    if (!journey) return;
    const pane = focusedPaneState();
    if (stack.length > 0) referenceJourneys.set(focusedPaneIndex, stack);
    else referenceJourneys.delete(focusedPaneIndex);
    const restoreViewport = () => {
      if (!journey.viewport) return;
      const viewport = panePixi(pane)?.viewport;
      if (!viewport || paneLoadedTab(pane) !== journey.originTab) return;
      viewport.setZoom(journey.viewport.scale, false);
      viewport.moveCenter(journey.viewport.centerX, journey.viewport.centerY);
      draw();
    };
    const leave = async () => {
      await openTab(journey.originTab);
      syncVaultSpaceBreadcrumb();
      restoreViewport();
    };
    referenceNavigationInFlight.add(focusedPaneIndex);
    try {
      if (journey.spaceTransition) await playSpacePortalReturnTransition(pane, journey.spaceTransition, leave);
      else await leave();
    } finally {
      referenceNavigationInFlight.delete(focusedPaneIndex);
    }
    syncVaultSpaceBreadcrumb();
  };

  const openVaultNodeContent = (sourcePane: PaneState, node: any, editable = false) => {
    if (!node?.mediaType) return;
    const px = sourcePane.index === PANE_LEFT ? pixi : sourcePane.pixi;
    const manager = scopedPaneSimulationManager(sourcePane);
    const simNode = manager?.getSim()?.nodes()?.find((candidate: any) => candidate.id === node.id) || node;
    if (!px || !simNode) return;
    const displayLabel = resolveNodeDisplayLabel(
      node,
      new Map(sourcePane.graph.nodes.map((candidate: any) => [candidate.id, candidate])),
    );
    let displayUrl = node.mediaUrl || '';
    if (displayUrl && /^[A-Z]:[\\/]/.test(displayUrl)) {
      displayUrl = toFileUrl(displayUrl);
    }
    showMedia(mediaOverlayContainer, node.id, displayLabel, node.mediaType, displayUrl, mediaAccentForNode(node, getTheme(sourcePane.graphTheme)), () => {
      const screen = px.viewport.toScreen(simNode.x, simNode.y);
      const rect = px.app.canvas.getBoundingClientRect();
      return { x: rect.left + screen.x, y: rect.top + screen.y };
    }, () => { px.viewport.pause = true; }, () => { px.viewport.pause = false; }, !editable || paneRuntimeGraph(sourcePane).settings?.sourceMode === 'vault-readonly', () => {
      manuallyOpenedMediaIds.delete(node.id);
      draw();
    }, 'reader', node.sourceRef?.path ? {
      label: '在 Obsidian 中打开',
      onSelect: () => { void openVaultResourceInObsidian(node.sourceRef.path, node.sourceRef.block ? `^${node.sourceRef.block}` : node.sourceRef.heading); },
    } : undefined, editable ? mediaTextEditorForPane(sourcePane, node, 'mediaUrl') : null, vaultReaderEditAction(sourcePane, node));
    manuallyOpenedMediaIds.add(node.id);
    draw();
  };

  const openVaultProjectionTarget = async (sourcePane: PaneState, node: any) => {
    const source = node?.sourceRef as VaultSourceRef | undefined;
    if (!source?.path && source?.kind !== 'folder') return;
    if (focusedPaneIndex !== sourcePane.index) switchFocusedPane(sourcePane.index);
    if (source.kind === 'folder') {
      await openTab(vaultSpaceTabId(source.path));
      return;
    }
    if (source.kind === 'graph') {
      const graphFile = vaultIndex ? vaultGraphFileName(vaultIndex, source.path) : null;
      if (!graphFile) {
        showToast('这个图不在当前图文件夹中', 'warning', 3500);
        return;
      }
      await openTab(graphFile);
      return;
    }
    await openTab(vaultTabId(source.path));
  };

  const onContextMenu = (menuPane: PaneState, type: 'blank'|'node'|'edge'|'group', id: string | null, screenX: number, screenY: number) => {
    const items: ContextMenuItem[] = [];
    const { left, top } = appShell.getBoundingClientRect();
    const mx = screenX - left, my = screenY - top;
    const presentMenu = () => {
      if (items.length === 0) return;
      if (type === 'node') {
        const { commands, remaining } = nodeContextActions(items);
        if (commands.length) showContextWheel(appShell, mx, my, commands, remaining, items);
        else showActionWheel(appShell, mx, my, items, { label: '节点操作' });
      } else {
        const label = { blank: '画布操作', edge: '连线操作', group: '分组操作' }[type];
        showActionWheel(appShell, mx, my, items, { label });
      }
    };
    const focusedPane = menuPane;
    const targetPane = menuPane.index === PANE_LEFT ? null : menuPane;
    const isExtra = menuPane.index !== PANE_LEFT;
    const _g = scopedPaneGraph(focusedPane);
    const _runtime = targetPane?.runtime ?? primaryRuntime;
    const _runtimeGraph = _runtime.graph;
    const _px = targetPane?.pixi ?? pixi!;
    const _sm = scopedPaneSimulationManager(focusedPane);
    const projectedNode = type === 'node' && id ? _g.nodes.find(candidate => String(candidate.id) === String(id)) : null;
    const projectedEdge = type === 'edge' && id !== null ? _g.edges[Number(id)] : null;
    if (type === 'blank' && focusedPane.localContext) {
      items.push({ label: focusedPane.localContextProjection ? '跨空间局部视图 · 不修改原图' : '局部视图 · 不修改观察范围', disabled: true });
      if (focusedPane.localContext.path.length > 1) {
        items.push({ label: '退回上一层', action: () => backLocalContextForPane(focusedPane) });
      }
      items.push({ label: '收束并返回整图', action: () => closeLocalContextForPane(focusedPane) });
      presentMenu();
      return;
    }
    if (isCrossSpaceProxyNode(projectedNode) || isCrossSpaceProxyEdge(projectedEdge)) {
      const source = projectedNode?._localContextProxy;
      items.push({
        label: source ? `临时投影 · 来自“${source.sourceLabel}”` : '跨空间临时关系',
        disabled: true,
      });
      if (projectedNode) {
        if (projectedNode.resourceRef?.kind === 'markdown' || projectedNode.sourceRef?.kind === 'markdown') {
          items.push({ label: '编辑 Markdown 原文', action: () => { void openMarkdownSourceEditor(focusedPane, projectedNode); } });
        }
        items.push({ label: '从这里继续观察', action: () => openLocalContextForPane(focusedPane, String(projectedNode.id)) });
        if (isSpaceReferenceNode(projectedNode) || isResourceReferenceNode(projectedNode)) {
          items.push({ label: '在此展开下一空间', action: () => { void expandCrossSpaceLocalContextForPane(focusedPane, String(projectedNode.id)); } });
        }
      }
      if ((focusedPane.localContext?.path.length || 0) > 1) {
        items.push({ label: '退回上一层', action: () => backLocalContextForPane(focusedPane) });
      }
      items.push({ label: '收束局部空间', action: () => closeLocalContextForPane(focusedPane) });
      presentMenu();
      return;
    }
    if ((type === 'node' && isPaneStructureProxyNode(focusedPane.structureView, id))
      || (type === 'edge' && isPaneStructureProxyEdge(focusedPane.structureView, id === null ? null : Number(id)))) {
      items.push({ label: '只读入口（退出内部视图后编辑）', disabled: true });
      items.push({ label: '返回整图', action: () => exitStructureForPane(focusedPane, true) });
      presentMenu();
      return;
    }
    if (_runtimeGraph.settings?.sourceMode === 'vault-readonly') {
      if (type === 'node' && id) {
        const node = _runtimeGraph.nodes.find(candidate => candidate.id === id);
        const source = node?.sourceRef as VaultSourceRef | undefined;
        const reference = source ? createVaultResourceReference(source, vaultIndex) : null;
        const referenceNode = reference ? { ...node, resourceRef: reference, _resourceReferenceStatus: 'ok' } : null;
        const projectionTarget = markdownProjectionTarget(focusedPane, node);
        if (projectionTarget?.kind === 'section') {
          items.push({ label: '修改标题', action: () => { void openMarkdownSourceEditor(focusedPane, node, 'title'); } });
        }
        if (projectionTarget) {
          items.push({ label: '修改内容', action: () => { void openMarkdownSourceEditor(focusedPane, node, 'body'); } });
        }
        if (reference && referenceNode) {
          if (source?.kind === 'markdown') {
            items.push({ label: '编辑原文', action: () => { void openMarkdownSourceEditor(focusedPane, node); } });
          }
          const destinations = referenceDestinationTabs(focusedPane);
          if (destinations.length === 1) {
            items.push({
              label: `放入「${graphTabLabel(destinations[0])}」`,
              action: () => { void placeResourceReferenceInGraph(destinations[0], reference, node); },
            });
          } else if (destinations.length > 1) {
            items.push({
              label: '作为引用放入图',
              children: destinations.map(destination => ({
                label: graphTabLabel(destination),
                action: () => { void placeResourceReferenceInGraph(destination, reference, node); },
              })),
            });
          } else {
            items.push({ label: '先打开一个可写图，才能放入引用', disabled: true });
          }
          items.push({ label: source?.kind === 'folder' ? '预览文件夹' : source?.kind === 'graph' ? '预览图摘要' : '快速预览', action: () => { void showReferencePreview(focusedPane, referenceNode); } });
          if (source?.kind === 'folder' || source?.kind === 'markdown' || source?.kind === 'graph') {
            items.push({ label: source.kind === 'folder' ? '进入文件夹空间' : source.kind === 'graph' ? '打开图空间' : '进入 Markdown 空间', action: () => { void openVaultProjectionTarget(focusedPane, node); } });
          }
        } else if (node?.mediaType) {
          items.push({ label: node.mediaType === 'md' ? '阅读全文/小节' : '打开媒体', action: () => openVaultNodeContent(focusedPane, node) });
        }
        if (source?.kind === 'markdown') {
          items.push({ label: '在 Obsidian 中打开原文', action: () => { void openVaultResourceInObsidian(source.path, source.block ? `^${source.block}` : source.heading); } });
        }
        if (!projectionTarget) items.push({ label: '由 Vault 原文生成', disabled: true });
      } else {
        items.push({ label: '关系来自 Markdown 原文', disabled: true });
      }
      presentMenu();
      return;
    }
    const _getSim = () => _sm?.getSim();
    const _saveUndo = () => (targetPane?.undoManager ?? undoManager).pushSnapshot(_runtimeGraph);
    const _initSim = () => _sm.initSim();
    if (type === 'blank') {
      if (focusedPane.structureView) {
        items.push({ label: '返回整图', action: () => exitStructureForPane(focusedPane, true) });
        presentMenu();
        return;
      }
      // 复制框选节点
      if (sharedState.selectedNodeIds.length >= 1) {
        const selectedIds = [...sharedState.selectedNodeIds];
        const destinations = compositionDestinationTabs(focusedPane);
        if (destinations.length > 0) {
          items.push({
            label: `共享所选到其他空间 (${selectedIds.length})`,
            children: destinations.map(destination => ({
              label: graphTabLabel(destination),
              action: () => { void shareNodesToSpace(focusedPane, selectedIds, destination); },
            })),
          });
          items.push({
            label: `将所选作为整体入口 (${selectedIds.length})`,
            children: destinations.map(destination => ({
              label: graphTabLabel(destination),
              action: () => { void placeFragmentPortal(focusedPane, selectedIds, destination); },
            })),
          });
        }
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
      const spaceDestinations = compositionDestinationTabs(focusedPane);
      if (spaceDestinations.length > 0) {
        items.push({
          label: '将当前空间作为入口',
          children: spaceDestinations.map(destination => ({
            label: graphTabLabel(destination),
            action: () => { void placeWholeSpacePortal(focusedPane, destination); },
          })),
        });
      }
      // 粘贴剪贴板节点
      if (sharedState.nodeClipboard && sharedState.nodeClipboard.nodes.length > 0) {
        items.push({
          id: 'paste-nodes',
          label: `粘贴 (${sharedState.nodeClipboard.nodes.length} 节点)`,
          action: () => {
            if (!sharedState.nodeClipboard || !canMutateCanvasPane(focusedPane) || paneRuntimeGraph(focusedPane) !== _runtimeGraph) return;
            const center = _px?.viewport?.center ?? { x: 0, y: 0 };
            try {
              const copy = prepareGraphCopy(_runtimeGraph, sharedState.nodeClipboard, center);
              if (commitCreatedPaneNodes(focusedPane, _runtimeGraph, copy.nodes, null, copy.edges))
                showToast(`已粘贴 ${copy.nodes.length} 个节点${copy.edges.length ? `及 ${copy.edges.length} 条边` : ''}`, 'success');
            } catch (error) {
              console.warn('[nodespace] Paste:', error);
              showToast('无法粘贴，请重新复制节点后再试', 'info');
            }
          },
        });
      }
      items.push({
        label: '新建节点',
        icon: 'child',
        action: () => {
          const center = _px?.viewport?.center ?? { x: 0, y: 0 };
          const cx = center.x, cy = center.y;
          const node = { id: createNodeId(_runtimeGraph.nodes), label: '新记录', headingLevel: 6, tags: [], x: cx, y: cy, _isNew: true };
          if (commitCreatedPaneNodes(focusedPane, _runtimeGraph, [node], null)) beginNodeTitleEditForPane(focusedPane, node.id, true);
        },
      });
    } else if (type === 'node' && id) {
      const node = _g.nodes.find(n => n.id === id);
      if (node && canMutateCanvasPane(focusedPane)) {
        items.push({ id: 'edit-note', label: '修改内容', icon: 'edit', action: () => beginNodeNoteEditForPane(focusedPane, id) });
      }
      if (node && focusedPane.activeMode === 'auto' && !focusedPane.structureView && !isStructureNode(node)) {
        const inCurrentContext = focusedPane.localContext?.members.some(member => member.id === id) ?? false;
        items.push({
          label: focusedPane.localContext
            ? inCurrentContext ? '从这里继续展开上下文' : '以此为新的局部起点'
            : '展开局部上下文',
          action: () => openLocalContextForPane(focusedPane, id),
        });
        if (focusedPane.localContext) {
          items.push({ label: '收束局部空间', action: () => closeLocalContextForPane(focusedPane) });
          items.push({ separator: true });
        }
      }
      const spaceReference = isSpaceReferenceNode(node) ? node.spaceRef : null;
      if (spaceReference && node) {
        if (node._spaceReferenceStatus === 'broken') {
          items.push({ label: '入口失效 · 来源已不存在', disabled: true });
        }
        items.push({ label: spaceReference.kind === 'node' ? '预览共享内容' : '预览空间摘要', action: () => { void showSpaceReferencePreview(focusedPane, node); } });
        if (focusedPane.activeMode === 'auto' && !focusedPane.structureView) {
          items.push({ label: '在此展开目标上下文', action: () => { void expandCrossSpaceLocalContextForPane(focusedPane, id); } });
        }
        items.push({ label: spaceReference.kind === 'node' ? '进入本体' : spaceReference.kind === 'fragment' ? '进入来源并聚焦片段' : '进入空间', action: () => { void openSpaceReferenceTarget(focusedPane, node); } });
        const destinations = compositionDestinationTabs(focusedPane);
        if (destinations.length > 0) {
          items.push({
            label: '将这个入口放入其他空间',
            children: destinations.map(destination => ({
              label: graphTabLabel(destination),
              action: () => { void placeSpaceReferencesInGraph(destination, [{ reference: { ...spaceReference }, source: node }]); },
            })),
          });
        }
        if (focusedPane.activeMode === 'auto' && !focusedPane.structureView) {
          const visibleAsNode = node._semanticCard?.form === 'node';
          items.push({
            label: visibleAsNode ? '展开为入口卡片' : '收束为入口节点',
            action: () => {
              const forms = { ...(_runtimeGraph.settings?.semanticCardForms || {}), [id]: visibleAsNode ? 'card' as const : 'node' as const };
              _runtimeGraph.settings = { ...(_runtimeGraph.settings ?? DEFAULT_SETTINGS), semanticCardForms: forms };
              scheduleSaveForRuntime(_runtime);
              activateSemanticLayoutForPane(focusedPane, true);
            },
          });
        }
        items.push({ separator: true });
        items.push({ label: '从当前空间移除', action: () => { deleteNodesForPane(focusedPane, [id]); } });
        presentMenu();
        return;
      }
      const resourceReference = isResourceReferenceNode(node) ? node.resourceRef : null;
      const isMedia = !!node?.mediaType && !resourceReference;
      const moreItems: ContextMenuItem[] = [];
      const addItem = (item: ContextMenuItem, highFrequency = false) => {
        if (isMedia && !highFrequency) moreItems.push(item); else items.push(item);
      };

      if (resourceReference) {
        if (node._resourceReferenceStatus === 'broken') {
          items.push({ label: `引用失效 · ${resourceReference.path}`, disabled: true });
          items.push({ label: '重新扫描并尝试修复', action: () => { void refreshVaultIndex(); } });
        }
        if (resourceReference.kind === 'markdown') {
          items.push({ label: '编辑 Markdown 原文', action: () => { void openMarkdownSourceEditor(focusedPane, node); } });
        }
        items.push({ label: '快速预览', action: () => { void showReferencePreview(focusedPane, node); } });
        if (focusedPane.activeMode === 'auto'
          && !focusedPane.structureView
          && (resourceReference.kind === 'folder' || resourceReference.kind === 'markdown' || resourceReference.kind === 'graph')) {
          items.push({ label: '在此展开目标上下文', action: () => { void expandCrossSpaceLocalContextForPane(focusedPane, id); } });
        }
        if (resourceReference.kind !== 'image' && resourceReference.kind !== 'audio'
          && resourceReference.kind !== 'video' && resourceReference.kind !== 'pdf') {
          items.push({ label: '进入引用', action: () => { void openResourceReferenceTarget(focusedPane, node); } });
        }
        if (resourceReference.kind !== 'folder') {
          items.push({ label: '在 Obsidian 中打开原文', action: () => {
            void openVaultResourceInObsidian(resourceReference.path, resourceReference.block ? `^${resourceReference.block}` : resourceReference.heading);
          } });
        }
      }
      const nodeShareDestinations = compositionDestinationTabs(focusedPane);
      if (node && nodeShareDestinations.length > 0) {
        addItem({
          label: '共享到其他空间',
          children: nodeShareDestinations.map(destination => ({
            label: graphTabLabel(destination),
            action: () => { void shareNodesToSpace(focusedPane, [id], destination); },
          })),
        }, true);
      }
      addItem({ label: '重命名', icon: 'edit', action: () => beginNodeTitleEditForPane(focusedPane, id) }, true);
      addItem({ label: '编辑属性', action: () => { fillNode(id); } }, true);
      const hlNode = _g.nodes.find(n => n.id === id);
      if (hlNode && !isStructureNode(hlNode)) {
        addItem({ label: '新建子节点', action: () => { createChildNodeForPane(id, targetPane); } }, true);
        const headingLevel = Math.max(1, Math.min(6, hlNode.headingLevel || 6));
        addItem({ label: '提升层级', disabled: headingLevel <= 1, action: () => { changeFocusedHeading(-1, id); } }, true);
        addItem({ label: '降低层级', disabled: headingLevel >= 6, action: () => { changeFocusedHeading(1, id); } }, true);
      }
      if (hlNode?.hyperlink) {
        addItem({ label: '打开链接', action: () => { window.open(hlNode.hyperlink!, '_blank'); } });
      }
      // 框选多个普通节点时可直接收束为结构
      if (sharedState.selectedNodeIds.length >= 2) {
        const ids = sharedState.selectedNodeIds;
        const destinations = compositionDestinationTabs(focusedPane);
        if (destinations.length > 0) {
          items.unshift({
            label: `将所选作为整体入口 (${ids.length})`,
            children: destinations.map(destination => ({
              label: graphTabLabel(destination),
              action: () => { void placeFragmentPortal(focusedPane, [...ids], destination); },
            })),
          });
          items.unshift({
            label: `共享所选到其他空间 (${ids.length})`,
            children: destinations.map(destination => ({
              label: graphTabLabel(destination),
              action: () => { void shareNodesToSpace(focusedPane, [...ids], destination); },
            })),
          });
        }
        const structureEligible = ids.every(nid => {
          const selected = _g.nodes.find(n => n.id === nid);
          return selected && !isStructureNode(selected) && !selected.structureParentId;
        });
        if (structureEligible) {
          items.unshift({
            label: `收束为结构 (${ids.length})`,
            action: () => { void createStructureForPane(targetPane ?? pane0, targetPane?.runtime ?? primaryRuntime, [...ids]); },
          });
        }
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
      addItem({ label: '创建副本', action: () => {
        duplicateNodeForPane(focusedPane, id, _runtimeGraph);
      }});
      if (!resourceReference && node?.mediaType && isExpanded(id) && hoveredMediaId !== id) {
        items.push({ label: '收起', action: () => { hideMedia(id); manuallyOpenedMediaIds.delete(id); draw(); } });
      } else if (!resourceReference && node?.mediaType) {
        // 悬停临时展开的先收起，再显示"打开"
        if (hoveredMediaId === id) { hideMedia(id); hoveredMediaId = ''; }
        items.push({ label: '打开', action: () => {
          const n = _g.nodes.find(n => n.id === id)!;
          let displayUrl = n.mediaUrl || '';
          if (displayUrl && /^[A-Z]:[\\/]/.test(displayUrl)) {
            displayUrl = toFileUrl(displayUrl);
          }
          showMedia(mediaOverlayContainer, id, n.label || n.id, n.mediaType, displayUrl, mediaAccentForNode(n, getTheme(focusedPane.graphTheme)), () => {
            const sp = _px.viewport.toScreen(n.x, n.y);
            const rect = _px.app.canvas.getBoundingClientRect();
            return { x: rect.left + sp.x, y: rect.top + sp.y };
          }, () => { _px.viewport.pause = true; }, () => { _px.viewport.pause = false; }, false, () => {
            manuallyOpenedMediaIds.delete(id);
            draw();
          }, 'reader', undefined, mediaTextEditorForPane(focusedPane, n, 'mediaUrl'));
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
      if (!resourceReference && !node?.mediaType && node?.note?.trim()) {
        items.push({ label: '打开内容', action: () => {
          const n = _g.nodes.find(n => n.id === id)!;
          showMedia(mediaOverlayContainer, id, n.label || n.id, 'md', n.note || '', mediaAccentForNode(n, getTheme(focusedPane.graphTheme)), () => {
            const sp = _px.viewport.toScreen(n.x, n.y);
            const rect = _px.app.canvas.getBoundingClientRect();
            return { x: rect.left + sp.x, y: rect.top + sp.y };
          }, () => { _px.viewport.pause = true; }, () => { _px.viewport.pause = false; }, false, () => {
            manuallyOpenedMediaIds.delete(id);
            draw();
          }, 'reader', undefined, mediaTextEditorForPane(focusedPane, n, 'note'));
          manuallyOpenedMediaIds.add(id);
          draw();
        }});
      }
      const pinTarget = _runtimeGraph.nodes.find(n => String(n.id) === String(id));
      if (pinTarget) {
        const fixed = Boolean(pinTarget.fixed);
        addItem({
          label: fixed ? '解除固定' : '固定',
          action: () => {
            if (_runtimeGraph.nodes.includes(pinTarget)) setPaneNodesFixed(focusedPane, [id], !fixed, _g);
          },
        });
      }
      const nodeForCollapse = _g.nodes.find(n => n.id === id);
      if (nodeForCollapse && focusedPane.activeMode === 'auto' && !focusedPane.structureView) {
        const visibleAsNode = nodeForCollapse._semanticCard?.form === 'node';
        const mapMode = (_runtimeGraph.settings?.semanticCardDensity ?? DEFAULT_SEMANTIC_CARD_DENSITY) === 'nodes';
        const hasManualForm = Object.prototype.hasOwnProperty.call(_runtimeGraph.settings?.semanticCardForms || {}, id);
        if (mapMode) {
          addItem({ label: '节点视图：全部收束', disabled: true });
        } else {
          addItem({
            label: visibleAsNode ? '展开为卡片' : '收束为节点',
            action: () => {
              const forms = { ...(_runtimeGraph.settings?.semanticCardForms || {}) };
              forms[id] = visibleAsNode ? 'card' : 'node';
              _runtimeGraph.settings = {
                ...(_runtimeGraph.settings ?? DEFAULT_SETTINGS),
                semanticCardForms: forms,
              };
              if (targetPane) scheduleSaveForPane(targetPane); else scheduleSave();
              activateSemanticLayoutForPane(focusedPane, true);
              showToast(visibleAsNode ? '已展开为卡片' : '已收束为节点', 'info', 1600);
            },
          });
        }
        if (hasManualForm) {
          addItem({
            label: mapMode ? '清除形态偏好' : '交给自适应',
            action: () => {
              const forms = { ...(_runtimeGraph.settings?.semanticCardForms || {}) };
              delete forms[id];
              _runtimeGraph.settings = {
                ...(_runtimeGraph.settings ?? DEFAULT_SETTINGS),
                semanticCardForms: forms,
              };
              if (targetPane) scheduleSaveForPane(targetPane); else scheduleSave();
              activateSemanticLayoutForPane(focusedPane, true);
              showToast(mapMode ? '已清除此节点的形态偏好' : '此节点已交回自适应镜头', 'info', 1800);
            },
          });
        }
      }
      if (isStructureNode(nodeForCollapse)) {
        const updateStructure = (collapsed: boolean) => {
          if (collapsed && coordinateLayoutModes.has(targetPane?.activeMode ?? activeMode)) {
            showToast('请先退出卡片或分类布局，再收束结构', 'warning', 3000);
            return;
          }
          _saveUndo();
          clearPaneStructureBoundaries(focusedPane);
          setStructureCollapsed(_g, id, collapsed);
          reinitializeRuntimeViews(targetPane?.runtime ?? primaryRuntime);
          if (targetPane) scheduleSaveForPane(targetPane); else scheduleSave();
          draw();
        };
        addItem({ label: '进入结构', action: () => enterStructureForPane(focusedPane, id) });
        addItem({
          label: nodeForCollapse.structure.collapsed ? `展开结构 (${nodeForCollapse.structure.memberIds.length})` : '收束结构',
          action: () => updateStructure(!nodeForCollapse.structure.collapsed),
        });
        addItem({ label: '解散结构', action: () => {
          const directEdges = getDirectStructureEdges(_runtimeGraph, id);
          if (!canDissolveStructure(_runtimeGraph, id)) {
            if (directEdges.length > 0) {
              showToast(`请先删除或改接 ${directEdges.length} 条结构整体关系`, 'warning', 4500);
            }
            return;
          }
          _saveUndo();
          dissolveStructureNode(_runtimeGraph, id);
          reinitializeRuntimeViews(targetPane?.runtime ?? primaryRuntime);
          if (targetPane) scheduleSaveForPane(targetPane); else scheduleSave();
          clearEd();
          draw();
        }});
      } else {
        const membershipMenuEnabled = !focusedPane.structureView
          && !focusedPane.textViewActive
          && !_runtime.textEditActive
          && !coordinateLayoutModes.has(focusedPane.activeMode)
          && !isPaneStructureProxyNode(focusedPane.structureView, id);
        if (membershipMenuEnabled && nodeForCollapse) {
          const ownerId = typeof nodeForCollapse.structureParentId === 'string' ? nodeForCollapse.structureParentId : null;
          const owner = ownerId
            ? _runtimeGraph.nodes.find(candidate => candidate.id === ownerId && isStructureNode(candidate))
            : null;
          if (owner && owner.structure.memberIds.includes(id)) {
            addItem({
              label: `移出「${owner.label || owner.id}」`,
              action: () => { void applyStructureMembershipTransaction(_runtime, { action: 'remove', structureId: owner.id, nodeId: id }); },
            });
          } else if (!ownerId) {
            const expandedStructures = getExpandedStructureBoundaryModels(_runtimeGraph);
            if (expandedStructures.length > 0) {
              addItem({
                label: '加入展开结构',
                children: expandedStructures.map(model => ({
                  label: model.label,
                  action: () => { void applyStructureMembershipTransaction(_runtime, { action: 'add', structureId: model.structureId, nodeId: id }); },
                })),
              });
            }
          }
        }

        if (nodeForCollapse && !focusedPane.localContextProjection) {
          const actions = getHierarchyFoldActions(_g, id);
          const labels = {
            collapse: '折叠一级', collapseAll: '逐级折叠', expand: '展开一级', expandAll: '全部展开',
          };
          for (const action of Object.keys(labels) as HierarchyFoldAction[]) {
            if (!actions.has(action)) continue;
            addItem({
              label: labels[action],
              action: () => applyHierarchyFoldForPane(focusedPane, _runtime, _g, id, action),
            });
          }
        }
      }
      addItem({ label: '连线', action: () => {
        if (targetPane) {
          targetPane.linkMode = true;
          targetPane.linkSrc = id;
          targetPane.linkCursorX = 0;
          targetPane.linkCursorY = 0;
          clearLinkPreview(targetPane);
        } else {
          linkMode = true;
          linkSrc = id;
          linkCursorX = 0;
          linkCursorY = 0;
          clearLinkPreview(pane0);
        }
        draw();
        syncFocusedCommands();
      } });
      items.push({ label: '删除', icon: 'delete', destructive: true, action: () => { deleteNodesForPane(focusedPane, [id]); } });
      // 多媒体节点：其余操作收入"更多"子菜单
      if (isMedia && moreItems.length > 0) {
        items.push({ label: '更多', children: moreItems, action: () => {} });
      }
      const highFrequencyLabels = new Set(['快速预览', '进入引用', '重命名', '编辑属性', '新建子节点', '提升层级', '降低层级', '打开链接']);
      const isStructureAction = (label = '') =>
        label.startsWith('收束为结构') || label.startsWith('展开结构') || label.startsWith('移出「') || label === '加入展开结构' || label === '进入结构' || label === '收束结构' ||
        label === '解散结构' || label === '展开一级' || label === '全部展开' ||
        label === '折叠一级' || label === '逐级折叠' || label === '连线';
      const highFrequencyItems = items.filter(item => highFrequencyLabels.has(item.label ?? ''));
      const structureActionItems = items.filter(item => isStructureAction(item.label));
      const middleItems = items.filter(item =>
        !highFrequencyLabels.has(item.label ?? '') && !isStructureAction(item.label) && item.label !== '删除');
      const deleteItem = items.find(item => item.label === '删除');
      items.splice(0, items.length, ...highFrequencyItems);
      if (highFrequencyItems.length && structureActionItems.length) items.push({ separator: true });
      items.push(...structureActionItems);
      if ((highFrequencyItems.length || structureActionItems.length) && middleItems.length) items.push({ separator: true });
      items.push(...middleItems);
      if (deleteItem) {
        if (items.length) items.push({ separator: true });
        items.push(deleteItem);
      }
    } else if (type === 'edge' && id !== null) {
      const projectedIndex = parseInt(id);
      const originalIndex = originalEdgeIndexForPane(focusedPane, projectedIndex);
      if (originalIndex === null) {
        items.push({ label: '只读入口（退出内部视图后编辑）', disabled: true });
        items.push({ label: '返回整图', action: () => exitStructureForPane(focusedPane, true) });
      } else {
        items.push({ label: '编辑', icon: 'edit', action: () => { fillEdge(originalIndex); } });
        items.push({ label: '交换方向', icon: 'swap', action: () => {
          const edge = _runtimeGraph.edges[originalIndex];
          if (!edge) return;
          _saveUndo();
          [edge.source, edge.target] = [edge.target, edge.source];
          reinitializeRuntimeViews(targetPane?.runtime ?? primaryRuntime);
          if (targetPane) scheduleSaveForPane(targetPane); else scheduleSave();
          fillEdge(originalIndex);
          draw();
        } });
        items.push({ label: '删除', icon: 'delete', destructive: true, action: () => { deleteEdgesForPane(focusedPane, [projectedIndex]); } });
      }
    } else if (type === 'group' && id) {
      items.push({ label: '编辑', icon: 'edit', action: () => { fillGroup(id); } });
    }
    presentMenu();
  };

  const handleLinkTap = (x: number, y: number, pi?: PaneState): boolean => {
    const lm = pi ? pi.linkMode : linkMode;
    const ls = pi ? pi.linkSrc : linkSrc;
    if (!lm || !ls) return false;
    const activePane = pi ?? pane0 as unknown as PaneState;
    if (activePane.structureView) {
      showToast('结构内部视图暂不支持创建关系', 'warning', 3000);
      finishLinkMode(pi);
      return true;
    }
    const sim = pi ? scopedPaneSimulationManager(pi).getSim() : scopedPaneSimulationManager(pane0 as unknown as PaneState).getSim();
    const nodes = (sim?.nodes() || []).filter((node: any) => !activePane.structureBoundaryShapes.has(node.id));
    const g = pi ? paneRuntimeGraph(pi) : graph;
    const ne = pi ? pi.nodeExpand : nodeExpand;
    const finishCurrentLinkMode = () => finishLinkMode(pi);
    const n = nodes.find((nd: any) => nodeContainsPoint(nd, x, y, ne));
    if (n) {
      if (ls === n.id) { finishCurrentLinkMode(); return true; }
      if (g.edges.some(e => (typeof e.source === "object" ? e.source.id : e.source) === ls && (typeof e.target === "object" ? e.target.id : e.target) === n.id)) { finishCurrentLinkMode(); return true; }
      saveUndo(); g.edges.push({ source: ls, target: n.id, label: '', color: '#BFBFBF', arrow: pi?.defArrow ?? defArrow, _createdAt: performance.now() });
      if (pi) scheduleSaveForPane(pi); else scheduleSave();
      if (sim) {
        const validEdges = g.edges.filter(e => (e.lineStyle || 'solid') === 'solid' && !(e as any)._conflict && !(e as any)._dyingAt);
        const ld = pi ? pi.linkDist : linkDist;
        const lstr = pi ? pi.linkStr : linkStr;
        sim.force("link", d3.forceLink(validEdges).id((d: any) => d.id).distance(ld).strength(lstr));
        sim.alpha(0.3).restart();
        setTimeout(() => sim.alphaTarget(0), 3000);
      }
      draw();
    } else {
      createChildNodeForPane(ls, pi?.index === PANE_LEFT ? null : pi, { x, y });
    }
    finishCurrentLinkMode();
    return true;
  };

  // --- 事件绑定将在 pixiReady 后进行 ---

  // --- 启动（等待 PixiJS 就绪）---
  // 文件拖拽到画布：自动创建多媒体节点
  appShell.addEventListener('dragover', (e) => { e.preventDefault(); });
  appShell.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (!files.length) return;
    const owner = allPaneOwners().find(pane => panePixi(pane)?.app.canvas === e.target);
    if (!owner) return;
    const px = panePixi(owner)!;
    const rect = px.app.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const point = px.viewport.toWorld((e.clientX - rect.left) * px.viewport.screenWidth / rect.width,
      (e.clientY - rect.top) * px.viewport.screenHeight / rect.height);
    const session = captureMediaImport(owner, point);
    if (!session) return;
    switchFocusedPane(owner.index);
    void importBrowserFiles(session, files);
  });

  await pixiReady;
  // Pane 1 事件在首次开启分屏时绑定。
  // 不在这里绑定，因为 pixi1 尚未初始化
  // Pane 1 点击聚焦
  // 点击任意分屏 → 聚焦
  paneContainers.forEach((pc, i) => {
    pc.addEventListener('pointerdown', () => {
      if (focusedPaneIndex !== i) switchFocusedPane(i);
    });
  });

  const darkNodeGlow = new BlurFilter({ strength: 14, quality: 4 });
  const lightNodeGlow = new BlurFilter({ strength: 10, quality: 4 });
  // 标记图加载完成后才允许 viewport 事件触发绘制
  let readyToDraw = false;

  // viewport 缩放/平移时触发刷新（用于标签显隐等）
  pixi!.viewport.on('moved', () => { scheduleVaultViewportSave(pane0 as unknown as PaneState); if (readyToDraw) drawGridOnly(); });
  pixi!.viewport.on('zoomed-end', () => { scheduleVaultViewportSave(pane0 as unknown as PaneState); if (readyToDraw) { draw(); refreshSemanticLensForPane(pane0); } });

  const eventsCanvas = pixi!.app.canvas as any;
  // Pane 0 事件
  const bindPaneEvents = (pi: PaneState, px: PixiLayers, _origSM: any, sprites: Map<any,any>, lastDragId: { v: string | null }) => {
    const getSM = () => scopedPaneSimulationManager(pi) || _origSM;
    const runtimeGraph = () => paneRuntimeGraph(pi);
    const effectiveGraph = paneGraphFacade(pi, scopedPaneGraph);
    const isVaultProjection = () => runtimeGraph().settings?.sourceMode === 'vault-readonly';
    const isSpaceOccurrence = (id: string | null | undefined) => Boolean(id && isSpaceReferenceNode(runtimeGraph().nodes.find(node => node.id === id)));
    const effectiveNode = (id: string | null | undefined) => id ? scopedPaneGraph(pi).nodes.find(node => String(node.id) === String(id)) : null;
    const effectiveEdge = (index: number | null | undefined) => index === null || index === undefined ? null : scopedPaneGraph(pi).edges[index];
    const isReadOnlyNode = (id: string | null | undefined) => isVaultProjection()
      || isPaneStructureProxyNode(pi.structureView, id)
      || isCrossSpaceProxyNode(effectiveNode(id));
    const isReadOnlyEdge = (index: number | null | undefined) => isVaultProjection()
      || isPaneStructureProxyEdge(pi.structureView, index)
      || isCrossSpaceProxyEdge(effectiveEdge(index));
    const getOriginalEdgeIndex = (index: number) => getPaneOriginalEdgeIndex(pi.structureView, index);
    const fillProjectedEdge = (index: number) => {
      const originalIndex = getOriginalEdgeIndex(index);
      if (originalIndex === null) {
        showReadOnlyHint('edge');
        return;
      }
      fillEdge(originalIndex);
    };
    const showReadOnlyHint = (kind: 'node' | 'edge') => showToast(
      isVaultProjection()
        ? (kind === 'node'
          ? '这是 Vault 原文的投影卡片，右键可查看编辑与阅读操作'
          : runtimeGraph().edges[pi.selEdge ?? -1]?._obsidianLink
            ? '这是 Obsidian 原文中的显式链接；它比算法观察到的相似关系更权威'
            : '这条关系来自 Markdown 标题层级')
        : pi.localContextProjection
          ? (kind === 'node' ? '这是另一空间的临时投影；原内容没有被复制或修改' : '这是跨空间的临时关系；收束后会自动释放')
          : (kind === 'node' ? '这是结构外部的只读入口；请退出内部视图后编辑' : '这是只读代理关系；原关系不会在内部视图中修改'),
      'info',
      3500,
    );
    return {
    graph: effectiveGraph,
    isInteractionEnabled: () => (pi.index === PANE_LEFT ? primaryRuntime : pi.runtime).canInteract(pi.index === PANE_LEFT ? pane0 : pi),
    onInteractionBlocked: () => showToast('此图正在另一窗格的文字视图中编辑', 'warning', 3500),
    getSelNode: () => pi.selNode, setSelNode: (v: string | null) => { pi.selNode = v; syncFocusedCommands(); },
    getSelEdge: () => pi.selEdge, setSelEdge: (v: number | null) => { pi.selEdge = v; },
    getSelGroup: () => pi.selGroup, setSelGroup: (v: string | null) => { pi.selGroup = v; },
    getSimulation: () => getSM().getSim(),
    getVisibleNodes: () => coordinateLayoutModes.has(pi.activeMode)
      ? getStructureProjection(scopedPaneGraph(pi)).nodes
      : getSM().getSim()?.nodes?.() ?? [],
    getTransform: () => px ? { k: px.viewport.scale.x, x: px.viewport.x, y: px.viewport.y } : { k: 1, x: 0, y: 0 },
    viewport: px.viewport,
    getCanvas: () => px.app.canvas as any,
    captureMagnifierRegion: (region: Parameters<PixiLayers['captureMagnifierRegion']>[0]) => px.captureMagnifierRegion(region),
    getNodeExpand: () => pi.nodeExpand, getLineExpand: () => pi.lineExpand,
    getNodeTitleBounds: (node: any, x?: number, y?: number) => renderedNodeTitleHitBounds(sprites.get(node.id), px.viewport, x, y),
    getSemanticEdgeRouting: () => pi.activeMode === 'auto' || pi.activeMode === 'tree',
    getDraggingNode: () => pi.draggingNode, setDraggingNode: (v: any) => { pi.draggingNode = v; },
    getWasDragged: () => pi.wasDragged, setWasDragged: (v: boolean) => { pi.wasDragged = v; },
    draw, onContextMenu: (type: 'blank'|'node'|'edge'|'group', id: string | null, x: number, y: number) => onContextMenu(pi, type, id, x, y),
    isReadOnlyNode,
    isReadOnlyEdge,
    getOriginalEdgeIndex,
    deleteNodes: (ids: string[]) => deleteNodesForPane(pi, ids),
    deleteEdges: (indexes: number[]) => deleteEdgesForPane(pi, indexes),
    onReadOnlySelection: showReadOnlyHint,
    canDoubleClickReadOnlyNode: (id: string) => Boolean(
      (isVaultProjection() && runtimeGraph().nodes.find(node => node.id === id)?.sourceRef)
      || isSpaceReferenceNode(runtimeGraph().nodes.find(node => node.id === id))
      || isCrossSpaceProxyNode(effectiveNode(id)),
    ),
    onNodeTitleTap: (id: string) => {
      if (!isVaultProjection()) return beginNodeTitleEditForPane(pi, id);
      const node = effectiveNode(id);
      if (markdownProjectionTarget(pi, node)?.kind !== 'section') return false;
      void openMarkdownSourceEditor(pi, node, 'title');
      return true;
    },
    beginNodeNoteEdit: (id: string) => noteEditSessionForPane(pi, id),
    onNodeTitleDoubleClick: (id: string) => {
      const node = effectiveNode(id);
      if (!node || isStructureNode(node) || isSpaceReferenceNode(node) || isResourceReferenceNode(node)) return false;
      return beginNodeTitleEditForPane(pi, id);
    },
    onNodeDoubleClick: (id: string) => enterStructureForPane(pi, id),
    isFixedNode: (id: string) => Boolean(runtimeGraph().nodes.find(node => String(node.id) === String(id))?.fixed),
    selectionBox,
    getBoxSelectMode: () => boxSelectMode,
    setBoxSelectMode: (value: boolean) => { boxSelectMode = value; syncFocusedCommands(); },
    registerBoxSelectionReader: (read: () => CanvasBoxSelection) => paneBoxSelection.set(pi, read),
    fixNodes: (ids: string[]) => setPaneNodesFixed(pi, ids, true),
    unfixNodes: (ids: string[]) => setPaneNodesFixed(pi, ids, false),
    appShell, triggerSave: () => scheduleSave(),
    onDragStart: (id: string) => { getSM().setDragNode(id); lastDragId.v = id; dragCount++; appShell.classList.add('is-dragging-node'); },
    onNodeMembershipDragStart: (id: string, x: number, y: number) => beginMembershipDrag(pi, id, x, y),
    onNodeMembershipDragMove: (id: string, x: number, y: number) => moveMembershipDrag(pi, id, x, y),
    onNodeMembershipDragEnd: (id: string, x: number, y: number, cancelled: boolean) => endMembershipDrag(pi, id, x, y, cancelled),
    onDragEnd: () => {
      const draggedId = lastDragId.v;
      const draggedGraphNode = draggedId
        ? runtimeGraph().nodes.find((node: any) => node.id === draggedId)
        : null;
      // In auto mode an ordinary drag is exploratory view state, not graph data.
      // Releasing an unfixed node returns it to the position derived from semantics.
      const returnToSemanticPosition = !!(
        pi.activeMode === 'auto' && draggedGraphNode && !draggedGraphNode.fixed && !pi.structureView
      );
      if ((pi.gridSnapEnabled || pi.partialGridSnap) && draggedId) {
        const sn = getSM().getSim()?.nodes()?.find((n2: any) => n2.id === draggedId);
        if (sn && (pi.gridSnapEnabled || sn.fixed)) {
          const [sx, sy] = snapPosToGrid(sn.x, sn.y, pi.gridSp);
          sn.x = sx; sn.y = sy;
          if (sn.fixed) { sn.fx = sx; sn.fy = sy; }
          if (draggedGraphNode && !pi.structureView && !pi.localContextProjection) {
            draggedGraphNode.x = sx; draggedGraphNode.y = sy;
            if (draggedGraphNode.fixed) { draggedGraphNode.fx = sx; draggedGraphNode.fy = sy; }
          }
        }
      }
      if (draggedId) {
        if (pi.structureView) commitStructureMemberDrag(pi, draggedId);
        else if (!returnToSemanticPosition) scheduleSaveForRuntime(pi.index === PANE_LEFT ? primaryRuntime : pi.runtime);
      }
      lastDragId.v = null;
      getSM().setDragNode(null);
      if (returnToSemanticPosition) activateSemanticLayoutForPane(pi, true);
      dragCount = Math.max(0, dragCount - 1);
      if (dragCount === 0) appShell.classList.remove('is-dragging-node');
    },
    getLinkMode: () => pi.linkMode, getLinkSrc: () => pi.linkSrc,
    onLinkCursorMove: (x: number, y: number) => { pi.linkCursorX = x; pi.linkCursorY = y; if (sharedState.directDraw) sharedState.directDraw(); else draw(); },
    initSim: () => getSM().initSim(),
    clearEd: () => { pi.selNode = null; pi.selEdge = null; pi.selGroup = null; },
    getGridSnapEnabled: () => pi.gridSnapEnabled || pi.partialGridSnap, getGridSp: () => pi.gridSp,
    getHiddenNodeIds: () => sharedState.hiddenNodeIds?.() ?? new Set(),
    isStructureBoundaryNode: (id: string) => pi.structureBoundaryShapes.has(id),
    getStructureBoundaryEndpoints: () => paneStructureBoundaryEndpoints(pi),
    hitStructureBoundary: (x: number, y: number) => hitPaneStructureBoundary(pi, x, y, Math.max(4, pi.lineExpand)),
    onStructureBoundaryHover: (id: string | null) => {
      const nextId = pi.membershipDragSession ? null : id;
      if (pi.hoverStructureId === nextId) return;
      pi.hoverStructureId = nextId;
      draw();
    },
    onStructureBoundaryTap: (id: string) => {
      pi.selNode = id;
      pi.selEdge = null;
      pi.selGroup = null;
      fillNode(id);
      draw();
    },
    createStructure: (ids: string[]) => createStructureForPane(pi, pi.index === PANE_LEFT ? primaryRuntime : pi.runtime, ids),
    setDragScale: (nodeId: string | null, scale: number) => { if (nodeId) { const sprite = sprites.get(nodeId); if (sprite) sprite.container.scale.set(scale); } },
    onTap: (x: number, y: number, nodeId?: string) => {
      if (isVaultProjection()) {
        // Vault cards are source projections. Never let the legacy inspector
        // commit its current (possibly blank) form into their generated nodes.
        clearEd();
        if (nodeId) {
          pi.selNode = nodeId;
          pi.selEdge = null;
          pi.selGroup = null;
          const sourceNode = runtimeGraph().nodes.find(node => node.id === nodeId);
          if (sourceNode?.mediaType) openVaultNodeContent(pi, sourceNode);
          else if (sourceNode?.sourceRef) showToast('双击进入这个文件夹、文档或图空间', 'info', 2600);
          else showReadOnlyHint('node');
        }
        syncFocusedCommands();
        draw();
        return;
      }
      if (nodeId && isReadOnlyNode(nodeId)) {
        pi.selNode = nodeId;
        pi.selEdge = null;
        pi.selGroup = null;
        showReadOnlyHint('node');
        syncFocusedCommands();
        draw();
        return;
      }
      if (nodeId && isSpaceOccurrence(nodeId)) {
        saveCurrent();
        pi.selNode = nodeId;
        pi.selEdge = null;
        pi.selGroup = null;
        clearEd();
        showToast('实时引用的内容由源节点提供；可拖动、连线或删除，双击进入本体编辑', 'info', 3600);
        syncFocusedCommands();
        draw();
        return;
      }
      saveCurrent();
      if (nodeId && !pi.linkMode) {
        pi.selNode = nodeId;
        pi.selEdge = null;
        pi.selGroup = null;
        fillNode(nodeId);
        draw();
        refreshSemanticLensForPane(pi);
        return;
      }
      if (handleLinkTap(x, y, pi)) return;
      if (pi.linkMode && !pi.linkSrc) {
        const ns = (getSM().getSim()?.nodes() || []).filter((node: any) => !pi.structureBoundaryShapes.has(node.id));
        const hit = ns.find((nd: any) => nodeContainsPoint(nd, x, y, pi.nodeExpand));
        if (hit) { pi.linkSrc = hit.id; showToast(`从「${hit.label || hit.id}」连接 · 选节点或点击空白处`, 'info', 2600); return; }
      }
      const nodes = (getSM().getSim()?.nodes() || []).filter((node: any) => !pi.structureBoundaryShapes.has(node.id));
      const n = nodes.find((nd: any) => nodeContainsPoint(nd, x, y, pi.nodeExpand));
      if (n) { pi.selNode = n.id; fillNode(n.id); draw(); refreshSemanticLensForPane(pi); return; }
      const scopedGraph = scopedPaneGraph(pi);
      const edgeIndex = hitTestEdge(
        x,
        y,
        scopedGraph.edges,
        nodes,
        pi.lineExpand,
        pi.activeMode === 'auto' ? { routePoints: semanticEdgePolyline } : undefined,
      );
      if (edgeIndex !== null) {
        pi.selEdge = edgeIndex;
        if (isReadOnlyEdge(edgeIndex)) showReadOnlyHint('edge'); else fillProjectedEdge(edgeIndex);
        draw();
        return;
      }
      for (const g of runtimeGraph().groups) {
        if (g.displayMode === 'none') continue;
        const members = nodes.filter((nd: any) => isNodeInGroup(nd, g));
        if (members.length === 0) continue;
        if (g.displayMode === 'fluid') { for (const m of members) { if ((m.x - x) ** 2 + (m.y - y) ** 2 <= ((m.radius || 9) * (g.fluidRadius || 3)) ** 2) { pi.selGroup = g.id; if (pi.index === PANE_LEFT) fillGroup(g.id); draw(); return; } } continue; }
      }
      pi.selNode = null; pi.selEdge = null; pi.selGroup = null; clearEd(); syncFocusedCommands(); draw(); refreshSemanticLensForPane(pi);
    },
    fillNode,
    fillEdge: fillProjectedEdge,
    fillGroup,
    onMediaHover: (nodeId: string | null) => {
      if (runtimeGraph().settings?.sourceMode === 'vault-readonly') {
        if (hoveredMediaId) hideMedia(hoveredMediaId);
        hoveredMediaId = '';
        return;
      }
      if (nodeId) {
        if (nodeId === hoveredMediaId) return;
        if (manuallyOpenedMediaIds.has(nodeId)) return; // 手动打开的不遮挡
        hideMedia(hoveredMediaId);
        hoveredMediaId = '';
        const gn = runtimeGraph().nodes.find(n => n.id === nodeId);
        if (gn?.mediaType && gn?.mediaUrl) {
          const px = pi.pixi || pixi!;
          const vp = px.viewport;
          const sn = (pi.simManager || simManager)?.getSim()?.nodes()?.find((n: any) => n.id === nodeId);
          if (sn) {
            let displayUrl = gn.mediaUrl;
            if (displayUrl && /^[A-Z]:[\\/]/.test(displayUrl)) {
              displayUrl = toFileUrl(displayUrl);
            }
            showMedia(mediaOverlayContainer, nodeId, gn.label || nodeId, gn.mediaType, displayUrl, mediaAccentForNode(gn, getTheme(pi.graphTheme)), () => {
              const sp = vp.toScreen(sn.x, sn.y);
              const rect = pi.pixi?.app.canvas.getBoundingClientRect() || pixi!.app.canvas.getBoundingClientRect();
              return { x: rect.left + sp.x, y: rect.top + sp.y };
            }, undefined, undefined, runtimeGraph().settings?.sourceMode === 'vault-readonly', undefined, 'preview');
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
    onCreateLinkedNode: (sourceId: string, x: number, y: number, shiftKey?: boolean) => {
      if (pi.structureView || isReadOnlyNode(sourceId)) return;
      switchFocusedPane(pi.index);
      createChildNodeForPane(sourceId, pi.index === PANE_LEFT ? null : pi, { x, y, dashed: shiftKey });
    },
    onCreateEdge: (sourceId: string, targetId: string, shiftKey?: boolean) => {
      if (pi.structureView || isReadOnlyNode(sourceId) || isReadOnlyNode(targetId)) {
        showToast('结构内部视图暂不支持创建关系；只读入口也不能连线', 'warning', 3500);
        return;
      }
      pi.undoManager.pushSnapshot(runtimeGraph());
      const edge: any = { source: sourceId, target: targetId, label: '', color: '#BFBFBF', arrow: pi.defArrow, _createdAt: performance.now() };
      if (shiftKey) edge.lineStyle = 'dash-2';
      runtimeGraph().edges.push(edge);
      scheduleSave();
      const sim = getSM().getSim();
      if (sim) {
        const validEdges = runtimeGraph().edges.filter((e2: any) => (e2.lineStyle || 'solid') === 'solid' && !e2._conflict && !e2._dyingAt);
        sim.force("link", d3.forceLink(validEdges).id((d: any) => d.id).distance(pi.linkDist).strength(pi.linkStr));
        sim.alpha(0.3).restart();
        setTimeout(() => sim.alphaTarget(0), 3000);
      }
      draw();
    },
    // 卡片网格模式标识（供 ui-events 节点拖拽保持 pin 用）
    isCardGridMode: () => pi.activeMode === 'cardgrid' || pi.activeMode === 'category' || pi.activeMode === 'fullcat',
    clampNodeDrag: (id: string, x: number, y: number) => {
      return pi.layout.constrainNodePosition(id, x, y);
    },
  };
};
  const lastDragId0 = { v: _lastDragNodeId };
  bindPane0CanvasEvents(eventsCanvas, bindPaneEvents(
    pane0 as unknown as PaneState,
    pixi!, simManager, nodeSprites, lastDragId0
  ));
  if (pixi1) {
    const p1x = pixi1 as PixiLayers;
    const eventsCanvas1 = p1x.app.canvas as any;
    bindCanvasEvents(pane1, eventsCanvas1, bindPaneEvents(
      pane1, p1x, simManager1, pane1NodeSprites, { v: null }
    ));
  }

  // 清理旧 demo 数据（仅首次迁移）
  localStorage.removeItem('fg-data-demo');
  const DEMO_ENABLED_KEY = 'fg-demo-enabled';
  const getDemoEnabled = () => localStorage.getItem(DEMO_ENABLED_KEY) !== 'false';
  let demoEnabled = getDemoEnabled();

  // Resolve the physical mount before restoring relative graph IDs or local recovery.
  const safDir = safIsAvailable() ? await safRestoreDirectory() : null;
  const ea2 = (window as any).electronAPI;
  if (safDir) {
    fileSystemMountPath = safDir.name;
    mountedStorageScope = `saf:${safDir.path}`;
  } else if (ea2) {
    const config = await ea2.configRead();
    const savedPath = typeof config.folderPath === 'string' ? config.folderPath : '';
    configuredGraphFolderRelative = typeof config.graphFolderRelative === 'string' ? config.graphFolderRelative : null;
    // Restore permission before fs-exists, which is guarded by the selected directories.
    const permission = savedPath ? await ea2.addAllowedDir(savedPath) : null;
    if (savedPath && permission?.ok && await ea2.exists(savedPath)) {
      fileSystemMountPath = savedPath;
      const index = await refreshVaultIndex();
      const root = (graphStorageMountPath || savedPath).replace(/\\/g, '/').replace(/\/+$/, '');
      mountedStorageScope = `electron:${/^(?:[a-z]:|\/\/)/i.test(root) ? root.toLowerCase() : root}`;
      if (index?.isObsidianVault && config.graphFolderRelative !== index.graphRootRelative) {
        await ea2.configWrite({ folderPath: savedPath, graphFolderRelative: index.graphRootRelative });
      }
    }
  } else if (capApp) {
    fileSystemMountPath = 'graphs';
  } else {
    const savedFolder = await loadFolderSelection();
    if (savedFolder && await restoreFolder(savedFolder.handle)) {
      const id = savedFolder.id ?? crypto.randomUUID();
      if (savedFolder.id || await saveFolderHandle(savedFolder.handle, id)) {
        fileSystemMountPath = savedFolder.handle.name;
        mountedStorageScope = `fsa:${id}`;
      }
    }
  }
  await refreshFileTree();
  workbenchHistory = createWorkbenchHistory(localStorage, mountedStorageScope);
  // Capacitor may initialize its file plugin after the initial listing.
  if (capApp && !safDir && _flatTreePaths.length === 0) {
    [500, 1500, 3000, 4500].forEach(delay => setTimeout(() => { void refreshFileTree(); }, delay));
  }

  // A new external mount should not inherit unsaved tabs or seed demo files.
  const eligibleTab = (name: string) => name !== 'demo' && (mountedStorageScope === null
    || _flatTreePaths.includes(name) || graphRecovery(name).hasUnsynced()
    || (isVaultLocationTabId(name) && Boolean(vaultIndex)));
  const restored = restoreTabs();
  const defaultOpen = demoEnabled ? BUILTIN_NAMES.filter(eligibleTab) : [];
  const restoredTabs = restored?.tabs.filter(eligibleTab) ?? [];
  if (restored && restoredTabs.length > 0) {
    openTabs = restoredTabs;
    if (defaultOpen.length) {
      for (let i = defaultOpen.length - 1; i >= 0; i--) {
        const name = defaultOpen[i];
        if (!openTabs.includes(name)) openTabs.unshift(name);
      }
    }
    activeTab = (restored.active && restored.active !== 'demo' && openTabs.includes(restored.active)) ? restored.active : (openTabs[0] || '');
  } else {
    openTabs = defaultOpen.length ? [...defaultOpen] : [_flatTreePaths[0] ?? '未命名.json'];
    activeTab = openTabs[0];
  }
  // 恢复 pane1 标签
  const fallbackFirst = defaultOpen[0] ?? '';
  try {
    const panelKey = (key: string) => localStorage.getItem(workspaceStateKey(key + '-ep0'))
      ?? (mountedStorageScope === null ? localStorage.getItem(key + '-p1') : null);
    const p1tabs = (JSON.parse(panelKey(TABS_KEY) || '[]') as string[]).filter(eligibleTab);
    const p1active = panelKey(ACTIVE_KEY) || fallbackFirst;
    if (p1tabs.length > 0) {
      pane1.openTabs = p1tabs.filter((t: string) => t !== 'demo');
      if (demoEnabled) {
        for (const name of defaultOpen) {
          if (!pane1.openTabs.includes(name)) pane1.openTabs.unshift(name);
        }
      }
      pane1.activeTab = (p1active && p1active !== 'demo' && pane1.openTabs.includes(p1active)) ? p1active : (pane1.openTabs[0] || fallbackFirst);
    } else {
      pane1.openTabs = [...defaultOpen];
      pane1.activeTab = fallbackFirst;
    }
  } catch {
    pane1.openTabs = [...defaultOpen];
    pane1.activeTab = fallbackFirst;
  }
  syncSpaceNavigation();

  // 在 loadGraphData（触发模拟）之前就把原点屏中
  {
    const p = pixi!;
    if (p.app.canvas.clientWidth > 0) {
      p.viewport.position.set(p.app.canvas.clientWidth / 2, p.app.canvas.clientHeight / 2);
    }
  }
  if (activeTab) { try { await loadGraphData(activeTab); } catch (e) { console.error('init load error:', e); } }
  renderModeBar();
  updateGwGh();
  // Pane 1 加载内置图（演示关闭时跳过）
  if (demoEnabled && pane1.activeTab) {
    try {
      const builtin1 = repairGraphCreatedOrders(JSON.parse(JSON.stringify(BUILTIN_GRAPHS[pane1.activeTab] || BUILTIN_GRAPHS[BUILTIN_NAMES[0]])));
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

  let workbenchCoverRevision = 0;
  let workbenchCoverQueue: readonly WorkbenchSpace[] | null = null;
  let loadingWorkbenchCovers = false;
  const loadedWorkbenchCovers = new Set<string>();
  type CoverSnapshot = { cover: WorkbenchCover; palette: WorkbenchCoverPalette };
  const workbenchCoverCache = createWorkbenchCoverCache<CoverSnapshot>();
  const preparedWorkbenchCovers = new Map<string, CoverSnapshot>();
  let workbenchCoverSourceEpoch = 0;
  const invalidateWorkbenchCovers = () => {
    workbenchCoverSourceEpoch++;
    preparedWorkbenchCovers.clear();
    loadedWorkbenchCovers.clear();
  };
  const vaultCoverLinks = new WeakMap<VaultIndex, Map<string, string[]>>();
  const coverFingerprint = (value: string) => {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 0x01000193);
    return `${value.length}:${hash >>> 0}`;
  };
  const vaultCoverVersion = (index: VaultIndex, path: string, resource: VaultResource) => {
    let byPath = vaultCoverLinks.get(index);
    const pathKey = (value: string) => normalizeVaultPath(value).toLocaleLowerCase('zh-CN');
    if (!byPath) {
      const links = new Map<string, string[]>();
      const append = (path: string, details: unknown[]) => {
        const key = pathKey(path);
        let values = links.get(key);
        if (!values) links.set(key, values = []);
        values.push(JSON.stringify(details));
      };
      for (const note of index.notes) {
        for (const link of note.links ?? []) {
          const resolved = resolveObsidianLink(index, note.path, link);
          append(note.path, ['to', resolved.status, resolved.resource?.path, resolved.displayLabel]);
          if (resolved.resource?.kind === 'markdown') {
            append(resolved.resource.path, ['from', note.path, link.line, link.heading, link.sourceHeading, link.block]);
          }
        }
      }
      vaultCoverLinks.set(index, byPath = links);
    }
    return `${resource.size}:${resource.mtime}:${coverFingerprint((byPath.get(pathKey(path)) || []).slice().sort().join('\n'))}`;
  };
  let workbenchOrder: string[] = [];
  let workbenchOrderAdapter: FileAdapter | null = null;
  let workbenchVaultPath: string | null = null;
  let openingGraphFromWall = false;
  const isWorkbenchSpace = (id: string) => Boolean(id) && !isBuiltin(id) && !isVaultLocationTabId(id);
  const workbenchSpace = (id: string): WorkbenchSpace => {
    const separator = id.lastIndexOf('/');
    return { id, title: graphTabLabel(id.slice(separator + 1)), detail: separator >= 0 ? id.slice(0, separator) : undefined };
  };
  const updateWorkbench = () => {
    const pane = focusedPaneState();
    const id = paneLoadedTab(pane);
    const available = new Set(fileTreeAdapter === adapter ? _flatTreePaths.filter(isWorkbenchSpace) : []);
    const retained = workbenchOrderAdapter === adapter ? workbenchOrder.filter(path => available.has(path)) : [];
    workbenchOrderAdapter = adapter;
    const newPaths = [...available].sort((a, b) => a.localeCompare(b));
    workbenchOrder = [...new Set([...retained, ...newPaths])];
    const library = vaultIndex?.isObsidianVault ? vaultIndex : null;
    const wallOptions = { omitGraphIds: available };
    if (!library) workbenchVaultPath = null;
    let folder = library && workbenchVaultPath !== null ? getVaultWallFolder(library, workbenchVaultPath, wallOptions) : null;
    while (library && workbenchVaultPath !== null && !folder) {
      workbenchVaultPath = workbenchVaultPath ? workbenchVaultPath.split('/').slice(0, -1).join('/') : null;
      folder = workbenchVaultPath !== null ? getVaultWallFolder(library, workbenchVaultPath, wallOptions) : null;
    }
    const spaces: WorkbenchSpace[] = folder
      ? folder.entries.map(entry => entry.kind === 'graph'
        ? { id: entry.id, title: entry.title }
        : { id: entry.id, title: entry.title, kind: entry.kind === 'folder' ? 'folder' : 'resource', detail: entry.detail })
      : workbenchOrder.map(workbenchSpace);
    if (!folder && library) spaces.unshift({ id: vaultSpaceTabId(), title: library.name || 'Obsidian 资料库', kind: 'library' });
    if (!folder && !spaces.length && demoEnabled) {
      for (const name of BUILTIN_NAMES) spaces.push({ ...workbenchSpace(name), example: true });
    }
    const current = spaces.find(space => space.id === id) ?? null;
    const { headingColors } = getTheme(pane.graphTheme);
    for (let level = 1; level <= 6; level++) {
      const property = `--ns-wall-h${level}`;
      const color = headingColors?.[level - 1];
      if (color) workbenchHome.element.style.setProperty(property, color);
      else workbenchHome.element.style.removeProperty(property);
    }
    workbenchHome.update({
      current,
      spaces,
      location: folder ? {
        id: vaultSpaceTabId(folder.path), title: folder.title, parentTitle: folder.parentTitle ?? '主界面',
      } : null,
      recoveryAvailable: true,
      showAtStartup: workbenchHistory.showAtStartup,
    });
  };

  const navigateWorkbenchVault = (path: string | null) => {
    if (path === workbenchVaultPath) return;
    workbenchVaultPath = path;
    workbenchCoverRevision++;
    workbenchCoverQueue = null;
    loadedWorkbenchCovers.clear();
    updateWorkbench();
  };

  const dismissWorkbench = (restorePreviousFocus = true, animateDeparture = false) => {
    workbenchCoverRevision++;
    workbenchCoverQueue = null;
    workbenchHome.setVisible(false, restorePreviousFocus, animateDeparture);
  };

  const revealActiveSpace = () => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    focusedPaneState().canvasContainer.animate([{ opacity: 0.68 }, { opacity: 1 }], { duration: 165, easing: 'ease-out' });
  };

  const createWorkbenchHandoff = (anchor: WorkbenchCoverAnchor | undefined, pane: PaneState) => {
    if (!anchor || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
    const bounds = pane.canvasContainer.getBoundingClientRect();
    if (!bounds.width || !bounds.height || !anchor.rect.width || !anchor.rect.height) return null;
    const layer = document.createElement('div');
    layer.className = 'fg-workbench-handoff';
    const cover = document.createElement('div');
    cover.className = 'fg-workbench-handoff-cover';
    cover.setAttribute('aria-hidden', 'true');
    const palette = getComputedStyle(anchor.artwork);
    const wallBackground = palette.getPropertyValue('--ns-home-field').trim();
    cover.style.backgroundColor = palette.getPropertyValue('--ns-cover-surface').trim() || wallBackground;
    cover.style.color = palette.color;
    for (const property of ['--ns-cover-edge', '--ns-wall-h1', '--ns-wall-h2', '--ns-wall-h3', '--ns-wall-h4', '--ns-wall-h5', '--ns-wall-h6']) {
      const value = palette.getPropertyValue(property).trim();
      if (value) cover.style.setProperty(property, value);
    }
    cover.append(anchor.artwork.cloneNode(true));
    const status = document.createElement('div');
    status.className = 'fg-workbench-handoff-status';
    status.setAttribute('role', 'status');
    status.style.color = palette.getPropertyValue('--ns-cover-ink').trim() || palette.color;
    status.style.backgroundColor = cover.style.backgroundColor;
    layer.append(cover, status);
    const frame = (rect: DOMRectReadOnly): Keyframe => ({
      left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
    });
    const expansion = cover.animate([frame(anchor.rect), frame(bounds)], {
      duration: WORKBENCH_MORPH_DURATION, easing: 'cubic-bezier(.2,.7,.25,1)', fill: 'both',
    });
    expansion.pause();
    expansion.currentTime = 0;
    layer.animate([{ backgroundColor: 'transparent' }, { backgroundColor: cover.style.backgroundColor }], {
      duration: 190, fill: 'forwards',
    });
    appShell.append(layer);
    return { layer, cover, expansion, status };
  };

  const workbenchNodeDestinations = (pane: PaneState, anchor: WorkbenchCoverAnchor) => {
    const px = panePixi(pane);
    const sprites = pane.index === PANE_LEFT ? nodeSprites : extraSprites[pane.index - 1];
    if (!px || !sprites || !anchor.cover) return null;
    const canvas = px.app.canvas.getBoundingClientRect();
    const viewport = px.viewport;
    if (!canvas.width || !canvas.height || !viewport.screenWidth || !viewport.screenHeight) return null;
    const scaleX = canvas.width / viewport.screenWidth;
    const scaleY = canvas.height / viewport.screenHeight;
    const ids = new Set(anchor.cover.points.map(point => point.id));
    const targets = new Map<string, NodeSprite>();
    for (const [id, sprite] of sprites) {
      if (ids.has(String(id))) targets.set(String(id), sprite);
    }
    return (id: string): ScreenNode | null => {
      const sprite = targets.get(id);
      if (!sprite || sprite.container.destroyed || !sprite.container.visible) return null;
      const screen = viewport.toScreen(sprite.container.x, sprite.container.y);
      const x = canvas.left + screen.x * scaleX;
      const y = canvas.top + screen.y * scaleY;
      if (!Number.isFinite(x) || !Number.isFinite(y)
        || x < canvas.left || x > canvas.right || y < canvas.top || y > canvas.bottom) return null;
      const radius = sprite.radius * Math.abs(sprite.container.scale.x * viewport.scale.x) * scaleX;
      return { x, y, radius: Number.isFinite(radius) ? Math.max(.5, radius) : 1 };
    };
  };

  const enterWorkbenchSpace = async (anchor: WorkbenchCoverAnchor | undefined, fileName?: string) => {
    if (openingGraphFromWall || blockForTextDraft('切换空间')) return;
    openingGraphFromWall = true;
    let handoff: ReturnType<typeof createWorkbenchHandoff> = null;
    let loadingNotice: number | undefined;
    try {
      const pane = focusedPaneState();
      handoff = createWorkbenchHandoff(anchor, pane);
      dismissWorkbench(true, Boolean(handoff));
      if (handoff && fileName) {
        const { status } = handoff;
        loadingNotice = window.setTimeout(() => { status.textContent = '正在打开…'; }, 650);
      }
      if (fileName) await openTab(fileName);
      window.clearTimeout(loadingNotice);
      if (handoff && anchor) {
        await transitionPaint();
        const destination = (!fileName || paneLoadedTab(pane) === fileName) && workbenchNodeDestinations(pane, anchor);
        const movement = destination
          ? animateWorkbenchCoverNodes(handoff.layer, handoff.cover, anchor.cover, destination, handoff.expansion)
          : null;
        handoff.expansion.play();
        const fade = movement
          ? handoff.layer.animate([{ opacity: 1 }, { opacity: 1, offset: .48 }, { opacity: 0 }], {
            duration: WORKBENCH_MORPH_DURATION, fill: 'forwards',
          })
          : handoff.layer.animate([{ opacity: 1 }, { opacity: 0 }], {
            delay: 225, duration: 150, easing: 'ease-out', fill: 'forwards',
          });
        await Promise.all([movement, fade.finished]);
      } else revealActiveSpace();
    } finally {
      window.clearTimeout(loadingNotice);
      handoff?.layer.remove();
      openingGraphFromWall = false;
    }
  };

  const createWorkbenchSpace = async (name: string, capture?: { title?: string }) => {
    const destination = adapter;
    const origin = focusedPaneState();
    const originatingTab = paneLoadedTab(origin);
    const path = await findAvailableSpacePath(backupFileStem(name), destination, isNewGraphPathReserved);
    const nodes: GraphData['nodes'] = [];
    if (capture) {
      const node = { id: createNodeId(nodes), label: capture.title || '新记录', x: 0, y: 0, headingLevel: 6, tags: [] };
      assignCreatedOrder(node, nodes);
      nodes.push(node);
    }
    await writeNewGraph(destination, path, { nodes, edges: [], groups: [], settings: { ...DEFAULT_SETTINGS, ...presetDefaults } });
    try {
      if (destination !== adapter) return;
      await refreshFileTree();
      if (destination === adapter && focusedPaneState() === origin && paneLoadedTab(origin) === originatingTab
        && !blockForTextDraft('打开新空间')) await openTab(path);
      workbenchHistory.visit(path);
      showToast(`已新建「${graphTabLabel(path)}」`, 'success');
    } catch {
      showToast(`已新建「${graphTabLabel(path)}」，可从侧栏打开`, 'warning');
    }
  };

  const loadWorkbenchCovers = async (spaces: readonly WorkbenchSpace[]) => {
    const paintCover = (id: string, { cover, palette }: CoverSnapshot) => {
      workbenchHome.setCover(id, cover, palette);
      loadedWorkbenchCovers.add(id);
    };
    const restorePrepared = (space: WorkbenchSpace) => {
      if (loadedWorkbenchCovers.has(space.id)) return false;
      const prepared = preparedWorkbenchCovers.get(space.id);
      if (!prepared) return true;
      paintCover(space.id, prepared);
      return false;
    };
    workbenchCoverRevision++;
    workbenchCoverQueue = spaces.filter(restorePrepared);
    if (loadingWorkbenchCovers) return;
    loadingWorkbenchCovers = true;
    try {
      while (workbenchCoverQueue && workbenchHome.element.open) {
        const visible = workbenchCoverQueue.filter(space => space.kind !== 'library' && space.kind !== 'folder'
          && (space.kind !== 'resource' || /\.md$/i.test(vaultPathFromTabId(space.id) || '')) && restorePrepared(space));
        workbenchCoverQueue = null;
        const revision = workbenchCoverRevision;
        const destination = adapter;
        const epoch = workbenchCoverSourceEpoch;
        const scope = mountedStorageScope ?? 'local';
        const isCurrent = () => revision === workbenchCoverRevision && destination === adapter && workbenchHome.element.open;
        const rememberCover = (id: string, snapshot: CoverSnapshot) => {
          if (epoch !== workbenchCoverSourceEpoch || destination !== adapter) return;
          if (preparedWorkbenchCovers.size >= 512 && !preparedWorkbenchCovers.has(id)) {
            const oldest = preparedWorkbenchCovers.keys().next();
            if (!oldest.done) preparedWorkbenchCovers.delete(oldest.value);
          }
          preparedWorkbenchCovers.set(id, snapshot);
          if (isCurrent()) paintCover(id, snapshot);
        };
        const loadCover = async (space: WorkbenchSpace) => {
          try {
            const pane = focusedPaneState();
            const focusedTheme = paneLoadedTab(pane) === space.id ? pane.graphTheme : undefined;
            const runtime = runtimeRegistry.get(space.id);
            const useDraft = !!(runtime?.dirty || runtime?.savePending || runtime?.externalConflict);
            const vaultFile = space.kind === 'resource' ? vaultPathFromTabId(space.id) : null;
            const index = vaultIndex;
            const vaultResource = vaultFile ? vaultResourceForPath(vaultFile) : null;
            let raw: string | null = null;
            const readRaw = async () => {
              const result = await destination.readFile(space.id);
              return result.ok && result.value && result.value.length <= 8 * 1024 * 1024 ? result.value : null;
            };
            const readVersion = async () => {
              if (space.example) return 'builtin';
              if (vaultFile) {
                if (!index || !vaultResource || index !== vaultIndex) return undefined;
                const stat = await (window as any).electronAPI?.stat?.(joinVaultPath(index.rootPath, vaultFile));
                return !stat?.isDir && typeof stat?.size === 'number' && typeof stat.mtime === 'number'
                  ? `${stat.size}:${stat.mtime}:${stat.ctime ?? ''}:${vaultCoverVersion(index, vaultFile, vaultResource)}`
                  : undefined;
              }
              const stat = await destination.statFile?.(space.id);
              return stat?.ok && stat.value ? `${stat.value.size}:${stat.value.mtime}:${stat.value.ctime ?? ''}` : undefined;
            };
            let version = useDraft ? undefined : await readVersion();
            const verifyMetadata = version !== undefined && !space.example;
            if (!useDraft && version === undefined && !vaultFile && !space.example && !destination.statFile) {
              raw = await readRaw();
              if (raw) version = coverFingerprint(raw);
            }
            const cacheKey = version === undefined ? null : {
              scope, id: space.id, version,
              theme: JSON.stringify([1, focusedTheme, vaultFile ? presetDefaults.graphTheme : null,
                vaultFile ? presetDefaults.nodeColorStyle : null]),
            };
            const cached = cacheKey ? await workbenchCoverCache.get(cacheKey) : undefined;
            if (cached) {
              rememberCover(space.id, cached);
              return;
            }
            let source: GraphData | null | undefined;
            if (useDraft) source = runtime?.graph;
            else if (space.example) source = BUILTIN_GRAPHS[space.id];
            else if (vaultFile) source = await readVaultGraphData(space.id);
            else {
              raw ??= await readRaw();
              if (raw) source = JSON.parse(raw) as GraphData;
            }
            if (source && destination === adapter) {
              const themeName = focusedTheme || source.settings?.graphTheme || DEFAULT_GRAPH_THEME;
              const theme = getTheme(themeName);
              const dark = isThemeDark(theme);
              const hex = (color: number) => '#' + color.toString(16).padStart(6, '0');
              const accent = hex(getAccentColorsForTheme(themeName).accent);
              const colorStyle = source.settings?.nodeColorStyle || DEFAULT_SETTINGS.nodeColorStyle;
              const levels = Array.from({ length: 6 }, (_, i) => {
                const level = i + 1;
                if (colorStyle === 'uniform') return theme.nodeDefaultColor;
                if (colorStyle === 'spectrum') return hex(getSpectrumColor(level, dark, accent));
                if (colorStyle === 'spectrum-narrow') return hex(getNarrowSpectrumColor(level, dark, accent));
                return theme.headingColors?.[i] ?? hex(getHeadingColor(level, accent, dark));
              });
              const cover = buildWorkbenchCover(source);
              const palette = {
                background: theme.canvasBackground,
                ink: theme.labelColor,
                accent,
                edge: theme.edgeColors?.explicit ?? theme.labelColor,
                levels,
              };
              rememberCover(space.id, { cover, palette });
              if (cacheKey && (!verifyMetadata || await readVersion() === version)) {
                workbenchCoverCache.set(cacheKey, { cover, palette });
              }
            }
          } catch {
            // A preview can fail independently of opening the graph.
          }
        };
        for (let index = 0; index < visible.length && isCurrent(); index += 2) {
          await Promise.all(visible.slice(index, index + 2).map(loadCover));
        }
      }
    } finally {
      loadingWorkbenchCovers = false;
    }
  };

  let workbenchFileActionPending = false;
  const runWorkbenchFileAction = (action: () => Promise<void>) => {
    if (workbenchFileActionPending) return;
    workbenchFileActionPending = true;
    void action().catch(reportWorkbenchActionError).finally(() => { workbenchFileActionPending = false; });
  };

  const workbenchHome = createWorkbenchHome({
    onContinue: anchor => { void enterWorkbenchSpace(anchor).catch(reportWorkbenchActionError); },
    onOpen: (space, anchor) => {
      if (space.kind === 'library' || space.kind === 'folder') {
        const path = vaultSpacePathFromTabId(space.id);
        if (path !== null) navigateWorkbenchVault(path);
        return;
      }
      void enterWorkbenchSpace(anchor, space.id).catch(reportWorkbenchActionError);
    },
    onBack: () => {
      const path = workbenchVaultPath;
      navigateWorkbenchVault(path ? path.split('/').slice(0, -1).join('/') : null);
    },
    onVisibleSpaces: spaces => { void loadWorkbenchCovers(spaces); },
    onNewSpace: () => runWorkbenchFileAction(async () => {
      if (blockForTextDraft('新建空间')) return;
      const name = await safePrompt('空间名称', '未命名空间');
      if (!name?.trim()) return;
      await createWorkbenchSpace(name);
      dismissWorkbench(false);
    }),
    onRenameSpace: space => runWorkbenchFileAction(async () => {
      const destination = adapter;
      const name = await safePrompt('重命名空间', space.title);
      if (name === null || destination !== adapter) return;
      if (await renameSpaceFile(space.id, name)) {
        if (vaultIndex?.isObsidianVault) await refreshVaultIndex();
        showToast('空间已重命名', 'success');
      }
    }),
    onDuplicateSpace: space => runWorkbenchFileAction(async () => {
      const newPath = await copySpaceFile(space.id);
      if (vaultIndex?.isObsidianVault) await refreshVaultIndex();
      showToast(`已创建「${graphTabLabel(newPath)}」`, 'success');
    }),
    onDeleteSpace: space => runWorkbenchFileAction(async () => {
      const destination = adapter;
      const original = await destination.readFile(space.id);
      if (!original.ok || original.value === null) throw new Error('无法读取要删除的空间');
      const confirmed = await confirmAction(`删除空间「${space.title}」？`, { confirm: '删除' });
      if (confirmed && destination === adapter && await deleteSpaceFile(space.id, original.value)) {
        if (vaultIndex?.isObsidianVault) await refreshVaultIndex();
        showToast(`已删除「${space.title}」`, 'success');
      }
    }),
    onOpenLibrary: () => {
      if (vaultIndex?.isObsidianVault) {
        navigateWorkbenchVault('');
        return;
      }
      if (mountedStorageScope === null) {
        void openWorkspaceFolder().catch(reportWorkbenchActionError);
        return;
      }
      dismissWorkbench(false);
      sidebar.open();
    },
    onRestore: () => {
      dismissWorkbench();
      restoreBackupButton.click();
    },
    onRecord: () => runWorkbenchFileAction(async () => {
      if (blockForTextDraft('记录想法')) return;
      const title = (await safePrompt('记录一个想法'))?.trim();
      if (!title) return;
      const pane = focusedPaneState();
      dismissWorkbench(false);
      if (isWorkbenchSpace(paneLoadedTab(pane)) && canMutateCanvasPane(pane)
        && !pane.structureView && !pane.localContextProjection) {
        createNodeInFocusedPane(title);
        return;
      }
      await createWorkbenchSpace('随手记', { title });
    }),
    onShowAtStartupChange: value => workbenchHistory.setShowAtStartup(value),
    onDismiss: () => { dismissWorkbench(); revealActiveSpace(); },
  }, windowControls);
  appShell.appendChild(workbenchHome.element);
  updateOpenWorkbench = invalidateCovers => {
    if (!workbenchHome.element.open) return;
    if (invalidateCovers) invalidateWorkbenchCovers();
    updateWorkbench();
    if (invalidateCovers) workbenchHome.refreshCovers();
  };
  let showingWorkbench = false;
  showWorkbench = async () => {
    if (showingWorkbench || workbenchHome.element.open || openingGraphFromWall || blockForTextDraft('返回主界面')) return;
    showingWorkbench = true;
    try {
      if (markdownSourceEditor?.isOpen()) {
        if (!await markdownSourceEditor.requestClose()) return;
        if (workbenchHome.element.open || openingGraphFromWall || blockForTextDraft('返回主界面')) return;
      }
      invalidateWorkbenchCovers();
      updateWorkbench();
      workbenchHome.setVisible(true);
      void refreshFileTree().catch(reportWorkbenchActionError);
    } catch (error) {
      reportWorkbenchActionError(error);
    } finally {
      showingWorkbench = false;
    }
  };
  const workbenchButton = document.createElement('button');
  workbenchButton.type = 'button';
  workbenchButton.className = 'fg-action fg-shell-control fg-shell-view-switch fg-workbench-trigger';
  workbenchButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5m5-5-5 5 5 5"/></svg><span>主界面</span>';
  workbenchButton.title = '返回主界面 (Esc)';
  workbenchButton.setAttribute('aria-haspopup', 'dialog');
  workbenchButton.onclick = () => { void showWorkbench(); };
  // Android can deliver the next touch before it resumes synthesizing clicks after a canvas drag.
  let workbenchTouch: { id: number; x: number; y: number } | null = null;
  workbenchButton.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' && event.isPrimary) {
      workbenchTouch = { id: event.pointerId, x: event.clientX, y: event.clientY };
    }
  });
  workbenchButton.addEventListener('pointermove', event => {
    if (workbenchTouch?.id === event.pointerId
      && Math.hypot(event.clientX - workbenchTouch.x, event.clientY - workbenchTouch.y) > 8) workbenchTouch = null;
  });
  workbenchButton.addEventListener('pointercancel', () => { workbenchTouch = null; });
  workbenchButton.addEventListener('lostpointercapture', () => { workbenchTouch = null; });
  workbenchButton.addEventListener('pointerup', event => {
    const touch = workbenchTouch;
    if (event.pointerType !== 'touch' || touch?.id !== event.pointerId) return;
    workbenchTouch = null;
    if (Math.hypot(event.clientX - touch.x, event.clientY - touch.y) <= 8
      && workbenchButton.contains(document.elementFromPoint(event.clientX, event.clientY))) void showWorkbench();
  });
  editorNavigation.prepend(workbenchButton);
  if (workbenchHistory.showAtStartup && !document.querySelector('[aria-modal="true"]')) void showWorkbench();

  // ===== 键盘快捷键 =====
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (workbenchHome.element.open || e.defaultPrevented) return;
    // 输入控件中不处理快捷键
    const tag = (e.target as HTMLElement)?.tagName;
    const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable;
    if (isInput) return;

    const ctrl = e.ctrlKey || e.metaKey;
    const isExtra = focusedPaneIndex > PANE_LEFT;
    const fp = isExtra ? extraPanes[focusedPaneIndex - 1] : null;
    const fg = () => isExtra && fp ? scopedPaneGraph(fp) : scopedPaneGraph(pane0 as unknown as PaneState);
    const fsim = () => isExtra && fp ? scopedPaneSimulationManager(fp) : scopedPaneSimulationManager(pane0 as unknown as PaneState);

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const focusedPane = fp ?? pane0 as unknown as PaneState;
      const selectedNode = fp?.selNode ?? selNode;
      const selectedEdge = fp?.selEdge ?? selEdge;
      const selectedGroup = fp?.selGroup ?? selGroup;
      if (selectedNode) {
        deleteNodesForPane(focusedPane, [selectedNode]);
      } else if (selectedEdge !== null) {
        deleteEdgesForPane(focusedPane, [selectedEdge]);
      } else if (selectedGroup) {
        deleteGroupForPane(focusedPane, selectedGroup);
      }
    } else if (ctrl && /^z$/i.test(e.key) && !e.shiftKey) {
      e.preventDefault();
      runFocusedHistory('undo');
    } else if (ctrl && /^z$/i.test(e.key) && e.shiftKey) {
      e.preventDefault();
      runFocusedHistory('redo');
    } else if (ctrl && /^s$/i.test(e.key)) {
      e.preventDefault();
      void saveFocusedGraphWithFeedback();
    } else if (e.key === 'f' && !ctrl) {
      e.preventDefault();
      // F 键：有选中 → 切换固定；无选中 → 回正视口
      if (e.repeat) return;
      const focusedPane = fp ?? pane0 as unknown as PaneState;
      const boxIds = paneBoxSelection.get(focusedPane)?.().nodeIds ?? [];
      const ids = boxIds.length ? boxIds : focusedPane.selNode ? [focusedPane.selNode] : [];
      if (ids.length) setPaneNodesFixed(focusedPane, ids);
      else fitFocusedPane();
    } else if (e.key === 'n' && !ctrl) {
      e.preventDefault();
      createNodeInFocusedPane();
    } else if (e.key === 'F2' && !ctrl) {
      const pane = fp ?? pane0 as unknown as PaneState;
      if (pane.selNode && beginNodeTitleEditForPane(pane, pane.selNode)) e.preventDefault();
    } else if (/^[1-6]$/.test(e.key) && !ctrl && !e.shiftKey && !e.metaKey) {
      // 数字键 1-6：设置选中节点等级（输入框/可编辑元素聚焦时跳过）
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || (activeEl as any).isContentEditable)) return;
      e.preventDefault();
      const lv = parseInt(e.key);
      const levelR = [22, 19, 16, 13, 10, 7][lv - 1] || 9;
      if (isExtra && fp) {
        const targets = fp.selNode && !isPaneStructureProxyNode(fp.structureView, fp.selNode) ? [fp.selNode] : [];
        const runtimeGraph = paneRuntimeGraph(fp);
        const focusedSim = scopedPaneSimulationManager(fp)?.getSim();
        for (const nid of targets) {
          const n = runtimeGraph.nodes.find(n2 => n2.id === nid);
          if (n) { n.headingLevel = lv; n.radius = undefined; n.radiusMode = undefined; }
          const sn = focusedSim?.nodes().find((s: any) => s.id === nid);
          if (sn) { sn.headingLevel = lv; sn.radius = levelR; sn.radiusMode = undefined; }
        }
        if (targets.length > 0) { scheduleSaveForPane(fp); draw(); fillNode(targets[0]); }
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
      const owner = fp ?? pane0 as unknown as PaneState;
      const selectedId = owner.selNode;
      if (selectedId && !isPaneStructureProxyNode(owner.structureView, selectedId)
        && duplicateNodeForPane(owner, selectedId)) showToast('节点已复制', 'success');
    } else if (e.key === 'Escape') {
      if (document.querySelector('[aria-modal="true"]')) return;
      const box = paneBoxSelection.get(fp ?? pane0 as unknown as PaneState)?.();
      if (sharedState.rightDragLink) { sharedState.rightDragLink = null; draw(); }
      else if (box?.nodeIds.length || box?.edges?.size) {
        e.preventDefault();
        sharedState.clearSelection?.();
      }
      else if (focusedLinkActive()) {
        finishLinkMode(fp);
        showToast('已退出连线模式', 'info');
      }
      else if ((fp ?? pane0 as unknown as PaneState).localContext) {
        e.preventDefault();
        closeLocalContextForPane(fp ?? pane0 as unknown as PaneState);
      }
      else if (exitStructureForPane(fp ?? pane0 as unknown as PaneState, true)) {
        e.preventDefault();
      }
      else if (fp && (fp.selNode || fp.selEdge !== null || fp.selGroup)) {
        fp.selNode = null; fp.selEdge = null; fp.selGroup = null;
        clearEd(); draw();
      }
      else if (!isExtra && (selNode || selEdge !== null || selGroup)) { clearEd(); }
      else if (toolbarDropdownDetails.some(details => details.open)) {
        for (const details of toolbarDropdownDetails) details.open = false;
      }
      else {
        e.preventDefault();
        void showWorkbench();
      }
    } else if (e.key === 'Tab' && !ctrl && !e.altKey) {
      if (e.target instanceof Element && e.target.closest('button, summary, a[href], [role="button"], [role="menuitem"]')) return;
      const pane = fp ?? pane0 as unknown as PaneState;
      const selected = fp ? fp.selNode : selNode;
      if (!selected || isPaneStructureProxyNode(pane.structureView, selected)
        || hasActiveTextDraft() || !canMutateCanvasPane(pane)) return;
      e.preventDefault();
      if (isExtra && fp) {
        const isShift2 = e.shiftKey;
        const _g = paneRuntimeGraph(fp);
        if (isShift2) {
          const parentEdge = _g.edges.find(ed => (typeof ed.target === "object" ? ed.target.id : ed.target) === selected);
          const parentId = parentEdge ? (typeof parentEdge.source === 'object' ? parentEdge.source.id : parentEdge.source) : null;
          const parent2 = parentId ? _g.nodes.find(n => n.id === parentId) : null;
          const siblingId = createNodeId(_g.nodes);
          const sel2 = _g.nodes.find(n => n.id === selected);
          const siblingLevel = sel2?.headingLevel || 6;
          const simNodesSib = scopedPaneSimulationManager(fp)?.getSim()?.nodes();
          const simParentSib = parent2 ? simNodesSib?.find((n: any) => n.id === parent2.id) : null;
          const simSelSib = simNodesSib?.find((n: any) => n.id === selected);
          const cx = simParentSib ? simParentSib.x : (simSelSib?.x ?? sel2?.x ?? 200);
          const cy = simParentSib ? simParentSib.y : (simSelSib?.y ?? sel2?.y ?? 200);
          const sibling = { id: siblingId, label: '子节点', headingLevel: siblingLevel, tags: [], x: cx + 120, y: cy + 30, _isNew: true };
          assignCreatedOrder(sibling, _g.nodes);
          fp.undoManager.pushSnapshot(_g); _g.nodes.push(sibling);
          if (parentId) _g.edges.push({ source: parentId, target: siblingId, label: '', color: '#BFBFBF', arrow: fp.defArrow });
          scheduleSaveForPane(fp);
          reinitializeRuntimeViews(fp.runtime);
          fp.selNode = siblingId;
          fillNode(siblingId);
          draw();
          beginNodeTitleEditForPane(fp, siblingId, true);
        } else {
          createChildNodeForPane(selected, fp);
        }
        return;
      }
      const isShift = e.shiftKey;
      if (isShift) {
        // Shift+Tab：给选中节点的父级新建子节点（同级节点）
        const parentEdge = graph.edges.find(ed => (typeof ed.target === "object" ? ed.target.id : ed.target) === selected);
        const parentId = parentEdge ? (typeof parentEdge.source === 'object' ? parentEdge.source.id : parentEdge.source) : null;
        const parent = parentId ? graph.nodes.find(n => n.id === parentId) : null;
        const siblingId = createNodeId(graph.nodes);
        const sel = graph.nodes.find(n => n.id === selected);
        const siblingLevel = sel?.headingLevel || 6;
        const simNodes3 = getSim()?.nodes();
        const simPar = parent ? simNodes3?.find((n: any) => n.id === parent.id) : null;
        const simSel = simNodes3?.find((n: any) => n.id === selected);
        const cx = simPar?.x ?? (simSel?.x ?? sel?.x ?? 200);
        const cy = simPar?.y ?? (simSel?.y ?? sel?.y ?? 200);
        const sibling = { id: siblingId, label: '子节点', headingLevel: siblingLevel, tags: [], x: cx + 120, y: cy + 30, _isNew: true };
        assignCreatedOrder(sibling, graph.nodes);
        saveUndo(); graph.nodes.push(sibling);
        if (parentId) {
          graph.edges.push({ source: parentId, target: siblingId, label: '', color: '#BFBFBF', arrow: defArrow, _createdAt: performance.now() });
        }
        scheduleSave(); addNodeToSim(sibling); draw(); fillNode(siblingId);
        beginNodeTitleEditForPane(pane0 as unknown as PaneState, siblingId, true);
      } else {
        // Tab：给选中节点新建子节点
        createChildNodeForPane(selected, null);
      }
      return;
    }

    // ═══ 方向键：沿线跳转节点 ═══
    // ═══ Shift+上下：导航文件树 ═══
    if (e.shiftKey && !e.ctrlKey && !e.altKey) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const files = _flatTreePaths;
        if (files.length > 1) {
          const idx = files.indexOf(paneLoadedTab(focusedPaneState()));
          const step = e.key === 'ArrowDown' ? 1 : -1;
          const newIdx = idx < 0 ? 0 : ((idx + step + files.length) % files.length);
          if (!blockForTextDraft('切换文件')) void openTab(files[newIdx]);
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
      const sim = fsim()?.getSim();
      const simNodes: any[] = sim?.nodes() || [];
      const { dx, dy } = ARROW_KEYS[e.key];

      let currentId = fp?.selNode ?? selNode;
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
            fillNode(targetId); draw();
          } else {
            selNode = targetId; selEdge = null; selGroup = null;
            fillNode(targetId); draw();
          }
        }
      }
    }
  });

  // 侧边栏折叠动画同步
  let cardBoundsRefreshFrame: number | null = null;
  const refreshCardLayoutBounds = () => {
    if (cardBoundsRefreshFrame != null) cancelAnimationFrame(cardBoundsRefreshFrame);
    cardBoundsRefreshFrame = requestAnimationFrame(() => {
      cardBoundsRefreshFrame = null;
      const shellBottom = syncEditorShellGeometry().bottom;
      const breadcrumb = floatingTop.getBoundingClientRect();
      document.documentElement.style.setProperty(
        '--fg-floating-top-bottom',
        `${Math.ceil(Math.max(shellBottom, breadcrumb.height > 0 ? breadcrumb.bottom : 0) + 8)}px`,
      );
      const panesWithLayouts = [pane0, ...extraPanes];
      for (const pane of panesWithLayouts) {
        const canvas = pane.pixi?.app?.canvas;
        if (canvas) pane.layout.resize(canvas.clientWidth, canvas.clientHeight);
      }
    });
  };
  const cardUiResizeObserver = new ResizeObserver(refreshCardLayoutBounds);
  cardUiResizeObserver.observe(editorShell);
  cardUiResizeObserver.observe(floatingTop);

  window.addEventListener('sidebar-toggle', refreshCardLayoutBounds);

  // 响应式窗口大小调整（移动端横竖屏切换）
  let resizeDebounceTimer: ReturnType<typeof setTimeout>;
  window.addEventListener('resize', () => {
    clearTimeout(resizeDebounceTimer);
    resizeDebounceTimer = setTimeout(() => {
      const newWidth = getResponsiveSidebarWidth();
      // 仅在展开状态下更新侧边栏宽度
      if (sidebar.sidebar.style.width !== `${SIDEBAR_COLLAPSED_WIDTH}px`) {
        sidebar.sidebar.style.width = `${newWidth}px`;
      }
      // Resize without discarding the current spatial context.
      if (pixi) {
        const pw = pixiContainer.clientWidth;
        const ph = pixiContainer.clientHeight;
        const center = { x: pixi.viewport.center.x, y: pixi.viewport.center.y };
        pixi.app.renderer.resize(pw, ph);
        pixi.viewport.resize(pw, ph);
        pixi.viewport.moveCenter(center.x, center.y);
      }
      if (pixi1 && pane1Container.clientWidth > 0) {
        const pw = pane1Container.clientWidth;
        const ph = pane1Container.clientHeight;
        const center = { x: pixi1.viewport.center.x, y: pixi1.viewport.center.y };
        pixi1.app.renderer.resize(pw, ph);
        pixi1.viewport.resize(pw, ph);
        pixi1.viewport.moveCenter(center.x, center.y);
      }
      draw();
    }, 200);
  });

  // 分屏调整时更新所有 viewport 尺寸
  window.addEventListener('pane-resize', () => {
    setTimeout(() => {
      if (pixi) {
        const pw = pixiContainer.clientWidth, ph = pixiContainer.clientHeight;
        const center = { x: pixi.viewport.center.x, y: pixi.viewport.center.y };
        pixi.app.renderer.resize(pw, ph);
        pixi.viewport.resize(pw, ph);
        pixi.viewport.moveCenter(center.x, center.y);
      }
      for (let i = 0; i < extraPixis.length; i++) {
        const px = extraPixis[i];
        if (px) {
          const pw = extraContainers[i].clientWidth, ph = extraContainers[i].clientHeight;
          if (pw > 0) {
            const center = { x: px.viewport.center.x, y: px.viewport.center.y };
            px.app.renderer.resize(pw, ph);
            px.viewport.resize(pw, ph);
            px.viewport.moveCenter(center.x, center.y);
          }
        }
      }
      draw();
    }, 16);
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

  async function flushAllGraphs(): Promise<boolean> {
    let allSaved = true;
    for (const runtime of runtimeRegistry.values()) {
      if (!runtime.dirty && !runtime.externalConflict && !runtime.savePending && !runtime.fileOperationActive) continue;
      const saved = await saveRuntimeNow(runtime, collectRuntimeSettings(runtime));
      if (!saved) allSaved = false;
    }
    syncSpaceNavigation();
    return allSaved && !runtimeRegistry.values().some(runtime =>
      runtime.dirty || runtime.externalConflict || runtime.savePending || runtime.fileOperationActive);
  }

  const electronApi = (window as any).electronAPI;
  electronApi?.onBeforeClose?.(async () => {
    if (markdownSourceEditor?.hasDraft()) {
      showToast('Markdown 原文还有未保存修改，请先保存或关闭编辑器。', 'warning', 6000);
      electronApi.cancelClose();
      return;
    }
    if (hasActiveTextDraft()) {
      showToast('文字草稿尚未应用，请先点“应用并返回”再关闭应用。', 'warning', 6000);
      electronApi.cancelClose();
      return;
    }
    try {
      const saved = await flushAllGraphs();
      if (saved) { electronApi.confirmClose(); return; }
      showToast('仍有内容未能写入，已取消关闭。请检查存储目录后重试。', 'error', 8000);
      electronApi.cancelClose();
    } catch (error) {
      showToast(`关闭前保存失败：${error instanceof Error ? error.message : String(error)}`, 'error', 8000);
      electronApi.cancelClose();
    }
  });

  // Web/Android 页面关闭无法等待异步写盘；同步更新恢复缓存作为最后防线。
  window.addEventListener('beforeunload', event => {
    if (markdownSourceEditor?.hasDraft()) {
      event.preventDefault();
      event.returnValue = '';
      return;
    }
    if (hasActiveTextDraft()) {
      for (const editor of textEditors.values()) editor.preserveDraft();
      event.preventDefault();
      event.returnValue = '';
      return;
    }
    disposePane0CanvasEvents?.();
    disposePane0CanvasEvents = null;
    for (const pane of extraPanes) {
      pane.disposeCanvasEvents?.();
      pane.disposeCanvasEvents = null;
    }
    try {
      for (const runtime of runtimeRegistry.values()) {
        if (!runtime.fileName || !runtime.graph?.nodes) continue;
        const snapshot = serializeGraphSnapshot(runtime.graph, collectRuntimeSettings(runtime));
        const recovery = graphRecovery(runtime.fileName);
        recovery.writeSnapshot(snapshot);
        if (runtime.dirty) recovery.markUnsynced();
      }
    } catch {}
  });

  // ---- Vite HMR：监听数据目录的文件变更（开发模式） ----
  if (import.meta.hot) {
    import.meta.hot.on('graph-external-change', (data: { graph: string }) => {
      handleExternalGraphChange(data.graph, true);
    });
  }
}

main().catch(console.error);
