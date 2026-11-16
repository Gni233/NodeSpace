import katex from 'katex';
import 'katex/dist/katex.min.css';

export interface MarkdownMathExpression {
  from: number;
  to: number;
  formula: string;
  displayMode: boolean;
}

type Span = { from: number; to: number };
type MathPart = MarkdownMathExpression | Span;

const endOfLine = (source: string, from: number) => {
  const end = source.indexOf('\n', from);
  return end === -1 ? source.length : end;
};

function escaped(source: string, at: number): boolean {
  let start = at;
  while (source[start - 1] === '\\') start--;
  return (at - start) % 2 === 1;
}

function runEnd(source: string, from: number): number {
  let end = from + 1;
  while (source[end] === source[from]) end++;
  return end;
}

function fencedCode(source: string): Span[] {
  const skipped: Span[] = [];
  let open: { from: number; fence: string } | undefined;
  for (const line of source.matchAll(/^[^\n]*(?:\n|$)/gm)) {
    const fence = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)/.exec(line[0]);
    if (!fence) continue;
    if (!open) {
      open = { from: line.index!, fence: fence[1] };
    } else if (fence[1][0] === open.fence[0] && fence[1].length >= open.fence.length && !fence[2].trim()) {
      skipped.push({ from: open.from, to: line.index! + line[0].length });
      open = undefined;
    }
  }
  if (open) skipped.push({ from: open.from, to: source.length });
  return skipped;
}

function inlineCodeEnd(source: string, from: number, limit: number): number {
  const opening = runEnd(source, from);
  for (let at = source.indexOf('`', opening); at >= 0 && at < limit;) {
    const end = runEnd(source, at);
    if (end - at === opening - from) return end;
    at = source.indexOf('`', end);
  }
  return opening;
}

function linkDestinationEnd(source: string, from: number): number {
  let depth = 1;
  for (let at = from + 2; at < source.length && source[at] !== '\n'; at++) {
    if (escaped(source, at)) continue;
    if (source[at] === '(') depth++;
    if (source[at] === ')' && --depth === 0) return at + 1;
  }
  return from + 1;
}

function readFormula(source: string, from: number, opening: number, lineEnd: number, limit: number): MarkdownMathExpression | null {
  const displayMode = opening - from === 2;
  const canCrossLines = displayMode && /^ {0,3}$/.test(source.slice(source.lastIndexOf('\n', from - 1) + 1, from));
  const end = canCrossLines ? limit : Math.min(limit, lineEnd);
  if (!displayMode && /\s/.test(source[opening] || ' ')) return null;

  for (let close = source.indexOf('$', opening); close >= 0 && close < end;) {
    const to = runEnd(source, close);
    if (escaped(source, close)) { close = source.indexOf('$', close + 1); continue; }
    if (to - close === opening - from) {
      if (!displayMode && (/\s/.test(source[close - 1]) || /\d/.test(source[to] || ''))) return null;
      if (close > lineEnd && source.slice(to, endOfLine(source, to)).trim()) return null;
      const formula = source.slice(opening, close).trim();
      if (!formula || (!displayMode && formula.includes('`'))) return null;
      // An amount introducing prose is usually a price. Numeric formulas with
      // units, commands, or operators still use ordinary inline delimiters.
      if (!displayMode && /^\d[\d,.]*\s+\p{L}{2,}/u.test(formula) && !/[\\+*/=<>^_-]/.test(formula)) return null;
      return { from, to, formula, displayMode };
    }
    if (!displayMode) return null;
    close = source.indexOf('$', to);
  }
  return null;
}

function scanMath(source: string): MathPart[] {
  const parts: MathPart[] = [];
  const skipped = fencedCode(source);
  let block = 0;
  let lineEnd = endOfLine(source, 0);
  for (let at = 0; at < source.length;) {
    if (at > lineEnd) lineEnd = endOfLine(source, at);
    if (skipped[block]?.from === at) {
      at = skipped[block++].to;
    } else if ((at === 0 || source[at - 1] === '\n') && /^(?: {4}| {0,3}\t)/.test(source.slice(at, at + 4))) {
      at = lineEnd + 1;
    } else if (source[at] === '`' && !escaped(source, at)) {
      at = inlineCodeEnd(source, at, skipped[block]?.from ?? source.length);
    } else if (source[at] === ']' && source[at + 1] === '(' && !escaped(source, at)) {
      at = linkDestinationEnd(source, at);
    } else if (source[at] === '$') {
      if (escaped(source, at)) {
        parts.push({ from: at - 1, to: at + 1 });
        at++;
        continue;
      }
      const opening = runEnd(source, at);
      const expression = opening - at <= 2 ? readFormula(source, at, opening, lineEnd, skipped[block]?.from ?? source.length) : null;
      if (expression) parts.push(expression);
      at = expression?.to ?? opening;
    } else {
      at++;
    }
  }
  return parts;
}

/** Source offsets include the delimiters and are compatible with editor document positions. */
export function findMarkdownMath(markdown: string): MarkdownMathExpression[] {
  return scanMath(markdown).filter((part): part is MarkdownMathExpression => 'formula' in part);
}

export function renderMarkdownMath(formula: string, displayMode: boolean): string {
  return katex.renderToString(formula, { displayMode, throwOnError: false, trust: false, strict: 'ignore' });
}

/** Protect TeX from the Markdown renderer's own emphasis and escape handling. */
export function renderMathInMarkdown(markdown: string, renderMarkdown: (source: string) => string): string {
  const parts = scanMath(markdown);
  if (!parts.length) return renderMarkdown(markdown);
  let token = '\ue000math';
  while (markdown.includes(token)) token += '\ue001';
  let from = 0;
  const source: string[] = [];
  const formulas: string[] = [];
  for (const part of parts) {
    source.push(markdown.slice(from, part.from));
    if ('formula' in part) {
      source.push(`${token}${formulas.length}\ue002`);
      formulas.push(renderMarkdownMath(part.formula, part.displayMode));
    } else {
      source.push('$');
    }
    from = part.to;
  }
  source.push(markdown.slice(from));
  return renderMarkdown(source.join('')).replace(new RegExp(`${token}(\\d+)\ue002`, 'g'), (_match, index) => formulas[Number(index)]);
}
