import { V } from "./layout-constants";
/**
 * 多媒体节点：在画布上方叠加 HTML 元素显示图片/音频/视频/MD
 */

/** 简易 Markdown → HTML */
function renderMarkdown(md: string): string {
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = md.split('\n');
  let html = '';
  let inList = false;
  for (const line of lines) {
    if (/^### (.+)/.test(line)) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h3 style="margin:8px 0 4px;font-size:1em;font-weight:700;">${escape(RegExp.$1)}</h3>`;
    } else if (/^## (.+)/.test(line)) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h2 style="margin:10px 0 4px;font-size:1.1em;font-weight:700;">${escape(RegExp.$1)}</h2>`;
    } else if (/^# (.+)/.test(line)) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h1 style="margin:12px 0 4px;font-size:1.2em;font-weight:700;">${escape(RegExp.$1)}</h1>`;
    } else if (/^- (.+)/.test(line)) {
      if (!inList) { html += '<ul style="margin:2px 0;padding-left:16px;">'; inList = true; }
      html += `<li>${inlineMarkdown(RegExp.$1)}</li>`;
    } else if (line.trim() === '') {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<br>';
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<p style="margin:4px 0 8px;">${inlineMarkdown(line)}</p>`;
    }
  }
  if (inList) html += '</ul>';
  return html;
}

/** 行内 Markdown：粗体、斜体、代码、链接 */
function inlineMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="background:rgba(255,255,255,0.1);padding:1px 4px;border-radius:3px;">$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" style="color:var(--fg-accent,#5B8FF9)">$1</a>');
}

export type MediaType = 'image' | 'audio' | 'video' | 'pdf' | 'md';
export type MediaPresentation = 'reader' | 'preview';
export interface MediaSourceAction { label: string; onSelect: () => void; }

export interface MediaOverlay {
  el: HTMLElement;
  nodeId: string;
  type: MediaType;
  presentation: MediaPresentation;
  offsetX: number;
  offsetY: number;
  onClose?: () => void;
}

const MEDIA_LABELS: Record<MediaType, string> = {
  image: '图像', audio: '音频', video: '视频', pdf: 'PDF', md: 'Markdown',
};

function mediaIconSvg(type: MediaType): string {
  const paths: Record<MediaType, string> = {
    image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m5 17 4-4 3 3 3-4 4 5"/>',
    audio: '<path d="M9 18V6l10-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>',
    video: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3Z"/>',
    pdf: '<path d="M6 2h8l4 4v16H6Z"/><path d="M14 2v5h5M9 16h6M9 12h3"/>',
    md: '<path d="M5 3h14v18H5Z"/><path d="m8 15 2-3 2 3 2-3 2 3M8 8h8"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[type]}</svg>`;
}

// 全局拖拽状态：HarmonyOS WebView 不支持 pointer capture，用全局标记代替
let globalDragType: 'move' | 'resize' | null = null;
let globalDragTarget: HTMLElement | null = null;
let globalDragSX = 0, globalDragSY = 0, globalDragOX = 0, globalDragOY = 0;
let globalDragSW = 0, globalDragSH = 0;
let globalDragOV: MediaOverlay | null = null;
let globalDragOnStart: (() => void) | undefined;
let globalDragOnEnd: (() => void) | undefined;

// 全局 pointer/touch 监听（capture 阶段，viewport 之前拦截）
window.addEventListener('pointerdown', (e) => {
  if (globalDragType) return;
}, { capture: true });
window.addEventListener('touchstart', (e) => {
  if (globalDragType) return;
}, { capture: true });

window.addEventListener('pointermove', (e) => {
  if (!globalDragType || !globalDragTarget) return;
  e.preventDefault();
  if (globalDragType === 'move' && globalDragOV) {
    globalDragOV.offsetX = globalDragOX + (e.clientX - globalDragSX);
    globalDragOV.offsetY = globalDragOY + (e.clientY - globalDragSY);
    const el = globalDragTarget;
    el.style.left = (parseFloat(el.style.left) || 0) + (e.clientX - globalDragSX) + 'px';
    el.style.top = (parseFloat(el.style.top) || 0) + (e.clientY - globalDragSY) + 'px';
    globalDragSX = e.clientX; globalDragSY = e.clientY;
    globalDragOX = globalDragOV.offsetX; globalDragOY = globalDragOV.offsetY;
  } else if (globalDragType === 'resize') {
    const el = globalDragTarget!;
    const type = el.getAttribute('data-media-type') as string;
    let dw = Math.max(120, globalDragSW + (e.clientX - globalDragSX));
    let dh = Math.max(60, globalDragSH + (e.clientY - globalDragSY));
    if (type === 'image' || type === 'video') {
      const ratio = globalDragSW / Math.max(1, globalDragSH);
      if (Math.abs(e.clientX - globalDragSX) > Math.abs(e.clientY - globalDragSY)) {
        dh = Math.max(60, dw / ratio);
      } else {
        dw = Math.max(120, dh * ratio);
      }
    }
    el.style.width = dw + 'px';
    el.style.height = dh + 'px';
    el.querySelectorAll('img, video, iframe, .media-body, [contenteditable]').forEach((inner) => {
      const iw = dw - 16, ih = dh - 30;
      (inner as HTMLElement).style.maxWidth = iw + 'px';
      (inner as HTMLElement).style.maxHeight = ih + 'px';
      (inner as HTMLElement).style.width = iw + 'px';
      (inner as HTMLElement).style.height = ih + 'px';
    });
    const audio = el.querySelector('audio');
    if (audio) { (audio as HTMLElement).style.width = (dw - 16) + 'px'; }
  }
});
window.addEventListener('touchmove', (e) => {
  if (!globalDragType || !globalDragTarget) return;
  e.preventDefault();
  const pt = e.touches[0];
  if (!pt) return;
  if (globalDragType === 'move' && globalDragOV) {
    globalDragOV.offsetX = globalDragOX + (pt.clientX - globalDragSX);
    globalDragOV.offsetY = globalDragOY + (pt.clientY - globalDragSY);
    const el = globalDragTarget;
    el.style.left = (parseFloat(el.style.left) || 0) + (pt.clientX - globalDragSX) + 'px';
    el.style.top = (parseFloat(el.style.top) || 0) + (pt.clientY - globalDragSY) + 'px';
    globalDragSX = pt.clientX; globalDragSY = pt.clientY;
    globalDragOX = globalDragOV.offsetX; globalDragOY = globalDragOV.offsetY;
  }
}, { passive: false });

window.addEventListener('pointerup', () => { if (globalDragType) { globalDragOnEnd?.(); globalDragType = null; } });
window.addEventListener('touchend', () => { if (globalDragType) { globalDragOnEnd?.(); globalDragType = null; } });
window.addEventListener('touchcancel', () => { if (globalDragType) { globalDragOnEnd?.(); globalDragType = null; } });

function setGlobalDragState(type: 'move' | 'resize', el: HTMLElement, sx: number, sy: number, ov?: MediaOverlay, onStart?: () => void, onEnd?: () => void) {
  globalDragType = type;
  globalDragTarget = el;
  globalDragSX = sx; globalDragSY = sy;
  globalDragOnStart = onStart;
  globalDragOnEnd = onEnd;
  if (ov) { globalDragOV = ov; globalDragOX = ov.offsetX; globalDragOY = ov.offsetY; }
  if (type === 'resize') { globalDragSW = el.offsetWidth; globalDragSH = el.offsetHeight; }
  onStart?.();
}

function isSafeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return ['http:', 'https:', 'file:', 'blob:', 'data:'].includes(u.protocol);
  } catch {
    // For Windows paths like C:..., treat as file after toFileUrl conversion
    return /^[A-Z]:[\/]/.test(url);
  }
}

