import { canvasPoint, hitTestNode, hitTestEdge, hitTestGroup } from "./geometry/hit";
import type { NodeTitleHitBounds } from './geometry/hit';
import { closeContextMenu, hasOpenContextMenu, showActionWheel, type ContextMenuItem } from "./ui-contextmenu";
import { GraphData } from "./data/storage";
import { sharedState } from "./shared-state";
import { PRESET_COLORS, setGraphColorOverride } from "./utils/color";
import { CanvasGestureState, NodeMembershipDragState } from "./canvas-gesture-state";
import { isStructureNode } from './structure-nodes';
import { semanticEdgePolyline } from './semantic-edge-grammar';
import { createCanvasMagnifier } from './canvas-magnifier';
import type { MagnifierCaptureRegion } from './canvas-magnifier';
import { createNodeNotePreview, type NodeNoteEdit } from './node-note-preview';
import { getNodeVisualRadius } from './node-radius';

const DRAG_THRESHOLD = 3;
const TOUCH_DRAG_THRESHOLD = 10;
const LONG_PRESS_DURATION = 500;
const BRANCH_DRAG_THRESHOLD = 28;
const NOTE_PREVIEW_DELAY = 320;

export interface CanvasBoxSelection {
  nodeIds: readonly string[];
  edges: ReadonlySet<GraphData['edges'][number]> | null;
}

export interface EventsContext {
  graph: GraphData;
  isInteractionEnabled?: () => boolean;
  onInteractionBlocked?: () => void;
  getSelNode: () => string | null;  setSelNode: (v: string | null) => void;
  getSelEdge: () => number | null;  setSelEdge: (v: number | null) => void;
  getSelGroup: () => string | null; setSelGroup: (v: string | null) => void;
  getSimulation: () => any;
  /** Exact node objects used by the current renderer when they differ from the simulation. */
  getVisibleNodes?: () => any[];
  /** Pane-local live title rectangles in world coordinates, including text scale. */
  getNodeTitleBounds?: (node: any, worldX?: number, worldY?: number) => NodeTitleHitBounds | null | undefined;
  getTransform: () => any;
  getCanvas: () => HTMLCanvasElement;
  captureMagnifierRegion?: (region: MagnifierCaptureRegion) => CanvasImageSource | null;
  getNodeExpand: () => number;
  getLineExpand: () => number;
  /** Curved semantic routes need the same geometry for drawing and hit testing. */
  getSemanticEdgeRouting?: () => boolean;
  getDraggingNode: () => any;       setDraggingNode: (n: any) => void;
  getWasDragged: () => boolean;     setWasDragged: (v: boolean) => void;
  draw: () => void;
  onContextMenu?: (type: 'blank'|'node'|'edge'|'group', id: string|null, x: number, y: number) => void;
  onTap?: (x: number, y: number, nodeId?: string) => void;
  canDoubleClickReadOnlyNode?: (id: string) => boolean;
  isFixedNode?: (id: string) => boolean;
  selectionBox?: HTMLDivElement;
  registerBoxSelectionReader?: (read: () => CanvasBoxSelection) => void;
  fixNodes?: (ids: string[]) => boolean | void;
  unfixNodes?: (ids: string[]) => boolean | void;
  triggerSave?: () => void;
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
  /** Starts only after a real node drag crosses its pointer-type threshold. Coordinates are world-space. */
  onNodeMembershipDragStart?: (id: string, x: number, y: number) => void;
  /** Reports world-space movement while a node-membership drag is active. */
  onNodeMembershipDragMove?: (id: string, x: number, y: number) => void;
  /** Completes a node-membership drag exactly once; cancelled is true for cancellation or disposal. */
  onNodeMembershipDragEnd?: (id: string, x: number, y: number, cancelled: boolean) => void;
  appShell?: HTMLElement;
  viewport?: any;
  getLinkMode?: () => boolean;
  getLinkSrc?: () => string | null;
  onLinkCursorMove?: (x: number, y: number) => void;
  initSim?: () => void;
  clearEd?: () => void;
  fillNode?: (id: string) => void;
  fillEdge?: (idx: number) => void;
  // Drag scale feedback
  setDragScale?: (nodeId: string | null, scale: number) => void;
  /** 悬停多媒体节点：id → 展示临时框；null → 隐藏 */
  onMediaHover?: (nodeId: string | null) => void;
  // 右键拖拽连线
  onCreateEdge?: (sourceId: string, targetId: string, shiftKey?: boolean) => void;
  /** A deliberate link drag ending on empty canvas grows a new linked thought. */
  onCreateLinkedNode?: (sourceId: string, x: number, y: number, shiftKey?: boolean) => void;
  // 格点吸附（框选矩形对齐网格）
  getGridSnapEnabled?: () => boolean;
  getGridSp?: () => number;
  getHiddenNodeIds?: () => Set<string>;
  /** True when an expanded structure's ordinary simulation circle is replaced by a boundary. */
  isStructureBoundaryNode?: (id: string) => boolean;
  /** Boundary title anchors used only as persistent-edge endpoints. */
  getStructureBoundaryEndpoints?: () => any[];
  /** 移动端工具栏框选模式 */
  getBoxSelectMode?: () => boolean;
  setBoxSelectMode?: (v: boolean) => void;
  /** 卡片模式下节点拖拽后保持 pin */
  isCardGridMode?: () => boolean;
  /** 卡片模式下节点拖拽时钳制到卡片边界（沿边滑行） */
  clampNodeDrag?: (id: string, x: number, y: number) => [number, number];
  /** 将框选节点收束为一个结构节点 */
  createStructure?: (ids: string[]) => Promise<void> | void;
  /** Deletes nodes through the runtime-level structure guard and transaction. */
  deleteNodes?: (ids: string[]) => Promise<boolean> | boolean;
  /** Expanded-structure boundary hit test; the interior deliberately returns null. */
  hitStructureBoundary?: (worldX: number, worldY: number) => string | null;
  /** Updates pane-local boundary hover state. */
  onStructureBoundaryHover?: (id: string | null) => void;
  /** Selects an expanded structure through its boundary body. */
  onStructureBoundaryTap?: (id: string) => void;
  /** 桌面端双击节点或边界，由调用方决定是否进入结构视图。 */
  onNodeDoubleClick?: (id: string) => void;
  onNodeTitleTap?: (id: string) => boolean;
  onNodeTitleDoubleClick?: (id: string) => boolean;
  beginNodeNoteEdit?: (id: string) => NodeNoteEdit | null;
  /** Pane-private proxies may be selected but cannot be mutated or linked. */
  isReadOnlyNode?: (id: string) => boolean;
  isReadOnlyEdge?: (index: number) => boolean;
  getOriginalEdgeIndex?: (projectedIndex: number) => number | null;
  deleteEdges?: (projectedIndexes: number[]) => Promise<boolean> | boolean;
  onReadOnlySelection?: (kind: 'node' | 'edge') => void;
}

