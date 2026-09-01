import type { GraphData } from './data/storage';
import {
  joinVaultPath,
  normalizeVaultPath,
  vaultFolderResources,
  type VaultIndex,
  type VaultResource,
  type VaultResourceKind,
  type VaultSourceRef,
} from './vault';

export interface VaultResourceFingerprint {
  size: number;
  mtime: number;
}

/**
 * A persisted pointer from a writable NodeSpace graph to a Vault resource.
 * The wrapper card is editable; the referenced source is never copied or mutated.
 */
export interface ResourceReference extends VaultSourceRef {
  provider: 'vault';
  version: 1;
  fingerprint?: VaultResourceFingerprint;
}

export type ResourceReferenceStatus = 'ok' | 'broken';

export interface ResourceReferenceReconcileReport {
  checked: number;
  repaired: number;
  broken: number;
  cleaned: number;
}

const compactLine = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();

/** Legacy builds stored loading copy in the preview field itself. Treat it as
 * missing data so the runtime can retry instead of accepting it as content. */
export function isResourceReferenceLoadingPreview(value: unknown): boolean {
  const text = compactLine(value);
  return text === '正在读取笔记内容…'
    || text === '正在读取图中的节点…'
    || /^正在读取“.+”小节…$/.test(text);
}

const truncatePreview = (value: string, limit = 260): string => {
  const text = compactLine(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
};

const allResources = (index: VaultIndex): VaultResource[] =>
  [...index.notes, ...index.attachments, ...index.graphs];

const referenceLabel = (source: Pick<VaultSourceRef, 'path' | 'displayLabel' | 'heading'>): string => {
  if (source.heading?.trim()) return source.heading.trim();
  if (source.displayLabel?.trim()) return source.displayLabel.trim();
  const name = normalizeVaultPath(source.path).split('/').pop() || '引用';
  return name.replace(/\.[^.]+$/, '') || name;
};

const resourceLabel = (resource: VaultResource): string =>
  resource.title?.trim() || resource.name.replace(/\.[^.]+$/, '') || resource.name;

const resourceMatchesKind = (resource: VaultResource, kind: VaultResourceKind): boolean =>
  resource.kind === kind;

const folderPaths = (index: VaultIndex): string[] => {
  const values = new Set<string>(['']);
  for (const resource of allResources(index)) {
    const parts = normalizeVaultPath(resource.path).split('/').filter(Boolean);
    for (let depth = 1; depth < parts.length; depth++) values.add(parts.slice(0, depth).join('/'));
  }
  return [...values];
};

const unique = <T>(values: T[]): T | null => values.length === 1 ? values[0] : null;

function resolveMovedResource(index: VaultIndex, reference: ResourceReference): VaultResource | null {
  const resources = allResources(index).filter(resource => resourceMatchesKind(resource, reference.kind));
  const exact = resources.find(resource => normalizeVaultPath(resource.path) === normalizeVaultPath(reference.path));
  if (exact) return exact;

  const fingerprint = reference.fingerprint;
  if (fingerprint) {
    const fingerprintMatch = unique(resources.filter(resource =>
      resource.size === fingerprint.size && resource.mtime === fingerprint.mtime));
    if (fingerprintMatch) return fingerprintMatch;
  }

  const oldName = normalizeVaultPath(reference.path).split('/').pop()?.toLocaleLowerCase('zh-CN');
  if (oldName) {
    const nameMatch = unique(resources.filter(resource => resource.name.toLocaleLowerCase('zh-CN') === oldName));
    if (nameMatch) return nameMatch;
  }

  const oldLabel = reference.displayLabel?.trim().toLocaleLowerCase('zh-CN');
  return oldLabel
    ? unique(resources.filter(resource => resourceLabel(resource).toLocaleLowerCase('zh-CN') === oldLabel))
    : null;
}

function resolveMovedFolder(index: VaultIndex, reference: ResourceReference): string | null {
  const normalized = normalizeVaultPath(reference.path).replace(/\/$/, '');
  const folders = folderPaths(index);
  if (folders.includes(normalized)) return normalized;
  const oldName = normalized.split('/').pop()?.toLocaleLowerCase('zh-CN');
  if (!oldName) return folders.includes('') ? '' : null;
  return unique(folders.filter(folder => folder.split('/').pop()?.toLocaleLowerCase('zh-CN') === oldName));
}

export function createVaultResourceReference(
  source: VaultSourceRef,
  index?: VaultIndex | null,
): ResourceReference {
  const normalized = normalizeVaultPath(source.path);
  const path = source.kind === 'folder' ? normalized.replace(/\/$/, '') : normalized;
  const resource = index && source.kind !== 'folder'
    ? allResources(index).find(candidate => normalizeVaultPath(candidate.path) === path)
    : undefined;
  return {
    provider: 'vault',
    version: 1,
    path,
    kind: source.kind,
    ...(source.heading ? { heading: source.heading } : {}),
    ...(source.headingPath ? { headingPath: source.headingPath } : {}),
    ...(source.block ? { block: source.block } : {}),
    ...(Number.isFinite(source.line) ? { line: source.line } : {}),
    displayLabel: source.displayLabel || (resource ? resourceLabel(resource) : referenceLabel(source)),
    ...(resource ? { fingerprint: { size: resource.size, mtime: resource.mtime } } : {}),
  };
}

export function resourceReferenceForPath(
  index: VaultIndex,
  path: string,
  kind?: VaultResourceKind,
): ResourceReference | null {
  const normalized = normalizeVaultPath(path).replace(/\/$/, '');
  if (kind === 'folder') {
    const label = normalized.split('/').pop() || index.name || '资料库';
    return createVaultResourceReference({ path: normalized, kind: 'folder', displayLabel: label }, index);
  }
  const resource = allResources(index).find(candidate =>
    normalizeVaultPath(candidate.path) === normalized && (!kind || candidate.kind === kind));
  if (!resource) return null;
  return createVaultResourceReference({
    path: resource.path,
    kind: resource.kind,
    displayLabel: resourceLabel(resource),
  }, index);
}

export function createResourceReferenceNode(
  sourceNode: any,
  reference: ResourceReference,
  position: { x: number; y: number },
  id = `ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
): any {
  const tags = [...new Set([...(Array.isArray(sourceNode?.tags) ? sourceNode.tags : []), '引用'])];
  return {
    id,
    label: sourceNode?.label || referenceLabel(reference),
    headingLevel: Math.max(1, Math.min(6, Number(sourceNode?.headingLevel) || (reference.kind === 'folder' ? 2 : 3))),
    tags,
    // The source path belongs to resourceRef. Keeping it out of note prevents
    // an implementation detail from occupying the readable body of the card.
    note: String(sourceNode?.note || ''),
    x: position.x,
    y: position.y,
    resourceRef: { ...reference },
    _resourceReferenceStatus: 'ok' as ResourceReferenceStatus,
    _resourceReferencePreview: String(sourceNode?._resourceReferencePreview || sourceNode?.note || ''),
    _isNew: true,
  };
}

export function isResourceReferenceNode(node: any): node is { resourceRef: ResourceReference; [key: string]: any } {
  const reference = node?.resourceRef;
  return Boolean(reference && reference.provider === 'vault' && reference.version === 1
    && typeof reference.path === 'string' && typeof reference.kind === 'string');
}

export function reconcileGraphResourceReferences(
  graph: GraphData,
  index: VaultIndex,
  absoluteRootPath = index.rootPath,
): ResourceReferenceReconcileReport {
  const report: ResourceReferenceReconcileReport = { checked: 0, repaired: 0, broken: 0, cleaned: 0 };
  for (const node of graph.nodes || []) {
    if (!isResourceReferenceNode(node)) continue;
    report.checked += 1;
    const reference = node.resourceRef;
    if (isResourceReferenceLoadingPreview(node._resourceReferencePreview)) {
      delete node._resourceReferencePreview;
    }
    const previousPath = normalizeVaultPath(reference.path);
    const previousLabel = reference.displayLabel;
    const legacyNote = compactLine(node.note);
    const legacySuffix = normalizeVaultPath(legacyNote.split(' · ').pop() || '');
    const generatedPrefix = /^(?:引用|Markdown|NodeSpace 图空间|IMAGE|AUDIO|VIDEO|PDF|OTHER) · /i.test(legacyNote)
      || /^包含 \d+ 项 · 引用自 /.test(legacyNote);
    if (generatedPrefix && (legacySuffix === previousPath || (reference.kind === 'folder' && legacySuffix === '/' && previousPath === ''))) {
      node.note = '';
      report.cleaned += 1;
    }
    if (reference.kind === 'folder') {
      const folder = resolveMovedFolder(index, reference);
      if (folder === null) {
        node._resourceReferenceStatus = 'broken';
        report.broken += 1;
        continue;
      }
      reference.path = folder;
      reference.displayLabel = folder.split('/').pop() || index.name || '资料库';
      node._resourceReferenceStatus = 'ok';
      if (folder !== previousPath) report.repaired += 1;
      if (!node.label || node.label === previousLabel) node.label = reference.displayLabel;
      continue;
    }

    const resource = resolveMovedResource(index, reference);
    if (!resource) {
      node._resourceReferenceStatus = 'broken';
      report.broken += 1;
      continue;
    }
    reference.path = normalizeVaultPath(resource.path);
    reference.displayLabel = resourceLabel(resource);
    reference.fingerprint = { size: resource.size, mtime: resource.mtime };
    node._resourceReferenceStatus = 'ok';
    if (reference.path !== previousPath) report.repaired += 1;
    if (!node.label || node.label === previousLabel) node.label = reference.displayLabel;
    if (resource.kind === 'image' || resource.kind === 'audio' || resource.kind === 'video' || resource.kind === 'pdf') {
      node.mediaType = resource.kind;
      node.mediaUrl = joinVaultPath(absoluteRootPath, resource.path);
    }
  }
  return report;
}

export function rewriteGraphResourceReferencePaths(
  graph: GraphData,
  oldVaultPath: string,
  newVaultPath: string,
): number {
  const from = normalizeVaultPath(oldVaultPath);
  const to = normalizeVaultPath(newVaultPath);
  let changed = 0;
  for (const node of graph.nodes || []) {
    if (!isResourceReferenceNode(node)) continue;
    const current = normalizeVaultPath(node.resourceRef.path);
    if (current !== from && !current.startsWith(`${from}/`)) continue;
    node.resourceRef.path = `${to}${current.slice(from.length)}`;
    node._resourceReferenceStatus = 'ok';
    changed += 1;
  }
  return changed;
}

export function resourceReferencePreviewMarkdown(
  reference: ResourceReference,
  index: VaultIndex,
): string {
  const label = referenceLabel(reference);
  if (reference.kind === 'folder') {
    const children = vaultFolderResources(index, reference.path);
    const lines = children.slice(0, 60).map(child =>
      `- ${child.kind === 'folder' ? '▸' : child.kind === 'markdown' ? '¶' : child.kind === 'graph' ? '⌘' : '◇'} ${child.name}`);
    const remaining = Math.max(0, children.length - lines.length);
    return [`# ${label}`, '', ...lines,
      ...(remaining ? ['', `另有 ${remaining} 项…`] : [])].join('\n');
  }
  return [`# ${label}`, '', `类型：${reference.kind}`,
    ...(reference.heading ? [`小节：${reference.heading}`] : []),
    ...(reference.block ? [`引用块：${reference.block}`] : [])].join('\n');
}

