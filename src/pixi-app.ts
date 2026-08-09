import { Application, Container, Graphics } from 'pixi.js';
import { Viewport } from 'pixi-viewport';

export interface PixiLayers {
  app: Application;
  viewport: Viewport;
  gridLayer: Container;
  groupLayer: Container;
  /** Structure boundary overlays; independent from group redraw/clearing. */
  structureLayer: Container;
  edgeLayer: Container;
  blobLayer: Container;
  nodeLayer: Container;
  labelLayer: Container;
  cardLayer: Container;
  onContextRestored?: (() => void) | null;
  /** Reusable Graphics cache for blob/glow effects to avoid per-frame allocation */
  blobLayerGfx?: Graphics | null;
  /** Reusable Graphics cache for grid rendering */
  gridLayerGfx?: Graphics | null;
}

export function clearBlobLayer(layers: Pick<PixiLayers, 'blobLayer' | 'blobLayerGfx'>): void {
  for (const child of layers.blobLayer.children.slice()) child.destroy({ children: true });
  layers.blobLayer.removeChildren();
  layers.blobLayerGfx = null;
  layers.blobLayer.visible = false;
}

export async function createPixiApp(container: HTMLElement): Promise<PixiLayers> {
  const app = new Application();

  const dpr = Math.max(1, window.devicePixelRatio || 1);
  await app.init({
    preference: 'webgl',
    resizeTo: container,
    resolution: dpr,
    autoDensity: true,
    antialias: true,
    backgroundAlpha: 0,
    hello: false,
  });

  container.appendChild(app.canvas);

  // pixi-viewport: zoom/pan/drag/wheel
  // 用容器实际尺寸；布局前 clientWidth 可能为 0，用 window 尺寸兜底
  const cw = container.clientWidth || window.innerWidth / 2;
  const ch = container.clientHeight || window.innerHeight;
  const viewport = new Viewport({
    screenWidth: cw,
    screenHeight: ch,
    worldWidth: 3000,
    worldHeight: 2000,
    events: app.renderer.events,
  });

  viewport
    .drag({ clampWheel: false })
    .wheel()
    .pinch()
    .decelerate()
    .clampZoom({ minScale: 0.1, maxScale: 4 });

  app.stage.addChild(viewport);

  // 原点(0,0)居容器正中央
  viewport.position.set(cw / 2, ch / 2);

  // 图层（从后到前）
  const gridLayer = new Container({ label: 'grid' });
  const groupLayer = new Container({ label: 'groups' });
  // Kept outside groupLayer so updateGroups may clear its own children safely.
  const structureLayer = new Container({ label: 'structure-boundaries' });
  const edgeLayer = new Container({ label: 'edges' });
  const blobLayer = new Container({ label: 'blobs' });
  const nodeLayer = new Container({ label: 'nodes' });
  const labelLayer = new Container({ label: 'labels' });

  viewport.addChild(gridLayer);
  viewport.addChild(groupLayer);
  viewport.addChild(structureLayer);
  viewport.addChild(edgeLayer);
  viewport.addChild(blobLayer);
  viewport.addChild(nodeLayer);
  viewport.addChild(labelLayer);

  // 卡片层：屏幕空间（不在 viewport 内），缩放时卡片边界保持不变
  const cardLayer = new Container({ label: 'cards' });
  app.stage.addChild(cardLayer);

  // WebGL context loss recovery
  let contextLost = false;
  const result: PixiLayers = { app, viewport, gridLayer, groupLayer, structureLayer, edgeLayer, blobLayer, nodeLayer, labelLayer, cardLayer };
  app.canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    contextLost = true;
  });
  app.canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    result.onContextRestored?.();
  });

  return result;
}
