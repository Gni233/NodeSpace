import {
  normalizeVaultPath,
  vaultDisplayName,
  vaultFolderResources,
  vaultGraphFileName,
  vaultSpaceTabId,
  vaultTabId,
  type VaultIndex,
  type VaultResource,
  type VaultResourceKind,
} from './vault';

export interface VaultWallEntry {
  id: string;
  path: string;
  title: string;
  kind: VaultResourceKind;
  detail?: string;
  resource?: VaultResource;
}

export interface VaultWallFolder {
  path: string;
  parentPath: string | null;
  title: string;
  parentTitle: string | null;
  entries: VaultWallEntry[];
}

interface VaultWallOptions {
  /** Canonical adapter IDs of graphs already displayed at this level. */
  omitGraphIds?: ReadonlySet<string>;
}

const kindOrder: Record<VaultResourceKind, number> = {
  folder: 0, markdown: 1, graph: 2, pdf: 3, image: 4, audio: 5, video: 6,
};

function cleanPath(path: string): string | null {
  const value = normalizeVaultPath(path).replace(/\/$/, '');
  if (/^[a-z]:|\0/i.test(value) || value.split('/').some(part => part === '.' || part === '..')) return null;
  return value;
}

/** Project one physical directory without repeating graph files under a second ID. */
export function getVaultWallFolder(index: VaultIndex, path = '', options: VaultWallOptions = {}): VaultWallFolder | null {
  const folder = cleanPath(path);
  if (folder === null) return null;
  const parentPath = folder ? folder.split('/').slice(0, -1).join('/') : null;
  const folderTitle = (value: string) => value.split('/').pop() || index.name || '资料库';
  const prefix = folder ? `${folder}/` : '';
  const entries = new Map<string, VaultWallEntry>();
  const putFolder = (relative: string) => {
    const id = vaultSpaceTabId(relative);
    if (!entries.has(id)) entries.set(id, { id, path: relative, title: folderTitle(relative), kind: 'folder' });
  };

  const children = vaultFolderResources(index, folder);
  let exists = !folder || children.length > 0;
  for (const relative of index.directories ?? []) {
    const directory = cleanPath(relative);
    if (!directory) continue;
    if (directory === folder) exists = true;
    if (!directory.startsWith(prefix)) continue;
    const child = directory.slice(prefix.length).split('/')[0];
    if (child) {
      exists = true;
      putFolder(`${prefix}${child}`);
    }
  }
  if (!exists) return null;

  for (const child of children) {
    const relative = cleanPath(child.path);
    if (!relative) continue;
    if (child.kind === 'folder') {
      putFolder(relative);
      continue;
    }
    const id = child.kind === 'graph' ? vaultGraphFileName(index, relative) : vaultTabId(relative);
    if (!id || entries.has(id) || (child.kind === 'graph' && options.omitGraphIds?.has(id))) continue;
    const title = child.kind === 'graph' ? vaultDisplayName(child.name) : vaultDisplayName(id);
    entries.set(id, { id, path: relative, title, kind: child.kind, resource: child.resource });
  }

  return {
    path: folder,
    parentPath,
    title: folderTitle(folder),
    parentTitle: parentPath === null ? null : folderTitle(parentPath),
    entries: [...entries.values()].sort((left, right) => kindOrder[left.kind] - kindOrder[right.kind]
      || left.title.localeCompare(right.title, 'zh-CN') || left.path.localeCompare(right.path, 'zh-CN')),
  };
}
