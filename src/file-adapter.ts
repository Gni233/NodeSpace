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

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err(error: string): Result<never> {
  return { ok: false, error };
}

export interface FileAdapter {
  /** 列出文件树（递归，flat平台仅顶层） */
  listFiles(): Promise<Result<FileEntry[]>>;

  /** 读取文件内容（原始文本），文件不存在返回 null */
  readFile(fileName: string): Promise<Result<string | null>>;

  /** 写入文件（覆盖），父目录不存在时尝试创建 */
  writeFile(fileName: string, data: string): Promise<Result<boolean>>;

  /** 删除文件，文件不存在时静默成功 */
  deleteFile(fileName: string): Promise<Result<boolean>>;

  /** 重命名文件（read+write+delete 实现，Electron 使用原生 rename） */
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
