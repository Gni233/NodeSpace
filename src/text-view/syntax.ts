import type { SourceRange, TextDiagnostic, TextField } from './types';

export interface ScannedLine {
  fields: TextField[];
  content: string;
  contentColumn: number;
  diagnostics: TextDiagnostic[];
}

function range(line: number, start: number, end: number): SourceRange {
  return { start: { line, column: start }, end: { line, column: end } };
}

function decodeQuoted(raw: string): string {
  let result = '';
  for (let i = 1; i < raw.length - 1; i++) {
    const char = raw[i];
    if (char !== '\\') {
      result += char;
      continue;
    }
    const next = raw[++i];
    if (next === 'n') result += '\n';
    else if (next === '"') result += '"';
    else if (next === '\\') result += '\\';
    else result += `\\${next ?? ''}`;
  }
  return result;
}

/**
 * Scans comments, quotes and field separators in one pass.
 * Exactly two unquoted spaces separate fields. A run of 3+ spaces uses its
 * first two as the separator and preserves every additional space at the
 * beginning of the next field.
 */
export function scanLine(rawLine: string, line: number, columnOffset = 0): ScannedLine {
  const diagnostics: TextDiagnostic[] = [];
  let inQuote = false;
  let escaped = false;
  let commentAt = rawLine.length;
  for (let i = 0; i < rawLine.length; i++) {
    const char = rawLine[i];
    if (inQuote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inQuote = false;
      continue;
    }
    if (char === '"') inQuote = true;
    else if (char === '#' && rawLine[i + 1] === '#') {
      commentAt = i;
      break;
    }
  }
  if (inQuote) {
    diagnostics.push({
      code: 'UNCLOSED_QUOTE',
      message: '未闭合的双引号',
      severity: 'error',
      range: range(line, columnOffset + rawLine.length + 1, columnOffset + rawLine.length + 1),
    });
  }

  const withoutComment = rawLine.slice(0, commentAt).replace(/[ \t]+$/, '');
  const leading = withoutComment.match(/^[ \t]*/)?.[0].length ?? 0;
  const content = withoutComment.slice(leading);
  const contentColumn = columnOffset + leading + 1;
  const fields: TextField[] = [];
  let start = 0;
  inQuote = false;
  escaped = false;

  const push = (end: number): void => {
    const raw = content.slice(start, end);
    const quoted = raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"');
    fields.push({
      value: quoted ? decodeQuoted(raw) : raw,
      raw,
      quoted,
      range: range(line, contentColumn + start, contentColumn + Math.max(start, end - 1)),
    });
  };

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (inQuote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inQuote = false;
      continue;
    }
    if (char === '"') {
      inQuote = true;
      continue;
    }
    if (char === ' ' && content[i + 1] === ' ') {
      push(i);
      start = i + 2;
      let runEnd = start;
      while (runEnd < content.length && content[runEnd] === ' ') runEnd += 1;
      // The extra spaces belong to the next field, but must not themselves be
      // scanned as another separator in the same run.
      i = runEnd - 1;
    }
  }
  if (content.length > 0) push(content.length);
  return { fields, content, contentColumn, diagnostics };
}

export function splitTrailingGroup(
  rawLine: string,
  line: number,
  columnOffset = 0,
): { prefix: string; body?: string; range?: SourceRange; diagnostics: TextDiagnostic[] } {
  const diagnostics: TextDiagnostic[] = [];
  let inQuote = false;
  let escaped = false;
  let depth = 0;
  let open = -1;
  let close = -1;
  for (let i = 0; i < rawLine.length; i++) {
    const char = rawLine[i];
    if (inQuote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inQuote = false;
      continue;
    }
    if (char === '"') inQuote = true;
    else if (char === '{') {
      if (depth === 0) open = i;
      depth += 1;
    } else if (char === '}') {
      if (depth === 0) {
        diagnostics.push({ code: 'UNEXPECTED_BRACE', message: '多余的右花括号', severity: 'error', range: range(line, columnOffset + i + 1, columnOffset + i + 1) });
      } else {
        depth -= 1;
        if (depth === 0) close = i;
      }
    }
  }
  if (depth > 0) {
    diagnostics.push({
      code: 'UNCLOSED_BRACE',
      message: '未闭合的花括号',
      severity: 'error',
      range: range(line, columnOffset + open + 1, columnOffset + rawLine.length + 1),
    });
  }
  if (open < 0 || close < 0 || rawLine.slice(close + 1).trim() !== '' || !/\s/.test(rawLine[open - 1] ?? '')) {
    return { prefix: rawLine, diagnostics };
  }
  return {
    prefix: rawLine.slice(0, open).replace(/[ \t]+$/, ''),
    body: rawLine.slice(open + 1, close),
    range: range(line, columnOffset + open + 1, columnOffset + close + 1),
    diagnostics,
  };
}

export function encodeField(value: string): string {
  const needsQuote = value === ''
    || value.startsWith('-')
    || value === '设置'
    || value.includes('  ')
    || value.includes('##')
    || value.includes('"')
    || value.includes('\\')
    || value.includes('\n')
    || /^\s|\s$/.test(value)
    || /[{}]/.test(value);
  if (!needsQuote) return value;
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

export function referenceParts(value: string): { label: string; alias?: string } {
  const at = value.lastIndexOf('@');
  if (at <= 0 || at === value.length - 1) return { label: value };
  return { label: value.slice(0, at), alias: value.slice(at + 1) };
}
