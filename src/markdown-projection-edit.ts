import { markdownPreambleEnd, parseMarkdownSections } from './vault';

export type MarkdownProjectionTarget =
  | { kind: 'document'; wholeBody?: boolean }
  | { kind: 'section'; heading: string; headingPath?: string; line?: number };

export interface MarkdownProjectionEdit {
  title?: string;
  body?: string;
}

export interface MarkdownProjectionFields {
  title?: string;
  body: string;
}

interface TextRange { start: number; end: number }

const key = (value: string) => value.trim().toLocaleLowerCase('zh-CN');
const normalizeNewlines = (value: string) => value.replace(/\r\n|\r/g, '\n');

function projectionRanges(markdown: string, target: MarkdownProjectionTarget): {
  title?: TextRange; body: TextRange;
} | null {
  if (target.kind === 'document') {
    const start = markdownPreambleEnd(markdown);
    const end = target.wholeBody ? markdown.length : parseMarkdownSections(markdown)[0]?.start ?? markdown.length;
    return { body: { start, end } };
  }
  const heading = key(target.heading);
  const path = target.headingPath && key(target.headingPath);
  const sections = parseMarkdownSections(markdown).filter(section =>
    key(section.title) === heading && (!path || key(section.headingPath) === path));
  // An old line number can point to a different section when repeated headings move.
  if (sections.length !== 1) return null;
  const section = sections[0];
  return {
    title: { start: section.titleStart, end: section.titleEnd },
    body: { start: section.bodyStart, end: section.end },
  };
}

/** Read the exact source slice presented by an editable Vault projection. */
export function readMarkdownProjection(markdown: string, target: MarkdownProjectionTarget): MarkdownProjectionFields | null {
  const ranges = projectionRanges(markdown, target);
  if (!ranges) return null;
  return {
    ...(ranges.title ? { title: markdown.slice(ranges.title.start, ranges.title.end) } : {}),
    body: markdown.slice(ranges.body.start, ranges.body.end),
  };
}

/** Replace only the editable fields, preserving their surrounding Markdown syntax. */
export function replaceMarkdownProjection(
  markdown: string,
  target: MarkdownProjectionTarget,
  edit: MarkdownProjectionEdit,
): string | null {
  const ranges = projectionRanges(markdown, target);
  if (!ranges) return null;
  const title = edit.title?.trim();
  if (edit.title !== undefined && (!ranges.title || !title || /[\r\n]/.test(edit.title))) return null;

  let updated = markdown;
  if (edit.body !== undefined) {
    const { start, end } = ranges.body;
    const existing = markdown.slice(start, end);
    const requested = normalizeNewlines(edit.body);
    if (requested !== normalizeNewlines(existing)) {
      const newline = existing.match(/\r\n|\r|\n/)?.[0] ?? markdown.match(/\r\n|\r|\n/)?.[0] ?? '\n';
      let body = requested.replace(/\n/g, newline);
      const before = markdown.slice(0, start);
      if (body && before.replace(/^\uFEFF/, '') && !/[\r\n]$/.test(before) && !/^[\r\n]/.test(body)) {
        body = `${newline}${body}`;
      }
      if (body && end !== markdown.length && !/[\r\n]$/.test(body)) body += newline;
      updated = `${before}${body}${markdown.slice(end)}`;
    }
  }
  if (ranges.title && title !== undefined) {
    const { start, end } = ranges.title;
    updated = `${updated.slice(0, start)}${title}${updated.slice(end)}`;
  }
  return updated;
}
