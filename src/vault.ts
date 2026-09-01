import type { GraphData } from './data/storage';
import {
  extractObsidianBlocks,
  extractObsidianLinks,
  obsidianBacklinksForPath,
  resolveObsidianLink,
  type ObsidianLinkOccurrence,
  type ObsidianLinkResolutionStatus,
} from './obsidian-links';

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
  aliases?: string[];
  /** Compact, path-free source text collected while the scanner already has the note in memory. */
  excerpt?: string;
  /** Explicit links only. Semantic similarity never writes into this list. */
  links?: ObsidianLinkOccurrence[];
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
  /** Full local heading ancestry used to disambiguate repeated subsection titles. */
  headingPath?: string;
  block?: string;
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

function vaultResourceLabel(resource: VaultResource): string {
  return resource.title?.trim() || resource.name.replace(/\.[^.]+$/, '') || resource.name;
}

function vaultLinkCounts(index: VaultIndex): {
  outgoing: Map<string, number>;
  backlinks: Map<string, number>;
  unresolved: Map<string, number>;
} {
  const outgoing = new Map<string, number>();
  const backlinks = new Map<string, number>();
  const unresolved = new Map<string, number>();
  for (const note of index.notes || []) {
    const source = normalizeVaultPath(note.path);
    for (const occurrence of note.links || []) {
      const resolution = resolveObsidianLink(index, source, occurrence);
      if (resolution.status === 'resolved' && resolution.resource) {
        outgoing.set(source, (outgoing.get(source) || 0) + 1);
        const target = normalizeVaultPath(resolution.resource.path);
        backlinks.set(target, (backlinks.get(target) || 0) + 1);
      } else if (resolution.status === 'missing' || resolution.status === 'ambiguous') {
        unresolved.set(source, (unresolved.get(source) || 0) + 1);
      }
    }
  }
  return { outgoing, backlinks, unresolved };
}

