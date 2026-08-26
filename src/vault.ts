import type { GraphData } from './data/storage';

export type VaultResourceKind = 'folder' | 'markdown' | 'graph' | 'image' | 'audio' | 'video' | 'pdf';

export interface VaultResource {
  path: string;
  name: string;
  kind: VaultResourceKind;
  size: number;
  mtime: number;
  title?: string;
  headingCount?: number;
  charCount?: number;
  hasFrontmatter?: boolean;
}

export interface VaultIndex {
  rootPath: string;
  name: string;
  isObsidianVault: boolean;
  graphRootPath: string;
  graphRootRelative: string;
  notes: VaultResource[];
  attachments: VaultResource[];
  graphs: VaultResource[];
  stats: { notes: number; attachments: number; graphs: number; headings: number };
}

export interface VaultSourceRef {
  path: string;
  heading?: string;
  line?: number;
  kind: VaultResourceKind;
  /** Stable human title kept separate from the mutable graph-node label. */
  displayLabel?: string;
}

const VAULT_TAB_PREFIX = 'vault:';
const VAULT_SPACE_TAB_PREFIX = 'vault-space:';
const SHORT_DOCUMENT_CHARS = 1600;
const SHORT_DOCUMENT_HEADINGS = 3;
const MAX_SECTION_NODES = 180;
const SEMANTIC_EXCERPT_CHARS = 1800;

export function normalizeVaultPath(value: string): string {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');
}

export function vaultTabId(relativePath: string): string {
  return `${VAULT_TAB_PREFIX}${normalizeVaultPath(relativePath)}`;
}

export function vaultSpaceTabId(relativePath = ''): string {
  return `${VAULT_SPACE_TAB_PREFIX}${normalizeVaultPath(relativePath).replace(/\/$/, '')}`;
}

export function isVaultTabId(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(VAULT_TAB_PREFIX);
}

export function isVaultSpaceTabId(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(VAULT_SPACE_TAB_PREFIX);
}

export function isVaultLocationTabId(value: string | null | undefined): boolean {
  return isVaultTabId(value) || isVaultSpaceTabId(value);
}

export function vaultPathFromTabId(value: string): string | null {
  return isVaultTabId(value) ? normalizeVaultPath(value.slice(VAULT_TAB_PREFIX.length)) : null;
}

export function vaultSpacePathFromTabId(value: string): string | null {
  return isVaultSpaceTabId(value)
    ? normalizeVaultPath(value.slice(VAULT_SPACE_TAB_PREFIX.length)).replace(/\/$/, '')
    : null;
}

export function vaultDisplayName(value: string): string {
  const spacePath = vaultSpacePathFromTabId(value);
  if (spacePath !== null) return spacePath.split('/').pop() || '资料库';
  const relativePath = vaultPathFromTabId(value);
  if (!relativePath) return value.replace(/\.json$/i, '');
  const name = relativePath.split('/').pop() || relativePath;
  return name.replace(/\.(md|pdf|png|jpe?g|gif|webp|svg|bmp|mp3|wav|ogg|flac|aac|m4a|mp4|webm|mov|avi|mkv)$/i, '');
}

export function joinVaultPath(rootPath: string, relativePath: string): string {
  const separator = rootPath.includes('\\') ? '\\' : '/';
  const root = rootPath.replace(/[\\/]+$/, '');
  return `${root}${separator}${normalizeVaultPath(relativePath).replace(/\//g, separator)}`;
}

function stableId(path: string, suffix: string): string {
  let hash = 2166136261;
  const text = `${normalizeVaultPath(path)}\u0000${suffix}`;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `vault_${(hash >>> 0).toString(36)}`;
}

export function vaultGraphFileName(index: VaultIndex, relativePath: string): string | null {
  const normalized = normalizeVaultPath(relativePath);
  const graphRoot = normalizeVaultPath(index.graphRootRelative || '').replace(/\/$/, '');
  const graphPath = graphRoot
    ? (normalized.startsWith(`${graphRoot}/`) ? normalized.slice(graphRoot.length + 1) : '')
    : normalized;
  return graphPath && /\.json$/i.test(graphPath) ? graphPath : null;
}

