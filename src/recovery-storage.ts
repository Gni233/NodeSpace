import { GRAPH_STORAGE_PREFIX, RECOVERY_STORAGE_PREFIX } from './storage-keys';

type RecoveryStorageBackend = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function createRecoveryStorage(graphName: string, storage: RecoveryStorageBackend = localStorage, scope: string | null = null) {
  // Mounted caches must not be visible as graph files in the localStorage adapter.
  const mountKey = scope === null ? null : `${encodeURIComponent(scope)}:${graphName}`;
  const dataKey = mountKey === null ? GRAPH_STORAGE_PREFIX + graphName : `fg-mounted-data:${mountKey}`;
  const recoveryKey = mountKey === null ? RECOVERY_STORAGE_PREFIX + graphName : `fg-mounted-recovery:${mountKey}`;
  return {
    readSnapshot: (): string | null => {
      try { return storage.getItem(dataKey); } catch { return null; }
    },
    writeSnapshot: (snapshot: string): boolean => {
      try {
        storage.setItem(dataKey, snapshot);
        return true;
      } catch {
        return false;
      }
    },
    hasUnsynced: (): boolean => {
      try { return storage.getItem(recoveryKey) === 'true'; } catch { return false; }
    },
    markUnsynced: (): boolean => {
      try {
        storage.setItem(recoveryKey, 'true');
        return true;
      } catch {
        return false;
      }
    },
    clearUnsynced: (): void => {
      try { storage.removeItem(recoveryKey); } catch {}
    },
    delete: (): void => {
      try {
        storage.removeItem(dataKey);
        storage.removeItem(recoveryKey);
      } catch {}
    },
  };
}
