/** Electron IPC 文件适配器 — 通过 preload.cjs 暴露的 electronAPI 操作本地文件系统 */

import { FileAdapter, FileEntry, Result, joinPath, ok, err, replacePathName } from './file-adapter';

interface ElectronAPI {
  readFile(path: string): Promise<string | { error: string }>;
  writeFile(path: string, content: string): Promise<{ ok?: boolean; error?: string }>;
  readDir(path: string): Promise<({ name: string; kind: 'file' | 'directory' }[])>;
  mkdir(path: string): Promise<{ ok?: boolean; error?: string }>;
  delete(path: string): Promise<{ ok?: boolean; error?: string }>;
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

    async deleteFile(fileName) {
      try {
        const ea = getEA();
        if (!ea) return err('Electron API not available');
        await ea.delete(resolve(fileName));
        return ok(true);
      } catch {
        return ok(true); // idempotent
      }
    },

    async renameFile(oldPath, newName) {
      try {
        const ea = getEA();
        if (!ea) return err('Electron API not available');
        const normalizedName = newName.endsWith('.json') ? newName : newName + '.json';
        const newPath = replacePathName(oldPath, normalizedName);
        await ea.rename(resolve(oldPath), resolve(newPath));
        return ok(true);
      } catch (e: any) {
        return err(e.message || 'Electron rename failed');
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
