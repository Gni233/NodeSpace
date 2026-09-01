export interface MarkdownSourceTarget {
  path: string;
  absolutePath: string;
  title: string;
  heading?: string;
  headingPath?: string;
  block?: string;
  line?: number;
  editable?: boolean;
}

export type MarkdownSavePlan =
  | { kind: 'noop' }
  | { kind: 'conflict'; diskContent: string }
  | { kind: 'write'; content: string };

/**
 * Small, UI-independent edit transaction. The original source stays as the
 * comparison base until a write succeeds, so an outside edit can never be
 * overwritten silently.
 */
export class MarkdownEditSession {
  private base: string;
  private draftValue: string;
  private conflictValue: string | null = null;

  constructor(content: string) {
    this.base = content;
    this.draftValue = content;
  }

  get baseContent(): string { return this.base; }
  get draft(): string { return this.draftValue; }
  get dirty(): boolean { return this.draftValue !== this.base; }
  get conflicted(): boolean { return this.conflictValue !== null; }
  get externalContent(): string | null { return this.conflictValue; }

  updateDraft(content: string): void {
    this.draftValue = content;
  }

  planSave(diskContent: string, force = false): MarkdownSavePlan {
    if (!this.dirty) return { kind: 'noop' };
    if (!force && diskContent !== this.base) {
      this.conflictValue = diskContent;
      return { kind: 'conflict', diskContent };
    }
    return { kind: 'write', content: this.draftValue };
  }

  markExternalChange(diskContent: string): void {
    if (diskContent !== this.base) this.conflictValue = diskContent;
  }

  acceptSaved(): void {
    this.base = this.draftValue;
    this.conflictValue = null;
  }

  reload(diskContent: string): void {
    this.base = diskContent;
    this.draftValue = diskContent;
    this.conflictValue = null;
  }
}

const escapeHtml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const safeLink = (value: string): string | null => {
  const href = value.trim();
  return /^(https?:|mailto:)/i.test(href) ? escapeHtml(href) : null;
};

