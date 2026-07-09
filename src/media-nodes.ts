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

export interface MediaOverlay {
  el: HTMLElement;
  nodeId: string;
  type: 'image' | 'audio' | 'video' | 'md';
  offsetX: number;
  offsetY: number;
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

/** 把本地路径转 file:// URL */
function toFileUrl(p: string): string {
  if (/^[A-Z]:[\\/]/.test(p)) return 'file:///' + p.replace(/\\/g, '/').replace(/^[A-Z]:/, (m: string) => m.toLowerCase());
  return p;
}

export function showMedia(
  container: HTMLElement,
  nodeId: string,
  label: string,
  type: 'image' | 'audio' | 'video' | 'md',
  url: string,
  borderColor: string,
  getWorldPos: () => { x: number; y: number },
  onDragStart?: () => void,
  onDragEnd?: () => void
) {
  hideMedia(nodeId);
  const el = document.createElement('div');
  el.setAttribute('data-media-id', nodeId);
  el.style.cssText =
    'position:absolute;z-index:15;border:3px solid ' + borderColor + ';' +
    `border-radius:0 ${V('--fg-radius-md','10px')} ${V('--fg-radius-md','10px')} ${V('--fg-radius-md','10px')};` +
    `overflow:visible;background:${V('--fg-surface-elevated','rgba(40,42,48,0.92)')};` +
    `pointer-events:auto;touch-action:none;box-shadow:${V('--fg-shadow-md','0 4px 16px rgba(0,0,0,0.3)')};` +
    `transition:background var(--fg-transition,0.25s ease);`;
  const fileUrl = toFileUrl(url);

  // 节点名标签（左上角伸出）
  const nameTag = document.createElement('div');
  nameTag.textContent = label;
  nameTag.style.cssText =
    'position:absolute;top:-22px;left:-3px;background:' + borderColor + ';color:#fff;' +
    `font-size:${V('--fg-font-xxs', '0.65em')};padding:2px 8px;border-radius:${V('--fg-radius-sm', '6px')} ${V('--fg-radius-sm', '6px')} 0 0;white-space:nowrap;` +
    'max-width:200px;overflow:hidden;text-overflow:ellipsis;pointer-events:none;';
  el.appendChild(nameTag);

  // 拖拽手柄
  const handle = document.createElement('div');
  handle.style.cssText =
    'display:flex;align-items:center;justify-content:center;height:24px;' +
    `cursor:move;border-bottom:1px solid ${V('--fg-glass-border','rgba(255,255,255,0.1)')};padding:2px 0;` +
    'touch-action:none;user-select:none;-webkit-user-select:none;';
  const dot = document.createElement('div');
  dot.style.cssText = 'width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.3);';
  handle.appendChild(dot);
  el.appendChild(handle);

  // 内容
  const body = document.createElement('div');
  body.className = 'media-body';
  if (type === 'image') {
    const imgSrc = fileUrl;
    if (!isSafeUrl(imgSrc)) return;
    body.innerHTML = `<img src="${escapeAttr(imgSrc)}" style="display:block;max-width:320px;max-height:320px;" />`;
  } else if (type === 'audio') {
    const audioSrc = fileUrl;
    if (!isSafeUrl(audioSrc)) return;
    body.innerHTML = `<audio controls src="${escapeAttr(audioSrc)}" style="width:100%;height:40px;display:block;"></audio>`;
    body.style.padding = '4px 8px';
    el.style.width = '300px'; // 初始宽度，可伸缩
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
        style="width:340px;height:220px;border:none;" allow="autoplay;encrypted-media" allowfullscreen></iframe>`;
    } else if (/youtube\.com|youtu\.be/i.test(url)) {
      const vid = url.match(/(?:v=|be\/)([\w-]+)/)?.[1] || '';
      body.innerHTML = `<iframe src="//www.youtube.com/embed/${vid}"
        style="width:340px;height:220px;border:none;" allowfullscreen></iframe>`;
    } else {
      const videoSrc = fileUrl;
      if (!isSafeUrl(videoSrc)) return;
      body.innerHTML = `<video controls src="${escapeAttr(videoSrc)}" style="max-width:340px;max-height:260px;display:block;"></video>`;
    }
  } else if (type === 'md') {
    const rawMd = url || '';
    let isEditMode = false;
    const mdDiv = document.createElement('div');
    mdDiv.style.cssText =
      `min-width:280px;max-width:520px;max-height:420px;overflow-y:auto;padding:12px;color:${V('--fg-text','#d0d0d0')};font-size:${V('--fg-font-md','0.85em')};outline:none;word-wrap:break-word;`;
    mdDiv.innerHTML = rawMd ? renderMarkdown(rawMd) : '<em style="color:#888">(空文档)</em>';
    let mdSaveTimer: any;
    mdDiv.addEventListener('input', () => {
      clearTimeout(mdSaveTimer);
      mdSaveTimer = setTimeout(() => {
        const n = (window as any).__graphNodes?.find((n: any) => n.id === nodeId);
        if (n) { n.mediaUrl = mdDiv.textContent; (window as any).__triggerSave?.(); }
      }, 500);
    });
    body.appendChild(mdDiv);

    // 视图切换按钮（挂在 handle 同行左侧）
    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = '编辑';
    toggleBtn.style.cssText =
      `position:absolute;top:2px;left:6px;font-size:${V('--fg-font-xs','0.72em')};padding:0 5px;cursor:pointer;border:1px solid ${V('--fg-border-light','rgba(255,255,255,0.15)')};border-radius:${V('--fg-radius-sm','6px')};background:transparent;color:${V('--fg-text-muted','#999')};z-index:2;`;
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
    el.appendChild(toggleBtn);
  }
  el.appendChild(body);

  // 收起按钮
  const closeBtn = document.createElement('div');
  closeBtn.textContent = '\u2715';
  closeBtn.style.cssText =
    `position:absolute;top:2px;right:6px;width:16px;height:16px;font-size:9px;opacity:0.5;cursor:pointer;color:${V('--fg-text','#ccc')};line-height:16px;text-align:center;border-radius:${V('--fg-radius-sm','6px')};z-index:1;transition:all 0.15s ease;`;
  closeBtn.onclick = () => hideMedia(nodeId);
  closeBtn.onmouseenter = () => { closeBtn.style.opacity = '1'; closeBtn.style.background = `var(--fg-accent,#5B8FF9)`; closeBtn.style.color = '#fff'; };
  closeBtn.onmouseleave = () => { closeBtn.style.opacity = '0.5'; closeBtn.style.background = 'transparent'; closeBtn.style.color = V('--fg-text','#ccc'); };
  el.appendChild(closeBtn);

  // 存储 media type 到 DOM，resize 需要
  el.setAttribute('data-media-type', type);

  // 伸缩手柄（右下角圆点）
  const resizer = document.createElement('div');
  resizer.style.cssText =
    'position:absolute;right:4px;bottom:4px;width:12px;height:12px;border-radius:50%;' +
    'background:rgba(255,255,255,0.3);cursor:nwse-resize;z-index:2;touch-action:none;user-select:none;';
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
  el.appendChild(resizer);

  container.appendChild(el);

  const ov: MediaOverlay = { el, nodeId, type, offsetX: 0, offsetY: 0 };
  overlays.set(nodeId, ov);

  // 拖拽逻辑 - 使用全局状态，不依赖 pointer capture
  handle.addEventListener('dblclick', () => { ov.offsetX = 0; ov.offsetY = 0; });

  const startDrag = (pt: { clientX: number; clientY: number }) => {
    setGlobalDragState('move', el, pt.clientX, pt.clientY, ov, onDragStart, onDragEnd);
  };
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    startDrag(e);
  });
  handle.addEventListener('touchstart', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.touches[0]) startDrag(e.touches[0]);
  }, { passive: false });

  positionMedia(nodeId, getWorldPos);
}

export function positionMedia(nodeId: string, getWorldPos: () => { x: number; y: number }) {
  const ov = overlays.get(nodeId);
  if (!ov) return;
  const pos = getWorldPos();
  const w = ov.el.offsetWidth || 200;
  const h = ov.el.offsetHeight || 100;
  ov.el.style.left = (pos.x - w / 2 + ov.offsetX) + 'px';
  ov.el.style.top = (pos.y - h / 2 + ov.offsetY) + 'px';
}

export function hideMedia(nodeId: string) {
  const ov = overlays.get(nodeId);
  if (ov) { ov.el.remove(); overlays.delete(nodeId); }
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
