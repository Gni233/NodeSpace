import type { GraphData } from './data/storage';
import { effectiveNodeTags } from './group-membership';

export type SearchField = 'all' | 'name' | 'tags' | 'note';
export type SearchMatchMode = 'contains' | 'startsWith' | 'endsWith' | 'fuzzy';

export interface GraphSearchResult {
  nodeId: string;
  label: string;
  score: number;
  fields: SearchField[];
  context: string;
}

const normalize = (value: unknown): string =>
  String(value ?? '').normalize('NFKC').toLocaleLowerCase().trim();

export function matchSearchText(value: unknown, query: unknown, mode: SearchMatchMode): boolean {
  const haystack = normalize(value);
  const needle = normalize(query);
  if (!needle) return false;
  if (mode === 'startsWith') return haystack.startsWith(needle);
  if (mode === 'endsWith') return haystack.endsWith(needle);
  if (mode === 'fuzzy') {
    let cursor = 0;
    for (const character of haystack) {
      if (character === needle[cursor]) cursor++;
      if (cursor === needle.length) return true;
    }
    return false;
  }
  return haystack.includes(needle);
}

const excerptAround = (value: string, query: string, limit = 76): string => {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  const index = normalize(clean).indexOf(normalize(query));
  const start = Math.max(0, index < 0 ? 0 : index - Math.floor(limit * 0.3));
  return `${start > 0 ? '…' : ''}${clean.slice(start, start + limit).trim()}${start + limit < clean.length ? '…' : ''}`;
};

export function searchGraph(
  graph: GraphData,
  query: string,
  field: SearchField = 'all',
  mode: SearchMatchMode = 'contains',
): GraphSearchResult[] {
  const needle = normalize(query);
  if (!needle) return [];
  const results: GraphSearchResult[] = [];

  for (let index = 0; index < (graph.nodes || []).length; index++) {
    const node = graph.nodes[index];
    const label = String(node?.label || node?.id || '');
    const tags = effectiveNodeTags(graph, node);
    const note = [node?.note, node?.structure?.purpose, node?.structure?.summary]
      .filter(Boolean).join('\n');
    const fields: SearchField[] = [];
    let score = 0;
    if ((field === 'all' || field === 'name') && matchSearchText(label, needle, mode)) {
      fields.push('name');
      const normalizedLabel = normalize(label);
      score += normalizedLabel === needle ? 160 : normalizedLabel.startsWith(needle) ? 120 : 90;
    }
    if ((field === 'all' || field === 'tags') && tags.some(tag => matchSearchText(tag, needle, mode))) {
      fields.push('tags');
      score += 72;
    }
    if ((field === 'all' || field === 'note') && matchSearchText(note, needle, mode)) {
      fields.push('note');
      score += 34;
    }
    if (fields.length === 0) continue;
    const context = fields.includes('note')
      ? excerptAround(note, needle)
      : fields.includes('tags')
        ? tags.join(' · ')
        : label;
    const order = Number.isFinite(node?.createdOrder) ? Number(node.createdOrder) : index;
    results.push({ nodeId: String(node.id), label, score: score - order * 1e-7, fields, context });
  }
  return results.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}
