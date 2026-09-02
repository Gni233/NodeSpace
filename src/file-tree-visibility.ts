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
