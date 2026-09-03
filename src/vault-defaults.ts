import type { GraphData, GraphSettings } from './data/storage';

/**
 * Vault views are derived and read-only, but they should still look like the
 * user's spaces. Projection-owned structural settings win over appearance
 * defaults so a note cannot accidentally become a force-layout document.
 */
export function applyVaultProjectionDefaults(
  graph: GraphData,
  builtInDefaults: GraphSettings,
  userDefaults: Partial<GraphSettings>,
): GraphData {
  graph.settings = {
    ...builtInDefaults,
    ...userDefaults,
    ...(graph.settings || {}),
    sourceMode: 'vault-readonly',
  };
  return graph;
}
