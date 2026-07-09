/**
 * 共享节点位置动画工具函数
 * 消除 main.ts 中 6 处重复的 RAF 缓动循环
 */
import { easeInOutCubic } from './easing';
import { sharedState } from '../shared-state';
import { LAYOUT_ANIM_DURATION } from '../layout-constants';

export interface AnimateNodesOptions {
  /** 图数据中的节点（会被修改位置） */
  nodes: any[];
  /** 模拟中的节点（会被同步修改位置） */
  simNodes: any[];
  /** 返回节点 n 的起始位置 {x, y}；默认从 simNodes 或 nodes 读取 */
  getSource?: (node: any) => { x: number; y: number };
  /** 返回节点 n 的目标位置 {x, y}；返回 null 表示跳过该节点 */
  getTarget: (node: any) => { x: number; y: number } | null;
  /** 每帧绘制完成后回调 */
  onFrame?: () => void;
  /** 动画完成回调 */
  onComplete?: () => void;
  /** 动画时长 (ms)，默认 LAYOUT_ANIM_DURATION */
  duration?: number;
  /** 缓动函数，默认 easeInOutCubic */
  easing?: (t: number) => number;
  /** 动画完成后是否将目标节点设为 fixed，默认 false */
  fixOnComplete?: boolean;
  /** 动画完成后是否清除模拟节点的固定状态，默认 false */
  unfixSimOnComplete?: boolean;
}

/**
 * 启动节点位置动画，返回 cancel 函数用于提前终止。
 * 动画中每帧使用 sharedState.directDraw() 直接绘制，绕过 RAF 节流。
 */
export function startNodeAnimation(opts: AnimateNodesOptions): () => void {
  const {
    nodes,
    simNodes,
    getSource,
    getTarget,
    onFrame,
    onComplete,
    duration = LAYOUT_ANIM_DURATION,
    easing = easeInOutCubic,
    fixOnComplete = false,
    unfixSimOnComplete = false,
  } = opts;

  // 保存起始位置
  const startPositions = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    if (getTarget(n) == null) continue;
    if (getSource) {
      const src = getSource(n);
      startPositions.set(n.id, { x: src.x, y: src.y });
    } else {
      const sn = simNodes.length ? simNodes.find((s: any) => s.id === n.id) : null;
      startPositions.set(n.id, { x: sn ? sn.x : n.x, y: sn ? sn.y : n.y });
    }
  }

  let rafId: number | null = null;
  let cancelled = false;
  const startTime = performance.now();

  const frame = (now: number) => {
    if (cancelled) return;
    const t = Math.min(1, (now - startTime) / duration);
    const e = easing(t);

    for (const n of nodes) {
      const tgt = getTarget(n);
      if (!tgt) continue;
      const start = startPositions.get(n.id);
      if (!start) continue;
      n.x = start.x + (tgt.x - start.x) * e;
      n.y = start.y + (tgt.y - start.y) * e;
      n.fx = n.x; n.fy = n.y;
      if (simNodes.length) {
        const sn = simNodes.find((s: any) => s.id === n.id);
        if (sn) { sn.x = n.x; sn.y = n.y; sn.fx = n.x; sn.fy = n.y; }
      }
    }

    onFrame?.();

    if (t < 1) {
      rafId = requestAnimationFrame(frame);
    } else {
      // 完成
      if (fixOnComplete) {
        for (const n of nodes) {
          if (getTarget(n)) n.fixed = true;
        }
      }
      if (unfixSimOnComplete) {
        for (const n of nodes) {
          const sn = simNodes.find((s: any) => s.id === n.id);
          if (sn) { sn.fx = null; sn.fy = null; }
        }
      }
      onComplete?.();
    }
  };

  rafId = requestAnimationFrame(frame);

  return () => {
    cancelled = true;
    if (rafId !== null) cancelAnimationFrame(rafId);
  };
}