export function vaultFolderToGraph(index: VaultIndex, folderPath = '', absoluteRootPath = index.rootPath): GraphData {
  const folder = normalizeVaultPath(folderPath).replace(/\/$/, '');
  const children = vaultFolderResources(index, folder);
  const linkCounts = vaultLinkCounts(index);
  const nodes = children.map((child, order) => {
    const label = child.kind === 'folder'
      ? child.name
      : (child.resource?.title || child.name.replace(/\.[^.]+$/, ''));
    const fallbackDetail = child.kind === 'folder'
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
      note: child.kind === 'markdown' && child.resource?.excerpt?.trim()
        ? child.resource.excerpt.trim()
        : fallbackDetail,
      sourceRef: { path: child.path, kind: child.kind, displayLabel: label },
      vaultRole: child.kind,
      createdOrder: order,
      x: 0,
      y: 0,
      ...(child.kind === 'markdown' ? {
        _obsidianLinkCounts: {
          outgoing: linkCounts.outgoing.get(child.path) || 0,
          backlinks: linkCounts.backlinks.get(child.path) || 0,
          unresolved: linkCounts.unresolved.get(child.path) || 0,
        },
      } : {}),
    };
    if (child.kind === 'image' || child.kind === 'audio' || child.kind === 'video' || child.kind === 'pdf') {
      node.mediaType = child.kind;
      node.mediaUrl = joinVaultPath(absoluteRootPath, child.path);
    }
    return node;
  });
  const nodeByPath = new Map(nodes.map(node => [normalizeVaultPath(node.sourceRef?.path), node]));
  const edges: any[] = [];
  const edgeKeys = new Set<string>();
  for (const child of children) {
    if (child.kind !== 'markdown' || !child.resource) continue;
    const sourceNode = nodeByPath.get(normalizeVaultPath(child.path));
    if (!sourceNode) continue;
    for (const occurrence of child.resource.links || []) {
      const resolution = resolveObsidianLink(index, child.path, occurrence);
      if (resolution.status !== 'resolved' || !resolution.resource) continue;
      const targetNode = nodeByPath.get(normalizeVaultPath(resolution.resource.path));
      if (!targetNode || targetNode.id === sourceNode.id) continue;
      const kind = occurrence.disposition === 'embed' ? 'obsidian-embed' : 'obsidian-link';
      const key = `${sourceNode.id}\u0000${targetNode.id}\u0000${kind}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      edges.push({
        source: sourceNode.id,
        target: targetNode.id,
        kind,
        relationType: occurrence.disposition === 'embed' ? 'embeds' : 'references',
        label: occurrence.disposition === 'embed' ? '嵌入' : '链接',
        arrow: true,
        lineStyle: 'solid',
        _obsidianLink: true,
        _obsidianLinkStatus: 'resolved',
      });
    }
  }
  const visiblePaths = new Set(nodes.map(node => normalizeVaultPath(node.sourceRef?.path)).filter(Boolean));
  const summary = { outgoing: 0, backlinks: 0, unresolved: 0 };
  for (const visible of visiblePaths) {
    summary.outgoing += linkCounts.outgoing.get(visible) || 0;
    summary.backlinks += linkCounts.backlinks.get(visible) || 0;
    summary.unresolved += linkCounts.unresolved.get(visible) || 0;
  }
  return {
    nodes,
    edges,
    groups: [],
    settings: {
      layoutMode: 'auto',
      semanticCardDensity: nodes.length <= 24 ? 'full' : 'mixed',
      sourceMode: 'vault-readonly',
      vaultSpacePath: folder,
      obsidianLinkSummary: summary,
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
  headingPath: string;
  level: number;
  line: number;
  markdown: string;
}

export function parseMarkdownSections(markdown: string): MarkdownSection[] {
  const lines = String(markdown || '').split(/\r?\n/);
  const sections: MarkdownSection[] = [];
  let fenced = false;
  let current: MarkdownSection | null = null;
  const headingStack: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const heading = !fenced ? line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/) : null;
    if (heading) {
      if (current) sections.push(current);
      const level = heading[1].length;
      const title = heading[2].trim();
      headingStack.length = Math.max(0, level - 1);
      headingStack[level - 1] = title;
      current = { title, headingPath: headingStack.filter(Boolean).join('#'), level, line: index + 1, markdown: line };
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

const MAX_OBSIDIAN_OUTGOING_CARDS = 36;
const MAX_OBSIDIAN_BACKLINK_CARDS = 24;
const MAX_OBSIDIAN_TOTAL_CARDS = 48;

function sameVaultPath(left: string, right: string): boolean {
  return normalizeVaultPath(left).toLocaleLowerCase('zh-CN') === normalizeVaultPath(right).toLocaleLowerCase('zh-CN');
}

function sourceAnchorForOccurrence(graph: GraphData, path: string, occurrence: Pick<ObsidianLinkOccurrence, 'line' | 'sourceHeading'>): any {
  const candidates = graph.nodes.filter((node: any) => node.sourceRef && sameVaultPath(node.sourceRef.path, path));
  const wantedHeading = occurrence.sourceHeading?.trim().toLocaleLowerCase('zh-CN');
  if (wantedHeading) {
    const exact = candidates.filter((node: any) => String(node.sourceRef?.heading || '').trim().toLocaleLowerCase('zh-CN') === wantedHeading);
    if (exact.length > 0) return exact.sort((a: any, b: any) => Math.abs((a.sourceRef?.line || 1) - occurrence.line) - Math.abs((b.sourceRef?.line || 1) - occurrence.line))[0];
    const documentRoot = candidates.find((node: any) => !node.sourceRef?.heading && String(node.label || '').trim().toLocaleLowerCase('zh-CN') === wantedHeading);
    if (documentRoot) return documentRoot;
  }
  return candidates
    .filter((node: any) => Number(node.sourceRef?.line || 1) <= occurrence.line)
    .sort((a: any, b: any) => Number(b.sourceRef?.line || 1) - Number(a.sourceRef?.line || 1))[0]
    || candidates[0]
    || graph.nodes[0];
}

function targetAnchorForOccurrence(graph: GraphData, path: string, occurrence: Pick<ObsidianLinkOccurrence, 'heading' | 'block'>): any {
  if (occurrence.block) {
    const block = graph.nodes.find((node: any) => node.sourceRef?.block === occurrence.block && sameVaultPath(node.sourceRef?.path, path));
    if (block) return block;
  }
  if (occurrence.heading) {
    const wantedPath = occurrence.heading.split('#').filter(Boolean).map(value => value.trim()).join('#').toLocaleLowerCase('zh-CN');
    const wanted = wantedPath.split('#').pop();
    const heading = graph.nodes.find((node: any) =>
      wanted && sameVaultPath(node.sourceRef?.path, path)
      && (String(node.sourceRef?.headingPath || '').trim().toLocaleLowerCase('zh-CN') === wantedPath
        || String(node.sourceRef?.headingPath || '').trim().toLocaleLowerCase('zh-CN').endsWith(`#${wantedPath}`)));
    if (heading) return heading;
    const titledHeading = graph.nodes.find((node: any) =>
      wanted && sameVaultPath(node.sourceRef?.path, path)
      && String(node.sourceRef?.heading || '').trim().toLocaleLowerCase('zh-CN') === wanted);
    if (titledHeading) return titledHeading;
    const documentRoot = graph.nodes.find((node: any) =>
      wanted && node.sourceRef && sameVaultPath(node.sourceRef.path, path)
      && !node.sourceRef.heading && String(node.label || '').trim().toLocaleLowerCase('zh-CN') === wanted);
    if (documentRoot) return documentRoot;
  }
  return graph.nodes.find((node: any) => node.sourceRef && sameVaultPath(node.sourceRef.path, path) && !node.sourceRef.heading && !node.sourceRef.block)
    || graph.nodes[0];
}

