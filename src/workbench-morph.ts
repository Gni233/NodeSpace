import type { WorkbenchCover } from './workbench-cover';

export interface ScreenNode {
  x: number;
  y: number;
  radius: number;
}

export const WORKBENCH_MORPH_DURATION = 300;

export function interpolateWorkbenchNode(start: ScreenNode, target: ScreenNode, progress: number): ScreenNode {
  if (progress >= 1) return target;
  return {
    x: start.x + (target.x - start.x) * progress,
    y: start.y + (target.y - start.y) * progress,
    radius: start.radius + (target.radius - start.radius) * progress,
  };
}

const svgNamespace = 'http://www.w3.org/2000/svg';

export function animateWorkbenchCoverNodes(
  layer: HTMLElement,
  surface: HTMLElement,
  cover: WorkbenchCover | undefined,
  destination: (id: string) => ScreenNode | null,
  expansion: Animation,
): Promise<void> | null {
  const preview = surface.querySelector<SVGSVGElement>('.ns-home-cover-map');
  const matrix = preview?.getScreenCTM();
  if (!cover || !preview || !matrix) return null;

  const originalCircles = [...preview.querySelectorAll('circle')];
  if (originalCircles.length !== cover.points.length) return null;
  const { left, top } = layer.getBoundingClientRect();
  const { a, b, c, d, e, f } = matrix;
  const scale = Math.hypot(a, b);
  const tracks = cover.points.map(({ id }, index) => {
    const original = originalCircles[index];
    const x = original.cx.baseVal.value;
    const y = original.cy.baseVal.value;
    const start = {
      x: a * x + c * y + e,
      y: b * x + d * y + f,
      radius: original.r.baseVal.value * scale,
    };
    const circle = document.createElementNS(svgNamespace, 'circle');
    circle.setAttribute('fill', getComputedStyle(original).fill);
    return { id, start, circle, position: start, opacity: 1 };
  });
  if (!tracks.some(track => track.id !== null && destination(track.id))) return null;

  const byId = new Map(tracks.flatMap(track => track.id === null ? [] : [[track.id, track] as const]));
  const map = document.createElementNS(svgNamespace, 'svg');
  map.classList.add('fg-workbench-handoff-map');
  map.setAttribute('aria-hidden', 'true');
  const originalPath = preview.querySelector('path');
  const lineStyle = originalPath ? getComputedStyle(originalPath) : null;
  const edges = cover.links.map(({ source, target }) => {
    const line = document.createElementNS(svgNamespace, 'line');
    line.setAttribute('stroke', lineStyle?.stroke || 'currentColor');
    line.setAttribute('stroke-width', String((parseFloat(lineStyle?.strokeWidth || '') || .48) * scale));
    map.append(line);
    return { line, source: byId.get(source)!, target: byId.get(target)! };
  });
  for (const track of tracks) map.append(track.circle);
  const edgeOpacity = Number(lineStyle?.opacity ?? .43);
  const paint = (progress: number) => {
    for (const track of tracks) {
      const target = track.id === null ? null : destination(track.id);
      track.position = target ? interpolateWorkbenchNode(track.start, target, progress) : track.start;
      track.opacity = target ? 1 : 1 - progress;
      const { x, y, radius } = track.position;
      track.circle.setAttribute('cx', String(x - left));
      track.circle.setAttribute('cy', String(y - top));
      track.circle.setAttribute('r', String(radius));
      track.circle.setAttribute('opacity', String(track.opacity));
    }
    for (const { line, source, target } of edges) {
      line.setAttribute('x1', String(source.position.x - left));
      line.setAttribute('y1', String(source.position.y - top));
      line.setAttribute('x2', String(target.position.x - left));
      line.setAttribute('y2', String(target.position.y - top));
      line.setAttribute('opacity', String(edgeOpacity * Math.min(source.opacity, target.opacity)));
    }
  };
  paint(0);
  layer.append(map);
  preview.style.visibility = 'hidden';
  return new Promise(resolve => {
    const frame = () => {
      if (!layer.isConnected) { resolve(); return; }
      const time = Math.min(1, Math.max(0, Number(expansion.currentTime ?? 0) / WORKBENCH_MORPH_DURATION));
      paint(1 - (1 - time) ** 3);
      if (time < 1) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
}
