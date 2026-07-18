import type { GraphData, GraphSettings } from './data/storage';

const stripRuntimeFields = (value: any): any => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const clean: Record<string, any> = {};
  for (const [key, field] of Object.entries(value)) {
    if (key.startsWith('_')) continue;
    clean[key] = field;
  }
  return clean;
};

const endpointId = (endpoint: any): any => {
  if (endpoint && typeof endpoint === 'object' && 'id' in endpoint) return endpoint.id;
  return endpoint;
};

export function serializeGraphSnapshot(graph: GraphData, settings?: GraphSettings): string {
  const snapshot: GraphData = {
    nodes: (graph.nodes || []).map(stripRuntimeFields),
    edges: (graph.edges || []).map((edge: any) => ({
      ...stripRuntimeFields(edge),
      source: endpointId(edge.source),
      target: endpointId(edge.target),
    })),
    groups: (graph.groups || []).map(stripRuntimeFields),
  };

  const mergedSettings = settings
    ? { ...(graph.settings || {}), ...settings }
    : graph.settings;
  if (mergedSettings) snapshot.settings = mergedSettings as GraphSettings;

  return JSON.stringify(snapshot);
}
