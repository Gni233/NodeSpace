/**
 * Resolve user-facing node metadata from the graph, never from a lightweight
 * layout/simulation view alone. Layout views are allowed to contain only an id
 * and coordinates; internal ids must not become visible labels because of it.
 */
export function resolveNodeDisplayLabel(
  positionedNode: { id?: unknown; label?: unknown; _spaceReferenceLabel?: unknown; sourceRef?: { displayLabel?: unknown; heading?: unknown; path?: unknown } },
  graphNodeById: ReadonlyMap<string, { label?: unknown; _spaceReferenceLabel?: unknown; sourceRef?: { displayLabel?: unknown; heading?: unknown; path?: unknown } }>,
): string {
  const id = typeof positionedNode?.id === 'string' ? positionedNode.id : '';
  const graphNode = id ? graphNodeById.get(id) : undefined;
  const sourceRef = graphNode?.sourceRef ?? positionedNode?.sourceRef;
  const internalVaultLabel = (candidate: unknown) =>
    typeof candidate === 'string' && candidate === id && /^vault_[a-z0-9]+$/i.test(id);
  for (const candidate of [graphNode?._spaceReferenceLabel, positionedNode?._spaceReferenceLabel, graphNode?.label, positionedNode?.label, sourceRef?.displayLabel, sourceRef?.heading]) {
    if (typeof candidate === 'string' && candidate.trim() && !internalVaultLabel(candidate)) return candidate;
  }
  if (typeof sourceRef?.path === 'string' && sourceRef.path.trim()) {
    const fileName = sourceRef.path.replace(/\\/g, '/').split('/').pop() || '';
    const stem = fileName.replace(/\.[^.]+$/, '').trim();
    if (stem) return stem;
  }
  return id;
}
