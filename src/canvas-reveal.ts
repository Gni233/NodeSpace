export interface RevealRect { left: number; top: number; right: number; bottom: number }

const valid = (rect: RevealRect) => [rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite)
  && rect.right > rect.left && rect.bottom > rect.top;
const area = (rect: RevealRect) => Math.max(0, rect.right - rect.left) * Math.max(0, rect.bottom - rect.top);
const intersection = (a: RevealRect, b: RevealRect): RevealRect => ({
  left: Math.max(a.left, b.left), top: Math.max(a.top, b.top),
  right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom),
});

/** Screen-space translation only: preserve zoom and keep already visible content still.
 * When a large card or widely separated endpoints cannot all fit, balance their
 * visible fractions before choosing the shortest movement. */
export function computeRevealTranslation(targets: RevealRect[], viewport: RevealRect, obstacles: RevealRect[], gap = 12): { x: number; y: number } | null {
  targets = targets.filter(valid);
  if (!valid(viewport) || targets.length === 0) return null;
  obstacles = obstacles.filter(valid).map(rect => intersection({
    left: rect.left - gap, top: rect.top - gap, right: rect.right + gap, bottom: rect.bottom + gap,
  }, viewport)).filter(valid);
  let free = [viewport];
  for (const obstacle of obstacles) {
    free = free.flatMap(rect => {
      const cut = intersection(rect, obstacle);
      if (!valid(cut)) return [rect];
      return [
        { ...rect, bottom: cut.top }, { ...rect, top: cut.bottom },
        { left: rect.left, right: cut.left, top: cut.top, bottom: cut.bottom },
        { left: cut.right, right: rect.right, top: cut.top, bottom: cut.bottom },
      ].filter(valid);
    });
  }
  if (free.length === 0) return null;
  const xs = new Set([0]), ys = new Set([0]);
  for (const target of targets) {
    for (const region of [viewport, ...free]) {
      xs.add(region.left - target.left); xs.add(region.right - target.right);
      ys.add(region.top - target.top); ys.add(region.bottom - target.bottom);
      xs.add((region.left + region.right - target.left - target.right) / 2);
      ys.add((region.top + region.bottom - target.top - target.bottom) / 2);
    }
  }
  const score = (x: number, y: number) => {
    const fractions = targets.map(target => {
      const shifted = { left: target.left + x, top: target.top + y, right: target.right + x, bottom: target.bottom + y };
      return Math.min(1, free.reduce((sum, region) => sum + area(intersection(shifted, region)), 0) / area(target));
    });
    return { min: Math.min(...fractions), total: fractions.reduce((sum, value) => sum + value, 0), distance: x * x + y * y };
  };
  let best = { x: 0, y: 0, ...score(0, 0) };
  if (best.min >= 1 - 1e-6) return null;
  const better = (next: ReturnType<typeof score>) => next.min > best.min + 1e-6
    || Math.abs(next.min - best.min) <= 1e-6 && (next.total > best.total + 1e-6
      || Math.abs(next.total - best.total) <= 1e-6 && next.distance < best.distance - 1);
  for (const x of xs) for (const y of ys) {
    const next = score(x, y);
    if (better(next)) best = { x, y, ...next };
  }
  return best.distance >= 1 ? { x: best.x, y: best.y } : null;
}

/** Reveal once after panel layout settles. Manual canvas navigation wins until
 * the next explicit selection; delayed callbacks remain bound to that item. */
export function createInspectorRevealCoordinator(panel: HTMLElement, root: HTMLElement, current: () => object | null, reveal: () => void | (() => void)) {
  let frame: number | null = null, revision = 0, destroyed = false, navigating = false;
  let cancelMotion: (() => void) | null = null;
  const cancel = () => {
    revision++;
    cancelMotion?.(); cancelMotion = null;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  };
  const schedule = () => {
    if (destroyed || navigating) return;
    const item = current(), request = ++revision;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    if (!item) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      if (destroyed || navigating || request !== revision || current() !== item) return;
      const animations = panel.getAnimations?.().filter(animation => animation.playState === 'running') || [];
      if (animations.length) {
        void Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
          if (!destroyed && !navigating && request === revision && current() === item) schedule();
        });
      } else {
        const next = reveal() || null;
        if (!next) cancelMotion?.();
        cancelMotion = next;
      }
    });
  };
  const onNavigate = (event: Event) => {
    if ((event.target as HTMLElement | null)?.tagName !== 'CANVAS') return;
    navigating = true; cancel();
  };
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
  observer?.observe(panel);
  root.addEventListener('pointerdown', onNavigate, true);
  root.addEventListener('wheel', onNavigate, { capture: true, passive: true });
  window.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('scroll', schedule);
  return {
    cancel,
    request() { cancelMotion?.(); cancelMotion = null; navigating = false; schedule(); },
    destroy() {
      destroyed = true; cancel();
      observer?.disconnect();
      root.removeEventListener('pointerdown', onNavigate, true);
      root.removeEventListener('wheel', onNavigate, true);
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
    },
  };
}
