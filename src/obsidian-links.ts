export type ObsidianLinkSyntax = 'wikilink' | 'markdown';
export type ObsidianLinkDisposition = 'link' | 'embed';

export interface ObsidianLinkOccurrence {
  raw: string;
  syntax: ObsidianLinkSyntax;
  disposition: ObsidianLinkDisposition;
  target: string;
  heading?: string;
  block?: string;
  alias?: string;
  line: number;
  column?: number;
  sourceHeading?: string;
  /** Obsidian's [[## heading]] / [[^^ block]] search syntax is not a concrete relation. */
  search?: boolean;
}

export interface ObsidianLinkResource {
  path: string;
  name: string;
  kind: string;
  size: number;
  mtime: number;
  title?: string;
  documentTitle?: string;
  aliases?: string[];
  links?: ObsidianLinkOccurrence[];
}

export interface ObsidianLinkIndex {
  notes: ObsidianLinkResource[];
  attachments: ObsidianLinkResource[];
  graphs: ObsidianLinkResource[];
}

export type ObsidianLinkResolutionStatus = 'resolved' | 'missing' | 'ambiguous' | 'external' | 'search';

export interface ResolvedObsidianLink {
  status: ObsidianLinkResolutionStatus;
  occurrence: ObsidianLinkOccurrence;
  resource?: ObsidianLinkResource;
  candidates: ObsidianLinkResource[];
  displayLabel: string;
}

export interface ObsidianBacklink {
  source: ObsidianLinkResource;
  occurrence: ObsidianLinkOccurrence;
  resolution: ResolvedObsidianLink;
}

export interface ObsidianBlockDefinition {
  id: string;
  line: number;
  text: string;
  sourceHeading?: string;
}

const EXTERNAL_TARGET = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;
const BLOCK_ID = /^[A-Za-z\d-]+$/;

function decodeLinkPart(value: string): string {
  const clean = String(value || '').trim().replace(/^<|>$/g, '');
  try { return decodeURIComponent(clean); } catch { return clean; }
}

export function normalizeObsidianPath(value: string): string {
  const segments: string[] = [];
  for (const segment of decodeLinkPart(value).replace(/\\/g, '/').replace(/^\/+/, '').split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') { segments.pop(); continue; }
    segments.push(segment);
  }
  return segments.join('/');
}

function maskIgnoredMarkdown(markdown: string): string[] {
  const source = String(markdown || '').replace(/^\uFEFF/, '');
  const lines = source.split(/\r?\n/);
  const masked: string[] = [];
  let fenced = false;
  let fenceMarker = '';
  let inComment = false;
  let inFrontmatter = lines[0]?.trim() === '---';
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (inFrontmatter) {
      masked.push(' '.repeat(line.length));
      if (index > 0 && line.trim() === '---') inFrontmatter = false;
      continue;
    }
    const fence = line.match(/^\s*(```+|~~~+)/);
    if (fence) {
      const marker = fence[1][0];
      if (!fenced) { fenced = true; fenceMarker = marker; }
      else if (marker === fenceMarker) { fenced = false; fenceMarker = ''; }
      masked.push(' '.repeat(line.length));
      continue;
    }
    if (fenced) { masked.push(' '.repeat(line.length)); continue; }
    let result = '';
    let cursor = 0;
    while (cursor < line.length) {
      if (inComment) {
        const end = line.indexOf('-->', cursor);
        if (end < 0) { result += ' '.repeat(line.length - cursor); cursor = line.length; continue; }
        result += ' '.repeat(end + 3 - cursor);
        cursor = end + 3;
        inComment = false;
        continue;
      }
      const comment = line.indexOf('<!--', cursor);
      const tick = line.indexOf('`', cursor);
      const next = [comment, tick].filter(position => position >= 0).sort((a, b) => a - b)[0];
      if (next === undefined) { result += line.slice(cursor); break; }
      result += line.slice(cursor, next);
      if (next === comment) {
        result += '    ';
        cursor = next + 4;
        inComment = true;
        continue;
      }
      const run = line.slice(next).match(/^`+/)?.[0] || '`';
      const end = line.indexOf(run, next + run.length);
      if (end < 0) { result += ' '.repeat(line.length - next); break; }
      result += ' '.repeat(end + run.length - next);
      cursor = end + run.length;
    }
    masked.push(result.padEnd(line.length, ' '));
  }
  return masked;
}

function splitTarget(value: string): { target: string; heading?: string; block?: string; search?: boolean } {
  const decoded = decodeLinkPart(value).trim();
  if (decoded.startsWith('^^')) return { target: '', block: decoded.slice(2).trim(), search: true };
  const hash = decoded.indexOf('#');
  const target = decodeLinkPart(hash >= 0 ? decoded.slice(0, hash) : decoded).replace(/\?.*$/, '');
  if (hash < 0) return { target };
  const fragment = decodeLinkPart(decoded.slice(hash + 1)).trim();
  if (!target && (fragment.startsWith('#') || fragment.startsWith('^') && !BLOCK_ID.test(fragment.slice(1)))) {
    return { target, heading: fragment, search: true };
  }
  if (fragment.startsWith('^') && BLOCK_ID.test(fragment.slice(1))) return { target, block: fragment.slice(1) };
  return fragment ? { target, heading: fragment } : { target };
}

function markdownDestination(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('<')) {
    const close = trimmed.indexOf('>');
    if (close > 0) return trimmed.slice(1, close);
  }
  const title = trimmed.match(/^(.*?)(?:\s+["'][^"']*["'])\s*$/);
  return (title?.[1] || trimmed).trim();
}

