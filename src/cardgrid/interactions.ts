import { Card, CardGridState } from './types';

export interface InteractionContext {
  getState: () => CardGridState;
  getCards: () => Card[];
  getCanvas: () => HTMLCanvasElement;
  getViewport: () => { toWorld: (sx: number, sy: number) => { x: number; y: number } } | null;
  /** 检查屏幕坐标是否命中一个节点 */
  isOverNode: (sx: number, sy: number) => boolean;
  draw: () => void;
  onSwap: (sourceId: string, targetId: string) => void;
  onPan: (cardId: string, dx: number, dy: number) => void;
  onZoom: (cardId: string, factor: number, anchorX: number, anchorY: number) => void;
  onResetView: (cardId: string) => void;
  onBackgroundTap: () => void;
  onBackgroundPointerDown: () => void;
}

const DRAG_THRESHOLD = 5; // 超过此 px 距离才进入拖拽交换
const REORDER_HANDLE_HEIGHT = 28;

/** 屏幕空间命中测试卡片 */
function hitCard(sx: number, sy: number, cards: Card[], excludeId?: string | null): Card | null {
  for (let i = cards.length - 1; i >= 0; i--) {
    const c = cards[i];
    if (c.id === excludeId) continue;
    if (sx >= c.x && sx <= c.x + c.w && sy >= c.y && sy <= c.y + c.h) return c;
  }
  return null;
}