const overlays: Map<string, MediaOverlay> = new Map();

window.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  const reader = [...overlays.values()].find(overlay => overlay.presentation === 'reader');
  if (!reader) return;
  event.preventDefault();
  event.stopPropagation();
  hideMedia(reader.nodeId, true);
}, { capture: true });

/** 把本地路径转 file:// URL */
function toFileUrl(p: string): string {
  if (/^[A-Z]:[\\/]/.test(p)) return 'file:///' + p.replace(/\\/g, '/').replace(/^[A-Z]:/, (m: string) => m.toLowerCase());
  return p;
}

export function showMedia(
  container: HTMLElement,
  nodeId: string,
  label: string,
  type: MediaType,
  url: string,
  borderColor: string,
  getWorldPos: () => { x: number; y: number },
  onDragStart?: () => void,
  onDragEnd?: () => void,
  readOnly = false,
  onClose?: () => void,
  presentation: MediaPresentation = 'reader',
  sourceAction?: MediaSourceAction,
) {
  if (presentation === 'reader') {
    for (const [openId, overlay] of overlays) {
      if (openId !== nodeId && overlay.presentation === 'reader') hideMedia(openId, true);
    }
  }
  hideMedia(nodeId);
  const el = document.createElement('div');
  el.setAttribute('data-media-id', nodeId);
  el.setAttribute('data-media-presentation', presentation);
  el.className = presentation === 'reader' ? 'fg-media-reader' : 'fg-media-preview';
  el.style.setProperty('--media-accent', borderColor);
  if (presentation === 'preview') {
    el.style.cssText +=
      'position:absolute;z-index:15;border:2px solid color-mix(in srgb, var(--media-accent) 68%, transparent);' +
      `border-radius:${V('--fg-radius-md','10px')};` +
      `overflow:visible;background:${V('--fg-surface-elevated','rgba(40,42,48,0.92)')};` +
      `pointer-events:auto;touch-action:none;box-shadow:${V('--fg-shadow-md','0 4px 16px rgba(0,0,0,0.3)')};`;
  }
  const fileUrl = toFileUrl(url);

  const handle = document.createElement('div');
  let headerActions: HTMLElement | null = null;
  if (presentation === 'reader') {
    handle.className = 'fg-media-reader-header';
    const identity = document.createElement('div');
    identity.className = 'fg-media-reader-identity';
    const icon = document.createElement('span');
    icon.className = 'fg-media-reader-icon';
    icon.innerHTML = mediaIconSvg(type);
    const titles = document.createElement('span');
    titles.className = 'fg-media-reader-titles';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'fg-media-reader-eyebrow';
    eyebrow.textContent = `${MEDIA_LABELS[type]} · ${readOnly ? '来源视图' : '节点内容'}`;
    const title = document.createElement('strong');
    title.className = 'fg-media-reader-title';
    title.textContent = label;
    titles.append(eyebrow, title);
    identity.append(icon, titles);
    headerActions = document.createElement('div');
    headerActions.className = 'fg-media-reader-actions';
    if (sourceAction) {
      const sourceButton = document.createElement('button');
      sourceButton.type = 'button';
      sourceButton.className = 'fg-media-reader-action';
      sourceButton.textContent = sourceAction.label;
      sourceButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        sourceAction.onSelect();
      });
      headerActions.appendChild(sourceButton);
    }
    handle.append(identity, headerActions);
    el.appendChild(handle);
  } else {
    const nameTag = document.createElement('div');
    nameTag.className = 'fg-media-preview-title';
    nameTag.textContent = label;
    el.appendChild(nameTag);
    handle.className = 'fg-media-preview-handle';
    const dot = document.createElement('div');
    dot.className = 'fg-media-preview-grip';
    handle.appendChild(dot);
    el.appendChild(handle);
  }

  // 内容
  const body = document.createElement('div');
  body.className = `media-body fg-media-body fg-media-body-${type}`;
  if (type === 'image') {
    const imgSrc = fileUrl;
    if (!isSafeUrl(imgSrc)) return;
    body.innerHTML = `<img src="${escapeAttr(imgSrc)}" alt="${escapeAttr(label)}" />`;
  } else if (type === 'audio') {
    const audioSrc = fileUrl;
    if (!isSafeUrl(audioSrc)) return;
    body.innerHTML = `<div class="fg-media-audio-art">${mediaIconSvg('audio')}</div><audio controls src="${escapeAttr(audioSrc)}"></audio>`;
    if (presentation === 'preview') el.style.width = '300px';
  } else if (type === 'video') {
    // 白色半透明播放三角图标
    const playIcon = document.createElement('div');
    playIcon.style.cssText =
      'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
      'width:0;height:0;border-left:18px solid rgba(255,255,255,0.25);' +
      'border-top:11px solid transparent;border-bottom:11px solid transparent;' +
      'pointer-events:none;z-index:1;';
    body.style.position = 'relative';
    body.appendChild(playIcon);
    if (/bilibili\.com|b23\.tv/i.test(url)) {
      const bv = url.match(/BV\w+/)?.[0] || '';
      // B站嵌入播放器需要 autoplay=0 才能有声音（浏览器策略）
      body.innerHTML = `<iframe src="//player.bilibili.com/player.html?bvid=${bv}&page=1&high_quality=1&autoplay=0"
        allow="autoplay;encrypted-media" allowfullscreen></iframe>`;
    } else if (/youtube\.com|youtu\.be/i.test(url)) {
      const vid = url.match(/(?:v=|be\/)([\w-]+)/)?.[1] || '';
      body.innerHTML = `<iframe src="//www.youtube.com/embed/${vid}" allowfullscreen></iframe>`;
    } else {
      const videoSrc = fileUrl;
      if (!isSafeUrl(videoSrc)) return;
      body.innerHTML = `<video controls src="${escapeAttr(videoSrc)}"></video>`;
    }
  } else if (type === 'pdf') {
    const pdfSrc = fileUrl;
    if (!isSafeUrl(pdfSrc)) return;
    body.innerHTML = `<iframe src="${escapeAttr(pdfSrc)}" title="${escapeAttr(label)}"></iframe>`;
  } else if (type === 'md') {
    const rawMd = url || '';
    let isEditMode = false;
    const mdDiv = document.createElement('div');
    mdDiv.className = 'fg-media-markdown';
    mdDiv.innerHTML = rawMd ? renderMarkdown(rawMd) : '<em style="color:#888">(空文档)</em>';
    let mdSaveTimer: any;
    if (!readOnly) {
      mdDiv.addEventListener('input', () => {
        clearTimeout(mdSaveTimer);
        mdSaveTimer = setTimeout(() => {
          const n = (window as any).__graphNodes?.find((n: any) => n.id === nodeId);
          if (n) { n.mediaUrl = mdDiv.textContent; (window as any).__triggerSave?.(); }
        }, 500);
      });
    }
    body.appendChild(mdDiv);

    // 视图切换按钮（挂在 handle 同行左侧）
    const toggleBtn = document.createElement('button');
    toggleBtn.className = presentation === 'reader' ? 'fg-media-reader-action' : 'fg-media-preview-edit';
    toggleBtn.type = 'button';
    toggleBtn.textContent = '编辑';
    toggleBtn.onclick = () => {
      isEditMode = !isEditMode;
      if (isEditMode) {
        toggleBtn.textContent = '预览';
        mdDiv.textContent = rawMd;
        mdDiv.contentEditable = 'true';
        mdDiv.style.whiteSpace = 'pre-wrap';
      } else {
        toggleBtn.textContent = '编辑';
        const updated = mdDiv.textContent || '';
        mdDiv.contentEditable = 'false';
        mdDiv.style.whiteSpace = '';
        mdDiv.innerHTML = updated ? renderMarkdown(updated) : '<em style="color:#888">(空文档)</em>';
        // 回写原始内容
        const n = (window as any).__graphNodes?.find((n: any) => n.id === nodeId);
        if (n) { n.mediaUrl = updated; (window as any).__triggerSave?.(); }
      }
    };
    if (!readOnly) (headerActions || el).appendChild(toggleBtn);
  }
  el.appendChild(body);

  // 收起按钮
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = presentation === 'reader' ? 'fg-media-reader-close' : 'fg-media-preview-close';
  closeBtn.setAttribute('aria-label', '关闭内容');
  closeBtn.title = '关闭内容 (Esc)';
  closeBtn.textContent = '\u2715';
  closeBtn.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    hideMedia(nodeId, true);
  };
  (headerActions || el).appendChild(closeBtn);

  // 存储 media type 到 DOM，resize 需要
  el.setAttribute('data-media-type', type);

  // 预览浮窗可伸缩；正式阅读面板由响应式布局接管尺寸。
  const resizer = document.createElement('div');
  resizer.className = 'fg-media-preview-resizer';
  resizer.addEventListener('dblclick', () => {
    el.style.width = ''; el.style.height = '';
  });

  const startResize = (pt: { clientX: number; clientY: number }) => {
    setGlobalDragState('resize', el, pt.clientX, pt.clientY, undefined, onDragStart, onDragEnd);
  };
  resizer.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    startResize(e);
  });
  resizer.addEventListener('touchstart', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.touches[0]) startResize(e.touches[0]);
  }, { passive: false });
  if (presentation === 'preview') el.appendChild(resizer);

  container.appendChild(el);

  const ov: MediaOverlay = { el, nodeId, type, presentation, offsetX: 0, offsetY: 0, onClose };
  overlays.set(nodeId, ov);

  // 拖拽逻辑 - 使用全局状态，不依赖 pointer capture
  handle.addEventListener('dblclick', () => { ov.offsetX = 0; ov.offsetY = 0; });

  const startDrag = (pt: { clientX: number; clientY: number }) => {
    setGlobalDragState('move', el, pt.clientX, pt.clientY, ov, onDragStart, onDragEnd);
  };
  handle.addEventListener('pointerdown', (e) => {
    if (presentation === 'reader') { e.stopPropagation(); return; }
    e.preventDefault(); e.stopPropagation();
    startDrag(e);
  });
  handle.addEventListener('touchstart', (e) => {
    if (presentation === 'reader') { e.stopPropagation(); return; }
    e.preventDefault(); e.stopPropagation();
    if (e.touches[0]) startDrag(e.touches[0]);
  }, { passive: false });

  if (presentation === 'preview') positionMedia(nodeId, getWorldPos);
}

export function positionMedia(nodeId: string, getWorldPos: () => { x: number; y: number }) {
  const ov = overlays.get(nodeId);
  if (!ov || ov.presentation === 'reader') return;
  const pos = getWorldPos();
  const w = ov.el.offsetWidth || 200;
  const h = ov.el.offsetHeight || 100;
  ov.el.style.left = (pos.x - w / 2 + ov.offsetX) + 'px';
  ov.el.style.top = (pos.y - h / 2 + ov.offsetY) + 'px';
}

export function hideMedia(nodeId: string, notify = false) {
  const ov = overlays.get(nodeId);
  if (ov) {
    ov.el.remove();
    overlays.delete(nodeId);
    if (notify) ov.onClose?.();
  }
}

export function getMediaSize(nodeId: string): { w: number; h: number } | null {
  const ov = overlays.get(nodeId);
  if (!ov) return null;
  return { w: ov.el.offsetWidth || 200, h: ov.el.offsetHeight || 100 };
}

export function isExpanded(nodeId: string) {
  return overlays.has(nodeId);
}

export function clearAllMedia() {
  for (const [id] of overlays) hideMedia(id);
}

function escapeAttr(s: string) {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
