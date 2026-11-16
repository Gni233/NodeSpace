import { isStoredAttachment, resolveBrowserAttachment } from './media-assets';
import { bindMediaTextInput, type createMediaTextEditor } from './media-text-editor';
import { renderMathInMarkdown } from './markdown-math';
/**
 * 多媒体节点：在画布上方叠加 HTML 元素显示图片/音频/视频/MD
 */

/** 简易 Markdown → HTML */
function renderMarkdown(md: string): string {
  return renderMathInMarkdown(md, renderMarkdownContent);
}

function renderMarkdownContent(md: string): string {
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = md.split(/\r?\n/);
  let html = '';
  let inList = false;
  let fence = '';
  const code: string[] = [];
  for (const line of lines) {
    const candidate = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (candidate && candidate[1][0] === fence[0] && candidate[1].length >= fence.length && !candidate[2].trim()) {
        html += `<pre><code>${escape(code.join('\n'))}</code></pre>`;
        code.length = 0;
        fence = '';
      } else code.push(line);
      continue;
    }
    if (candidate) {
      if (inList) { html += '</ul>'; inList = false; }
      fence = candidate[1];
      continue;
    }
    const heading = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*$/.exec(line);
    if (heading) {
      if (inList) { html += '</ul>'; inList = false; }
      const level = heading[1].length;
      html += `<h${level}>${inlineMarkdown(heading[2].replace(/[ \t]+#+$/, ''))}</h${level}>`;
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
  if (fence) html += `<pre><code>${escape(code.join('\n'))}</code></pre>`;
  return html;
}

/** 行内 Markdown：粗体、斜体、代码、链接 */
function inlineMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="background:var(--fg-input-bg);padding:1px 4px;border-radius:3px;">$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, (_match, label, escapedUrl) => {
      const url = escapedUrl.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
      if (!isSafeMarkdownLink(url)) return label;
      return `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer" style="color:var(--fg-accent)">${label}</a>`;
    });
}

function isSafeMarkdownLink(url: string): boolean {
  if (!/^(?:https?:\/\/|mailto:|\/|\.\.?\/|#)/i.test(url)) return false;
  try { return ['http:', 'https:', 'mailto:'].includes(new URL(url, 'https://nodespace.invalid/').protocol); }
  catch { return false; }
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
  releaseAttachment?: () => void;
  endTextEdit?: () => void;
}

const MEDIA_LABELS: Record<MediaType, string> = {
  image: '图像', audio: '音频', video: '视频', pdf: 'PDF', md: '文档',
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
    el.style.setProperty('--media-preview-body-max', 'none');
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
const syncReaderPresence = () => {
  document.documentElement.classList.toggle(
    'has-media-reader',
    [...overlays.values()].some(overlay => overlay.presentation === 'reader'),
  );
};

window.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || event.isComposing || event.keyCode === 229) return;
  const reader = [...overlays.values()].find(overlay => overlay.presentation === 'reader');
  if (!reader) return;
  event.preventDefault();
  event.stopPropagation();
  hideMedia(reader.nodeId, true);
}, { capture: true });

/** 把本地路径转 file:// URL */
export function toFileUrl(p: string): string {
  const encodePath = (value: string) => value.split('/').map(encodeURIComponent).join('/');
  if (/^[a-z]:[\\/]/i.test(p)) return `file:///${p[0].toLowerCase()}:${encodePath(p.slice(2).replace(/\\/g, '/'))}`;
  if (p.startsWith('\\\\')) {
    const [host, ...segments] = p.slice(2).replace(/\\/g, '/').split('/');
    try { return new URL(`file://${host}/${segments.map(encodeURIComponent).join('/')}`).href; }
    catch { return p; }
  }
  if (p.startsWith('/') && !p.startsWith('//')) return 'file://' + encodePath(p);
  return p;
}

function setMediaStatus(body: HTMLElement, text: string) {
  const status = document.createElement('p');
  status.className = 'fg-media-status';
  status.setAttribute('role', 'status');
  status.textContent = text;
  body.replaceChildren(status);
}

