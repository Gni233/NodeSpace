/**
 * PaneManager — 统一管理所有分屏窗格的生命周期、状态、渲染、事件
 *
 * 核心设计：
 * - pm.$ 是一个 Proxy，所有属性 get/set 自动代理到当前焦点窗格的 PaneState
 * - 废除左窗格单例变量 + 右窗格 PaneState 的分裂架构，所有窗格平等
 * - 事件在窗格创建时绑定，消除懒加载时事件丢失
 * - 统一 drawAll() 循环渲染所有窗格
 */

import { clearMembershipDragPreview, clearPaneStructureBoundaries, PaneState, createPaneState, hitPaneStructureBoundary, onFocusChange, paneGraph, paneGraphFacade, paneSimulationManager, paneStructureBoundaryEndpoints } from './pane-state';
import { createPixiApp, PixiLayers } from './pixi-app';
import { createSimManager } from './graph-sim';
import { getCollapsedHierarchyHiddenNodeIds } from './graph-visibility';
import { setupCanvasEvents, EventsContext } from './ui-events';
import { sharedState } from './shared-state';
import { NodeSprite } from './pixi-nodes';
import { GraphData } from './data/storage';
import { nodeContainsPoint } from './geometry/hit';
import { isNodeInGroup } from './group-membership';
import { getStructureProjection } from './structure-nodes';

// ---- PaneExternals — 窗格需要的外部回调（由 main.ts 注入） ----

export interface PaneExternals {
  onDraw: () => void;
  onGridDraw: () => void;
  onScheduleSave: (pane: PaneState) => void;
  onContextMenu: (pane: PaneState, type: 'blank' | 'node' | 'edge' | 'group', id: string | null, x: number, y: number) => void;
  appShell: HTMLElement;
  selectionBox: HTMLDivElement;
  snapPosToGrid: (x: number, y: number) => [number, number];
  fillNode: (id: string) => void;
  fillEdge: (idx: number) => void;
  fillGroup: (id: string) => void;
  clearEd: () => void;
  saveCurrent: () => void;
  handleLinkTap: (x: number, y: number) => boolean;
  showToast: (msg: string, type?: string, duration?: number) => void;
  createStructure?: (pane: PaneState, ids: string[]) => Promise<void> | void;
  deleteNodes?: (pane: PaneState, ids: string[]) => Promise<boolean> | boolean;
  deleteEdges?: (pane: PaneState, projectedIndexes: number[]) => Promise<boolean> | boolean;
  enterStructure?: (pane: PaneState, id: string) => void;
  onNodeMembershipDragStart?: (pane: PaneState, id: string, x: number, y: number) => void;
  onNodeMembershipDragMove?: (pane: PaneState, id: string, x: number, y: number) => void;
  onNodeMembershipDragEnd?: (pane: PaneState, id: string, x: number, y: number, cancelled: boolean) => void;
}

// ---- PaneManager ----

export class PaneManager {
  panes: PaneState[] = [];
  private _focusedIdx: number = 0;

  /** Proxy：所有属性 get/set 自动路由到当前焦点窗格 */
  readonly $: PaneState;

  /** 非聚焦窗格降频：每隔 N 帧绘制一次 */
  private idleFrameSkip = 4;

  constructor() {
    this.$ = new Proxy({} as PaneState, {
      get: (_, prop) => {
        return (this.focused as any)[prop];
      },
      set: (_, prop, value) => {
        (this.focused as any)[prop] = value;
        return true;
      },
    }) as PaneState;
  }

  // ---- 访问器 ----

  get focused(): PaneState {
    return this.panes[this._focusedIdx];
  }

  get focusedIdx(): number {
    return this._focusedIdx;
  }

  pane(index: number): PaneState {
    return this.panes[index];
  }

  get count(): number {
    return this.panes.length;
  }

  // ---- 窗格生命周期 ----

  addPane(container: HTMLElement): PaneState {
    const idx = this.panes.length;
    const state = createPaneState(idx, container);
    this.panes.push(state);
    return state;
  }

  setFocus(index: number): void {
    if (index === this._focusedIdx || index >= this.panes.length || index < 0) return;
    this._focusedIdx = index;
    onFocusChange?.();
  }

