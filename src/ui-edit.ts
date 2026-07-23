import { darken, PRESET_COLORS } from "./utils/color";
import { GraphData } from "./data/storage";
import { safePrompt } from './dialog';
import { confirmAction } from './toast';
import {Z_EDIT_PANEL, V } from "./layout-constants";
import { detachNodeFromStructure } from './structure-nodes';

export interface EditPanelContext {
  graph: GraphData;
  getSelNode: () => string | null;  setSelNode: (v: string | null) => void;
  getSelEdge: () => number | null;  setSelEdge: (v: number | null) => void;
  getSelGroup: () => string | null; setSelGroup: (v: string | null) => void;
  getLinkMode: () => boolean;      setLinkMode: (v: boolean) => void;
  setLinkSrc: (v: string | null) => void;
  clearLinkMode?: () => void;
  saveUndo?: () => void;
  getBoxSelectMode?: () => boolean; setBoxSelectMode?: (v: boolean) => void;
  getSaveData: () => () => Promise<void>;
  getInitSim: () => () => void;
  getUpdateInfo: () => () => void;
  getUpdateSelects: () => () => void;
  draw: () => void;
  triggerSave: () => void;
  getSimulation: () => any;
  markNodesDying?: (ids: string[]) => void;
  reinitializeGraph?: () => void;
  updateLinkForce?: () => void;
  /** 将当前图的节点显示属性同步到其他持有同文件的窗格的模拟节点 */
  syncGraphToOtherPanes?: () => void;
  /** 在下一帧合并跨窗格同步与重绘。 */
  scheduleNameRender?: () => void;
  onToast?: (msg: string, type?: 'info' | 'error' | 'success' | 'warning') => void;
}

function el(tag: string, opts?: { text?: string; style?: string; type?: string; placeholder?: string; attrs?: Record<string, string> }): HTMLElement {
  const e = document.createElement(tag);
  if (opts?.text) e.textContent = opts.text;
  if (opts?.style) e.setAttribute('style', opts.style);
  if (opts?.type) (e as HTMLInputElement).type = opts.type;
  if (opts?.placeholder) (e as HTMLInputElement).placeholder = opts.placeholder;
  if (opts?.attrs) Object.entries(opts.attrs).forEach(([k, v]) => e.setAttribute(k, v));
  return e;
}

