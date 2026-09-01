export interface MobileViewportInput {
  layoutHeight: number;
  visualHeight: number;
  offsetTop?: number;
  largestVisualHeight?: number;
  editableFocused?: boolean;
}

export interface MobileViewportMetrics {
  visualHeight: number;
  visualTop: number;
  bottomInset: number;
  keyboardOpen: boolean;
}

/**
 * Resolve the part of the layout viewport that is actually visible. Some
 * mobile WebViews resize `visualViewport`; others resize `innerHeight`, so a
 * remembered unobscured height is used as a second signal while typing.
 */
export function resolveMobileViewportMetrics(input: MobileViewportInput): MobileViewportMetrics {
  const layoutHeight = Math.max(1, Number(input.layoutHeight) || 1);
  const visualHeight = Math.max(1, Math.min(layoutHeight, Number(input.visualHeight) || layoutHeight));
  const visualTop = Math.max(0, Number(input.offsetTop) || 0);
  const largestVisualHeight = Math.max(visualHeight, Number(input.largestVisualHeight) || visualHeight);
  const layoutOcclusion = Math.max(0, layoutHeight - visualTop - visualHeight);
  const rememberedOcclusion = Math.max(0, largestVisualHeight - visualTop - visualHeight);
  const candidateInset = Math.max(layoutOcclusion, rememberedOcclusion);
  const keyboardThreshold = Math.max(96, Math.min(170, largestVisualHeight * .16));
  const keyboardOpen = Boolean(input.editableFocused) && candidateInset >= keyboardThreshold;
  return {
    visualHeight,
    visualTop,
    bottomInset: keyboardOpen ? candidateInset : layoutOcclusion,
    keyboardOpen,
  };
}

export interface MobileViewportCoordinator {
  refresh(): void;
  destroy(): void;
}

const isEditable = (value: Element | null): boolean => {
  if (!(value instanceof HTMLElement)) return false;
  if (value.isContentEditable) return true;
  if (value instanceof HTMLTextAreaElement || value instanceof HTMLSelectElement) return true;
  if (!(value instanceof HTMLInputElement)) return false;
  return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(value.type);
};

export function createMobileViewportCoordinator(root: HTMLElement): MobileViewportCoordinator {
  let largestVisualHeight = window.visualViewport?.height || window.innerHeight;
  let previousWidth = window.visualViewport?.width || window.innerWidth;
  let pendingFrame: number | null = null;

  const apply = () => {
    pendingFrame = null;
    const viewport = window.visualViewport;
    const width = viewport?.width || window.innerWidth;
    const visualHeight = viewport?.height || window.innerHeight;
    if (Math.abs(width - previousWidth) > 60) {
      previousWidth = width;
      largestVisualHeight = visualHeight;
    }
    const editableFocused = isEditable(document.activeElement);
    if (!editableFocused) largestVisualHeight = Math.max(largestVisualHeight, visualHeight);
    const metrics = resolveMobileViewportMetrics({
      layoutHeight: Math.max(document.documentElement.clientHeight, window.innerHeight),
      visualHeight,
      offsetTop: viewport?.offsetTop || 0,
      largestVisualHeight,
      editableFocused,
    });
    for (const target of [document.documentElement, root]) {
      target.style.setProperty('--ns-visual-viewport-height', `${metrics.visualHeight}px`);
      target.style.setProperty('--ns-visual-viewport-top', `${metrics.visualTop}px`);
      target.style.setProperty('--ns-visual-bottom', `${metrics.bottomInset}px`);
    }
    root.classList.toggle('is-mobile-keyboard-open', metrics.keyboardOpen);
  };

  const refresh = () => {
    if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
    pendingFrame = requestAnimationFrame(apply);
  };
  const onFocusOut = () => window.setTimeout(refresh, 80);

  window.addEventListener('resize', refresh);
  window.addEventListener('orientationchange', refresh);
  window.visualViewport?.addEventListener('resize', refresh);
  window.visualViewport?.addEventListener('scroll', refresh);
  document.addEventListener('focusin', refresh);
  document.addEventListener('focusout', onFocusOut);
  apply();

  return {
    refresh,
    destroy() {
      if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
      window.removeEventListener('resize', refresh);
      window.removeEventListener('orientationchange', refresh);
      window.visualViewport?.removeEventListener('resize', refresh);
      window.visualViewport?.removeEventListener('scroll', refresh);
      document.removeEventListener('focusin', refresh);
      document.removeEventListener('focusout', onFocusOut);
      root.classList.remove('is-mobile-keyboard-open');
      for (const name of ['--ns-visual-viewport-height', '--ns-visual-viewport-top', '--ns-visual-bottom']) {
        document.documentElement.style.removeProperty(name);
        root.style.removeProperty(name);
      }
    },
  };
}