  removePane(index: number): void {
    if (index <= 0 || index >= this.panes.length) return;

    // 若移除的是当前焦点，先切换到前一个窗格
    if (this._focusedIdx >= index) {
      this._focusedIdx = Math.max(0, index - 1);
    }

    const pane = this.panes[index];

    // ---- cleanup before destroy ----
    pane.disposeCanvasEvents?.();
    pane.disposeCanvasEvents = null;
    clearMembershipDragPreview(pane);
    clearPaneStructureBoundaries(pane, true);
    pane.layout.clear();
    pane.structureView?.simManager?.getSim?.()?.stop?.();
    pane.structureView = null;
    pane.structureController.exitTo(-1);
    pane.structurePath = [];
    pane.disposeStructureBreadcrumb?.();
    pane.disposeStructureBreadcrumb = null;
    pane.pixi?.viewport.off('moved');
    pane.pixi?.viewport.off('zoomed-end');
    if (pane.pixi) pane.pixi.onContextRestored = null;
    pane.simManager?.getSim()?.stop();

    pane.pixi?.app.destroy(true);
    pane.canvasContainer.remove();
    this.panes.splice(index, 1);

    // 重新索引
    for (let i = index; i < this.panes.length; i++) {
      this.panes[i].index = i;
    }
  }

  /** 完整初始化一个窗格：pixi + sim + 事件绑定 */
  async initPane(index: number, ext: PaneExternals): Promise<void> {
    const pane = this.panes[index];
    if (!pane) return;

    // 1. 创建 PixiJS 应用
    const pixi = await createPixiApp(pane.canvasContainer);
    pane.pixi = pixi;

    // 2. 创建模拟管理器
    pane.simManager = createSimManager(
      pane.graph,
      () => pane.gw,
      () => pane.gh,
      () => pane.linkDist,
      () => pane.linkStr,
      () => pane.charge,
      () => pane.centerS,
      () => pane.collideR,
      () => pane.groupBound,
      () => pane.alphaTarget,
      () => pane.heatingTime,
      () => getCollapsedHierarchyHiddenNodeIds(pane.graph),
      () => ext.onDraw(),
    );

    // 3. 视口事件
    pixi.viewport.on('moved', () => {
      if (pane.readyToDraw) ext.onGridDraw();
    });
    pixi.viewport.on('zoomed-end', () => {
      if (pane.readyToDraw) ext.onDraw();
    });
    // 拖拽状态跟踪（居中模式时避免抢夺控制权）
    pixi.viewport.on('drag-start', () => { sharedState.viewportDragging = true; });
    pixi.viewport.on('drag-end', () => { sharedState.viewportDragging = false; });

    // 4. WebGL context 恢复
    pixi.onContextRestored = () => {
      pane.simManager.initSim();
      ext.onDraw();
    };

    // 5. Canvas 交互事件
    const lastDragId = { v: pane._lastDragNodeId };
    const ctx = createEventsContextForPane(pane, pixi, pane.nodeSprites, lastDragId, ext);
    pane.disposeCanvasEvents?.();
    pane.disposeCanvasEvents = setupCanvasEvents(pixi.app.canvas as any, ctx);
  }

  // ---- 统一绘制 ----

  /** 绘制所有窗格，对非聚焦窗格降频 */
  drawAll(frameCount: number, renderPaneFn: (px: PixiLayers, g: GraphData, sm: any, sp: Map<string, NodeSprite>, st: PaneState) => void): void {
    // 居中模式：视口跟随选中节点
    for (let i = 0; i < this.panes.length; i++) {
      const pane = this.panes[i];
      const px = pane.pixi;
      if (!px || !pane.centerMode || !pane.selNode || sharedState.viewportDragging) continue;
      const sim = paneSimulationManager(pane)?.getSim();
      if (!sim) continue;
      const sn = sim.nodes()?.find((n: any) => n.id === pane.selNode);
      if (sn) {
        px.viewport.moveCenter(sn.x, sn.y);
      }
    }

    for (let i = 0; i < this.panes.length; i++) {
      const pane = this.panes[i];
      const px = pane.pixi;
      if (!px || !paneSimulationManager(pane)) continue;

      // 非聚焦窗格降频绘制
      if (i !== this._focusedIdx && frameCount % this.idleFrameSkip !== 0) {
        // 检查 sim 是否还在活跃
        const sim = paneSimulationManager(pane)?.getSim();
        if (sim && sim.alpha() < 0.01) continue;
      }

      renderPaneFn(px, paneGraph(pane), paneSimulationManager(pane), pane.nodeSprites, pane);
      px.app.render();
    }

    // 休眠非聚焦窗格的模拟
    for (let i = 0; i < this.panes.length; i++) {
      if (i === this._focusedIdx) continue;
      const sm = this.panes[i].simManager;
      if (!sm) continue;
      const sim = sm.getSim();
      if (sim && sim.alpha() < 0.02) sim.alphaTarget(0);
    }
  }

