import { entityId, stableAliases } from './aliases';
import { applyProperties } from './properties';
import { parseTextGraph } from './parser';
import type {
  CompileResult,
  GraphDataLike,
  SourceRange,
  TextDiagnostic,
  TextGraphAst,
  TextReference,
} from './types';

const NODE_SEMANTIC_KEYS = [
  'note', 'content', 'headingLevel', 'tags', 'mediaUrl', 'mediaType', 'color',
  'radius', 'radiusMode', 'fixed', 'collapsed', 'hyperlink',
] as const;
const EDGE_SEMANTIC_KEYS = ['label', 'color', 'arrow', 'lineStyle'] as const;
const GROUP_SEMANTIC_KEYS = [
  'displayMode', 'color', 'borderColor', 'opacity', 'nodeColorMode', 'nodeColor',
  'fluidRadius', 'fluidOpacity',
] as const;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function idFactory(existing: Set<string>, prefix: string): () => string {
  let index = 1;
  return () => {
    let id: string;
    do id = `${prefix}${index++}`; while (existing.has(id));
    existing.add(id);
    return id;
  };
}

function reportDuplicate(alias: string, range: SourceRange, diagnostics: TextDiagnostic[]): void {
  diagnostics.push({ code: 'DUPLICATE_ALIAS', message: `重复别名：@${alias}`, severity: 'error', range });
}

function referenceResolver(
  aliases: Map<string, Record<string, any>>,
  labels: Map<string, Record<string, any>[]>,
  diagnostics: TextDiagnostic[],
): (reference: TextReference) => Record<string, any> | undefined {
  return reference => {
    if (reference.alias) {
      const node = aliases.get(reference.alias);
      if (node) return node;
      diagnostics.push({ code: 'UNKNOWN_REFERENCE', message: `未知引用：@${reference.alias}`, severity: 'error', range: reference.range });
      return undefined;
    }
    const matches = labels.get(reference.label) ?? [];
    if (matches.length === 1) return matches[0];
    diagnostics.push({
      code: matches.length === 0 ? 'UNKNOWN_REFERENCE' : 'AMBIGUOUS_REFERENCE',
      message: matches.length === 0 ? `未知节点：${reference.label}` : `节点名不唯一，请使用 @alias：${reference.label}`,
      severity: 'error', range: reference.range,
    });
    return undefined;
  };
}

function edgeKey(source: string, target: string, label: string): string {
  return `${source}\u0000${target}\u0000${label}`;
}

function clearKeys(target: Record<string, any>, keys: readonly string[]): void {
  for (const key of keys) delete target[key];
}

function aliasLookup(aliases: Map<string, string>): Map<string, string> {
  return new Map([...aliases].map(([id, alias]) => [alias, id]));
}

function claimOverlay(
  alias: string | undefined,
  byId: Map<string, Record<string, any>>,
  idByAlias: Map<string, string>,
  byLabel: Map<string, Record<string, any>[]>,
  label: string,
  claimedIds: Set<string>,
): Record<string, any> | undefined {
  let entity = alias ? byId.get(alias) : undefined;
  if (!entity && alias) entity = byId.get(idByAlias.get(alias) ?? '');
  if (!entity && !alias) {
    const candidates = byLabel.get(label) ?? [];
    if (candidates.length === 1 && !claimedIds.has(String(candidates[0].id))) entity = candidates[0];
  }
  if (entity && claimedIds.has(String(entity.id))) return undefined;
  return entity;
}