export function setupCardInteractions(canvas: HTMLCanvasElement, ctx: InteractionContext): () => void {
  const opts: AddEventListenerOptions = { capture: true };

  let isDragging = false;
  let gesture: 'reorder' | 'pan' | 'pinch' | null = null;
  let activeCardId: string | null = null;
  let activePointerId: number | null = null;
  const touchPoints = new Map<number, { x: number; y: number; cardId: string }>();
  let pinchDistance = 0;
  let pinchCenterX = 0;
  let pinchCenterY = 0;
  let downX = 0;
  let downY = 0;
  let lastX = 0;
  let lastY = 0;

  const onPointerDown = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    downX = sx;
    downY = sy;
    lastX = sx;
    lastY = sy;

    // 节点命中 → 放行给主事件系统
    if (ctx.isOverNode(sx, sy)) return;

    // 不是点时由卡片系统接管，阻止全局 viewport 响应。
    ctx.onBackgroundPointerDown();
    e.stopImmediatePropagation();
    e.preventDefault();

    const state = ctx.getState();
    const card = hitCard(sx, sy, ctx.getCards());

    // 右键：切换选中卡片
    if (e.button === 2) {
      state.dragSourceId = null;
      state.dragTargetId = null;
      state.selectedCardId = card?.id ?? null;
      ctx.draw();
      return;
    }

    if (e.button !== 0) return;
    ctx.onBackgroundTap();

    // 左键
    if (card) {
      state.selectedCardId = card.id;
      state.dragSourceId = null;
      state.dragTargetId = null;
      isDragging = false;
      activeCardId = card.id;
      activePointerId = e.pointerId;
      gesture = sy <= card.y + REORDER_HANDLE_HEIGHT ? 'reorder' : 'pan';
      if (e.pointerType === 'touch' && gesture === 'pan') {
        touchPoints.set(e.pointerId, { x: sx, y: sy, cardId: card.id });
        const sameCard = [...touchPoints.entries()].filter(([, point]) => point.cardId === card.id);
        if (sameCard.length >= 2) {
          const [a, b] = sameCard.slice(-2).map(([, point]) => point);
          gesture = 'pinch';
          activePointerId = null;
          pinchDistance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
          pinchCenterX = (a.x + b.x) / 2;
          pinchCenterY = (a.y + b.y) / 2;
        }
      }
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    } else {
      // 点击空白：取消选中
      state.selectedCardId = null;
      state.dragSourceId = null;
      state.dragTargetId = null;
      activeCardId = null;
      activePointerId = null;
      gesture = null;
    }
    ctx.draw();
  };

  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch' && touchPoints.has(e.pointerId)) {
      const r = canvas.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      const point = touchPoints.get(e.pointerId)!;
      touchPoints.set(e.pointerId, { x: sx, y: sy, cardId: point.cardId });
      if (gesture === 'pinch' && activeCardId) {
        const sameCard = [...touchPoints.values()].filter(value => value.cardId === activeCardId);
        if (sameCard.length >= 2) {
          e.stopImmediatePropagation();
          e.preventDefault();
          const [a, b] = sameCard.slice(-2);
          const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
          const centerX = (a.x + b.x) / 2;
          const centerY = (a.y + b.y) / 2;
          ctx.onPan(activeCardId, centerX - pinchCenterX, centerY - pinchCenterY);
          ctx.onZoom(activeCardId, distance / pinchDistance, centerX, centerY);
          pinchDistance = distance;
          pinchCenterX = centerX;
          pinchCenterY = centerY;
          return;
        }
      }
    }
    if (!(e.buttons & 1) || activePointerId !== e.pointerId || !activeCardId || !gesture) return;
    e.stopImmediatePropagation();
    e.preventDefault();

    const state = ctx.getState();
    const r = canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const dist = Math.hypot(sx - downX, sy - downY);

    if (dist < DRAG_THRESHOLD && !isDragging) return;

    if (gesture === 'pan') {
      isDragging = true;
      ctx.onPan(activeCardId, sx - lastX, sy - lastY);
      lastX = sx;
      lastY = sy;
      return;
    }

    // 顶部手柄拖动：交换卡片顺序，再由 treemap 重新决定形状。
    if (!isDragging) {
      isDragging = true;
      state.dragSourceId = activeCardId;
    }

    const target = hitCard(sx, sy, ctx.getCards(), state.dragSourceId);
    state.dragTargetId = target?.id ?? null;
    ctx.draw();
  };

  const onPointerUp = (_e: PointerEvent) => {
    if (_e.pointerType === 'touch') touchPoints.delete(_e.pointerId);
    if (gesture === 'pinch') {
      if (touchPoints.size < 2) {
        gesture = null;
        activeCardId = null;
        activePointerId = null;
        pinchDistance = 0;
        ctx.draw();
      }
      try { canvas.releasePointerCapture(_e.pointerId); } catch (_) { /* ignore */ }
      return;
    }
    if (activePointerId !== _e.pointerId) return;
    const state = ctx.getState();
    const src = state.dragSourceId;
    const tgt = state.dragTargetId;

    if (gesture === 'reorder' && isDragging && src && tgt && src !== tgt) {
      ctx.onSwap(src, tgt);
    }

    state.dragSourceId = null;
    state.dragTargetId = null;
    isDragging = false;
    gesture = null;
    activeCardId = null;
    activePointerId = null;
    ctx.draw();
    try { canvas.releasePointerCapture(_e.pointerId); } catch (_) { /* ignore */ }
  };

  const onCancel = () => {
    const state = ctx.getState();
    state.dragSourceId = null;
    state.dragTargetId = null;
    isDragging = false;
    gesture = null;
    activeCardId = null;
    activePointerId = null;
    touchPoints.clear();
    pinchDistance = 0;
    ctx.draw();
  };

  const onWheel = (e: WheelEvent) => {
    const r = canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const card = hitCard(sx, sy, ctx.getCards());
    e.stopImmediatePropagation();
    e.preventDefault();
    if (!card) return;
    const factor = Math.exp(-e.deltaY * 0.0015);
    ctx.onZoom(card.id, factor, sx, sy);
  };

  const onDoubleClick = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    if (ctx.isOverNode(sx, sy)) return;
    const card = hitCard(sx, sy, ctx.getCards());
    if (!card) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    ctx.onResetView(card.id);
  };

  canvas.addEventListener('pointerdown', onPointerDown, opts);
  canvas.addEventListener('pointermove', onPointerMove, opts);
  canvas.addEventListener('pointerup', onPointerUp, opts);
  canvas.addEventListener('pointercancel', onCancel, opts);
  canvas.addEventListener('lostpointercapture', onCancel, opts);
  canvas.addEventListener('wheel', onWheel, { capture: true, passive: false });
  canvas.addEventListener('dblclick', onDoubleClick, opts);

  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown, opts);
    canvas.removeEventListener('pointermove', onPointerMove, opts);
    canvas.removeEventListener('pointerup', onPointerUp, opts);
    canvas.removeEventListener('pointercancel', onCancel, opts);
    canvas.removeEventListener('lostpointercapture', onCancel, opts);
    canvas.removeEventListener('wheel', onWheel, { capture: true } as EventListenerOptions);
    canvas.removeEventListener('dblclick', onDoubleClick, opts);
  };
}
