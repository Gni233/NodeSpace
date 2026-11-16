const claimedTouches = new WeakSet<PointerEvent>();
const HOLD_DURATION = 500;
const HOLD_TOLERANCE = 10;
let cancelTouchHold: (() => void) | undefined;

export function bindContextMenuTrigger(trigger: HTMLElement, show: (x: number, y: number) => void, { touch = false } = {}) {
  let press: { id: number; x: number; y: number; timer: ReturnType<typeof setTimeout> } | null = null;
  let suppressClick = false;

  function clearPress() {
    if (press) clearTimeout(press.timer);
    press = null;
    if (cancelTouchHold === clearPress) cancelTouchHold = undefined;
  }

  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.addEventListener('contextmenu', event => {
    if (event.defaultPrevented) return;
    event.preventDefault();
    if (touch && (press || event.pointerType === 'touch')) {
      clearPress();
      if (suppressClick) return;
      suppressClick = true;
    }
    show(event.clientX, event.clientY);
  });
  trigger.addEventListener('keydown', event => {
    if (event.defaultPrevented || (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey))) return;
    event.preventDefault();
    const { left, bottom } = trigger.getBoundingClientRect();
    show(left, bottom);
  });

  if (!touch) return;
  trigger.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch') {
      if (claimedTouches.has(event)) return;
      // Let the nearest trigger own the hold while the viewport still handles panning.
      claimedTouches.add(event);
      cancelTouchHold?.();
    }
    clearPress();
    suppressClick = false;
    if (event.pointerType !== 'touch' || !event.isPrimary) return;
    const { pointerId, clientX, clientY } = event;
    const timer = setTimeout(() => {
      if (!trigger.isConnected) { clearPress(); return; }
      suppressClick = true;
      show(clientX, clientY);
    }, HOLD_DURATION);
    press = { id: pointerId, x: clientX, y: clientY, timer };
    cancelTouchHold = clearPress;
  }, { passive: true });
  trigger.addEventListener('pointermove', event => {
    if (press?.id === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > HOLD_TOLERANCE) clearPress();
  }, { passive: true });
  const finishPress = (event: PointerEvent) => { if (press?.id === event.pointerId) clearPress(); };
  trigger.addEventListener('pointerup', finishPress);
  trigger.addEventListener('pointercancel', finishPress);
  trigger.addEventListener('lostpointercapture', finishPress);
  trigger.addEventListener('click', event => {
    if (!suppressClick || event.detail === 0) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}