/** Extract links without interpreting them. Fenced code, inline code, comments,
 * and frontmatter are masked so examples do not become graph relations. */
export function extractObsidianLinks(markdown: string): ObsidianLinkOccurrence[] {
  const sourceLines = String(markdown || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  const maskedLines = maskIgnoredMarkdown(markdown);
  const occurrences: ObsidianLinkOccurrence[] = [];
  let sourceHeading: string | undefined;
  for (let index = 0; index < maskedLines.length; index++) {
    const masked = maskedLines[index];
    const original = sourceLines[index] || '';
    const heading = masked.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (heading) sourceHeading = original.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/)?.[1]?.trim() || heading[1].trim();

    for (const match of masked.matchAll(/(!?)\[\[([^\]\n]+)\]\]/g)) {
      const start = match.index || 0;
      const raw = original.slice(start, start + match[0].length);
      const body = match[2];
      const pipe = body.indexOf('|');
      const destination = pipe >= 0 ? body.slice(0, pipe) : body;
      const alias = pipe >= 0 ? body.slice(pipe + 1).trim() : '';
      const parts = splitTarget(destination);
      occurrences.push({
        raw,
        syntax: 'wikilink',
        disposition: match[1] ? 'embed' : 'link',
        target: parts.target,
        ...(parts.heading ? { heading: parts.heading } : {}),
        ...(parts.block ? { block: parts.block } : {}),
        ...(alias ? { alias } : {}),
        line: index + 1,
        column: start + 1,
        ...(sourceHeading ? { sourceHeading } : {}),
        ...(parts.search ? { search: true } : {}),
      });
    }

    for (const match of masked.matchAll(/(!?)\[([^\]\n]*)\]\(([^)\n]+)\)/g)) {
      const destination = markdownDestination(match[3]);
      if (!destination || EXTERNAL_TARGET.test(destination)) continue;
      const parts = splitTarget(destination);
      const start = match.index || 0;
      occurrences.push({
        raw: original.slice(start, start + match[0].length),
        syntax: 'markdown',
        disposition: match[1] ? 'embed' : 'link',
        target: parts.target,
        ...(parts.heading ? { heading: parts.heading } : {}),
        ...(parts.block ? { block: parts.block } : {}),
        ...(match[2].trim() ? { alias: match[2].trim() } : {}),
        line: index + 1,
        column: start + 1,
        ...(sourceHeading ? { sourceHeading } : {}),
        ...(parts.search ? { search: true } : {}),
      });
    }
  }
  return occurrences.sort((left, right) => left.line - right.line || (left.column || 0) - (right.column || 0));
}

function withoutMarkdownExtension(value: string): string {
  return value.replace(/\.md$/i, '');
}

interface ResourceLookup {
  resources: ObsidianLinkResource[];
  paths: Map<string, number[]>;
  names: Map<string, number[]>;
  terms: Map<string, number[]>;
}

