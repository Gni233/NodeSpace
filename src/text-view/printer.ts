import { entityId, stableAliases } from './aliases';
import { SETTING_KEY_TO_NAME } from './properties';
import { encodeField } from './syntax';
import type { GraphDataLike, PrintOptions } from './types';

const NODE_DEFAULTS: Record<string, unknown> = { headingLevel: 4, radius: 9, tags: [] };
const EDGE_DEFAULTS: Record<string, unknown> = { color: '#BFBFBF', arrow: false };
const NO_DEFAULTS: Record<string, unknown> = {};
const NODE_SKIP = new Set(['id', 'label', 'note', 'x', 'y', 'fx', 'fy', 'vx', 'vy', 'index', '_isNew', '_createdAt']);
const EDGE_SKIP = new Set(['source', 'target', 'label', 'index', '_createdAt']);
const GROUP_SKIP = new Set(['id', 'label']);

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function json(value: unknown): string {
  const encoded = JSON.stringify(value);
  return encoded === undefined ? 'null' : encoded;
}

function properties(entity: Record<string, any>, skip: Set<string>, defaults: Record<string, unknown>): string[] {
  const result: string[] = [];
  for (const key of Object.keys(entity).sort()) {
    if (skip.has(key) || (key in defaults && same(entity[key], defaults[key]))) continue;
    result.push(`${key}=${json(entity[key])}`);
  }
  return result;
}

function reference(node: Record<string, any>, alias: string): string {
  return encodeField(`${String(node.label ?? '')}@${alias}`);
}

function edgeLine(
  edge: Record<string, any>,
  nodeById: Map<string, Record<string, any>>,
  aliases: Map<string, string>,
): string {
  const sourceId = entityId(edge.source);
  const targetId = entityId(edge.target);
  const source = nodeById.get(sourceId);
  const target = nodeById.get(targetId);
  const sourceRef = source ? reference(source, aliases.get(sourceId)!) : encodeField(`@${sourceId}`);
  const targetRef = target ? reference(target, aliases.get(targetId)!) : encodeField(`@${targetId}`);
  const fields = ['-', sourceRef, targetRef];
  if (edge.label !== undefined && edge.label !== '') fields.push(`label=${json(edge.label)}`);
  fields.push(...properties(edge, EDGE_SKIP, EDGE_DEFAULTS));
  return fields.join('  ');
}

export function printTextGraph(graph: GraphDataLike, options: PrintOptions | string = {}): string {
  const graphName = typeof options === 'string' ? options : options.graphName;
  const nodes = graph.nodes ?? [];
  const aliases = stableAliases(nodes, 'n');
  const nodeById = new Map(nodes.map(node => [String(node.id), node]));
  const lines = [encodeField(graphName ?? String(graph.graphName ?? '未命名图'))];

  const representedGroupLabels = new Set((graph.groups ?? []).map(group => String(group.label ?? '')));
  for (const node of nodes) {
    const id = String(node.id);
    const fields = [reference(node, aliases.get(id)!)];
    if (node.note !== undefined && node.note !== '') fields.push(`note=${json(node.note)}`);
    const printableNode = {
      ...node,
      tags: Array.isArray(node.tags) ? node.tags.filter((tag: unknown) => !representedGroupLabels.has(String(tag))) : node.tags,
    };
    fields.push(...properties(printableNode, NODE_SKIP, NODE_DEFAULTS));
    lines.push(fields.join('  '));
  }

  for (const edge of graph.edges ?? []) lines.push(edgeLine(edge, nodeById, aliases));

  const groupAliases = stableAliases(graph.groups ?? [], 'g');
  for (const group of graph.groups ?? []) {
    const id = String(group.id);
    const memberNodes = nodes.filter(node => Array.isArray(node.tags) && node.tags.includes(group.label));
    const members = memberNodes.map(node => reference(node, aliases.get(String(node.id))!));
    const fields = [encodeField(`${String(group.label ?? '')}@${groupAliases.get(id)!}`), ...properties(group, GROUP_SKIP, NO_DEFAULTS)];
    lines.push(`${fields.join('  ')} {${members.join('  ')}}`);
  }

  const settings = graph.settings ?? {};
  if (Object.keys(settings).length > 0) {
    lines.push('设置');
    for (const key of Object.keys(settings).sort()) {
      lines.push(`${encodeField(SETTING_KEY_TO_NAME[key] ?? key)}  ${json(settings[key])}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export const print = printTextGraph;