function resourceReferenceNode(
  ownerPath: string,
  resource: VaultResource,
  reference: { heading?: string; block?: string; line?: number },
  label: string,
  role: 'outgoing' | 'backlink' | 'embed',
  absoluteRootPath: string,
  order: number,
): any {
  const canonicalLabel = vaultResourceLabel(resource);
  const suffix = `${normalizeVaultPath(resource.path)}\u0000${reference.heading || ''}\u0000${reference.block || ''}`;
  const node: any = {
    id: stableId(ownerPath, `obsidian-reference\u0000${suffix}`),
    label: label || canonicalLabel,
    headingLevel: 3,
    tags: [...new Set(['引用', role === 'embed' ? '嵌入' : role === 'backlink' ? '反向链接' : '显式链接'])],
    note: '',
    x: 0,
    y: 0,
    createdOrder: order,
    resourceRef: {
      provider: 'vault',
      version: 1,
      path: normalizeVaultPath(resource.path),
      kind: resource.kind,
      ...(reference.heading ? { heading: reference.heading } : {}),
      ...(reference.block ? { block: reference.block } : {}),
      ...(Number.isFinite(reference.line) ? { line: reference.line } : {}),
      displayLabel: canonicalLabel,
      fingerprint: { size: resource.size, mtime: resource.mtime },
    },
    _resourceReferenceStatus: 'ok',
    _resourceReferencePreview: resource.excerpt?.trim() || (resource.kind === 'markdown' ? '笔记内容为空或尚未生成摘要' : `${resource.kind} · 双击预览`),
    _obsidianLinkRole: role,
    _obsidianLinkStatus: 'resolved',
  };
  if (resource.kind === 'image' || resource.kind === 'audio' || resource.kind === 'video' || resource.kind === 'pdf') {
    node.mediaType = resource.kind;
    node.mediaUrl = joinVaultPath(absoluteRootPath, resource.path);
  }
  return node;
}

