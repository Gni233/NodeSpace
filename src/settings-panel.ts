import { safePrompt } from './dialog';
import { confirmAction } from './toast';
import {Z_SETTINGS_PANEL, V } from "./layout-constants";

/** 浮动设置面板 + 预设管理 */
export interface SettingsPanelAPI {
  show: () => void;
  hide: () => void;
  updateInfo: () => void;
  panel: HTMLElement;
}

export function createSettingsPanel(
  parent: HTMLElement,
  settingsBody: HTMLElement,
  callbacks: {
    onSavePreset: (name: string) => void;
    onLoadPreset: (name: string) => void;
    onDeletePreset: (name: string) => void;
    onResetDefaults: () => void;
    onResetDemo?: () => void;
    onToggleDemo?: (enabled: boolean) => void;
    getDemoEnabled?: () => boolean;
    getPresets: () => { name: string }[];
    onOpenFolder?: () => void;
    getFolderPath?: () => string;
    /** 移动端：传入此回调时，按钮内嵌 <input type="file"> 直接触发原生选择器 */
    onImportFiles?: (files: FileList) => Promise<void>;
    getFileImporter?: () => HTMLElement | null;
    getAutoUpdate?: () => boolean;
    onToggleAutoUpdate?: (val: boolean) => void;
    onCheckUpdate?: () => void;
    onDownloadInstall?: () => void;
  }
): SettingsPanelAPI {
  const panel = document.createElement('div');
  const panelMaxW = Math.min(500, window.innerWidth - 40);
  panel.style.cssText =
    `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:${Z_SETTINGS_PANEL};` +
    `min-width:320px;max-width:${panelMaxW}px;max-height:82vh;overflow-y:auto;` +
    `padding:12px;border:1px solid ${V('--fg-glass-border', 'rgba(255,255,255,0.1)')};` +
    `border-radius:${V('--fg-radius-lg', '14px')};` +
    `background:${V('--fg-surface-elevated', 'rgba(40,42,48,0.85)')};` +
    'backdrop-filter:blur(var(--fg-glass-blur-lg,16px));-webkit-backdrop-filter:blur(var(--fg-glass-blur-lg,16px));' +
    `color:${V('--fg-text', '#d0d0d0')};` +
    `box-shadow:${V('--fg-shadow-lg', '0 8px 32px rgba(0,0,0,0.4)')};` +
    'display:none;' +
    `transition:background var(--fg-transition,0.25s ease),color var(--fg-transition,0.25s ease);`;

  // 标题栏
  const titleBar = document.createElement('div');
  titleBar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;';
  const dot = document.createElement('div');
  dot.style.cssText = `width:5px;height:5px;border-radius:50%;background:${V('--fg-text-muted', 'rgba(255,255,255,0.3)')};margin-right:8px;`;
  const titleText = document.createElement('span');
  titleText.textContent = '设置';
  titleText.style.cssText = `font-weight:bold;font-size:${V('--fg-font-lg', '0.92em')};`;
  const titleLeft = document.createElement('div');
  titleLeft.style.cssText = 'display:flex;align-items:center;cursor:move;';
  titleLeft.appendChild(dot);
  titleLeft.appendChild(titleText);
  const closeBtn = document.createElement('span');
  closeBtn.textContent = '\u2715';
  closeBtn.style.cssText =
    `cursor:pointer;font-size:10px;width:16px;height:16px;line-height:16px;text-align:center;opacity:0.5;color:${V('--fg-text','#d0d0d0')};` +
    `border-radius:${V('--fg-radius-sm', '6px')};transition:all var(--fg-transition-fast,0.15s ease);`;
  closeBtn.onclick = () => { panel.style.display = 'none'; };
  closeBtn.onmouseenter = () => { closeBtn.style.opacity = '1'; closeBtn.style.background = `var(--fg-accent,#5B8FF9)`; closeBtn.style.color = '#fff'; };
  closeBtn.onmouseleave = () => { closeBtn.style.opacity = '0.5'; closeBtn.style.background = 'transparent'; closeBtn.style.color = V('--fg-text','#d0d0d0'); };
  titleBar.appendChild(titleLeft);
  titleBar.appendChild(closeBtn);
  panel.appendChild(titleBar);

  // 拖拽 — 遵循 ui-edit.ts Pattern A（HarmonyOS 兼容，不用 setPointerCapture）
  let dragInfo: any = null;
  let savedTransition = '';

  const ensureLeftBased = () => {
    const r = panel.getBoundingClientRect();
    panel.style.left = r.left + 'px';
    panel.style.top = r.top + 'px';
    panel.style.transform = 'none';
  };

  const startDrag = (cx: number, cy: number) => {
    ensureLeftBased();
    savedTransition = panel.style.transition;
    panel.style.transition = 'none';
    dragInfo = { sx: cx, sy: cy, px: parseInt(panel.style.left) || 0, py: parseInt(panel.style.top) || 0 };
  };

  titleLeft.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    startDrag(e.clientX, e.clientY);
  });
  titleLeft.addEventListener('touchstart', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.touches[0]) startDrag(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });
  // 双击标题栏 → 恢复默认居中位置
  titleLeft.addEventListener('dblclick', (e) => {
    e.preventDefault(); e.stopPropagation();
    panel.style.left = '50%';
    panel.style.top = '50%';
    panel.style.transform = 'translate(-50%,-50%)';
    panel.style.transition = 'left 0.25s ease, top 0.25s ease, transform 0.25s ease';
  });

  // --- 缩放把手（右下角）---
  const resizeHandle = document.createElement('div');
  resizeHandle.style.cssText = 'position:absolute;right:6px;bottom:6px;width:12px;height:12px;border-radius:50%;background:rgba(255,255,255,0.3);cursor:nwse-resize;z-index:1;touch-action:none;user-select:none;';
  panel.appendChild(resizeHandle);
  let resizeInfo: { sx: number; sy: number; pw: number; ph: number } | null = null;
  resizeHandle.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    savedTransition = panel.style.transition;
    panel.style.transition = 'none';
    const r = panel.getBoundingClientRect();
    resizeInfo = { sx: e.clientX, sy: e.clientY, pw: r.width, ph: r.height };
  });
  // 双击伸缩柄 → 恢复默认尺寸
  resizeHandle.addEventListener('dblclick', (e) => {
    e.preventDefault(); e.stopPropagation();
    panel.style.width = '';
    panel.style.height = '';
  });

  const onPointerMove = (e: PointerEvent) => {
    if (dragInfo) {
      panel.style.left = (dragInfo.px + e.clientX - dragInfo.sx) + 'px';
      panel.style.top = (dragInfo.py + e.clientY - dragInfo.sy) + 'px';
      panel.style.transform = 'none';
    }
    if (resizeInfo) {
      const dx = e.clientX - resizeInfo.sx;
      const dy = e.clientY - resizeInfo.sy;
      panel.style.width = Math.max(380, Math.min(500, resizeInfo.pw + dx)) + 'px';
      panel.style.height = Math.max(100, resizeInfo.ph + dy) + 'px';
    }
  };
  const onTouchMove = (e: TouchEvent) => {
    if (!e.touches[0]) return;
    if (dragInfo) {
      panel.style.left = (dragInfo.px + e.touches[0].clientX - dragInfo.sx) + 'px';
      panel.style.top = (dragInfo.py + e.touches[0].clientY - dragInfo.sy) + 'px';
      panel.style.transform = 'none';
    }
    if (resizeInfo) {
      const dx = e.touches[0].clientX - resizeInfo.sx;
      const dy = e.touches[0].clientY - resizeInfo.sy;
      panel.style.width = Math.max(380, Math.min(500, resizeInfo.pw + dx)) + 'px';
      panel.style.height = Math.max(100, resizeInfo.ph + dy) + 'px';
    }
  };
  const onDragEnd = () => {
    if (dragInfo) {
      panel.style.transition = savedTransition || `background var(--fg-transition,0.25s ease),color var(--fg-transition,0.25s ease)`;
    }
    dragInfo = null;
    resizeInfo = null;
  };

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onDragEnd);
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onDragEnd);
  window.addEventListener('touchcancel', onDragEnd);

  // 预设管理区
  const presetSection = document.createElement('div');
  presetSection.style.cssText =
    `margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid ${V('--fg-border-light', 'rgba(255,255,255,0.08)')};`;

  const presetRow = document.createElement('div');
  presetRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;align-items:center;';

  const pillStyle = (extra: string) =>
    `font-size:${V('--fg-font-xs', '0.72em')};padding:1px 8px;cursor:pointer;border-radius:${V('--fg-radius-sm', '6px')};` +
    `white-space:nowrap;transition:background var(--fg-transition-fast,0.15s ease);min-height:24px;display:inline-flex;align-items:center;` + extra;

  const renderPresets = () => {
    presetRow.innerHTML = `<span style="font-size:${V('--fg-font-sm', '0.8em')};opacity:0.5;margin-right:4px;color:${V('--fg-text-muted','')}">预设</span>`;
    // "默认" 预设始终在最前
    const defaultPill = document.createElement('span');
    defaultPill.textContent = '默认';
    defaultPill.title = '加载默认预设';
    defaultPill.style.cssText = pillStyle(`border:1px solid ${V('--fg-border', 'rgba(255,255,255,0.25)')};`);
    defaultPill.onclick = () => callbacks.onLoadPreset('默认');
    defaultPill.onmouseenter = () => { defaultPill.style.background = V('--fg-button-hover', 'rgba(255,255,255,0.1)'); };
    defaultPill.onmouseleave = () => { defaultPill.style.background = ''; };
    presetRow.appendChild(defaultPill);
    for (const p of callbacks.getPresets()) {
      const pill = document.createElement('span');
      pill.textContent = p.name;
      pill.title = '右键删除';
      pill.style.cssText = pillStyle(`border:1px solid ${V('--fg-border-light', 'rgba(255,255,255,0.18)')};`);
      pill.onclick = () => callbacks.onLoadPreset(p.name);
      pill.oncontextmenu = async (e) => { e.preventDefault(); if (await confirmAction(`删除预设 "${p.name}"？`)) callbacks.onDeletePreset(p.name); };
      pill.onmouseenter = () => { pill.style.background = V('--fg-button-hover', 'rgba(255,255,255,0.1)'); };
      pill.onmouseleave = () => { pill.style.background = ''; };
      presetRow.appendChild(pill);
    }
    const saveBtn = document.createElement('span');
    saveBtn.textContent = '+';
    saveBtn.title = '保存当前为预设';
    saveBtn.style.cssText = pillStyle(`border:1px solid ${V('--fg-border-light', 'rgba(255,255,255,0.15)')};`);
    saveBtn.onclick = async () => { const n = await safePrompt('预设名称：'); if (n) callbacks.onSavePreset(n); };
    presetRow.appendChild(saveBtn);
    const resetBtn = document.createElement('span');
    resetBtn.textContent = '\u21BA';
    resetBtn.title = '恢复预设默认';
    resetBtn.style.cssText = pillStyle(`border:1px solid ${V('--fg-border-light', 'rgba(255,255,255,0.15)')};color:${V('--fg-danger', '#e88')};`);
    resetBtn.onclick = () => callbacks.onResetDefaults();
    presetRow.appendChild(resetBtn);
    if (callbacks.onToggleDemo && callbacks.getDemoEnabled) {
      const demoLabel = document.createElement('label');
      demoLabel.title = '开启后在启动时加载三个内置演示图（开始/结构/说明文档）';
      demoLabel.style.cssText = pillStyle(`border:1px solid ${V('--fg-border-light', 'rgba(255,255,255,0.15)')};`);
      const demoCheck = document.createElement('input');
      demoCheck.type = 'checkbox';
      demoCheck.checked = callbacks.getDemoEnabled();
      demoCheck.style.cssText = `margin:0 3px 0 0;cursor:pointer;accent-color:${V('--fg-accent', '#5B8FF9')};`;
      demoCheck.addEventListener('change', () => {
        callbacks.onToggleDemo!(demoCheck.checked);
      });
      demoLabel.appendChild(demoCheck);
      demoLabel.appendChild(document.createTextNode('初始演示'));
      presetRow.appendChild(demoLabel);
    }
    if (callbacks.onResetDemo) {
      const demoBtn = document.createElement('span');
      demoBtn.textContent = '\u21BA';
      demoBtn.title = '重置三个内置演示图到初始状态';
      demoBtn.style.cssText = pillStyle(`border:1px solid ${V('--fg-accent','#5B8FF9')};color:${V('--fg-accent','#5B8FF9')};`);
      demoBtn.onclick = () => callbacks.onResetDemo!();
      presetRow.appendChild(demoBtn);
    }
  };
  renderPresets();
  presetSection.appendChild(presetRow);
  // presetSection attached below, after updateSection

  // 路径标签（需要跨作用域访问，提前声明）
  let pathLabel: HTMLSpanElement | null = null;

  // 目录选择
  if (callbacks.onOpenFolder) {
    const folderSection = document.createElement('div');
    folderSection.style.cssText =
      `margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid ${V('--fg-border-light', 'rgba(255,255,255,0.08)')};`;
    const folderRow = document.createElement('div');
    folderRow.style.cssText = 'display:flex;align-items:center;gap:6px;';
    pathLabel = document.createElement('span');
    pathLabel.style.cssText =
      `font-size:${V('--fg-font-xs', '0.72em')};opacity:0.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;` +
      `color:${V('--fg-text-muted', '')};`;
    pathLabel.textContent = callbacks.getFolderPath?.() || '（未选择）';

    const importer = callbacks.getFileImporter?.();
    if (importer) {
      importer.style.cssText +=
        `;font-size:${V('--fg-font-xs', '0.72em')};padding:2px 8px;background:${V('--fg-button-bg', 'rgba(255,255,255,0.08)')};` +
        `color:${V('--fg-text', '#ccc')};border:1px solid ${V('--fg-border-light', 'rgba(255,255,255,0.15)')};` +
        `border-radius:${V('--fg-radius-sm', '6px')};`;
      importer.textContent = '存储目录';
      folderRow.appendChild(importer);
    } else if (callbacks.onImportFiles) {
      // 移动端：用 <label>（不是 <button>）包裹 <input type="file">
      // <button> 在某些 WebView 会吞掉子元素的触摸事件 → label 不会
      const openBtn = document.createElement('label');
      openBtn.textContent = '存储目录';
      openBtn.style.cssText =
        `position:relative;overflow:hidden;display:inline-block;` +
        `font-size:${V('--fg-font-xs', '0.72em')};padding:2px 8px;cursor:pointer;` +
        `background:${V('--fg-button-bg', 'rgba(255,255,255,0.08)')};` +
        `color:${V('--fg-text', '#ccc')};` +
        `border:1px solid ${V('--fg-border-light', 'rgba(255,255,255,0.15)')};` +
        `border-radius:${V('--fg-radius-sm', '6px')};`;

      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.json,application/json';
      fileInput.multiple = true;
      fileInput.style.cssText =
        'position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;cursor:pointer;';

      fileInput.addEventListener('change', async () => {
        const files = fileInput.files;
        if (!files || files.length === 0) return;
        await callbacks.onImportFiles?.(files);
        fileInput.value = '';
        if (pathLabel) pathLabel.textContent = callbacks.getFolderPath?.() || '（未选择）';
      });

      openBtn.appendChild(fileInput);
      folderRow.appendChild(openBtn);
    } else {
      const openBtn = document.createElement('button');
      openBtn.textContent = '存储目录';
      openBtn.style.cssText =
        `font-size:${V('--fg-font-xs', '0.72em')};padding:2px 8px;cursor:pointer;` +
        `background:${V('--fg-button-bg', 'rgba(255,255,255,0.08)')};` +
        `color:${V('--fg-text', '#ccc')};` +
        `border:1px solid ${V('--fg-border-light', 'rgba(255,255,255,0.15)')};` +
        `border-radius:${V('--fg-radius-sm', '6px')};`;
      openBtn.onclick = async () => {
        await callbacks.onOpenFolder?.();
        if (pathLabel) pathLabel.textContent = callbacks.getFolderPath?.() || '（未选择）';
      };
      folderRow.appendChild(openBtn);
    }
    folderRow.appendChild(pathLabel);
    folderSection.appendChild(folderRow);
    panel.appendChild(folderSection);
  }

  // 自动检查更新
  if (callbacks.getAutoUpdate) {
    const updateSection = document.createElement('div');
    updateSection.style.cssText =
      `margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid ${V('--fg-border-light', 'rgba(255,255,255,0.08)')};`;
    const updateRow = document.createElement('label');
    updateRow.style.cssText = `display:flex;align-items:center;gap:8px;font-size:${V('--fg-font-sm', '0.8em')};cursor:pointer;`;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = callbacks.getAutoUpdate();
    cb.addEventListener('change', () => callbacks.onToggleAutoUpdate?.(cb.checked));
    updateRow.appendChild(cb);
    const lbl = document.createElement('span');
    lbl.textContent = '自动检查GitHub更新';
    lbl.style.cssText = 'opacity:0.7;flex:1;';
    updateRow.appendChild(lbl);
    const checkBtn = document.createElement('button');
    checkBtn.textContent = '检查更新';
    checkBtn.style.cssText =
      `font-size:${V('--fg-font-xs', '0.72em')};padding:2px 8px;cursor:pointer;` +
      `background:${V('--fg-button-bg', 'rgba(255,255,255,0.08)')};` +
      `color:${V('--fg-text', '#ccc')};` +
      `border:1px solid ${V('--fg-border-light', 'rgba(255,255,255,0.15)')};` +
      `border-radius:${V('--fg-radius-sm', '6px')};`;
    checkBtn.onclick = (e) => { e.preventDefault(); callbacks.onCheckUpdate?.(); };
    updateRow.appendChild(checkBtn);
    const dlBtn = document.createElement('button');
    dlBtn.textContent = '下载安装';
    dlBtn.style.cssText =
      `font-size:${V('--fg-font-xs', '0.72em')};padding:2px 8px;cursor:pointer;` +
      `background:rgba(74,108,247,0.2);color:#8aafff;` +
      `border:1px solid rgba(74,108,247,0.3);` +
      `border-radius:${V('--fg-radius-sm', '6px')};`;
    dlBtn.onclick = (e) => { e.preventDefault(); callbacks.onDownloadInstall?.(); };
    updateRow.appendChild(dlBtn);
    updateSection.appendChild(updateRow);
    panel.appendChild(updateSection);
  }

  // 预设设置（放在自动检查更新下方）
  panel.appendChild(presetSection);

  const bodyWrap = document.createElement('div');
  bodyWrap.appendChild(settingsBody);
  panel.appendChild(bodyWrap);
  parent.appendChild(panel);

  return {
    panel,
    show: () => {
      panel.style.display = 'block';
      renderPresets();
      if (pathLabel) {
        pathLabel.textContent = callbacks.getFolderPath?.() || '（未选择）';
      }
    },
    hide: () => { panel.style.display = 'none'; },
    updateInfo: () => { renderPresets(); },
  };
}