export type CanvasEventsDisposer = () => void;

export function setupCanvasEvents(
  canvas: HTMLCanvasElement,
  ctx: EventsContext
): CanvasEventsDisposer {
  const {
    graph, getSelNode, setSelNode, getSelEdge, setSelEdge, getSelGroup, setSelGroup,
    getSimulation, getTransform,
    getNodeExpand, getLineExpand,
    getDraggingNode, setDraggingNode, getWasDragged, setWasDragged,
    draw, onContextMenu: onAppContextMenu, isFixedNode
  } = ctx;
  // 坐标转换：统一用 canvas 偏移校正
  // 过滤隐藏节点（折叠/搜索），返回可见节点列表
  // Card/scoped layouts may render graph-owned nodes while retaining a
  // simulation-compatible object for legacy commands. Hit testing must use
  // the rendered source or invisible, still-moving simulation nodes produce
  // ghost hover and drag targets after the canvas settles.
  const _rawSimNodes = () => ctx.getVisibleNodes?.() ?? getSimulation()?.nodes() ?? [];
  const visibleNodes = () => {
    const all = _rawSimNodes();
    const hidden = ctx.getHiddenNodeIds?.();
    if (!hidden?.size && !ctx.isStructureBoundaryNode) return all;
    return all.filter((n: any) => !hidden?.has(n.id) && !ctx.isStructureBoundaryNode?.(n.id));
  };
  const edgeNodes = () => visibleNodes().concat(ctx.getStructureBoundaryEndpoints?.() ?? []);
  const nodeHitOptions = { titleBounds: (node: any, x: number, y: number) => ctx.getNodeTitleBounds?.(node, x, y) };
  const edgeHitOptions = () => ctx.getSemanticEdgeRouting?.()
    ? { routePoints: semanticEdgePolyline }
    : undefined;

  const toWorldPos = (e: { clientX: number; clientY: number }): [number, number] => {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    if (ctx.viewport) {
      const p = ctx.viewport.toWorld(sx, sy);
      return [p.x, p.y];
    }
    const t = getTransform();
    return [(sx - t.x) / t.k, (sy - t.y) / t.k];
  };
  const worldToScreen = (wx: number, wy: number): [number, number] => {
    const rect = canvas.getBoundingClientRect();
    if (ctx.viewport) {
      const p = ctx.viewport.toScreen(wx, wy);
      return [p.x + rect.left, p.y + rect.top];
    }
    const t = getTransform();
    return [wx * t.k + t.x + rect.left, wy * t.k + t.y + rect.top];
  };

  const notePreview = createNodeNotePreview(ctx.appShell ?? document.body);
  let hoveredNoteId: string | null = null;
  let noteTimer: ReturnType<typeof setTimeout> | undefined;
  const resetNoteHover = () => {
    clearTimeout(noteTimer);
    noteTimer = undefined;
    hoveredNoteId = null;
  };
  const hideNotePreview = () => {
    resetNoteHover();
    notePreview.hide();
  };
  const leaveNotePreview = () => {
    resetNoteHover();
    notePreview.hideSoon();
  };
  const magnifier = createCanvasMagnifier(
    canvas,
    () => Number(getTransform()?.k ?? 1),
    ctx.captureMagnifierRegion,
    hideNotePreview,
  );
  const queueNotePreview = (id: string) => {
    if (hoveredNoteId === id) { notePreview.keep(); return; }
    leaveNotePreview();
    hoveredNoteId = id;
    noteTimer = setTimeout(() => {
      noteTimer = undefined;
      const live = hitTestNode(sharedState.mouseWorldX, sharedState.mouseWorldY, visibleNodes(), getNodeExpand(), nodeHitOptions);
      if (hasOpenContextMenu() || live?.id !== id || typeof live.note !== 'string' || !live.note.trim()) {
        hideNotePreview();
        return;
      }
      const radius = live._semanticCard?.form === 'card' ? live._semanticCard.width / 2 : getNodeVisualRadius(live);
      const [x, y] = worldToScreen(live.x, live.y);
      const [right] = worldToScreen(live.x + radius, live.y);
      const edit = ctx.beginNodeNoteEdit && !ctx.isReadOnlyNode?.(id) ? () => ctx.beginNodeNoteEdit!(id) : undefined;
      notePreview.show(live.label ?? '', live.note, x, y, Math.abs(right - x), canvas.getBoundingClientRect(), edit);
    }, NOTE_PREVIEW_DELAY);
  };
  canvas.addEventListener('wheel', hideNotePreview, { passive: true });
  window.addEventListener('blur', hideNotePreview);

  let downPoint: [number, number] | null = null;
  const pointerGesture = new CanvasGestureState();
  const membershipDrag = new NodeMembershipDragState();
  const nodeDragKind = (node: { id: string }) => {
    if (!ctx.isReadOnlyNode?.(node.id)) return 'editable';
    return graph.settings?.sourceMode === 'vault-readonly' ? 'projection' : null;
  };
  let projectionDrag: { node: any; x: number; y: number } | null = null;
  const restoreProjectionDrag = () => {
    if (!projectionDrag) return false;
    const { node, x, y } = projectionDrag;
    node.x = x;
    node.y = y;
    projectionDrag = null;
    return true;
  };
  const cancelDraggedPosition = (node: any) => {
    if (restoreProjectionDrag()) return;
    node.fx = null;
    node.fy = null;
    getSimulation()?.alphaTarget(0);
  };
  // Only editable drags start the graph mutation lifecycle.
  let nodeDragStarted = false;
  const endMembershipDrag = (cancelled: boolean, event?: { clientX: number; clientY: number }) => {
    const result = event
      ? (() => { const [x, y] = toWorldPos(event); return membershipDrag.end(x, y, cancelled); })()
      : cancelled
        ? membershipDrag.cancel()
        : null;
    if (result) ctx.onNodeMembershipDragEnd?.(result.nodeId, result.x, result.y, result.cancelled);
  };
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  const clearLongPress = () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } };
  const pendingTimers = new Set<ReturnType<typeof setTimeout>>();
  const scheduleTimeout = (callback: () => void, delay: number) => {
    let timer: ReturnType<typeof setTimeout>;
    timer = setTimeout(() => { pendingTimers.delete(timer); callback(); }, delay);
    pendingTimers.add(timer);
    return timer;
  };

  // --- 右键拖拽连线状态 ---
  let rightDragSource: string | null = null;
  let rightDragged = false;
  let suppressContextMenu = false; // 拖拽连线期间 + 松手后下一帧抑制右键菜单
  const canGrowBranchAt = (x: number, y: number, clientX: number, clientY: number): boolean => {
    if (!downPoint || !ctx.onCreateLinkedNode) return false;
    const rect = canvas.getBoundingClientRect();
    const distance = Math.hypot(x - downPoint[0], y - downPoint[1]) * Number(getTransform()?.k ?? 1);
    return distance >= BRANCH_DRAG_THRESHOLD
      && clientX >= rect.left && clientX <= rect.right
      && clientY >= rect.top && clientY <= rect.bottom
      && !ctx.hitStructureBoundary?.(x, y);
  };
  const cancelRightDragLink = () => {
    rightDragSource = null;
    rightDragged = false;
    sharedState.rightDragLink = null;
    suppressContextMenu = true;
    lastBoxUpTime = Date.now();
    downPoint = null;
    if (ctx.viewport && !ctx.isCardGridMode?.()) ctx.viewport.pause = false;
    canvas.style.cursor = 'grab';
    draw();
  };
  const onCancelLinkKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !rightDragSource) return;
    cancelRightDragLink();
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  document.addEventListener('keydown', onCancelLinkKey);

  // --- 框选状态 ---
  const BOX_MIN_SIZE = 5;
  let isRightButtonDown = false;
  let isBoxSelecting = false;
  let boxStart: [number, number] | null = null;
  let lastBoxUpTime = 0;
  let selectedNodeIds: string[] = [];
  let boxSelectionNodes: GraphData['nodes'] | null = null;
  let boxSelectionEdges: GraphData['edges'] | null = null;
  let boxSelectedEdges: CanvasBoxSelection['edges'] = null;
  ctx.registerBoxSelectionReader?.(() => ({
    nodeIds: boxSelectionNodes === graph.nodes ? selectedNodeIds : [],
    edges: boxSelectionEdges === graph.edges ? boxSelectedEdges : null,
  }));

  const clearBoxSelection = () => {
    const changed = selectedNodeIds.length > 0 || boxSelectedEdges !== null;
    selectedNodeIds = [];
    boxSelectionNodes = null;
    boxSelectionEdges = null;
    boxSelectedEdges = null;
    return changed;
  };
  // 移动端 Pointer 框选
  let pointerBoxStart: [number, number] | null = null;
  // 框选：节点 + 边的命中测试
  const getSelectionInRect = (x1: number, y1: number, x2: number, y2: number) => {
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
    const rawNodes = getSimulation()?.nodes() || [];
    const hidden = ctx.getHiddenNodeIds?.() ?? new Set();
    const selNodes = rawNodes.filter((n: any) =>
      !hidden.has(n.id) && n.x >= minX && n.x <= maxX && n.y >= minY && n.y <= maxY
    );

    // 线段与矩形相交检测
    const segmentIntersectsRect = (ax: number, ay: number, bx: number, by: number): boolean => {
      // 至少一端在矩形内
      if ((ax >= minX && ax <= maxX && ay >= minY && ay <= maxY) ||
          (bx >= minX && bx <= maxX && by >= minY && by <= maxY)) return true;
      // 与矩形四边求交
      const lineIntersects = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number): boolean => {
        const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(d) < 1e-10) return false;
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / d;
        return t >= 0 && t <= 1 && u >= 0 && u <= 1;
      };
      return lineIntersects(ax, ay, bx, by, minX, minY, maxX, minY)   // top
          || lineIntersects(ax, ay, bx, by, maxX, minY, maxX, maxY)   // right
          || lineIntersects(ax, ay, bx, by, maxX, maxY, minX, maxY)   // bottom
          || lineIntersects(ax, ay, bx, by, minX, maxY, minX, minY);  // left
    };

    // 边：线段与框相交即选中（用全量节点做端点坐标查找）
    const selEdges: { edge: any; idx: number }[] = [];
    ctx.graph.edges.forEach((e: any, idx: number) => {
      const src = typeof e.source === 'object' ? e.source.id : e.source;
      const tgt = typeof e.target === 'object' ? e.target.id : e.target;
      const sn = rawNodes.find((n: any) => n.id === src);
      const tn = rawNodes.find((n: any) => n.id === tgt);
      if (sn && tn && segmentIntersectsRect(sn.x, sn.y, tn.x, tn.y)) {
        selEdges.push({ edge: e, idx });
      }
    });
    return { nodes: selNodes, edges: selEdges };
  };

  const showBoxMenu = (selNodes: any[], selEdges: { edge: any; idx: number }[], clientX: number, clientY: number) => {
    clearBoxSelection();
    // 仅选中一根边、无节点 → 直接进编辑栏
    if (selNodes.length === 0 && selEdges.length === 1) {
      const index = selEdges[0].idx;
      ctx.setSelEdge?.(index);
      if (ctx.isReadOnlyEdge?.(index)) ctx.onReadOnlySelection?.('edge');
      else ctx.fillEdge?.(index);
      return;
    }
    // 无节点且无边不弹菜单
    if (selNodes.length === 0 && selEdges.length === 0) return;
    const ids = selNodes.map((n: any) => n.id);
    const selectedIds = new Set(ids);
    const selectedGraphNodes = graph.nodes;
    boxSelectionNodes = selectedGraphNodes;
    selectedNodeIds = ids;
    boxSelectionEdges = graph.edges;
    const selectedEdges = new Set(selEdges.map(({ edge }) => edge));
    if (selectedEdges.size) boxSelectedEdges = selectedEdges;
    draw();
    const fixedCount = ids.filter(id => ctx.isFixedNode?.(id)).length;
    const unfixedCount = selNodes.length - fixedCount;
    const items: ContextMenuItem[] = [];
    if (selNodes.length > 0) {
      const mutableIds = ids.filter(id => !ctx.isReadOnlyNode?.(id));
      const hasReadOnlyNodes = mutableIds.length !== ids.length;
      const structureEligible = !hasReadOnlyNodes && ids.length >= 2 && selNodes.every((node: any) => !isStructureNode(node) && !node.structureParentId);
      if (structureEligible && ctx.createStructure) {
        items.push({ label: `收束为结构 (${ids.length})`, icon: 'fold', action: () => { void ctx.createStructure?.([...ids]); } });
      }
      const changeFixed = (pin: boolean) => {
        if (graph.nodes !== selectedGraphNodes) return;
        const changed = pin ? ctx.fixNodes?.(ids) : ctx.unfixNodes?.(ids);
        if (changed !== false && clearBoxSelection()) draw();
      };
      if (!hasReadOnlyNodes && unfixedCount > 0) items.push({ label: `固定 (${unfixedCount})`, icon: 'pin', action: () => changeFixed(true) });
      if (!hasReadOnlyNodes && fixedCount > 0) items.push({ label: `解除固定 (${fixedCount})`, icon: 'pin', action: () => changeFixed(false) });
      if (!hasReadOnlyNodes && ctx.deleteNodes) items.push({ label: `删除节点 (${ids.length})`, icon: 'delete', destructive: true, action: () => {
        void Promise.resolve(ctx.deleteNodes?.([...ids])).then(deleted => {
          if (!deleted) return;
          clearBoxSelection();
          ctx.clearEd?.();
          draw();
        });
      }});
      // 复制所选
      if (!hasReadOnlyNodes) items.push({
        label: `复制所选 (${ids.length})`,
        icon: 'duplicate',
        action: () => {
          const selNs = ctx.graph.nodes.filter((n: any) => selectedIds.has(n.id));
          const selEs = ctx.graph.edges.filter((e: any) => {
            const s = typeof e.source === 'object' ? e.source.id : e.source;
            const t = typeof e.target === 'object' ? e.target.id : e.target;
            return selectedIds.has(s) && selectedIds.has(t);
          });
          sharedState.nodeClipboard = {
            nodes: JSON.parse(JSON.stringify(selNs)),
            edges: JSON.parse(JSON.stringify(selEs)),
          };
          closeContextMenu();
          if (sharedState.clearSelection) sharedState.clearSelection();
        },
      });
      if (!hasReadOnlyNodes) items.push({ label: '批量标签', icon: 'tag', action: async () => {
        const { safePrompt } = await import('./dialog');
        const tag = await safePrompt('标签名：');
        if (!tag || graph.nodes !== selectedGraphNodes) return;
        for (const id of ids) {
          const n = ctx.graph.nodes.find((n: any) => n.id === id);
          if (n) {
            if (!n.tags) n.tags = [];
            if (n.tags.includes(tag)) {
              n.tags = n.tags.filter((t: string) => t !== tag);
            } else {
              n.tags.push(tag);
            }
          }
        }
        clearBoxSelection();
        ctx.triggerSave?.();
        draw();
      }});
      if (!hasReadOnlyNodes) items.push({
        label: '批量颜色',
        icon: 'color',
        children: PRESET_COLORS.map(color => ({
          label: color,
          swatch: color,
          action: () => {
            if (graph.nodes !== selectedGraphNodes) return;
            for (const node of ctx.graph.nodes) if (selectedIds.has(node.id)) setGraphColorOverride(node, color);
            ctx.triggerSave?.();
          },
        })),
      });
    }
    if (selEdges.length > 0 && selEdges.every(edge => !ctx.isReadOnlyEdge?.(edge.idx)) && ctx.deleteEdges) {
      items.push({ label: `删除连线 (${selEdges.length})`, icon: 'delete', destructive: true, action: () => {
        const indices = graph.edges.flatMap((edge, index) => selectedEdges.has(edge) ? [index] : []);
        if (indices.length !== selectedEdges.size) return;
        void Promise.resolve(ctx.deleteEdges?.(indices)).then(deleted => {
          if (!deleted) return;
          clearBoxSelection();
          ctx.clearEd?.();
          draw();
        });
      }});
    }
    const host = ctx.appShell ?? document.body;
    const { left, top } = host.getBoundingClientRect();
    showActionWheel(host, clientX - left, clientY - top, items, { label: '选区操作' });
  };

  // 连接到 sharedState
  const disposeSelectionHandlers = sharedState.registerSelectionHandlers(
    () => selectedNodeIds,
    () => { if (clearBoxSelection()) draw(); },
    (ids: string[]) => { clearBoxSelection(); boxSelectionNodes = graph.nodes; selectedNodeIds = ids; draw(); },
  );

  const triggerContextMenu = (screenX: number, screenY: number) => {
    if (clearBoxSelection()) draw();
    const [cx, cy] = toWorldPos({ clientX: screenX, clientY: screenY });
    const nodes = visibleNodes() || [];
    const n = hitTestNode(cx, cy, nodes, getNodeExpand(), nodeHitOptions);
    if (n) { onAppContextMenu?.('node', n.id, screenX, screenY); return; }
    const structureId = ctx.hitStructureBoundary?.(cx, cy);
    if (structureId) { onAppContextMenu?.('node', structureId, screenX, screenY); return; }
    const eIdx = hitTestEdge(cx, cy, graph.edges, edgeNodes(), getLineExpand(), edgeHitOptions());
    if (eIdx !== null) { onAppContextMenu?.('edge', String(eIdx), screenX, screenY); return; }
    const g = hitTestGroup(cx, cy, graph.groups, nodes);
    if (g) { onAppContextMenu?.('group', g.id, screenX, screenY); return; }
    onAppContextMenu?.('blank', null, screenX, screenY);
  };

  const onDoubleClick = (e: MouseEvent) => {
    // Touch interactions intentionally use the long-press menu rather than dblclick.
    const [x, y] = toWorldPos(e);
    const node = hitTestNode(x, y, [...visibleNodes()].reverse(), getNodeExpand(), nodeHitOptions);
    const structureId = node ? null : ctx.hitStructureBoundary?.(x, y);
    const targetId = node?.id ?? structureId;
    if (!targetId || (ctx.isReadOnlyNode?.(targetId) && !ctx.canDoubleClickReadOnlyNode?.(targetId))) return;
    e.preventDefault();
    e.stopPropagation();
    if (node && ctx.getNodeTitleBounds?.(node, x, y) && ctx.onNodeTitleDoubleClick?.(targetId)) return;
    ctx.onNodeDoubleClick?.(targetId);
  };
  canvas.addEventListener("dblclick", onDoubleClick);

  const handleTap = (x: number, y: number, nodeId?: string) => {
    clearBoxSelection();
    const nodes = visibleNodes() || [];
    const n = nodeId ? nodes.find((candidate: any) => candidate.id === nodeId) ?? null : hitTestNode(x, y, nodes, getNodeExpand(), nodeHitOptions);
    const structureId = n ? null : ctx.hitStructureBoundary?.(x, y);
    if (structureId) {
      ctx.onStructureBoundaryTap?.(structureId);
      if (!ctx.onStructureBoundaryTap) {
        setSelNode(structureId); setSelEdge(null); setSelGroup(null); draw();
      }
      return;
    }
    // 如果外部提供了 onTap 回调，使用它（集成编辑面板等）
    if (ctx.onTap) { ctx.onTap(x, y, n?.id); return; }
    if (n) { setSelNode(n.id); setSelEdge(null); setSelGroup(null); draw(); return; }
    const eIdx = hitTestEdge(x, y, graph.edges, edgeNodes(), getLineExpand(), edgeHitOptions());
    if (eIdx !== null) { setSelNode(null); setSelEdge(eIdx); setSelGroup(null); draw(); return; }
    const g = hitTestGroup(x, y, graph.groups, nodes);
    if (g) { setSelNode(null); setSelEdge(null); setSelGroup(g.id); draw(); return; }
    setSelNode(null); setSelEdge(null); setSelGroup(null); draw();
  };

  // 视口拖拽时取消长按（修复在集合光晕区域左键拖动触发右键菜单的问题）
  let viewportDragging = false;
  const onViewportDragStart = () => { viewportDragging = true; clearLongPress(); hideNotePreview(); };
  const onViewportDragEnd = () => { viewportDragging = false; };
  if (ctx.viewport) {
    ctx.viewport.on('drag-start', onViewportDragStart);
    ctx.viewport.on('drag-end', onViewportDragEnd);
  }

  const onPointerDown = (e: PointerEvent) => {
    if (ctx.isInteractionEnabled?.() === false) {
      e.preventDefault();
      e.stopImmediatePropagation();
      ctx.onInteractionBlocked?.();
      return;
    }
    closeContextMenu(); hideNotePreview();
    if (clearBoxSelection()) draw();
    const [x, y] = toWorldPos(e);
    downPoint = [x, y];
    if (e.button === 2) {
      e.preventDefault(); e.stopImmediatePropagation();
      // 右键点到节点 → 开始拖拽连线
      const nodes = visibleNodes();
      const hit = hitTestNode(x, y, nodes, getNodeExpand(), nodeHitOptions);
      if (hit && !ctx.isReadOnlyNode?.(hit.id)) {
        rightDragSource = hit.id;
        rightDragged = false;
        suppressContextMenu = true;
        sharedState.rightDragLink = { sourceId: hit.id, x, y };
        if (ctx.viewport) ctx.viewport.pause = true;
        return;
      }
      isRightButtonDown = true;
      isBoxSelecting = false;
      // 格点吸附：框选起点对齐网格
      const snap = (v: number) => {
        const sp = ctx.getGridSp?.() || 30;
        return ctx.getGridSnapEnabled?.() ? Math.round(v / sp) * sp : v;
      };
      boxStart = [snap(x), snap(y)];
      if (ctx.viewport) ctx.viewport.pause = true;
      return;
    }
    if (e.button !== 0) return;

    // 第二根触点交回 pixi-viewport 处理 pinch，并取消单指候选手势。
    if (pointerGesture.pointerId !== null) {
      const cancelledBoxSelect = pointerGesture.mode === 'box-select';
      clearLongPress();
      pointerGesture.cancel();
      pointerBoxStart = null;
      if (ctx.selectionBox) ctx.selectionBox.style.display = 'none';
      if (cancelledBoxSelect) ctx.setBoxSelectMode?.(false);
      if (ctx.viewport) ctx.viewport.pause = false;
      if (getDraggingNode()) {
        const draggingNode = getDraggingNode();
        ctx.setDragScale?.(draggingNode.id, 1.0);
        cancelDraggedPosition(draggingNode);
        setDraggingNode(null);
        endMembershipDrag(true);
        if (nodeDragStarted) {
          ctx.onDragEnd?.();
          nodeDragStarted = false;
        }
        setWasDragged(false);
        draw();
      }
      downPoint = null;
      return;
    }

    const nodes = visibleNodes();
    const node = hitTestNode(x, y, nodes, getNodeExpand(), nodeHitOptions);
    const boxSelect = !!ctx.getBoxSelectMode?.();
    if (!node) sharedState.focusHoverNodeId = null;
    // 卡片模式的非节点区域由 capture 阶段的 CardGrid 手势独占。
    if (ctx.isCardGridMode?.() && !node && !boxSelect) {
      downPoint = null;
      return;
    }
    const threshold = e.pointerType === 'touch' ? TOUCH_DRAG_THRESHOLD : DRAG_THRESHOLD;
    const draggable = node && nodeDragKind(node) !== null;
    pointerGesture.begin(e.pointerId, e.clientX, e.clientY, node?.id ?? null, boxSelect, threshold, Boolean(draggable));
    setWasDragged(false);
    clearLongPress();

    if (boxSelect) {
      pointerBoxStart = [x, y];
      if (ctx.viewport) ctx.viewport.pause = true;
      e.preventDefault();
      e.stopImmediatePropagation();
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      return;
    }

    longPressTimer = setTimeout(() => {
      if (pointerGesture.markLongPress(e.pointerId) && !getDraggingNode() && !viewportDragging) {
        triggerContextMenu(e.clientX, e.clientY);
      }
      clearLongPress();
    }, LONG_PRESS_DURATION);

    if (draggable) {
      if (ctx.viewport) ctx.viewport.pause = true;
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    }
  };
  canvas.addEventListener("pointerdown", onPointerDown, { capture: true, passive: false });

  const onPointerMove = (e: PointerEvent) => {
    const [mx, my] = toWorldPos(e);
    sharedState.mouseWorldX = mx; sharedState.mouseWorldY = my;
    const nodes = visibleNodes();
    const hoverNode = nodes ? hitTestNode(mx, my, nodes, getNodeExpand(), nodeHitOptions) : null;
    const hoverStructureId = hoverNode ? null : ctx.hitStructureBoundary?.(mx, my) ?? null;
    sharedState.hoverNodeId = hoverNode ? hoverNode.id : null;
    ctx.onStructureBoundaryHover?.(hoverStructureId);
    if (hoverNode) sharedState.focusHoverNodeId = hoverNode.id;
    if (hoverNode?.mediaType) {
      ctx.onMediaHover?.(hoverNode.id);
    } else {
      ctx.onMediaHover?.(null);
    }
    if (sharedState.focusMode && sharedState.directDraw) sharedState.directDraw();
    const inLinkMode = ctx.getLinkMode?.() && ctx.getLinkSrc?.();
    // 右键拖拽连线
    if (rightDragSource) {
      if (downPoint && Math.hypot(mx - downPoint[0], my - downPoint[1]) >= DRAG_THRESHOLD) {
        rightDragged = true;
      }
      sharedState.rightDragLink = { sourceId: rightDragSource, x: mx, y: my };
      canvas.style.cursor = rightDragged && hoverNode && hoverNode.id !== rightDragSource && !ctx.isReadOnlyNode?.(hoverNode.id) ? "copy" : "crosshair";
      draw();
      return;
    }

    const gestureMove = pointerGesture.move(e.pointerId, e.clientX, e.clientY);
    if (gestureMove?.moved) clearLongPress();
    if (gestureMove?.mode === 'box-select' && pointerBoxStart) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (gestureMove.moved && ctx.selectionBox) {
        const [scrX1, scrY1] = worldToScreen(pointerBoxStart[0], pointerBoxStart[1]);
        const [scrX2, scrY2] = worldToScreen(mx, my);
        const parentRect = ctx.appShell!.getBoundingClientRect();
        ctx.selectionBox.style.display = 'block';
        ctx.selectionBox.style.left = `${Math.min(scrX1, scrX2) - parentRect.left}px`;
        ctx.selectionBox.style.top = `${Math.min(scrY1, scrY2) - parentRect.top}px`;
        ctx.selectionBox.style.width = `${Math.abs(scrX2 - scrX1)}px`;
        ctx.selectionBox.style.height = `${Math.abs(scrY2 - scrY1)}px`;
      }
      return;
    }
    if (gestureMove?.startedNodeDrag) {
      const node = visibleNodes().find((candidate: any) => candidate.id === pointerGesture.targetNodeId);
      const kind = node && nodeDragKind(node);
      if (kind) {
        setDraggingNode(node);
        setWasDragged(true);
        ctx.setDragScale?.(node.id, 1.1);
        if (kind === 'projection') {
          projectionDrag = { node, x: node.x, y: node.y };
        } else {
          node.fx = node.x; node.fy = node.y;
          if (!ctx.isCardGridMode?.()) getSimulation()?.alphaTarget(0.3).restart();
          ctx.onDragStart?.(node.id);
          const membershipStart = membershipDrag.start(node.id, mx, my);
          if (membershipStart) {
            nodeDragStarted = true;
            ctx.onNodeMembershipDragStart?.(membershipStart.nodeId, membershipStart.x, membershipStart.y);
          }
        }
      }
    }
    if (gestureMove?.mode === 'pending-node' || gestureMove?.mode === 'node-drag') {
      e.preventDefault();
    }

    if (getDraggingNode()) { canvas.style.cursor = "grabbing"; }
    else if (inLinkMode && hoverNode) { canvas.style.cursor = "crosshair"; }
    else if (inLinkMode) { canvas.style.cursor = "crosshair"; }
    else if (hoverNode || hoverStructureId) { canvas.style.cursor = "pointer"; }
    else { canvas.style.cursor = "grab"; }
    if (gestureMove?.mode === 'node-drag' && getDraggingNode()) {
      if (downPoint) { if (Math.hypot(mx - downPoint[0], my - downPoint[1]) >= DRAG_THRESHOLD) setWasDragged(true); }
      const draggedNode = getDraggingNode();
      const clamped = ctx.clampNodeDrag ? ctx.clampNodeDrag(draggedNode.id, mx, my) : [mx, my];
      // Keep the exact object selected by hit testing under the pointer. Force
      // layouts normally copy fx/fy into x/y on their next tick, but card
      // layouts use a small local simulation node; relying on that copy leaves
      // the visible node behind while an invisible collider follows the mouse.
      draggedNode.x = clamped[0]; draggedNode.y = clamped[1];
      if (projectionDrag) {
        draw();
      } else {
        draggedNode.fx = clamped[0]; draggedNode.fy = clamped[1];
        if (!ctx.isCardGridMode?.()) getSimulation()?.alpha(0.3).restart();
        const membershipMove = membershipDrag.move(draggedNode.id, mx, my);
        if (membershipMove) ctx.onNodeMembershipDragMove?.(membershipMove.nodeId, membershipMove.x, membershipMove.y);
      }
    }
    // 空白区域拖动由 viewport 处理；这里只取消候选长按。
    if (gestureMove?.mode === 'viewport-pan' && gestureMove.moved) clearLongPress();
    if (ctx.onLinkCursorMove && ctx.getLinkMode?.() && ctx.getLinkSrc?.()) {
      ctx.onLinkCursorMove(mx, my);
    }
    if (e.pointerType !== 'touch' && !e.buttons && !e.ctrlKey && !e.metaKey && !inLinkMode && !viewportDragging && !hasOpenContextMenu()
      && !getDraggingNode() && typeof hoverNode?.note === 'string' && hoverNode.note.trim()) {
      queueNotePreview(hoverNode.id);
    } else if (hoveredNoteId !== null) leaveNotePreview();

    // --- 右键框选 ---
    // 格点吸附：鼠标端也对齐网格
    const snapEnd = (v: number) => {
      const sp = ctx.getGridSp?.() || 30;
      return (ctx.getGridSnapEnabled?.() && boxStart) ? Math.round(v / sp) * sp : v;
    };
    const bx2 = snapEnd(mx), by2 = snapEnd(my);
    if (isRightButtonDown && !isBoxSelecting && boxStart) {
      const [sx1, sy1] = worldToScreen(boxStart[0], boxStart[1]);
      const [sx2, sy2] = worldToScreen(bx2, by2);
      if (Math.hypot(sx2 - sx1, sy2 - sy1) >= BOX_MIN_SIZE) {
        isBoxSelecting = true;
        if (ctx.selectionBox) ctx.selectionBox.style.display = 'block';
      }
    }
    if (isBoxSelecting && ctx.selectionBox && boxStart) {
      const parentRect = ctx.appShell!.getBoundingClientRect();
      const [sx1, sy1] = worldToScreen(boxStart[0], boxStart[1]);
      const [sx2, sy2] = worldToScreen(bx2, by2);
      ctx.selectionBox.style.left = (Math.min(sx1, sx2) - parentRect.left) + 'px';
      ctx.selectionBox.style.top = (Math.min(sy1, sy2) - parentRect.top) + 'px';
      ctx.selectionBox.style.width = Math.abs(sx2 - sx1) + 'px';
      ctx.selectionBox.style.height = Math.abs(sy2 - sy1) + 'px';
      return;
    }
  };
  canvas.addEventListener("pointermove", onPointerMove);

  const onPointerUp = (e: PointerEvent) => {
    if (rightDragSource === null && !isRightButtonDown && pointerGesture.pointerId !== e.pointerId) return;
    // 右键拖拽连线释放（不依赖 e.button，部分平台 pointerup 时 button 为 0）
    if (rightDragSource) {
      const [mx, my] = toWorldPos(e);
      const nodes = visibleNodes();
      const target = hitTestNode(mx, my, nodes, getNodeExpand(), nodeHitOptions);
      if (rightDragged && target && target.id !== rightDragSource && !ctx.isReadOnlyNode?.(target.id)) {
        const exists = graph.edges.some((ed: any) => {
          const src = typeof ed.source === 'object' ? ed.source.id : ed.source;
          const tgt = typeof ed.target === 'object' ? ed.target.id : ed.target;
          return (src === rightDragSource && tgt === target.id) || (src === target.id && tgt === rightDragSource);
        });
        if (!exists) ctx.onCreateEdge?.(rightDragSource, target.id, e.shiftKey);
      } else if (rightDragged && !target && canGrowBranchAt(mx, my, e.clientX, e.clientY)) {
        ctx.onCreateLinkedNode?.(rightDragSource, mx, my, e.shiftKey);
      } else if (!rightDragged) {
        triggerContextMenu(e.clientX, e.clientY);
      }
      rightDragSource = null;
      rightDragged = false;
      sharedState.rightDragLink = null;
      suppressContextMenu = true;
      lastBoxUpTime = Date.now();
      if (ctx.viewport && !ctx.isCardGridMode?.()) ctx.viewport.pause = false;
      draw();
      e.preventDefault(); e.stopImmediatePropagation(); return;
    }
    if (e.button === 2) {
      if (isRightButtonDown) {
        isRightButtonDown = false;
        if (ctx.viewport && !ctx.isCardGridMode?.()) ctx.viewport.pause = false;
        if (isBoxSelecting) {
          isBoxSelecting = false;
          if (ctx.selectionBox) ctx.selectionBox.style.display = 'none';
          if (boxStart) {
            const sp = ctx.getGridSp?.() || 30;
            const snapV = (v: number) => ctx.getGridSnapEnabled?.() ? Math.round(v / sp) * sp : v;
            const [mx, my] = toWorldPos(e);
            const sel = getSelectionInRect(boxStart[0], boxStart[1], snapV(mx), snapV(my));
            showBoxMenu(sel.nodes, sel.edges, e.clientX, e.clientY);
          }
          boxStart = null;
          lastBoxUpTime = Date.now();
        } else {
          triggerContextMenu(e.clientX, e.clientY);
        }
      }
      e.preventDefault(); e.stopImmediatePropagation(); return;
    }

    clearLongPress();
    const gestureEnd = pointerGesture.end(e.pointerId);
    if (!gestureEnd) return;

    if (gestureEnd.mode === 'box-select') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (ctx.selectionBox) ctx.selectionBox.style.display = 'none';
      if (pointerBoxStart && gestureEnd.moved) {
        const [mx, my] = toWorldPos(e);
        const sel = getSelectionInRect(pointerBoxStart[0], pointerBoxStart[1], mx, my);
        showBoxMenu(sel.nodes, sel.edges, e.clientX, e.clientY);
      }
      pointerBoxStart = null;
      ctx.setBoxSelectMode?.(false);
      if (ctx.viewport && !ctx.isCardGridMode?.()) ctx.viewport.pause = false;
      downPoint = null;
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      return;
    }

    if (getDraggingNode()) {
      const node = getDraggingNode();
      ctx.setDragScale?.(node.id, 1.0);
      if (!restoreProjectionDrag()) {
        if (getWasDragged() && isFixedNode && isFixedNode(node.id)) {
          const graphNode = ctx.graph.nodes.find((candidate: any) => candidate.id === node.id);
          if (graphNode) { graphNode.fx = node.fx; graphNode.fy = node.fy; graphNode.x = node.x; graphNode.y = node.y; }
          ctx.triggerSave?.();
        } else if (ctx.isCardGridMode?.()) {
          node.fx = null; node.fy = null;
          const graphNode = ctx.graph.nodes.find((candidate: any) => candidate.id === node.id);
          if (graphNode) { graphNode.x = node.x; graphNode.y = node.y; graphNode.fx = null; graphNode.fy = null; }
          ctx.triggerSave?.();
        } else {
          node.fx = null; node.fy = null;
        }
        getSimulation()?.alphaTarget(0);
      }
      setDraggingNode(null);
      canvas.style.cursor = "grab";
      endMembershipDrag(false, e);
      if (nodeDragStarted) {
        ctx.onDragEnd?.();
        nodeDragStarted = false;
      }
      draw();
    } else if (gestureEnd.tap) {
      // 卡片局部 simulation 在按下和松开之间仍可能移动节点；优先使用按下时锁定的节点。
      const lockedNode = gestureEnd.targetNodeId
        ? visibleNodes().find((candidate: any) => candidate.id === gestureEnd.targetNodeId)
        : null;
      const [tapX, tapY] = toWorldPos(e);
      const [x, y] = lockedNode ? [lockedNode.x, lockedNode.y] : [tapX, tapY];
      if (e.ctrlKey || e.metaKey) {
        const node = lockedNode ?? hitTestNode(x, y, visibleNodes(), getNodeExpand(), nodeHitOptions);
        const graphNode = node && ctx.graph.nodes.find((candidate: any) => candidate.id === node.id);
        if (graphNode?.hyperlink) window.open(graphNode.hyperlink, '_blank');
        else handleTap(x, y, lockedNode?.id);
      } else if (!lockedNode || lockedNode.id !== getSelNode() || ctx.getLinkMode?.()
        || !ctx.getNodeTitleBounds?.(lockedNode, tapX, tapY) || !ctx.onNodeTitleTap?.(lockedNode.id)) {
        handleTap(x, y, lockedNode?.id);
      }
    }

    setWasDragged(false);
    if (ctx.viewport && !ctx.isCardGridMode?.()) ctx.viewport.pause = false;
    downPoint = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  };
  window.addEventListener("pointerup", onPointerUp, { capture: true });

  const onPointerCancel = (e: PointerEvent) => {
    if (rightDragSource) { cancelRightDragLink(); return; }
    if (!pointerGesture.cancel(e.pointerId)) return;
    clearLongPress();
    pointerBoxStart = null;
    if (ctx.selectionBox) ctx.selectionBox.style.display = 'none';
    if (getDraggingNode()) {
      const node = getDraggingNode();
      ctx.setDragScale?.(node.id, 1.0);
      cancelDraggedPosition(node);
      setDraggingNode(null);
      endMembershipDrag(true, e);
      if (nodeDragStarted) {
        ctx.onDragEnd?.();
        nodeDragStarted = false;
      }
    }
    setWasDragged(false);
    if (ctx.viewport && !ctx.isCardGridMode?.()) ctx.viewport.pause = false;
    downPoint = null;
    draw();
  };
  canvas.addEventListener("pointercancel", onPointerCancel);

  const onPointerLeave = () => {
    leaveNotePreview();
    sharedState.hoverNodeId = null;
    ctx.onStructureBoundaryHover?.(null);
    ctx.onMediaHover?.(null);
    if (sharedState.focusMode && sharedState.directDraw) sharedState.directDraw();
  };
  canvas.addEventListener("pointerleave", onPointerLeave);

  // 每帧重新检测悬停（防止节点移出鼠标后仍保持 hover 状态）
  const reevaluateHover = () => {
    const mx = sharedState.mouseWorldX, my = sharedState.mouseWorldY;
    const nodes = visibleNodes();
    if (nodes) {
      const hn = hitTestNode(mx, my, nodes, getNodeExpand(), nodeHitOptions);
      if (hoveredNoteId !== null && hn?.id !== hoveredNoteId) leaveNotePreview();
      const structureId = hn ? null : ctx.hitStructureBoundary?.(mx, my) ?? null;
      sharedState.hoverNodeId = hn ? hn.id : null;
      ctx.onStructureBoundaryHover?.(structureId);
      if (hn) sharedState.focusHoverNodeId = hn.id;
      ctx.onMediaHover?.(hn?.mediaType ? hn.id : null);
    }
  };
  sharedState.reevaluateHover = reevaluateHover;

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault(); hideNotePreview();
    // 右键拖拽连线释放（pointerup 可能不触发，以此兜底）
    if (rightDragSource) {
      try {
        const [mx, my] = toWorldPos(e);
        const nodes2 = visibleNodes();
        const target2 = hitTestNode(mx, my, nodes2, getNodeExpand(), nodeHitOptions);
        // contextmenu 触发时直接尝试连线：有目标节点且不是源节点 → 连线；否则弹菜单
        if (target2 && target2.id !== rightDragSource && !ctx.isReadOnlyNode?.(target2.id)) {
          const exists2 = graph.edges.some((ed: any) => {
            const src = typeof ed.source === 'object' ? ed.source.id : ed.source;
            const tgt = typeof ed.target === 'object' ? ed.target.id : ed.target;
            return (src === rightDragSource && tgt === target2.id) || (src === target2.id && tgt === rightDragSource);
          });
          if (!exists2) {
            ctx.onCreateEdge?.(rightDragSource, target2.id, e.shiftKey);
          } else {
            console.log('[edge] already exists', rightDragSource, target2.id);
          }
        } else if (rightDragged && !target2 && canGrowBranchAt(mx, my, e.clientX, e.clientY)) {
          ctx.onCreateLinkedNode?.(rightDragSource, mx, my, e.shiftKey);
        } else {
          console.log('[edge] target missing or same', !!target2, rightDragSource, target2?.id);
          triggerContextMenu(e.clientX, e.clientY);
        }
      } finally {
        // 无论如何清理状态
        rightDragSource = null;
        rightDragged = false;
        sharedState.rightDragLink = null;
        suppressContextMenu = false;
        lastBoxUpTime = Date.now();
        if (ctx.viewport && !ctx.isCardGridMode?.()) ctx.viewport.pause = false;
        draw();
      }
      return;
    }
    if (suppressContextMenu) { suppressContextMenu = false; return; }
    if (Date.now() - lastBoxUpTime < 200) return; // 框选刚完成，跳过右键菜单
    triggerContextMenu(e.clientX, e.clientY);
  };
  canvas.addEventListener("contextmenu", onContextMenu);

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;

    clearLongPress();
    for (const timer of pendingTimers) clearTimeout(timer);
    pendingTimers.clear();
    clearBoxSelection();
    disposeSelectionHandlers();
    const activePointerId = pointerGesture.pointerId;
    pointerGesture.cancel();
    downPoint = null;
    pointerBoxStart = null;
    boxStart = null;
    rightDragSource = null;
    rightDragged = false;
    isRightButtonDown = false;
    isBoxSelecting = false;
    sharedState.rightDragLink = null;
    ctx.onStructureBoundaryHover?.(null);
    if (activePointerId !== null) {
      try { canvas.releasePointerCapture(activePointerId); } catch (_) { /* ignore */ }
    }
    if (getDraggingNode()) {
      const node = getDraggingNode();
      ctx.setDragScale?.(node.id, 1.0);
      cancelDraggedPosition(node);
      setDraggingNode(null);
    }
    endMembershipDrag(true);
    if (nodeDragStarted) {
      ctx.onDragEnd?.();
      nodeDragStarted = false;
    }
    setWasDragged(false);
    if (ctx.viewport && !ctx.isCardGridMode?.()) ctx.viewport.pause = false;
    canvas.style.cursor = 'grab';
    if (ctx.selectionBox) ctx.selectionBox.style.display = 'none';
    hideNotePreview();
    notePreview.destroy();
    magnifier.destroy();

    canvas.removeEventListener("pointerdown", onPointerDown, { capture: true });
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointercancel", onPointerCancel);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    canvas.removeEventListener('wheel', hideNotePreview);
    canvas.removeEventListener("dblclick", onDoubleClick);
    canvas.removeEventListener("contextmenu", onContextMenu);
    document.removeEventListener('keydown', onCancelLinkKey);
    window.removeEventListener("pointerup", onPointerUp, { capture: true });
    window.removeEventListener('blur', hideNotePreview);
    ctx.viewport?.off?.('drag-start', onViewportDragStart);
    ctx.viewport?.off?.('drag-end', onViewportDragEnd);

    if (sharedState.reevaluateHover === reevaluateHover) sharedState.reevaluateHover = null;
  };
}