export function createEditPanel(
  gCont: HTMLElement,
  ctx: EditPanelContext,
  getEditPanelOpacity: () => number
) {
  const colors = PRESET_COLORS;
  const { getSelNode, setSelNode, getSelEdge, setSelEdge, getSelGroup, setSelGroup,
    getLinkMode, setLinkMode, setLinkSrc, getSaveData, getInitSim, getUpdateInfo, getUpdateSelects, draw, triggerSave, getSimulation } = ctx;

  const editPanel = el("div", { style: `position:absolute;right:10px;top:112px;z-index:${Z_EDIT_PANEL};min-width:220px;max-width:500px;max-height:calc(100vh - 124px);overflow-y:auto;padding:10px;border:1px solid ${V('--fg-glass-border','rgba(255,255,255,0.1)')};border-radius:${V('--fg-radius-md','10px')};background:${V('--fg-surface-glass','rgba(40,42,48,0.75)')};backdrop-filter:blur(var(--fg-glass-blur,12px));-webkit-backdrop-filter:blur(12px);color:${V('--fg-text','#d0d0d0')};display:none;flex-direction:column;gap:8px;box-shadow:${V('--fg-shadow-md','0 4px 16px rgba(0,0,0,0.3)')};transition:background var(--fg-transition,0.25s ease),color var(--fg-transition,0.25s ease);` });
  editPanel.className = 'fg-inspector';
  editPanel.style.opacity = String(getEditPanelOpacity());
  const showPanel = () => {
    editPanel.style.display = 'flex';
    if (collapsed) {
      nodeEdit.style.display = 'none'; edgeEdit.style.display = 'none'; groupEdit.style.display = 'none';
      titleBar.style.display = 'none'; resizeHandle.style.display = 'none';
      collapsedHandle.style.display = 'flex';
    }
  };

  // --- 拖拽把手（居中圆角横线）---
  const titleBar = el("div", { style: "display:flex;align-items:center;justify-content:center;cursor:move;padding:2px 0 4px 0;user-select:none;flex-shrink:0;" });
  const dragDot = el("div", { style: "width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.3);" });
  titleBar.appendChild(dragDot);
  editPanel.insertBefore(titleBar, editPanel.firstChild);

  // --- 缩放把手（右下角）---
  const resizeHandle = el("div", { style: "position:absolute;right:6px;bottom:6px;width:12px;height:12px;border-radius:50%;background:rgba(255,255,255,0.3);cursor:nwse-resize;z-index:1;touch-action:none;user-select:none;" });
  editPanel.appendChild(resizeHandle);

  // --- 折叠把手（小方框 + 拖拽柄，默认隐藏）---
  const collapsedHandle = el("div", { style: `position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;cursor:move;user-select:none;border-radius:${V('--fg-radius-md','10px')};` });
  const collapseDot = el("div", { style: "width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.4);flex-shrink:0;" });
  collapsedHandle.appendChild(collapseDot);
  editPanel.appendChild(collapsedHandle);

  // --- 拖动 + 缩放状态（鸿蒙兼容，不用 setPointerCapture）---
  let dragInfo: { sx: number; sy: number; px: number; py: number } | null = null;
  let resizeInfo: { sx: number; sy: number; pw: number; ph: number; pt: number; pl: number } | null = null;
  let savedTransition = ''; // 保存拖拽前的 transition 值

  // --- 折叠状态 ---
  const COLLAPSE_W = 160;  // 宽度低于此值折叠
  const COLLAPSE_H = 90;   // 高度低于此值折叠
  const COLLAPSE_BOX = 44; // 折叠后小方框尺寸
  let collapsed = false;
  let preCollapseW = 0, preCollapseH = 0, preCollapseL = '', preCollapseT = '';
  let enterCollapse: () => void;
  let exitCollapse: () => void;

  // 切换到 left-based 定位
  const ensureLeftBased = () => {
    const r = editPanel.getBoundingClientRect();
    editPanel.style.left = r.left + 'px';
    editPanel.style.top = r.top + 'px';
    editPanel.style.right = 'auto';
  };

  const startDrag = (cx: number, cy: number) => {
    ensureLeftBased();
    savedTransition = editPanel.style.transition;
    editPanel.style.transition = 'none';
    dragInfo = { sx: cx, sy: cy, px: parseInt(editPanel.style.left), py: parseInt(editPanel.style.top) };
  };
  const startResize = (cx: number, cy: number) => {
    ensureLeftBased();
    savedTransition = editPanel.style.transition;
    editPanel.style.transition = 'none';
    const r = editPanel.getBoundingClientRect();
    resizeInfo = { sx: cx, sy: cy, pw: r.width, ph: r.height, pt: r.top, pl: r.left };
  };

  titleBar.addEventListener("pointerdown", (e: PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    startDrag(e.clientX, e.clientY);
  });
  titleBar.addEventListener("touchstart", (e: TouchEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.touches[0]) startDrag(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });
  // 双击标题栏 → 恢复默认位置
  titleBar.addEventListener("dblclick", (e) => {
    e.preventDefault(); e.stopPropagation();
    editPanel.style.left = '';
    editPanel.style.right = '10px';
    editPanel.style.top = '112px';
    editPanel.style.width = '';
    editPanel.style.maxWidth = '500px';
    editPanel.style.height = '';
    editPanel.style.transition = 'right 0.25s ease, top 0.25s ease';
  });

  resizeHandle.addEventListener("pointerdown", (e: PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    startResize(e.clientX, e.clientY);
  });
  resizeHandle.addEventListener("touchstart", (e: TouchEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.touches[0]) startResize(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });
  // 双击伸缩柄 → 恢复默认尺寸
  resizeHandle.addEventListener("dblclick", (e) => {
    e.preventDefault(); e.stopPropagation();
    if (collapsed) exitCollapse();
    editPanel.style.width = '';
    editPanel.style.height = '';
  });

  // 折叠小方框拖拽事件（函数定义在后，但事件绑定可行）
  let collapsedWasDragged = false;
  collapsedHandle.addEventListener("pointerdown", (e: PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    collapsedWasDragged = false;
    startDrag(e.clientX, e.clientY);
  });
  collapsedHandle.addEventListener("touchstart", (e: TouchEvent) => {
    e.preventDefault(); e.stopPropagation();
    collapsedWasDragged = false;
    if (e.touches[0]) startDrag(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });

  // --- 位置持久化 ---
  const POS_KEY = 'fg-edit-panel-pos-v2';
  const savePanelState = () => {
    if (collapsed) {
      const r = editPanel.getBoundingClientRect();
      localStorage.setItem(POS_KEY, JSON.stringify({
        collapsed: true,
        t: r.top,
        preT: preCollapseT,
      }));
    } else {
      const r = editPanel.getBoundingClientRect();
      localStorage.setItem(POS_KEY, JSON.stringify({ collapsed: false, l: r.left, t: r.top, w: r.width, h: r.height }));
    }
  };
  // 恢复缓存的折叠状态（延迟到 enterCollapse 赋值后）
  let _restoreCollapsed = false;
  (() => {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (typeof s.l === 'number' && typeof s.t === 'number') {
          if (s.collapsed) {
            editPanel.style.right = '10px';
            editPanel.style.left = 'auto';
            editPanel.style.top = Math.max(0, Math.min(s.t || s.top || 112, window.innerHeight - 40)) + 'px';
            preCollapseT = s.preT || '';
            _restoreCollapsed = true;
          } else {
            editPanel.style.left = Math.max(0, Math.min(s.l, window.innerWidth - 40)) + 'px';
            editPanel.style.top = Math.max(0, Math.min(s.t, window.innerHeight - 40)) + 'px';
            editPanel.style.right = 'auto';
            if (s.w && s.w >= 220) { editPanel.style.width = Math.min(s.w, window.innerWidth - 40) + 'px'; editPanel.style.maxWidth = '500px'; }
            if (s.h && s.h >= 120) editPanel.style.height = s.h + 'px';
          }
        }
      }
    } catch {}
  })();

  // 全局移动/释放
  const onGlobalMove = (e: PointerEvent) => {
    if (dragInfo) {
      const dx = e.clientX - dragInfo.sx, dy = e.clientY - dragInfo.sy;
      editPanel.style.left = Math.max(0, Math.min(window.innerWidth - 40, dragInfo.px + dx)) + 'px';
      editPanel.style.top = Math.max(0, Math.min(window.innerHeight - 60, dragInfo.py + dy)) + 'px';
      if (collapsed) collapsedWasDragged = true;
    }
    if (resizeInfo) {
      // 右下角拉伸：允许缩小到折叠阈值以下（最小 50px）
      const dx = e.clientX - resizeInfo.sx;
      const dy = e.clientY - resizeInfo.sy;
      const newW = Math.max(50, Math.min(500, resizeInfo.pw + dx));
      const newH = Math.max(50, Math.min(window.innerHeight - resizeInfo.pt - 20, resizeInfo.ph + dy));
      editPanel.style.width = newW + 'px';
      editPanel.style.height = newH + 'px';
      editPanel.style.maxWidth = '500px';
    }
  };
  const onGlobalUp = () => {
    if (dragInfo || resizeInfo) {
      editPanel.style.transition = savedTransition || 'background var(--fg-transition,0.25s ease),color var(--fg-transition,0.25s ease)';
      // 拉伸结束时检查是否低于折叠阈值
      if (resizeInfo && !collapsed) {
        const r = editPanel.getBoundingClientRect();
        if (r.width < COLLAPSE_W || r.height < COLLAPSE_H) {
          enterCollapse();
        }
      }
      savePanelState();
    }
    dragInfo = null; resizeInfo = null;
  };
  window.addEventListener("pointermove", onGlobalMove);
  window.addEventListener("pointerup", onGlobalUp);

  const onTouchMove = (e: TouchEvent) => {
    if (!dragInfo && !resizeInfo) return;
    e.preventDefault();
    const pt = e.touches[0];
    if (!pt) return;
    if (dragInfo) {
      const dx = pt.clientX - dragInfo.sx, dy = pt.clientY - dragInfo.sy;
      editPanel.style.left = Math.max(0, Math.min(window.innerWidth - 40, dragInfo.px + dx)) + 'px';
      editPanel.style.top = Math.max(0, Math.min(window.innerHeight - 60, dragInfo.py + dy)) + 'px';
    }
    if (resizeInfo) {
      const dx = pt.clientX - resizeInfo.sx;
      const dy = pt.clientY - resizeInfo.sy;
      const newW = Math.max(50, Math.min(500, resizeInfo.pw + dx));
      const newH = Math.max(50, Math.min(window.innerHeight - resizeInfo.pt - 20, resizeInfo.ph + dy));
      editPanel.style.width = newW + 'px';
      editPanel.style.height = newH + 'px';
      editPanel.style.maxWidth = '500px';
    }
  };
  window.addEventListener("touchmove", onTouchMove, { passive: false });
  window.addEventListener("touchend", onGlobalUp);
  window.addEventListener("touchcancel", onGlobalUp);

  let _cleanedUp = false;
  const cleanupDragListeners = () => {
    if (_cleanedUp) return;
    _cleanedUp = true;
    window.removeEventListener("pointermove", onGlobalMove);
    window.removeEventListener("pointerup", onGlobalUp);
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("touchend", onGlobalUp);
    window.removeEventListener("touchcancel", onGlobalUp);
  };

  const makeRow = (p: HTMLElement, lb: string, inp: HTMLElement) => {
    const r = el("div", { style: "display:flex;gap:6px;align-items:flex-start;" });
    r.appendChild(el("span", { text: lb, style: `flex-shrink:0;font-size:${V('--fg-font-lg', '0.92em')};line-height:1.8;` }));
    r.appendChild(inp);
    p.appendChild(r);
  };

  const saveCurrent = async () => {
    const selNode = getSelNode();
    const selEdge = getSelEdge();
    const selGroup = getSelGroup();
    const sim = getSimulation();
    if (selNode) {
      const n = ctx.graph.nodes.find(n => n.id === selNode);
      if (n) {
        n.label = nName.value.trim() || n.id;
        n.note = nNote.value.trim();
        // tags 由 pills 直接管理，不需要从 textarea 读取
        n.color = nCol.value;
        n.mediaType = nMediaType.value || null;
        n.mediaUrl = nMediaUrl.value || null;
        n.radiusMode = radModeSelect.value as 'level' | 'custom';
        if (radModeSelect.value === 'level') {
          n.headingLevel = parseInt(radLevelSlider.value);
          n.radius = undefined; // 级别模式不存硬编码半径，由 draw 循环动态计算
        } else {
          n.radius = +nRad.value || 9;
          n.headingLevel = undefined;
        }
        // 同步到模拟器中的克隆节点（不重启模拟）
        if (sim) {
          const sn = sim.nodes().find((sn: any) => sn.id === selNode);
          if (sn) { sn.label = n.label; sn.note = n.note; sn.tags = n.tags; sn.color = n.color; sn.radius = n.radius; sn.radiusMode = n.radiusMode; sn.headingLevel = n.headingLevel; }
        }
        // 同步到其他持有同文件的窗格模拟节点
        ctx.syncGraphToOtherPanes?.();
      }
    } else if (selEdge !== null) {
      const e = ctx.graph.edges[selEdge];
      if (e) {
        e.label = eLabel.value.trim();
        e.color = eCol.value;
        e.arrow = eArrChk.checked;
        e.lineStyle = eStyle.value;
        // 线型改变后立即更新模拟链接力（虚线不参与力学）
        ctx.updateLinkForce?.();
      }
    } else if (selGroup) {
      const g = ctx.graph.groups.find(g => g.id === selGroup);
      if (g) {
        g.displayMode = gMode.value as any;
        g.color = gCol.value;
        g.borderColor = gBCol.value;
        g.opacity = +gOp.value;
        g.nodeColorMode = groupNodeColorMode.value as 'off' | 'fill' | 'edge';
        g.nodeColor = groupNodeColor.value;
        g.fluidRadius = parseFloat(fluidRadiusSlider.value) || 8;
        g.fluidOpacity = parseFloat(fluidOpacitySlider.value) || 0.4;
      }
      // 集合数据不经过模拟，需手动触发重绘
      draw();
      // 同步到其他窗格（集合颜色/模式可能影响节点着色）
      ctx.syncGraphToOtherPanes?.();
    }
    ctx.triggerSave();
    ctx.draw();
  };

  let _autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  const debouncedSave = () => {
    if (_autoSaveTimer) clearTimeout(_autoSaveTimer);
    _autoSaveTimer = setTimeout(() => { saveCurrent(); }, 150);
  };
  const bindAutoSave = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) => {
    el.addEventListener('blur', debouncedSave);
    el.addEventListener('change', debouncedSave);
  };

  let nameEdit: { nodeId: string; undoSaved: boolean } | null = null;
  const commitNameEdit = () => {
    nameEdit = null;
  };
  const syncNodeName = () => {
    const selectedNodeId = getSelNode();
    if (selectedNodeId === null) return;
    const node = ctx.graph.nodes.find(n => n.id === selectedNodeId);
    if (!node) return;
    let currentNameEdit = nameEdit;
    if (!currentNameEdit || currentNameEdit.nodeId !== selectedNodeId) {
      commitNameEdit();
      currentNameEdit = { nodeId: selectedNodeId, undoSaved: false };
      nameEdit = currentNameEdit;
    }
    const label = nName.value.trim() || node.id;
    if (label === node.label) return;
    if (!currentNameEdit.undoSaved) {
      ctx.saveUndo?.();
      currentNameEdit.undoSaved = true;
    }
    node.label = label;
    const simNode = getSimulation()?.nodes().find((candidate: any) => candidate.id === selectedNodeId);
    if (simNode) simNode.label = label;
    ctx.triggerSave();
    if (ctx.scheduleNameRender) ctx.scheduleNameRender();
    else { ctx.syncGraphToOtherPanes?.(); ctx.draw(); }
  };

  // --- 颜色预设块 ---
  const makeColorPresets = (picker: HTMLInputElement): HTMLElement => {
    const pre = el("div", { style: "display:flex;gap:3px;align-items:center;flex-wrap:wrap;" });
    // 把原生 color input 换成方形色块
    picker.style.display = 'none';
    const swatch = el("div", { style: `width:20px;height:20px;background:${picker.value};border-radius:${V('--fg-radius-sm','6px')};cursor:pointer;border:1px solid ${V('--fg-glass-border','rgba(255,255,255,0.08)')};` });
    swatch.onclick = () => picker.click();
    picker.addEventListener('input', () => { swatch.style.background = picker.value; });
    pre.appendChild(swatch);
    colors.forEach(c => {
      const s = el("div", { style: `width:20px;height:20px;background:${c};border-radius:${V('--fg-radius-sm','6px')};cursor:pointer;border:1px solid ${V('--fg-glass-border','rgba(255,255,255,0.08)')};` });
      s.onclick = () => { picker.value = c; swatch.style.background = c; saveCurrent(); };
      pre.appendChild(s);
    });
    return pre;
  };

  // --- 节点编辑区 ---
  const nodeEdit = el("div");
  const nodeTitleRow = el("div", { style: "display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;" });
  nodeTitleRow.appendChild(el("div", { text: "节点", style: "font-weight:bold;" }));
  const nodeDelBtn = el("button", { text: '删除', style: `background:${V('--fg-danger','#e03030')};color:white;font-size:${V('--fg-font-xs','0.72em')};padding:1px 8px;` });
  nodeDelBtn.onclick = async () => {
    if (getSelNode()) { const id = getSelNode()!; const node = ctx.graph.nodes.find(n => n.id === id); const nodeTags = node?.tags || []; detachNodeFromStructure(ctx.graph, id); ctx.markNodesDying?.([id]); const idx = ctx.graph.nodes.findIndex(n => n.id === id); if (idx >= 0) ctx.graph.nodes.splice(idx, 1); for (const e of ctx.graph.edges) { const esrc = typeof e.source === 'object' ? e.source.id : e.source; const etgt = typeof e.target === 'object' ? e.target.id : e.target; if (esrc === id || etgt === id) (e as any)._dyingAt = performance.now(); } for (const t of nodeTags) { if (!ctx.graph.nodes.some(nd => (nd.tags || []).includes(t))) { const gIdx = ctx.graph.groups.findIndex(g => g.label === t); if (gIdx >= 0) ctx.graph.groups.splice(gIdx, 1); } } }
    ctx.reinitializeGraph?.(); await getSaveData()(); clearEd(); getUpdateInfo()(); getUpdateSelects()(); draw();
    setTimeout(() => { for (let i = ctx.graph.edges.length - 1; i >= 0; i--) { const e2: any = ctx.graph.edges[i]; if (e2._dyingAt && performance.now() - e2._dyingAt >= 400) ctx.graph.edges.splice(i, 1); } draw(); }, 400);
  };
  nodeTitleRow.appendChild(nodeDelBtn);
  nodeEdit.appendChild(nodeTitleRow);
  const nName = el("input", { type: "text", style: "width:100%;" }) as HTMLInputElement;
  nName.addEventListener('focus', () => {
    const selectedNodeId = getSelNode();
    if (selectedNodeId === null) return;
    const node = ctx.graph.nodes.find(n => n.id === selectedNodeId);
    if (node) nameEdit = { nodeId: selectedNodeId, undoSaved: false };
  });
  nName.addEventListener('input', syncNodeName);
  nName.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); nName.blur(); } });
  nName.addEventListener('blur', commitNameEdit);
  makeRow(nodeEdit, '名称', nName);
  const nNote = el("textarea", { attrs: { rows: "2" }, style: `width:100%;resize:vertical;font-size:${V('--fg-font-md', '0.85em')};` }) as HTMLTextAreaElement;
  nNote.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { nNote.blur(); } });
  makeRow(nodeEdit, '内容', nNote);
  bindAutoSave(nNote);
  // 标签 pill 编辑器
  const nTagsContainer = el("div", { style: "display:flex;gap:4px;flex-wrap:wrap;align-items:center;flex:1;" });
  makeRow(nodeEdit, '标签', nTagsContainer);
  const nTagsPills: HTMLElement[] = [];
  const refreshTagPills = () => {
    nTagsPills.length = 0;
    nTagsContainer.innerHTML = '';
    // 从已保存的 node 中读取
    const selNode = getSelNode();
    const n = selNode ? ctx.graph.nodes.find(n => n.id === selNode) : null;
    const tags: string[] = n ? (n.tags || []) : [];
    for (const t of tags) {
      const pill = el("span", { text: t, style: `font-size:${V('--fg-font-xs', '0.72em')};padding:1px 6px;border-radius:${V('--fg-radius-sm','6px')};border:1px solid rgba(255,255,255,0.2);white-space:nowrap;display:inline-flex;align-items:center;gap:3px;cursor:pointer;` });
      pill.title = '点击编辑集合';
      pill.onclick = () => {
        let g = ctx.graph.groups.find(g => g.label === t);
        if (!g) {
          g = { id: 'g_' + Date.now(), label: t, displayMode: 'rect', color: '#5B8FF9', borderColor: '#3A6FD8', opacity: 0.15, nodeColorMode: 'off' as const, nodeColor: '#5B8FF9' };
          ctx.graph.groups.push(g);
          triggerSave();
        }
        fillGroup(g.id);
      };
      const x = el("span", { text: '\u2715', style: `margin-left:1px;width:14px;height:14px;display:inline-flex;align-items:center;justify-content:center;border-radius:${V('--fg-radius-sm','6px')};font-size:${V('--fg-font-xxs', '0.65em')};color:rgba(255,255,255,0.45);cursor:pointer;transition:all 0.15s ease;` });
      x.onmouseenter = () => { x.style.background = `var(--fg-accent,#5B8FF9)`; x.style.color = '#fff'; };
      x.onmouseleave = () => { x.style.background = 'transparent'; x.style.color = 'rgba(255,255,255,0.45)'; };
      x.onclick = (e: Event) => {
        e.stopPropagation();
        const idx = tags.indexOf(t);
        if (idx >= 0) tags.splice(idx, 1);
        (n as any).tags = tags;
        // 若无其他节点使用此标签，删除对应集合
        if (!ctx.graph.nodes.some(nd => (nd.tags || []).includes(t))) {
          const gIdx = ctx.graph.groups.findIndex(g => g.label === t);
          if (gIdx >= 0) ctx.graph.groups.splice(gIdx, 1);
        }
        triggerSave(); draw();
        refreshTagPills();
      };
      pill.appendChild(x);
      nTagsContainer.appendChild(pill);
      (pill as any)._tag = t;
      nTagsPills.push(pill);
    }
    // + 按钮
    const addTagBtn = el("span", { text: '+', style: `font-size:${V('--fg-font-xs', '0.72em')};padding:0 4px;cursor:pointer;border-radius:${V('--fg-radius-sm','6px')};border:1px solid rgba(255,255,255,0.15);` });
    addTagBtn.onclick = async () => {
      const tn = await safePrompt('输入标签名：');
      if (!tn) return;
      const nn = ctx.graph.nodes.find(n => n.id === getSelNode());
      if (nn) { if (!nn.tags) nn.tags = []; if (!nn.tags.includes(tn)) nn.tags.push(tn); triggerSave(); draw(); }
      refreshTagPills();
    };
    nTagsContainer.appendChild(addTagBtn);
  };
  // 媒体类型
  const nMediaType = el("select") as HTMLSelectElement;
  ['无', '图片', '音频', '视频', '文档'].forEach((t, i) => { const o = el("option", { text: t, attrs: { value: ['', 'image', 'audio', 'video', 'md'][i] } }); nMediaType.appendChild(o); });
  nMediaType.addEventListener('change', () => {
    if (nMediaType.value === 'md') { nMediaUrl.rows = 4; nMediaUrl.style.resize = 'vertical'; nMediaUrl.style.overflowY = 'auto'; }
    else { nMediaUrl.rows = 1; nMediaUrl.style.resize = 'none'; nMediaUrl.style.overflowY = 'hidden'; }
  });
  const nMediaRow = el("div", { style: "display:flex;gap:4px;align-items:center;margin-top:2px;" });
  // 导入按钮（放在最前面）
  const nFileBtn = el("button", { text: '+', style: `font-size:${V('--fg-font-md', '0.85em')};padding:1px 5px;cursor:pointer;border-radius:${V('--fg-radius-sm','6px')};border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.08);color:#ccc;` }) as HTMLButtonElement;
  nFileBtn.title = '导入本地文件';
  nMediaRow.appendChild(el("span", { text: '媒体', style: `flex-shrink:0;font-size:${V('--fg-font-md', '0.85em')};` }));
  nMediaRow.appendChild(nMediaType);
  nFileBtn.onclick = async () => {
    const inp = document.createElement('input'); inp.type = 'file';
    inp.onchange = () => {
      const f = inp.files?.[0]; if (!f) return;
      nMediaUrl.value = f.name;
      if (/\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i.test(f.name)) nMediaType.value = 'image';
      else if (/\.(mp3|wav|ogg|flac|aac|m4a)$/i.test(f.name)) nMediaType.value = 'audio';
      else if (/\.(mp4|webm|mov|avi|mkv)$/i.test(f.name)) nMediaType.value = 'video';
      else nMediaType.value = 'md';
      saveCurrent();
    };
    inp.click();
  };
  nMediaRow.appendChild(nFileBtn);
  const nMediaUrl = el("textarea", { attrs: { rows: "1" }, style: `flex:1;min-width:0;font-size:${V('--fg-font-sm', '0.8em')};resize:none;overflow-y:hidden;`, placeholder: "URL" }) as HTMLTextAreaElement;
  nMediaUrl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); nMediaUrl.blur(); } });
  bindAutoSave(nMediaUrl as any);
  nMediaUrl.addEventListener('input', () => {
    const v = nMediaUrl.value;
    if (v.startsWith('blob:')) {
      if (/\.(png|jpg|jpeg|gif|webp|svg|bmp)/i.test(v)) nMediaType.value = 'image';
      else if (/\.(mp4|webm|mov|avi|mkv)/i.test(v)) nMediaType.value = 'video';
      else if (/\.(mp3|wav|ogg|flac|aac|m4a)/i.test(v)) nMediaType.value = 'audio';
    } else if (/bilibili|youtube|youtu\.be/i.test(v)) {
      nMediaType.value = 'video';
    } else if (/\.(png|jpg|jpeg|gif|webp|svg|bmp)(\?|$|#)/i.test(v)) {
      nMediaType.value = 'image';
    } else if (/\.(mp3|wav|ogg|flac|aac|m4a)(\?|$|#)/i.test(v)) {
      nMediaType.value = 'audio';
    } else if (/\.(mp4|webm|mov|avi|mkv)(\?|$|#)/i.test(v)) {
      nMediaType.value = 'video';
    }
  });
  nMediaRow.appendChild(nMediaUrl);
  nodeEdit.appendChild(nMediaRow);
  const nColR = el("div", { style: "display:flex;gap:6px;align-items:center;margin:4px 0;" });
  nColR.appendChild(el("span", { text: '颜色', style: `flex-shrink:0;font-size:${V('--fg-font-lg', '0.92em')};` }));
  const nCol = el("input", { type: "color", style: "width:24px;height:24px;padding:0;border:none;" }) as HTMLInputElement;
  nColR.appendChild(nCol);
  bindAutoSave(nCol);
  nColR.appendChild(makeColorPresets(nCol));
  nodeEdit.appendChild(nColR);

  // 半径
  const radModeRow = el("div", { style: "display:flex;gap:4px;align-items:center;margin-top:4px;" });
  const radModeSelect = el("select", { style: "width:60px;" }) as HTMLSelectElement;
  radModeSelect.appendChild(el("option", { text: '级', attrs: { value: "level" } }));
  radModeSelect.appendChild(el("option", { text: '自定', attrs: { value: "custom" } }));
  radModeRow.appendChild(radModeSelect);

  const radLevelRow = el("div", { style: "display:flex;gap:2px;align-items:center;" });
  const radLevelSlider = el("input", { type: "range", attrs: { min: "1", max: "6", step: "1", value: "6" }, style: "width:70px;" }) as HTMLInputElement;
  radLevelRow.appendChild(radLevelSlider);
  const radLevelValue = el("span", { text: '6', style: `font-size:${V('--fg-font-lg', '0.92em')};margin-left:2px;` });
  radLevelRow.appendChild(radLevelValue);

  const radCustomRow = el("div", { style: "display:none;gap:2px;align-items:center;" });
  const nRad = el("input", { type: "number", attrs: { min: "5", max: "45" }, style: "width:60px;" }) as HTMLInputElement;
  radCustomRow.appendChild(nRad);
  radCustomRow.appendChild(el("span", { text: 'px', style: `font-size:${V('--fg-font-lg', '0.92em')};` }));

  radLevelSlider.addEventListener('input', () => {
    radLevelValue.textContent = radLevelSlider.value;
    const r = [22, 19, 16, 13, 10, 7][parseInt(radLevelSlider.value) - 1] || 9;
    nRad.value = String(r);
    saveCurrent();
  });

  radModeSelect.addEventListener('change', () => {
    if (radModeSelect.value === 'level') {
      radLevelRow.style.display = 'flex';
      radCustomRow.style.display = 'none';
      radLevelSlider.dispatchEvent(new Event('input'));
    } else {
      radLevelRow.style.display = 'none';
      radCustomRow.style.display = 'flex';
    }
    saveCurrent();
  });

  bindAutoSave(nRad);
  const radContainer = el("div");
  radContainer.appendChild(radModeRow);
  radContainer.appendChild(radLevelRow);
  radContainer.appendChild(radCustomRow);
  makeRow(nodeEdit, '半径', radContainer);

  // --- 边编辑区 ---
  const edgeEdit = el("div"); edgeEdit.style.display = 'none';
  const edgeTitleRow = el("div", { style: "display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;" });
  edgeTitleRow.appendChild(el("div", { text: "边", style: "font-weight:bold;" }));
  const edgeDelBtn = el("button", { text: '删除', style: `background:${V('--fg-danger','#e03030')};color:white;font-size:${V('--fg-font-xs','0.72em')};padding:1px 8px;` });
  edgeDelBtn.onclick = async () => {
    if (getSelEdge() !== null) { const e2 = ctx.graph.edges[getSelEdge()!]; if (e2) (e2 as any)._dyingAt = performance.now(); clearEd(); draw(); setTimeout(() => { for (let i = ctx.graph.edges.length - 1; i >= 0; i--) { const e3: any = ctx.graph.edges[i]; if (e3._dyingAt && performance.now() - e3._dyingAt >= 400) ctx.graph.edges.splice(i, 1); } draw(); }, 400); }
    await getSaveData()(); getUpdateInfo()(); getUpdateSelects()(); draw();
  };
  edgeTitleRow.appendChild(edgeDelBtn);
  edgeEdit.appendChild(edgeTitleRow);
  const eIdSpan = el("div", { style: `font-size:${V('--fg-font-lg', '0.92em')};color:${V('--fg-text-muted','#888888')};` });
  edgeEdit.appendChild(eIdSpan);
  const eLabel = el("input", { type: "text", style: "width:100%;" }) as HTMLInputElement;
  eLabel.addEventListener('keydown', (e) => { if (e.key === 'Enter') { eLabel.blur(); } });
  makeRow(edgeEdit, '关系', eLabel);
  bindAutoSave(eLabel);
  const eColR = el("div", { style: "display:flex;gap:6px;align-items:center;margin:4px 0;" });
  eColR.appendChild(el("span", { text: '颜色', style: `flex-shrink:0;font-size:${V('--fg-font-lg', '0.92em')};` }));
  const eCol = el("input", { type: "color", style: "width:24px;height:24px;padding:0;border:none;" }) as HTMLInputElement;
  eColR.appendChild(eCol);
  bindAutoSave(eCol);
  eColR.appendChild(makeColorPresets(eCol));
  edgeEdit.appendChild(eColR);
  const eArrR = el("div", { style: "display:flex;gap:8px;align-items:center;" });
  eArrR.appendChild(el("span", { text: '箭头' }));
  const eArrChk = el("input", { type: "checkbox" }) as HTMLInputElement;
  eArrR.appendChild(eArrChk);
  eArrChk.addEventListener('change', saveCurrent);
  const swapBtn = el("button", { text: '交换方向' });
  eArrR.appendChild(swapBtn);
  edgeEdit.appendChild(eArrR);

  // 连线样式
  const eStyleR = el("div", { style: "display:flex;gap:6px;align-items:center;margin-top:4px;" });
  eStyleR.appendChild(el("span", { text: '线型', style: `flex-shrink:0;font-size:${V('--fg-font-lg', '0.92em')};` }));
  const eStyle = el("select") as HTMLSelectElement;
  ['solid', 'dash-2', 'dash-4', 'dash-8', 'dot', 'dot-dense'].forEach(s => {
    const o = el("option", { text: { solid: '实线', 'dash-2': '虚线 2px', 'dash-4': '虚线 4px', 'dash-8': '虚线 8px', dot: '点线', 'dot-dense': '密点线' }[s], attrs: { value: s } });
    eStyle.appendChild(o);
  });
  eStyle.addEventListener('change', saveCurrent);
  eStyleR.appendChild(eStyle);
  edgeEdit.appendChild(eStyleR);

  // --- 集合编辑区 ---
  const groupEdit = el("div"); groupEdit.style.display = 'none';
  const groupTitleRow = el("div", { style: "display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;" });
  groupTitleRow.appendChild(el("div", { text: "集合", style: "font-weight:bold;" }));
  const groupDelBtn = el("button", { text: '删除', style: `background:${V('--fg-danger','#e03030')};color:white;font-size:${V('--fg-font-xs','0.72em')};padding:1px 8px;` });
  groupDelBtn.onclick = async () => {
    if (getSelGroup()) { const gIdx = ctx.graph.groups.findIndex(g => g.id === getSelGroup()); if (gIdx >= 0) ctx.graph.groups.splice(gIdx, 1); getInitSim()(); }
    await getSaveData()(); clearEd(); getUpdateInfo()(); getUpdateSelects()(); draw();
  };
  groupTitleRow.appendChild(groupDelBtn);
  groupEdit.appendChild(groupTitleRow);
  const gIdSpan = el("div", { style: `font-size:${V('--fg-font-lg', '0.92em')};color:${V('--fg-text-muted','#888888')};` });
  groupEdit.appendChild(gIdSpan);
  const gLabel = el("input", { type: "text", attrs: { readonly: "true" }, style: "width:100%;" }) as HTMLInputElement;
  makeRow(groupEdit, '标签', gLabel);
  const gMode = el("select", { style: "width:100%;" }) as HTMLSelectElement;
  gMode.appendChild(el("option", { text: '不显示', attrs: { value: "none" } }));
  gMode.appendChild(el("option", { text: '矩形', attrs: { value: "rect" } }));
  gMode.appendChild(el("option", { text: '多边形', attrs: { value: "polygon" } }));
  gMode.appendChild(el("option", { text: '圆', attrs: { value: "fluid" } }));
  gMode.appendChild(el("option", { text: '流体', attrs: { value: "blob" } }));
  makeRow(groupEdit, '显示', gMode);
  bindAutoSave(gMode);
  const gHint = el("div", { style: `font-size:${V('--fg-font-sm', '0.8em')};color:${V('--fg-text-muted','#888888')};display:none;` });
  groupEdit.appendChild(gHint);

  // 外观选项（折叠）
  const appearDetails = el("details", { style: "margin-top:4px;" }) as HTMLDetailsElement;
  const appearSummary = el("summary", { text: "外观选项", style: `font-size:${V('--fg-font-sm', '0.8em')};cursor:pointer;opacity:0.6;` });
  appearDetails.appendChild(appearSummary);

  // 成员着色
  const gColorModeRow = el("div");
  gColorModeRow.appendChild(el("span", { text: "成员着色", style: `font-size:${V('--fg-font-sm', '0.8em')};margin-right:4px;` }));
  const groupNodeColorMode = el("select", { style: "width:60px;" }) as HTMLSelectElement;
  groupNodeColorMode.appendChild(el("option", { text: "关闭", attrs: { value: "off" } }));
  groupNodeColorMode.appendChild(el("option", { text: "开启", attrs: { value: "fill" } }));
  groupNodeColorMode.appendChild(el("option", { text: "边缘", attrs: { value: "edge" } }));
  gColorModeRow.appendChild(groupNodeColorMode);
  appearDetails.appendChild(gColorModeRow);
  bindAutoSave(groupNodeColorMode);

  const gNodeColorPickerRow = el("div");
  gNodeColorPickerRow.appendChild(el("span", { text: "颜色", style: `font-size:${V('--fg-font-sm', '0.8em')};margin-right:4px;` }));
  const groupNodeColor = el("input", { type: "color", style: "width:24px;height:24px;padding:0;border:none;" }) as HTMLInputElement;
  gNodeColorPickerRow.appendChild(groupNodeColor);
  appearDetails.appendChild(gNodeColorPickerRow);
  bindAutoSave(groupNodeColor);

  // 圆参数
  const fluidRadiusRow = el("div", { style: "display:none;margin-top:4px;" });
  fluidRadiusRow.appendChild(el("span", { text: "半径", style: `font-size:${V('--fg-font-sm', '0.8em')};margin-right:4px;` }));
  const fluidRadiusSlider = el("input", { type: "range", attrs: { min: "1", max: "20", step: "1", value: "8" }, style: "width:80px;" }) as HTMLInputElement;
  fluidRadiusRow.appendChild(fluidRadiusSlider);
  const fluidRadiusValue = el("span", { text: '8', style: `font-size:${V('--fg-font-sm', '0.8em')};margin-left:4px;` });
  fluidRadiusRow.appendChild(fluidRadiusValue);
  fluidRadiusSlider.addEventListener('input', () => {
    fluidRadiusValue.textContent = fluidRadiusSlider.value;
    saveCurrent();
  });
  appearDetails.appendChild(fluidRadiusRow);

  const fluidOpacityRow = el("div", { style: "display:none;margin-top:4px;" });
  fluidOpacityRow.appendChild(el("span", { text: "不透明度", style: `font-size:${V('--fg-font-sm', '0.8em')};margin-right:4px;` }));
  const fluidOpacitySlider = el("input", { type: "range", attrs: { min: "0.1", max: "1", step: "0.05", value: "0.4" }, style: "width:80px;" }) as HTMLInputElement;
  fluidOpacityRow.appendChild(fluidOpacitySlider);
  const fluidOpacityValue = el("span", { text: '0.4', style: `font-size:${V('--fg-font-sm', '0.8em')};margin-left:4px;` });
  fluidOpacityRow.appendChild(fluidOpacityValue);
  fluidOpacitySlider.addEventListener('input', () => {
    fluidOpacityValue.textContent = fluidOpacitySlider.value;
    saveCurrent();
  });
  appearDetails.appendChild(fluidOpacityRow);

  gMode.addEventListener('change', () => {
    const show = gMode.value === 'fluid';
    fluidRadiusRow.style.display = show ? 'block' : 'none';
    fluidOpacityRow.style.display = show ? 'block' : 'none';
  });

  // 背景色
  const gColR = el("div", { style: "display:flex;gap:6px;align-items:center;margin:4px 0;" });
  gColR.appendChild(el("span", { text: '背景色:', style: `flex-shrink:0;font-size:${V('--fg-font-sm', '0.8em')};` }));
  const gCol = el("input", { type: "color", style: "width:24px;height:24px;padding:0;border:none;" }) as HTMLInputElement;
  gColR.appendChild(gCol);
  bindAutoSave(gCol);
  gColR.appendChild(makeColorPresets(gCol));
  appearDetails.appendChild(gColR);

  const gBColR = el("div", { style: "display:flex;gap:6px;align-items:center;margin:4px 0;" });
  gBColR.appendChild(el("span", { text: '边框色:', style: `flex-shrink:0;font-size:${V('--fg-font-sm', '0.8em')};` }));
  const gBCol = el("input", { type: "color", style: "width:24px;height:24px;padding:0;border:none;" }) as HTMLInputElement;
  gBColR.appendChild(gBCol);
  bindAutoSave(gBCol);
  appearDetails.appendChild(gBColR);

  const gOp = el("input", { type: "range", attrs: { min: "0", max: "1", step: "0.05", value: "0.15" }, style: "width:100%;" }) as HTMLInputElement;
  const gOpRow = el("div", { style: "display:flex;gap:6px;align-items:center;margin:2px 0;" });
  gOpRow.appendChild(el("span", { text: "透明度:", style: `font-size:${V('--fg-font-sm', '0.8em')};margin-right:4px;` }));
  gOpRow.appendChild(gOp);
  appearDetails.appendChild(gOpRow);
  bindAutoSave(gOp);

  groupEdit.appendChild(appearDetails);

  groupEdit.appendChild(el("div", { text: '成员' }));
  const gMems = el("div", { style: `max-height:100px;overflow-y:auto;border:1px solid #ccc;padding:4px;border-radius:${V('--fg-radius-sm','6px')};font-size:${V('--fg-font-sm', '0.8em')};` });
  groupEdit.appendChild(gMems);

  // 组装
  editPanel.appendChild(nodeEdit);
  editPanel.appendChild(edgeEdit);
  editPanel.appendChild(groupEdit);
  gCont.appendChild(editPanel);

  // --- 折叠/展开实现（后于 nodeEdit/edgeEdit/groupEdit 定义）---
  enterCollapse = () => {
    if (collapsed) return;
    const r = editPanel.getBoundingClientRect();
    preCollapseW = r.width; preCollapseH = r.height;
    preCollapseT = editPanel.style.top || r.top + 'px';
    collapsed = true;
    nodeEdit.style.display = 'none'; edgeEdit.style.display = 'none'; groupEdit.style.display = 'none';
    titleBar.style.display = 'none'; resizeHandle.style.display = 'none';
    // 贴右，保持当前纵向位置
    editPanel.style.right = '10px';
    editPanel.style.left = 'auto';
    editPanel.style.width = COLLAPSE_BOX + 'px';
    editPanel.style.height = COLLAPSE_BOX + 'px';
    editPanel.style.maxWidth = COLLAPSE_BOX + 'px';
    editPanel.style.minWidth = '';
    editPanel.style.overflowY = 'hidden';
    collapsedHandle.style.display = 'flex';
    savePanelState();
  };

  exitCollapse = () => {
    if (!collapsed) return;
    collapsed = false;
    titleBar.style.display = ''; resizeHandle.style.display = '';
    collapsedHandle.style.display = 'none';
    // 展开到初始默认大小/位置
    editPanel.style.width = ''; editPanel.style.height = '';
    editPanel.style.right = '10px'; editPanel.style.top = '112px'; editPanel.style.left = '';
    editPanel.style.maxWidth = '500px';
    editPanel.style.overflowY = 'auto';
    const selNode = getSelNode(), selEdge = getSelEdge(), selGroup = getSelGroup();
    nodeEdit.style.display = selNode ? 'block' : 'none';
    edgeEdit.style.display = selEdge !== null ? 'block' : 'none';
    groupEdit.style.display = selGroup ? 'block' : 'none';
    savePanelState();
  };

  // 单击折叠小方框 → 展开（拖拽过则跳过）
  collapsedHandle.addEventListener("click", (e) => {
    e.preventDefault(); e.stopPropagation();
    if (collapsedWasDragged) { collapsedWasDragged = false; return; }
    exitCollapse();
  });

  // 延迟恢复折叠状态（nodeEdit 等此时已存在）
  if (_restoreCollapsed) { enterCollapse(); }

  // --- fill 函数 ---
  const showSection = (s: 'node' | 'edge' | 'group') => {
    nodeEdit.style.display = s === 'node' ? 'block' : 'none';
    edgeEdit.style.display = s === 'edge' ? 'block' : 'none';
    groupEdit.style.display = s === 'group' ? 'block' : 'none';
  };
  const fillNode = (id: string) => {
    commitNameEdit();
    const n = ctx.graph.nodes.find(n => n.id === id); if (!n) { clearEd(); return; }
    showSection('node');
    setSelNode(id); setSelEdge(null); setSelGroup(null);
    nName.value = n.label || ''; nNote.value = n.note || '';
    refreshTagPills(); nCol.value = n.color || '#000000';
    nMediaType.value = n.mediaType || ''; nMediaUrl.value = n.mediaUrl || '';
    nRad.value = n.radius ? String(n.radius) : '9';
    radModeSelect.value = n.radiusMode || 'level';
    if ((n.radiusMode || 'level') === 'level') {
      const level = n.headingLevel || 6;
      const clamped = Math.min(6, Math.max(1, level));
      radLevelSlider.value = String(clamped);
      radLevelValue.textContent = String(clamped);
      nRad.value = String([22, 19, 16, 13, 10, 7][clamped - 1] || 9);
      radLevelRow.style.display = 'flex';
      radCustomRow.style.display = 'none';
    } else {
      radLevelRow.style.display = 'none';
      radCustomRow.style.display = 'flex';
    }
    showPanel();
    // 只有默认名称"新节点"时才自动聚焦输入框（方便快速命名）
    if (!n.label || n.label === '新节点' || n.label === '子节点') {
      setTimeout(() => { nName.focus(); nName.select(); }, 30);
    }
    draw();
  };
  const fillEdge = (idx: number) => {
    const e = ctx.graph.edges[idx]; if (!e) { clearEd(); return; }
    showSection('edge');
    setSelEdge(idx); setSelNode(null); setSelGroup(null);
    const s = ctx.graph.nodes.find(n => n.id === (typeof e.source === 'object' ? e.source.id : e.source)), t = ctx.graph.nodes.find(n => n.id === (typeof e.target === 'object' ? e.target.id : e.target));
    eIdSpan.textContent = `${s?.label || (typeof e.source === 'object' ? e.source.id : e.source)} → ${t?.label || (typeof e.target === 'object' ? e.target.id : e.target)}`;
    eLabel.value = e.label || ''; eCol.value = e.color || '#BFBFBF'; eArrChk.checked = e.arrow || false;
    eStyle.value = e.lineStyle || 'solid';
    showPanel(); draw();
  };
  const fillGroup = (id: string) => {
    const g = ctx.graph.groups.find(g => g.id === id); if (!g) { clearEd(); return; }
    showSection('group');
    setSelGroup(id); setSelNode(null); setSelEdge(null);
    gIdSpan.textContent = `ID: ${g.id}`; gLabel.value = g.label; gMode.value = g.displayMode || 'none';
    gHint.style.display = g.displayMode === 'none' ? 'block' : 'none';
    gHint.textContent = '⚠️ 当前未显示，修改颜色将自动切换为矩形';
    gCol.value = g.color || '#5B8FF9'; gBCol.value = g.borderColor || darken(g.color || '#5B8FF9', 0.2);
    gOp.value = String(g.opacity ?? 0.15);
    groupNodeColorMode.value = g.nodeColorMode || 'off';
    groupNodeColor.value = g.nodeColor || g.color || '#5B8FF9';
    fluidRadiusSlider.value = String(g.fluidRadius || 8);
    fluidRadiusValue.textContent = fluidRadiusSlider.value;
    fluidOpacitySlider.value = String(g.fluidOpacity ?? 0.4);
    fluidOpacityValue.textContent = fluidOpacitySlider.value;
    fluidRadiusRow.style.display = g.displayMode === 'fluid' ? 'block' : 'none';
    fluidOpacityRow.style.display = g.displayMode === 'fluid' ? 'block' : 'none';

    gMems.innerHTML = '';
    const members = ctx.graph.nodes.filter(n => (n.tags || []).includes(g.label));
    members.forEach(n => {
      const it = el("div"); it.textContent = n.label || n.id; it.style.cursor = 'pointer';
      it.onclick = () => { fillNode(n.id); showPanel(); };
      gMems.appendChild(it);
    });
    if (members.length === 0) gMems.appendChild(el("div", { text: '(无成员)' }));
    showPanel(); draw();
  };
  const clearEd = () => {
    commitNameEdit();
    setSelNode(null); setSelEdge(null); setSelGroup(null);
    nTagsContainer.innerHTML = '';
    if (ctx.clearLinkMode) ctx.clearLinkMode();
    else { setLinkMode(false); setLinkSrc(null); }
    draw();
    if (editPanel.style.display !== 'none') editPanel.style.display = 'none';
  };

  swapBtn.onclick = () => {
    if (getSelEdge() === null) return; const e = ctx.graph.edges[getSelEdge()!];
    [e.source, e.target] = [e.target, e.source]; fillEdge(getSelEdge()!); getInitSim()(); getSaveData()();
  };

  const updateOpacity = (val: number) => {
    editPanel.style.opacity = String(val);
  };

  return { editPanel, fillNode, fillEdge, fillGroup, clearEd, updateOpacity, saveCurrent, cleanupDragListeners };
}
