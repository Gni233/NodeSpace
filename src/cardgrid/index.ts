import * as d3 from 'd3';
import { Container } from 'pixi.js';
import { Card, CardGridState, CardSource } from './types';
import {
  findComponents, buildGroupCards, createState,
  syncComponentCards, syncGroupCards,
} from './partition';
import { layoutCards, cardWorldBox, cardContentScreenBox } from './treemap';
import { renderCards } from './render';
import { setupCardInteractions, InteractionContext } from './interactions';
import { LayoutController } from '../layout-controller';
import { sharedState } from '../shared-state';
import { isCardForceLink } from './force-links';
import { getStructureProjection } from '../structure-nodes';

export type { Card, CardGridState } from './types';

interface CardSimulationParams {
  getLinkDist?: () => number;
  getLinkStr?: () => number;
  getCharge?: () => number;
  getCenterS?: () => number;
  getCollideR?: () => number;
}

interface CardSimData {
  card: Card;
  simNodes: any[];
  box: { x: number; y: number; w: number; h: number };
  linkDistance: number;
  chargeStrength: number;
  centerStrength: number;
}

const ACTIVE_FRAME_MS = 15;
const ACTIVE_FPS_HOLD_MS = 300;

/** Scale a card node's label without changing its circle or interactive area. */
export function getCardLabelSize(baseLabelSize: number, viewScale: number): number {
  const scale = Number.isFinite(viewScale) ? viewScale : 1;
  return Math.max(12, Math.min(28, Math.round(baseLabelSize * scale)));
}

export class CardGridController implements LayoutController {
  readonly mode: 'cardgrid' | 'category' | 'fullcat';
  drawFn: () => void = () => {};
  saveFn: () => void = () => {};
  directSaveFn: (() => void) | null = null;
  _saving = false;

  private _state!: CardGridState;
  private _graph: any = null;
  private _pixi: any = null;
  private _sm: any = null;
  private _creationOrder = new Map<string, number>();
  private _creationSeq = 0;
  private _screenW = 1200;
  private _screenH = 800;
  private _cardLayer: Container | null = null;
  private _allGroups = false;
  private _lastCompHash = '';

  private _cardSims = new Map<string, d3.Simulation<any, any>>();
  private _cardByNode = new Map<string, Card>();
  private _graphNodeById = new Map<string, any>();
  private _layoutNodes: any[] = [];
  private _layoutEdges: any[] = [];
  private _globalSimNodeById = new Map<string, any>();
  private _cleanupInteraction: (() => void) | null = null;
  private _rafId: number | null = null;
  private _active = false;
  private _simParams: CardSimulationParams = {};
  private _savedViewport: { x: number; y: number; scaleX: number; scaleY: number } | null = null;
  private _lastRenderAt = 0;
  private _activeFpsUntil = 0;
  private _getLayoutBounds: (() => { x: number; y: number; w: number; h: number }) | null = null;
  private _viewSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private _graphChangeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(mode: 'cardgrid' | 'category' | 'fullcat' = 'cardgrid') {
    this.mode = mode;
    this._state = createState('components');
  }

