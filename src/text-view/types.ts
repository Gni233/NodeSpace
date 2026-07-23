export type TextEntityKind = 'graph' | 'node' | 'edge' | 'group' | 'settings' | 'setting';

export interface SourcePosition {
  line: number;
  column: number;
}

export interface SourceRange {
  start: SourcePosition;
  end: SourcePosition;
}

export type DiagnosticCode =
  | 'UNCLOSED_QUOTE'
  | 'UNCLOSED_BRACE'
  | 'UNEXPECTED_BRACE'
  | 'MISSING_GRAPH_NAME'
  | 'DUPLICATE_ALIAS'
  | 'UNKNOWN_REFERENCE'
  | 'AMBIGUOUS_REFERENCE'
  | 'INVALID_LEVEL'
  | 'INVALID_PROPERTY'
  | 'INVALID_JSON'
  | 'INVALID_EDGE'
  | 'INVALID_GROUP'
  | 'INVALID_SETTING'
  | 'UNSUPPORTED_GRAPH_NAME';

export interface TextDiagnostic {
  code: DiagnosticCode;
  message: string;
  severity: 'error' | 'warning';
  range: SourceRange;
}

export interface TextField {
  value: string;
  raw: string;
  quoted: boolean;
  range: SourceRange;
}

export interface TextProperty {
  key: string;
  value: unknown;
  range: SourceRange;
  explicit: boolean;
}

export interface TextNodeStatement {
  kind: 'node';
  label: string;
  alias?: string;
  note?: string;
  properties: TextProperty[];
  range: SourceRange;
}

export interface TextReference {
  label: string;
  alias?: string;
  range: SourceRange;
}

export interface TextEdgeStatement {
  kind: 'edge';
  source: TextReference;
  target: TextReference;
  label?: string;
  properties: TextProperty[];
  range: SourceRange;
}

export interface TextGroupStatement {
  kind: 'group';
  label: string;
  alias?: string;
  members: TextReference[];
  properties: TextProperty[];
  range: SourceRange;
}

export interface TextSettingStatement {
  kind: 'setting';
  name: string;
  key: string;
  value: unknown;
  properties: TextProperty[];
  range: SourceRange;
}

export interface TextGraphAst {
  kind: 'graph';
  name: string;
  nodes: TextNodeStatement[];
  edges: TextEdgeStatement[];
  groups: TextGroupStatement[];
  settings: TextSettingStatement[];
  range: SourceRange;
}

export interface TextParseResult {
  ast: TextGraphAst;
  diagnostics: TextDiagnostic[];
  ok: boolean;
}

/** Structural subset used by the pure kernel; compatible with data/storage.ts GraphData. */
export interface GraphDataLike {
  nodes: Record<string, any>[];
  edges: Record<string, any>[];
  groups: Record<string, any>[];
  settings?: Record<string, any>;
  [key: string]: unknown;
}

export interface CompileResult {
  ok: boolean;
  graph?: GraphDataLike;
  graphName?: string;
  diagnostics: TextDiagnostic[];
}

export interface PrintOptions {
  graphName?: string;
}
