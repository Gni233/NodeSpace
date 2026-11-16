import { darken, GRAPH_EDITOR_COLORS, getExplicitGraphColor, setGraphColorOverride } from "./utils/color";
import { GraphData } from "./data/storage";
import { safePrompt } from './dialog';
import {Z_EDIT_PANEL, V } from "./layout-constants";
import { isStructureNode, syncStructureCollections } from './structure-nodes';
import { effectiveNodeTags, groupMembers, isStructureCollection } from './group-membership';
import { getConfiguredNodeRadius, hasCustomNodeRadius } from './node-radius';
import { createInspectorRevealCoordinator } from './canvas-reveal';
import { readBrowserMediaSources, releaseMediaSources, MEDIA_FILE_ACCEPT } from './media-import';
import { isStoredAttachment } from './media-assets';
import { createGroupId } from './node-order';
import './inspector-design.css';

export type StructureReflectionField = 'purpose' | 'summary';

export type NodeTextField = 'label' | 'note';

export interface NodeTextEditorContext {
  getGraph: () => GraphData;
  getSelectedNode: () => any | null;
  canMutate?: () => boolean;
  saveUndo?: () => void;
  onChange: (node: any, field: NodeTextField) => void;
}

/** One focused text edit belongs to an exact graph and node, even across undo. */
export function createNodeTextEditor(ctx: NodeTextEditorContext) {
  let edit: { graph: GraphData; node: any; field: NodeTextField; undoSaved: boolean } | null = null;
  const begin = (field: NodeTextField) => {
    const graph = ctx.getGraph(), node = ctx.getSelectedNode();
    edit = node && ctx.canMutate?.() !== false && graph.nodes.includes(node)
      ? { graph, node, field, undoSaved: false }
      : null;
  };
  const update = (field: NodeTextField, value: string): boolean => {
    if (!edit || edit.field !== field) return false;
    if (ctx.canMutate?.() === false || ctx.getGraph() !== edit.graph
      || ctx.getSelectedNode() !== edit.node || !edit.graph.nodes.includes(edit.node)) {
      edit = null;
      return false;
    }
    const next = field === 'label' ? value.trim() || edit.node.id : value;
    if (String(edit.node[field] || '') === next) return false;
    if (!edit.undoSaved) { ctx.saveUndo?.(); edit.undoSaved = true; }
    edit.node[field] = next;
    ctx.onChange(edit.node, field);
    return true;
  };
  const end = () => { edit = null; };
  return { begin, update, end };
}

/** Keep IME confirmation separate from commands; notes use Enter for a newline. */
export function bindNodeTextInput(
  input: HTMLInputElement | HTMLTextAreaElement,
  field: NodeTextField,
  editor: ReturnType<typeof createNodeTextEditor>,
) {
  let composing = false;
  const update = () => { if (!composing) editor.update(field, input.value); };
  input.addEventListener('focus', () => { composing = false; editor.begin(field); });
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; update(); });
  input.addEventListener('input', update);
  input.addEventListener('keydown', (event) => {
    const key = event as KeyboardEvent;
    if (key.key === 'Enter' && !composing && !key.isComposing && key.keyCode !== 229
      && (field === 'label' || key.ctrlKey || key.metaKey)) {
      key.preventDefault();
      input.blur();
    }
  });
  input.addEventListener('blur', () => { composing = false; update(); editor.end(); });
}

let nextInspectorFieldId = 0;

/** Restore only focus lost by rebuilding controls, never a user's new focus. */
export function captureInspectorControlFocus(container: HTMLElement) {
  const doc = container.ownerDocument;
  const previous = doc.activeElement as HTMLElement | null;
  const controls = Array.from(container.querySelectorAll<HTMLElement>('[data-focus-key]'));
  const index = previous ? controls.indexOf(previous) : -1;
  const key = previous?.dataset.focusKey;
  return () => {
    if (index < 0 || !container.isConnected || (doc.activeElement !== doc.body && doc.activeElement !== previous)) return;
    const next = Array.from(container.querySelectorAll<HTMLElement>('[data-focus-key]'));
    const target = next.find(control => control.dataset.focusKey === key) ?? next[Math.min(index, next.length - 1)];
    target?.focus({ preventScroll: true });
  };
}

export interface StructureReflectionEditorContext {
  getGraph: () => GraphData;
  getSelectedNode: () => any | null;
  canMutate?: () => boolean;
  saveUndo?: () => void;
  triggerSave: () => void;
  syncGraphToOtherPanes?: () => void;
  draw: () => void;
}

