import { CardGridState, Card } from './types';

export interface InteractionCtx {
  getState: () => CardGridState;
  getCards: () => Card[];
  getCanvas: () => HTMLCanvasElement;
  getViewport: () => { toWorld: (sx: number, sy: number) => { x: number; y: number } } | null;
  getSimNodes: () => any[];
  draw: () => void;
  onSwap: (sourceId: string, targetId: string) => void;
}

function hitCard(sx: number, sy: number, cards: Card[], excludeId?: string | null): Card | null {
  for (let i = cards.length - 1; i >= 0; i--) {
    const c = cards[i];
    if (c.id === excludeId) continue;
    if (sx >= c.x && sx <= c.x + c.w && sy >= c.y && sy <= c.y + c.h) return c;
  }
  return null;
}

function hitNode(vp: { toWorld: (sx: number, sy: number) => { x: number; y: number } }, simNodes: any[], sx: number, sy: number): boolean {
  const w = vp.toWorld(sx, sy);
  for (const n of simNodes) {
    const r = (n.radius ?? 14) + 6;
    if ((w.x - n.x) ** 2 + (w.y - n.y) ** 2 <= r * r) return true;
  }
  return false;
}

const DRAG_THRESHOLD = 5; // px, 超过此距离才进入拖拽交换模式

export function setupCardInteractions(canvas: HTMLCanvasElement, ctx: InteractionCtx): () => void {
  const state = () => ctx.getState();
  const opts: AddEventListenerOptions = { capture: true };

  let isDragging = false;
  let startedOnNode = false;
  let downX = 0, downY = 0;

  const onDown = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    downX = sx; downY = sy;

    const cards = ctx.getCards();
    const card = hitCard(sx, sy, cards);

    // 右键：选中/取消选中卡片
    if (e.button === 2) {
      e.stopImmediatePropagation();
      state().swapSource = null;
      state().swapTarget = null;
      state().selectedCardId = card?.id ?? null;
      ctx.draw();
      return;
    }

    // 点到节点 → 放行给 ui-events
    const vp = ctx.getViewport();
    if (vp) {
      const simNodes = ctx.getSimNodes();
      if (hitNode(vp, simNodes, sx, sy)) {
        startedOnNode = true;
        return;
      }
    }
    startedOnNode = false;

    e.stopImmediatePropagation();

    if (!card) {
      state().selectedCardId = null;
      state().swapSource = null;
      state().swapTarget = null;
      ctx.draw();
      return;
    }

    // 选中卡片（不立即设置 swapSource，等拖拽超过阈值再设）
    state().selectedCardId = card.id;
    state().swapSource = null;
    state().swapTarget = null;
    isDragging = false;
    requestAnimationFrame(() => ctx.draw());
  };

  const onMove = (e: PointerEvent) => {
    if (startedOnNode) return;
    if (!(e.buttons & 1)) return; // 鼠标松开时不处理拖拽
    const r = canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;

    const selId = state().selectedCardId;
    if (!selId) return;

    const dist = Math.hypot(sx - downX, sy - downY);
    if (dist < DRAG_THRESHOLD && !isDragging) return;

    // 进入拖拽模式
    if (!isDragging) {
      isDragging = true;
      state().swapSource = selId;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    }

    const cards = ctx.getCards();
    const target = hitCard(sx, sy, cards, state().swapSource);
    const prevTarget = state().swapTarget;

    if (target && target.id !== prevTarget) {
      state().swapTarget = target.id;
      ctx.draw();
    } else if (!target && prevTarget) {
      state().swapTarget = null;
      ctx.draw();
    }
  };

  const onUp = (_e: PointerEvent) => {
    if (startedOnNode) { startedOnNode = false; return; }

    const sourceId = state().swapSource;
    const targetId = state().swapTarget;

    if (isDragging && sourceId && targetId && sourceId !== targetId) {
      ctx.onSwap(sourceId, targetId);
    }

    state().swapSource = null;
    state().swapTarget = null;
    isDragging = false;
    ctx.draw();

    try { canvas.releasePointerCapture(_e.pointerId); } catch (_) { /* ignore */ }
  };

  const onCancel = () => {
    state().swapSource = null;
    state().swapTarget = null;
    isDragging = false;
    startedOnNode = false;
    ctx.draw();
  };

  canvas.addEventListener('pointerdown', onDown, opts);
  canvas.addEventListener('pointermove', onMove, opts);
  canvas.addEventListener('pointerup', onUp, opts);
  canvas.addEventListener('pointercancel', onCancel, opts);
  canvas.addEventListener('lostpointercapture', onCancel, opts);

  return () => {
    canvas.removeEventListener('pointerdown', onDown, opts);
    canvas.removeEventListener('pointermove', onMove, opts);
    canvas.removeEventListener('pointerup', onUp, opts);
    canvas.removeEventListener('pointercancel', onCancel, opts);
    canvas.removeEventListener('lostpointercapture', onCancel, opts);
  };
}
