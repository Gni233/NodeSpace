const WORKBENCH_START_KEY = 'nodespace-workbench-start';
const WORKBENCH_RECENTS_KEY = 'nodespace-workbench-recents';
type WorkbenchStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function createWorkbenchHistory(storage: WorkbenchStorage, scope: string | null = null) {
  const recentKey = scope === null ? WORKBENCH_RECENTS_KEY : `${WORKBENCH_RECENTS_KEY}:${encodeURIComponent(scope)}`;
  let showAtStartup = true;
  let recent: string[] = [];
  try { showAtStartup = storage.getItem(WORKBENCH_START_KEY) !== 'off'; } catch {}
  try {
    const raw: unknown = JSON.parse(storage.getItem(recentKey) ?? '[]');
    if (Array.isArray(raw)) recent = [...new Set(raw.filter((value): value is string => typeof value === 'string' && value.length > 0))].slice(0, 20);
  } catch {}
  return {
    get showAtStartup() { return showAtStartup; },
    setShowAtStartup(value: boolean) {
      showAtStartup = value;
      try { storage.setItem(WORKBENCH_START_KEY, value ? 'on' : 'off'); } catch {}
    },
    visit(id: string) {
      if (!id || recent[0] === id) return;
      recent = [id, ...recent.filter(value => value !== id)].slice(0, 20);
      try { storage.setItem(recentKey, JSON.stringify(recent)); } catch {}
    },
    list(current: string | null, candidates: readonly string[], limit = 4): string[] {
      const available = new Set(candidates);
      return recent.filter(id => id !== current && available.has(id)).slice(0, limit);
    },
  };
}
