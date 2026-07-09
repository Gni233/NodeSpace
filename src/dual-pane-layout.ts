import { PANE_LEFT, PANE_RIGHT } from './pane-state';

const V = (name: string, fallback: string) => `var(${name},${fallback})`;

export interface MultiPaneDOM {
  splitContainer: HTMLDivElement;
  paneContainers: HTMLDivElement[];
  dividers: HTMLDivElement[];
  addPane: () => HTMLDivElement;
  removePane: () => void;
  layoutPanes: () => void;
  /** 设置窗格点击聚焦回调 */
  onPaneFocus: (fn: ((index: number) => void) | null) => void;
}

const DIVIDER_WIDTH = 6;
const MIN_PANE = 80;

export function createMultiPaneLayout(appShell: HTMLElement): MultiPaneDOM {
  const splitContainer = document.createElement('div');
  splitContainer.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;overflow:hidden;z-index:0;';
  appShell.appendChild(splitContainer);

  const paneContainers: HTMLDivElement[] = [];
  const dividers: HTMLDivElement[] = [];
  // 每个分割线拖拽后的宽度比例（相对于分屏总数）
  // 例如 2 列 → ratios = [leftRatio]，3 列 → ratios = [col0Ratio, col1Ratio]
  const ratios: number[] = [];

  function makeDivider(): HTMLDivElement {
    const d = document.createElement('div');
    d.style.cssText = `position:absolute;top:0;bottom:0;width:${DIVIDER_WIDTH}px;cursor:col-resize;z-index:100;background:${V('--fg-border-light','rgba(255,255,255,0.12)')};transition:background 0.15s;`;
    splitContainer.appendChild(d);
    dividers.push(d);
    return d;
  }

  // 初始创建左右两栏
  function init() {
    for (let i = 0; i < 2; i++) {
      const pc = document.createElement('div');
      pc.style.cssText = 'position:absolute;top:0;bottom:0;overflow:hidden;';
      pc.dataset.paneIndex = String(i);
      splitContainer.appendChild(pc);
      paneContainers.push(pc);
    }
    ratios.push(0.5); // 单个分割线，初值 50/50
    makeDivider();
    layoutPanes();
  }

  // 分割线拖拽
  let draggingIdx = -1;
  splitContainer.addEventListener('pointerdown', (e) => {
    const target = e.target as HTMLDivElement;
    const di = dividers.indexOf(target);
    if (di >= 0) {
      e.preventDefault();
      draggingIdx = di;
      dividers[di].style.background = V('--fg-accent', '#5B8FF9');
    }
  });

  window.addEventListener('pointermove', (e) => {
    if (draggingIdx < 0) return;
    const rect = splitContainer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const totalW = rect.width;
    const colCount = ratios.length + 1;
    const colW = totalW / colCount;

    // 计算该分割线可拖动范围
    const idx = draggingIdx;
    const leftLimit = (idx * colW) + MIN_PANE;
    const rightLimit = ((idx + 1) * colW) + (colW - MIN_PANE);
    // 简化：限制分割线在合理范围内
    const clamped = Math.max(MIN_PANE * (idx + 1), Math.min(totalW - MIN_PANE * (colCount - idx - 1), x));
    ratios[idx] = clamped / totalW;
    layoutPanes();
  });

  window.addEventListener('pointerup', () => {
    if (draggingIdx >= 0) {
      dividers[draggingIdx].style.background = V('--fg-border-light', 'rgba(255,255,255,0.12)');
      draggingIdx = -1;
    }
  });

  function addPane(): HTMLDivElement {
    const pc = document.createElement('div');
    pc.style.cssText = 'position:absolute;top:0;bottom:0;overflow:hidden;';
    pc.dataset.paneIndex = String(paneContainers.length);
    splitContainer.appendChild(pc);
    paneContainers.push(pc);
    // 均分：N 个窗格需要 N-1 个 ratios（每个 ratio 对应一条分割线）
    const newN = ratios.length + 2; // 新窗格总数（旧 ratios.length+1 个旧窗格 + 1 个新窗格）
    for (let i = 0; i < ratios.length; i++) {
      ratios[i] = (i + 1) / newN;
    }
    ratios.push((ratios.length + 1) / newN); // 新增的分割线比例
    makeDivider();
    layoutPanes();
    // 新窗格自动绑定点击聚焦
    pc.addEventListener('pointerdown', () => {
      _onPaneFocus?.(paneContainers.indexOf(pc));
    });
    return pc;
  }

  function removePane() {
    if (paneContainers.length <= 1) return;
    const last = paneContainers.pop()!;
    last.remove();
    if (dividers.length > 0) {
      const ld = dividers.pop()!;
      ld.remove();
    }
    if (ratios.length > 0) ratios.pop();
    // 重算比例：剩余 N 个窗格，需要 N-1 个 ratios
    const n = paneContainers.length;
    for (let i = 0; i < n - 1; i++) {
      ratios[i] = (i + 1) / n;
    }
    layoutPanes();
  }

  function layoutPanes() {
    const total = splitContainer.clientWidth;
    const cols = paneContainers.length;
    if (cols === 0) return;

    const visiblePanes = paneContainers.filter(pc => pc.style.display !== 'none');
    if (visiblePanes.length <= 1) {
      const vp = visiblePanes[0] || paneContainers[0];
      vp.style.left = '0';
      vp.style.width = total + 'px';
      for (const d of dividers) d.style.display = 'none';
    } else {
      for (const d of dividers) d.style.display = '';
      let left = 0;
      for (let i = 0; i < cols; i++) {
        const right = i < ratios.length ? Math.round(ratios[i] * total) : total;
        const w = Math.max(MIN_PANE, right - left - (i < cols - 1 ? DIVIDER_WIDTH / 2 : 0));
        paneContainers[i].style.left = left + 'px';
        paneContainers[i].style.width = w + 'px';
        if (i < dividers.length) {
          dividers[i].style.left = (left + w) + 'px';
        }
        left = left + w + (i < cols - 1 ? DIVIDER_WIDTH : 0);
      }
    }
    window.dispatchEvent(new CustomEvent('pane-resize'));
  }

  init();
  window.addEventListener('resize', layoutPanes);

  // --- 窗格点击聚焦 ---
  let _onPaneFocus: ((index: number) => void) | null = null;
  paneContainers.forEach((pc, idx) => {
    pc.addEventListener('pointerdown', () => {
      _onPaneFocus?.(idx);
    });
  });

  return { splitContainer, paneContainers, dividers, addPane, removePane, layoutPanes,
    onPaneFocus: (fn) => { _onPaneFocus = fn; } };
}
