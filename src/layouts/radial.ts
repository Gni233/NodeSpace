/**
 * 星型布局算法 v2 — 碰撞感知的径向展开
 *
 * 改进（相较于 v1）：
 *   1. 使用节点实际视觉半径（headingLevel 相关）计算间距，不用固定 NODE_DIAM
 *   2. 自底向上计算子树"角跨度"，再自顶向下分配角度，确保同级子节点互不重叠
 *   3. 逐父节点计算半径：父节点根据子节点数量/大小动态扩展，密分支远、疏分支近
 *
 * 写入节点属性：
 *   _starId, _starRoot, _radialX, _radialY, _starAngle, _starRadius
 */

const DEFAULTS = {
  /** 父子间最小径向间距 */
  levelSpacing: 130,
  /** 同级相邻节点的最小角间距（度） */
  minAngularGap: 4,
  /** 多个联通集群间的水平间距 */
  starSpacing: 400,
  /** 最小子弧（防止叶子节点完全看不见），度 */
  minChildArc: 3,
};

interface RadialOptions {
  levelSpacing?: number;
  minAngularGap?: number;
  starSpacing?: number;
  minChildArc?: number;
}

function edgeIds(e: any): [string, string] {
  const src = typeof e.source === 'object' ? e.source.id : e.source;
  const tgt = typeof e.target === 'object' ? e.target.id : e.target;
  return [src, tgt];
}

/** 获取节点的视觉半径（包含边距） */
function nodeVisualR(n: any): number {
  const raw = (n?.radius as number) ?? 14;
  return raw + 6; // 半径 + 碰撞边距
}

/** 根据 headingLevel 或显式属性获取节点半径 */
function getNodeR(n: any): number {
  if (n?.radius) return n.radius;
  const hl = Math.max(1, Math.min(6, (n?.headingLevel as number) || 6));
  return [20, 17, 14, 12, 10, 8][hl - 1];
}

