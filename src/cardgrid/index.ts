import { Container } from 'pixi.js';
import * as d3 from 'd3';
import { CardGridState, Card, CardSource } from './types';
import { createCardGridState, findComponents, syncCards, syncGroupCards } from './state';
import { packGrid, layoutNodesInCard } from './layout';
import { renderCards, clearCards } from './render';
import { setupCardInteractions } from './interactions';
import { buildGroupCards } from './category';

export type { Card, CardGridState } from './types';

export interface CardGridOptions {
  borderStyle?: 'straight' | 'rounded';
  gap?: number;
  cardSource?: CardSource;
  allGroups?: boolean;
}

interface CardSim {
  sim: d3.Simulation<any, any>;
  nodeIds: string[];
  simNodes: any[];
}

export class CardGridController {
  state: CardGridState;
  drawFn: () => void = () => {};
  saveFn: () => void = () => {};
  directSaveFn: (() => void) | null = null;
  _saving = false;

  private _graph: any = null;
  private _pixi: any = null;
  private _sm: any = null;
  private _cleanupInteraction: (() => void) | null = null;
  private _viewportZoomCleanup: (() => void) | null = null;
  private _creationOrder: Map<string, number> = new Map();
  private _creationSeq = 0;
  private _screenW = 1200;
  private _screenH = 800;
  private _cardLayer: Container | null = null;
  private _allGroups = false;
  private _cardSims: Map<string, CardSim> = new Map();
  private _lastCompHash = '';

  constructor() { this.state = createCardGridState(); }

  activate(graph: any, pixi: any, simManager: any, _simNodes: any[], options?: CardGridOptions): void {
    this._graph = graph;
    this._pixi = pixi;
    this._sm = simManager;
    this._allGroups = options?.allGroups ?? false;
    this._creationOrder = new Map();
    this._creationSeq = 0;
    if (graph?.nodes) {
      for (let i = 0; i < graph.nodes.length; i++) {
        if (!this._creationOrder.has(graph.nodes[i].id))
          this._creationOrder.set(graph.nodes[i].id, this._creationSeq++);
      }
    }

    if (pixi?.app?.canvas) {
      this._screenW = pixi.app.canvas.clientWidth || 1200;
      this._screenH = pixi.app.canvas.clientHeight || 800;
    }
    if (options?.borderStyle) this.state.borderStyle = options.borderStyle;
    if (options?.gap != null) this.state.gap = options.gap;

    const source = options?.cardSource ?? 'components';
    this.state.cardSource = source;

    if (pixi?.viewport) {
      pixi.viewport.plugins.pause('drag');
    }

    this._cardLayer = pixi?.cardLayer ?? null;

    // 缩放时重建卡片 sim（世界坐标边界变了）
    if (pixi?.viewport) {
      const onZoomedEnd = () => {
        this._relayoutAllCardNodes();
        this._startCardSims();
        requestAnimationFrame(() => this.drawFn());
      };
      pixi.viewport.on('zoomed-end', onZoomedEnd);
      this._viewportZoomCleanup = () => {
        pixi.viewport.off('zoomed-end', onZoomedEnd);
      };
    }

    if (pixi?.app?.canvas) {
      const canvas = pixi.app.canvas as HTMLCanvasElement;
      this._cleanupInteraction = setupCardInteractions(canvas, {
        getState: () => this.state,
        getCards: () => this.state.cards,
        getCanvas: () => canvas,
        getViewport: () => this._pixi?.viewport ?? null,
        getSimNodes: () => this._sm?.getSim?.()?.nodes() || [],
        draw: () => this.drawFn(),
        onSwap: (sourceId: string, targetId: string) => this.swapCards(sourceId, targetId),
      });
    }
  }

  deactivate(): void {
    this._stopCardSims();
    if (this._cardLayer) {
      clearCards(this._cardLayer);
    }
    if (this._pixi?.viewport) {
      this._pixi.viewport.plugins.resume('drag');
    }
    if (this._viewportZoomCleanup) {
      this._viewportZoomCleanup();
      this._viewportZoomCleanup = null;
    }
    if (this._graph?.nodes)
      for (const n of this._graph.nodes) { n.fx = null; n.fy = null; }
    if (this._cleanupInteraction) { this._cleanupInteraction(); this._cleanupInteraction = null; }
    this.state = createCardGridState();
    this._cardLayer = null;
    // 恢复全局 sim
    const gsim = this._sm?.getSim?.();
    if (gsim) {
      gsim.alpha(0.3).alphaTarget(0).stop();
      // unfix 所有节点
      for (const sn of gsim.nodes()) {
        sn.fx = null; sn.fy = null;
      }
    }
  }

