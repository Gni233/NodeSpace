import { readMarkdownProjection, replaceMarkdownProjection, type MarkdownProjectionTarget } from './markdown-projection-edit';

export type MarkdownProjectionField = 'title' | 'body';

export interface MarkdownSourceTarget {
  path: string;
  absolutePath: string;
  title: string;
  heading?: string;
  headingPath?: string;
  block?: string;
  line?: number;
  editable?: boolean;
  projection?: { target: MarkdownProjectionTarget; field: MarkdownProjectionField };
}

export type MarkdownSavePlan =
  | { kind: 'noop' }
  | { kind: 'conflict'; diskContent: string }
  | { kind: 'write'; content: string };

export type MarkdownWriteResult = { ok: true } | { conflict: true; content: string };

/** Compare saves with the last written text while keeping later edits in the draft. */
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
      this.recordConflict(diskContent);
      return { kind: 'conflict', diskContent };
    }
    return { kind: 'write', content: this.draftValue };
  }

  markExternalChange(diskContent: string): void {
    if (diskContent !== this.base) this.recordConflict(diskContent);
  }

  recordConflict(diskContent: string): void {
    this.conflictValue = diskContent;
  }

  acceptSaved(writtenContent: string): void {
    this.base = writtenContent;
    this.conflictValue = null;
  }

  reload(diskContent: string): void {
    this.base = diskContent;
    this.draftValue = diskContent;
    this.conflictValue = null;
  }
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
  writeFile: (target: MarkdownSourceTarget, content: string, expectedContent: string) => Promise<MarkdownWriteResult>;
  confirmDiscard: (title: string) => Promise<boolean>;
  openInObsidian?: (target: MarkdownSourceTarget) => void;
  onSaved?: (target: MarkdownSourceTarget, content: string) => void | Promise<void>;
  notify?: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  createLiveInput?: (parent: HTMLElement, onInput: (content: string) => void) => Promise<MarkdownLiveInput>;
}