function unresolvedObsidianNode(
  ownerPath: string,
  occurrence: ObsidianLinkOccurrence,
  status: Extract<ObsidianLinkResolutionStatus, 'missing' | 'ambiguous'>,
  candidateCount: number,
  order: number,
): any {
  const rawLabel = occurrence.alias || occurrence.target.split('/').pop() || occurrence.heading || occurrence.block || '未解析链接';
  return {
    id: stableId(ownerPath, `obsidian-${status}\u0000${occurrence.target}\u0000${occurrence.heading || ''}\u0000${occurrence.block || ''}`),
    label: rawLabel.replace(/\.md$/i, ''),
    headingLevel: 4,
    tags: ['显式链接', status === 'missing' ? '目标缺失' : '目标不明确'],
    note: status === 'missing'
      ? '尚未找到对应内容；原始链接会保留，重新扫描后可自动恢复。'
      : `存在 ${candidateCount} 个同名目标；在原文中补全文件夹路径后即可确定。`,
    x: 0,
    y: 0,
    createdOrder: order,
    vaultRole: 'broken-link',
    _obsidianLinkRole: 'outgoing',
    _obsidianLinkStatus: status,
  };
}

function addObsidianEdge(
  graph: GraphData,
  keys: Set<string>,
  source: any,
  target: any,
  occurrence: ObsidianLinkOccurrence,
  role: 'outgoing' | 'backlink',
  status: ObsidianLinkResolutionStatus = 'resolved',
) {
  if (!source || !target || source.id === target.id) return;
  const kind = role === 'backlink'
    ? 'obsidian-backlink'
    : occurrence.disposition === 'embed'
      ? 'obsidian-embed'
      : status === 'resolved' ? 'obsidian-link' : 'obsidian-missing';
  const key = `${source.id}\u0000${target.id}\u0000${kind}`;
  if (keys.has(key)) return;
  keys.add(key);
  graph.edges.push({
    source: source.id,
    target: target.id,
    kind,
    relationType: role === 'backlink' ? 'backlink' : occurrence.disposition === 'embed' ? 'embeds' : 'references',
    label: role === 'backlink' ? '反向链接' : occurrence.disposition === 'embed' ? '嵌入' : status === 'resolved' ? '提及' : '未解析',
    arrow: true,
    lineStyle: status === 'resolved' ? 'solid' : 'dash-2',
    _obsidianLink: true,
    _obsidianLinkStatus: status,
    _obsidianLinkLine: occurrence.line,
  });
}