// Vault scans publish a new snapshot, so a changed library has a fresh lookup.
const resourceLookups = new WeakMap<ObsidianLinkIndex, ResourceLookup>();
const backlinkLookups = new WeakMap<ObsidianLinkIndex, Map<string, ObsidianBacklink[]>>();
const linkPathKey = (value: string) => normalizeObsidianPath(value).toLocaleLowerCase('zh-CN');

function resourceLookup(index: ObsidianLinkIndex): ResourceLookup {
  const cached = resourceLookups.get(index);
  if (cached) return cached;
  const resources = [...(index.notes || []), ...(index.attachments || []), ...(index.graphs || [])];
  const paths = new Map<string, number[]>();
  const names = new Map<string, number[]>();
  const terms = new Map<string, number[]>();
  const add = (lookup: Map<string, number[]>, key: string, position: number) => {
    const positions = lookup.get(key);
    if (positions) positions.push(position);
    else lookup.set(key, [position]);
  };
  resources.forEach((resource, position) => {
    add(paths, linkPathKey(resource.path), position);
    const name = String(resource.name || resource.path.split('/').pop() || '').toLocaleLowerCase('zh-CN');
    add(names, name, position);
    const matches = new Set([withoutMarkdownExtension(name), resource.title, resource.documentTitle, ...(resource.aliases || [])]
      .map(term => String(term || '').toLocaleLowerCase('zh-CN')));
    for (const term of matches) add(terms, term, position);
  });
  const lookup = { resources, paths, names, terms };
  resourceLookups.set(index, lookup);
  return lookup;
}

function sameDirectory(sourcePath: string, targetPath: string): boolean {
  const sourceDirectory = normalizeObsidianPath(sourcePath).split('/').slice(0, -1).join('/').toLocaleLowerCase('zh-CN');
  const targetDirectory = normalizeObsidianPath(targetPath).split('/').slice(0, -1).join('/').toLocaleLowerCase('zh-CN');
  return sourceDirectory === targetDirectory;
}

function resolvedLabel(resource: ObsidianLinkResource | undefined, occurrence: ObsidianLinkOccurrence): string {
  if (occurrence.alias?.trim()) return occurrence.alias.trim();
  if (resource?.kind === 'markdown') return withoutMarkdownExtension(normalizeObsidianPath(resource.path).split('/').pop() || resource.name);
  if (resource?.title?.trim()) return resource.title.trim();
  const raw = resource?.name || occurrence.target.split('/').pop() || occurrence.heading || occurrence.block || '当前笔记';
  return raw.replace(/\.[^.]+$/, '');
}

/** Resolve with deterministic, Obsidian-like precedence: explicit/relative path,
 * then a unique same-folder match, then a unique vault-wide basename/title. */
export function resolveObsidianLink(
  index: ObsidianLinkIndex,
  sourcePath: string,
  occurrence: ObsidianLinkOccurrence,
): ResolvedObsidianLink {
  if (occurrence.search) {
    return { status: 'search', occurrence, candidates: [], displayLabel: occurrence.alias || occurrence.heading || occurrence.raw };
  }
  if (EXTERNAL_TARGET.test(occurrence.target)) {
    return { status: 'external', occurrence, candidates: [], displayLabel: resolvedLabel(undefined, occurrence) };
  }
  const { resources, paths, names, terms } = resourceLookup(index);
  if (!occurrence.target.trim()) {
    const position = paths.get(linkPathKey(sourcePath))?.[0];
    const current = position === undefined ? undefined : resources[position];
    return current
      ? { status: 'resolved', occurrence, resource: current, candidates: [current], displayLabel: resolvedLabel(current, occurrence) }
      : { status: 'missing', occurrence, candidates: [], displayLabel: resolvedLabel(undefined, occurrence) };
  }

  const rawTarget = decodeLinkPart(occurrence.target).replace(/\\/g, '/');
  const sourceDirectory = normalizeObsidianPath(sourcePath).split('/').slice(0, -1).join('/');
  const rootTarget = normalizeObsidianPath(rawTarget);
  const relativeTarget = normalizeObsidianPath(`${sourceDirectory}/${rawTarget}`);
  const wantedPaths = [...new Set([
    ...(rawTarget.startsWith('./') || rawTarget.startsWith('../') ? [relativeTarget, rootTarget] : [rootTarget]),
    ...(occurrence.syntax === 'markdown' && relativeTarget !== rootTarget ? [relativeTarget] : []),
    ...(!/\.[^/]+$/.test(rootTarget) ? [`${rootTarget}.md`, ...(relativeTarget !== rootTarget ? [`${relativeTarget}.md`] : [])] : []),
  ].map(value => value.toLocaleLowerCase('zh-CN')))];
  for (const wanted of wantedPaths) {
    const exact = paths.get(wanted);
    if (exact?.length === 1) {
      const resource = resources[exact[0]];
      return { status: 'resolved', occurrence, resource, candidates: [resource], displayLabel: resolvedLabel(resource, occurrence) };
    }
  }

  const targetLeaf = (rootTarget.split('/').pop() || rootTarget).toLocaleLowerCase('zh-CN');
  const targetStem = withoutMarkdownExtension(targetLeaf);
  const matches = new Set([...(names.get(targetLeaf) ?? []), ...(terms.get(targetStem) ?? [])]);
  const loose = [...matches].sort((left, right) => left - right).map(position => resources[position]);
  const nearby = loose.filter(resource => sameDirectory(sourcePath, resource.path));
  const candidates = nearby.length === 1 ? nearby : loose;
  if (candidates.length === 1) {
    return { status: 'resolved', occurrence, resource: candidates[0], candidates, displayLabel: resolvedLabel(candidates[0], occurrence) };
  }
  return {
    status: candidates.length > 1 ? 'ambiguous' : 'missing',
    occurrence,
    candidates,
    displayLabel: resolvedLabel(undefined, occurrence),
  };
}