  activate(
    graph: any,
    pixi: any,
    simManager: any,
    simParams: CardSimulationParams,
    options?: {
      borderStyle?: 'straight' | 'rounded';
      gap?: number;
      cardSource?: CardSource;
      allGroups?: boolean;
      getLayoutBounds?: () => { x: number; y: number; w: number; h: number };
      onBackgroundTap?: () => void;
    },
  ): void {
    this._graph = graph;
    this._pixi = pixi;
    this._sm = simManager;
    this._simParams = simParams;
    this._allGroups = options?.allGroups ?? false;
    this._getLayoutBounds = options?.getLayoutBounds ?? null;

    this._creationOrder = new Map();
    this._creationSeq = 0;
    if (graph?.nodes) {
      for (const n of graph.nodes) {
        n.fx = null; n.fy = null;
        delete n._pieColors;
        if (!this._creationOrder.has(n.id)) this._creationOrder.set(n.id, this._creationSeq++);
      }
    }

    if (pixi?.app?.canvas) {
      this._screenW = pixi.app.canvas.clientWidth || 1200;
      this._screenH = pixi.app.canvas.clientHeight || 800;
    }

    const source = options?.cardSource ?? 'components';
    this._state = createState(source);
    if (options?.borderStyle) this._state.borderStyle = options.borderStyle;
    if (options?.gap != null) this._state.gap = options.gap;

    const vp = pixi?.viewport;
    if (vp) {
      this._savedViewport = { x: vp.x, y: vp.y, scaleX: vp.scale.x, scaleY: vp.scale.y };
      const screenPositions = new Map<string, { x: number; y: number }>();
      for (const n of graph?.nodes ?? []) screenPositions.set(n.id, vp.toScreen(n.x, n.y));
      for (const plugin of ['drag', 'pinch', 'decelerate']) vp.plugins?.pause?.(plugin);
      vp.position.set(0, 0);
      vp.scale.set(1);
      for (const n of graph?.nodes ?? []) {
        const p = screenPositions.get(n.id);
        if (p) { n.x = p.x; n.y = p.y; }
      }
    }
    const globalSim = this._sm?.getSim?.();
    if (globalSim) {
      for (const node of globalSim.nodes() as any[]) node.fx = node.fy = null;
      globalSim.stop();
    }

    this._active = true;

    this._cardLayer = pixi?.cardLayer ?? null;

    if (pixi?.app?.canvas) {
      const ctx: InteractionContext = {
        getState: () => this._state,
        getCards: () => this._state.cards,
        getCanvas: () => pixi.app.canvas as HTMLCanvasElement,
        getViewport: () => this._pixi?.viewport ?? null,
        isOverNode: (sx, sy) => this._isOverNode(sx, sy),
        draw: () => this.drawFn(),
        onSwap: (s, t) => this.swapCards(s, t),
        onPan: (id, dx, dy) => this.panCard(id, dx, dy),
        onZoom: (id, factor, x, y) => this.zoomCard(id, factor, x, y),
        onResetView: id => this.resetCardView(id),
        onBackgroundTap: () => options?.onBackgroundTap?.(),
        onBackgroundPointerDown: () => { sharedState.focusHoverNodeId = null; },
      };
      this._cleanupInteraction = setupCardInteractions(pixi.app.canvas as HTMLCanvasElement, ctx);
    }
  }

  deactivate(): void {
    this._active = false;
    if (this._graphChangeTimer != null) {
      clearTimeout(this._graphChangeTimer);
      this._graphChangeTimer = null;
    }
    if (this._viewSaveTimer != null) {
      clearTimeout(this._viewSaveTimer);
      this._viewSaveTimer = null;
      this._saveViewState();
    }
    if (this._rafId != null) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    for (const [, sim] of this._cardSims) sim.stop();
    this._cardSims.clear();
    this._cardByNode.clear();
    this._graphNodeById.clear();
    this._globalSimNodeById.clear();
    if (this._cardLayer) {
      this._state = createState('components');
    }
    const vp = this._pixi?.viewport;
    if (vp && this._savedViewport) {
      vp.position.set(this._savedViewport.x, this._savedViewport.y);
      vp.scale.set(this._savedViewport.scaleX, this._savedViewport.scaleY);
      for (const n of this._graph?.nodes ?? []) {
        const world = vp.toWorld(n.x, n.y);
        n.x = world.x;
        n.y = world.y;
      }
      for (const plugin of ['drag', 'pinch', 'decelerate']) vp.plugins?.resume?.(plugin);
    }
    this._savedViewport = null;
    this._getLayoutBounds = null;
    if (this._graph?.nodes) {
      for (const n of this._graph.nodes) n.fx = n.fy = null;
    }
    if (this._cleanupInteraction) {
      this._cleanupInteraction();
      this._cleanupInteraction = null;
    }
    this._cardLayer = null;

    const gsim = this._sm?.getSim?.();
    if (gsim) {
      const graphNodes = new Map<string, any>((this._graph?.nodes ?? []).map((n: any) => [n.id, n]));
      for (const sn of gsim.nodes() as any[]) {
        const gn = graphNodes.get(sn.id);
        if (gn) { sn.x = gn.x; sn.y = gn.y; }
        sn.fx = sn.fy = null;
      }
      gsim.alpha(0.3).alphaTarget(0).restart();
    }
  }