function projectObsidianLinks(
  graph: GraphData,
  path: string,
  markdown: string,
  resource?: VaultResource,
  index?: VaultIndex,
  absoluteRootPath = index?.rootPath || '',
): GraphData {
  const occurrences = extractObsidianLinks(markdown);
  const backlinks = index ? obsidianBacklinksForPath(index, path) : [];
  const linkedBlockIds = new Set<string>();
  const linkedHeadings = new Set<string>();
  if (index) {
    for (const occurrence of occurrences) {
      if (occurrence.sourceHeading) linkedHeadings.add(occurrence.sourceHeading.trim().toLocaleLowerCase('zh-CN'));
      const resolution = resolveObsidianLink(index, path, occurrence);
      if (resolution.status === 'resolved' && resolution.resource && sameVaultPath(resolution.resource.path, path)) {
        if (occurrence.block) linkedBlockIds.add(occurrence.block);
        if (occurrence.heading) linkedHeadings.add(occurrence.heading.split('#').filter(Boolean).pop()!.trim().toLocaleLowerCase('zh-CN'));
      }
    }
    for (const backlink of backlinks) {
      if (backlink.occurrence.block) linkedBlockIds.add(backlink.occurrence.block);
      if (backlink.occurrence.heading) linkedHeadings.add(backlink.occurrence.heading.split('#').filter(Boolean).pop()!.trim().toLocaleLowerCase('zh-CN'));
    }
  }
  const edgeKeys = new Set(graph.edges.map((edge: any) => `${String(edge.source)}\u0000${String(edge.target)}\u0000${String(edge.kind || '')}`));
  const root = graph.nodes.find((node: any) => node.sourceRef && sameVaultPath(node.sourceRef.path, path) && !node.sourceRef.heading && !node.sourceRef.block)
    || graph.nodes[0];
  const projectedHeadings = new Set(graph.nodes
    .filter((node: any) => node.sourceRef?.heading && sameVaultPath(node.sourceRef.path, path))
    .map((node: any) => String(node.sourceRef.heading).trim().toLocaleLowerCase('zh-CN')));
  for (const section of parseMarkdownSections(markdown)) {
    const key = section.title.trim().toLocaleLowerCase('zh-CN');
    if (!linkedHeadings.has(key) || projectedHeadings.has(key) || key === String(root?.label || '').trim().toLocaleLowerCase('zh-CN')) continue;
    const node = sourceNode(path, section.title, section.markdown, {
      path, kind: 'markdown', heading: section.title, headingPath: section.headingPath, line: section.line, displayLabel: section.title,
    }, Math.min(6, section.level + 1), graph.nodes.length);
    graph.nodes.push(node);
    projectedHeadings.add(key);
    graph.edges.push({ source: root.id, target: node.id, kind: 'hierarchy', relationType: 'contains', label: '链接小节', arrow: true, lineStyle: 'solid' });
  }
  for (const block of extractObsidianBlocks(markdown)) {
    if (!linkedBlockIds.has(block.id)) continue;
    const parent = sourceAnchorForOccurrence(graph, path, { line: block.line, sourceHeading: block.sourceHeading });
    const compact = Array.from(block.text || `引用块 ${block.id}`);
    const label = compact.length > 30 ? `${compact.slice(0, 29).join('').trimEnd()}…` : compact.join('');
    const node = sourceNode(path, label || `引用块 ${block.id}`, block.text, {
      path,
      kind: 'markdown',
      block: block.id,
      line: block.line,
      displayLabel: label || `引用块 ${block.id}`,
    }, 5, graph.nodes.length);
    node.tags = ['引用块'];
    graph.nodes.push(node);
    addObsidianEdge(graph, edgeKeys, parent, node, {
      raw: '', syntax: 'wikilink', disposition: 'link', target: '', line: block.line,
    }, 'outgoing');
    const edge = graph.edges[graph.edges.length - 1];
    if (edge?.target === node.id) {
      edge.kind = 'hierarchy';
      edge.relationType = 'contains';
      edge.label = '引用块';
      delete edge._obsidianLink;
    }
  }

  const cardByKey = new Map<string, any>();
  let outgoingCards = 0;
  let backlinkCards = 0;
  let totalCards = 0;
  let unresolved = 0;
  let omitted = 0;
  const ensureResolvedCard = (
    target: VaultResource,
    reference: { heading?: string; block?: string; line?: number },
    label: string,
    role: 'outgoing' | 'backlink' | 'embed',
    limit: number,
  ): any | null => {
    const key = `${normalizeVaultPath(target.path).toLocaleLowerCase('zh-CN')}\u0000${reference.heading || ''}\u0000${reference.block || ''}`;
    const existing = cardByKey.get(key);
    if (existing) {
      if (existing._obsidianLinkRole !== role) existing._obsidianLinkRole = 'both';
      return existing;
    }
    if (totalCards >= MAX_OBSIDIAN_TOTAL_CARDS || limit <= 0) { omitted += 1; return null; }
    const node = resourceReferenceNode(path, target, reference, label, role, absoluteRootPath, graph.nodes.length);
    graph.nodes.push(node);
    cardByKey.set(key, node);
    totalCards += 1;
    return node;
  };

  if (index) {
    for (const occurrence of occurrences) {
      const source = sourceAnchorForOccurrence(graph, path, occurrence);
      const resolution = resolveObsidianLink(index, path, occurrence);
      if (resolution.status === 'search' || resolution.status === 'external') continue;
      if (resolution.status === 'resolved' && resolution.resource) {
        if (sameVaultPath(resolution.resource.path, path)) {
          addObsidianEdge(graph, edgeKeys, source, targetAnchorForOccurrence(graph, path, occurrence), occurrence, 'outgoing');
          continue;
        }
        const role = occurrence.disposition === 'embed' ? 'embed' : 'outgoing';
        const target = ensureResolvedCard(
          resolution.resource as VaultResource,
          { heading: occurrence.heading, block: occurrence.block },
          resolution.displayLabel,
          role,
          MAX_OBSIDIAN_OUTGOING_CARDS - outgoingCards,
        );
        if (!target) continue;
        outgoingCards += 1;
        addObsidianEdge(graph, edgeKeys, source, target, occurrence, 'outgoing');
        continue;
      }
      if (resolution.status === 'missing' || resolution.status === 'ambiguous') {
        unresolved += 1;
        if (totalCards >= MAX_OBSIDIAN_TOTAL_CARDS || outgoingCards >= MAX_OBSIDIAN_OUTGOING_CARDS) { omitted += 1; continue; }
        const key = `${resolution.status}\u0000${occurrence.target}\u0000${occurrence.heading || ''}\u0000${occurrence.block || ''}`;
        let target = cardByKey.get(key);
        if (!target) {
          target = unresolvedObsidianNode(path, occurrence, resolution.status, resolution.candidates.length, graph.nodes.length);
          graph.nodes.push(target);
          cardByKey.set(key, target);
          totalCards += 1;
        }
        outgoingCards += 1;
        addObsidianEdge(graph, edgeKeys, source, target, occurrence, 'outgoing', resolution.status);
      }
    }

    for (const backlink of backlinks) {
      if (backlinkCards >= MAX_OBSIDIAN_BACKLINK_CARDS) { omitted += 1; continue; }
      const targetAnchor = targetAnchorForOccurrence(graph, path, backlink.occurrence);
      const source = ensureResolvedCard(
        backlink.source as VaultResource,
        { heading: backlink.occurrence.sourceHeading },
        vaultResourceLabel(backlink.source as VaultResource),
        'backlink',
        MAX_OBSIDIAN_BACKLINK_CARDS - backlinkCards,
      );
      if (!source) continue;
      backlinkCards += 1;
      addObsidianEdge(graph, edgeKeys, source, targetAnchor, backlink.occurrence, 'backlink');
    }
  }

  if (omitted > 0) {
    const root = targetAnchorForOccurrence(graph, path, {});
    const overflow = {
      id: stableId(path, 'obsidian-link-overflow'),
      label: `另有 ${omitted} 条链接`,
      headingLevel: 5,
      tags: ['显式链接'],
      note: '为保持空间轻量，当前只展开最先出现的显式关系；原文中的链接没有被修改。',
      createdOrder: graph.nodes.length,
      x: 0,
      y: 0,
      _obsidianLinkOverflow: true,
    };
    graph.nodes.push(overflow);
    graph.edges.push({ source: root.id, target: overflow.id, kind: 'hierarchy', relationType: 'contains', label: '其余链接' });
  }
  graph.settings = {
    ...(graph.settings as any),
    obsidianLinkSummary: { outgoing: occurrences.length, backlinks: backlinks.length, unresolved },
  } as any;
  return graph;
}

