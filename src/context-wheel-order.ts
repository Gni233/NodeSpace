import type { ContextMenuItem } from './ui-contextmenu';

export interface WheelEntry {
  key: string;
  icon?: string;
  item: ContextMenuItem;
  children?: WheelEntry[];
}

export interface WheelMove {
  key: string;
  parent: string | null;
  before: string | null;
}

type WheelSeed = Pick<WheelEntry, 'icon' | 'item'>;

function labelKey(label: string) {
  return label.trim().replace(/\s+/g, ' ').replace(/\s+[（(]\d+[）)]$/u, '');
}

export function buildWheelEntries(seeds: readonly WheelSeed[], trail: readonly string[] = []): WheelEntry[] {
  const seen = new Map<string, number>();
  return seeds.flatMap(({ item, icon }) => {
    if (item.separator || !item.label) return [];
    const id = item.id ? `id:${item.id}` : `label:${labelKey(item.label)}`;
    const index = seen.get(id) ?? 0;
    seen.set(id, index + 1);
    const path = [...trail, JSON.stringify([id, index])];
    return [{
      key: JSON.stringify(path),
      icon: icon || item.icon || (item.children ? 'next' : undefined),
      item,
      children: item.children ? buildWheelEntries(item.children.map(child => ({ item: child })), path) : undefined,
    }];
  });
}

interface WheelLocation {
  entry: WheelEntry;
  siblings: WheelEntry[];
  index: number;
  ancestors: WheelEntry[];
}

export function findWheelEntry(entries: WheelEntry[], key: string, ancestors: WheelEntry[] = []): WheelLocation | null {
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (entry.key === key) return { entry, siblings: entries, index, ancestors };
    if (entry.children) {
      const child = findWheelEntry(entry.children, key, [...ancestors, entry]);
      if (child) return child;
    }
  }
  return null;
}

export function moveWheelEntry(entries: WheelEntry[], move: WheelMove): boolean {
  const source = findWheelEntry(entries, move.key);
  const destination = move.parent === null ? null : findWheelEntry(entries, move.parent);
  if (!source || move.before === move.key || (move.parent !== null && !destination?.entry.children)) return false;
  if (destination?.entry === source.entry || destination?.ancestors.includes(source.entry)) return false;
  const siblings = destination?.entry.children ?? entries;
  const wasBefore = source.siblings[source.index + 1]?.key ?? null;
  if (siblings === source.siblings && move.before === wasBefore) return false;

  source.siblings.splice(source.index, 1);
  const index = siblings.findIndex(entry => entry.key === move.before);
  siblings.splice(index < 0 ? siblings.length : index, 0, source.entry);
  return true;
}

export function asContextMenuItems(entries: readonly WheelEntry[]): ContextMenuItem[] {
  return entries.map(({ item, children }) => ({ ...item, children: children ? asContextMenuItems(children) : undefined }));
}

function isWheelMove(value: any): value is WheelMove {
  return typeof value?.key === 'string'
    && (value.parent === null || typeof value.parent === 'string')
    && (value.before === null || typeof value.before === 'string');
}

export function loadWheelOrder(scope: string) {
  const key = `nodespace-context-wheel-order-v1:${scope}`;
  let moves: WheelMove[] = [];
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (Array.isArray(stored)) moves = stored.filter(isWheelMove);
  } catch { /* Menu actions are available even when storage is blocked. */ }
  return {
    apply(entries: WheelEntry[]) {
      let customized = false;
      for (const move of moves) if (moveWheelEntry(entries, move)) customized = true;
      return customized;
    },
    save(move: WheelMove) {
      if (moves[moves.length - 1]?.key === move.key) moves.pop();
      moves.push(move);
      try { localStorage.setItem(key, JSON.stringify(moves)); }
      catch { /* A session can still use its current ordering. */ }
    },
  };
}