  update(): void {
    if (!this._graph) return;

    const gsim = this._sm?.getSim?.();
    this._advanceCardLayout();

    const dragNodeId = this._sm?.getDragNode?.() as string | null | undefined;
    const draggedGraphNode = dragNodeId ? this._graphNodeById.get(dragNodeId) : null;
    const draggedSimNode = dragNodeId ? this._globalSimNodeById.get(dragNodeId) : null;
    // The pointer system writes to the visible graph/projection node. In a
    // static, shared, or scoped view that object is not guaranteed to be the
    // global simulation node, so prefer the graph-side drag coordinates.
    const dragX = Number.isFinite(draggedGraphNode?.fx)
      ? draggedGraphNode.fx
      : Number.isFinite(draggedSimNode?.fx) ? draggedSimNode.fx : null;
    const dragY = Number.isFinite(draggedGraphNode?.fy)
      ? draggedGraphNode.fy
      : Number.isFinite(draggedSimNode?.fy) ? draggedSimNode.fy : null;

    for (const [cardId, sim] of this._cardSims) {
      const cd = (sim as any)._cardData as CardSimData | undefined;
      if (!cd) continue;
      for (const sn of cd.simNodes) {
        if (sn.id === dragNodeId && dragX != null && dragY != null) {
          sn.x = sn.fx = dragX;
          sn.y = sn.fy = dragY;
        } else if (sn.fx != null) {
          sn.fx = null;
          sn.fy = null;
        }
      }
      if (cd.card.id === cardId) this._syncSimGeometry(cd.card, sim, cd);
      sim.tick();
      for (const sn of cd.simNodes) {
        if (sn.fx != null || sn.fy != null) continue;
        const gn = this._graphNodeById.get(sn.id);
        if (gn) { gn.x = sn.x; gn.y = sn.y; }
      }
    }

    if (dragNodeId && dragX != null && dragY != null) {
      const gn = this._graphNodeById.get(dragNodeId);
      if (gn) { gn.x = dragX; gn.y = dragY; }
    }

    if (gsim) {
      for (const gsn of gsim.nodes() as any[]) {
        if (gsn.id === dragNodeId) continue;
        const gn = this._graphNodeById.get(gsn.id);
        if (gn) { gsn.x = gn.x; gsn.y = gn.y; gsn.fx = null; gsn.fy = null; }
      }
    }
  }

  render(accentColor: number): void {
    if (this._cardLayer) renderCards(this._cardLayer, this._state, accentColor);
  }

  layoutAndAnimate(): void {
    this._doLayout();
    this._startSims();
    this.wake();
  }

  onGraphChanged(): void {
    if (this._saving || !this._active) return;
    if (this._graphChangeTimer != null) clearTimeout(this._graphChangeTimer);
    this._graphChangeTimer = setTimeout(() => {
      this._graphChangeTimer = null;
      this.recalcAndAnimate();
    }, 200);
  }

  recalcAndAnimate(): void {
    const h = this._computeCompHash();
    if (h !== this._lastCompHash) {
      this._lastCompHash = h;
      this._doLayout();
      this._startSims();
    }
    this.wake();
    this._saving = true;
    this.saveFn();
    this._saving = false;
  }

  swapCards(srcId: string, tgtId: string): void {
    const src = this._state.cards.find(c => c.id === srcId);
    const tgt = this._state.cards.find(c => c.id === tgtId);
    if (!src || !tgt) return;
    [src.order, tgt.order] = [tgt.order, src.order];
    this._persistOrders();
    this._doLayout();
    this._startSims();
    this.wake();
    this.directSaveFn?.();
  }

