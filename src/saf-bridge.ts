/**
 * SAF (Storage Access Framework) 原生桥接
 * 通过 Capacitor 插件 SafPlugin 调起 Android 原生目录选择器
 * 实现 Obsidian 式持久化目录读写
 */

interface FileEntry {
  name: string;
  kind: 'file' | 'directory';
  children: any[];
}

const plugin = () => (window as any).Capacitor?.Plugins?.SafPlugin;

export async function safPickDirectory(): Promise<{ path: string; name: string } | null> {
  const p = plugin();
  if (!p) return null;
  try {
    const result = await p.pickDirectory();
    return { path: result.path, name: result.name };
  } catch (e: any) {
    // 抛出错误让上层处理
    throw new Error(e?.message || 'SAF pickDirectory failed');
  }
}

export async function safRestoreDirectory(): Promise<{ path: string; name: string } | null> {
  const p = plugin();
  if (!p) return null;
  try {
    const result = await p.restoreDirectory();
    return { path: result.path, name: result.name };
  } catch {
    return null;
  }
}

export async function safListFiles(): Promise<FileEntry[]> {
  const p = plugin();
  if (!p) return [];
  try {
    const result = await p.listFiles();
    return (result.files || []) as FileEntry[];
  } catch (e: any) {
    throw new Error(e?.message || 'SAF listFiles failed');
  }
}

export async function safReadFile(fileName: string): Promise<string | null> {
  const p = plugin();
  if (!p) return null;
  try {
    const result = await p.readFile({ fileName });
    return result.data as string;
  } catch (e: any) {
    throw new Error(e?.message || 'SAF readFile failed');
  }
}

export async function safWriteFile(fileName: string, data: string): Promise<boolean> {
  const p = plugin();
  if (!p) return false;
  try {
    await p.writeFile({ fileName, data });
    return true;
  } catch (e: any) {
    throw new Error(e?.message || 'SAF writeFile failed');
  }
}

export async function safDeleteFile(fileName: string): Promise<boolean> {
  const p = plugin();
  if (!p) return false;
  try {
    await p.deleteFile({ fileName });
    return true;
  } catch (e: any) {
    throw new Error(e?.message || 'SAF deleteFile failed');
  }
}

export function safIsAvailable(): boolean {
  return !!plugin();
}

// ---- FileAdapter 工厂 ----
import { FileAdapter, joinPath, ok, err, replacePathName } from './file-adapter';

export function createSAFAdapter(): FileAdapter {
  const dedup = async (baseName: string): Promise<string> => {
    const r = await safListFiles();
    let n = 2;
    let newPath: string;
    do {
      newPath = baseName.replace(/\.json$/, '') + ' ' + n + '.json';
      n++;
    } while (r.some(f => f.name === newPath));
    return newPath;
  };

  return {
    async listFiles() {
      if (!safIsAvailable()) return ok([]);
      try { return ok(await safListFiles()); }
      catch (e: any) { return err(e.message); }
    },
    async readFile(fileName) {
      if (!safIsAvailable()) return ok(null);
      try { return ok(await safReadFile(fileName)); }
      catch (e: any) { return err(e.message); }
    },
    async writeFile(fileName, data) {
      if (!safIsAvailable()) return err('SAF not available');
      try { await safWriteFile(fileName, data); return ok(true); }
      catch (e: any) { return err(e.message); }
    },
    async deleteFile(fileName) {
      if (!safIsAvailable()) return err('SAF not available');
      try { await safDeleteFile(fileName); return ok(true); }
      catch (e: any) { return err(e.message); }
    },
    async renameFile(oldPath, newName) {
      try {
        const raw = await safReadFile(oldPath);
        if (!raw) return err('Source not found');
        await safWriteFile(replacePathName(oldPath, newName), raw);
        await safDeleteFile(oldPath);
        return ok(true);
      } catch (e: any) { return err(e.message); }
    },
    async copyFile(path) {
      try {
        const raw = await safReadFile(path);
        if (!raw) return err('Source not found');
        const newPath = await dedup(path);
        await safWriteFile(newPath, raw);
        return ok(true);
      } catch (e: any) { return err(e.message); }
    },
    async moveFile(srcPath, dstDir) {
      try {
        const name = srcPath.split('/').pop()!;
        const dstName = joinPath(dstDir, name);
        const raw = await safReadFile(srcPath);
        if (!raw) return err('Source not found');
        await safWriteFile(dstName, raw);
        await safDeleteFile(srcPath);
        return ok(true);
      } catch (e: any) { return err(e.message); }
    },
    async createDirectory(_dirPath) { return ok(true); },
    async suggestCopyName(baseName) {
      try { return ok(await dedup(baseName)); }
      catch (e: any) { return err(e.message); }
    },
  };
}