const inlineMarkdown = (value: string): string => {
  let rendered = escapeHtml(value);
  rendered = rendered.replace(/`([^`]+)`/g, '<code>$1</code>');
  rendered = rendered.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  rendered = rendered.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  rendered = rendered.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
    const safe = safeLink(href);
    return safe ? `<a href="${safe}" target="_blank" rel="noreferrer">${label}</a>` : label;
  });
  rendered = rendered.replace(/!\[([^\]]*)\]\([^)]+\)/g, '<span class="ns-md-editor-embed">附件 · $1</span>');
  return rendered;
};

/** A deliberately modest, escaped preview; source editing never normalizes Markdown. */
export function renderMarkdownSourcePreview(markdown: string): string {
  const lines = String(markdown || '').split(/\r?\n/);
  const html: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let fenced = false;
  const code: string[] = [];
  const closeList = () => {
    if (!list) return;
    html.push(`</${list}>`);
    list = null;
  };
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      closeList();
      if (fenced) {
        html.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
        code.length = 0;
      }
      fenced = !fenced;
      continue;
    }
    if (fenced) {
      code.push(line);
      continue;
    }
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
    } else if (unordered || ordered) {
      const wanted = unordered ? 'ul' : 'ol';
      if (list !== wanted) {
        closeList();
        list = wanted;
        html.push(`<${wanted}>`);
      }
      html.push(`<li>${inlineMarkdown((unordered || ordered)![1])}</li>`);
    } else if (/^\s*>/.test(line)) {
      closeList();
      html.push(`<blockquote>${inlineMarkdown(line.replace(/^\s*>\s?/, ''))}</blockquote>`);
    } else if (!line.trim()) {
      closeList();
    } else if (/^\s*---+\s*$/.test(line)) {
      closeList();
      html.push('<hr>');
    } else {
      closeList();
      html.push(`<p>${inlineMarkdown(line)}</p>`);
    }
  }
  closeList();
  if (fenced) html.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
  return html.join('') || '<p class="ns-md-editor-empty">这篇笔记还是空的。</p>';
}

const lineOffset = (content: string, line: number): number => {
  if (!Number.isFinite(line) || line <= 1) return 0;
  let offset = 0;
  for (let current = 1; current < line; current++) {
    const next = content.indexOf('\n', offset);
    if (next < 0) return content.length;
    offset = next + 1;
  }
  return offset;
};

/** Locate a projected heading/block in the unmodified source document. */
export function markdownFocusOffset(content: string, target: Pick<MarkdownSourceTarget, 'heading' | 'headingPath' | 'block' | 'line'>): number {
  if (target.block) {
    const escaped = target.block.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`(^|\\n)[^\\n]*\\^${escaped}(?:\\s*$)`, 'm').exec(content);
    if (match) return match.index + (match[1] ? 1 : 0);
  }
  const wantedPath = String(target.headingPath || '').split('#').map(part => part.trim()).filter(Boolean);
  const wantedHeading = String(target.heading || '').replace(/^#+\s*/, '').trim();
  if (wantedPath.length > 0 || wantedHeading) {
    const stack: string[] = [];
    const headingPattern = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/gm;
    for (const match of content.matchAll(headingPattern)) {
      const level = match[1].length;
      const title = match[2].trim();
      stack.length = Math.max(0, level - 1);
      stack[level - 1] = title;
      const path = stack.filter(Boolean);
      if ((wantedPath.length > 0 && path.join('#') === wantedPath.join('#'))
        || (wantedPath.length === 0 && title === wantedHeading)) return match.index || 0;
    }
  }
  return target.line ? lineOffset(content, target.line) : 0;
}

export interface MarkdownSourceEditorDependencies {
  readFile: (target: MarkdownSourceTarget) => Promise<string>;
  writeFile: (target: MarkdownSourceTarget, content: string) => Promise<void>;
  confirmDiscard: (title: string) => Promise<boolean>;
  openInObsidian?: (target: MarkdownSourceTarget) => void;
  onSaved?: (target: MarkdownSourceTarget, content: string) => void | Promise<void>;
  notify?: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export interface MarkdownSourceEditor {
  open: (target: MarkdownSourceTarget) => Promise<boolean>;
  requestClose: () => Promise<boolean>;
  closeNow: () => void;
  hasDraft: () => boolean;
  isOpen: () => boolean;
  activePath: () => string | null;
  handleExternalChange: (path: string) => Promise<void>;
}

const icon = (path: string) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;

export function createMarkdownSourceEditor(container: HTMLElement, dependencies: MarkdownSourceEditorDependencies): MarkdownSourceEditor {
  const root = document.createElement('aside');
  root.className = 'ns-md-editor';
  root.setAttribute('aria-label', 'Markdown 原文编辑器');
  root.hidden = true;
  root.innerHTML = `
    <header class="ns-md-editor-header">
      <div class="ns-md-editor-identity">
        <span class="ns-md-editor-icon">${icon('<path d="M5 3h14v18H5Z"/><path d="m8 15 2-3 2 3 2-3 2 3M8 8h8"/>')}</span>
        <span class="ns-md-editor-titles"><span class="ns-md-editor-eyebrow">Vault · Markdown 原文</span><strong class="ns-md-editor-title"></strong></span>
      </div>
      <div class="ns-md-editor-header-actions">
        <button class="ns-md-editor-obsidian" type="button">Obsidian</button>
        <button class="ns-md-editor-close" type="button" title="关闭 (Esc)" aria-label="关闭">${icon('<path d="m7 7 10 10M17 7 7 17"/>')}</button>
      </div>
    </header>
    <div class="ns-md-editor-toolbar">
      <div class="ns-md-editor-tabs" role="tablist">
        <button type="button" class="is-active" data-mode="edit" role="tab">编辑</button>
        <button type="button" data-mode="preview" role="tab">预览</button>
      </div>
      <span class="ns-md-editor-state" data-state="saved"><i></i><span>已保存</span></span>
    </div>
    <div class="ns-md-editor-conflict" hidden>
      <div><strong>原文在别处发生了变化</strong><span>你的草稿仍在。请选择重新载入，或确认用当前草稿覆盖。</span></div>
      <div><button type="button" data-action="reload">重新载入</button><button type="button" class="is-danger" data-action="overwrite">仍然覆盖</button></div>
    </div>
    <div class="ns-md-editor-body">
      <textarea class="ns-md-editor-textarea" aria-label="Markdown 原文" spellcheck="false"></textarea>
      <article class="ns-md-editor-preview fg-media-markdown" hidden></article>
    </div>
    <footer class="ns-md-editor-footer">
      <span class="ns-md-editor-hint">Ctrl + S 保存 · Esc 返回画布</span>
      <button class="ns-md-editor-save" type="button">保存原文</button>
    </footer>`;
  container.appendChild(root);

  const title = root.querySelector<HTMLElement>('.ns-md-editor-title')!;
  const textarea = root.querySelector<HTMLTextAreaElement>('.ns-md-editor-textarea')!;
  const preview = root.querySelector<HTMLElement>('.ns-md-editor-preview')!;
  const state = root.querySelector<HTMLElement>('.ns-md-editor-state')!;
  const stateText = state.querySelector<HTMLElement>('span')!;
  const conflict = root.querySelector<HTMLElement>('.ns-md-editor-conflict')!;
  const saveButton = root.querySelector<HTMLButtonElement>('.ns-md-editor-save')!;
  const obsidianButton = root.querySelector<HTMLButtonElement>('.ns-md-editor-obsidian')!;
  const modeButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-mode]')];
  let target: MarkdownSourceTarget | null = null;
  let session: MarkdownEditSession | null = null;
  let mode: 'edit' | 'preview' = 'edit';
  let saving = false;

  const setMode = (next: 'edit' | 'preview') => {
    mode = next;
    for (const button of modeButtons) button.classList.toggle('is-active', button.dataset.mode === mode);
    textarea.hidden = mode !== 'edit';
    preview.hidden = mode !== 'preview';
    if (mode === 'preview') preview.innerHTML = renderMarkdownSourcePreview(session?.draft || '');
    else requestAnimationFrame(() => textarea.focus());
  };

  const renderState = () => {
    const conflicted = !!session?.conflicted;
    const dirty = !!session?.dirty;
    const nextState = conflicted ? 'conflict' : dirty ? 'dirty' : 'saved';
    state.dataset.state = nextState;
    stateText.textContent = conflicted ? '外部修改' : dirty ? '未保存' : '已保存';
    conflict.hidden = !conflicted;
    saveButton.disabled = saving || !target?.editable || (!dirty && !conflicted);
    saveButton.textContent = saving ? '正在保存…' : target?.editable === false ? '只读预览' : '保存原文';
  };

  const focusTarget = () => {
    if (!target || !session || mode !== 'edit') return;
    const offset = markdownFocusOffset(session.draft, target);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(offset, offset);
      const ratio = session!.draft.length > 0 ? offset / session!.draft.length : 0;
      textarea.scrollTop = Math.max(0, textarea.scrollHeight * ratio - textarea.clientHeight * .28);
    });
  };

  const save = async (force = false) => {
    if (!target || !session || saving || target.editable === false) return;
    saving = true;
    renderState();
    try {
      const diskContent = await dependencies.readFile(target);
      const plan = session.planSave(diskContent, force);
      if (plan.kind === 'noop') {
        renderState();
        return;
      }
      if (plan.kind === 'conflict') {
        dependencies.notify?.('原文在别处已改变；你的草稿没有丢失', 'warning');
        renderState();
        return;
      }
      await dependencies.writeFile(target, plan.content);
      session.acceptSaved();
      renderState();
      dependencies.notify?.(`已保存“${target.title}”`, 'success');
      await dependencies.onSaved?.(target, plan.content);
    } catch (error) {
      dependencies.notify?.(`保存失败：${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      saving = false;
      renderState();
    }
  };

  const reload = async () => {
    if (!target || !session) return;
    try {
      const content = session.externalContent ?? await dependencies.readFile(target);
      session.reload(content);
      textarea.value = content;
      preview.innerHTML = renderMarkdownSourcePreview(content);
      renderState();
      focusTarget();
      dependencies.notify?.('已载入磁盘上的最新原文', 'info');
    } catch (error) {
      dependencies.notify?.(`重新载入失败：${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  };

  const closeNow = () => {
    root.hidden = true;
    root.classList.remove('is-visible');
    container.classList.remove('is-markdown-editor-open');
    target = null;
    session = null;
  };

  const requestClose = async (): Promise<boolean> => {
    if (!session?.dirty || await dependencies.confirmDiscard(target?.title || '这篇笔记')) {
      closeNow();
      return true;
    }
    return false;
  };

  textarea.addEventListener('input', () => {
    session?.updateDraft(textarea.value);
    if (mode === 'preview') preview.innerHTML = renderMarkdownSourcePreview(textarea.value);
    renderState();
  });
  for (const button of modeButtons) button.addEventListener('click', () => setMode(button.dataset.mode === 'preview' ? 'preview' : 'edit'));
  root.querySelector('.ns-md-editor-close')?.addEventListener('click', () => { void requestClose(); });
  root.querySelector('[data-action="reload"]')?.addEventListener('click', () => { void reload(); });
  root.querySelector('[data-action="overwrite"]')?.addEventListener('click', () => { void save(true); });
  saveButton.addEventListener('click', () => { void save(); });
  obsidianButton.addEventListener('click', () => { if (target) dependencies.openInObsidian?.(target); });
  root.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void save();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      void requestClose();
    }
  });

  return {
    async open(nextTarget) {
      const sameTarget = target?.path === nextTarget.path;
      if (session?.dirty && !sameTarget && !await dependencies.confirmDiscard(target?.title || '这篇笔记')) return false;
      try {
        if (!sameTarget || !session) {
          const content = await dependencies.readFile(nextTarget);
          session = new MarkdownEditSession(content);
          textarea.value = content;
          preview.innerHTML = renderMarkdownSourcePreview(content);
        }
        target = nextTarget;
        title.textContent = nextTarget.title;
        obsidianButton.hidden = !dependencies.openInObsidian;
        root.hidden = false;
        container.classList.add('is-markdown-editor-open');
        requestAnimationFrame(() => root.classList.add('is-visible'));
        setMode(nextTarget.editable === false ? 'preview' : 'edit');
        renderState();
        focusTarget();
        return true;
      } catch (error) {
        dependencies.notify?.(`无法读取原文：${error instanceof Error ? error.message : String(error)}`, 'error');
        return false;
      }
    },
    requestClose,
    closeNow,
    hasDraft: () => !!session?.dirty,
    isOpen: () => !root.hidden,
    activePath: () => target?.path || null,
    async handleExternalChange(path) {
      if (!target || !session || target.path !== path) return;
      try {
        const diskContent = await dependencies.readFile(target);
        if (session.dirty) {
          session.markExternalChange(diskContent);
          if (session.conflicted) dependencies.notify?.('正在编辑的原文已在外部改变；草稿已保留', 'warning');
        } else {
          session.reload(diskContent);
          textarea.value = diskContent;
          preview.innerHTML = renderMarkdownSourcePreview(diskContent);
        }
        renderState();
      } catch {
        dependencies.notify?.('正在编辑的原文已移动或暂时无法读取', 'warning');
      }
    },
  };
}