/** Select a referenced Markdown section without changing the source document. */
export function markdownSectionForResourceReference(
  markdown: string,
  reference: Pick<ResourceReference, 'heading' | 'block' | 'line'>,
): string {
  if (!reference.heading && !reference.block && !reference.line) return markdown;
  const lines = markdown.split(/\r?\n/);
  if (lines.length === 0) return '';
  if (reference.block) {
    const escaped = String(reference.block).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const blockPattern = new RegExp(`(?:^|\\s)\\^${escaped}\\s*$`);
    const blockLine = lines.findIndex(line => blockPattern.test(line));
    if (blockLine >= 0) {
      let start = blockLine;
      if (lines[blockLine].trim() === `^${reference.block}`) start = Math.max(0, blockLine - 1);
      while (start > 0 && lines[start - 1].trim() && !/^\s{0,3}#{1,6}\s+/.test(lines[start - 1])) start--;
      const selected = lines.slice(start, blockLine + 1).join('\n')
        .replace(new RegExp(`\\s*\\^${escaped}\\s*$`), '')
        .trim();
      if (selected) return selected;
    }
  }
  let start = Number.isFinite(reference.line)
    ? Math.max(0, Math.min(lines.length - 1, Number(reference.line) - 1))
    : -1;
  if (start < 0 && reference.heading) {
    const wanted = compactLine(reference.heading.split('#').filter(Boolean).pop() || reference.heading).toLocaleLowerCase('zh-CN');
    start = lines.findIndex(line => {
      const match = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
      return compactLine(match?.[1]).toLocaleLowerCase('zh-CN') === wanted;
    });
  }
  if (start < 0) return markdown;
  const headingMatch = lines[start]?.match(/^\s{0,3}(#{1,6})\s+/);
  if (!headingMatch) return lines.slice(start).join('\n');
  const level = headingMatch[1].length;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index++) {
    const match = lines[index].match(/^\s{0,3}(#{1,6})\s+/);
    if (match && match[1].length <= level) { end = index; break; }
  }
  return lines.slice(start, end).join('\n');
}

/** Plain, compact text for a card face. Links and source paths are deliberately omitted. */
export function markdownResourceReferenceExcerpt(
  markdown: string,
  reference: Pick<ResourceReference, 'heading' | 'block' | 'line'> = {},
  limit = 260,
): string {
  let text = markdownSectionForResourceReference(String(markdown || ''), reference)
    .replace(/^\uFEFF/, '')
    .replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, '')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/```[^\n]*\n?/g, ' ')
    .replace(/~~~[^\n]*\n?/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_match, alt) => alt ? `[图片：${alt}]` : '[图片]')
    .replace(/!\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_match, target, alias) => `[附件：${compactLine(alias || target).replace(/\.[^.]+$/, '')}]`)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_match, target, alias) => compactLine(alias || target).replace(/\.[^.]+$/, ''))
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, '• ')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/^\s*\d+[.)]\s+/gm, '• ')
    .replace(/[*_~`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return truncatePreview(text, limit);
}

/** Immediate, path-free fallback. Loading state is deliberately not stored as
 * preview content; otherwise a missed async refresh becomes a permanent card. */
export function resourceReferenceCardFallback(
  reference: ResourceReference,
  index: VaultIndex,
): string {
  if (reference.kind === 'folder') {
    const children = vaultFolderResources(index, reference.path);
    if (children.length === 0) return '空文件夹';
    const names = children.slice(0, 6).map(child =>
      child.name.replace(/\.[^.]+$/, '') || child.name);
    const remaining = Math.max(0, children.length - names.length);
    return truncatePreview(`${children.length} 项 · ${names.join(' · ')}${remaining ? ` · 另有 ${remaining} 项` : ''}`);
  }
  if (reference.kind === 'markdown') {
    if (reference.block) return '笔记中的引用块 · 双击阅读';
    return reference.heading ? `笔记小节“${reference.heading}” · 双击阅读` : '笔记引用 · 双击阅读';
  }
  if (reference.kind === 'graph') return '图空间引用 · 双击进入';
  if (reference.kind === 'image') return '图片 · 双击或右键可放大预览';
  if (reference.kind === 'audio') return '音频 · 双击或右键即可试听';
  if (reference.kind === 'video') return '视频 · 双击或右键即可播放';
  if (reference.kind === 'pdf') return 'PDF 文档 · 双击或右键即可阅读';
  return '引用内容 · 双击或右键即可预览';
}