  /** 卡片交互始终跟随显示器帧率；静止场景由按需渲染负责省电。 */
  wake(alpha = 0.35, cardId?: string): void {
    if (!this._active) return;
    this._activeFpsUntil = performance.now() + ACTIVE_FPS_HOLD_MS;
    const sims = cardId
      ? [this._cardSims.get(cardId)].filter((sim): sim is d3.Simulation<any, any> => !!sim)
      : [...this._cardSims.values()];
    for (const sim of sims) {
      sim.alpha(Math.max(sim.alpha(), alpha)).alphaTarget(0).stop();
    }
    if (this._rafId != null) return;
    const loop = (now: number) => {
      if (!this._active) { this._rafId = null; return; }
      if (now - this._lastRenderAt < ACTIVE_FRAME_MS) {
        this._rafId = requestAnimationFrame(loop);
        return;
      }
      this._lastRenderAt = now;
      this.drawFn();
      const cardsMoving = this._state.cards.some(card =>
        card.targetX != null && (
          Math.abs(card.targetX - card.x) > 0.15
          || Math.abs((card.targetY ?? card.y) - card.y) > 0.15
          || Math.abs((card.targetW ?? card.w) - card.w) > 0.15
          || Math.abs((card.targetH ?? card.h) - card.h) > 0.15
        ),
      );
      const simulationsMoving = [...this._cardSims.values()].some(sim => sim.alpha() > 0.012);
      const dragActive = this._sm?.getDragNode?.() != null;
      if (now >= this._activeFpsUntil && !cardsMoving && !simulationsMoving && !dragActive) {
        this._rafId = null;
        return;
      }
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  panCard(cardId: string, dx: number, dy: number): void {
    const card = this._state.cards.find(c => c.id === cardId);
    const sim = this._cardSims.get(cardId);
    const vp = this._pixi?.viewport;
    if (!card || !sim || !vp) return;
    const maxX = Math.max(12, card.w * 0.35);
    const maxY = Math.max(12, card.h * 0.35);
    const nextX = Math.max(-maxX, Math.min(maxX, card.viewOffsetX + dx));
    const nextY = Math.max(-maxY, Math.min(maxY, card.viewOffsetY + dy));
    const actualX = nextX - card.viewOffsetX;
    const actualY = nextY - card.viewOffsetY;
    card.viewOffsetX = nextX;
    card.viewOffsetY = nextY;
    const p0 = vp.toWorld(0, 0);
    const p1 = vp.toWorld(actualX, actualY);
    const cd = (sim as any)._cardData as CardSimData;
    for (const n of cd.simNodes) { n.x += p1.x - p0.x; n.y += p1.y - p0.y; }
    this._persistViews();
    this.wake(0.2, cardId);
  }

  zoomCard(cardId: string, factor: number, anchorX: number, anchorY: number): void {
    const card = this._state.cards.find(c => c.id === cardId);
    const sim = this._cardSims.get(cardId);
    const vp = this._pixi?.viewport;
    if (!card || !sim || !vp) return;
    const oldScale = card.viewScale || 1;
    const nextScale = Math.max(0.45, Math.min(2.5, oldScale * factor));
    const ratio = nextScale / oldScale;
    if (Math.abs(ratio - 1) < 0.001) return;
    const anchor = vp.toWorld(anchorX, anchorY);
    const cd = (sim as any)._cardData as CardSimData;
    for (const n of cd.simNodes) {
      n.x = anchor.x + (n.x - anchor.x) * ratio;
      n.y = anchor.y + (n.y - anchor.y) * ratio;
    }
    card.viewScale = nextScale;
    this._persistViews();
    this.wake(0.28, cardId);
  }

  resetCardView(cardId: string): void {
    const card = this._state.cards.find(c => c.id === cardId);
    const sim = this._cardSims.get(cardId);
    const vp = this._pixi?.viewport;
    if (!card || !sim || !vp) return;
    const center = vp.toWorld(card.x + card.w / 2, card.y + card.h / 2);
    const cd = (sim as any)._cardData as CardSimData;
    const inv = 1 / Math.max(0.01, card.viewScale || 1);
    for (const n of cd.simNodes) {
      n.x = center.x + (n.x - center.x) * inv;
      n.y = center.y + (n.y - center.y) * inv;
    }
    card.viewScale = 1;
    card.viewOffsetX = 0;
    card.viewOffsetY = 0;
    this._persistViews();
    this.wake(0.5, cardId);
  }

  /** Returns this node's current local card zoom, or null when it has no card. */
  getNodeViewScale(nodeId: string): number | null {
    return this._cardByNode.get(nodeId)?.viewScale ?? null;
  }

  hiddenEdgeIndices(edges: any[]): Set<number> {
    const result = new Set<number>();
    edges.forEach((edge, index) => {
      const source = typeof edge.source === 'object' ? edge.source.id : edge.source;
      const target = typeof edge.target === 'object' ? edge.target.id : edge.target;
      const sourceCard = this._cardByNode.get(source);
      const targetCard = this._cardByNode.get(target);
      if (sourceCard && targetCard && sourceCard.id !== targetCard.id) result.add(index);
    });
    return result;
  }

  constrainNodePosition(nodeId: string, x: number, y: number): [number, number] {
    const card = this._cardByNode.get(nodeId);
    const vp = this._pixi?.viewport;
    if (!card || !vp) return [x, y];
    this.wake(0.2, card.id);
    const content = cardContentScreenBox(card);
    const tl = vp.toWorld(content.x, content.y);
    const br = vp.toWorld(content.x + content.w, content.y + content.h);
    const nextX = Math.max(tl.x, Math.min(br.x, x));
    const nextY = Math.max(tl.y, Math.min(br.y, y));

    // Commit the pointer position directly to both representations. Waiting
    // for the stopped global simulation to mirror fx/fy made the data change
    // while the Pixi sprite appeared frozen in scoped/static card views.
    const graphNode = this._graphNodeById.get(nodeId);
    if (graphNode) {
      graphNode.x = nextX;
      graphNode.y = nextY;
      graphNode.fx = nextX;
      graphNode.fy = nextY;
    }
    const sim = this._cardSims.get(card.id);
    const data = sim ? (sim as any)._cardData as CardSimData | undefined : undefined;
    const simNode = data?.simNodes.find(node => node.id === nodeId);
    if (simNode) {
      simNode.x = nextX;
      simNode.y = nextY;
      simNode.fx = nextX;
      simNode.fy = nextY;
    }
    return [nextX, nextY];
  }

  markNewNode(nodeId: string): void {
    if (!this._creationOrder.has(nodeId)) {
      this._creationOrder.set(nodeId, this._creationSeq++);
    }
  }

  resize(w: number, h: number): void {
    this._screenW = w;
    this._screenH = h;
    this._doLayout();
    this._startSims();
    this.wake(0.45);
  }

  // ========= 内部 =========

  private _doLayout(): void {
    if (!this._graph) return;

    const projection = getStructureProjection(this._graph);
    this._layoutNodes = projection.nodes;
    this._layoutEdges = projection.edges;

    const sk = this._state.source !== 'components' ? 'groupCardOrders' : 'cardOrders';
    const savedOrders = (this._graph.settings as any)?.[sk] ?? null;

    if (this._state.source !== 'components') {
      const newCards = buildGroupCards(this._graph, this._allGroups, this._layoutNodes);
      this._state.cards = syncGroupCards(this._state.cards, newCards, savedOrders);
    } else {
      const ns = this._layoutNodes;
      for (const n of ns) {
        if (!this._creationOrder.has(n.id)) this._creationOrder.set(n.id, this._creationSeq++);
      }
      const comps = findComponents(ns, this._layoutEdges);
      this._state.cards = syncComponentCards(this._state.cards, comps, this._creationOrder, savedOrders);
    }

    this._lastCompHash = this._computeCompHash();
    this._cardByNode.clear();
    this._graphNodeById.clear();
    for (const node of this._layoutNodes) this._graphNodeById.set(node.id, node);
    for (const card of this._state.cards) {
      for (const nodeId of card.nodeIds) this._cardByNode.set(nodeId, card);
      card.areaWeight = card.nodeIds.reduce((sum, nodeId) => {
        const node = this._graphNodeById.get(nodeId);
        const textLength = String(node?.label || '').length + String(node?.note || '').length;
        const readingWeight = Math.min(2.4, Math.sqrt(textLength) / 12);
        const resourceWeight = node?.resourceRef || node?.spaceRef || node?.mediaType ? 0.8 : 0;
        return sum + 1 + readingWeight + resourceWeight;
      }, 0);
    }
    const bounds = this._getLayoutBounds?.() ?? { x: 0, y: 0, w: this._screenW, h: this._screenH };
    layoutCards(this._state.cards, Math.max(1, bounds.w), Math.max(1, bounds.h), this._state.gap, bounds.x, bounds.y);
    this._restoreViews();
    this._persistOrders();
  }

  private _startSims(): void {
    if (!this._graph) return;

    for (const [, sim] of this._cardSims) sim.stop();
    this._cardSims.clear();

    const gsim = this._sm?.getSim?.();
    gsim?.stop();
    this._globalSimNodeById.clear();
    for (const node of gsim?.nodes?.() ?? []) this._globalSimNodeById.set(node.id, node);

    const allEdges = this._layoutEdges;

    for (const card of this._state.cards) {
      if (card.nodeIds.length === 0) continue;

      const box = cardWorldBox(card, this._pixi?.viewport ?? null);
      if (!box || box.w <= 20 || box.h <= 20) continue;

      const vp = this._pixi?.viewport;
      if (!vp) continue;
      const center = vp.toWorld(
        card.x + card.w / 2 + card.viewOffsetX,
        card.y + card.h / 2 + card.viewOffsetY,
      );
      const cx = center.x;
      const cy = center.y;

      const simNodes: any[] = [];
      for (let index = 0; index < card.nodeIds.length; index++) {
        const id = card.nodeIds[index];
        const gn = this._graphNodeById.get(id);
        if (!gn) continue;
        const radius = this._nodeRadius(gn);
        const inside = Number.isFinite(gn.x) && Number.isFinite(gn.y)
          && gn.x >= box.x && gn.x <= box.x + box.w
          && gn.y >= box.y && gn.y <= box.y + box.h;
        const angle = index * 2.399963229728653;
        const spread = Math.min(box.w, box.h) * Math.min(0.32, 0.06 * Math.sqrt(index + 1));
        simNodes.push({
          id,
          x: inside ? gn.x : cx + Math.cos(angle) * spread,
          y: inside ? gn.y : cy + Math.sin(angle) * spread,
          r: radius + 4,
        });
      }
      if (simNodes.length === 0) continue;

      const cardNodeIds = new Set(card.nodeIds);
      const cardEdges = allEdges.flatMap((e: any) => {
        const s = typeof e.source === 'object' ? e.source.id : e.source;
        const t = typeof e.target === 'object' ? e.target.id : e.target;
        return cardNodeIds.has(s) && cardNodeIds.has(t) && isCardForceLink(e)
          ? [{ ...e, source: s, target: t }]
          : [];
      });

      const chargeStrength = (this._simParams.getCharge?.() ?? -100) * card.viewScale;
      const centerStrength = this._simParams.getCenterS?.() ?? 0.05;
      const linkDistance = (this._simParams.getLinkDist?.() ?? 40) * card.viewScale;
      const data: CardSimData = {
        card,
        simNodes,
        box: { ...box },
        linkDistance,
        chargeStrength,
        centerStrength,
      };
      const sim = d3.forceSimulation(simNodes)
        .force('charge', d3.forceManyBody().strength(chargeStrength))
        // A per-node pull does not translate the whole card when one node is
        // pinned under the pointer, unlike forceCenter's centroid correction.
        .force('x', d3.forceX(cx).strength(centerStrength))
        .force('y', d3.forceY(cy).strength(centerStrength))
        .force('collide', d3.forceCollide().radius((d: any) => d.r + (this._simParams.getCollideR?.() ?? 4)).strength(1))
        .force('bnd', () => {
          const b = data.box;
          for (const sn of simNodes) {
            if (sn.fx != null || sn.fy != null) continue;
            if (sn.x - sn.r < b.x) { sn.x = b.x + sn.r; sn.vx = Math.abs(sn.vx || 0) * 0.2; }
            else if (sn.x + sn.r > b.x + b.w) { sn.x = b.x + b.w - sn.r; sn.vx = -Math.abs(sn.vx || 0) * 0.2; }
            if (sn.y - sn.r < b.y) { sn.y = b.y + sn.r; sn.vy = Math.abs(sn.vy || 0) * 0.2; }
            else if (sn.y + sn.r > b.y + b.h) { sn.y = b.y + b.h - sn.r; sn.vy = -Math.abs(sn.vy || 0) * 0.2; }
          }
        });

      if (cardEdges.length > 0)
        sim.force('link', d3.forceLink(cardEdges)
          .id((d: any) => d.id)
          .distance(linkDistance)
          .strength(this._simParams.getLinkStr?.() ?? 0.3));

      // 手动推进并自然冷却；交互会通过 wake() 重新加热。
      sim.alpha(1).alphaTarget(0).stop();
      (sim as any)._cardData = data;

      this._cardSims.set(card.id, sim);
    }
  }

  private _isOverNode(sx: number, sy: number): boolean {
    const vp = this._pixi?.viewport;
    if (!vp) return false;
    const w = vp.toWorld(sx, sy);
    for (const n of this._layoutNodes) {
      const r = (n.radius ?? 14) + 6;
      if ((w.x - n.x) ** 2 + (w.y - n.y) ** 2 <= r * r) return true;
    }
    return false;
  }

  private _advanceCardLayout(): void {
    for (const card of this._state.cards) {
      if (card.targetX == null || card.targetY == null || card.targetW == null || card.targetH == null) continue;
      for (const key of ['x', 'y', 'w', 'h'] as const) {
        const target = card[`target${key.toUpperCase()}` as 'targetX' | 'targetY' | 'targetW' | 'targetH']!;
        const delta = target - card[key];
        card[key] = Math.abs(delta) < 0.15 ? target : card[key] + delta * 0.18;
      }
    }
  }

  private _syncSimGeometry(card: Card, sim: d3.Simulation<any, any>, data: CardSimData): void {
    const vp = this._pixi?.viewport;
    if (!vp) return;
    const box = cardWorldBox(card, vp);
    if (!box) return;
    Object.assign(data.box, box);
    const center = vp.toWorld(
      card.x + card.w / 2 + card.viewOffsetX,
      card.y + card.h / 2 + card.viewOffsetY,
    );
    const xForce = sim.force('x') as any;
    const yForce = sim.force('y') as any;
    xForce?.x?.(center.x);
    yForce?.y?.(center.y);

    const centerStrength = this._simParams.getCenterS?.() ?? 0.05;
    if (centerStrength !== data.centerStrength) {
      xForce?.strength?.(centerStrength);
      yForce?.strength?.(centerStrength);
      data.centerStrength = centerStrength;
    }
    const linkDistance = (this._simParams.getLinkDist?.() ?? 40) * card.viewScale;
    if (linkDistance !== data.linkDistance) {
      (sim.force('link') as any)?.distance?.(linkDistance);
      data.linkDistance = linkDistance;
    }
    const chargeStrength = (this._simParams.getCharge?.() ?? -100) * card.viewScale;
    if (chargeStrength !== data.chargeStrength) {
      (sim.force('charge') as any)?.strength?.(chargeStrength);
      data.chargeStrength = chargeStrength;
    }
  }

  private _restoreViews(): void {
    const key = this._state.source === 'components' ? 'cardViews' : 'groupCardViews';
    const views = (this._graph?.settings as any)?.[key] as Record<string, { scale: number; offsetX: number; offsetY: number }> | undefined;
    if (!views) return;
    for (const card of this._state.cards) {
      const view = views[card.id];
      if (!view) continue;
      card.viewScale = Math.max(0.45, Math.min(2.5, view.scale || 1));
      card.viewOffsetX = Number.isFinite(view.offsetX) ? view.offsetX : 0;
      card.viewOffsetY = Number.isFinite(view.offsetY) ? view.offsetY : 0;
    }
  }

  private _persistViews(): void {
    if (!this._graph?.settings) return;
    const key = this._state.source === 'components' ? 'cardViews' : 'groupCardViews';
    const views: Record<string, { scale: number; offsetX: number; offsetY: number }> = {};
    for (const card of this._state.cards) {
      views[card.id] = { scale: card.viewScale, offsetX: card.viewOffsetX, offsetY: card.viewOffsetY };
    }
    (this._graph.settings as any)[key] = views;
    if (this._viewSaveTimer != null) clearTimeout(this._viewSaveTimer);
    this._viewSaveTimer = setTimeout(() => {
      this._viewSaveTimer = null;
      this._saveViewState();
    }, 250);
  }

  private _saveViewState(): void {
    this._saving = true;
    this.saveFn();
    this._saving = false;
  }

  private _nodeRadius(node: any): number {
    if (node.radiusMode === 'custom' || (!node.radiusMode && node.radius)) return node.radius || 9;
    return [22, 19, 16, 13, 10, 7][(node.headingLevel || 6) - 1] || 9;
  }

  private _persistOrders(): void {
    if (!this._graph?.settings) return;
    const k = (this._state.source !== 'components') ? 'groupCardOrders' : 'cardOrders';
    const o: Record<string, number> = {};
    for (const c of this._state.cards) o[c.id] = c.order;
    (this._graph.settings as any)[k] = o;
  }

  private _computeCompHash(): string {
    const projection = getStructureProjection(this._graph);
    if (this._state.source !== 'components') {
      return buildGroupCards(this._graph, this._allGroups, projection.nodes)
        .map(c => `${c.id}:${[...c.nodeIds].sort().join(',')}`)
        .sort()
        .join('|');
    }
    const ns = projection.nodes;
    const es = projection.edges;
    return findComponents(ns, es).map(c => c.sort().join(',')).sort().join('|');
  }
}
