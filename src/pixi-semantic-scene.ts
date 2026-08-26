import { Container, Graphics, Text } from 'pixi.js';
import type { SemanticEcho, SemanticRegion } from './layouts/semantic';
import { WORLD_TEXT_SAMPLING } from './pixi-text-quality';

const PALETTE = [0x5e81ac, 0x88c0d0, 0x8fbcbb, 0xa3be8c, 0xb48ead, 0xd08770, 0xebcb8b];
const LABEL_RESOLUTION = Math.max(2, (window.devicePixelRatio || 1) * 1.5);
const STATE_KEY = Symbol.for('semanticSceneState');

interface SemanticSceneState {
  surface: Graphics;
  labels: Map<string, Text>;
  echoLabels: Map<string, Text>;
}

interface SemanticSceneOptions {
  nodes?: readonly any[];
  echoes?: readonly SemanticEcho[];
  focusNodeId?: string | null;
  zoom?: number;
}

function ensureState(layer: Container): SemanticSceneState {
  let state = (layer as any)[STATE_KEY] as SemanticSceneState | undefined;
  if (state && !state.surface.destroyed) return state;
  state = { surface: new Graphics(), labels: new Map(), echoLabels: new Map() };
  layer.addChild(state.surface);
  (layer as any)[STATE_KEY] = state;
  return state;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const smoothstep = (min: number, max: number, value: number): number => {
  const t = clamp((value - min) / Math.max(1e-6, max - min), 0, 1);
  return t * t * (3 - 2 * t);
};

function echoColor(echo: SemanticEcho): number {
  if (echo.kind === 'hybrid') return 0x88c0d0;
  if (echo.kind === 'embedding') return 0xb48ead;
  return 0x5e81ac;
}

function boundaryOffset(node: any, ux: number, uy: number, padding = 5): number {
  const card = node?._semanticCard;
  if (!card) return Math.max(9, Number(node?.radius) || 9) + padding;
  if (card.form === 'node') return Math.max(5, Number(card.nodeRadius) || Number(card.width) / 2) + padding;
  const halfWidth = Math.max(1, Number(card.width) / 2 + padding);
  const halfHeight = Math.max(1, Number(card.height) / 2 + padding);
  const tx = Math.abs(ux) > 1e-6 ? halfWidth / Math.abs(ux) : Infinity;
  const ty = Math.abs(uy) > 1e-6 ? halfHeight / Math.abs(uy) : Infinity;
  return Math.min(tx, ty);
}

function quadraticPoint(
  start: { x: number; y: number },
  control: { x: number; y: number },
  end: { x: number; y: number },
  t: number,
): { x: number; y: number } {
  const inverse = 1 - t;
  return {
    x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
    y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y,
  };
}

function drawDashedQuadratic(
  graphics: Graphics,
  start: { x: number; y: number },
  control: { x: number; y: number },
  end: { x: number; y: number },
  color: number,
  width: number,
  alpha: number,
): void {
  const samples = Array.from({ length: 41 }, (_, index) => quadraticPoint(start, control, end, index / 40));
  let draw = true;
  let phaseRemaining = 9;
  for (let index = 1; index < samples.length; index++) {
    let from = samples[index - 1];
    const to = samples[index];
    let dx = to.x - from.x, dy = to.y - from.y;
    let remaining = Math.hypot(dx, dy);
    if (remaining < 1e-4) continue;
    while (remaining > 1e-4) {
      const take = Math.min(remaining, phaseRemaining);
      const ratio = take / remaining;
      const next = { x: from.x + dx * ratio, y: from.y + dy * ratio };
      if (draw) graphics.moveTo(from.x, from.y).lineTo(next.x, next.y)
        .stroke({ color, width, alpha, cap: 'round' });
      from = next;
      remaining -= take;
      phaseRemaining -= take;
      if (phaseRemaining <= 1e-4) {
        draw = !draw;
        phaseRemaining = draw ? 9 : 7;
      }
      dx = to.x - from.x;
      dy = to.y - from.y;
    }
  }
}

export function renderSemanticScene(
  layer: Container,
  regions: readonly SemanticRegion[],
  options: SemanticSceneOptions = {},
): void {
  const state = ensureState(layer);
  state.surface.clear();
  const activeLabels = new Set<string>();
  const zoom = Number.isFinite(options.zoom) ? Number(options.zoom) : 1;
  // At overview scale the broad domain is legible; as the user approaches,
  // topic/course regions take over without an abrupt frame replacement.
  const topicBlend = smoothstep(0.32, 0.66, zoom);

  const orderedRegions = [...regions].sort((a, b) => Number(a.level === 'topic') - Number(b.level === 'topic'));
  for (const region of orderedRegions) {
    const topic = region.level === 'topic';
    if (topic && topicBlend <= 0.015) continue;
    const color = PALETTE[region.colorIndex % PALETTE.length];
    const radius = Math.min(18, region.width * 0.04, region.height * 0.08);
    const fillAlpha = topic ? 0.012 + topicBlend * 0.022 : 0.03 * (1 - topicBlend * 0.56);
    const strokeAlpha = topic ? 0.04 + topicBlend * 0.18 : 0.16 * (1 - topicBlend * 0.68);
    const accentAlpha = topic ? 0.12 + topicBlend * 0.38 : 0.42 * (1 - topicBlend * 0.72);
    state.surface
      .roundRect(region.x, region.y, region.width, region.height, radius)
      .fill({ color, alpha: fillAlpha })
      .stroke({ color, width: topic ? 1.15 : 1.05, alpha: strokeAlpha });
    state.surface
      .moveTo(region.x + 18, region.y + 15)
      .lineTo(region.x + Math.min(region.width - 18, 78), region.y + 15)
      .stroke({ color, width: topic ? 2.25 : 1.8, alpha: accentAlpha, cap: 'round' });

    if (!region.label) continue;
    activeLabels.add(region.id);
    let label = state.labels.get(region.id);
    if (!label || label.destroyed) {
      label = new Text({
        text: region.label,
        resolution: LABEL_RESOLUTION,
        ...WORLD_TEXT_SAMPLING,
        style: {
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: 11,
          fontWeight: '500',
          letterSpacing: 1.2,
          fill: color,
        } as any,
      });
      label.anchor.set(0, 0.5);
      state.labels.set(region.id, label);
      layer.addChild(label);
    }
    label.text = region.label;
    label.style.fill = color;
    label.style.fontSize = topic ? 11 : 10;
    label.style.fontWeight = topic ? '600' : '500';
    label.position.set(region.x + 18, region.y + 30);
    label.alpha = topic ? 0.72 * topicBlend : 0.62 * (1 - topicBlend * 0.9);
    label.visible = label.alpha > 0.055;
  }

  for (const [id, label] of state.labels) {
    if (activeLabels.has(id)) continue;
    if (label.parent) label.parent.removeChild(label);
    label.destroy();
    state.labels.delete(id);
  }

  const activeEchoLabels = new Set<string>();
  const focusNodeId = options.focusNodeId ? String(options.focusNodeId) : null;
  const echoLimit = zoom < 0.46 ? 2 : zoom < 0.9 ? 3 : 4;
  const showReasonLabels = zoom >= 0.56;
  if (focusNodeId && options.nodes && options.echoes) {
    const nodesById = new Map(options.nodes.map(node => [String(node.id), node]));
    const incident = options.echoes
      .filter(echo => echo.source === focusNodeId || echo.target === focusNodeId)
      .sort((a, b) => b.score - a.score)
      .slice(0, echoLimit);
    for (const echo of incident) {
      const otherId = echo.source === focusNodeId ? echo.target : echo.source;
      const startNode = nodesById.get(focusNodeId);
      const endNode = nodesById.get(otherId);
      if (!startNode || !endNode) continue;
      const dx = endNode.x - startNode.x;
      const dy = endNode.y - startNode.y;
      const length = Math.hypot(dx, dy);
      if (!Number.isFinite(length) || length < 2) continue;
      const ux = dx / length, uy = dy / length;
      const startDistance = boundaryOffset(startNode, ux, uy);
      const endDistance = boundaryOffset(endNode, -ux, -uy);
      const start = { x: startNode.x + ux * startDistance, y: startNode.y + uy * startDistance };
      const end = { x: endNode.x - ux * endDistance, y: endNode.y - uy * endDistance };
      const sign = `${focusNodeId}:${otherId}`.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % 2 ? 1 : -1;
      const bend = sign * Math.min(44, Math.max(16, length * 0.1));
      const control = { x: (start.x + end.x) / 2 - uy * bend, y: (start.y + end.y) / 2 + ux * bend };
      const color = echoColor(echo);
      const zoomAlpha = zoom < 0.46 ? 0.66 : zoom < 0.72 ? 0.84 : 1;
      const alpha = clamp(0.26 + echo.score * 0.34, 0.3, 0.62) * zoomAlpha;
      drawDashedQuadratic(state.surface, start, control, end, color, 1.15 + echo.score * 0.7, alpha);

      if (zoom >= 0.4) {
        const targetCard = endNode._semanticCard;
        if (targetCard?.form === 'card') {
          state.surface.roundRect(
            endNode.x - targetCard.width / 2 - 5,
            endNode.y - targetCard.height / 2 - 5,
            targetCard.width + 10,
            targetCard.height + 10,
            12,
          ).stroke({ color, width: 1.2, alpha: alpha * 0.46 });
        } else {
          state.surface.circle(endNode.x, endNode.y, Math.max(9, Number(targetCard?.nodeRadius) || Number(targetCard?.width) / 2) + 5)
            .stroke({ color, width: 1.2, alpha: alpha * 0.52 });
        }
      }

      const key = [focusNodeId, otherId].sort().join('\u0000');
      activeEchoLabels.add(key);
      let label = state.echoLabels.get(key);
      if (!label || label.destroyed) {
        label = new Text({
          text: echo.reason,
          resolution: LABEL_RESOLUTION,
          ...WORLD_TEXT_SAMPLING,
          style: {
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: 10,
            fontWeight: '500',
            letterSpacing: 0.25,
            fill: color,
          } as any,
        });
        label.anchor.set(0.5, 0.5);
        state.echoLabels.set(key, label);
        layer.addChild(label);
      }
      const midpoint = quadraticPoint(start, control, end, 0.5);
      label.text = `↝ ${echo.reason}`;
      label.style.fill = color;
      label.position.set(midpoint.x - uy * sign * 8, midpoint.y + ux * sign * 8);
      label.alpha = clamp(alpha + 0.12, 0.5, 0.78);
      label.visible = showReasonLabels;
    }
  }
  for (const [id, label] of state.echoLabels) {
    if (activeEchoLabels.has(id)) continue;
    if (label.parent) label.parent.removeChild(label);
    label.destroy();
    state.echoLabels.delete(id);
  }
}

export function clearSemanticScene(layer: Container): void {
  const state = (layer as any)[STATE_KEY] as SemanticSceneState | undefined;
  if (!state) return;
  state.surface.clear();
  for (const label of state.labels.values()) {
    if (label.parent) label.parent.removeChild(label);
    label.destroy();
  }
  state.labels.clear();
  for (const label of state.echoLabels.values()) {
    if (label.parent) label.parent.removeChild(label);
    label.destroy();
  }
  state.echoLabels.clear();
}