export function markdownToGraph(
  relativePath: string,
  markdown: string,
  resource?: VaultResource,
  index?: VaultIndex,
  absoluteRootPath = index?.rootPath || '',
): GraphData {
  const path = normalizeVaultPath(relativePath);
  const title = markdownDocumentTitle(path, markdown, resource);
  const sections = parseMarkdownSections(markdown);
  const shortDocument = markdown.length <= SHORT_DOCUMENT_CHARS && sections.length <= SHORT_DOCUMENT_HEADINGS;
  const root = sourceNode(path, title, markdown, { path, kind: 'markdown', line: 1 }, 1, 0);
  root.tags = [...new Set(['文档', ...root.tags])];
  if (shortDocument || sections.length === 0) {
    return projectObsidianLinks({
      nodes: [root],
      edges: [],
      groups: [],
      settings: { layoutMode: 'auto', semanticCardDensity: 'full', sourceMode: 'vault-readonly' } as any,
    }, path, markdown, resource, index, absoluteRootPath);
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
      { path, kind: 'markdown', heading: section.title, headingPath: section.headingPath, line: section.line },
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
  return projectObsidianLinks({
    nodes,
    edges,
    groups: [],
    settings: {
      layoutMode: 'auto',
      semanticCardDensity: nodes.length <= 36 ? 'full' : 'mixed',
      sourceMode: 'vault-readonly',
    } as any,
  }, path, markdown, resource, index, absoluteRootPath);
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
