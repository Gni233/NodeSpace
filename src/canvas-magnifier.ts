export interface MagnifierGeometry {
  diameter: number;
  lensLeft: number;
  lensTop: number;
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  destinationX: number;
  destinationY: number;
  destinationWidth: number;
  destinationHeight: number;
}

export interface MagnifierActivationState {
  controlHeld: boolean;
  pointerInside: boolean;
  pointerType: string;
  zoom: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface CanvasMagnifierController {
  refresh(): void;
  destroy(): void;
}

export interface MagnifierCaptureRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  resolution: number;
}

const DEFAULT_DIAMETER = 236;
const DEFAULT_MAGNIFICATION = 1.72;
const MAX_MAGNIFICATION = 5.5;
const TARGET_EFFECTIVE_ZOOM = 1.15;
export const MAGNIFIER_MAX_ZOOM = 1;
const EDGE_MARGIN = 12;
const MIN_DIAMETER = 148;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export function shouldActivateMagnifier(
  state: MagnifierActivationState,
  maxZoom = MAGNIFIER_MAX_ZOOM,
): boolean {
  return state.controlHeld
    && state.pointerInside
    && (state.pointerType === 'mouse' || state.pointerType === 'pen')
    && Number.isFinite(state.zoom)
    && state.zoom > 0
    && state.zoom < maxZoom
    && state.viewportWidth >= MIN_DIAMETER + EDGE_MARGIN * 2
    && state.viewportHeight >= MIN_DIAMETER + EDGE_MARGIN * 2;
}

/** Restores a useful reading scale as the overview becomes smaller. */
export function getMagnifierMagnification(zoom: number): number {
  const safeZoom = Math.max(0.1, Number.isFinite(zoom) ? zoom : 1);
  return clamp(TARGET_EFFECTIVE_ZOOM / safeZoom, DEFAULT_MAGNIFICATION, MAX_MAGNIFICATION);
}

/**
 * Renders the sampled patch at the exact pixel density needed after it is
 * enlarged. The sampled area shrinks by the same factor, so output pixel count
 * stays close to the fixed lens-canvas budget instead of growing with zoom.
 */
export function getMagnifierCaptureResolution(
  lensResolution: number,
  magnification: number,
): number {
  const outputResolution = clamp(Number.isFinite(lensResolution) ? lensResolution : 2, 1, 2);
  const scale = clamp(Number.isFinite(magnification) ? magnification : DEFAULT_MAGNIFICATION, 1, MAX_MAGNIFICATION);
  return Math.min(12, outputResolution * scale);
}

/**
 * Keeps the glass inside its pane while the sampled area remains centred on
 * the real pointer. At an edge, the missing part is left transparent instead
 * of shifting the subject away from the reticle.
 */
export function computeMagnifierGeometry(
  pointerX: number,
  pointerY: number,
  viewportWidth: number,
  viewportHeight: number,
  preferredDiameter = DEFAULT_DIAMETER,
  magnification = DEFAULT_MAGNIFICATION,
): MagnifierGeometry {
  const diameter = Math.max(
    1,
    Math.min(preferredDiameter, viewportWidth - EDGE_MARGIN * 2, viewportHeight - EDGE_MARGIN * 2),
  );
  const lensLeft = clamp(pointerX - diameter / 2, EDGE_MARGIN, viewportWidth - diameter - EDGE_MARGIN);
  const lensTop = clamp(pointerY - diameter / 2, EDGE_MARGIN, viewportHeight - diameter - EDGE_MARGIN);

  const desiredSourceSize = diameter / Math.max(1, magnification);
  const desiredLeft = pointerX - desiredSourceSize / 2;
  const desiredTop = pointerY - desiredSourceSize / 2;
  const sourceX = clamp(desiredLeft, 0, viewportWidth);
  const sourceY = clamp(desiredTop, 0, viewportHeight);
  const sourceRight = clamp(desiredLeft + desiredSourceSize, 0, viewportWidth);
  const sourceBottom = clamp(desiredTop + desiredSourceSize, 0, viewportHeight);
  const sourceWidth = Math.max(0, sourceRight - sourceX);
  const sourceHeight = Math.max(0, sourceBottom - sourceY);

  return {
    diameter,
    lensLeft,
    lensTop,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    destinationX: (sourceX - desiredLeft) * magnification,
    destinationY: (sourceY - desiredTop) * magnification,
    destinationWidth: sourceWidth * magnification,
    destinationHeight: sourceHeight * magnification,
  };
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) return false;
  return element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName);
}

function createReticle(): HTMLDivElement {
  const reticle = document.createElement('div');
  reticle.className = 'ns-magnifier-reticle';
  reticle.setAttribute('aria-hidden', 'true');
  return reticle;
}

