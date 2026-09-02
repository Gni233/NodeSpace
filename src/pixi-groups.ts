import { Container, Graphics, Text } from 'pixi.js';
import { GraphData } from './data/storage';
import { getGroupRegion } from './geometry/hit';
import { isNodeInGroup } from './group-membership';

// Beyond 3x the visual gain is negligible while every group-label texture grows
// quadratically. Keep high-DPI text crisp without spending mobile GPU memory on
// 6–8x textures.
const TEXT_RESOLUTION = Math.min(3, Math.max(2, window.devicePixelRatio || 1));

/** Catmull-Rom 样条插值 → 平滑曲线点序列（用于磁流体 blob） */
function catmullRomPoints(verts: number[][], segments: number = 8): number[][] {
  const n = verts.length;
  if (n < 3) return verts;
  const pts: number[][] = [];
  for (let i = 0; i < n; i++) {
    const p0 = verts[(i - 1 + n) % n];
    const p1 = verts[i];
    const p2 = verts[(i + 1) % n];
    const p3 = verts[(i + 2) % n];
    for (let t = 0; t < segments; t++) {
      const tt = t / segments;
      const tt2 = tt * tt, tt3 = tt2 * tt;
      const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * tt + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * tt2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * tt3);
      const y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * tt + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * tt2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * tt3);
      pts.push([x, y]);
    }
  }
  return pts;
}