  /** 每帧调用：推进所有卡片内的力模拟，同步位置 */
  tick(): void {
    if (!this._graph) return;
    for (const [, entry] of this._cardSims) {
      entry.sim.tick();
      for (const sn of entry.sim.nodes()) {
        const gn = this._graph.nodes.find((n: any) => n.id === sn.id);
        if (gn) { gn.x = sn.x; gn.y = sn.y; gn.fx = null; gn.fy = null; }
      }
    }
    // 同步到全局 sim（画布渲染读取 sim.nodes()）
    const gsim = this._sm?.getSim?.();
    if (gsim) {
      for (const sn of gsim.nodes()) {
        const gn = this._graph.nodes.find((n: any) => n.id === sn.id);
        if (gn) { sn.x = gn.x; sn.y = gn.y; sn.fx = gn.x; sn.fy = gn.y; }
      }
      gsim.alpha(0).alphaTarget(0);
    }
  }

  layoutAndAnimate(): void {
    this._doLayout();
    this._initSimPositions();
    this._startCardSims();
    this.drawFn();
  }

  recalcAndAnimate(): void {
    // 仅在连通分量/组结构变化时才重排，避免无数据变更时误刷新
    const hash = this._computeCompHash();
    if (hash !== this._lastCompHash) {
      this._lastCompHash = hash;
      this._doLayout();
      this._initSimPositions();
      this._startCardSims();
    }
    this.drawFn();
    this._saving = true;
    this.saveFn();
    this._saving = false;
  }

  swapCards(sourceId: string, targetId: string): void {
    const sourceCard = this.state.cards.find(c => c.id === sourceId);
    const targetCard = this.state.cards.find(c => c.id === targetId);
    if (!sourceCard || !targetCard) return;

    const tmp = sourceCard.treemapOrder;
    sourceCard.treemapOrder = targetCard.treemapOrder;
    targetCard.treemapOrder = tmp;

    this._persistCardOrders();
    this._doLayout();
    this._initSimPositions();
    this._startCardSims();
    this.drawFn();

    if (this.directSaveFn) this.directSaveFn();
  }

  render(accentColor: number): void {
    if (this._cardLayer) renderCards(this._cardLayer, this.state, accentColor);
  }

  markNewNode(nodeId: string): void {
    if (!this._creationOrder.has(nodeId))
      this._creationOrder.set(nodeId, this._creationSeq++);
  }

  updateScreenSize(w: number, h: number): void {
    this._screenW = w;
    this._screenH = h;
    this._doLayout();
    this._initSimPositions();
    this._startCardSims();
    this.drawFn();
  }

  // ---- private ----

  private _getVpAdapter() {
    const vp = this._pixi?.viewport;
    return vp ? {
      toWorld: (sx: number, sy: number) => vp.toWorld(sx, sy),
      scale: { x: vp.scale.x, y: vp.scale.y },
    } : {
      toWorld: (sx: number, sy: number) => ({ x: sx - this._screenW / 2, y: sy - this._screenH / 2 }),
      scale: { x: 1, y: 1 },
    };
  }

  private _persistCardOrders(): void {
    if (!this._graph?.settings) return;
    const key = this.state.cardSource === 'groups' ? 'groupCardOrders' : 'cardOrders';
    const orders: Record<string, number> = {};
    for (const c of this.state.cards) orders[c.id] = c.treemapOrder;
    (this._graph.settings as any)[key] = orders;
  }

  private _doLayout(): void {
    const savedOrdersKey = this.state.cardSource === 'groups' ? 'groupCardOrders' : 'cardOrders';
    const savedOrders: Record<string, number> | null = (this._graph?.settings as any)?.[savedOrdersKey] ?? null;

    if (this.state.cardSource === 'groups') {
      const newCards = buildGroupCards(this._graph, this._allGroups);
      this.state.cards = syncGroupCards(this.state, newCards, savedOrders);
    } else {
      const nodes: any[] = this._graph?.nodes || [];
      const edges: any[] = this._graph?.edges || [];
      for (const n of nodes)
        if (!this._creationOrder.has(n.id))
          this._creationOrder.set(n.id, this._creationSeq++);
      const comps = findComponents(nodes, edges);
      this.state.cards = syncCards(this.state, comps, this._creationOrder, savedOrders);
    }

    this._lastCompHash = this._computeCompHash();
    packGrid(this.state.cards, this._screenW, this._screenH, this.state.gap);
    this._relayoutAllCardNodes();
    this._persistCardOrders();
  }

