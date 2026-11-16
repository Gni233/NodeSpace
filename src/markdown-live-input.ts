import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { Compartment, EditorState, StateField, type Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, drawSelection, keymap, placeholder, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { findMarkdownMath, renderMarkdownMath } from './markdown-math';
import type { MarkdownLiveInput } from './markdown-source-editor';

interface StyledRange {
  from: number;
  to: number;
  decoration: Range<Decoration>;
}

class MathWidget extends WidgetType {
  constructor(readonly formula: string, readonly displayMode: boolean, readonly block: boolean) { super(); }

  eq(other: MathWidget): boolean {
    return this.formula === other.formula && this.displayMode === other.displayMode && this.block === other.block;
  }

  toDOM(): HTMLElement {
    const element = document.createElement(this.block ? 'div' : 'span');
    element.className = this.block ? 'ns-md-live-math-block' : 'ns-md-live-math-inline';
    element.innerHTML = renderMarkdownMath(this.formula, this.displayMode);
    return element;
  }

  ignoreEvent(): boolean { return false; }
}

const concealed = Decoration.replace({});
const emphasis = new Map([
  ['Emphasis', 'ns-md-live-emphasis'], ['StrongEmphasis', 'ns-md-live-strong'],
  ['Strikethrough', 'ns-md-live-strike'], ['InlineCode', 'ns-md-live-code'], ['Link', 'ns-md-live-link'],
]);

function documentStyles(state: EditorState): StyledRange[] {
  const source = state.doc.toString();
  const math = findMarkdownMath(source);
  const styles: StyledRange[] = [];
  const add = (from: number, to: number, decoration: Range<Decoration>) => styles.push({ from, to, decoration });
  for (const expression of math) {
    const { from, to, formula, displayMode } = expression;
    const firstLine = state.doc.lineAt(from);
    const lastLine = state.doc.lineAt(to - 1);
    const block = displayMode && !source.slice(firstLine.from, from).trim() && !source.slice(to, lastLine.to).trim();
    const range = block ? [firstLine.from, lastLine.to] : [from, to];
    add(from, to, Decoration.replace({ widget: new MathWidget(formula, displayMode, block), block }).range(range[0], range[1]));
  }

  markdownLanguage.parser.parse(source).iterate({ enter(node) {
    const { name, from, to } = node;
    const containingMath = math.find(expression => expression.from <= from && expression.to >= to);
    if (containingMath) return false;
    const heading = /^(?:ATX|Setext)Heading([1-6])$/.exec(name);
    const format = emphasis.get(name);
    if (heading) {
      const line = state.doc.lineAt(from);
      const end = state.doc.lineAt(to - 1);
      add(from, to, Decoration.line({ class: `ns-md-live-heading ns-md-live-h${heading[1]}` }).range(line.from));
      if (name.startsWith('Setext') && end.number > line.number) {
        add(from, to, Decoration.line({ class: 'ns-md-live-setext-mark' }).range(end.from));
      }
      for (const marker of node.node.getChildren('HeaderMark')) {
        if (marker.from >= line.to) continue;
        const before = marker.from > from;
        const start = before ? marker.from - (source.slice(from, marker.from).match(/[ \t]+$/)?.[0].length ?? 0) : marker.from;
        const end = before ? marker.to : marker.to + (source.slice(marker.to, line.to).match(/^[ \t]+/)?.[0].length ?? 0);
        add(from, to, concealed.range(start, end));
      }
    } else if (format && !math.some(expression => expression.from < to && expression.to > from)) {
      add(from, to, Decoration.mark({ class: format }).range(from, to));
      if (name === 'Link') {
        const markers = node.node.getChildren('LinkMark');
        if (markers.length >= 2 && source[markers[0].from] === '[') {
          add(from, to, concealed.range(markers[0].from, markers[0].to));
          add(from, to, concealed.range(markers[1].from, to));
        }
      } else {
        for (const marker of node.node.getChildren(name === 'InlineCode' ? 'CodeMark' : 'EmphasisMark')) {
          add(from, to, concealed.range(marker.from, marker.to));
        }
      }
    } else if (name === 'QuoteMark' || name === 'ListMark' || name === 'TaskMarker') {
      add(from, to, Decoration.mark({ class: 'ns-md-live-marker' }).range(from, to));
    } else if (name === 'FencedCode') {
      for (const marker of node.node.getChildren('CodeMark')) {
        add(from, to, Decoration.line({ class: 'ns-md-live-fence' }).range(state.doc.lineAt(marker.from).from));
      }
      return false;
    }
  } });
  return styles;
}

function visibleStyles(state: EditorState, styles: readonly StyledRange[]): DecorationSet {
  const active = state.selection.ranges.map(range => ({
    from: state.doc.lineAt(range.from).from,
    to: state.doc.lineAt(range.to).to,
  }));
  return Decoration.set(styles
    .filter(style => !active.some(selection => style.from <= selection.to && style.to >= selection.from))
    .map(style => style.decoration), true);
}

const livePreview = StateField.define<{ styles: StyledRange[]; decorations: DecorationSet }>({
  create(state) {
    const styles = documentStyles(state);
    return { styles, decorations: visibleStyles(state, styles) };
  },
  update(previous, transaction) {
    if (!transaction.docChanged && !transaction.selection) return previous;
    const styles = transaction.docChanged ? documentStyles(transaction.state) : previous.styles;
    return { styles, decorations: visibleStyles(transaction.state, styles) };
  },
  provide: field => EditorView.decorations.from(field, value => value.decorations),
});

function changedSource(source: string, update: ViewUpdate): string {
  const endings = [...source.matchAll(/\r\n|\r|\n/g)];
  const crlf = endings.filter(ending => ending[0] === '\r\n');
  const sourceOffset = (position: number) => {
    let offset = position;
    for (const ending of crlf) {
      if (ending.index >= offset) break;
      offset++;
    }
    return offset;
  };
  let result = '';
  let end = 0;
  update.changes.iterChanges((from, to, _newFrom, _newTo, text) => {
    const start = sourceOffset(from);
    const newline = endings.find(ending => ending.index >= start)?.[0] ?? endings[endings.length - 1]?.[0] ?? '\n';
    result += source.slice(end, start) + text.toString().replace(/\n/g, newline);
    end = sourceOffset(to);
  });
  return result + source.slice(end);
}

export function createMarkdownLiveInput(parent: HTMLElement, onInput: (content: string) => void): MarkdownLiveInput {
  const access = new Compartment();
  const attributes = new Compartment();
  let source = '';
  let readOnly = false;
  let label = 'Markdown 原文';
  const accessExtensions = (value: boolean) => [EditorState.readOnly.of(value), EditorView.editable.of(!value)];
  const inputAttributes = (value: string) => EditorView.contentAttributes.of({ 'aria-label': value, spellcheck: 'false' });
  const state = () => EditorState.create({ doc: source, extensions: [
    markdown(), livePreview, history(), drawSelection(), EditorView.lineWrapping, placeholder('在这里输入正文'),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    access.of(accessExtensions(readOnly)), attributes.of(inputAttributes(label)),
    EditorView.updateListener.of(update => {
      if (!update.docChanged) return;
      source = changedSource(source, update);
      onInput(source);
    }),
  ] });
  const view = new EditorView({ parent, state: state() });
  return {
    setValue(value) { source = value; view.setState(state()); },
    setReadOnly(value) {
      if (readOnly === value) return;
      readOnly = value;
      view.dispatch({ effects: access.reconfigure(accessExtensions(value)) });
    },
    setLabel(value) {
      if (label === value) return;
      label = value;
      view.dispatch({ effects: attributes.reconfigure(inputAttributes(value)) });
    },
    focusAt(offset) {
      const position = source.slice(0, offset).replace(/\r\n?/g, '\n').length;
      view.dispatch({ selection: { anchor: position }, effects: EditorView.scrollIntoView(position, { y: 'center' }) });
      view.focus();
    },
  };
}
