const normalizeGraphKey = (value: string): string => value
  .replace(/\\/g, '/')
  .replace(/^\/+|\/+$/g, '')
  .replace(/\.json$/i, '')
  .toLocaleLowerCase('zh-CN');

/**
 * Filters the delayed file-watcher echo produced by NodeSpace's own writes.
 * Real external changes remain visible once the short watcher window expires.
 */
export class InternalGraphWriteGuard {
  private readonly writes = new Map<string, number>();

  constructor(private readonly ttlMs = 1800) {}

  mark(fileName: string, now = Date.now()): void {
    const key = normalizeGraphKey(fileName);
    if (key) this.writes.set(key, now);
  }

  shouldIgnore(fileName: string, now = Date.now()): boolean {
    const key = normalizeGraphKey(fileName);
    const writtenAt = this.writes.get(key);
    if (writtenAt == null) return false;
    if (now - writtenAt < 0 || now - writtenAt > this.ttlMs) {
      this.writes.delete(key);
      return false;
    }
    this.writes.delete(key);
    return true;
  }
}
