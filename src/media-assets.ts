/** Browser attachments live outside graph JSON so a video cannot exhaust localStorage. */
export const ATTACHMENT_PREFIX = 'nodespace-attachment:';
export const isStoredAttachment = (value: string): boolean => value.startsWith(ATTACHMENT_PREFIX);

export class MissingBrowserAttachmentError extends Error {
  constructor() { super('Attachment is missing from this device'); }
}

export class BrowserAttachmentStore {
  private database: Promise<IDBDatabase> | null = null;
  constructor(private factory: () => IDBFactory = () => indexedDB) {}

  private open(): Promise<IDBDatabase> {
    if (!this.database) {
      const pending = new Promise<IDBDatabase>((resolve, reject) => {
        let settled = false;
        const request = this.factory().open('nodespace-attachments', 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains('files')) request.result.createObjectStore('files');
        };
        request.onerror = () => { settled = true; reject(request.error || new Error('Attachment storage unavailable')); };
        request.onblocked = () => { settled = true; reject(new Error('Attachment storage is busy')); };
        request.onsuccess = () => {
          const db = request.result;
          if (settled) { db.close(); return; }
          settled = true;
          db.onversionchange = () => { db.close(); this.database = null; };
          resolve(db);
        };
      });
      this.database = pending;
      void pending.catch(() => { if (this.database === pending) this.database = null; });
    }
    return this.database;
  }

  private async transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction('files', mode);
      let request: IDBRequest<T>;
      try { request = run(tx.objectStore('files')); }
      catch (error) { tx.abort(); reject(error); return; }
      // Success means the transaction committed, rather than merely queuing a write.
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () => reject(tx.error || request.error || new Error('Attachment storage failed'));
    });
  }

  async save(file: Blob): Promise<{ value: string; release: () => Promise<void> }> {
    const key = crypto.randomUUID();
    await this.transaction('readwrite', store => store.put(file, key));
    let removal: Promise<void> | undefined;
    return { value: ATTACHMENT_PREFIX + key, release: () => {
      if (!removal) {
        removal = this.transaction('readwrite', store => store.delete(key));
        // Callers may discard an unused attachment without awaiting cleanup.
        void removal.catch(error => console.warn('[nodespace] Unused attachment cleanup:', error));
      }
      return removal;
    } };
  }

  async read(reference: string): Promise<Blob> {
    if (!isStoredAttachment(reference)) throw new Error('Invalid attachment reference');
    const blob = await this.transaction<Blob | undefined>('readonly', store => store.get(reference.slice(ATTACHMENT_PREFIX.length)));
    if (!(blob instanceof Blob)) throw new MissingBrowserAttachmentError();
    return blob;
  }
}

const attachments = new BrowserAttachmentStore();
export const saveBrowserAttachment = (file: Blob) => attachments.save(file);
export const readBrowserAttachment = (reference: string) => attachments.read(reference);
export async function resolveBrowserAttachment(reference: string): Promise<{ value: string; release: () => void }> {
  const value = URL.createObjectURL(await attachments.read(reference));
  let released = false;
  return { value, release: () => { if (!released) { released = true; URL.revokeObjectURL(value); } } };
}
