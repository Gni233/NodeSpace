/**
 * 共享状态模块 — 替代原 Obsidian 插件中的 window.__fg_* 全局变量
 */
let _focusModeFn: (() => boolean) | null = null;
let _hoverNodeId: string | null = null;
let _focusHoverNodeId: string | null = null;
let _selectedNodeIdsFn: (() => string[]) | null = null;
let _clearSelectionFns: (() => void)[] = [];
let _setSelectedNodeIdsFns: ((ids: string[]) => void)[] = [];

export const sharedState = {
  /** 直接绘制函数（绕过 RAF 节流） */
  directDraw: null as (() => void) | null,

  get focusMode() { return _focusModeFn?.() ?? false; },
  /** 设置 focusMode 查询函数 */
  setFocusModeFn(fn: () => boolean) { _focusModeFn = fn; },

  get hoverNodeId() { return _hoverNodeId; },
  set hoverNodeId(id: string | null) { _hoverNodeId = id; },

  /** 聚焦模式锁存的悬停目标；仅在进入下一节点或点击节点外区域时变化 */
  get focusHoverNodeId() { return _focusHoverNodeId; },
  set focusHoverNodeId(id: string | null) { _focusHoverNodeId = id; },

  get selectedNodeIds() { return _selectedNodeIdsFn?.() ?? []; },
  /** 设置 selectedNodeIds 查询函数 */
  setSelectedNodeIdsFn(fn: () => string[]) { _selectedNodeIdsFn = fn; },
  /** Register per-canvas selection callbacks and return an idempotent unsubscriber. */
  registerSelectionHandlers(selectedNodeIds: () => string[], clear: () => void, set: (ids: string[]) => void) {
    _selectedNodeIdsFn = selectedNodeIds;
    _clearSelectionFns.push(clear);
    _setSelectedNodeIdsFns.push(set);
    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      const clearIndex = _clearSelectionFns.indexOf(clear);
      if (clearIndex >= 0) _clearSelectionFns.splice(clearIndex, 1);
      const setIndex = _setSelectedNodeIdsFns.indexOf(set);
      if (setIndex >= 0) _setSelectedNodeIdsFns.splice(setIndex, 1);
      if (_selectedNodeIdsFn === selectedNodeIds) _selectedNodeIdsFn = null;
    };
  },

  get setSelectedNodeIds() { return (ids: string[]) => _setSelectedNodeIdsFns.forEach(fn => fn(ids)); },
  set setSelectedNodeIds(fn: ((ids: string[]) => void) | null) { if (fn) _setSelectedNodeIdsFns.push(fn); },

  get clearSelection() { return () => _clearSelectionFns.forEach(fn => fn()); },
  set clearSelection(fn: (() => void) | null) { if (fn) _clearSelectionFns.push(fn); },

  /** 禁止 Markdown 写回（独立版暂无用，保留兼容） */
  disableMdSync: null as (() => void) | null,

  /** 框选中的边索引集合 */
  boxSelectedEdgeIndices: null as Set<number> | null,
  /** 隐藏节点 ID 集合（折叠/搜索等） */
  hiddenNodeIds: null as (() => Set<string>) | null,
  /** 右键拖拽连线状态 */
  rightDragLink: null as { sourceId: string; x: number; y: number } | null,
  /** 用户是否正在拖拽视口（居中模式时避免抢夺控制权） */
  viewportDragging: false,
  /** 鼠标在世界坐标系中的位置 */
  mouseWorldX: 0,
  mouseWorldY: 0,

  /** 每帧重新检测鼠标下节点（防止节点移出后 hover 不更新） */
  reevaluateHover: null as (() => void) | null,

  /** 选中节点 tooltip 回调（由 ui-events 注入） */
  showNodeTooltip: null as ((note: string, canvasX: number, canvasY: number) => void) | null,
  hideNodeTooltip: null as (() => void) | null,

  /** 节点剪贴板（跨图复制粘贴） */
  nodeClipboard: null as { nodes: any[]; edges: any[] } | null,

  /** Remove all registered clearSelection handlers */
  resetClearSelection() { _clearSelectionFns = []; },
  /** Remove all registered setSelectedNodeIds handlers */
  resetSetSelectedNodeIds() { _setSelectedNodeIdsFns = []; },
};
