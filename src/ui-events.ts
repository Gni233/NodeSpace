import { canvasPoint, hitTestNode, hitTestEdge, hitTestGroup } from "./geometry/hit";
import { closeContextMenu, showContextMenu } from "./ui-contextmenu";
import { GraphData } from "./data/storage";
import { sharedState } from "./shared-state";
import { Z_TOOLTIP, V } from "./layout-constants";
import { PRESET_COLORS } from "./utils/color";
import { CanvasGestureState } from "./canvas-gesture-state";
import { isStructureNode } from './structure-nodes';

const DRAG_THRESHOLD = 3;
const TOUCH_DRAG_THRESHOLD = 10;
const LONG_PRESS_DURATION = 500;

export interface EventsContext {
  graph: GraphData;
  isInteractionEnabled?: () => boolean;
  onInteractionBlocked?: () => void;
  getSelNode: () => string | null;  setSelNode: (v: string | null) => void;
  getSelEdge: () => number | null;  setSelEdge: (v: number | null) => void;
  getSelGroup: () => string | null; setSelGroup: (v: string | null) => void;
  getSimulation: () => any;
  getTransform: () => any;
  getCanvas: () => HTMLCanvasElement;
  getNodeExpand: () => number;
  getLineExpand: () => number;
  getDraggingNode: () => any;       setDraggingNode: (n: any) => void;
  getWasDragged: () => boolean;     setWasDragged: (v: boolean) => void;
  draw: () => void;
  onContextMenu?: (type: 'blank'|'node'|'edge'|'group', id: string|null, x: number, y: number) => void;
  onTap?: (x: number, y: number, nodeId?: string) => void;
  fixNode?: (id: string) => void;
  isFixedNode?: (id: string) => boolean;
  selectionBox?: HTMLDivElement;
  fixNodes?: (ids: string[]) => void;
  unfixNodes?: (ids: string[]) => void;
  triggerSave?: () => void;
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
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
  // 格点吸附（框选矩形对齐网格）
  getGridSnapEnabled?: () => boolean;
  getGridSp?: () => number;
  getHiddenNodeIds?: () => Set<string>;
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
  /** 桌面端双击节点，由调用方决定是否进入结构视图。 */
  onNodeDoubleClick?: (id: string) => void;
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
    draw, onContextMenu: onAppContextMenu, fixNode, isFixedNode
  } = ctx;

  // 坐标转换：统一用 canvas 偏移校正
  // 过滤隐藏节点（折叠/搜索），返回可见节点列表
  const _rawSimNodes = () => getSimulation()?.nodes() || [];
  const visibleNodes = () => {
    const all = _rawSimNodes();
    const hidden = ctx.getHiddenNodeIds?.() ?? new Set();
    if (hidden.size === 0) return all;
    return all.filter((n: any) => !hidden.has(n.id));
  };

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

  // 创建 tooltip
  const tooltip = document.createElement("div");
  tooltip.style.cssText = `position:absolute;z-index:${Z_TOOLTIP};background:rgba(0,0,0,0.8);color:#fff;padding:4px 8px;border-radius:${V('--fg-radius-sm', '6px')};font-size:12px;max-width:200px;pointer-events:none;display:none;white-space:pre-wrap;word-break:break-word;`;
  ctx.appShell!.appendChild(tooltip);
  let hoveredNodeNote: string | null = null;
  const hideTooltip = () => { tooltip.style.display = 'none'; hoveredNodeNote = null; };
  const updateTooltip = (content: string, x: number, y: number) => {
    tooltip.textContent = content;
    tooltip.style.display = 'block';
    const canvasRect = canvas.getBoundingClientRect();
    const parentRect = ctx.appShell!.getBoundingClientRect();
    tooltip.style.left = (canvasRect.left - parentRect.left + x + 15) + 'px';
    tooltip.style.top = (canvasRect.top - parentRect.top + y + 15) + 'px';
  };

  let downPoint: [number, number] | null = null;
  const pointerGesture = new CanvasGestureState();
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

  // --- 框选状态 ---
  const BOX_MIN_SIZE = 5;
  let isRightButtonDown = false;
  let isBoxSelecting = false;
  let boxStart: [number, number] | null = null;
  let lastBoxUpTime = 0;
  let selectedNodeIds: string[] = [];
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
    selectedNodeIds = ids;
    sharedState.boxSelectedEdgeIndices = new Set(selEdges.map(e => e.idx));
    draw();
    const fixedCount = selNodes.filter((n: any) => n.fixed).length;
    const unfixedCount = selNodes.length - fixedCount;
    const items: { label: string; action: () => void }[] = [];
    if (selNodes.length > 0) {
      const mutableIds = ids.filter(id => !ctx.isReadOnlyNode?.(id));
      const hasReadOnlyNodes = mutableIds.length !== ids.length;
      const structureEligible = !hasReadOnlyNodes && ids.length >= 2 && selNodes.every((node: any) => !isStructureNode(node) && !node.structureParentId);
      if (structureEligible && ctx.createStructure) {
        items.push({ label: `收束为结构 (${ids.length})`, action: () => { void ctx.createStructure?.([...ids]); } });
      }
      if (!hasReadOnlyNodes) items.push({ label: `固定 (${unfixedCount})`, action: () => { ctx.fixNodes?.(ids); selectedNodeIds = []; draw(); } });
      if (!hasReadOnlyNodes) items.push({ label: `解除固定 (${fixedCount})`, action: () => { ctx.unfixNodes?.(ids); selectedNodeIds = []; draw(); } });
      if (!hasReadOnlyNodes && ctx.deleteNodes) items.push({ label: `删除节点 (${ids.length})`, action: () => {
        void Promise.resolve(ctx.deleteNodes?.([...ids])).then(deleted => {
          if (!deleted) return;
          selectedNodeIds = [];
          ctx.clearEd?.();
          draw();
        });
      }});
      // 复制所选
      if (!hasReadOnlyNodes) items.push({
        label: `复制所选 (${ids.length})`,
        action: () => {
          const selIds = new Set(ids);
          const selNs = ctx.graph.nodes.filter((n: any) => selIds.has(n.id));
          const selEs = ctx.graph.edges.filter((e: any) => {
            const s = typeof e.source === 'object' ? e.source.id : e.source;
            const t = typeof e.target === 'object' ? e.target.id : e.target;
            return selIds.has(s) && selIds.has(t);
          });
          sharedState.nodeClipboard = {
            nodes: JSON.parse(JSON.stringify(selNs)),
            edges: JSON.parse(JSON.stringify(selEs)),
          };
          closeContextMenu();
          if (sharedState.clearSelection) sharedState.clearSelection();
        },
      });
      if (!hasReadOnlyNodes) items.push({ label: '批量标签', action: async () => {
        const { safePrompt } = await import('./dialog');
        const tag = await safePrompt('标签名：');
        if (!tag) return;
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
        selectedNodeIds = [];
        ctx.triggerSave?.();
        draw();
      }});
      const batchColorItem: any = { label: '批量颜色', keepOpen: true, action: () => {
        const menuEl = (ctx.appShell!).querySelector('[data-menu="context"]') as HTMLElement;
        if (!menuEl) return;
        menuEl.innerHTML = '';
        menuEl.style.padding = '4px';
        const colorSub = document.createElement('div');
        colorSub.style.cssText = 'display:flex;gap:3px;flex-wrap:wrap;max-width:168px;';
        PRESET_COLORS.forEach(c => {
          const sw = document.createElement('div');
          sw.style.cssText = `width:20px;height:20px;background:${c};border-radius:${V('--fg-radius-sm', '6px')};cursor:pointer;border:1px solid rgba(255,255,255,0.2);`;
          sw.onclick = () => {
            for (const id of ids) {
              const n = ctx.graph.nodes.find((n: any) => n.id === id);
              if (n) n.color = c;
            }
            selectedNodeIds = [];
            ctx.triggerSave?.();
            draw();
            closeContextMenu();
            if (sharedState.clearSelection) sharedState.clearSelection();
          };
          colorSub.appendChild(sw);
        });
        menuEl.appendChild(colorSub);
      }} as any;
      if (!hasReadOnlyNodes) items.push(batchColorItem);
    }
    if (selEdges.length > 0 && selEdges.every(edge => !ctx.isReadOnlyEdge?.(edge.idx)) && ctx.deleteEdges) {
      items.push({ label: `删除连线 (${selEdges.length})`, action: () => {
        void Promise.resolve(ctx.deleteEdges?.(selEdges.map(edge => edge.idx))).then(deleted => {
          if (!deleted) return;
          selectedNodeIds = [];
          ctx.clearEd?.();
          draw();
        });
      }});
    }
    const appShellRect = ctx.appShell!.getBoundingClientRect();
    showContextMenu(ctx.appShell!, clientX - appShellRect.left, clientY - appShellRect.top, items);
  };

  // 连接到 sharedState
  const disposeSelectionHandlers = sharedState.registerSelectionHandlers(
    () => selectedNodeIds,
    () => { selectedNodeIds = []; sharedState.boxSelectedEdgeIndices = null; draw(); },
    (ids: string[]) => { selectedNodeIds = ids; draw(); },
  );

  const triggerContextMenu = (screenX: number, screenY: number) => {
    selectedNodeIds = [];
    const [cx, cy] = toWorldPos({ clientX: screenX, clientY: screenY });
    const nodes = visibleNodes() || [];
    const n = hitTestNode(cx, cy, nodes, getNodeExpand());
    if (n) { onAppContextMenu?.('node', n.id, screenX, screenY); return; }
    const eIdx = hitTestEdge(cx, cy, graph.edges, nodes, getLineExpand());
    if (eIdx !== null) { onAppContextMenu?.('edge', String(eIdx), screenX, screenY); return; }
    const g = hitTestGroup(cx, cy, graph.groups, nodes);
    if (g) { onAppContextMenu?.('group', g.id, screenX, screenY); return; }
    onAppContextMenu?.('blank', null, screenX, screenY);
  };

  const onDoubleClick = (e: MouseEvent) => {
    // Touch interactions intentionally use the long-press menu rather than dblclick.
    const [x, y] = toWorldPos(e);
    const node = hitTestNode(x, y, [...visibleNodes()].reverse(), getNodeExpand());
    if (!node || ctx.isReadOnlyNode?.(node.id)) return;
    e.preventDefault();
    e.stopPropagation();
    ctx.onNodeDoubleClick?.(node.id);
  };
  canvas.addEventListener("dblclick", onDoubleClick);

  const handleTap = (x: number, y: number, nodeId?: string) => {
    selectedNodeIds = [];
    // 如果外部提供了 onTap 回调，使用它（集成编辑面板等）
    if (ctx.onTap) { ctx.onTap(x, y, nodeId); return; }
    const nodes = visibleNodes() || [];
    const n = hitTestNode(x, y, nodes, getNodeExpand());
    if (n) { setSelNode(n.id); setSelEdge(null); setSelGroup(null); draw(); return; }
    const eIdx = hitTestEdge(x, y, graph.edges, nodes, getLineExpand());
    if (eIdx !== null) { setSelNode(null); setSelEdge(eIdx); setSelGroup(null); draw(); return; }
    const g = hitTestGroup(x, y, graph.groups, nodes);
    if (g) { setSelNode(null); setSelEdge(null); setSelGroup(g.id); draw(); return; }
    setSelNode(null); setSelEdge(null); setSelGroup(null); draw();
  };

  // 视口拖拽时取消长按（修复在集合光晕区域左键拖动触发右键菜单的问题）
  let viewportDragging = false;
  const onViewportDragStart = () => { viewportDragging = true; clearLongPress(); };
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
    closeContextMenu(); hideTooltip();
    const [x, y] = toWorldPos(e);
    downPoint = [x, y];
    if (e.button === 2) {
      e.preventDefault(); e.stopImmediatePropagation();
      // 右键点到节点 → 开始拖拽连线
      const nodes = visibleNodes();
      const hit = hitTestNode(x, y, nodes, getNodeExpand());
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
        draggingNode.fx = null; draggingNode.fy = null;
        setDraggingNode(null);
        getSimulation()?.alphaTarget(0);
        ctx.onDragEnd?.();
        setWasDragged(false);
        draw();
      }
      downPoint = null;
      return;
    }

    const nodes = visibleNodes();
    const node = hitTestNode(x, y, nodes, getNodeExpand());
    const boxSelect = !!ctx.getBoxSelectMode?.();
    if (!node) sharedState.focusHoverNodeId = null;
    // 卡片模式的非节点区域由 capture 阶段的 CardGrid 手势独占。
    if (ctx.isCardGridMode?.() && !node && !boxSelect) {
      downPoint = null;
      return;
    }
    const threshold = e.pointerType === 'touch' ? TOUCH_DRAG_THRESHOLD : DRAG_THRESHOLD;
    pointerGesture.begin(e.pointerId, e.clientX, e.clientY, node?.id ?? null, boxSelect, threshold);
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

    if (node && !ctx.isReadOnlyNode?.(node.id)) {
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
    const hoverNode = nodes ? hitTestNode(mx, my, nodes, getNodeExpand()) : null;
    sharedState.hoverNodeId = hoverNode ? hoverNode.id : null;
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
      if (node) {
        setDraggingNode(node);
        node.fx = node.x; node.fy = node.y;
        setWasDragged(true);
        ctx.setDragScale?.(node.id, 1.1);
        if (!ctx.isCardGridMode?.()) getSimulation()?.alphaTarget(0.3).restart();
        ctx.onDragStart?.(node.id);
      }
    }
    if (gestureMove?.mode === 'pending-node' || gestureMove?.mode === 'node-drag') {
      e.preventDefault();
    }

    if (getDraggingNode()) { canvas.style.cursor = "grabbing"; }
    else if (inLinkMode && hoverNode) { canvas.style.cursor = "crosshair"; }
    else if (inLinkMode) { canvas.style.cursor = "crosshair"; }
    else if (hoverNode) { canvas.style.cursor = "pointer"; }
    else { canvas.style.cursor = "grab"; }
    if (getDraggingNode()) {
      if (downPoint) { if (Math.hypot(mx - downPoint[0], my - downPoint[1]) >= DRAG_THRESHOLD) setWasDragged(true); }
      const clamped = ctx.clampNodeDrag ? ctx.clampNodeDrag(getDraggingNode().id, mx, my) : [mx, my];
      getDraggingNode().fx = clamped[0]; getDraggingNode().fy = clamped[1];
      if (!ctx.isCardGridMode?.()) getSimulation()?.alpha(0.3).restart();
    }
    // 空白区域拖动由 viewport 处理；这里只取消候选长按。
    if (gestureMove?.mode === 'viewport-pan' && gestureMove.moved) clearLongPress();
    if (ctx.onLinkCursorMove && ctx.getLinkMode?.() && ctx.getLinkSrc?.()) {
      ctx.onLinkCursorMove(mx, my);
    }
    if (!getDraggingNode() && hoverNode && hoverNode.note?.trim()) {
      if (hoveredNodeNote !== hoverNode.note) { hoveredNodeNote = hoverNode.note; updateTooltip(hoverNode.note, e.offsetX, e.offsetY); }
    } else hideTooltip();

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
      const target = hitTestNode(mx, my, nodes, getNodeExpand());
      if (rightDragged && target && target.id !== rightDragSource && !ctx.isReadOnlyNode?.(target.id)) {
        const exists = graph.edges.some((ed: any) => {
          const src = typeof ed.source === 'object' ? ed.source.id : ed.source;
          const tgt = typeof ed.target === 'object' ? ed.target.id : ed.target;
          return (src === rightDragSource && tgt === target.id) || (src === target.id && tgt === rightDragSource);
        });
        if (!exists) ctx.onCreateEdge?.(rightDragSource, target.id, e.shiftKey);
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
        selectedNodeIds = sel.nodes.map((node: any) => node.id);
        sharedState.boxSelectedEdgeIndices = new Set(sel.edges.map(edge => edge.idx));
        draw();
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
      setDraggingNode(null);
      getSimulation()?.alphaTarget(0);
      canvas.style.cursor = "grab";
      ctx.onDragEnd?.();
      draw();
    } else if (gestureEnd.tap) {
      // 卡片局部 simulation 在按下和松开之间仍可能移动节点；优先使用按下时锁定的节点。
      const lockedNode = gestureEnd.targetNodeId
        ? visibleNodes().find((candidate: any) => candidate.id === gestureEnd.targetNodeId)
        : null;
      const [x, y] = lockedNode ? [lockedNode.x, lockedNode.y] : toWorldPos(e);
      if (e.ctrlKey || e.metaKey) {
        const node = lockedNode ?? hitTestNode(x, y, visibleNodes(), getNodeExpand());
        const graphNode = node && ctx.graph.nodes.find((candidate: any) => candidate.id === node.id);
        if (graphNode?.hyperlink) window.open(graphNode.hyperlink, '_blank');
        else handleTap(x, y, lockedNode?.id);
      } else {
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
    if (!pointerGesture.cancel(e.pointerId)) return;
    clearLongPress();
    pointerBoxStart = null;
    if (ctx.selectionBox) ctx.selectionBox.style.display = 'none';
    if (getDraggingNode()) {
      const node = getDraggingNode();
      ctx.setDragScale?.(node.id, 1.0);
      node.fx = null; node.fy = null;
      setDraggingNode(null);
      getSimulation()?.alphaTarget(0);
      ctx.onDragEnd?.();
    }
    setWasDragged(false);
    if (ctx.viewport && !ctx.isCardGridMode?.()) ctx.viewport.pause = false;
    downPoint = null;
    draw();
  };
  canvas.addEventListener("pointercancel", onPointerCancel);

  const onPointerLeave = () => {
    sharedState.hoverNodeId = null;
    ctx.onMediaHover?.(null);
    if (sharedState.focusMode && sharedState.directDraw) sharedState.directDraw();
  };
  canvas.addEventListener("pointerleave", onPointerLeave);

  // 每帧重新检测悬停（防止节点移出鼠标后仍保持 hover 状态）
  const reevaluateHover = () => {
    const mx = sharedState.mouseWorldX, my = sharedState.mouseWorldY;
    const nodes = visibleNodes();
    if (nodes && nodes.length > 0) {
      const hn = hitTestNode(mx, my, nodes, getNodeExpand());
      sharedState.hoverNodeId = hn ? hn.id : null;
      if (hn) sharedState.focusHoverNodeId = hn.id;
      ctx.onMediaHover?.(hn?.mediaType ? hn.id : null);
    }
  };
  sharedState.reevaluateHover = reevaluateHover;

  // 对外暴露 tooltip（坐标已是 appShell 相对坐标，无需 canvas offset）
  const showNodeTooltip = (note: string, ax: number, ay: number) => {
    tooltip.textContent = note;
    tooltip.style.display = 'block';
    tooltip.style.left = ax + 'px';
    tooltip.style.top = ay + 'px';
  };
  const hideNodeTooltip = () => {
    hideTooltip();
  };
  sharedState.showNodeTooltip = showNodeTooltip;
  sharedState.hideNodeTooltip = hideNodeTooltip;

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault(); hideTooltip();
    // 右键拖拽连线释放（pointerup 可能不触发，以此兜底）
    if (rightDragSource) {
      try {
        const [mx, my] = toWorldPos(e);
        const nodes2 = visibleNodes();
        const target2 = hitTestNode(mx, my, nodes2, getNodeExpand());
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
    if (activePointerId !== null) {
      try { canvas.releasePointerCapture(activePointerId); } catch (_) { /* ignore */ }
    }
    if (getDraggingNode()) {
      const node = getDraggingNode();
      ctx.setDragScale?.(node.id, 1.0);
      node.fx = null; node.fy = null;
      setDraggingNode(null);
      getSimulation()?.alphaTarget(0);
    }
    setWasDragged(false);
    if (ctx.viewport && !ctx.isCardGridMode?.()) ctx.viewport.pause = false;
    canvas.style.cursor = 'grab';
    if (ctx.selectionBox) ctx.selectionBox.style.display = 'none';
    hideTooltip();
    tooltip.remove();

    canvas.removeEventListener("pointerdown", onPointerDown, { capture: true });
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointercancel", onPointerCancel);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    canvas.removeEventListener("dblclick", onDoubleClick);
    canvas.removeEventListener("contextmenu", onContextMenu);
    window.removeEventListener("pointerup", onPointerUp, { capture: true });
    ctx.viewport?.off?.('drag-start', onViewportDragStart);
    ctx.viewport?.off?.('drag-end', onViewportDragEnd);

    if (sharedState.reevaluateHover === reevaluateHover) sharedState.reevaluateHover = null;
    if (sharedState.showNodeTooltip === showNodeTooltip) sharedState.showNodeTooltip = null;
    if (sharedState.hideNodeTooltip === hideNodeTooltip) sharedState.hideNodeTooltip = null;
  };
}
