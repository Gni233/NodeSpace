import { GraphData } from './data/storage';
import { PixiLayers } from './pixi-app';
import { NodeSprite } from './pixi-nodes';
import { UndoManager } from './undo-redo';
import { LayoutSlot } from './layout-controller';
import { GraphRuntime } from './graph-runtime';

/**
 * Maximum number of simultaneous split panes (left + right).
 * @see PANE_LEFT, PANE_RIGHT
 */
export const MAX_PANES = 2;
export const PANE_LEFT = 0;
export const PANE_RIGHT = 1;

/**
 * Central per-pane state object. Holds graph data, PixiJS references, simulation,
 * configuration, selection, search, layout, and undo for a single pane.
 *
 * Logical sub-groups (consider refactoring into nested objects):
 *   Search: sField, sDisplayMode, sMatchMode
 *   Layout: treeMode, categoryMode, fullCatMode, activeMode
 *   Config: linkDist, charge, gridSp, graphTheme, etc. (see GraphSettings)
 */

export interface PaneState {
  index: number;

  // --- Graph runtime ---
  runtime: GraphRuntime;
  graph: GraphData;
  activeTab: string;
  openTabs: string[];
  dirtyTabs: Set<string>;

  // --- PixiJS ---
  pixi: PixiLayers | null;
  canvasContainer: HTMLElement;
  nodeSprites: Map<string, NodeSprite>;
  readyToDraw: boolean;

  // --- Simulation ---
  simManager: any; // ReturnType<typeof createSimManager>

  // --- Selection ---
  selNode: string | null;
  selEdge: number | null;
  selGroup: string | null;
  draggingNode: any;
  wasDragged: boolean;
  _lastDragNodeId: string | null;

  // --- Config (~25 params) ---
  linkDist: number;
  labelSize: number;
  charge: number;
  linkStr: number;
  collideR: number;
  centerS: number;
  groupBound: number;
  heatingTime: number;
  alphaTarget: number;
  editPanelOpacity: number;
  useRAFL: boolean;
  nodeExpand: number;
  lineExpand: number;
  showGLabels: boolean;
  glMin: number;
  glMax: number;
  gridVis: boolean;
  gridMode: 'line' | 'dot';
  axisVis: boolean;
  axisTicks: boolean;
  gridSp: number;
  gridWidth: number;
  ar: number;
  graphTheme: string;
  focusMode: boolean;
  centerMode: boolean;
  selectedTooltip: boolean;
  glowAppearance: boolean;
  categoryLayout: boolean;
  layoutMode: string;
  gridSnapEnabled: boolean;
  partialGridSnap: boolean;
  nodeColorStyle: 'uniform' | 'hierarchical' | 'spectrum' | 'spectrum-narrow';
  fixedHollow: boolean;
  fontFamily: string;
  cardBorderStyle: 'straight' | 'rounded';

  // --- World dims ---
  gw: number;
  gh: number;

  // --- Search ---
  search: string;
  sField: 'name' | 'tags' | 'note';
  sDisplayMode: 'highlight' | 'show';
  sMatchMode: 'contains' | 'startsWith' | 'endsWith' | 'fuzzy';
  searchMatchIndex: number;
  lastSearchTerm: string;

  // --- Link mode ---
  linkMode: boolean;
  linkSrc: string | null;
  linkCursorX: number;
  linkCursorY: number;
  defArrow: boolean;

  // --- Theme accent colors ---
  themeAccentColor: number;
  themeAccentAltColor: number;

  // --- Timers ---
  saveTimeout: any;
  searchDebounceTimer: ReturnType<typeof setTimeout> | null;
  currentAnimationCancel: (() => void) | null;

  // --- Layout ---
  layout: LayoutSlot;
  treeMode: boolean;
  categoryMode: boolean;
  fullCatMode: boolean;
  activeMode: string;
  savedFixedNodes: { id: string; x: number; y: number; fx: number | null; fy: number | null; fixed: boolean }[];
  savedGroupModes: { id: string; mode: string; nodeColorMode: string; nodeColor: string }[];
  layouts: any[];

  // --- Undo ---
  undoManager: UndoManager;

  // --- Ref wrappers ---
  updateInfoRef: { current: () => void };
  updateSelectsRef: { current: () => void };
}

/** Shared defaults matching main.ts DEFAULT_SETTINGS */
const P_DEFAULTS = {
  linkDist: 120, labelSize: 18, charge: -100, linkStr: 0.3,
  collideR: 10, centerS: 0.02, groupBound: 0.8,
  heatingTime: 2, alphaTarget: 0.3, editPanelOpacity: 0.9,
  useRAFL: true, nodeExpand: 8, lineExpand: 6,
  showGLabels: true, glMin: 10, glMax: 28,
  gridVis: true, gridMode: 'dot' as 'line' | 'dot', axisVis: false, axisTicks: false,
  gridSp: 30, gridWidth: 0.5, ar: 0.75, graphTheme: 'nord-dark',
  focusMode: false, centerMode: false, selectedTooltip: false, glowAppearance: true, categoryLayout: false,
  layoutMode: 'default', gridSnapEnabled: false, partialGridSnap: false,
  nodeColorStyle: 'spectrum-narrow' as const, fixedHollow: true,
  fontFamily: '"SiYuan Songti", serif',
  cardBorderStyle: 'straight' as 'straight' | 'rounded',
};