function fillPlayableMedia(body: HTMLElement, type: 'image' | 'audio' | 'video', source: string, label: string) {
  const media = document.createElement(type === 'image' ? 'img' : type);
  if (media instanceof HTMLImageElement) media.alt = label;
  else {
    media.controls = true;
    media.preload = 'metadata';
    media.setAttribute('aria-label', label);
    if (media instanceof HTMLVideoElement) media.playsInline = true;
  }
  media.addEventListener('error', () => {
    if (!body.contains(media)) return;
    setMediaStatus(body, `无法加载${MEDIA_LABELS[type]}。`);
  }, { once: true });
  if (type === 'audio') {
    const artwork = document.createElement('div');
    artwork.className = 'fg-media-audio-art';
    artwork.innerHTML = mediaIconSvg(type);
    body.replaceChildren(artwork, media);
  } else body.replaceChildren(media);
  media.src = source;
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
  textEditor?: ReturnType<typeof createMediaTextEditor> | null,
  editSource?: MediaSourceAction,
) {
  const sourceEditor = presentation === 'reader' && type === 'md' ? editSource : undefined;
  let endTextEdit: (() => void) | undefined;
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
  if (presentation === 'reader') {
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', `${MEDIA_LABELS[type]} · ${label}`);
  }
  el.style.setProperty('--media-accent', borderColor);
  const storedAttachment = type !== 'md' && isStoredAttachment(url);
  const fileUrl = storedAttachment ? '' : toFileUrl(url);

  const handle = document.createElement('div');
  handle.className = presentation === 'reader' ? 'fg-media-reader-header' : 'fg-media-preview-handle';
  const identity = document.createElement('div');
  identity.className = 'fg-media-reader-identity';
  const icon = document.createElement('span');
  icon.className = 'fg-media-reader-icon';
  icon.innerHTML = mediaIconSvg(type);
  const titles = document.createElement('span');
  titles.className = 'fg-media-reader-titles';
  if (presentation === 'reader') {
    const eyebrow = document.createElement('span');
    eyebrow.className = 'fg-media-reader-eyebrow';
    eyebrow.textContent = readOnly && !sourceEditor ? `${MEDIA_LABELS[type]} · 只读` : MEDIA_LABELS[type];
    titles.appendChild(eyebrow);
  }
  const title = document.createElement('strong');
  title.className = 'fg-media-reader-title';
  title.textContent = label;
  title.title = label;
  titles.appendChild(title);
  identity.append(icon, titles);
  const headerActions = document.createElement('div');
  headerActions.className = 'fg-media-reader-actions';
  if (presentation === 'reader') {
    for (const action of [sourceEditor, sourceAction]) {
      if (!action) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'fg-media-reader-action';
      button.textContent = action.label;
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        action.onSelect();
      });
      headerActions.appendChild(button);
    }
  }
  handle.append(identity, headerActions);
  el.appendChild(handle);

  // 内容
  const body = document.createElement('div');
  body.className = `media-body fg-media-body fg-media-body-${type}`;
  const addPdfDownload = (source: string) => {
    if (presentation !== 'reader') return;
    const download = document.createElement('a');
    download.className = 'fg-media-reader-action';
    download.textContent = '下载 PDF';
    download.href = source;
    download.download = /\.pdf$/i.test(label) ? label : `${label}.pdf`;
    headerActions.insertBefore(download, headerActions.firstChild);
    if (navigator.pdfViewerEnabled !== false) {
      const fallback = document.createElement('button');
      fallback.type = 'button'; fallback.className = 'fg-media-reader-action';
      fallback.textContent = '无法预览？';
      fallback.onclick = () => { fillPdfBody(source, false); fallback.remove(); };
      headerActions.insertBefore(fallback, download.nextSibling);
    }
  };
  const fillPdfBody = (source: string, inline = navigator.pdfViewerEnabled !== false) => {
    if (inline) {
      body.innerHTML = `<iframe src="${escapeAttr(source)}" title="${escapeAttr(label)}"></iframe>`;
      return;
    }
    const fallback = document.createElement('div');
    fallback.className = 'fg-media-pdf-fallback';
    const icon = document.createElement('div');
    icon.className = 'fg-media-pdf-icon'; icon.innerHTML = mediaIconSvg('pdf');
    const title = document.createElement('strong'); title.textContent = '下载后阅读';
    const description = document.createElement('p');
    description.textContent = '当前环境不支持直接预览 PDF，可以下载后用阅读器打开。';
    const download = document.createElement('a');
    download.className = 'fg-media-reader-action'; download.textContent = '下载 PDF';
    download.href = source; download.download = /\.pdf$/i.test(label) ? label : `${label}.pdf`;
    fallback.append(icon, title, description, download);
    body.replaceChildren(fallback);
  };
  if (storedAttachment) {
    setMediaStatus(body, '正在读取附件…');
    body.setAttribute('aria-busy', 'true');
  } else if (type === 'video' && /bilibili\.com|b23\.tv/i.test(url)) {
    const bv = url.match(/BV\w+/)?.[0] || '';
    body.innerHTML = `<iframe src="//player.bilibili.com/player.html?bvid=${bv}&page=1&high_quality=1&autoplay=0"
      title="${escapeAttr(label)}" allow="autoplay;encrypted-media" allowfullscreen></iframe>`;
  } else if (type === 'video' && /youtube\.com|youtu\.be/i.test(url)) {
    const vid = url.match(/(?:v=|be\/)([\w-]+)/)?.[1] || '';
    body.innerHTML = `<iframe src="//www.youtube.com/embed/${vid}" title="${escapeAttr(label)}" allowfullscreen></iframe>`;
  } else if (type === 'pdf') {
    const pdfSrc = fileUrl;
    if (!isSafeUrl(pdfSrc)) return;
    addPdfDownload(pdfSrc);
    fillPdfBody(pdfSrc);
  } else if (type === 'md') {
    let rawMd = url || '';
    const mdDiv = document.createElement('div');
    mdDiv.className = sourceEditor ? 'fg-media-markdown fg-media-markdown-editable' : 'fg-media-markdown';
    mdDiv.innerHTML = rawMd ? renderMarkdown(rawMd) : '<em style="color:#888">(空文档)</em>';
    body.appendChild(mdDiv);
    if (sourceEditor) {
      mdDiv.addEventListener('click', event => {
        if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        if (event.target instanceof Element && event.target.closest('a')) return;
        if (document.getSelection()?.isCollapsed === false) return;
        event.stopPropagation();
        sourceEditor.onSelect();
      });
    }
    if (!readOnly && textEditor && !sourceEditor) {
      let isEditMode = false;
      const input = document.createElement('textarea');
      input.className = 'fg-media-text-input';
      input.setAttribute('aria-label', '编辑文档内容');
      input.spellcheck = false;
      const finishEdit = () => {
        if (!isEditMode) return;
        if (!input.readOnly && textEditor.update(input.value)) rawMd = input.value;
        textEditor.end();
      };
      endTextEdit = finishEdit;
      bindMediaTextInput(input, value => {
        const saved = textEditor.update(value);
        if (saved) rawMd = value;
        return saved;
      });

      const toggleBtn = document.createElement('button');
      toggleBtn.className = presentation === 'reader' ? 'fg-media-reader-action' : 'fg-media-preview-edit';
      toggleBtn.type = 'button';
      toggleBtn.textContent = '编辑';
      toggleBtn.onclick = () => {
        if (!isEditMode) {
          const value = textEditor.begin();
          if (value === null) { toggleBtn.textContent = '请重新打开'; toggleBtn.disabled = true; return; }
          rawMd = value; input.value = value; input.readOnly = false;
          isEditMode = true;
          toggleBtn.textContent = '预览';
          body.replaceChildren(input);
          input.focus({ preventScroll: true });
        } else {
          finishEdit(); isEditMode = false;
          toggleBtn.textContent = '编辑';
          mdDiv.innerHTML = rawMd ? renderMarkdown(rawMd) : '<em style="color:#888">(空文档)</em>';
          body.replaceChildren(mdDiv);
        }
      };
      headerActions.appendChild(toggleBtn);
    }
  } else if (isSafeUrl(fileUrl)) fillPlayableMedia(body, type, fileUrl, label);
  else return;
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
  headerActions.appendChild(closeBtn);

  // 存储 media type 到 DOM，resize 需要
  el.setAttribute('data-media-type', type);

  // 预览浮窗可伸缩；正式阅读面板由响应式布局接管尺寸。
  const resizer = document.createElement('div');
  resizer.className = 'fg-media-preview-resizer';
  resizer.addEventListener('dblclick', () => {
    el.style.width = ''; el.style.height = '';
    el.style.removeProperty('--media-preview-body-max');
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

  const ov: MediaOverlay = { el, nodeId, type, presentation, offsetX: 0, offsetY: 0, onClose, endTextEdit };
  overlays.set(nodeId, ov);
  syncReaderPresence();
  if (storedAttachment) {
    void resolveBrowserAttachment(url).then(source => {
      if (overlays.get(nodeId) !== ov) { source.release(); return; }
      ov.releaseAttachment = source.release;
      body.removeAttribute('aria-busy');
      if (type === 'pdf') { addPdfDownload(source.value); fillPdfBody(source.value); }
      else fillPlayableMedia(body, type, source.value, label);
      if (presentation === 'preview') positionMedia(nodeId, getWorldPos);
    }).catch(() => {
      if (overlays.get(nodeId) !== ov) return;
      body.removeAttribute('aria-busy');
      setMediaStatus(body, '当前设备找不到这个附件，请在节点中重新选择文件。');
      if (presentation === 'preview') positionMedia(nodeId, getWorldPos);
    });
  }

  // 拖拽逻辑 - 使用全局状态，不依赖 pointer capture
  const isHeaderAction = (event: Event) => event.target instanceof Node && headerActions.contains(event.target);
  handle.addEventListener('dblclick', event => {
    if (isHeaderAction(event)) return;
    ov.offsetX = 0; ov.offsetY = 0;
    if (presentation === 'preview') positionMedia(nodeId, getWorldPos);
  });

  const startDrag = (pt: { clientX: number; clientY: number }) => {
    setGlobalDragState('move', el, pt.clientX, pt.clientY, ov, onDragStart, onDragEnd);
  };
  handle.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (presentation === 'reader' || isHeaderAction(e)) return;
    e.preventDefault();
    startDrag(e);
  });
  handle.addEventListener('touchstart', (e) => {
    e.stopPropagation();
    if (presentation === 'reader' || isHeaderAction(e)) return;
    e.preventDefault();
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
    ov.endTextEdit?.();
    ov.el.remove();
    ov.releaseAttachment?.();
    overlays.delete(nodeId);
    syncReaderPresence();
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
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