export function vaultFolderResources(index: VaultIndex, folderPath = ''): Array<{
  path: string;
  name: string;
  kind: VaultResourceKind;
  resourceCount?: number;
  resource?: VaultResource;
}> {
  const folder = normalizeVaultPath(folderPath).replace(/\/$/, '');
  const prefix = folder ? `${folder}/` : '';
  const resources = [...index.notes, ...index.attachments, ...index.graphs];
  const folders = new Map<string, { path: string; name: string; kind: 'folder'; resourceCount: number }>();
  const direct: Array<{ path: string; name: string; kind: VaultResourceKind; resource: VaultResource }> = [];

  for (const resource of resources) {
    const path = normalizeVaultPath(resource.path);
    if (!path.startsWith(prefix)) continue;
    const remainder = path.slice(prefix.length);
    if (!remainder) continue;
    const slash = remainder.indexOf('/');
    if (slash >= 0) {
      const name = remainder.slice(0, slash);
      const childPath = `${prefix}${name}`;
      const existing = folders.get(childPath);
      if (existing) existing.resourceCount += 1;
      else folders.set(childPath, { path: childPath, name, kind: 'folder', resourceCount: 1 });
      continue;
    }
    direct.push({ path, name: resource.name, kind: resource.kind, resource });
  }

  const kindOrder: Record<VaultResourceKind, number> = {
    folder: 0, markdown: 1, graph: 2, pdf: 3, image: 4, audio: 5, video: 6,
  };
  return [...folders.values(), ...direct].sort((left, right) =>
    kindOrder[left.kind] - kindOrder[right.kind] || left.name.localeCompare(right.name, 'zh-CN'));
}

export function vaultFolderToGraph(index: VaultIndex, folderPath = '', absoluteRootPath = index.rootPath): GraphData {
  const folder = normalizeVaultPath(folderPath).replace(/\/$/, '');
  const children = vaultFolderResources(index, folder);
  const nodes = children.map((child, order) => {
    const label = child.kind === 'folder'
      ? child.name
      : (child.resource?.title || child.name.replace(/\.[^.]+$/, ''));
    const detail = child.kind === 'folder'
      ? `包含 ${child.resourceCount || 0} 项 · 双击进入`
      : child.kind === 'markdown'
        ? `${child.resource?.headingCount || 0} 个标题 · ${child.resource?.charCount || 0} 字 · 双击进入`
        : child.kind === 'graph'
          ? 'NodeSpace 图空间 · 双击打开'
          : `${child.kind === 'pdf' ? 'PDF' : child.kind === 'image' ? '图像' : child.kind === 'audio' ? '音频' : '视频'} · ${child.path}`;
    const node: any = {
      id: stableId(child.path, child.kind === 'folder' ? 'folder-space' : 'vault-resource'),
      label,
      headingLevel: child.kind === 'folder' ? 2 : child.kind === 'markdown' ? 3 : 4,
      tags: child.kind === 'folder' ? ['文件夹'] : child.kind === 'graph' ? ['图空间'] : [child.kind],
      note: detail,
      sourceRef: { path: child.path, kind: child.kind, displayLabel: label },
      vaultRole: child.kind,
      createdOrder: order,
      x: 0,
      y: 0,
    };
    if (child.kind === 'image' || child.kind === 'audio' || child.kind === 'video' || child.kind === 'pdf') {
      node.mediaType = child.kind;
      node.mediaUrl = joinVaultPath(absoluteRootPath, child.path);
    }
    return node;
  });
  return {
    nodes,
    edges: [],
    groups: [],
    settings: {
      layoutMode: 'auto',
      semanticCardDensity: nodes.length <= 24 ? 'full' : 'mixed',
      sourceMode: 'vault-readonly',
      vaultSpacePath: folder,
    } as any,
  };
}

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, '');
}