export function createCanvasMagnifier(
  sourceCanvas: HTMLCanvasElement,
  getZoom: () => number,
  captureRegion?: (region: MagnifierCaptureRegion) => CanvasImageSource | null,
  onActivate?: () => void,
): CanvasMagnifierController {
  const pane = sourceCanvas.parentElement;
  if (!pane) return { refresh: () => {}, destroy: () => {} };

  const root = document.createElement('div');
  root.className = 'ns-canvas-magnifier';
  root.setAttribute('aria-hidden', 'true');
  root.dataset.state = 'idle';
  root.dataset.paint = 'none';

  const view = document.createElement('canvas');
  view.className = 'ns-magnifier-view';
  const reticle = createReticle();
  const badge = document.createElement('div');
  badge.className = 'ns-magnifier-badge';
  badge.textContent = 'CTRL · AUTO';

  root.append(view, reticle, badge);
  pane.appendChild(root);

  let controlHeld = false;
  let pointerInside = false;
  let pointerType = 'mouse';
  let pointerX = 0;
  let pointerY = 0;
  let animationFrame: number | null = null;
  let destroyed = false;

  const hide = () => {
    root.classList.remove('is-visible');
    root.dataset.state = 'idle';
    sourceCanvas.classList.remove('ns-magnifier-source');
  };

  const paint = (): boolean => {
    const rect = sourceCanvas.getBoundingClientRect();
    const zoom = Number(getZoom());
    const activation = {
      controlHeld,
      pointerInside,
      pointerType,
      zoom,
      viewportWidth: rect.width,
      viewportHeight: rect.height,
    };
    if (!shouldActivateMagnifier(activation)) {
      hide();
      return false;
    }

    const magnification = getMagnifierMagnification(zoom);
    const geometry = computeMagnifierGeometry(
      pointerX,
      pointerY,
      rect.width,
      rect.height,
      DEFAULT_DIAMETER,
      magnification,
    );
    // Always supersample the glass at 2x, including ordinary 1x desktop panels.
    const resolution = 2;
    const captureResolution = getMagnifierCaptureResolution(resolution, magnification);
    const pixelDiameter = Math.max(1, Math.round(geometry.diameter * resolution));
    if (view.width !== pixelDiameter || view.height !== pixelDiameter) {
      view.width = pixelDiameter;
      view.height = pixelDiameter;
    }
    root.style.setProperty('--ns-magnifier-size', `${geometry.diameter}px`);
    root.style.setProperty('--ns-magnifier-x', `${geometry.lensLeft}px`);
    root.style.setProperty('--ns-magnifier-y', `${geometry.lensTop}px`);
    root.dataset.zoom = zoom.toFixed(2);
    root.dataset.magnification = magnification.toFixed(2);
    badge.textContent = `CTRL · ×${magnification.toFixed(1)}`;

    const context = view.getContext('2d', { alpha: true });
    if (!context || geometry.sourceWidth <= 0 || geometry.sourceHeight <= 0) {
      root.dataset.paint = 'unavailable';
      hide();
      return false;
    }

    try {
      context.setTransform(resolution, 0, 0, resolution, 0, 0);
      context.clearRect(0, 0, geometry.diameter, geometry.diameter);
      context.fillStyle = getComputedStyle(pane).backgroundColor || 'transparent';
      context.fillRect(0, 0, geometry.diameter, geometry.diameter);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      const extracted = captureRegion?.({
        x: geometry.sourceX,
        y: geometry.sourceY,
        width: geometry.sourceWidth,
        height: geometry.sourceHeight,
        resolution: captureResolution,
      });
      if (extracted) {
        context.drawImage(
          extracted,
          0,
          0,
          Number((extracted as { width?: number }).width) || geometry.sourceWidth * resolution,
          Number((extracted as { height?: number }).height) || geometry.sourceHeight * resolution,
          geometry.destinationX,
          geometry.destinationY,
          geometry.destinationWidth,
          geometry.destinationHeight,
        );
      } else {
        const sourceScaleX = sourceCanvas.width / Math.max(1, rect.width);
        const sourceScaleY = sourceCanvas.height / Math.max(1, rect.height);
        context.drawImage(
          sourceCanvas,
          geometry.sourceX * sourceScaleX,
          geometry.sourceY * sourceScaleY,
          geometry.sourceWidth * sourceScaleX,
          geometry.sourceHeight * sourceScaleY,
          geometry.destinationX,
          geometry.destinationY,
          geometry.destinationWidth,
          geometry.destinationHeight,
        );
      }
    } catch {
      root.dataset.paint = 'unavailable';
      hide();
      return false;
    }

    root.dataset.paint = 'ok';
    onActivate?.();
    root.classList.add('is-visible');
    root.dataset.state = 'active';
    sourceCanvas.classList.add('ns-magnifier-source');
    return true;
  };

  const refresh = () => {
    if (destroyed || animationFrame !== null) return;
    animationFrame = requestAnimationFrame(() => {
      animationFrame = null;
      paint();
    });
  };

  const onPointerEnter = (event: PointerEvent) => {
    pointerInside = true;
    pointerType = event.pointerType || 'mouse';
    controlHeld = event.ctrlKey || controlHeld;
    const rect = sourceCanvas.getBoundingClientRect();
    pointerX = event.clientX - rect.left;
    pointerY = event.clientY - rect.top;
    refresh();
  };
  const onPointerMove = (event: PointerEvent) => {
    pointerInside = true;
    pointerType = event.pointerType || 'mouse';
    controlHeld = event.ctrlKey;
    const rect = sourceCanvas.getBoundingClientRect();
    pointerX = event.clientX - rect.left;
    pointerY = event.clientY - rect.top;
    refresh();
  };
  const onPointerLeave = () => {
    pointerInside = false;
    hide();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Control' || isEditableTarget(event.target)) return;
    controlHeld = true;
    refresh();
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key !== 'Control') return;
    controlHeld = false;
    hide();
  };
  const onWindowBlur = () => {
    controlHeld = false;
    hide();
  };
  const onWheel = () => {
    refresh();
    requestAnimationFrame(refresh);
  };

  sourceCanvas.addEventListener('pointerenter', onPointerEnter);
  sourceCanvas.addEventListener('pointermove', onPointerMove);
  sourceCanvas.addEventListener('pointerleave', onPointerLeave);
  sourceCanvas.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onWindowBlur);

  return {
    refresh,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      animationFrame = null;
      hide();
      sourceCanvas.removeEventListener('pointerenter', onPointerEnter);
      sourceCanvas.removeEventListener('pointermove', onPointerMove);
      sourceCanvas.removeEventListener('pointerleave', onPointerLeave);
      sourceCanvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
      root.remove();
    },
  };
}
