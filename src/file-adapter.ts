/** 文件适配器统一接口 — 跨平台文件I/O抽象层
 *
 *  5平台实现:
 *    - createFSAAdapter(dirHandle)          — File System Access API (桌面浏览器)
 *    - createCapacitorAdapter()             — Capacitor Filesystem (Android/iOS)
 *    - createHarmonyAdapter()               — localStorage 后备 (HarmonyOS)
 *    - createSAFAdapter()                   — SAF 原生插件 (Android)
 *    - createElectronAdapter(mountPath)     — Electron IPC (桌面)
 *    - createStorageAdapter()               — localStorage (通用后备)
 *
 *  所有方法返回 Result<T>，永不 throw。
 */

export interface FileEntry {
  name: string;
  kind: 'file' | 'directory';
  children: FileEntry[];
}

export interface FileFingerprint {
  size: number;
  mtime: number;
  /** Additional native timestamp when the backing filesystem exposes it. */
  ctime?: number;
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export type CreateFileOutcome = 'created' | 'exists';

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err(error: string): Result<never> {
  return { ok: false, error };
}

export function replacePathName(path: string, name: string): string {
  const parts = path.split('/');
  parts[parts.length - 1] = name;
  return parts.join('/');
}

export function joinPath(directory: string, name: string): string {
  return directory ? `${directory}/${name}` : name;
}

export function isRelativeFilePath(fileName: string): boolean {
  return !/[\\:\u0000-\u001f\u007f]/.test(fileName)
    && fileName.split('/').every(part => part && part !== '.' && part !== '..');
}

export interface FileAdapter {
  /** 列出文件树（递归，flat平台仅顶层） */
  listFiles(): Promise<Result<FileEntry[]>>;

  /** 读取文件内容（原始文本），文件不存在返回 null */
  readFile(fileName: string): Promise<Result<string | null>>;

  /** 获取版本校验用的文件元数据。无需读取正文，文件不存在返回 null。 */
  statFile?(fileName: string): Promise<Result<FileFingerprint | null>>;

  /** 写入文件（覆盖），父目录不存在时尝试创建 */
  writeFile(fileName: string, data: string): Promise<Result<boolean>>;

  /** 原子创建完整的新文件。目标已存在时返回 exists。未实现表示存储无法保证独占创建。 */
  createFile?(fileName: string, data: string): Promise<Result<CreateFileOutcome>>;

  /** 删除文件，文件不存在时静默成功 */
  deleteFile(fileName: string, options?: { recursive?: boolean }): Promise<Result<boolean>>;

  /** 重命名文件 */
  renameFile(oldPath: string, newName: string): Promise<Result<boolean>>;

  /** 复制文件（read+write 实现，自动去重） */
  copyFile(path: string): Promise<Result<boolean>>;

  /** 移动文件到目标目录（read+write+delete 实现） */
  moveFile(srcPath: string, dstDir: string): Promise<Result<boolean>>;

  /** 创建目录（flat平台为无操作） */
  createDirectory(dirPath: string): Promise<Result<boolean>>;

  /** 生成唯一的副本文件名，如 "file 2.json" */
  suggestCopyName(baseName: string): Promise<Result<string>>;
}

const pendingCreates = new Map<string, Promise<Result<CreateFileOutcome>>>();
const portableName = (name: string) => name.normalize('NFC').toLowerCase();

/** Compatibility for stores without an exclusive filesystem create. Cooperating tabs share a Web Lock when available. */
export async function createFileWithFallback(
  adapter: FileAdapter,
  fileName: string,
  data: string,
  canWrite: () => boolean = () => true,
): Promise<Result<CreateFileOutcome>> {
  const stale = () => err('Graph destination changed');
  try {
    if (!canWrite()) return stale();
    if (adapter.createFile) return await adapter.createFile(fileName, data);
    const create = async (): Promise<Result<CreateFileOutcome>> => {
      const listed = await adapter.listFiles();
      if (!listed.ok) return listed;
      const parts = portableName(fileName).split('/');
      const leaf = parts.pop();
      let entries = listed.value;
      // Flat stores may use the entire relative path as a key.
      if (entries.some(entry => portableName(entry.name) === portableName(fileName))) return ok('exists');
      for (const part of parts) entries = entries.find(entry => entry.kind === 'directory' && portableName(entry.name) === part)?.children ?? [];
      if (entries.some(entry => portableName(entry.name) === leaf)) return ok('exists');

      const existing = await adapter.readFile(fileName);
      if (!existing.ok) return existing;
      if (existing.value !== null) return ok('exists');
      if (!canWrite()) return stale();
      const written = await adapter.writeFile(fileName, data);
      if (!written.ok) return written;
      return written.value ? ok('created') : err('Graph storage rejected the write');
    };
    const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
    const key = `nodespace:create:${portableName(fileName)}`;
    if (locks) return await locks.request(key, create);
    const pending = (pendingCreates.get(key) ?? Promise.resolve()).then(create, create);
    pendingCreates.set(key, pending);
    try { return await pending; }
    finally { if (pendingCreates.get(key) === pending) pendingCreates.delete(key); }
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Unable to create graph');
  }
}
