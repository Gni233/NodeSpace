import { Container, Graphics, Text } from 'pixi.js';
import { Transform, getVisibleBounds } from './geometry/hit';

// 每个 gridLayer 独立缓存，避免双窗格共用同一 Graphics 对象
const _gridLayerCache = new WeakMap<Container, { gfx: Graphics | null; lastKey: string }>();

function getCache(layer: Container) {
  let c = _gridLayerCache.get(layer);
  if (!c) { c = { gfx: null, lastKey: '' }; _gridLayerCache.set(layer, c); }
  return c;
}

/**
 * 根据缩放比例决定跳过因子（与 gridSp 无关，只取决于 k）：
 *   缩放极远（k ≤ 0.2）   → 完全不显示
 *   缩放很远（k ≤ 0.4）   → 只显示主格线/主格点
 *   缩放适中（k ≤ 0.7）   → 每两格一跳
 *   缩放较近（k > 0.7）   → 全部显示
 */
function getZoomSkip(k: number): number {
  if (k <= 0.2) return 0;
  if (k <= 0.4) return 5;
  if (k <= 0.7) return 2;
  return 1;
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
  const zoomSkip = getZoomSkip(transform.k);

  // 节点位置哈希，模拟 tick 移动时刷新网格
  const nodeHash = gridMode === 'dot' && nodes?.length
    ? nodes.reduce((h: number, n: any) => (h * 31 + (Math.round(n.x / 3) * 37 + Math.round(n.y / 3)) | 0) >>> 0, 0)
    : 0;
  // 平移量量化到半格距，避免视界微移时频繁无效重绘；缩放量化到小数点后 2 位
  const snapQ = Math.max(gridSp / 2, 2);
  const qx = Math.round(transform.x / snapQ) * snapQ;
  const qy = Math.round(transform.y / snapQ) * snapQ;
  const qk = Math.round(transform.k * 100) / 100;
  const key = `${nodeHash}|${hasDrag ? `${Math.round(dragX! / 5) * 5}|${Math.round(dragY! / 5) * 5}|` : ''}${qx}|${qy}|${qk}|${gw}|${gh}|${gridVis}|${gridMode}|${axisVis}|${axisTicks}|${gridSp}|${gridWidth}`;
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
    cache.gfx?.destroy();
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

  // 网格线（zoomSkip=0 时缩放太远，完全不显示）
  if (gridVis && zoomSkip > 0) {
    if (gridMode === 'dot') {
      const dotRadius = Math.max(1.2, lineWidth * 3);
      const majorDotRadius = dotRadius * 2.2;

      // 节点引力（只处理可见区域附近的节点，避免每帧遍历全部节点）
      const influence = new Map<string, { scale: number; alpha: number }>();
      const cellKey = (gx: number, gy: number) => `${gx},${gy}`;
      const nodeRangeCells = Math.ceil(NODE_RANGE / step);
      const margin = NODE_RANGE * 2; // 可见区域外的 margin
      for (const n of nodes) {
        const nx = n.x, ny = n.y;
        if (nx == null || ny == null) continue;
        if (nx + margin < bounds.minX || nx - margin > bounds.maxX ||
            ny + margin < bounds.minY || ny - margin > bounds.maxY) continue;
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

      // 渲染点阵（按 zoomSkip 跳过低级格点），同时记录已覆盖位置供补绘
      const effStep = step * zoomSkip;
      const covered = zoomSkip > 1 ? new Set<string>() : null;
      for (let x = xStart; x <= xEnd; x += effStep) {
        for (let y = yStart; y <= yEnd; y += effStep) {
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
          if (covered) covered.add(cellKey(x, y));
        }
      }

      // 补绘：被 zoomSkip 跳过但有引力影响的格点
      if (covered) {
        for (const [k, inf] of influence) {
          if (covered.has(k)) continue;
          const [sx, sy] = k.split(',').map(Number);
          if (sx < xStart || sx > xEnd || sy < yStart || sy > yEnd) continue;
          const major = sx % (step * 5) === 0 && sy % (step * 5) === 0;
          let r = major ? majorDotRadius : dotRadius;
          r *= 1 + NODE_MAX_SCALE * inf.scale;
          let a = major ? 0.35 : 0.18;
          a += inf.alpha;

          if (hasDrag) {
            const ddx = sx - dragX!;
            const ddy = sy - dragY!;
            const ddist = Math.sqrt(ddx * ddx + ddy * ddy);
            if (ddist < DRAG_RANGE) {
              const t = 1 - ddist / DRAG_RANGE;
              const ease = t * t * (3 - 2 * t);
              r *= 1 + DRAG_MAX_SCALE * ease;
              a = Math.min(0.65, a + 0.3 * ease);
            }
          }
          cache.gfx.circle(sx, sy, r).fill({ color: 0x888888, alpha: a });
        }
      }
    } else {
      // 传统线网格（zoomSkip 控制线条密度）
      const effStep = step * zoomSkip;
      for (let x = xStart; x <= xEnd; x += effStep) {
        const major = x % (step * 5) === 0;
        cache.gfx.moveTo(x, bounds.minY).lineTo(x, bounds.maxY).stroke({ color: 0x888888, width: major ? lineWidth * 1.5 : lineWidth, alpha: major ? 0.15 : 0.05 });
      }
      for (let y = yStart; y <= yEnd; y += effStep) {
        const major = y % (step * 5) === 0;
        cache.gfx.moveTo(bounds.minX, y).lineTo(bounds.maxX, y).stroke({ color: 0x888888, width: major ? lineWidth * 1.5 : lineWidth, alpha: major ? 0.15 : 0.05 });
      }
    }
  }

  // 坐标轴（zoomSkip=0 时轴点也隐藏，只留原点 + 线模式轴线）
  if (axisVis) {
    if (gridMode === 'dot') {
      // 原点始终可见
      const axisDotR = Math.max(2.5, lineWidth * 5);
      cache.gfx.circle(0, 0, axisDotR * 1.4).fill({ color: 0x888888, alpha: 0.65 });
      if (zoomSkip > 0) {
        const effStep = step * zoomSkip;
        for (let x = xStart; x <= xEnd; x += effStep) {
          if (Math.abs(x) < 1) continue;
          cache.gfx.circle(x, 0, axisDotR).fill({ color: 0x888888, alpha: 0.5 });
        }
        for (let y = yStart; y <= yEnd; y += effStep) {
          if (Math.abs(y) < 1) continue;
          cache.gfx.circle(0, y, axisDotR).fill({ color: 0x888888, alpha: 0.5 });
        }
      }
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
  // 刻度标签（zoomSkip=0 时完全隐藏）
  if (axisTicks && zoomSkip > 0) {
    const tickStep = step * 5 * zoomSkip;
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
