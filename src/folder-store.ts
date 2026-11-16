/**
 * IndexedDB 持久化 FileSystemDirectoryHandle
 * 下次打开页面时可以恢复文件夹，无需重新选择
 */

const DB_NAME = 'nodespace-folders';
const STORE_NAME = 'handles';
const KEY = 'last-folder';
const ID_KEY = 'last-folder-id';
const SAVED_PREFIX = 'folder:';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE_NAME); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveFolderHandle(handle: FileSystemDirectoryHandle, id: string): Promise<boolean> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(handle, KEY);
    store.put(id, ID_KEY);
    store.put(handle, SAVED_PREFIX + id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch (e) {
    console.error('保存文件夹句柄失败', e);
    return false;
  }
}

export async function loadFolderSelection(): Promise<{ handle: FileSystemDirectoryHandle; id: string | null } | null> {
  try {
    const db = await openDB();
    const store = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME);
    const get = <T>(key: string) => new Promise<T | undefined>((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const [handle, id] = await Promise.all([get<FileSystemDirectoryHandle>(KEY), get<string>(ID_KEY)]);
    db.close();
    return handle ? { handle, id: typeof id === 'string' && id ? id : null } : null;
  } catch {
    return null;
  }
}

export async function findSavedFolderId(handle: FileSystemDirectoryHandle): Promise<string | null> {
  try {
    const db = await openDB();
    const store = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME);
    const range = IDBKeyRange.bound(SAVED_PREFIX, SAVED_PREFIX + '\uffff');
    const collect = <T>(req: IDBRequest<T[]>): Promise<T[]> => new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const [keys, handles] = await Promise.all([collect(store.getAllKeys(range)), collect(store.getAll(range))]);
    db.close();
    for (let index = 0; index < handles.length; index++) {
      if (typeof keys[index] === 'string' && await handle.isSameEntry(handles[index])) {
        return (keys[index] as string).slice(SAVED_PREFIX.length);
      }
    }
  } catch (error) {
    console.warn('无法查找已保存的文件夹', error);
  }
  return null;
}

export async function clearFolderHandle(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(KEY);
    tx.objectStore(STORE_NAME).delete(ID_KEY);
    db.close();
  } catch {}
}