export function compileAst(ast: TextGraphAst, original?: GraphDataLike): CompileResult {
  const diagnostics: TextDiagnostic[] = [];
  const base = original ? clone(original) : { nodes: [], edges: [], groups: [] };
  const existingIds = new Set<string>([
    ...base.nodes.map(node => String(node.id)),
    ...base.groups.map(group => String(group.id)),
  ]);
  const nextNodeId = idFactory(existingIds, 'n_text_');
  const nextGroupId = idFactory(existingIds, 'g_text_');
  const oldNodesById = new Map(base.nodes.map(node => [String(node.id), node]));
  const oldGroupsById = new Map(base.groups.map(group => [String(group.id), group]));
  const oldNodesByLabel = new Map<string, Record<string, any>[]>();
  const oldGroupsByLabel = new Map<string, Record<string, any>[]>();
  for (const node of base.nodes) {
    const label = String(node.label ?? '');
    oldNodesByLabel.set(label, [...(oldNodesByLabel.get(label) ?? []), node]);
  }
  for (const group of base.groups) {
    const label = String(group.label ?? '');
    oldGroupsByLabel.set(label, [...(oldGroupsByLabel.get(label) ?? []), group]);
  }

  const aliases = new Map<string, Record<string, any>>();
  const oldIdByAlias = aliasLookup(stableAliases(base.nodes, 'n'));
  const labels = new Map<string, Record<string, any>[]>();
  const nodes: Record<string, any>[] = [];
  const claimedNodeIds = new Set<string>();
  for (const statement of ast.nodes) {
    if (statement.alias && aliases.has(statement.alias)) reportDuplicate(statement.alias, statement.range, diagnostics);
    const prior = claimOverlay(
      statement.alias, oldNodesById, oldIdByAlias, oldNodesByLabel,
      statement.label, claimedNodeIds,
    );
    const node = prior ? clone(prior) : { id: statement.alias ?? nextNodeId(), x: 0, y: 0, radius: 9, createdOrder: nodes.length };
    claimedNodeIds.add(String(node.id));
    clearKeys(node, NODE_SEMANTIC_KEYS);
    node.label = statement.label;
    node.headingLevel = 4;
    node.radius = 9;
    node.tags = [];
    if (statement.note !== undefined) node.note = statement.note;
    applyProperties(node, statement.properties);
    nodes.push(node);
    if (statement.alias) aliases.set(statement.alias, node);
    aliases.set(String(node.id), node);
    labels.set(statement.label, [...(labels.get(statement.label) ?? []), node]);
  }

  const resolve = referenceResolver(aliases, labels, diagnostics);
  const oldEdges = new Map<string, Record<string, any>[]>();
  for (const edge of base.edges) {
    const key = edgeKey(entityId(edge.source), entityId(edge.target), String(edge.label ?? ''));
    oldEdges.set(key, [...(oldEdges.get(key) ?? []), edge]);
  }
  const edges: Record<string, any>[] = [];
  for (const statement of ast.edges) {
    const source = resolve(statement.source);
    const target = resolve(statement.target);
    if (!source || !target) continue;
    const label = statement.label ?? '';
    const key = edgeKey(String(source.id), String(target.id), label);
    const edge = clone(oldEdges.get(key)?.shift() ?? {});
    clearKeys(edge, EDGE_SEMANTIC_KEYS);
    edge.source = String(source.id);
    edge.target = String(target.id);
    edge.label = label;
    edge.color = '#BFBFBF';
    edge.arrow = false;
    applyProperties(edge, statement.properties);
    edges.push(edge);
  }

  // Group membership is semantic, not overlay-only metadata. Remove memberships
  // belonging to the old group set before applying the complete text body.
  const oldGroupLabels = new Set(base.groups.map(group => String(group.label ?? '')));
  for (const node of nodes) {
    if (Array.isArray(node.tags)) node.tags = node.tags.filter((tag: unknown) => !oldGroupLabels.has(String(tag)));
  }

  const groupAliases = new Map<string, Record<string, any>>();
  const oldGroupIdByAlias = aliasLookup(stableAliases(base.groups, 'g'));
  const groups: Record<string, any>[] = [];
  const claimedGroupIds = new Set<string>();
  for (const statement of ast.groups) {
    if (statement.alias && groupAliases.has(statement.alias)) reportDuplicate(statement.alias, statement.range, diagnostics);
    const memberNodes = statement.members.map(resolve).filter((node): node is Record<string, any> => Boolean(node));
    const prior = claimOverlay(
      statement.alias, oldGroupsById, oldGroupIdByAlias, oldGroupsByLabel,
      statement.label, claimedGroupIds,
    );
    const group = prior ? clone(prior) : { id: statement.alias ?? nextGroupId() };
    claimedGroupIds.add(String(group.id));
    clearKeys(group, GROUP_SEMANTIC_KEYS);
    group.label = statement.label;
    applyProperties(group, statement.properties);
    groups.push(group);
    if (statement.alias) groupAliases.set(statement.alias, group);
    const members = new Set(memberNodes.map(node => String(node.id)));
    for (const node of nodes) {
      const tags = Array.isArray(node.tags) ? node.tags.filter((tag: unknown) => tag !== statement.label) : [];
      if (members.has(String(node.id))) tags.push(statement.label);
      node.tags = tags;
    }
  }

  const settings: Record<string, any> = {};
  for (const statement of ast.settings) settings[statement.key] = clone(statement.value);
  const graph: GraphDataLike = { ...base, nodes, edges, groups };
  if (ast.settings.length > 0) graph.settings = settings;
  else delete graph.settings;
  return { ok: diagnostics.every(item => item.severity !== 'error'), graphName: ast.name, graph, diagnostics };
}

export function compileTextGraph(source: string, original?: GraphDataLike): CompileResult {
  const parsed = parseTextGraph(source);
  if (!parsed.ok) return { ok: false, graphName: parsed.ast.name, diagnostics: parsed.diagnostics };
  const compiled = compileAst(parsed.ast, original);
  const diagnostics = [...parsed.diagnostics, ...compiled.diagnostics];
  if (diagnostics.some(item => item.severity === 'error')) {
    return { ok: false, graphName: parsed.ast.name, diagnostics };
  }
  return { ...compiled, diagnostics, ok: true };
}

export const compile = compileTextGraph;