export function createPaneState(index: number, container: HTMLElement): PaneState {
  const runtime = new GraphRuntime('demo', { nodes: [], edges: [], groups: [] }, new UndoManager());
  const state: PaneState = {
    index,
    runtime,
    get graph() { return this.runtime.graph; },
    set graph(value: GraphData) { this.runtime.graph = value; },
    activeTab: 'demo',
    openTabs: [],
    dirtyTabs: new Set<string>(),
    pixi: null,
    canvasContainer: container,
    nodeSprites: new Map(),
    readyToDraw: false,
    get simManager() { return this.runtime.simManager; },
    set simManager(value: any) { this.runtime.simManager = value; },
    selNode: null, selEdge: null, selGroup: null,
    draggingNode: null, wasDragged: false,
    _lastDragNodeId: null,
    linkDist: P_DEFAULTS.linkDist, labelSize: P_DEFAULTS.labelSize,
    charge: P_DEFAULTS.charge, linkStr: P_DEFAULTS.linkStr,
    collideR: P_DEFAULTS.collideR, centerS: P_DEFAULTS.centerS,
    groupBound: P_DEFAULTS.groupBound, heatingTime: P_DEFAULTS.heatingTime,
    alphaTarget: P_DEFAULTS.alphaTarget, editPanelOpacity: P_DEFAULTS.editPanelOpacity,
    useRAFL: P_DEFAULTS.useRAFL, nodeExpand: P_DEFAULTS.nodeExpand,
    lineExpand: P_DEFAULTS.lineExpand, showGLabels: P_DEFAULTS.showGLabels,
    glMin: P_DEFAULTS.glMin, glMax: P_DEFAULTS.glMax,
    gridVis: P_DEFAULTS.gridVis, gridMode: P_DEFAULTS.gridMode,
    axisVis: P_DEFAULTS.axisVis, axisTicks: P_DEFAULTS.axisTicks,
    gridSp: P_DEFAULTS.gridSp, gridWidth: P_DEFAULTS.gridWidth,
    ar: P_DEFAULTS.ar, graphTheme: P_DEFAULTS.graphTheme,
    focusMode: P_DEFAULTS.focusMode, centerMode: P_DEFAULTS.centerMode, selectedTooltip: P_DEFAULTS.selectedTooltip, glowAppearance: P_DEFAULTS.glowAppearance,
    categoryLayout: P_DEFAULTS.categoryLayout,
    layoutMode: P_DEFAULTS.layoutMode, gridSnapEnabled: P_DEFAULTS.gridSnapEnabled,
    partialGridSnap: P_DEFAULTS.partialGridSnap, nodeColorStyle: P_DEFAULTS.nodeColorStyle,
    fixedHollow: P_DEFAULTS.fixedHollow, fontFamily: P_DEFAULTS.fontFamily,
    cardBorderStyle: P_DEFAULTS.cardBorderStyle,
    gw: 800, gh: 600,
    search: '', sField: 'name', sDisplayMode: 'highlight', sMatchMode: 'contains',
    searchMatchIndex: 0, lastSearchTerm: '',
    linkMode: false, linkSrc: null, linkCursorX: 0, linkCursorY: 0,
    defArrow: false,
    themeAccentColor: 0x5B8FF9, themeAccentAltColor: 0xF59E0B,
    get saveTimeout() { return this.runtime.saveTimeout; },
    set saveTimeout(value: ReturnType<typeof setTimeout> | null) { this.runtime.saveTimeout = value; },
    searchDebounceTimer: null, currentAnimationCancel: null,
    layout: new LayoutSlot(),
    treeMode: false, categoryMode: false, fullCatMode: false, activeMode: 'default',
    savedFixedNodes: [], savedGroupModes: [], layouts: [],
    get undoManager() { return this.runtime.undoManager; },
    set undoManager(value: UndoManager) { this.runtime.undoManager = value; },
    updateInfoRef: { current: () => {} },
    updateSelectsRef: { current: () => {} },
  };
  runtime.attach(state);
  return state;
}

// --- Focus management ---
export const panes: PaneState[] = [];
let _focusedPane = PANE_LEFT;

export function getFocusedPane(): number { return _focusedPane; }
export function setFocusedPane(index: number) {
  if (_focusedPane !== index) {
    _focusedPane = index;
    onFocusChange?.();
  }
}
export let onFocusChange: (() => void) | null = null;

export function focused(): PaneState { return panes[_focusedPane]; }
export function pane(i: number): PaneState { return panes[i]; }