export function computeRadialLayout(
  nodes: any[],
  edges: any[],
  options?: RadialOptions,
): void {
  const { levelSpacing, minAngularGap, starSpacing, minChildArc } = { ...DEFAULTS, ...options };
  const minAngGapRad = (minAngularGap * Math.PI) / 180;
  const minArcRad = (minChildArc * Math.PI) / 180;
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // 清除旧标记
  for (const n of nodes) {
    delete (n as any)._starId; delete (n as any)._starRoot;
    delete (n as any)._radialX; delete (n as any)._radialY;
    delete (n as any)._starAngle; delete (n as any)._starRadius;
  }

  if (nodes.length === 0) return;

  // ---- 1. 邻接表 ----
  const adj = new Map<string, string[]>();
  const sourceIndex = new Map(nodes.map((node, index) => [node.id, index]));
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    const [s, t] = edgeIds(e);
    if (adj.has(s)) adj.get(s)!.push(t);
    if (adj.has(t)) adj.get(t)!.push(s);
  }
  const compareIds = (a: string, b: string): number => {
    const an = nodeMap.get(a), bn = nodeMap.get(b);
    const ah = Number(an?.headingLevel) || 6, bh = Number(bn?.headingLevel) || 6;
    const ao = Number.isFinite(an?.createdOrder) ? Number(an.createdOrder) : sourceIndex.get(a) || 0;
    const bo = Number.isFinite(bn?.createdOrder) ? Number(bn.createdOrder) : sourceIndex.get(b) || 0;
    return ah - bh || ao - bo || a.localeCompare(b);
  };
  for (const neighbours of adj.values()) neighbours.sort(compareIds);

  // ---- 2. 联通分量 ----
  const visited = new Set<string>();
  const stars: string[][] = [];

  for (const n of nodes) {
    if (visited.has(n.id)) continue;
    const comp: string[] = [];
    const queue = [n.id];
    visited.add(n.id);
    for (let head = 0; head < queue.length; head++) {
      const cur = queue[head];
      comp.push(cur);
      for (const nb of adj.get(cur) || []) {
        if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
      }
    }
    stars.push(comp);
  }

  // ---- 3. 每颗星星独立计算 ----
  for (let si = 0; si < stars.length; si++) {
    const comp = stars[si];
    const compSet = new Set(comp);

    // 3a. 根节点选择
    // A structure is an explicit semantic centre. Otherwise prefer the
    // strongest heading and then the graph hub, keeping ties deterministic.
    const rootId = [...comp].sort((a, b) => {
      const an = nodeMap.get(a), bn = nodeMap.get(b);
      const aStructure = Array.isArray(an?.structure?.memberIds) ? 0 : 1;
      const bStructure = Array.isArray(bn?.structure?.memberIds) ? 0 : 1;
      const ah = Number(an?.headingLevel) || 6, bh = Number(bn?.headingLevel) || 6;
      const ad = (adj.get(a) || []).length, bd = (adj.get(b) || []).length;
      return aStructure - bStructure || ah - bh || bd - ad || compareIds(a, b);
    })[0];

    for (const id of comp) {
      const n = nodeMap.get(id);
      if (!n) continue;
      (n as any)._starId = rootId;
      (n as any)._starRoot = id === rootId;
    }

    // 3b. BFS 层级 + 父子关系
    const level = new Map<string, number>();
    const children = new Map<string, string[]>();
    level.set(rootId, 0);
    const bfsVisited = new Set<string>([rootId]);
    const queue = [rootId];

    for (let head = 0; head < queue.length; head++) {
      const pid = queue[head];
      if (!children.has(pid)) children.set(pid, []);
      for (const nb of (adj.get(pid) || [])) {
        if (!compSet.has(nb) || bfsVisited.has(nb)) continue;
        bfsVisited.add(nb);
        level.set(nb, (level.get(pid) || 0) + 1);
        children.get(pid)!.push(nb);
        queue.push(nb);
      }
    }
    // 未访问到的节点挂在根下
    for (const id of comp) {
      if (!bfsVisited.has(id) && id !== rootId) {
        level.set(id, 1);
        children.get(rootId)!.push(id);
      }
    }

    // 3c. 自底向上计算每个子树的"角跨度需求"（以弧度为单位的最小角跨度）
    // 用于角度分配时做加权，保证密的分支获得更多空间
    const spanNeed = new Map<string, number>();

    const calcSpanNeed = (id: string): number => {
      const kids = children.get(id) || [];
      if (kids.length === 0) {
        // 叶节点：至少占 minArcRad，加上节点自身视觉宽度
        const r = getNodeR(nodeMap.get(id)!);
        // 用参考半径估算角宽度
        const refR = Math.max((level.get(id) || 1) * levelSpacing, 50);
        const angularW = (r * 2) / refR;
        spanNeed.set(id, Math.max(minArcRad, angularW));
        return spanNeed.get(id)!;
      }
      let total = 0;
      for (let i = 0; i < kids.length; i++) {
        total += calcSpanNeed(kids[i]);
        if (i < kids.length - 1) total += minAngGapRad; // 相邻子节点间隙
      }
      spanNeed.set(id, Math.max(minArcRad, total));
      return spanNeed.get(id)!;
    };
    calcSpanNeed(rootId);

    // 3d. 自顶向下分配角度和半径（递归，逐父节点计算子节点半径）
    // 半径不再按全局 level 统一，而是每个父节点根据子节点密度独立计算

    const assignPositions = (
      id: string,
      angleStart: number,
      angleEnd: number,
      parentRadius: number,
    ) => {
      const n = nodeMap.get(id)!;
      const midAngle = (angleStart + angleEnd) / 2;
      (n as any)._radialX = Math.cos(midAngle) * parentRadius;
      (n as any)._radialY = Math.sin(midAngle) * parentRadius;
      (n as any)._starAngle = midAngle;

      const kids = children.get(id) || [];
      if (kids.length === 0) return;

      const parentArc = angleEnd - angleStart;

      // 计算子节点层需要的最小半径：在此半径上相邻子节点间距 >= (rA + rB + gap)
      let minR = parentRadius + levelSpacing;
      if (kids.length === 1) {
        // 仅一个子节点：不需要额外空间
      } else {
        // 多个子节点：确保在父弧范围内有足够的线性间距
        // 相邻节点间距 >= nodeR[kidA] + nodeR[kidB] + gap
        let totalLinearNeed = 0;
        for (let i = 0; i < kids.length; i++) {
          const kr = nodeVisualR(nodeMap.get(kids[i])!);
          totalLinearNeed += kr * 2;
          if (i < kids.length - 1) totalLinearNeed += 4; // 间隙
        }
        // 最小半径 = 总线性需求 / 弧长
        const arcBasedR = totalLinearNeed / Math.max(parentArc, 0.01);
        minR = Math.max(minR, arcBasedR);
      }

      const childRadius = minR;

      // 分配每个子节点的弧
      const totalSpanNeed = kids.reduce((sum, cid) => sum + (spanNeed.get(cid) || minArcRad), 0);
      let cursor = angleStart;

      for (let i = 0; i < kids.length; i++) {
        const cid = kids[i];
        const kidSpan = spanNeed.get(cid) || minArcRad;
        // 按角跨度需求比例分配父弧
        let childArc = (kidSpan / totalSpanNeed) * parentArc;

        // 确保不小于最小弧，也不小于节点自身在 childRadius 上的视觉宽度
        const kr = getNodeR(nodeMap.get(cid)!);
        const visualArc = (kr * 2) / childRadius;
        childArc = Math.max(childArc, visualArc, minArcRad);

        // 处理弧溢出：最后一个子节点获得剩余全部空间
        if (i === kids.length - 1 && cursor + childArc < angleEnd) {
          childArc = angleEnd - cursor;
        }
        if (cursor + childArc > angleEnd) {
          childArc = Math.max(minArcRad, angleEnd - cursor);
        }

        assignPositions(cid, cursor, cursor + childArc, childRadius);
        cursor += childArc;
      }
    };

    assignPositions(rootId, -Math.PI, Math.PI, 0);

    // 计算星星最大半径
    let maxR = 0;
    for (const id of comp) {
      const n = nodeMap.get(id)!;
      const dx = (n as any)._radialX || 0;
      const dy = (n as any)._radialY || 0;
      const r = Math.sqrt(dx * dx + dy * dy) + getNodeR(n);
      if (r > maxR) maxR = r;
    }
    const rootNode = nodeMap.get(rootId);
    if (rootNode) {
      (rootNode as any)._starRadius = maxR + 24;
    }
  }

  // ---- 4. 初始位置（费马螺旋排布，模拟星图自然分布） ----
  if (stars.length > 1) {
    // 收集每个星星的根节点和半径
    type StarInfo = { comp: string[]; rootId: string; root: any; r: number };
    const starInfos: StarInfo[] = [];
    for (let i = 0; i < stars.length; i++) {
      const rootId = stars[i].find(id => (nodeMap.get(id) as any)?._starRoot);
      if (!rootId) continue;
      const root = nodeMap.get(rootId);
      if (!root) continue;
      const r = Math.max(((root as any)._starRadius || 0), 60);
      starInfos.push({ comp: stars[i], rootId, root, r });
    }

    if (starInfos.length === 0) return;

    // 按半径降序排列：大的靠近中心，小的螺旋散开（模拟星系结构）
    starInfos.sort((a, b) => b.r - a.r || compareIds(a.rootId, b.rootId));

    const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // ≈137.5°，费马螺旋黄金角
    const avgR = starInfos.reduce((s, si) => s + si.r, 0) / starInfos.length;
    const baseR = Math.max(avgR * 1.5, starSpacing * 0.45); // 最内圈半径

    for (let i = 0; i < starInfos.length; i++) {
      const si = starInfos[i];
      const angle = i * goldenAngle;
      // 半径随 √i 增长（费马螺旋），间距按星星大小自适应
      const r = baseR + Math.sqrt(i) * (si.r + avgR + starSpacing * 0.35) * 0.5;
      si.root.x = r * Math.cos(angle);
      si.root.y = r * Math.sin(angle);
    }

    // 根据实际包围盒居中
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const si of starInfos) {
      minX = Math.min(minX, si.root.x - si.r);
      maxX = Math.max(maxX, si.root.x + si.r);
      minY = Math.min(minY, si.root.y - si.r);
      maxY = Math.max(maxY, si.root.y + si.r);
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    for (const si of starInfos) {
      si.root.x -= cx;
      si.root.y -= cy;
    }
  } else {
    const rootId = stars[0].find(id => (nodeMap.get(id) as any)?._starRoot);
    if (rootId) {
      const root = nodeMap.get(rootId);
      if (root) { root.x = 0; root.y = 0; }
    }
  }

  // 非根节点位置 = 根 + 局部偏移
  for (const n of nodes) {
    if ((n as any)._starRoot) continue;
    const root = nodeMap.get((n as any)._starId);
    if (root) {
      n.x = root.x + ((n as any)._radialX || 0);
      n.y = root.y + ((n as any)._radialY || 0);
    }
  }
}
