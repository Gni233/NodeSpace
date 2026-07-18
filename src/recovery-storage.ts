import { GRAPH_STORAGE_PREFIX, RECOVERY_STORAGE_PREFIX } from './storage-keys';

type RecoveryStorageBackend = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function createRecoveryStorage(graphName: string, storage: RecoveryStorageBackend = localStorage) {
  const dataKey = GRAPH_STORAGE_PREFIX + graphName;
  const recoveryKey = RECOVERY_STORAGE_PREFIX + graphName;
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