export function obsidianBacklinksForPath(
  index: ObsidianLinkIndex,
  targetPath: string,
): ObsidianBacklink[] {
  let lookup = backlinkLookups.get(index);
  if (!lookup) {
    lookup = new Map();
    for (const note of index.notes || []) {
      const source = linkPathKey(note.path);
      for (const occurrence of note.links || []) {
        const resolution = resolveObsidianLink(index, note.path, occurrence);
        if (resolution.status !== 'resolved' || !resolution.resource) continue;
        const target = linkPathKey(resolution.resource.path);
        if (source === target) continue;
        const backlink = { source: note, occurrence, resolution };
        const entries = lookup.get(target);
        if (entries) entries.push(backlink);
        else lookup.set(target, [backlink]);
      }
    }
    for (const entries of lookup.values()) {
      entries.sort((left, right) => normalizeObsidianPath(left.source.path).localeCompare(normalizeObsidianPath(right.source.path), 'zh-CN')
        || left.occurrence.line - right.occurrence.line);
    }
    backlinkLookups.set(index, lookup);
  }
  return lookup.get(linkPathKey(targetPath))?.slice() ?? [];
}

function compactBlockText(value: string): string {
  return value
    .replace(/\s+\^[A-Za-z\d-]+\s*$/m, '')
    .replace(/^\s*(?:[-*+]\s+|>\s?|\d+[.)]\s+)/gm, '')
    .replace(/[*_~`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract addressable blocks only; callers decide which referenced blocks are
 * worth projecting as nodes, so ordinary documents do not explode in size. */
export function extractObsidianBlocks(markdown: string): ObsidianBlockDefinition[] {
  const sourceLines = String(markdown || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  const maskedLines = maskIgnoredMarkdown(markdown);
  const blocks: ObsidianBlockDefinition[] = [];
  let sourceHeading: string | undefined;
  for (let index = 0; index < maskedLines.length; index++) {
    const heading = maskedLines[index].match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (heading) sourceHeading = sourceLines[index].match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/)?.[1]?.trim() || heading[1].trim();
    const match = maskedLines[index].match(/(?:^|\s)\^([A-Za-z\d-]+)\s*$/);
    if (!match) continue;
    let start = index;
    const standalone = maskedLines[index].trim() === `^${match[1]}`;
    if (standalone) start = Math.max(0, index - 1);
    while (start > 0 && maskedLines[start - 1].trim() && !/^\s{0,3}#{1,6}\s+/.test(maskedLines[start - 1])) start--;
    const text = compactBlockText(sourceLines.slice(start, index + 1).join('\n'));
    blocks.push({ id: match[1], line: index + 1, text, ...(sourceHeading ? { sourceHeading } : {}) });
  }
  return blocks;
}
