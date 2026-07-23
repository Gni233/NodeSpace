import { parseProperty, parseValue, settingKey } from './properties';
import { referenceParts, scanLine, splitTrailingGroup } from './syntax';
import type {
  SourceRange,
  TextDiagnostic,
  TextEdgeStatement,
  TextField,
  TextGraphAst,
  TextGroupStatement,
  TextNodeStatement,
  TextParseResult,
  TextProperty,
  TextReference,
  TextSettingStatement,
} from './types';

function lineRange(line: number, text: string): SourceRange {
  return { start: { line, column: 1 }, end: { line, column: Math.max(1, text.length) } };
}

function isAlias(value: string): boolean {
  return /^[$A-Z_a-z\u4e00-\u9fff][$\w\u4e00-\u9fff-]*$/.test(value);
}

function reference(field: TextField): TextReference {
  const parts = referenceParts(field.value);
  return { ...parts, range: field.range };
}

function parseEntityName(field: TextField): { label: string; alias?: string } {
  const parts = referenceParts(field.value);
  return parts.alias && isAlias(parts.alias) ? parts : { label: field.value };
}

function collectProperties(
  context: 'node' | 'edge' | 'group',
  fields: TextField[],
  diagnostics: TextDiagnostic[],
  allowContent: boolean,
): { properties: TextProperty[]; content?: string } {
  const properties: TextProperty[] = [];
  let content: string | undefined;
  for (const field of fields) {
    const local: TextDiagnostic[] = [];
    const property = parseProperty(context, field.value, field.range, local);
    if (property) {
      properties.push(property);
      diagnostics.push(...local);
      continue;
    }
    if (allowContent && content === undefined && local.every(item => item.code === 'INVALID_PROPERTY')) {
      content = field.value;
      continue;
    }
    diagnostics.push(...local);
  }
  return { properties, content };
}

function emptyAst(): TextGraphAst {
  const empty = lineRange(1, '');
  return { kind: 'graph', name: '', nodes: [], edges: [], groups: [], settings: [], range: empty };
}

export function parseTextGraph(source: string): TextParseResult {
  const diagnostics: TextDiagnostic[] = [];
  const ast = emptyAst();
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let graphLine = -1;
  let inSettings = false;

  for (let index = 0; index < lines.length; index++) {
    const line = index + 1;
    const rawLine = lines[index];
    const scanned = scanLine(rawLine, line);
    diagnostics.push(...scanned.diagnostics);
    if (scanned.fields.length === 0) continue;

    if (graphLine < 0) {
      graphLine = index;
      if (scanned.fields.length > 1) {
        diagnostics.push({
          code: 'INVALID_PROPERTY',
          message: '图名必须独占首个有效行；如需双空格请使用引号',
          severity: 'error',
          range: scanned.fields[1].range,
        });
      }
      ast.name = scanned.fields[0].value;
      ast.range.start = { line, column: scanned.fields[0].range.start.column };
      continue;
    }

    if (!scanned.fields[0].quoted && scanned.fields[0].value === '设置' && scanned.fields.length === 1) {
      inSettings = true;
      continue;
    }

    if (inSettings) {
      if (scanned.fields.length < 2) {
        diagnostics.push({ code: 'INVALID_SETTING', message: '设置行需要“名称  值”两个字段', severity: 'error', range: lineRange(line, rawLine) });
        continue;
      }
      if (scanned.fields.length > 2) {
        diagnostics.push({ code: 'INVALID_SETTING', message: '设置值必须是单个字段；如包含双空格请使用引号或 JSON 字符串', severity: 'error', range: scanned.fields[2].range });
      }
      const name = scanned.fields[0].value;
      const key = settingKey(name);
      const valueField = scanned.fields[1];
      const value = parseValue(valueField.raw, valueField.range, diagnostics);
      const setting: TextSettingStatement = {
        kind: 'setting', name, key, value,
        properties: [{ key, value, range: valueField.range, explicit: true }],
        range: lineRange(line, rawLine),
      };
      ast.settings.push(setting);
      continue;
    }

    if (!scanned.fields[0].quoted && scanned.fields[0].value === '-') {
      if (scanned.fields.length < 3) {
        diagnostics.push({ code: 'INVALID_EDGE', message: '边需要“-  起点  终点”三个字段', severity: 'error', range: lineRange(line, rawLine) });
        continue;
      }
      const parsed = collectProperties('edge', scanned.fields.slice(3), diagnostics, true);
      const edge: TextEdgeStatement = {
        kind: 'edge',
        source: reference(scanned.fields[1]),
        target: reference(scanned.fields[2]),
        label: parsed.content,
        properties: parsed.properties,
        range: lineRange(line, rawLine),
      };
      ast.edges.push(edge);
      continue;
    }

    const group = splitTrailingGroup(scanned.content, line, scanned.contentColumn - 1);
    diagnostics.push(...group.diagnostics);
    if (group.body !== undefined) {
      const prefix = scanLine(group.prefix, line, scanned.contentColumn - 1);
      const bodyColumn = scanned.contentColumn - 1 + scanned.content.indexOf('{') + 1;
      const body = scanLine(group.body, line, bodyColumn);
      diagnostics.push(...prefix.diagnostics, ...body.diagnostics);
      if (prefix.fields.length < 1) {
        diagnostics.push({ code: 'INVALID_GROUP', message: 'group 需要名称', severity: 'error', range: lineRange(line, rawLine) });
        continue;
      }
      const named = parseEntityName(prefix.fields[0]);
      const parsed = collectProperties('group', prefix.fields.slice(1), diagnostics, false);
      const statement: TextGroupStatement = {
        kind: 'group', ...named,
        members: body.fields.map(reference),
        properties: parsed.properties,
        range: lineRange(line, rawLine),
      };
      ast.groups.push(statement);
      continue;
    }

    const named = parseEntityName(scanned.fields[0]);
    const parsed = collectProperties('node', scanned.fields.slice(1), diagnostics, true);
    const node: TextNodeStatement = {
      kind: 'node', ...named,
      note: parsed.content,
      properties: parsed.properties,
      range: lineRange(line, rawLine),
    };
    ast.nodes.push(node);
  }

  if (graphLine < 0 || ast.name === '') {
    diagnostics.push({ code: 'MISSING_GRAPH_NAME', message: '首个有效行必须是图名', severity: 'error', range: lineRange(1, lines[0] ?? '') });
  }
  ast.range.end = { line: Math.max(1, lines.length), column: Math.max(1, lines[lines.length - 1]?.length ?? 0) };
  return { ast, diagnostics, ok: diagnostics.every(item => item.severity !== 'error') };
}

export const parse = parseTextGraph;
