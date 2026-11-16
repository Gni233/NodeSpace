import type { FileEntry } from './file-adapter';

const INTERNAL_PREVIEW_GRAPH = /^__reference_preview(?:_v\d+)?(?:\.json)?$/i;

function entryBaseName(name: string): string {
  return String(name || '').replace(/\\/g, '/').split('/').pop() || '';
}

/**
 * Reference-preview fixtures are implementation artifacts, not user spaces.
 * Keep them on disk for diagnostics while preventing them from competing with
 * actual spaces in the navigation shelf.
 */
export function filterUserFacingGraphEntries(entries: readonly FileEntry[]): FileEntry[] {
  return entries.flatMap(entry => {
    if (entry.kind === 'file') {
      return INTERNAL_PREVIEW_GRAPH.test(entryBaseName(entry.name)) ? [] : [{ ...entry }];
    }
    const children = filterUserFacingGraphEntries(entry.children || []);
    return children.length > 0 ? [{ ...entry, children }] : [];
  });
}

/** Adapter inventories may use nested basenames or already-qualified relative IDs. */
export function userFacingGraphPaths(entries: readonly FileEntry[]): string[] {
  const paths = new Set<string>();
  const collect = (nodes: readonly FileEntry[], parent: string) => {
    for (const entry of nodes) {
      if (!entry.name) continue;
      const path = !parent || entry.name.startsWith(`${parent}/`) ? entry.name : `${parent}/${entry.name}`;
      if (entry.kind === 'directory') collect(entry.children || [], path);
      else if (!INTERNAL_PREVIEW_GRAPH.test(entryBaseName(path))) paths.add(path);
    }
  };
  collect(entries, '');
  return [...paths];
}
