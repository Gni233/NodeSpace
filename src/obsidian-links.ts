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

function allResources(index: ObsidianLinkIndex): ObsidianLinkResource[] {
  return [...(index.notes || []), ...(index.attachments || []), ...(index.graphs || [])];
}

function withoutMarkdownExtension(value: string): string {
  return value.replace(/\.md$/i, '');
}

function sameDirectory(sourcePath: string, targetPath: string): boolean {
  const sourceDirectory = normalizeObsidianPath(sourcePath).split('/').slice(0, -1).join('/').toLocaleLowerCase('zh-CN');
  const targetDirectory = normalizeObsidianPath(targetPath).split('/').slice(0, -1).join('/').toLocaleLowerCase('zh-CN');
  return sourceDirectory === targetDirectory;
}

function resolvedLabel(resource: ObsidianLinkResource | undefined, occurrence: ObsidianLinkOccurrence): string {
  if (occurrence.alias?.trim()) return occurrence.alias.trim();
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
  const resources = allResources(index);
  if (!occurrence.target.trim()) {
    const current = resources.find(resource => normalizeObsidianPath(resource.path).toLocaleLowerCase('zh-CN')
      === normalizeObsidianPath(sourcePath).toLocaleLowerCase('zh-CN'));
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
    const exact = resources.filter(resource => normalizeObsidianPath(resource.path).toLocaleLowerCase('zh-CN') === wanted);
    if (exact.length === 1) {
      return { status: 'resolved', occurrence, resource: exact[0], candidates: exact, displayLabel: resolvedLabel(exact[0], occurrence) };
    }
  }

  const targetLeaf = (rootTarget.split('/').pop() || rootTarget).toLocaleLowerCase('zh-CN');
  const targetStem = withoutMarkdownExtension(targetLeaf);
  const loose = resources.filter(resource => {
    const name = String(resource.name || resource.path.split('/').pop() || '').toLocaleLowerCase('zh-CN');
    const stem = withoutMarkdownExtension(name);
    const title = String(resource.title || '').toLocaleLowerCase('zh-CN');
    const aliases = (resource.aliases || []).map(alias => alias.toLocaleLowerCase('zh-CN'));
    return name === targetLeaf || stem === targetStem || title === targetStem || aliases.includes(targetStem);
  });
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
  const wanted = normalizeObsidianPath(targetPath).toLocaleLowerCase('zh-CN');
  const backlinks: ObsidianBacklink[] = [];
  for (const note of index.notes || []) {
    if (normalizeObsidianPath(note.path).toLocaleLowerCase('zh-CN') === wanted) continue;
    for (const occurrence of note.links || []) {
      const resolution = resolveObsidianLink(index, note.path, occurrence);
      if (resolution.status !== 'resolved' || !resolution.resource) continue;
      if (normalizeObsidianPath(resolution.resource.path).toLocaleLowerCase('zh-CN') !== wanted) continue;
      backlinks.push({ source: note, occurrence, resolution });
    }
  }
  return backlinks.sort((left, right) =>
    normalizeObsidianPath(left.source.path).localeCompare(normalizeObsidianPath(right.source.path), 'zh-CN')
      || left.occurrence.line - right.occurrence.line);
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