  private _relayoutAllCardNodes(): void {
    const nodes: any[] = this._graph?.nodes || [];
    const edges: any[] = this._graph?.edges || [];
    const nodeMap = new Map<string, any>(nodes.map((n: any) => [n.id, n]));
    const vpAdapter = this._getVpAdapter();

    for (const card of this.state.cards) {
      layoutNodesInCard(card, nodeMap, edges, vpAdapter);
      for (const nid of card.nodeIds) {
        const n = nodeMap.get(nid);
        if (n && (n as any)._cardX != null) { n.x = (n as any)._cardX; n.y = (n as any)._cardY; }
      }
    }
  }

  /** 初始化 sim 的初始位置（同步 graph.nodes → sim nodes） */
  private _initSimPositions(): void {
    const gsim = this._sm?.getSim?.();
    if (!gsim) return;
    gsim.stop();
    for (const sn of gsim.nodes()) {
      const gn = this._graph.nodes.find((n: any) => n.id === sn.id);
      if (gn) { sn.x = gn.x; sn.y = gn.y; sn.fx = gn.x; sn.fy = gn.y; }
    }
    gsim.alpha(0).alphaTarget(0);
  }

  private _startCardSims(): void {
    this._stopCardSims();
    if (!this._graph) return;

    // 停止全局 sim（卡片内用独立 sim）
    const gsim = this._sm?.getSim?.();
    gsim?.stop();

    const nodes: any[] = this._graph.nodes;
    const edges: any[] = this._graph.edges || [];
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const vpAdapter = this._getVpAdapter();

    for (const card of this.state.cards) {
      const tl = vpAdapter.toWorld(card.x + card.padding, card.y + card.padding);
      const br = vpAdapter.toWorld(card.x + card.w - card.padding, card.y + card.h - card.padding);
      const box = { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
      if (box.w <= 20 || box.h <= 20) continue;

      const simNodes: any[] = [];
      for (const nid of card.nodeIds) {
        const n = nodeMap.get(nid);
        if (!n) continue;
        simNodes.push({ id: nid, x: n.x, y: n.y, r: (n.radius ?? 14) + 6 });
      }
      if (simNodes.length === 0) continue;

      const compSet = new Set(card.nodeIds);
      const simEdges: any[] = [];
      for (const e of edges) {
        const s = typeof e.source === 'object' ? e.source.id : e.source;
        const t = typeof e.target === 'object' ? e.target.id : e.target;
        if (compSet.has(s) && compSet.has(t)) simEdges.push({ source: s, target: t });
      }

      const sim = d3.forceSimulation(simNodes)
        .alphaMin(0.001)
        .velocityDecay(0.4)
        .force('cent', d3.forceCenter(box.x + box.w / 2, box.y + box.h / 2).strength(0.02))
        .force('coll', d3.forceCollide().radius((d: any) => d.r + 3).strength(1.5))
        .force('bnd', () => {
          for (const sn of simNodes) {
            // 跳过被拖拽的节点（有 fx/fy 设置）
            if (sn.fx != null || sn.fy != null) continue;
            if (sn.x - sn.r < box.x) sn.x = box.x + sn.r;
            else if (sn.x + sn.r > box.x + box.w) sn.x = box.x + box.w - sn.r;
            if (sn.y - sn.r < box.y) sn.y = box.y + sn.r;
            else if (sn.y + sn.r > box.y + box.h) sn.y = box.y + box.h - sn.r;
          }
        });

      if (simEdges.length > 0)
        sim.force('lnk', d3.forceLink(simEdges).id((d: any) => d.id).distance(40).strength(0.15));

      sim.alpha(0.05).alphaTarget(0).restart();
      this._cardSims.set(card.id, { sim, nodeIds: card.nodeIds, simNodes });
    }
  }

  private _computeCompHash(): string {
    if (this.state.cardSource === 'groups') {
      const cards = buildGroupCards(this._graph, this._allGroups);
      return cards.map(c => c.id).join('|');
    }
    const nodes: any[] = this._graph?.nodes || [];
    const edges: any[] = this._graph?.edges || [];
    const comps = findComponents(nodes, edges);
    return comps.map(c => c.sort().join(',')).sort().join('|');
  }

  private _stopCardSims(): void {
    for (const [, entry] of this._cardSims) {
      entry.sim.stop();
    }
    this._cardSims.clear();
  }
}