export function updateGroups(
  groupLayer: Container,
  graph: GraphData,
  nodes: any[],
  showLabels: boolean,
  labelMin: number,
  labelMax: number,
  gridSnap?: { enabled: boolean; spacing: number }
) {
  // 清理旧 Graphics + Text（destroy 释放 GPU 资源）
  let gfx: Graphics | null = null;
  for (let i = groupLayer.children.length - 1; i >= 0; i--) {
    const child = groupLayer.children[i];
    groupLayer.removeChildAt(i);
    if (child instanceof Graphics) {
      gfx = child;
    } else {
      child.destroy();
    }
  }
  if (gfx) {
    gfx.clear();
  } else {
    gfx = new Graphics();
  }

  for (const g of graph.groups) {
    if (g.displayMode === 'none') continue;

    // 过滤成员：排除折叠中节点（进度>40%后移除），计算动画过渡 alpha
    let groupAlphaMult = 1;
    const now2 = performance.now();
    const members = nodes.filter((n: any) => {
      if (!isNodeInGroup(n, g)) return false;
      const colAnim = (n as any)._collapseAnim;
      const expAnim = (n as any)._expandAnim;
      if (colAnim) {
        const dur = colAnim.duration || 500;
        const t = Math.min(1, Math.max(0, (now2 - colAnim.startTime) / dur));
        groupAlphaMult = Math.min(groupAlphaMult, Math.max(0, 1 - t * t));
        if (t > 0.4) return false; // 折叠进度过半 -> 排除出形状
      }
      if (expAnim) {
        const dur = expAnim.duration || 500;
        const t = Math.min(1, Math.max(0, (now2 - expAnim.startTime) / dur));
        groupAlphaMult = Math.min(groupAlphaMult, Math.max(0.15, t));
      }
      return true;
    });
    if (members.length === 0) continue;

    let cx = 0, cy = 0; // 集合中心（用于标签定位）

    if (g.displayMode === 'fluid') {
      // 圆模式：每个成员画径向渐变圆
      let sumX = 0, sumY = 0;
      for (const m of members) {
        const r = (m.radius || 9) * (g.fluidRadius || 3);
        gfx.circle(m.x, m.y, r)
           .fill({ color: g.color || '#5B8FF9', alpha: (g.opacity ?? 0.10) * groupAlphaMult });
        sumX += m.x; sumY += m.y;
      }
      cx = sumX / members.length; cy = sumY / members.length;
    } else if (g.displayMode === 'blob') {
      // 流体模式：按距离聚类 → 每簇独立凸包 → Catmull-Rom 平滑 → 局部流动
      const color = g.color || '#5B8FF9';
      const alpha = g.opacity ?? 0.12;
      const fluidR = g.fluidRadius || 3;
      const baseR = 9 * fluidR;

      // 简单距离聚类（并查集）：节点间距 < baseR*4 归为一簇
      const parent = new Map<number, number>();
      const find = (x: number): number => {
        let p = parent.get(x) ?? x;
        if (p !== x) { p = find(p); parent.set(x, p); }
        return p;
      };
      const union = (a: number, b: number) => { parent.set(find(a), find(b)); };
      for (let i = 0; i < members.length; i++) {
        parent.set(i, i);
        for (let j = i + 1; j < members.length; j++) {
          const dist = Math.hypot(members[i].x - members[j].x, members[i].y - members[j].y);
          if (dist < baseR * 4) union(i, j);
        }
      }
      const clusters = new Map<number, any[]>();
      for (let i = 0; i < members.length; i++) {
        const r = find(i);
        if (!clusters.has(r)) clusters.set(r, []);
        clusters.get(r)!.push(members[i]);
      }

      for (const cluster of clusters.values()) {
        let sumX = 0, sumY = 0;
        for (const m of cluster) { sumX += m.x; sumY += m.y; }
        if (cx === 0 && cy === 0) { cx = sumX / members.length; cy = sumY / members.length; }

        const region = getGroupRegion(cluster, 'polygon');
        if (!region) continue;
        const verts = region.verts();
        if (!verts || verts.length < 3) {
          // 单节点：画圆
          const m = cluster[0];
          const r = (m.radius || 9) * fluidR;
          gfx.circle(m.x, m.y, r).fill({ color, alpha: alpha * groupAlphaMult });
          continue;
        }
        const cc = region.center();
        const expanded = verts.map((v: number[]) => {
          const dx = v[0] - cc[0], dy = v[1] - cc[1];
          const d = Math.hypot(dx, dy) || 1;
          return [v[0] + (dx / d) * baseR, v[1] + (dy / d) * baseR] as number[];
        });
        const smoothed = catmullRomPoints(expanded, 8);

      // 外发光（磁流体边界）
      gfx.moveTo(smoothed[0][0], smoothed[0][1]);
      for (let i = 1; i < smoothed.length; i++) {
        gfx.lineTo(smoothed[i][0], smoothed[i][1]);
      }
      gfx.closePath()
         .stroke({ color, width: 6, alpha: alpha * 0.5 * groupAlphaMult });

      // 中层柔边
      gfx.moveTo(smoothed[0][0], smoothed[0][1]);
      for (let i = 1; i < smoothed.length; i++) {
        gfx.lineTo(smoothed[i][0], smoothed[i][1]);
      }
      gfx.closePath()
         .stroke({ color, width: 2.5, alpha: alpha * 0.7 * groupAlphaMult });

        // 内部填充
        gfx.moveTo(smoothed[0][0], smoothed[0][1]);
        for (let i = 1; i < smoothed.length; i++) {
          gfx.lineTo(smoothed[i][0], smoothed[i][1]);
        }
        gfx.closePath()
           .fill({ color, alpha: alpha * groupAlphaMult });
      } // end cluster loop
    } else {
      // 矩形/凸包模式
      const region = getGroupRegion(members, g.displayMode);
      if (!region) continue;
      const verts = region.verts();
      if (!verts || verts.length < 3) continue;

      const center = region!.center();
      cx = center[0]; cy = center[1];

      // 格点吸附：集合框顶点对齐网格
      const sp = gridSnap?.spacing ?? 30;
      const snapV = (v: number) => gridSnap?.enabled ? Math.round(v / sp) * sp : v;

      gfx.moveTo(snapV(verts[0][0]), snapV(verts[0][1]));
      for (let i = 1; i < verts.length; i++) {
        gfx.lineTo(snapV(verts[i][0]), snapV(verts[i][1]));
      }
      gfx.closePath()
         .fill({ color: g.color || '#5B8FF9', alpha: (g.opacity ?? 0.10) * groupAlphaMult })
         .stroke({ color: g.borderColor || '#3A6FD8', width: 1, alpha: 0.3 * groupAlphaMult });
    }

    // 集合标签
    if (showLabels && cx !== 0 && cy !== 0) {
      const fontSize = Math.min(labelMax, Math.max(labelMin, members.length * 2 + 6));
      const label = new Text({
        text: g.label,
        resolution: TEXT_RESOLUTION,
        style: {
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize,
          fill: g.color || '#5B8FF9',
          align: 'center',
        } as any,
      });
      label.anchor.set(0.5, 0.5);
      label.position.set(cx, cy);
      label.alpha = 0.7 * groupAlphaMult;
      groupLayer.addChild(label);
    }
  }

  groupLayer.addChild(gfx);
}