function cleanMarkdownForSemantics(markdown: string): string {
  return stripFrontmatter(markdown)
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)|!\[\[([^\]]+)\]\]/g, '$1 $2')
    .replace(/\[([^\]]+)\]\([^)]*\)|\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, '$1 $3')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^[>#*+\-\d.\s]+/gm, '')
    .replace(/[*_~`|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function semanticExcerpt(markdown: string): string {
  const clean = cleanMarkdownForSemantics(markdown);
  return clean.length > SEMANTIC_EXCERPT_CHARS ? `${clean.slice(0, SEMANTIC_EXCERPT_CHARS)}…` : clean;
}

function extractTags(markdown: string): string[] {
  const tags = new Set<string>();
  for (const match of markdown.matchAll(/(^|\s)#([^\s#，。！？、;；:：()[\]{}]{1,32})/g)) tags.add(match[2]);
  return [...tags].slice(0, 12);
}

interface MarkdownSection {
  title: string;
  level: number;
  line: number;
  markdown: string;
}

export function parseMarkdownSections(markdown: string): MarkdownSection[] {
  const lines = String(markdown || '').split(/\r?\n/);
  const sections: MarkdownSection[] = [];
  let fenced = false;
  let current: MarkdownSection | null = null;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const heading = !fenced ? line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/) : null;
    if (heading) {
      if (current) sections.push(current);
      current = { title: heading[2].trim(), level: heading[1].length, line: index + 1, markdown: line };
    } else if (current) {
      current.markdown += `\n${line}`;
    }
  }
  if (current) sections.push(current);
  return sections;
}

function markdownDocumentTitle(relativePath: string, markdown: string, resource?: VaultResource): string {
  if (resource?.title?.trim()) return resource.title.trim();
  const firstHeading = parseMarkdownSections(markdown)[0];
  if (firstHeading?.level === 1) return firstHeading.title;
  return (relativePath.split('/').pop() || relativePath).replace(/\.md$/i, '');
}

function sourceNode(path: string, label: string, markdown: string, source: VaultSourceRef, headingLevel: number, order: number) {
  return {
    id: stableId(path, source.heading ? `${source.heading}\u0000${source.line}` : 'document'),
    label,
    headingLevel: Math.max(1, Math.min(6, headingLevel)),
    tags: extractTags(markdown),
    note: semanticExcerpt(markdown),
    mediaType: 'md',
    mediaUrl: markdown,
    sourceRef: { ...source, displayLabel: label },
    createdOrder: order,
    x: 0,
    y: 0,
  };
}

export function markdownToGraph(relativePath: string, markdown: string, resource?: VaultResource): GraphData {
  const path = normalizeVaultPath(relativePath);
  const title = markdownDocumentTitle(path, markdown, resource);
  const sections = parseMarkdownSections(markdown);
  const shortDocument = markdown.length <= SHORT_DOCUMENT_CHARS && sections.length <= SHORT_DOCUMENT_HEADINGS;
  const root = sourceNode(path, title, markdown, { path, kind: 'markdown', line: 1 }, 1, 0);
  root.tags = [...new Set(['文档', ...root.tags])];
  if (shortDocument || sections.length === 0) {
    return {
      nodes: [root],
      edges: [],
      groups: [],
      settings: { layoutMode: 'auto', semanticCardDensity: 'full', sourceMode: 'vault-readonly' } as any,
    };
  }

  const visibleSections = sections.slice(0, MAX_SECTION_NODES);
  const nodes: any[] = [root];
  const edges: any[] = [];
  const parents: { level: number; id: string }[] = [{ level: 0, id: root.id }];
  visibleSections.forEach((section, index) => {
    while (parents.length > 1 && parents[parents.length - 1].level >= section.level) parents.pop();
    const parent = parents[parents.length - 1] || parents[0];
    const node = sourceNode(
      path,
      section.title,
      section.markdown,
      { path, kind: 'markdown', heading: section.title, line: section.line },
      Math.min(6, section.level + 1),
      index + 1,
    );
    nodes.push(node);
    edges.push({
      source: parent.id,
      target: node.id,
      kind: 'hierarchy',
      relationType: 'contains',
      label: section.level === 1 ? '章节' : '小节',
      arrow: true,
      lineStyle: 'solid',
    });
    parents.push({ level: section.level, id: node.id });
  });
  if (sections.length > visibleSections.length) {
    const omitted = sections.length - visibleSections.length;
    const overflow = {
      id: stableId(path, 'overflow'),
      label: `另有 ${omitted} 个小节`,
      headingLevel: 5,
      note: '为保持画布轻量，剩余小节暂未展开；可以在 Obsidian 中查看完整原文。',
      tags: ['文档'],
      sourceRef: { path, kind: 'markdown', line: visibleSections[visibleSections.length - 1]?.line ?? 1 },
      createdOrder: nodes.length,
      x: 0,
      y: 0,
    };
    nodes.push(overflow);
    edges.push({ source: root.id, target: overflow.id, kind: 'hierarchy', relationType: 'contains', label: '其余' });
  }
  return {
    nodes,
    edges,
    groups: [],
    settings: {
      layoutMode: 'auto',
      semanticCardDensity: nodes.length <= 36 ? 'full' : 'mixed',
      sourceMode: 'vault-readonly',
    } as any,
  };
}

export function attachmentToGraph(relativePath: string, absolutePath: string, kind: Exclude<VaultResourceKind, 'markdown' | 'graph'>): GraphData {
  const path = normalizeVaultPath(relativePath);
  const label = (path.split('/').pop() || path).replace(/\.[^.]+$/, '');
  return {
    nodes: [{
      id: stableId(path, 'attachment'),
      label,
      headingLevel: 2,
      tags: ['附件', kind],
      note: `${kind === 'pdf' ? 'PDF 文档' : kind === 'audio' ? '音频' : kind === 'video' ? '视频' : '图像'} · ${path}`,
      mediaType: kind,
      mediaUrl: absolutePath,
      sourceRef: { path, kind, displayLabel: label },
      createdOrder: 0,
      x: 0,
      y: 0,
    }],
    edges: [],
    groups: [],
    settings: { layoutMode: 'auto', semanticCardDensity: 'full', sourceMode: 'vault-readonly' } as any,
  };
}