  // ---- 辅助 ----

  /** 获取焦点窗格的 d3 simulation 实例 */
  getSim(index?: number): any {
    const i = index ?? this._focusedIdx;
    return this.panes[i]?.simManager?.getSim();
  }

  /** 获取焦点窗格的 PixiLayers */
  getPixi(index?: number): PixiLayers | null {
    const i = index ?? this._focusedIdx;
    return this.panes[i]?.pixi ?? null;
  }

  /** 重新初始化焦点窗格的模拟 */
  initSim(index?: number): void {
    const i = index ?? this._focusedIdx;
    this.panes[i]?.simManager?.initSim();
  }
}

// ---- EventsContext 工厂 ----

/** 为一个窗格创建完整的 EventsContext */
function createEventsContextForPane(
  pi: PaneState,
  px: PixiLayers,
  sprites: Map<string, NodeSprite>,
  lastDragId: { v: string | null },
  ext: PaneExternals,
): EventsContext {
  const sm = () => paneSimulationManager(pi);
  const getSim = () => sm()?.getSim();
  const scopedGraph = paneGraphFacade(pi);

  const interactionAllowed = () => pi.runtime.canInteract(pi);
  return {
    graph: scopedGraph,
    isInteractionEnabled: interactionAllowed,
    onInteractionBlocked: () => ext.showToast('此图正在另一窗格的文字视图中编辑', 'warning', 3500),
    getSelNode: () => pi.selNode,
    setSelNode: (v: string | null) => { pi.selNode = v; },
    getSelEdge: () => pi.selEdge,
    setSelEdge: (v: number | null) => { pi.selEdge = v; },
    getSelGroup: () => pi.selGroup,
    setSelGroup: (v: string | null) => { pi.selGroup = v; },
    getSimulation: () => getSim(),
    getVisibleNodes: () => ['cardgrid', 'category', 'fullcat'].includes(pi.activeMode)
      ? getStructureProjection(paneGraph(pi)).nodes
      : getSim()?.nodes?.() ?? [],
    isReadOnlyNode: (id: string) => !!pi.structureView?.proxyNodeIds.has(id),
    isReadOnlyEdge: (index: number) => !!pi.structureView?.isReadOnlyEdge(index),
    getOriginalEdgeIndex: (index: number) => pi.structureView?.getOriginalEdgeIndex(index) ?? index,
    deleteNodes: (ids: string[]) => ext.deleteNodes?.(pi, ids) ?? false,
    deleteEdges: (indexes: number[]) => ext.deleteEdges?.(pi, indexes) ?? false,
    onReadOnlySelection: kind => ext.showToast(kind === 'node' ? '这是结构外部的只读入口' : '这是只读代理关系', 'info', 3000),
    getTransform: () => px ? { k: px.viewport.scale.x, x: px.viewport.x, y: px.viewport.y } : { k: 1, x: 0, y: 0 },
    viewport: px.viewport,
    getCanvas: () => px.app.canvas as any,
    captureMagnifierRegion: region => px.captureMagnifierRegion(region),
    getNodeExpand: () => pi.nodeExpand,
    getLineExpand: () => pi.lineExpand,
    getSemanticEdgeRouting: () => pi.activeMode === 'auto',
    getDraggingNode: () => pi.draggingNode,
    setDraggingNode: (v: any) => { pi.draggingNode = v; },
    getWasDragged: () => pi.wasDragged,
    setWasDragged: (v: boolean) => { pi.wasDragged = v; },

    draw: () => ext.onDraw(),
    onContextMenu: (type, id, x, y) => ext.onContextMenu(pi, type, id, x, y),

    fixNode: (id: string) => {
      const n = pi.graph.nodes.find(gn => gn.id === id);
      if (n) { n.fixed = true; n.fx = n.x; n.fy = n.y; }
      const sim = getSim();
      if (sim) { const sn = sim.nodes().find((s: any) => s.id === id); if (sn) { sn.fixed = true; sn.fx = sn.x; sn.fy = sn.y; } }
      ext.onScheduleSave(pi);
      ext.onDraw();
    },
    isFixedNode: (id: string) => {
      return pi.graph.nodes.find(gn => gn.id === id)?.fixed || false;
    },

    selectionBox: ext.selectionBox,

    fixNodes: (ids: string[]) => {
      for (const id of ids) {
        const n = pi.graph.nodes.find(gn => gn.id === id);
        if (n) { n.fixed = true; n.fx = n.x; n.fy = n.y; }
        const sim = getSim();
        if (sim) { const sn = sim.nodes().find((s: any) => s.id === id); if (sn) { sn.fixed = true; sn.fx = sn.x; sn.fy = sn.y; } }
      }
      ext.onScheduleSave(pi);
      ext.onDraw();
    },
    unfixNodes: (ids: string[]) => {
      const sim = getSim();
      for (const id of ids) {
        const n = pi.graph.nodes.find(gn => gn.id === id);
        if (n) { n.fixed = false; n.fx = null; n.fy = null; }
        if (sim) { const sn = sim.nodes().find((s: any) => s.id === id); if (sn) { sn.fixed = false; sn.fx = null; sn.fy = null; } }
      }
      ext.onScheduleSave(pi);
      ext.onDraw();
    },

    appShell: ext.appShell,
    triggerSave: () => ext.onScheduleSave(pi),

    onDragStart: (id: string) => {
      sm()?.setDragNode(id);
      lastDragId.v = id;
    },
    onDragEnd: () => {
      const draggedId = lastDragId.v;
      if ((pi.gridSnapEnabled || pi.partialGridSnap) && draggedId) {
        const sim = getSim();
        const sn = sim?.nodes()?.find((n: any) => n.id === draggedId);
        if (sn && (pi.gridSnapEnabled || sn.fixed)) {
          const [sx, sy] = ext.snapPosToGrid(sn.x, sn.y);
          sn.x = sx; sn.y = sy; sn.fx = sx; sn.fy = sy;
          const gn = pi.graph.nodes.find((gn2: any) => gn2.id === draggedId);
          if (gn) { gn.x = sx; gn.y = sy; gn.fx = sx; gn.fy = sy; }
        }
      }
      if (draggedId) ext.onScheduleSave(pi);
      lastDragId.v = null;
      sm()?.setDragNode(null);
    },
    onNodeMembershipDragStart: (id: string, x: number, y: number) => ext.onNodeMembershipDragStart?.(pi, id, x, y),
    onNodeMembershipDragMove: (id: string, x: number, y: number) => ext.onNodeMembershipDragMove?.(pi, id, x, y),
    onNodeMembershipDragEnd: (id: string, x: number, y: number, cancelled: boolean) => ext.onNodeMembershipDragEnd?.(pi, id, x, y, cancelled),

    getLinkMode: () => pi.linkMode,
    getLinkSrc: () => pi.linkSrc,

    onLinkCursorMove: (x: number, y: number) => {
      pi.linkCursorX = x;
      pi.linkCursorY = y;
      if (sharedState.directDraw) sharedState.directDraw();
      else ext.onDraw();
    },

    initSim: () => sm()?.initSim(),
    clearEd: () => { pi.selNode = null; pi.selEdge = null; pi.selGroup = null; },

    getGridSnapEnabled: () => pi.gridSnapEnabled || pi.partialGridSnap,
    getGridSp: () => pi.gridSp,
    getHiddenNodeIds: () => sharedState.hiddenNodeIds?.() ?? new Set(),
    isStructureBoundaryNode: (id: string) => pi.structureBoundaryShapes.has(id),
    getStructureBoundaryEndpoints: () => paneStructureBoundaryEndpoints(pi),
    hitStructureBoundary: (x: number, y: number) => hitPaneStructureBoundary(pi, x, y, Math.max(4, pi.lineExpand)),
    onStructureBoundaryHover: (id: string | null) => {
      if (pi.hoverStructureId === id) return;
      pi.hoverStructureId = id;
      ext.onDraw();
    },
    onStructureBoundaryTap: (id: string) => {
      pi.selNode = id;
      pi.selEdge = null;
      pi.selGroup = null;
      ext.fillNode(id);
      ext.onDraw();
    },
    createStructure: (ids: string[]) => ext.createStructure?.(pi, ids),
    onNodeDoubleClick: (id: string) => ext.enterStructure?.(pi, id),

    setDragScale: (nodeId: string | null, scale: number) => {
      if (nodeId) {
        const sprite = sprites.get(nodeId);
        if (sprite) sprite.container.scale.set(scale);
      }
    },

    onTap: (x: number, y: number, nodeId?: string) => {
      if (!interactionAllowed()) {
        ext.showToast('此图正在另一窗格的文字视图中编辑', 'warning', 3500);
        return;
      }
      ext.saveCurrent();
      if (nodeId && !pi.linkMode) {
        pi.selNode = nodeId;
        pi.selEdge = null;
        pi.selGroup = null;
        ext.fillNode(nodeId);
        ext.onDraw();
        return;
      }
      if (ext.handleLinkTap(x, y)) return;
      if (pi.linkMode && !pi.linkSrc) {
        const nodes = getSim()?.nodes() || [];
        const hit = nodes.find((nd: any) => nodeContainsPoint(nd, x, y, pi.nodeExpand));
        if (hit) {
          pi.linkSrc = hit.id;
          ext.showToast(`源: ${hit.label || hit.id}，请点击目标节点`, 'info', 2000);
          return;
        }
      }
      const nodes = getSim()?.nodes() || [];
      const n = nodes.find((nd: any) => nodeContainsPoint(nd, x, y, pi.nodeExpand));
      if (n) { pi.selNode = n.id; ext.fillNode(n.id); ext.onDraw(); return; }
      for (let i2 = 0; i2 < pi.graph.edges.length; i2++) {
        const e = pi.graph.edges[i2];
        const s = nodes.find((nd: any) => nd.id === (typeof e.source === 'object' ? e.source.id : e.source));
        const t = nodes.find((nd: any) => nd.id === (typeof e.target === 'object' ? e.target.id : e.target));
        if (!s || !t) continue;
        const dx = t.x - s.x, dy = t.y - s.y;
        const len2 = dx * dx + dy * dy;
        let tp = ((x - s.x) * dx + (y - s.y) * dy) / len2;
        tp = Math.max(0, Math.min(1, tp));
        if ((x - (s.x + tp * dx)) ** 2 + (y - (s.y + tp * dy)) ** 2 <= (pi.lineExpand + 3) ** 2) {
          pi.selEdge = i2;
          if (pi.index === 0) ext.fillEdge(i2);
          ext.onDraw();
          return;
        }
      }
      for (const g of pi.graph.groups) {
        if (g.displayMode === 'none') continue;
        const members = nodes.filter((nd: any) => isNodeInGroup(nd, g));
        if (members.length === 0) continue;
        if (g.displayMode === 'fluid') {
          for (const m of members) {
            if ((m.x - x) ** 2 + (m.y - y) ** 2 <= ((m.radius || 9) * (g.fluidRadius || 3)) ** 2) {
              pi.selGroup = g.id;
              if (pi.index === 0) ext.fillGroup(g.id);
              ext.onDraw();
              return;
            }
          }
        }
      }
      pi.selNode = null; pi.selEdge = null; pi.selGroup = null;
    },

    onCreateEdge: (sourceId: string, targetId: string, shiftKey?: boolean) => {
      if (!interactionAllowed()) {
        ext.showToast('此图正在另一窗格的文字视图中编辑', 'warning', 3500);
        return;
      }
      pi.undoManager.pushSnapshot(pi.graph);
      const edge: any = {
        source: sourceId, target: targetId,
        label: '', color: '#BFBFBF', arrow: pi.defArrow,
        _createdAt: performance.now(),
      };
      if (shiftKey) edge.lineStyle = 'dash-2';
      pi.graph.edges.push(edge);
      ext.onScheduleSave(pi);
      const sim = getSim();
      if (sim) {
        const validEdges = pi.graph.edges.filter((e2: any) =>
          (e2.lineStyle || 'solid') === 'solid' && !e2._conflict && !e2._dyingAt
        );
        sim.force("link", (window as any).d3.forceLink(validEdges).id((d: any) => d.id).distance(pi.linkDist).strength(pi.linkStr));
        sim.alpha(0.3).restart();
        setTimeout(() => sim.alphaTarget(0), 3000);
      }
      ext.onDraw();
    },
  };
}