export interface MarkdownLiveInput {
  setValue: (content: string) => void;
  setReadOnly: (value: boolean) => void;
  setLabel: (value: string) => void;
  focusAt: (offset: number) => void;
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
        <span class="ns-md-editor-titles"><span class="ns-md-editor-eyebrow"></span><strong class="ns-md-editor-title"></strong></span>
      </div>
      <div class="ns-md-editor-header-actions">
        <span class="ns-md-editor-state" data-state="saved"><i></i><span>已保存</span></span>
        <button class="ns-md-editor-obsidian" type="button">Obsidian</button>
        <button class="ns-md-editor-close" type="button" title="关闭 (Esc)" aria-label="关闭">${icon('<path d="m7 7 10 10M17 7 7 17"/>')}</button>
      </div>
    </header>
    <div class="ns-md-editor-conflict" hidden>
      <div><strong>原文在别处发生了变化</strong><span>你的草稿仍在。请选择重新载入，或确认用当前草稿覆盖。</span></div>
      <div><button type="button" data-action="reload">重新载入</button><button type="button" class="is-danger" data-action="overwrite">仍然覆盖</button></div>
    </div>
    <div class="ns-md-editor-body">
      <div class="ns-md-editor-live" hidden></div>
      <textarea class="ns-md-editor-textarea" aria-label="Markdown 原文" spellcheck="false"></textarea>
    </div>
    <footer class="ns-md-editor-footer">
      <span class="ns-md-editor-hint">Ctrl + S 保存 · Esc 返回画布</span>
      <button class="ns-md-editor-save" type="button">保存原文</button>
    </footer>`;
  container.appendChild(root);

  const title = root.querySelector<HTMLElement>('.ns-md-editor-title')!;
  const eyebrow = root.querySelector<HTMLElement>('.ns-md-editor-eyebrow')!;
  const textarea = root.querySelector<HTMLTextAreaElement>('.ns-md-editor-textarea')!;
  const liveHost = root.querySelector<HTMLElement>('.ns-md-editor-live')!;
  const state = root.querySelector<HTMLElement>('.ns-md-editor-state')!;
  const stateText = state.querySelector<HTMLElement>('span')!;
  const conflict = root.querySelector<HTMLElement>('.ns-md-editor-conflict')!;
  const conflictHint = conflict.querySelector<HTMLElement>('span')!;
  const overwriteButton = root.querySelector<HTMLButtonElement>('[data-action="overwrite"]')!;
  const saveButton = root.querySelector<HTMLButtonElement>('.ns-md-editor-save')!;
  const obsidianButton = root.querySelector<HTMLButtonElement>('.ns-md-editor-obsidian')!;
  let target: MarkdownSourceTarget | null = null;
  let session: MarkdownEditSession | null = null;
  let projectionSource: string | null = null;
  let liveInput: MarkdownLiveInput | undefined;
  let liveInputLoading: Promise<MarkdownLiveInput> | undefined;
  let saving = false;
  let openRequest = 0;
  const usesLiveInput = () => !!liveInput && target?.projection?.field !== 'title';

  const draftFromSource = (content: string, source: MarkdownSourceTarget): string => {
    if (!source.projection) return content;
    const { target: anchor, field } = source.projection;
    const value = readMarkdownProjection(content, anchor)?.[field];
    if (value === undefined) throw new Error('原文中的位置已变化或有重名章节，请打开原文确认');
    return field === 'body' && !value.trim() ? '' : value.replace(/\r\n?/g, '\n');
  };

  const showDraft = (value: string) => {
    if (usesLiveInput()) liveInput!.setValue(value);
    else textarea.value = value;
  };

  const renderState = () => {
    const conflicted = !!session?.conflicted;
    const dirty = !!session?.dirty;
    const nextState = conflicted ? 'conflict' : dirty ? 'dirty' : 'saved';
    state.dataset.state = nextState;
    stateText.textContent = conflicted ? '外部修改' : dirty ? '未保存' : '已保存';
    conflict.hidden = !conflicted;
    const readOnly = target?.editable === false || (!!target?.projection && saving);
    textarea.readOnly = readOnly;
    if (usesLiveInput()) liveInput!.setReadOnly(readOnly);
    saveButton.disabled = saving || !target?.editable || (!dirty && !conflicted);
    saveButton.textContent = saving ? '正在保存…' : target?.editable === false ? '只读预览' : '保存原文';
  };

  const focusTarget = () => {
    if (!target || !session) return;
    const editSession = session;
    const field = target.projection?.field;
    const offset = field === 'title' ? editSession.draft.length
      : field === 'body' ? Math.max(0, editSession.draft.search(/\S/)) : markdownFocusOffset(editSession.draft, target);
    requestAnimationFrame(() => {
      if (session !== editSession) return;
      if (usesLiveInput()) {
        liveInput!.focusAt(offset);
        return;
      }
      textarea.focus();
      textarea.setSelectionRange(offset, offset);
      const ratio = editSession.draft.length > 0 ? offset / editSession.draft.length : 0;
      textarea.scrollTop = Math.max(0, textarea.scrollHeight * ratio - textarea.clientHeight * .28);
    });
  };

  const save = async (force = false) => {
    if (!target || !session || saving || target.editable === false) return;
    const editTarget = target;
    const editSession = session;
    const projection = editTarget.projection;
    if (projection && (force || !editSession.dirty)) return;
    saving = true;
    renderState();
    try {
      const diskContent = await dependencies.readFile(editTarget);
      if (session !== editSession) return;
      const draft = editSession.draft;
      let plan: MarkdownSavePlan;
      if (projection) {
        if (diskContent !== projectionSource) {
          editSession.recordConflict(diskContent);
          plan = { kind: 'conflict', diskContent };
        } else {
          const content = replaceMarkdownProjection(diskContent, projection.target, { [projection.field]: draft });
          if (content === null) throw new Error(projection.field === 'title' ? '章节标题需要保留一行非空文字' : '找不到对应的正文，请重新打开投影');
          plan = { kind: 'write', content };
        }
      } else {
        plan = editSession.planSave(diskContent, force);
      }
      if (plan.kind === 'noop') {
        renderState();
        return;
      }
      if (plan.kind === 'conflict') {
        dependencies.notify?.('原文在别处已改变；你的草稿没有丢失', 'warning');
        renderState();
        return;
      }
      const result = await dependencies.writeFile(editTarget, plan.content, diskContent);
      if ('conflict' in result) {
        if (session === editSession) {
          editSession.recordConflict(result.content);
          dependencies.notify?.('原文在写入前已改变；你的草稿没有丢失', 'warning');
          renderState();
        }
        return;
      }
      editSession.acceptSaved(projection ? draft : plan.content);
      if (projection && session === editSession) closeNow();
      else renderState();
      dependencies.notify?.(projection ? '已保存到 Obsidian 原文' : `已保存“${editTarget.title}”`, 'success');
      try {
        await dependencies.onSaved?.(editTarget, plan.content);
      } catch {
        dependencies.notify?.('原文已保存，暂时无法刷新图投影', 'warning');
      }
    } catch (error) {
      dependencies.notify?.(`保存失败：${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      saving = false;
      renderState();
    }
  };

  const reload = async () => {
    if (!target || !session || saving) return;
    const editTarget = target;
    const editSession = session;
    const draft = editSession.draft;
    if (editSession.dirty && !await dependencies.confirmDiscard(editTarget.title)) return;
    if (session !== editSession || saving || editSession.draft !== draft) return;
    try {
      const content = await dependencies.readFile(editTarget);
      if (session !== editSession || saving || editSession.draft !== draft) return;
      const latest = draftFromSource(content, editTarget);
      projectionSource = editTarget.projection ? content : null;
      editSession.reload(latest);
      showDraft(latest);
      renderState();
      focusTarget();
      dependencies.notify?.('已载入磁盘上的最新原文', 'info');
    } catch (error) {
      dependencies.notify?.(`重新载入失败：${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  };

  const closeNow = () => {
    openRequest++;
    const active = document.activeElement as HTMLElement | null;
    if (active && root.contains(active)) active.blur();
    root.hidden = true;
    root.classList.remove('is-visible');
    container.classList.remove('is-markdown-editor-open');
    target = null;
    session = null;
    projectionSource = null;
  };

  const requestClose = async (): Promise<boolean> => {
    if (saving) return false;
    const editSession = session;
    if (editSession?.dirty && !await dependencies.confirmDiscard(target?.title || '这篇笔记')) return false;
    if (saving || session !== editSession) return false;
    closeNow();
    return true;
  };

  const updateDraft = (content: string) => {
    if (saving && target?.projection) return;
    session?.updateDraft(content);
    renderState();
  };
  textarea.addEventListener('input', () => updateDraft(textarea.value));
  root.querySelector('.ns-md-editor-close')?.addEventListener('click', () => { void requestClose(); });
  root.querySelector('[data-action="reload"]')?.addEventListener('click', () => { void reload(); });
  root.querySelector('[data-action="overwrite"]')?.addEventListener('click', () => { void save(true); });
  saveButton.addEventListener('click', () => { void save(); });
  obsidianButton.addEventListener('click', () => { if (target) dependencies.openInObsidian?.(target); });
  root.addEventListener('keydown', event => {
    if (event.isComposing || event.keyCode === 229) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's'
      || event.key === 'Enter' && target?.projection?.field === 'title' && event.target === textarea) {
      event.preventDefault();
      void save();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      void requestClose();
    }
  });

  return {
    async open(nextTarget) {
      if (saving) return false;
      const request = ++openRequest;
      const sameTarget = target?.absolutePath === nextTarget.absolutePath
        && JSON.stringify(target.projection) === JSON.stringify(nextTarget.projection);
      if (session?.dirty && !sameTarget && !await dependencies.confirmDiscard(target?.title || '这篇笔记')) return false;
      if (request !== openRequest) return false;
      try {
        let draft: string | undefined;
        if (!sameTarget || !session) {
          const content = await dependencies.readFile(nextTarget);
          if (request !== openRequest || saving) return false;
          draft = draftFromSource(content, nextTarget);
          if (nextTarget.projection?.field !== 'title' && !liveInput && dependencies.createLiveInput) {
            liveInputLoading ??= dependencies.createLiveInput(liveHost, updateDraft).finally(() => { liveInputLoading = undefined; });
            liveInput = await liveInputLoading;
            if (request !== openRequest || saving) return false;
          }
          session = new MarkdownEditSession(draft);
          projectionSource = nextTarget.projection ? content : null;
        }
        target = nextTarget;
        const field = target.projection?.field;
        const name = field === 'title' ? '修改章节标题' : field === 'body' ? '修改正文' : 'Markdown 原文';
        root.dataset.projectionField = field || '';
        root.setAttribute('aria-label', name);
        eyebrow.textContent = name;
        textarea.setAttribute('aria-label', name);
        liveHost.hidden = !usesLiveInput();
        textarea.hidden = usesLiveInput();
        if (usesLiveInput()) liveInput!.setLabel(name);
        if (draft !== undefined) showDraft(draft);
        overwriteButton.hidden = Boolean(field);
        conflictHint.textContent = field
          ? '草稿仍在。你可以复制草稿，再载入最新版。'
          : '你的草稿仍在。请选择重新载入，或确认用当前草稿覆盖。';
        title.textContent = nextTarget.title;
        obsidianButton.hidden = !dependencies.openInObsidian;
        root.hidden = false;
        container.classList.add('is-markdown-editor-open');
        requestAnimationFrame(() => root.classList.add('is-visible'));
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
      const editSession = session;
      const editTarget = target;
      const baseline = projectionSource ?? editSession.baseContent;
      try {
        const diskContent = await dependencies.readFile(editTarget);
        if (session !== editSession || saving || (projectionSource ?? editSession.baseContent) !== baseline) return;
        if (editSession.dirty) {
          if (diskContent !== baseline) editSession.recordConflict(diskContent);
          if (editSession.conflicted) dependencies.notify?.('正在编辑的原文已在外部改变；草稿已保留', 'warning');
        } else {
          const draft = draftFromSource(diskContent, editTarget);
          projectionSource = editTarget.projection ? diskContent : null;
          editSession.reload(draft);
          showDraft(draft);
        }
        renderState();
      } catch {
        dependencies.notify?.('正在编辑的原文已移动或暂时无法读取', 'warning');
      }
    },
  };
}