/** Keeps one undo snapshot per focused structure-reflection field. */
export function createStructureReflectionEditor(ctx: StructureReflectionEditorContext) {
  let edit: { graphRef: GraphData; nodeRef: any; nodeId: string; field: StructureReflectionField; undoSaved: boolean } | null = null;

  const begin = (field: StructureReflectionField) => {
    const graph = ctx.getGraph();
    const node = ctx.getSelectedNode();
    edit = ctx.canMutate?.() !== false && isStructureNode(node) && graph.nodes.find(candidate => candidate.id === node.id) === node
      ? { graphRef: graph, nodeRef: node, nodeId: node.id, field, undoSaved: false }
      : null;
  };

  const update = (field: StructureReflectionField, value: string): boolean => {
    if (!edit || edit.field !== field) return false;
    const graph = ctx.getGraph();
    const node = graph.nodes.find(candidate => candidate.id === edit!.nodeId);
    if (ctx.canMutate?.() === false || graph !== edit.graphRef || node !== edit.nodeRef || ctx.getSelectedNode() !== edit.nodeRef || !isStructureNode(node)) {
      edit = null;
      return false;
    }
    if (node.structure[field] === value) return false;
    if (!edit.undoSaved) {
      ctx.saveUndo?.();
      edit.undoSaved = true;
    }
    node.structure[field] = value;
    ctx.triggerSave();
    ctx.syncGraphToOtherPanes?.();
    ctx.draw();
    return true;
  };

  const end = () => { edit = null; };
  return { begin, update, end };
}

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
  getInitSim: () => () => void;
  deleteNode: (id: string) => boolean;
  /** Index into the persistent graph, rather than a projected view's edges. */
  deleteEdge: (originalIndex: number) => boolean;
  deleteGroup: (id: string) => boolean;
  draw: () => void;
  triggerSave: () => void;
  getSimulation: () => any;
  updateLinkForce?: () => void;
  /** 将当前图的节点显示属性同步到其他持有同文件的窗格的模拟节点 */
  syncGraphToOtherPanes?: () => void;
  /** 在下一帧合并跨窗格同步与重绘。 */
  scheduleNameRender?: () => void;
  /** False for projections and other views whose source data must never be edited. */
  canMutate?: () => boolean;
  revealSelection?: (occluder: HTMLElement) => void | (() => void);
  reportImportError?: (message: string) => void;
  openNodeAttachment?: (node: any) => void;
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
  const colors = GRAPH_EDITOR_COLORS;
  const { getSelNode, setSelNode, getSelEdge, setSelEdge, getSelGroup, setSelGroup,
    getLinkMode, setLinkMode, setLinkSrc, getInitSim, draw, triggerSave, getSimulation } = ctx;

  const editPanel = el("div", { style: `position:absolute;right:10px;top:112px;z-index:${Z_EDIT_PANEL};min-width:220px;max-width:500px;max-height:calc(100vh - 124px);overflow-y:auto;padding:10px;border:1px solid ${V('--fg-glass-border','rgba(255,255,255,0.1)')};border-radius:${V('--fg-radius-md','10px')};background:${V('--fg-surface-glass','rgba(40,42,48,0.75)')};backdrop-filter:blur(var(--fg-glass-blur,12px));-webkit-backdrop-filter:blur(12px);color:${V('--fg-text','#d0d0d0')};display:none;flex-direction:column;gap:8px;box-shadow:${V('--fg-shadow-md','0 4px 16px rgba(0,0,0,0.3)')};transition:background var(--fg-transition,0.25s ease),color var(--fg-transition,0.25s ease);` });
  editPanel.className = 'fg-inspector fg-inspector-editor';
  editPanel.setAttribute('role', 'region');
  editPanel.setAttribute('aria-label', '编辑所选内容');
  editPanel.style.opacity = String(getEditPanelOpacity());
  let enterCollapse: () => void = () => {};
  let exitCollapse: () => void = () => {};
  let revealCoordinator: ReturnType<typeof createInspectorRevealCoordinator> | null = null;
  let resetScrollOnShow = false;
  const showPanel = () => {
    if (_cleanedUp) return;
    const readonly = ctx.canMutate?.() === false;
    for (const control of editPanel.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>('.fg-inspector-section input, .fg-inspector-section textarea, .fg-inspector-section select, .fg-inspector-section button')) {
      control.disabled = readonly && !control.hasAttribute('data-inspector-navigation');
    }
    radModeSelect.disabled = readonly || isStructureNode(displayedItem);
    (groupDelBtn as HTMLButtonElement).disabled = readonly || isStructureCollection(displayedItem);
    editPanel.style.display = 'flex';
    if (resetScrollOnShow) {
      editPanel.scrollTop = 0;
      resetScrollOnShow = false;
    }
    if (collapsed) {
      nodeEdit.style.display = 'none'; edgeEdit.style.display = 'none'; groupEdit.style.display = 'none';
      titleBar.style.display = 'none'; resizeHandle.style.display = 'none';
      collapsedHandle.style.display = 'flex';
    }
    revealCoordinator?.request();
  };

  // --- 上下文标题栏（同时作为拖拽把手）---
  const titleBar = el("div", { style: "display:flex;align-items:center;justify-content:space-between;cursor:move;padding:2px 0 4px 0;user-select:none;flex-shrink:0;" });
  titleBar.className = 'fg-inspector-titlebar';
  const inspectorIdentity = el("div");
  inspectorIdentity.className = 'fg-inspector-identity';
  const inspectorEyebrow = el("span", { text: '编辑' });
  inspectorEyebrow.className = 'fg-inspector-eyebrow';
  const inspectorTitle = el("strong", { text: '节点' });
  inspectorTitle.className = 'fg-inspector-title';
  inspectorIdentity.appendChild(inspectorTitle);
  inspectorIdentity.appendChild(inspectorEyebrow);
  titleBar.appendChild(inspectorIdentity);
  const collapsePanelBtn = el("button", { text: '›', attrs: { type: 'button', title: '收起编辑面板', 'aria-label': '收起编辑面板' } });
  collapsePanelBtn.className = 'fg-inspector-collapse';
  collapsePanelBtn.addEventListener('pointerdown', (event) => { event.stopPropagation(); });
  collapsePanelBtn.addEventListener('touchstart', (event) => { event.stopPropagation(); }, { passive: true });
  collapsePanelBtn.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); enterCollapse(); });
  titleBar.appendChild(collapsePanelBtn);
  editPanel.insertBefore(titleBar, editPanel.firstChild);

  // --- 缩放把手（右下角）---
  const resizeHandle = el("div", { style: "position:absolute;right:6px;bottom:6px;width:12px;height:12px;border-radius:50%;background:rgba(255,255,255,0.3);cursor:nwse-resize;z-index:1;touch-action:none;user-select:none;" });
  resizeHandle.className = 'fg-inspector-resize';
  editPanel.appendChild(resizeHandle);

  // --- 折叠把手（小方框 + 拖拽柄，默认隐藏）---
  const collapsedHandle = el("button", { attrs: { type: 'button', 'aria-label': '展开编辑面板' }, style: `position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;cursor:move;user-select:none;padding:0;border-radius:${V('--fg-radius-md','10px')};` });
  collapsedHandle.className = 'fg-inspector-collapsed-handle';
  collapsedHandle.title = '展开编辑面板';
  const collapseDot = el("span", { text: '‹' });
  collapseDot.className = 'fg-inspector-collapsed-glyph';
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
            const restoredWidth = Math.max(286, Math.min(s.w || 326, Math.min(500, window.innerWidth - 24)));
            const maxLeft = Math.max(8, window.innerWidth - restoredWidth - 10);
            editPanel.style.left = Math.max(8, Math.min(s.l, maxLeft)) + 'px';
            editPanel.style.top = Math.max(0, Math.min(s.t, window.innerHeight - 40)) + 'px';
            editPanel.style.right = 'auto';
            if (s.w && s.w >= 220) { editPanel.style.width = restoredWidth + 'px'; editPanel.style.maxWidth = '500px'; }
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
      revealCoordinator?.request();
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
    nodeTextEditor.end();
    structureReflectionEditor.end();
    displayedGraph = null; displayedItem = null; propertyEdit = null;
    revealCoordinator?.destroy();
  };

  const makeRow = (p: HTMLElement, lb: string, inp: HTMLElement) => {
    const r = el("div", { style: "display:flex;gap:6px;align-items:flex-start;" });
    r.className = 'fg-inspector-field';
    const isField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(inp.tagName);
    if (isField && !inp.id) inp.id = `ns-inspector-field-${++nextInspectorFieldId}`;
    const label = el(isField ? 'label' : 'span', { text: lb, style: `flex-shrink:0;font-size:${V('--fg-font-lg', '0.92em')};line-height:1.8;`, attrs: isField ? { for: inp.id } : undefined });
    label.className = 'fg-inspector-field-label';
    r.appendChild(label);
    r.appendChild(inp);
    p.appendChild(r);
  };

  type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  let displayedGraph: GraphData | null = null;
  let displayedItem: any = null;
  const formBaseline = new Map<FormControl, string | boolean>();
  const touchedControls = new Set<FormControl>();
  const inheritedColorPickers = new Set<HTMLInputElement>();
  const colorControls = new Map<HTMLInputElement, { sync(item: any): void }>();
  const commitPickerColor = (picker: HTMLInputElement, item: any) =>
    setGraphColorOverride(item, inheritedColorPickers.has(picker) ? null : picker.value);
  let propertyEdit: { graph: GraphData; item: any; undoSaved: boolean } | null = null;
  const beginPropertyEdit = () => { propertyEdit = { graph: ctx.graph, item: displayedItem, undoSaved: false }; };
  const savePropertyUndo = () => {
    if (!propertyEdit || propertyEdit.graph !== ctx.graph || propertyEdit.item !== displayedItem) beginPropertyEdit();
    if (!propertyEdit!.undoSaved) { ctx.saveUndo?.(); propertyEdit!.undoSaved = true; }
  };
  const controlValue = (input: FormControl) => input.type === 'checkbox' ? (input as HTMLInputElement).checked : input.value;
  const changed = (input: FormControl) => touchedControls.has(input) || formBaseline.get(input) !== controlValue(input);
  const rememberForm = (item: any, controls: FormControl[]) => {
    displayedGraph = ctx.graph;
    displayedItem = item;
    formBaseline.clear(); touchedControls.clear();
    for (const input of controls) formBaseline.set(input, controlValue(input));
  };

  const saveCurrent = async () => {
    if (ctx.canMutate?.() === false) return;
    if (ctx.graph !== displayedGraph) return;
    const selNode = getSelNode();
    const selEdge = getSelEdge();
    const selGroup = getSelGroup();
    const sim = getSimulation();
    if (selNode) {
      const n = ctx.graph.nodes.find(n => n.id === selNode);
      if (n && n === displayedItem) {
        const structureNode = isStructureNode(n);
        // tags 由 pills 直接管理，不需要从 textarea 读取
        const controls = [nCol, nMediaType, nMediaUrl, radModeSelect, radLevelSlider, nRad];
        if (!controls.some(changed)) return;
        savePropertyUndo();
        if (changed(nCol)) commitPickerColor(nCol, n);
        if (changed(nMediaType)) n.mediaType = nMediaType.value || null;
        if (changed(nMediaUrl)) n.mediaUrl = nMediaUrl.value || null;
        if ([radModeSelect, radLevelSlider, nRad].some(changed)) {
          n.radiusMode = structureNode ? 'level' : radModeSelect.value as 'level' | 'custom';
          if (structureNode || radModeSelect.value === 'level') {
            n.headingLevel = parseInt(radLevelSlider.value);
            n.radius = undefined; // 级别模式不存硬编码半径，由 draw 循环动态计算
          } else {
            const value = Number(nRad.value);
            n.radius = Number.isFinite(value) && nRad.value !== '' ? Math.max(5, Math.min(45, value)) : 9;
            n.headingLevel = undefined;
          }
        }
        rememberForm(n, controls);
        // 同步到模拟器中的克隆节点（不重启模拟）
        if (sim) {
          const sn = sim.nodes().find((sn: any) => sn.id === selNode);
          if (sn) { sn.label = n.label; sn.note = n.note; sn.tags = n.tags; sn.color = n.color; sn.colorMode = n.colorMode; sn.radius = n.radius; sn.radiusMode = n.radiusMode; sn.headingLevel = n.headingLevel; }
        }
        // 同步到其他持有同文件的窗格模拟节点
        ctx.syncGraphToOtherPanes?.();
      } else return;
    } else if (selEdge !== null) {
      const e = ctx.graph.edges[selEdge];
      if (e && e === displayedItem) {
        const controls = [eLabel, eCol, eArrChk, eStyle];
        if (!controls.some(changed)) return;
        savePropertyUndo();
        if (changed(eLabel)) e.label = eLabel.value.trim();
        if (changed(eCol)) commitPickerColor(eCol, e);
        if (changed(eArrChk)) e.arrow = eArrChk.checked;
        if (changed(eStyle)) e.lineStyle = eStyle.value;
        updateEdgeEndpoints(e);
        rememberForm(e, controls);
        // 线型改变后立即更新模拟链接力（虚线不参与力学）
        ctx.updateLinkForce?.();
      } else return;
    } else if (selGroup) {
      const g = ctx.graph.groups.find(g => g.id === selGroup);
      if (g && g === displayedItem) {
        const controls = [gMode, gCol, gBCol, gOp, groupNodeColorMode, groupNodeColor, fluidRadiusSlider, fluidOpacitySlider];
        if (!controls.some(changed)) return;
        savePropertyUndo();
        if (changed(gMode)) g.displayMode = gMode.value as any;
        if (changed(gCol)) g.color = gCol.value;
        if (changed(gBCol)) g.borderColor = gBCol.value;
        if (changed(gOp)) g.opacity = +gOp.value;
        if (changed(groupNodeColorMode)) g.nodeColorMode = groupNodeColorMode.value as 'off' | 'fill' | 'edge';
        if (changed(groupNodeColor)) g.nodeColor = groupNodeColor.value;
        if (changed(fluidRadiusSlider)) g.fluidRadius = parseFloat(fluidRadiusSlider.value) || 8;
        if (changed(fluidOpacitySlider)) g.fluidOpacity = parseFloat(fluidOpacitySlider.value) || 0.4;
        rememberForm(g, controls);
      } else return;
      // 集合数据不经过模拟，需手动触发重绘
      draw();
      // 同步到其他窗格（集合颜色/模式可能影响节点着色）
      ctx.syncGraphToOtherPanes?.();
    } else return;
    ctx.triggerSave();
    ctx.draw();
  };

  const bindAutoSave = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) => {
    let session: { graph: GraphData | null; item: any } | null = null;
    let composing = false;
    const begin = () => { session = { graph: displayedGraph, item: displayedItem }; composing = false; };
    const update = () => {
      if (composing || !session || session.graph !== displayedGraph || session.item !== displayedItem) return;
      void saveCurrent();
    };
    el.addEventListener('focus', begin);
    // Native color dialogs are opened by clicking an otherwise hidden input.
    if (el.type === 'color') el.addEventListener('click', begin);
    el.addEventListener('compositionstart', () => { composing = true; });
    el.addEventListener('compositionend', () => { composing = false; update(); });
    el.addEventListener('input', update);
    el.addEventListener('change', update);
    el.addEventListener('blur', () => { update(); session = null; composing = false; });
  };

  const nodeTextEditor = createNodeTextEditor({
    getGraph: () => ctx.graph,
    getSelectedNode: () => ctx.graph.nodes.find(node => node.id === getSelNode()) ?? null,
    canMutate: ctx.canMutate,
    saveUndo: ctx.saveUndo,
    onChange: (node, field) => {
      if (field === 'label' && isStructureNode(node)) syncStructureCollections(ctx.graph);
      const simNode = getSimulation()?.nodes().find((candidate: any) => candidate.id === node.id);
      if (simNode) simNode[field] = node[field];
      ctx.triggerSave();
      if (ctx.scheduleNameRender) ctx.scheduleNameRender();
      else { ctx.syncGraphToOtherPanes?.(); ctx.draw(); }
    },
  });

  // --- 颜色预设块 ---
  const makeColorPresets = (picker: HTMLInputElement, kind?: 'node' | 'edge'): HTMLElement => {
    const pre = el('div');
    pre.className = 'fg-color-controls';
    const header = el('div'); header.className = 'fg-color-control-header';
    const palette = el('div'); palette.className = 'fg-color-palette';
    pre.appendChild(header); pre.appendChild(palette);
    picker.style.display = 'none';
    const swatch = el('button', { text: '…', attrs: { type: 'button', 'aria-label': '自定义颜色' } });
    swatch.className = 'fg-color-choice fg-color-custom';
    let colorDialog: { graph: GraphData; item: any } | null = null;
    swatch.onclick = () => {
      beginPropertyEdit();
      colorDialog = { graph: ctx.graph, item: displayedItem };
      if (kind && inheritedColorPickers.has(picker)) {
        picker.value = themeSample();
        formBaseline.set(picker, picker.value);
      }
      picker.click();
    };
    header.appendChild(swatch);
    const themeButton = kind ? el('button', { text: '跟随主题', attrs: { type: 'button', 'aria-pressed': 'false' } }) : null;
    if (themeButton) { themeButton.className = 'fg-color-inherit'; header.appendChild(themeButton); }
    const choices: { color: string; button: HTMLElement }[] = [];
    const themeSample = () => {
      const value = getComputedStyle(gCont).getPropertyValue('--fg-accent').trim();
      return /^#[a-f\d]{6}$/i.test(value) ? value : '#808080';
    };
    const render = () => {
      const inherited = !!kind && inheritedColorPickers.has(picker);
      swatch.style.background = inherited ? 'var(--fg-accent)' : picker.value;
      swatch.title = inherited ? '当前跟随主题，点击选择自定义颜色' : `当前颜色 ${picker.value}`;
      themeButton?.setAttribute('aria-pressed', String(inherited));
      for (const choice of choices) choice.button.setAttribute('aria-pressed', String(!inherited && picker.value.toUpperCase() === choice.color.toUpperCase()));
    };
    picker.addEventListener('input', () => {
      if (!colorDialog || ctx.canMutate?.() === false || ctx.graph !== colorDialog.graph
        || displayedGraph !== colorDialog.graph || displayedItem !== colorDialog.item) return;
      inheritedColorPickers.delete(picker); touchedControls.add(picker); render();
    });
    if (themeButton) themeButton.onclick = () => {
      if (inheritedColorPickers.has(picker)) return;
      beginPropertyEdit();
      inheritedColorPickers.add(picker); picker.value = themeSample(); touchedControls.add(picker);
      render(); saveCurrent();
    };
    colors.forEach(c => {
      const s = el('button', { attrs: { type: 'button', 'aria-label': `使用颜色 ${c}`, 'aria-pressed': 'false' } });
      s.className = 'fg-color-choice'; s.style.background = c;
      s.onclick = () => {
        beginPropertyEdit(); inheritedColorPickers.delete(picker); picker.value = c;
        touchedControls.add(picker); render(); saveCurrent();
      };
      palette.appendChild(s);
      choices.push({ color: c, button: s });
    });
    colorControls.set(picker, { sync(item) {
      const explicit = kind ? getExplicitGraphColor(item, kind) : String(item || picker.value);
      if (kind && !explicit) { inheritedColorPickers.add(picker); picker.value = themeSample(); }
      else { inheritedColorPickers.delete(picker); picker.value = explicit || picker.value; }
      render();
    } });
    render();
    return pre;
  };

  // --- 节点编辑区 ---
  const nodeEdit = el("div");
  nodeEdit.className = 'fg-inspector-section';
  const nodeTitleRow = el("div", { style: "display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;" });
  nodeTitleRow.className = 'fg-inspector-section-header';
  const nodeSectionTitle = el("div", { text: "节点", style: "font-weight:bold;" });
  nodeSectionTitle.className = 'fg-inspector-section-title';
  nodeTitleRow.appendChild(nodeSectionTitle);
  const nodeDelBtn = el("button", { text: '删除', style: `background:${V('--fg-danger','#e03030')};color:white;font-size:${V('--fg-font-xs','0.72em')};padding:1px 8px;` });
  nodeDelBtn.className = 'fg-inspector-danger';
  nodeDelBtn.onclick = () => {
    const id = getSelNode();
    if (ctx.canMutate?.() === false || ctx.graph !== displayedGraph
      || !id || ctx.graph.nodes.find(node => node.id === id) !== displayedItem) return;
    if (ctx.deleteNode(id)) clearEd();
  };
  nodeTitleRow.appendChild(nodeDelBtn);
  nodeEdit.appendChild(nodeTitleRow);
  const appendOnEntry = (field: HTMLInputElement | HTMLTextAreaElement) => {
    let firstClick = false;
    const placeCaret = () => field.setSelectionRange(field.value.length, field.value.length);
    field.addEventListener('pointerdown', () => { firstClick = document.activeElement !== field; });
    field.addEventListener('focus', placeCaret);
    field.addEventListener('click', () => {
      if (firstClick && field.selectionStart === field.selectionEnd) placeCaret();
      firstClick = false;
    });
  };
  const nName = el('input', { type: 'text', placeholder: '这条想法是什么？', style: 'width:100%;' }) as HTMLInputElement;
  nName.className = 'fg-inspector-name-input';
  bindNodeTextInput(nName, 'label', nodeTextEditor);
  appendOnEntry(nName);
  const structureReflectionEditor = createStructureReflectionEditor({
    getGraph: () => ctx.graph,
    canMutate: ctx.canMutate,
    getSelectedNode: () => {
      const id = getSelNode();
      return id === null ? null : ctx.graph.nodes.find(node => node.id === id) ?? null;
    },
    saveUndo: ctx.saveUndo,
    triggerSave: ctx.triggerSave,
    syncGraphToOtherPanes: ctx.syncGraphToOtherPanes,
    draw: ctx.draw,
  });
  makeRow(nodeEdit, '名称', nName);
  const nNote = el("textarea", { placeholder: '随手写下内容…', attrs: { rows: "3" }, style: `width:100%;resize:vertical;font-size:${V('--fg-font-md', '0.85em')};` }) as HTMLTextAreaElement;
  nNote.className = 'fg-inspector-note-input';
  bindNodeTextInput(nNote, 'note', nodeTextEditor);
  appendOnEntry(nNote);
  makeRow(nodeEdit, '内容', nNote);
  const noteHint = el('div', { text: '自动保存' });
  noteHint.className = 'fg-inspector-note-hint';
  noteHint.id = `ns-inspector-hint-${++nextInspectorFieldId}`;
  nNote.setAttribute('aria-describedby', noteHint.id);
  noteHint.appendChild(el('span', { text: 'Ctrl / ⌘ + Enter 完成输入', attrs: { class: 'fg-inspector-key-hint' } }));
  nodeEdit.appendChild(noteHint);

  const structureReflection = el("div", { style: "display:none;flex-direction:column;gap:6px;margin-top:4px;" });
  const purpose = el("textarea", { attrs: { rows: "3" }, style: `width:100%;resize:vertical;font-size:${V('--fg-font-md', '0.85em')};` }) as HTMLTextAreaElement;
  const summary = el("textarea", { attrs: { rows: "3" }, style: `width:100%;resize:vertical;font-size:${V('--fg-font-md', '0.85em')};` }) as HTMLTextAreaElement;
  const bindStructureReflection = (field: StructureReflectionField, input: HTMLTextAreaElement) => {
    let composing = false;
    const update = () => { if (!composing) structureReflectionEditor.update(field, input.value); };
    input.addEventListener('focus', () => structureReflectionEditor.begin(field));
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => { composing = false; update(); });
    input.addEventListener('input', update);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !composing && !(e as KeyboardEvent).isComposing && (e.ctrlKey || !e.shiftKey)) {
        e.preventDefault();
        input.blur();
      }
    });
    input.addEventListener('blur', () => { update(); structureReflectionEditor.end(); });
  };
  bindStructureReflection('purpose', purpose);
  bindStructureReflection('summary', summary);
  makeRow(structureReflection, '结构目的', purpose);
  makeRow(structureReflection, '当前总结', summary);
  nodeEdit.appendChild(structureReflection);
  // 标签 pill 编辑器
  const nTagsContainer = el("div", { style: "display:flex;gap:4px;flex-wrap:wrap;align-items:center;flex:1;" });
  nTagsContainer.className = 'fg-inspector-tags';
  makeRow(nodeEdit, '标签', nTagsContainer);
  const nTagsPills: HTMLElement[] = [];
  const refreshTagPills = (preserveFocus = false) => {
    const restoreFocus = preserveFocus ? captureInspectorControlFocus(nTagsContainer) : () => {};
    nTagsPills.length = 0;
    nTagsContainer.innerHTML = '';
    // 从已保存的 node 中读取
    const selNode = getSelNode();
    const n = selNode ? ctx.graph.nodes.find(n => n.id === selNode) : null;
    const tagGraph = ctx.graph;
    const canEditTags = () => !_cleanedUp && !!n && ctx.canMutate?.() !== false && ctx.graph === tagGraph
      && getSelNode() === n.id && ctx.graph.nodes.includes(n);
    const storedTags: string[] = n ? (n.tags || []) : [];
    const tags: string[] = n ? effectiveNodeTags(ctx.graph, n) : [];
    for (const t of tags) {
      const pill = el("span", { style: `font-size:${V('--fg-font-xs', '0.72em')};padding:1px 6px;border-radius:${V('--fg-radius-sm','6px')};border:1px solid rgba(255,255,255,0.2);white-space:nowrap;display:inline-flex;align-items:center;gap:3px;` });
      pill.className = 'fg-tag-pill';
      const tagOpen = el('button', { text: t, attrs: { type: 'button', 'aria-label': `编辑集合 ${t}` } });
      tagOpen.className = 'fg-tag-open';
      tagOpen.dataset.focusKey = `open:${t}`;
      pill.appendChild(tagOpen);
      pill.title = '点击编辑集合';
      tagOpen.onclick = () => {
        if (!canEditTags()) return;
        let g = ctx.graph.groups.find(g => g.structureId === n?.structureParentId && g.label === t)
          || ctx.graph.groups.find(g => g.label === t);
        if (!g) {
          ctx.saveUndo?.();
          const accent = getComputedStyle(gCont).getPropertyValue('--fg-accent').trim();
          const color = /^#[a-f\d]{6}$/i.test(accent) ? accent : '#a8563e';
          g = { id: createGroupId(ctx.graph.groups), label: t, displayMode: 'rect', color,
            borderColor: darken(color, 0.2), opacity: 0.15, nodeColorMode: 'off' as const, nodeColor: color };
          ctx.graph.groups.push(g);
          triggerSave();
        }
        fillGroup(g.id);
      };
      const derivedStructureTag = !storedTags.includes(t) && !!n?.structureParentId;
      const x = el(derivedStructureTag ? 'span' : 'button', { text: '\u2715', attrs: derivedStructureTag ? undefined : { type: 'button', 'aria-label': `移除标签 ${t}` } });
      x.className = 'fg-tag-remove';
      if (!derivedStructureTag) x.dataset.focusKey = `remove:${t}`;
      if (derivedStructureTag) {
        x.textContent = '⌁';
        x.title = '该标签来自结构成员关系';
        x.style.cursor = 'default';
      }
      x.onclick = (e: Event) => {
        e.stopPropagation();
        if (derivedStructureTag || !canEditTags()) return;
        ctx.saveUndo?.();
        const idx = tags.indexOf(t);
        if (idx >= 0) tags.splice(idx, 1);
        (n as any).tags = tags.filter(tag => storedTags.includes(tag));
        // 若无其他节点使用此标签，删除对应集合
        if (!ctx.graph.nodes.some(nd => (nd.tags || []).includes(t))) {
          const gIdx = ctx.graph.groups.findIndex(g => g.label === t);
          if (gIdx >= 0 && !isStructureCollection(ctx.graph.groups[gIdx])) ctx.graph.groups.splice(gIdx, 1);
        }
        triggerSave(); draw();
        refreshTagPills(true);
      };
      pill.appendChild(x);
      nTagsContainer.appendChild(pill);
      (pill as any)._tag = t;
      nTagsPills.push(pill);
    }
    // + 按钮
    const addTagBtn = el("button", { text: '+ 标签', attrs: { type: 'button', 'aria-label': '添加标签' } });
    addTagBtn.className = 'fg-tag-add';
    addTagBtn.dataset.focusKey = 'add';
    addTagBtn.onclick = async () => {
      if (!canEditTags()) return;
      const tn = await safePrompt('输入标签名：');
      if (canEditTags() && addTagBtn.isConnected && document.activeElement === document.body) addTagBtn.focus({ preventScroll: true });
      if (!tn?.trim() || !canEditTags()) return;
      const tag = tn.trim();
      if (n && !(n.tags || []).includes(tag)) {
        ctx.saveUndo?.();
        if (!n.tags) n.tags = [];
        n.tags.push(tag); triggerSave(); draw();
      }
      refreshTagPills(true);
    };
    nTagsContainer.appendChild(addTagBtn);
    restoreFocus();
  };
  // 媒体类型
  const nMediaType = el("select") as HTMLSelectElement;
  nMediaType.setAttribute('aria-label', '附件类型');
  ['无', '图片', '音频', '视频', 'PDF', '文档'].forEach((t, i) => { const o = el("option", { text: t, attrs: { value: ['', 'image', 'audio', 'video', 'pdf', 'md'][i] } }); nMediaType.appendChild(o); });
  bindAutoSave(nMediaType);
  const nMediaRow = el('div');
  nMediaRow.className = 'fg-inspector-media-row';
  const nFileBtn = el('button', { text: '选择文件', attrs: { type: 'button', 'aria-label': '导入本地附件' } }) as HTMLButtonElement;
  nFileBtn.className = 'fg-inspector-media-action';
  nFileBtn.title = '导入本地文件';
  nMediaRow.appendChild(nMediaType);
  let mediaPickGeneration = 0;
  nFileBtn.onclick = async () => {
    const fileGeneration = ++mediaPickGeneration;
    const fileGraph = ctx.graph, fileNode = displayedItem;
    const canImport = () => !_cleanedUp && fileGeneration === mediaPickGeneration && ctx.canMutate?.() !== false && ctx.graph === fileGraph
      && fileGraph.settings?.sourceMode !== 'vault-readonly'
      && displayedItem === fileNode && getSelNode() === fileNode?.id && fileGraph.nodes.includes(fileNode);
    if (!canImport()) return;
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = MEDIA_FILE_ACCEPT;
    inp.onchange = async () => {
      if (!canImport()) return;
      const f = inp.files?.[0]; if (!f) return;
      let discardPrepared = () => {};
      try {
        const { sources } = await readBrowserMediaSources([f]);
        discardPrepared = () => releaseMediaSources(sources.filter(source =>
          !fileGraph.nodes.includes(fileNode) || fileNode.mediaUrl !== source.value));
        if (!canImport()) return;
        const source = sources[0];
        if (!source) { ctx.reportImportError?.('请选择图片、音视频、PDF 或文本文件'); return; }
        beginPropertyEdit();
        nMediaType.value = source.type; nMediaUrl.value = source.value;
        await saveCurrent();
        if (fileNode.mediaUrl !== source.value) return;
        if (!canImport()) return;
        syncMediaFields();
      } catch {
        if (canImport()) ctx.reportImportError?.('无法读取附件，请重新选择文件');
      } finally { discardPrepared(); }
    };
    inp.click();
  };
  nMediaRow.appendChild(nFileBtn);
  const nOpenMediaBtn = el('button', { text: '查看附件', attrs: { type: 'button', 'data-inspector-navigation': 'true' } }) as HTMLButtonElement;
  nOpenMediaBtn.className = 'fg-inspector-media-action fg-inspector-open-media';
  nOpenMediaBtn.onclick = () => {
    if (_cleanedUp || ctx.graph !== displayedGraph || getSelNode() !== displayedItem?.id
      || !ctx.graph.nodes.includes(displayedItem)) return;
    ctx.openNodeAttachment?.(displayedItem);
  };
  const nMediaUrl = el('textarea', {
    attrs: { rows: '1', 'aria-label': '附件地址或文档内容' },
    placeholder: '粘贴链接，或输入文档内容',
  }) as HTMLTextAreaElement;
  nMediaUrl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); nMediaUrl.blur(); } });
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
  bindAutoSave(nMediaUrl);
  nMediaRow.appendChild(nMediaUrl);
  const mediaStorageHint = el('p', { text: '此附件保存在当前设备。换设备后需要重新导入。' });
  mediaStorageHint.className = 'fg-inspector-media-storage';
  mediaStorageHint.hidden = true;
  nMediaRow.appendChild(mediaStorageHint);
  nMediaRow.appendChild(nOpenMediaBtn);
  const nodeDetails = el('details');
  nodeDetails.className = 'fg-inspector-node-details';
  nodeDetails.appendChild(el('summary', { text: '节点外观' }));
  const nodeDetailsBody = el('div');
  nodeDetailsBody.className = 'fg-inspector-node-details-body';
  const mediaDetails = el('details') as HTMLDetailsElement;
  mediaDetails.className = 'fg-inspector-media-details';
  const mediaSummary = el('summary', { text: '附件' });
  mediaDetails.appendChild(mediaSummary);
  mediaDetails.appendChild(nMediaRow);
  nodeEdit.appendChild(mediaDetails);
  const syncMediaFields = () => {
    const local = isStoredAttachment(nMediaUrl.value);
    nOpenMediaBtn.hidden = !ctx.openNodeAttachment || !nMediaType.value || !nMediaUrl.value;
    nMediaUrl.hidden = local;
    mediaStorageHint.hidden = !local;
    nMediaUrl.rows = nMediaType.value === 'md' ? 4 : 1;
    nMediaUrl.style.resize = nMediaType.value === 'md' ? 'vertical' : 'none';
    nMediaUrl.style.overflowY = nMediaType.value === 'md' ? 'auto' : 'hidden';
    mediaSummary.textContent = nMediaType.value ? `附件 · ${nMediaType.selectedOptions[0]?.textContent || '已添加'}` : '附件';
  };
  nMediaType.addEventListener('change', syncMediaFields);
  nodeDetails.appendChild(nodeDetailsBody);
  nodeEdit.appendChild(nodeDetails);
  const nColR = el("div", { style: "display:flex;gap:6px;align-items:center;margin:4px 0;" });
  nColR.className = 'fg-inspector-color-row';
  nColR.appendChild(el("span", { text: '颜色', style: `flex-shrink:0;font-size:${V('--fg-font-lg', '0.92em')};` }));
  const nCol = el("input", { type: "color", style: "width:24px;height:24px;padding:0;border:none;" }) as HTMLInputElement;
  nColR.appendChild(nCol);
  nColR.appendChild(makeColorPresets(nCol, 'node'));
  bindAutoSave(nCol);
  nodeDetailsBody.appendChild(nColR);

  // 半径
  const radModeRow = el("div", { style: "display:flex;gap:4px;align-items:center;margin-top:4px;" });
  const radModeSelect = el("select", { style: "width:60px;" }) as HTMLSelectElement;
  radModeSelect.setAttribute('aria-label', '节点大小模式');
  radModeSelect.appendChild(el("option", { text: '按等级', attrs: { value: "level" } }));
  radModeSelect.appendChild(el("option", { text: '自定义', attrs: { value: "custom" } }));
  radModeRow.appendChild(radModeSelect);

  const radLevelRow = el("div", { style: "display:flex;gap:2px;align-items:center;" });
  const radLevelSlider = el("input", { type: "range", attrs: { min: "1", max: "6", step: "1", value: "6" }, style: "width:70px;" }) as HTMLInputElement;
  radLevelSlider.setAttribute('aria-label', '节点等级');
  radLevelSlider.title = '1 级更突出，6 级更轻';
  radLevelRow.appendChild(radLevelSlider);
  const radLevelValue = el("span", { text: '6', style: `font-size:${V('--fg-font-lg', '0.92em')};margin-left:2px;` });
  radLevelRow.appendChild(radLevelValue);

  const radCustomRow = el("div", { style: "display:none;gap:2px;align-items:center;" });
  const nRad = el("input", { type: "number", attrs: { min: "5", max: "45" }, style: "width:60px;" }) as HTMLInputElement;
  nRad.setAttribute('aria-label', '自定义节点半径');
  nRad.addEventListener('input', () => {
    const value = Number(nRad.value);
    if (nRad.value !== '' && Number.isFinite(value) && value >= 5 && value <= 45) saveCurrent();
  });
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

  const finishCustomRadius = () => {
    saveCurrent();
    const node = ctx.graph.nodes.find(candidate => candidate.id === getSelNode());
    if (ctx.graph !== displayedGraph || node !== displayedItem || !node) return;
    nRad.value = String(getConfiguredNodeRadius(node));
    formBaseline.set(nRad, nRad.value);
  };
  nRad.addEventListener('change', finishCustomRadius);
  nRad.addEventListener('blur', finishCustomRadius);
  const radContainer = el("div");
  radContainer.appendChild(radModeRow);
  radContainer.appendChild(radLevelRow);
  radContainer.appendChild(radCustomRow);
  makeRow(nodeDetailsBody, '大小', radContainer);

  // --- 边编辑区 ---
  const edgeEdit = el("div"); edgeEdit.className = 'fg-inspector-section'; edgeEdit.style.display = 'none';
  const edgeTitleRow = el("div", { style: "display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;" });
  edgeTitleRow.className = 'fg-inspector-section-header';
  const edgeSectionTitle = el("div", { text: "关系", style: "font-weight:bold;" });
  edgeSectionTitle.className = 'fg-inspector-section-title';
  edgeTitleRow.appendChild(edgeSectionTitle);
  const edgeDelBtn = el("button", { text: '删除', style: `background:${V('--fg-danger','#e03030')};color:white;font-size:${V('--fg-font-xs','0.72em')};padding:1px 8px;` });
  edgeDelBtn.className = 'fg-inspector-danger';
  edgeDelBtn.onclick = () => {
    const index = getSelEdge();
    if (ctx.canMutate?.() === false || ctx.graph !== displayedGraph
      || index === null || ctx.graph.edges[index] !== displayedItem) return;
    if (ctx.deleteEdge(index)) clearEd();
  };
  edgeTitleRow.appendChild(edgeDelBtn);
  edgeEdit.appendChild(edgeTitleRow);
  const eIdSpan = el('div');
  eIdSpan.className = 'fg-edge-endpoints';
  const updateEdgeEndpoints = (edge: any) => {
    const label = (endpoint: any) => {
      const id = typeof endpoint === 'object' ? endpoint?.id : endpoint;
      return ctx.graph.nodes.find(node => node.id === id)?.label || String(id ?? '');
    };
    eIdSpan.textContent = `${label(edge.source)} ${edge.arrow ? '→' : '—'} ${label(edge.target)}`;
  };
  edgeEdit.appendChild(eIdSpan);
  const eLabel = el("input", { type: "text", placeholder: '它们之间有什么联系？', style: "width:100%;" }) as HTMLInputElement;
  eLabel.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); eLabel.blur(); }
  });
  makeRow(edgeEdit, '关系说明', eLabel);
  bindAutoSave(eLabel);
  const eArrR = el('div');
  eArrR.className = 'fg-edge-direction-row';
  const eArrLabel = el('label'); eArrLabel.className = 'fg-edge-arrow-control';
  const eArrChk = el("input", { type: "checkbox" }) as HTMLInputElement;
  eArrLabel.appendChild(eArrChk);
  eArrLabel.appendChild(el('span', { text: '显示箭头' }));
  eArrR.appendChild(eArrLabel);
  const commitEdgeArrow = () => { beginPropertyEdit(); void saveCurrent(); };
  eArrChk.addEventListener('change', commitEdgeArrow);
  const swapBtn = el("button", { text: '交换方向', attrs: { type: 'button' } });
  eArrR.appendChild(swapBtn);
  edgeEdit.appendChild(eArrR);

  const edgeDetails = el('details'); edgeDetails.className = 'fg-inspector-edge-details';
  edgeDetails.appendChild(el('summary', { text: '显示样式' }));
  const edgeDetailsBody = el('div'); edgeDetailsBody.className = 'fg-inspector-edge-details-body';
  edgeDetails.appendChild(edgeDetailsBody);
  edgeEdit.appendChild(edgeDetails);
  const eColR = el("div", { style: "display:flex;gap:6px;align-items:center;margin:4px 0;" });
  eColR.className = 'fg-inspector-color-row';
  eColR.appendChild(el("span", { text: '颜色', style: `flex-shrink:0;font-size:${V('--fg-font-lg', '0.92em')};` }));
  const eCol = el("input", { type: "color", style: "width:24px;height:24px;padding:0;border:none;" }) as HTMLInputElement;
  eColR.appendChild(eCol);
  eColR.appendChild(makeColorPresets(eCol, 'edge'));
  bindAutoSave(eCol);
  edgeDetailsBody.appendChild(eColR);

  // 连线样式
  const eStyleR = el("div", { style: "display:flex;gap:6px;align-items:center;margin-top:4px;" });
  eStyleR.appendChild(el("span", { text: '线型', style: `flex-shrink:0;font-size:${V('--fg-font-lg', '0.92em')};` }));
  const eStyle = el("select") as HTMLSelectElement;
  eStyle.setAttribute('aria-label', '关系线型');
  ['solid', 'dash-2', 'dash-4', 'dash-8', 'dot', 'dot-dense'].forEach(s => {
    const o = el("option", { text: { solid: '实线', 'dash-2': '虚线 2px', 'dash-4': '虚线 4px', 'dash-8': '虚线 8px', dot: '点线', 'dot-dense': '密点线' }[s], attrs: { value: s } });
    eStyle.appendChild(o);
  });
  eStyle.addEventListener('change', saveCurrent);
  eStyleR.appendChild(eStyle);
  edgeDetailsBody.appendChild(eStyleR);

  // --- 集合编辑区 ---
  const groupEdit = el("div"); groupEdit.className = 'fg-inspector-section'; groupEdit.style.display = 'none';
  const groupTitleRow = el("div", { style: "display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;" });
  groupTitleRow.className = 'fg-inspector-section-header';
  const groupSectionTitle = el("div", { text: "集合", style: "font-weight:bold;" });
  groupSectionTitle.className = 'fg-inspector-section-title';
  groupTitleRow.appendChild(groupSectionTitle);
  const groupDelBtn = el("button", { text: '删除', style: `background:${V('--fg-danger','#e03030')};color:white;font-size:${V('--fg-font-xs','0.72em')};padding:1px 8px;` });
  groupDelBtn.className = 'fg-inspector-danger';
  groupDelBtn.onclick = () => {
    const id = getSelGroup();
    if (ctx.canMutate?.() === false || ctx.graph !== displayedGraph
      || !id || ctx.graph.groups.find(group => group.id === id) !== displayedItem || isStructureCollection(displayedItem)) return;
    if (ctx.deleteGroup(id)) clearEd();
  };
  groupTitleRow.appendChild(groupDelBtn);
  groupEdit.appendChild(groupTitleRow);
  const gIdSpan = el("div", { style: `font-size:${V('--fg-font-lg', '0.92em')};color:${V('--fg-text-muted','#888888')};` });
  groupEdit.appendChild(gIdSpan);
  const gLabel = el("input", { type: "text", attrs: { readonly: "true" }, style: "width:100%;" }) as HTMLInputElement;
  gLabel.title = '集合名称来自节点标签；在节点中管理标签';
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
  groupNodeColorMode.setAttribute('aria-label', '集合成员着色方式');
  groupNodeColorMode.appendChild(el("option", { text: "关闭", attrs: { value: "off" } }));
  groupNodeColorMode.appendChild(el("option", { text: "开启", attrs: { value: "fill" } }));
  groupNodeColorMode.appendChild(el("option", { text: "边缘", attrs: { value: "edge" } }));
  gColorModeRow.appendChild(groupNodeColorMode);
  appearDetails.appendChild(gColorModeRow);
  bindAutoSave(groupNodeColorMode);

  const gNodeColorPickerRow = el("div");
  gNodeColorPickerRow.appendChild(el("span", { text: "颜色", style: `font-size:${V('--fg-font-sm', '0.8em')};margin-right:4px;` }));
  const groupNodeColor = el("input", { type: "color", style: "width:24px;height:24px;padding:0;border:none;" }) as HTMLInputElement;
  groupNodeColor.setAttribute('aria-label', '集合成员颜色');
  gNodeColorPickerRow.appendChild(groupNodeColor);
  appearDetails.appendChild(gNodeColorPickerRow);
  bindAutoSave(groupNodeColor);

  // 圆参数
  const fluidRadiusRow = el("div", { style: "display:none;margin-top:4px;" });
  fluidRadiusRow.appendChild(el("span", { text: "半径", style: `font-size:${V('--fg-font-sm', '0.8em')};margin-right:4px;` }));
  const fluidRadiusSlider = el("input", { type: "range", attrs: { min: "1", max: "20", step: "1", value: "8" }, style: "width:80px;" }) as HTMLInputElement;
  fluidRadiusSlider.setAttribute('aria-label', '圆形集合半径');
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
  fluidOpacitySlider.setAttribute('aria-label', '圆形集合不透明度');
  fluidOpacityRow.appendChild(fluidOpacitySlider);
  const fluidOpacityValue = el("span", { text: '0.4', style: `font-size:${V('--fg-font-sm', '0.8em')};margin-left:4px;` });
  fluidOpacityRow.appendChild(fluidOpacityValue);
  fluidOpacitySlider.addEventListener('input', () => {
    fluidOpacityValue.textContent = fluidOpacitySlider.value;
    saveCurrent();
  });
  appearDetails.appendChild(fluidOpacityRow);

  const syncGroupAppearance = () => {
    const show = gMode.value === 'fluid';
    fluidRadiusRow.style.display = show ? 'block' : 'none';
    fluidOpacityRow.style.display = show ? 'block' : 'none';
    gNodeColorPickerRow.style.display = groupNodeColorMode.value === 'off' ? 'none' : 'block';
    gHint.style.display = gMode.value === 'none' ? 'block' : 'none';
    gHint.textContent = '集合轮廓已隐藏；选择一种显示方式即可在画布中查看。';
  };
  gMode.addEventListener('change', syncGroupAppearance);
  groupNodeColorMode.addEventListener('change', syncGroupAppearance);

  // 背景色
  const gColR = el("div", { style: "display:flex;gap:6px;align-items:center;margin:4px 0;" });
  gColR.className = 'fg-inspector-color-row';
  gColR.appendChild(el("span", { text: '背景色:', style: `flex-shrink:0;font-size:${V('--fg-font-sm', '0.8em')};` }));
  const gCol = el("input", { type: "color", style: "width:24px;height:24px;padding:0;border:none;" }) as HTMLInputElement;
  gCol.setAttribute('aria-label', '集合背景色');
  gColR.appendChild(gCol);
  gColR.appendChild(makeColorPresets(gCol));
  bindAutoSave(gCol);
  appearDetails.appendChild(gColR);

  const gBColR = el("div", { style: "display:flex;gap:6px;align-items:center;margin:4px 0;" });
  gBColR.appendChild(el("span", { text: '边框色:', style: `flex-shrink:0;font-size:${V('--fg-font-sm', '0.8em')};` }));
  const gBCol = el("input", { type: "color", style: "width:24px;height:24px;padding:0;border:none;" }) as HTMLInputElement;
  gBCol.setAttribute('aria-label', '集合边框色');
  gBColR.appendChild(gBCol);
  bindAutoSave(gBCol);
  appearDetails.appendChild(gBColR);

  const gOp = el("input", { type: "range", attrs: { min: "0", max: "1", step: "0.05", value: "0.15" }, style: "width:100%;" }) as HTMLInputElement;
  gOp.setAttribute('aria-label', '集合背景不透明度');
  const gOpRow = el("div", { style: "display:flex;gap:6px;align-items:center;margin:2px 0;" });
  gOpRow.appendChild(el("span", { text: "透明度:", style: `font-size:${V('--fg-font-sm', '0.8em')};margin-right:4px;` }));
  gOpRow.appendChild(gOp);
  appearDetails.appendChild(gOpRow);
  bindAutoSave(gOp);

  groupEdit.appendChild(appearDetails);

  groupEdit.appendChild(el("div", { text: '成员' }));
  const gMems = el("div", { style: `max-height:100px;overflow-y:auto;border:1px solid #ccc;padding:4px;border-radius:${V('--fg-radius-sm','6px')};font-size:${V('--fg-font-sm', '0.8em')};` });
  gMems.className = 'fg-inspector-members';
  groupEdit.appendChild(gMems);

  // 组装
  for (const control of [nCol, nMediaType, nMediaUrl, radModeSelect, radLevelSlider, nRad,
    eLabel, eCol, eArrChk, eStyle, gMode, gCol, gBCol, gOp, groupNodeColorMode, groupNodeColor, fluidRadiusSlider, fluidOpacitySlider]) {
    control.addEventListener('focus', beginPropertyEdit);
    control.addEventListener('pointerdown', beginPropertyEdit);
  }
  editPanel.appendChild(nodeEdit);
  editPanel.appendChild(edgeEdit);
  editPanel.appendChild(groupEdit);
  gCont.appendChild(editPanel);
  if (ctx.revealSelection) revealCoordinator = createInspectorRevealCoordinator(editPanel, gCont, () => {
    if (collapsed || editPanel.style.display === 'none' || ctx.graph !== displayedGraph) return null;
    const nodeId = getSelNode(), edgeIndex = getSelEdge();
    const item = nodeId ? ctx.graph.nodes.find(node => node.id === nodeId)
      : edgeIndex !== null ? ctx.graph.edges[edgeIndex] : null;
    return item === displayedItem ? item : null;
  }, () => ctx.revealSelection?.(editPanel));

  // --- 折叠/展开实现（后于 nodeEdit/edgeEdit/groupEdit 定义）---
  enterCollapse = () => {
    if (collapsed) return;
    revealCoordinator?.cancel();
    const r = editPanel.getBoundingClientRect();
    preCollapseW = r.width; preCollapseH = r.height;
    preCollapseT = editPanel.style.top || r.top + 'px';
    const restoreControlFocus = document.activeElement === collapsePanelBtn;
    collapsed = true;
    editPanel.classList.add('is-collapsed');
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
    if (restoreControlFocus) collapsedHandle.focus({ preventScroll: true });
    savePanelState();
  };

  exitCollapse = () => {
    if (!collapsed) return;
    const restoreControlFocus = document.activeElement === collapsedHandle;
    collapsed = false;
    editPanel.classList.remove('is-collapsed');
    titleBar.style.display = ''; resizeHandle.style.display = '';
    collapsedHandle.style.display = 'none';
    // 展开到初始默认大小/位置
    editPanel.style.width = ''; editPanel.style.height = '';
    editPanel.style.right = '10px'; editPanel.style.top = '112px'; editPanel.style.left = '';
    editPanel.style.maxWidth = '500px';
    editPanel.style.overflowY = 'auto';
    const selNode = getSelNode(), selEdge = getSelEdge(), selGroup = getSelGroup();
    nodeEdit.style.display = selNode ? 'flex' : 'none';
    edgeEdit.style.display = selEdge !== null ? 'flex' : 'none';
    groupEdit.style.display = selGroup ? 'flex' : 'none';
    if (restoreControlFocus) collapsePanelBtn.focus({ preventScroll: true });
    savePanelState();
    revealCoordinator?.request();
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
  const showSection = (s: 'node' | 'edge' | 'group', item: any) => {
    inspectorTitle.textContent = { node: '节点', edge: '关系', group: '集合' }[s];
    editPanel.setAttribute('aria-label', `编辑${inspectorTitle.textContent}`);
    if (displayedGraph !== ctx.graph || displayedItem !== item) {
      resetScrollOnShow = true;
      // Reusing a focused input for another object would leave its old edit
      // session attached. Keep keyboard navigation on the stable header.
      const active = document.activeElement as HTMLElement | null;
      if (active && editPanel.contains(active) && active !== collapsePanelBtn && active !== collapsedHandle) {
        active.blur();
        collapsePanelBtn.focus({ preventScroll: true });
      }
      editPanel.scrollTop = 0;
    }
    nodeEdit.style.display = s === 'node' ? 'flex' : 'none';
    edgeEdit.style.display = s === 'edge' ? 'flex' : 'none';
    groupEdit.style.display = s === 'group' ? 'flex' : 'none';
  };
  const fillNode = (id: string) => {
    propertyEdit = null;
    nodeTextEditor.end();
    structureReflectionEditor.end();
    const n = ctx.graph.nodes.find(n => n.id === id); if (!n) { clearEd(); return; }
    showSection('node', n);
    setSelNode(id); setSelEdge(null); setSelGroup(null);
    nName.value = n.label || ''; nNote.value = n.note || '';
    const structureNode = isStructureNode(n);
    structureReflection.style.display = structureNode ? 'flex' : 'none';
    purpose.value = structureNode ? n.structure.purpose || '' : '';
    summary.value = structureNode ? n.structure.summary || '' : '';
    refreshTagPills(); colorControls.get(nCol)?.sync(n);
    nMediaType.value = n.mediaType || ''; nMediaUrl.value = n.mediaUrl || '';
    syncMediaFields();
    nRad.value = String(getConfiguredNodeRadius(n));
    radModeSelect.disabled = structureNode;
    radModeSelect.title = structureNode ? '结构节点大小按等级决定' : '';
    radModeSelect.value = hasCustomNodeRadius(n) ? 'custom' : 'level';
    if (radModeSelect.value === 'level') {
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
    rememberForm(n, [nCol, nMediaType, nMediaUrl, radModeSelect, radLevelSlider, nRad]);
    showPanel();
    draw();
  };
  const fillEdge = (idx: number) => {
    propertyEdit = null;
    nodeTextEditor.end();
    const e = ctx.graph.edges[idx]; if (!e) { clearEd(); return; }
    showSection('edge', e);
    setSelEdge(idx); setSelNode(null); setSelGroup(null);
    updateEdgeEndpoints(e);
    eLabel.value = e.label || ''; colorControls.get(eCol)?.sync(e); eArrChk.checked = e.arrow || false;
    eStyle.value = e.lineStyle || 'solid';
    rememberForm(e, [eLabel, eCol, eArrChk, eStyle]);
    showPanel(); draw();
  };
  const fillGroup = (id: string) => {
    propertyEdit = null;
    nodeTextEditor.end();
    const g = ctx.graph.groups.find(g => g.id === id); if (!g) { clearEd(); return; }
    showSection('group', g);
    setSelGroup(id); setSelNode(null); setSelEdge(null);
    gIdSpan.textContent = `ID: ${g.id}`; gLabel.value = g.label; gMode.value = g.displayMode || 'none';
    gCol.value = g.color || '#5B8FF9'; gBCol.value = g.borderColor || darken(g.color || '#5B8FF9', 0.2);
    colorControls.get(gCol)?.sync(gCol.value);
    gOp.value = String(g.opacity ?? 0.15);
    groupNodeColorMode.value = g.nodeColorMode || 'off';
    groupNodeColor.value = g.nodeColor || g.color || '#5B8FF9';
    fluidRadiusSlider.value = String(g.fluidRadius || 8);
    fluidRadiusValue.textContent = fluidRadiusSlider.value;
    fluidOpacitySlider.value = String(g.fluidOpacity ?? 0.4);
    fluidOpacityValue.textContent = fluidOpacitySlider.value;
    syncGroupAppearance();

    gMems.innerHTML = '';
    groupSectionTitle.textContent = isStructureCollection(g) ? '结构集合' : '集合';
    (groupDelBtn as HTMLButtonElement).disabled = isStructureCollection(g);
    groupDelBtn.title = isStructureCollection(g) ? '结构集合随对应结构管理' : '删除集合';
    const members = groupMembers(ctx.graph, g);
    members.forEach(n => {
      const it = el("button", { text: n.label || n.id, attrs: { type: 'button', 'aria-label': `查看节点 ${n.label || n.id}`, 'data-inspector-navigation': '' } });
      it.onclick = () => {
        if (_cleanedUp) return;
        const hadFocus = document.activeElement === it;
        fillNode(n.id); showPanel();
        if (hadFocus) collapsePanelBtn.focus({ preventScroll: true });
      };
      gMems.appendChild(it);
    });
    if (members.length === 0) gMems.appendChild(el("div", { text: '(无成员)' }));
    rememberForm(g, [gMode, gCol, gBCol, gOp, groupNodeColorMode, groupNodeColor, fluidRadiusSlider, fluidOpacitySlider]);
    showPanel(); draw();
  };
  const clearEd = () => {
    revealCoordinator?.cancel();
    propertyEdit = null;
    nodeTextEditor.end();
    structureReflectionEditor.end();
    displayedGraph = null; displayedItem = null;
    setSelNode(null); setSelEdge(null); setSelGroup(null);
    nTagsContainer.innerHTML = '';
    if (ctx.clearLinkMode) ctx.clearLinkMode();
    else { setLinkMode(false); setLinkSrc(null); }
    draw();
    if (editPanel.style.display !== 'none') editPanel.style.display = 'none';
  };

  swapBtn.onclick = () => {
    const index = getSelEdge();
    if (ctx.canMutate?.() === false || ctx.graph !== displayedGraph || index === null) return false;
    const edge = ctx.graph.edges[index];
    if (!edge || edge !== displayedItem) return false;
    const source = typeof edge.source === 'object' ? edge.source?.id : edge.source;
    const target = typeof edge.target === 'object' ? edge.target?.id : edge.target;
    if (source === target) return false;
    ctx.saveUndo?.();
    [edge.source, edge.target] = [edge.target, edge.source];
    getInitSim()();
    fillEdge(index);
    ctx.syncGraphToOtherPanes?.();
    ctx.triggerSave();
    ctx.draw();
    return true;
  };

  const updateOpacity = (val: number) => {
    editPanel.style.opacity = String(val);
  };

  return { editPanel, fillNode, fillEdge, fillGroup, clearEd, updateOpacity, saveCurrent, cleanupDragListeners,
    revealSelection: () => revealCoordinator?.request() };
}
