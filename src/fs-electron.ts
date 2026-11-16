/** Electron IPC 文件适配器 — 通过 preload.cjs 暴露的 electronAPI 操作本地文件系统 */

import { FileAdapter, FileEntry, CreateFileOutcome, type FileFingerprint, isRelativeFilePath, joinPath, ok, err, replacePathName } from './file-adapter';

interface ElectronAPI {
  readFile(path: string): Promise<string | { error: string }>;
  stat?(path: string): Promise<(FileFingerprint & { isDir: boolean }) | { error: string } | null>;
  writeFile(path: string, content: string, expectedContent?: string): Promise<{ ok?: boolean; error?: string; conflict?: boolean; content?: string }>;
  createGraphFile(mount: string, fileName: string, content: string): Promise<{ outcome: CreateFileOutcome } | { error: string }>;
  readDir(path: string): Promise<({ name: string; kind: 'file' | 'directory' }[])>;
  mkdir(path: string): Promise<{ ok?: boolean; error?: string }>;
  delete(path: string, options?: { recursive?: boolean }): Promise<{ ok?: boolean; error?: string }>;
  rename(oldPath: string, newPath: string): Promise<{ ok?: boolean; error?: string }>;
  copy(src: string, dst: string): Promise<{ ok?: boolean; error?: string }>;
  exists(path: string): Promise<boolean>;
}

function getEA(): ElectronAPI | null {
  return (window as any).electronAPI || null;
}

async function buildTree(dirPath: string): Promise<FileEntry[]> {
  const ea = getEA();
  if (!ea) return [];
  try {
    const entries = await ea.readDir(dirPath);
    if (!entries || (entries as any).error) return [];
    const result: FileEntry[] = [];
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      if (e.kind === 'directory') {
        result.push({ name: e.name, kind: 'directory', children: await buildTree(dirPath + '/' + e.name) });
      } else if (e.name.endsWith('.json')) {
        result.push({ name: e.name, kind: 'file', children: [] });
      }
    }
    return result;
  } catch {
    return [];
  }
}

function flattenPaths(tree: FileEntry[], prefix = ''): string[] {
  const result: string[] = [];
  for (const entry of tree) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === 'file') result.push(path);
    else result.push(...flattenPaths(entry.children, path));
  }
  return result;
}

export function createElectronAdapter(mountPath: string): FileAdapter {
  const resolve = (fileName: string) => mountPath + '/' + fileName;

  return {
    async listFiles() {
      try {
        return ok(await buildTree(mountPath));
      } catch (e: any) {
        return err(e.message || 'Electron listFiles failed');
      }
    },

    async readFile(fileName) {
      try {
        const ea = getEA();
        if (!ea) return ok(null);
        const raw = await ea.readFile(resolve(fileName));
        if (!raw || (raw as any).error) return ok(null);
        return ok(raw as string);
      } catch {
        return ok(null);
      }
    },

    async statFile(fileName) {
      if (!isRelativeFilePath(fileName)) return err('Invalid file path');
      try {
        const ea = getEA();
        if (!ea?.stat) return err('File metadata unavailable');
        const result = await ea.stat(resolve(fileName));
        if (!result) return ok(null);
        if ('error' in result) return err(result.error);
        if (result.isDir) return ok(null);
        const { size, mtime, ctime } = result;
        if (!Number.isFinite(size) || !Number.isFinite(mtime)) return err('File metadata unavailable');
        return ok({ size, mtime, ...(Number.isFinite(ctime) ? { ctime } : {}) });
      } catch {
        return err('Unable to inspect file');
      }
    },

    async writeFile(fileName, data) {
      try {
        const ea = getEA();
        if (!ea) return err('Electron API not available');
        const r = await ea.writeFile(resolve(fileName), data);
        if (r && (r as any).error) return err((r as any).error);
        return ok(true);
      } catch (e: any) {
        return err(e.message || 'Electron write failed');
      }
    },

    async createFile(fileName, data) {
      try {
        const ea = getEA();
        if (!ea?.createGraphFile) return err('Exclusive graph creation is unavailable in this Electron version');
        const result = await ea.createGraphFile(mountPath, fileName, data);
        return 'outcome' in result ? ok(result.outcome) : err(result.error);
      } catch (error) {
        return err(error instanceof Error ? error.message : 'Electron create failed');
      }
    },

    async deleteFile(fileName, options) {
      try {
        const ea = getEA();
        if (!ea) return err('Electron API not available');
        const result = await ea.delete(resolve(fileName), options);
        return result?.ok === true ? ok(true) : err(result?.error || 'Electron delete failed');
      } catch (error) {
        return err(error instanceof Error ? error.message : 'Electron delete failed');
      }
    },

    async renameFile(oldPath, newName) {
      try {
        const ea = getEA();
        if (!ea) return err('Electron API not available');
        const normalizedName = newName.endsWith('.json') ? newName : newName + '.json';
        const newPath = replacePathName(oldPath, normalizedName);
        const result = await ea.rename(resolve(oldPath), resolve(newPath));
        return result?.ok === true ? ok(true) : err(result?.error || 'Electron rename failed');
      } catch (error) {
        return err(error instanceof Error ? error.message : 'Electron rename failed');
      }
    },

    async copyFile(path) {
      try {
        const ea = getEA();
        if (!ea) return err('Electron API not available');
        const r1 = await this.suggestCopyName(path);
        if (!r1.ok) return r1;
        const raw = await ea.readFile(resolve(path));
        if (!raw || (raw as any).error) return err('Source not found');
        const r2 = await ea.writeFile(resolve(r1.value), raw as string);
        if (r2 && (r2 as any).error) return err((r2 as any).error);
        return ok(true);
      } catch (e: any) {
        return err(e.message || 'Electron copy failed');
      }
    },

    async moveFile(srcPath, dstDir) {
      try {
        const ea = getEA();
        if (!ea) return err('Electron API not available');
        const name = srcPath.split('/').pop()!;
        const dstPath = joinPath(dstDir, name);
        const raw = await ea.readFile(resolve(srcPath));
        if (!raw || (raw as any).error) return err('Source not found');
        const w = await ea.writeFile(resolve(dstPath), raw as string);
        if (w && (w as any).error) return err((w as any).error);
        await ea.delete(resolve(srcPath));
        return ok(true);
      } catch (e: any) {
        return err(e.message || 'Electron move failed');
      }
    },

    async createDirectory(dirPath) {
      try {
        const ea = getEA();
        if (!ea) return err('Electron API not available');
        await ea.mkdir(resolve(dirPath));
        return ok(true);
      } catch (e: any) {
        return err(e.message || 'Electron mkdir failed');
      }
    },

    async suggestCopyName(baseName) {
      try {
        const tree = await buildTree(mountPath);
        const paths = flattenPaths(tree);
        let n = 2;
        let newPath: string;
        do {
          newPath = baseName.replace(/\.json$/, '') + ' ' + n + '.json';
          n++;
        } while (paths.includes(newPath));
        return ok(newPath);
      } catch (e: any) {
        return err(e.message || 'Electron suggestCopyName failed');
      }
    },
  };
}
