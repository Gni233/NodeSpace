import { canvasPoint, hitTestNode, hitTestEdge, hitTestGroup } from "./geometry/hit";
import { closeContextMenu, showContextMenu } from "./ui-contextmenu";
import { GraphData } from "./data/storage";
import { sharedState } from "./shared-state";
import { Z_TOOLTIP, V } from "./layout-constants";
import { PRESET_COLORS } from "./utils/color";

const DRAG_THRESHOLD = 3;
const TOUCH_DRAG_THRESHOLD = 10;
const LONG_PRESS_DURATION = 500;

export interface EventsContext {
  graph: GraphData;
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
  onTap?: (x: number, y: number) => void;
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
}

export function setupCanvasEvents(
  canvas: HTMLCanvasElement,
  ctx: EventsContext
) {
  const {
    graph, getSelNode, setSelNode, getSelEdge, setSelEdge, getSelGroup, setSelGroup,
    getSimulation, getTransform,
    getNodeExpand, getLineExpand,
    getDraggingNode, setDraggingNode, getWasDragged, setWasDragged,
    draw, onContextMenu, fixNode, isFixedNode
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
  let pendingTouchNode: any = null;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  const clearLongPress = () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } };
  let lastTapTime = 0;

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
  // 移动端触屏框选
  let touchBoxStart: [number, number] | null = null;
  let touchBoxSelecting = false;
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
      ctx.setSelEdge?.(selEdges[0].idx);
      ctx.fillEdge?.(selEdges[0].idx);
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
      items.push({ label: `固定 (${unfixedCount})`, action: () => { ctx.fixNodes?.(ids); selectedNodeIds = []; draw(); } });
      items.push({ label: `解除固定 (${fixedCount})`, action: () => { ctx.unfixNodes?.(ids); selectedNodeIds = []; draw(); } });
      items.push({ label: `删除节点 (${ids.length})`, action: () => {
        const sim = ctx.getSimulation?.();
        if (sim) {
          const simNodes = sim.nodes();
          for (const id of ids) {
            const sn = simNodes.find((s: any) => s.id === id);
            if (sn) (sn as any)._dying = true;
          }
        }
        for (const id of ids) {
          const idx = ctx.graph.nodes.findIndex((n: any) => n.id === id);
          if (idx >= 0) ctx.graph.nodes.splice(idx, 1);
          for (const e of ctx.graph.edges) {
            const src = typeof e.source === 'object' ? e.source.id : e.source;
            const tgt = typeof e.target === 'object' ? e.target.id : e.target;
            if (src === id || tgt === id) (e as any)._dyingAt = performance.now();
          }
        }
        selectedNodeIds = [];
        ctx.triggerSave?.();
        ctx.clearEd?.();
        draw();
        setTimeout(() => {
          for (let i = ctx.graph.edges.length - 1; i >= 0; i--) {
            const e2: any = ctx.graph.edges[i];
            if (e2._dyingAt && performance.now() - e2._dyingAt >= 400) ctx.graph.edges.splice(i, 1);
          }
          ctx.initSim?.();
          draw();
        }, 400);
      }});
      // 复制所选
      items.push({
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
      items.push({ label: '批量标签', action: async () => {
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
      items.push(batchColorItem);
    }
    if (selEdges.length > 0) {
      items.push({ label: `删除连线 (${selEdges.length})`, action: () => {
        const edgeIdxSet = new Set(selEdges.map(e => e.idx));
        for (const idx of edgeIdxSet) {
          const e = ctx.graph.edges[idx] as any;
          if (e) e._dyingAt = performance.now();
        }
        selectedNodeIds = [];
        ctx.triggerSave?.();
        ctx.clearEd?.();
        draw();
        setTimeout(() => {
          for (let i = ctx.graph.edges.length - 1; i >= 0; i--) {
            const e2: any = ctx.graph.edges[i];
            if (e2._dyingAt && performance.now() - e2._dyingAt >= 400) ctx.graph.edges.splice(i, 1);
          }
          ctx.initSim?.();
          draw();
        }, 400);
      }});
    }
    const appShellRect = ctx.appShell!.getBoundingClientRect();
    showContextMenu(ctx.appShell!, clientX - appShellRect.left, clientY - appShellRect.top, items);
  };

  // 连接到 sharedState
  sharedState.setSelectedNodeIdsFn(() => selectedNodeIds);
  sharedState.clearSelection = () => { selectedNodeIds = []; sharedState.boxSelectedEdgeIndices = null; draw(); };
  sharedState.setSelectedNodeIds = (ids: string[]) => { selectedNodeIds = ids; draw(); };

  const triggerContextMenu = (screenX: number, screenY: number) => {
    selectedNodeIds = [];
    const [cx, cy] = toWorldPos({ clientX: screenX, clientY: screenY });
    const nodes = visibleNodes() || [];
    const n = hitTestNode(cx, cy, nodes, getNodeExpand());
    if (n) { onContextMenu?.('node', n.id, screenX, screenY); return; }
    const eIdx = hitTestEdge(cx, cy, graph.edges, nodes, getLineExpand());
    if (eIdx !== null) { onContextMenu?.('edge', String(eIdx), screenX, screenY); return; }
    const g = hitTestGroup(cx, cy, graph.groups, nodes);
    if (g) { onContextMenu?.('group', g.id, screenX, screenY); return; }
    onContextMenu?.('blank', null, screenX, screenY);
  };

  const handleTap = (x: number, y: number) => {
    selectedNodeIds = [];
    // 如果外部提供了 onTap 回调，使用它（集成编辑面板等）
    if (ctx.onTap) { ctx.onTap(x, y); return; }
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
  if (ctx.viewport) {
    ctx.viewport.on('drag-start', () => { viewportDragging = true; clearLongPress(); });
    ctx.viewport.on('drag-end', () => { viewportDragging = false; });
  }

  canvas.addEventListener("pointerdown", (e: PointerEvent) => {
    closeContextMenu(); hideTooltip();
    const [x, y] = toWorldPos(e);
    downPoint = [x, y];
    const isTouch = e.pointerType === 'touch';
    if (e.button === 2) {
      e.preventDefault(); e.stopImmediatePropagation();
      // 右键点到节点 → 开始拖拽连线
      const nodes = visibleNodes();
      const hit = hitTestNode(x, y, nodes, getNodeExpand());
      if (hit) {
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
    const nodes = visibleNodes();
    const n = hitTestNode(x, y, nodes, getNodeExpand());
    clearLongPress();
    longPressTimer = setTimeout(() => {
      if (!getDraggingNode() && !getWasDragged() && !viewportDragging) { triggerContextMenu(e.clientX, e.clientY); }
      clearLongPress();
    }, LONG_PRESS_DURATION);
    if (n && e.button === 0) {
      if (isTouch) {
        e.preventDefault();
        pendingTouchNode = n;
        if (ctx.viewport) ctx.viewport.pause = true;
      } else {
        e.stopImmediatePropagation(); e.preventDefault();
        setDraggingNode(n); n.fx = n.x; n.fy = n.y; setWasDragged(false); canvas.style.cursor = "grabbing";
        // Drag scale feedback
        ctx.setDragScale?.(n.id, 1.1);
        getSimulation()?.alphaTarget(0.3).restart();
        ctx.onDragStart?.(n.id);
        if (ctx.viewport) ctx.viewport.pause = true;
      }
    }
  });

  // --- 触屏事件（Android/HarmonyOS 兼容）---
  canvas.addEventListener("touchstart", (e: TouchEvent) => {
    closeContextMenu(); hideTooltip();
    if (!e.touches[0]) return;
    const touch = e.touches[0];
    const [x, y] = toWorldPos({ clientX: touch.clientX, clientY: touch.clientY });
    downPoint = [x, y];
    const nodes = visibleNodes();
    const n = hitTestNode(x, y, nodes, getNodeExpand());
    pendingTouchNode = n || null;
    clearLongPress();
    e.preventDefault(); // 阻止浏览器原生长按行为（文本选择/放大镜）
    if (n && ctx.viewport) ctx.viewport.pause = true; // 触节点立刻暂停视口平移
    longPressTimer = setTimeout(() => {
      if (!getDraggingNode() && !getWasDragged() && !viewportDragging) { triggerContextMenu(touch.clientX, touch.clientY); }
      clearLongPress();
    }, LONG_PRESS_DURATION);
  }, { passive: false });

  canvas.addEventListener("touchmove", (e: TouchEvent) => {
    if (!e.touches[0]) return;
    const touch = e.touches[0];
    const [mx, my] = toWorldPos({ clientX: touch.clientX, clientY: touch.clientY });
    const nodes = visibleNodes();
    const hoverNode = nodes ? hitTestNode(mx, my, nodes, getNodeExpand()) : null;
    sharedState.hoverNodeId = hoverNode ? hoverNode.id : null;
    if (hoverNode?.mediaType) {
      ctx.onMediaHover?.(hoverNode.id);
    } else {
      ctx.onMediaHover?.(null);
    }
    if (sharedState.focusMode && sharedState.directDraw) sharedState.directDraw();
    // 移动端触屏框选：boxSelectMode 开启 + 非拖拽节点 + 已有起点 → 画选区
    if (ctx.getBoxSelectMode?.() && !getDraggingNode() && !pendingTouchNode && downPoint) {
      if (!touchBoxSelecting && Math.hypot(mx - downPoint[0], my - downPoint[1]) >= TOUCH_DRAG_THRESHOLD) {
        touchBoxSelecting = true;
        touchBoxStart = [downPoint[0], downPoint[1]];
        clearLongPress();
        if (ctx.viewport) ctx.viewport.pause = true;
      }
      if (touchBoxSelecting && touchBoxStart && ctx.selectionBox) {
        const [sx, sy] = touchBoxStart;
        // 世界坐标 → 屏幕坐标 → appShell 相对坐标
        const [scrX1, scrY1] = worldToScreen(sx, sy);
        const [scrX2, scrY2] = worldToScreen(mx, my);
        const parentRect = ctx.appShell!.getBoundingClientRect();
        const left = Math.min(scrX1, scrX2) - parentRect.left;
        const top = Math.min(scrY1, scrY2) - parentRect.top;
        const w = Math.abs(scrX2 - scrX1);
        const h = Math.abs(scrY2 - scrY1);
        ctx.selectionBox.style.display = 'block';
        ctx.selectionBox.style.left = `${left}px`;
        ctx.selectionBox.style.top = `${top}px`;
        ctx.selectionBox.style.width = `${w}px`;
        ctx.selectionBox.style.height = `${h}px`;
      }
      return; // 框选模式不下传其他 touch 逻辑
    }
    // 超过阈值 → 触节点就抓来拖，空白区域就取消长按（正在平移画布）
    if (downPoint && Math.hypot(mx - downPoint[0], my - downPoint[1]) >= TOUCH_DRAG_THRESHOLD) {
      if (!getDraggingNode() && pendingTouchNode) {
        setDraggingNode(pendingTouchNode); pendingTouchNode = null;
        const dn = getDraggingNode(); dn.fx = dn.x; dn.fy = dn.y;
        ctx.setDragScale?.(dn.id, 1.1);
        getSimulation()?.alphaTarget(0.3).restart();
        ctx.onDragStart?.(dn.id);
        if (ctx.viewport) ctx.viewport.pause = true;
      } else if (!pendingTouchNode && !getDraggingNode()) {
        clearLongPress();
      }
    }
    if (getDraggingNode()) {
      if (downPoint) { if (Math.hypot(mx - downPoint[0], my - downPoint[1]) >= TOUCH_DRAG_THRESHOLD) setWasDragged(true); }
      getDraggingNode().fx = mx; getDraggingNode().fy = my; getSimulation()?.alpha(0.3).restart();
    }
    if (!getDraggingNode() && hoverNode && hoverNode.note?.trim()) {
      if (hoveredNodeNote !== hoverNode.note) { hoveredNodeNote = hoverNode.note; updateTooltip(hoverNode.note, touch.clientX, touch.clientY); }
    } else hideTooltip();
  }, { passive: false });

  canvas.addEventListener("touchend", (e: TouchEvent) => {
    clearLongPress();
    pendingTouchNode = null;
    // 移动端触屏框选结束
    if (touchBoxSelecting && touchBoxStart && ctx.selectionBox) {
      touchBoxSelecting = false;
      ctx.selectionBox.style.display = 'none';
      const touch = e.changedTouches[0];
      if (touch && downPoint) {
        const [mx, my] = toWorldPos({ clientX: touch.clientX, clientY: touch.clientY });
        const [sx, sy] = touchBoxStart;
        const { nodes, edges } = getSelectionInRect(sx, sy, mx, my);
        if (nodes.length > 0 || edges.length > 0) {
          selectedNodeIds = nodes.map((n: any) => n.id);
          sharedState.boxSelectedEdgeIndices = new Set(edges.map(e => e.idx));
          draw();
          showBoxMenu(nodes, edges, touch.clientX, touch.clientY);
        }
      }
      touchBoxStart = null;
      if (ctx.viewport && !ctx.isCardGridMode?.()) ctx.viewport.pause = false;
      downPoint = null;
      ctx.setBoxSelectMode?.(false);
      return;
    }
    touchBoxStart = null;
    touchBoxSelecting = false;
    // 先处理拖拽结束
    if (getDraggingNode()) {
      const node = getDraggingNode();
      ctx.setDragScale?.(node.id, 1.0);
      if (getWasDragged() && isFixedNode && isFixedNode(node.id)) {
        const gn = ctx.graph.nodes.find((gn: any) => gn.id === node.id);
        if (gn) { gn.fx = node.fx; gn.fy = node.fy; gn.x = node.x; gn.y = node.y; }
        ctx.triggerSave?.();
      } else if (ctx.isCardGridMode?.()) {
        node.fx = node.x; node.fy = node.y;
        const gn3 = ctx.graph.nodes.find((gn4: any) => gn4.id === node.id);
        if (gn3) { gn3.fx = node.x; gn3.fy = node.y; gn3.x = node.x; gn3.y = node.y; }
        ctx.triggerSave?.();
      } else {
        node.fx = null; node.fy = null;
      }
      setDraggingNode(null); getSimulation()?.alphaTarget(0);
      ctx.onDragEnd?.();
      if (ctx.viewport && !ctx.isCardGridMode?.()) ctx.viewport.pause = false;
      downPoint = null;
      draw();
      return;
    }
    // 无拖拽→处理tap选择
    if (Date.now() - lastTapTime < 300) return;
    lastTapTime = Date.now();
    e.preventDefault();
    if (getWasDragged()) { setWasDragged(false); return; }
    if (!e.changedTouches[0]) return;
    const touch = e.changedTouches[0];
    handleTap(...toWorldPos({ clientX: touch.clientX, clientY: touch.clientY }));
    if (ctx.viewport && !ctx.isCardGridMode?.()) ctx.viewport.pause = false;
  });

  canvas.addEventListener("touchcancel", () => {
    clearLongPress(); pendingTouchNode = null;
    if (getDraggingNode()) {
      const node = getDraggingNode();
      ctx.setDragScale?.(node.id, 1.0);
      if (ctx.isCardGridMode?.()) {
        node.fx = node.x; node.fy = node.y;
        const gn5 = ctx.graph.nodes.find((gn6: any) => gn6.id === node.id);
        if (gn5) { gn5.fx = node.x; gn5.fy = node.y; gn5.x = node.x; gn5.y = node.y; }
        ctx.triggerSave?.();
      } else {
        node.fx = null; node.fy = null;
      }
      setDraggingNode(null); getSimulation()?.alphaTarget(0);
      ctx.onDragEnd?.();
    }
    if (ctx.viewport && !ctx.isCardGridMode?.()) ctx.viewport.pause = false;
    downPoint = null;
    draw();
  });

  canvas.addEventListener("pointermove", (e: PointerEvent) => {
    const [mx, my] = toWorldPos(e);
    sharedState.mouseWorldX = mx; sharedState.mouseWorldY = my;
    const nodes = visibleNodes();
    const hoverNode = nodes ? hitTestNode(mx, my, nodes, getNodeExpand()) : null;
    sharedState.hoverNodeId = hoverNode ? hoverNode.id : null;
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
      canvas.style.cursor = rightDragged && hoverNode && hoverNode.id !== rightDragSource ? "copy" : "crosshair";
      draw();
      return;
    }
    if (getDraggingNode()) { canvas.style.cursor = "grabbing"; }
    else if (inLinkMode && hoverNode) { canvas.style.cursor = "crosshair"; }
    else if (inLinkMode) { canvas.style.cursor = "crosshair"; }
    else if (hoverNode) { canvas.style.cursor = "pointer"; }
    else { canvas.style.cursor = "grab"; }
    if (getDraggingNode()) {
      if (downPoint) { if (Math.hypot(mx - downPoint[0], my - downPoint[1]) >= DRAG_THRESHOLD) setWasDragged(true); }
      getDraggingNode().fx = mx; getDraggingNode().fy = my; getSimulation()?.alpha(0.3).restart();
    }
    // 空白区域拖动 = 平移画布 → 取消长按
    if (!pendingTouchNode && !getDraggingNode() && downPoint && Math.hypot(mx - downPoint[0], my - downPoint[1]) >= DRAG_THRESHOLD) {
      clearLongPress();
    }
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
  });

  canvas.addEventListener("pointerup", (e: PointerEvent) => {
    // 右键拖拽连线释放（不依赖 e.button，部分平台 pointerup 时 button 为 0）
    if (rightDragSource) {
      const [mx, my] = toWorldPos(e);
      const nodes = visibleNodes();
      const target = hitTestNode(mx, my, nodes, getNodeExpand());
      if (rightDragged && target && target.id !== rightDragSource) {
        const exists = graph.edges.some((ed: any) => {
          const src = typeof ed.source === 'object' ? ed.source.id : ed.source;
          const tgt = typeof ed.target === 'object' ? ed.target.id : ed.target;
          return (src === rightDragSource && tgt === target.id) || (src === target.id && tgt === rightDragSource);
        });
        if (!exists) {
          ctx.onCreateEdge?.(rightDragSource, target.id, e.shiftKey);
        }
      } else if (!rightDragged) {
        // 未拖动 → 弹出右键菜单
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
    clearLongPress(); pendingTouchNode = null;
    if (getDraggingNode()) {
      const node = getDraggingNode();
      const nodeId = node.id;
      // Reset drag scale
      ctx.setDragScale?.(nodeId, 1.0);
      if (getWasDragged() && isFixedNode && isFixedNode(node.id)) {
        const gn = ctx.graph.nodes.find((gn: any) => gn.id === node.id);
        if (gn) { gn.fx = node.fx; gn.fy = node.fy; gn.x = node.x; gn.y = node.y; }
        ctx.triggerSave?.();
      } else if (ctx.isCardGridMode?.()) {
        node.fx = node.x; node.fy = node.y;
        const gn2 = ctx.graph.nodes.find((gn3: any) => gn3.id === node.id);
        if (gn2) { gn2.fx = node.x; gn2.fy = node.y; gn2.x = node.x; gn2.y = node.y; }
        ctx.triggerSave?.();
      } else {
        node.fx = null; node.fy = null;
      }
      setDraggingNode(null); getSimulation()?.alphaTarget(0); canvas.style.cursor = "grab"; draw();
      ctx.onDragEnd?.();
      if (ctx.viewport && !ctx.isCardGridMode?.()) ctx.viewport.pause = false;
    }
    downPoint = null;
  });

  canvas.addEventListener("click", (e: MouseEvent) => {
    if (getWasDragged()) { setWasDragged(false); return; }
    // 若 touchend 刚刚处理过 tap（300ms 内），跳过避免双击
    if (Date.now() - lastTapTime < 500) return;
    // Ctrl+点击节点 → 打开超链接
    if (e.ctrlKey || e.metaKey) {
      const [cx, cy] = toWorldPos(e);
      const nodes = visibleNodes() || [];
      const n = hitTestNode(cx, cy, nodes, getNodeExpand());
      if (n) {
        const graphNode = ctx.graph.nodes.find((gn: any) => gn.id === n.id);
        if (graphNode?.hyperlink) { window.open(graphNode.hyperlink, '_blank'); return; }
      }
    }
    handleTap(...toWorldPos(e));
  });

  canvas.addEventListener("pointerleave", () => {
    sharedState.hoverNodeId = null;
    ctx.onMediaHover?.(null);
    if (sharedState.focusMode && sharedState.directDraw) sharedState.directDraw();
  });

  // 每帧重新检测悬停（防止节点移出鼠标后仍保持 hover 状态）
  sharedState.reevaluateHover = () => {
    const mx = sharedState.mouseWorldX, my = sharedState.mouseWorldY;
    const nodes = visibleNodes();
    if (nodes && nodes.length > 0) {
      const hn = hitTestNode(mx, my, nodes, getNodeExpand());
      sharedState.hoverNodeId = hn ? hn.id : null;
      ctx.onMediaHover?.(hn?.mediaType ? hn.id : null);
    }
  };

  // 对外暴露 tooltip（坐标已是 appShell 相对坐标，无需 canvas offset）
  sharedState.showNodeTooltip = (note: string, ax: number, ay: number) => {
    tooltip.textContent = note;
    tooltip.style.display = 'block';
    tooltip.style.left = ax + 'px';
    tooltip.style.top = ay + 'px';
  };
  sharedState.hideNodeTooltip = () => {
    hideTooltip();
  };

  canvas.addEventListener("contextmenu", (e: MouseEvent) => {
    e.preventDefault(); hideTooltip();
    // 右键拖拽连线释放（pointerup 可能不触发，以此兜底）
    if (rightDragSource) {
      try {
        const [mx, my] = toWorldPos(e);
        const nodes2 = visibleNodes();
        const target2 = hitTestNode(mx, my, nodes2, getNodeExpand());
        // contextmenu 触发时直接尝试连线：有目标节点且不是源节点 → 连线；否则弹菜单
        if (target2 && target2.id !== rightDragSource) {
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
  });
}
