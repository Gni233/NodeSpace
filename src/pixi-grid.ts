import { Container, Graphics, Text } from 'pixi.js';
import { Transform, getVisibleBounds } from './geometry/hit';

// 每个 gridLayer 独立缓存，避免双窗格共用同一 Graphics 对象
const _gridLayerCache = new WeakMap<Container, { gfx: Graphics | null; lastKey: string }>();

function getCache(layer: Container) {
  let c = _gridLayerCache.get(layer);
  if (!c) { c = { gfx: null, lastKey: '' }; _gridLayerCache.set(layer, c); }
  return c;
}

export function updateGrid(
  gridLayer: Container,
  gw: number,
  gh: number,
  opts: {
    gridVis: boolean;
    gridMode: 'line' | 'dot';
    axisVis: boolean;
    axisTicks: boolean;
    gridSp: number;
    gridWidth: number;
    nodes: any[];
    transform: Transform;
    /** 拖拽中的节点位置（用于点阵磁吸放大效果） */
    dragX?: number | null;
    dragY?: number | null;
  }
) {
  const cache = getCache(gridLayer);
  const { gridVis, gridMode = 'line', axisVis, axisTicks, gridSp, gridWidth, nodes, transform, dragX, dragY } = opts;

  const hasDrag = dragX != null && dragY != null;
  // 节点位置哈希，模拟 tick 移动时刷新网格
  const nodeHash = gridMode === 'dot' && nodes?.length
    ? nodes.reduce((h: number, n: any) => h ^ ((Math.round(n.x / 3) * 37 + Math.round(n.y / 3)) | 0), 0)
    : 0;
  const key = `${nodeHash}|${hasDrag ? `${Math.round(dragX! / 5) * 5}|${Math.round(dragY! / 5) * 5}|` : ''}${transform.x}|${transform.y}|${transform.k}|${gw}|${gh}|${gridVis}|${gridMode}|${axisVis}|${axisTicks}|${gridSp}|${gridWidth}`;
  if (key === cache.lastKey && cache.gfx) return;
  cache.lastKey = key;

  // 复用 Graphics
  if (!cache.gfx) {
    cache.gfx = new Graphics();
    gridLayer.addChild(cache.gfx);
  }
  cache.gfx.clear();

  if (!gridVis && !axisVis) {
    cache.gfx?.removeFromParent();
    cache.gfx = null;
    cache.lastKey = '';
    // 清除旧标签
    for (let i = gridLayer.children.length - 1; i >= 0; i--) {
      if (gridLayer.children[i] instanceof Text) {
        const t = gridLayer.children[i] as Text;
        gridLayer.removeChildAt(i);
        t.destroy();
      }
    }
    return;
  }

  const bounds = getVisibleBounds(gw, gh, transform);
  const step = gridSp;
  const lineWidth = gridWidth;

  // 节点引力参数
  const NODE_RANGE = step * 3;     // 节点影响范围（3格距，默认90px）
  const NODE_MAX_SCALE = 1.2;      // 最大基础放大
  // 拖拽磁吸参数（更大，覆盖在基础之上）
  const DRAG_RANGE = step * 4;
  const DRAG_MAX_SCALE = 2.0;

  const xStart = Math.floor(bounds.minX / step) * step - step;
  const xEnd = bounds.maxX + step * 2;
  const yStart = Math.floor(bounds.minY / step) * step - step;
  const yEnd = bounds.maxY + step * 2;

  // 网格线
  if (gridVis) {
    if (gridMode === 'dot') {
      const dotRadius = Math.max(1.2, lineWidth * 3);
      const majorDotRadius = dotRadius * 2.2;

      // 节点引力：反向循环——每个节点影响周围格点，存入临时 map
      const influence = new Map<string, { scale: number; alpha: number }>();
      const cellKey = (gx: number, gy: number) => `${gx},${gy}`;
      const nodeRangeCells = Math.ceil(NODE_RANGE / step);
      for (const n of nodes) {
        const nx = n.x, ny = n.y;
        if (nx == null || ny == null) continue;
        const cx = Math.round(nx / step) * step;
        const cy = Math.round(ny / step) * step;
        for (let dx = -nodeRangeCells; dx <= nodeRangeCells; dx++) {
          for (let dy = -nodeRangeCells; dy <= nodeRangeCells; dy++) {
            const gx = cx + dx * step, gy = cy + dy * step;
            const dist = Math.sqrt((gx - nx) * (gx - nx) + (gy - ny) * (gy - ny));
            if (dist >= NODE_RANGE) continue;
            const t = 1 - dist / NODE_RANGE;
            const v = t * t; // 二次衰减
            const k = cellKey(gx, gy);
            const prev = influence.get(k);
            if (!prev || v > prev.scale) {
              influence.set(k, { scale: v, alpha: 0.15 * v });
            }
          }
        }
      }

      // 渲染点阵
      for (let x = xStart; x <= xEnd; x += step) {
        for (let y = yStart; y <= yEnd; y += step) {
          const major = x % (step * 5) === 0 && y % (step * 5) === 0;
          let r = major ? majorDotRadius : dotRadius;
          let a = major ? 0.35 : 0.18;

          // 节点基础引力
          const inf = influence.get(cellKey(x, y));
          if (inf) {
            r *= 1 + NODE_MAX_SCALE * inf.scale;
            a += inf.alpha;
          }

          // 拖拽磁吸（叠加）
          if (hasDrag) {
            const ddx = x - dragX!;
            const ddy = y - dragY!;
            const ddist = Math.sqrt(ddx * ddx + ddy * ddy);
            if (ddist < DRAG_RANGE) {
              const t = 1 - ddist / DRAG_RANGE;
              const ease = t * t * (3 - 2 * t);
              r *= 1 + DRAG_MAX_SCALE * ease;
              a = Math.min(0.65, a + 0.3 * ease);
            }
          }
          cache.gfx.circle(x, y, r).fill({ color: 0x888888, alpha: a });
        }
      }
    } else {
      // 传统线网格
      for (let x = xStart; x <= xEnd; x += step) {
        const major = x % (step * 5) === 0;
        cache.gfx.moveTo(x, bounds.minY).lineTo(x, bounds.maxY).stroke({ color: 0x888888, width: major ? lineWidth * 1.5 : lineWidth, alpha: major ? 0.15 : 0.05 });
      }
      for (let y = yStart; y <= yEnd; y += step) {
        const major = y % (step * 5) === 0;
        cache.gfx.moveTo(bounds.minX, y).lineTo(bounds.maxX, y).stroke({ color: 0x888888, width: major ? lineWidth * 1.5 : lineWidth, alpha: major ? 0.15 : 0.05 });
      }
    }
  }

  // 坐标轴
  if (axisVis) {
    if (gridMode === 'dot') {
      const axisDotR = Math.max(2.5, lineWidth * 5);
      for (let x = xStart; x <= xEnd; x += step) {
        if (Math.abs(x) < 1) continue;
        cache.gfx.circle(x, 0, axisDotR).fill({ color: 0x888888, alpha: 0.5 });
      }
      for (let y = yStart; y <= yEnd; y += step) {
        if (Math.abs(y) < 1) continue;
        cache.gfx.circle(0, y, axisDotR).fill({ color: 0x888888, alpha: 0.5 });
      }
      cache.gfx.circle(0, 0, axisDotR * 1.4).fill({ color: 0x888888, alpha: 0.65 });
    } else {
      cache.gfx.moveTo(0, bounds.minY).lineTo(0, bounds.maxY).stroke({ color: 0x666666, width: lineWidth, alpha: 0.4 });
      cache.gfx.moveTo(bounds.minX, 0).lineTo(bounds.maxX, 0).stroke({ color: 0x666666, width: lineWidth, alpha: 0.4 });
    }
  }

  // 移除旧标签
  for (let i = gridLayer.children.length - 1; i >= 0; i--) {
    if (gridLayer.children[i] instanceof Text) {
      const t = gridLayer.children[i] as Text;
      gridLayer.removeChildAt(i);
      t.destroy();
    }
  }
  // 刻度标签
  if (axisTicks) {
    const tickStep = step * 5;
    const tickSize = 4 / transform.k;
    for (let x = Math.floor(bounds.minX / tickStep) * tickStep; x <= bounds.maxX; x += tickStep) {
      if (Math.abs(x) < 1) continue;
      cache.gfx.moveTo(x, -tickSize).lineTo(x, tickSize).stroke({ color: 0x888888, width: lineWidth, alpha: 0.4 });
      const label = new Text({ text: String(x), resolution: 2, style: { fontSize: 9, fill: 0x888888, fontFamily: 'monospace' } as any });
      label.anchor.set(0.5, 0); label.position.set(x, tickSize + 2 / transform.k);
      gridLayer.addChild(label);
    }
    for (let y = Math.floor(bounds.minY / tickStep) * tickStep; y <= bounds.maxY; y += tickStep) {
      if (Math.abs(y) < 1) continue;
      cache.gfx.moveTo(-tickSize, y).lineTo(tickSize, y).stroke({ color: 0x888888, width: lineWidth, alpha: 0.4 });
      const label = new Text({ text: String(y), resolution: 2, style: { fontSize: 9, fill: 0x888888, fontFamily: 'monospace' } as any });
      label.anchor.set(1, 0.5); label.position.set(-tickSize - 2 / transform.k, y);
      gridLayer.addChild(label);
    }
  }
}

export function clearGridCache() {
  // 清除所有窗格的网格缓存
  // WeakMap 不可遍历，通过 gridLayer 自行管理；外部调用方传入 layer 后逐个清理
}
