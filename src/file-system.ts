/**
 * File System Access API 封装
 * 用于浏览器直接读写本地文件夹
 */

export interface FileEntry {
  name: string;
  handle: FileSystemFileHandle;
}

export interface TreeEntry {
  name: string;
  kind: 'file' | 'directory';
  handle: FileSystemFileHandle | FileSystemDirectoryHandle;
  children: TreeEntry[];
}

let dirHandle: FileSystemDirectoryHandle | null = null;

export function getDirHandle() {
  return dirHandle;
}

/** 弹出文件夹选择器 */
export async function openFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
    return dirHandle;
  } catch (e: any) {
    if (e.name === 'AbortError') return null;
    console.error('打开文件夹失败', e);
    return null;
  }
}

/** 恢复之前保存的文件夹句柄（需要重新请求权限） */
export async function restoreFolder(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    const opts: any = { mode: 'readwrite' };
    const ok = await (handle as any).requestPermission(opts);
    if (ok === 'granted') {
      dirHandle = handle;
      return true;
    }
    // 权限不够 → 缓存句柄，后续用户手动"打开文件夹"时再申请
    dirHandle = handle;
  } catch {
    // 页面加载阶段无用户手势 → SecurityError，缓存句柄静默跳过
    dirHandle = handle;
  }
  return false;
}

/** 递归列出文件树（目录 + .json 文件） */
export async function listFileTree(dh?: FileSystemDirectoryHandle): Promise<TreeEntry[]> {
  const h = dh || dirHandle;
  if (!h) return [];
  return _listTree(h);
}

async function _listTree(h: FileSystemDirectoryHandle): Promise<TreeEntry[]> {
  const result: TreeEntry[] = [];
  for await (const [name, handle] of (h as any).entries()) {
    if (handle.kind === 'directory') {
      // 跳过隐藏目录和 node_modules
      if (name.startsWith('.') || name === 'node_modules') continue;
      const children = await _listTree(handle as FileSystemDirectoryHandle);
      result.push({ name, kind: 'directory', handle, children });
    } else if (handle.kind === 'file' && name.endsWith('.json')) {
      result.push({ name, kind: 'file', handle: handle as FileSystemFileHandle, children: [] });
    }
  }
  result.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return result;
}

/** 从文件树中展平所有 .json 文件路径 */
export function flatFilePaths(tree: TreeEntry[], prefix = ''): string[] {
  const result: string[] = [];
  for (const entry of tree) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === 'file') result.push(path);
    else result.push(...flatFilePaths(entry.children, path));
  }
  return result;
}

/** 列出文件夹中所有 .json 文件（扁平，兼容旧接口） */
export async function listGraphFiles(dh?: FileSystemDirectoryHandle): Promise<FileEntry[]> {
  const h = dh || dirHandle;
  if (!h) return [];
  const files: FileEntry[] = [];
  for await (const [name, handle] of (h as any).entries()) {
    if (handle.kind === 'file' && name.endsWith('.json')) {
      files.push({ name, handle: handle as FileSystemFileHandle });
    }
  }
  files.sort((a, b) => a.name.localeCompare(b.name));
  return files;
}

function validateFileName(name: string): boolean {
  return !name.includes('..') && !name.includes('/') && !name.includes('\\');
}

/** 读取 JSON 文件（支持路径如 subdir/file.json） */
export async function readGraphFile(filePath: string, dh?: FileSystemDirectoryHandle): Promise<any | null> {
  const h = dh || dirHandle;
  if (!h) return null;
  const parts = filePath.split('/');
  for (const p of parts) {
    if (!validateFileName(p)) {
      console.warn('Path traversal blocked:', filePath);
      return null;
    }
  }
  try {
    let current = h;
    for (let i = 0; i < parts.length - 1; i++) {
      current = await current.getDirectoryHandle(parts[i]) as any;
    }
    const fh = await current.getFileHandle(parts[parts.length - 1]);
    const file = await fh.getFile();
    const text = await file.text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** 写入 JSON 文件（支持路径） */
export async function writeGraphFile(filePath: string, data: any, dh?: FileSystemDirectoryHandle): Promise<boolean> {
  const h = dh || dirHandle;
  if (!h) return false;
  const parts = filePath.split('/');
  for (const p of parts) {
    if (!validateFileName(p)) {
      console.warn('Path traversal blocked:', filePath);
      return false;
    }
  }
  try {
    let current = h;
    for (let i = 0; i < parts.length - 1; i++) {
      current = await current.getDirectoryHandle(parts[i], { create: true }) as any;
    }
    const fh = await current.getFileHandle(parts[parts.length - 1], { create: true });
    const writable = await (fh as any).createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
    return true;
  } catch (e) {
    console.error('写入文件失败', e);
    return false;
  }
}

/** 删除文件（支持路径） */
export async function deleteFile(filePath: string, dh?: FileSystemDirectoryHandle): Promise<boolean> {
  const h = dh || dirHandle;
  if (!h) return false;
  const parts = filePath.split('/');
  for (const p of parts) {
    if (!validateFileName(p)) {
      console.warn('Path traversal blocked:', filePath);
      return false;
    }
  }
  try {
    let current = h;
    for (let i = 0; i < parts.length - 1; i++) {
      current = await current.getDirectoryHandle(parts[i]) as any;
    }
    await current.removeEntry(parts[parts.length - 1]);
    return true;
  } catch {
    return false;
  }
}

/** 重命名文件（支持路径） */
export async function renameFile(oldPath: string, newName: string, dh?: FileSystemDirectoryHandle): Promise<boolean> {
  const h = dh || dirHandle;
  if (!h) return false;
  try {
    const data = await readGraphFile(oldPath, h);
    if (!data) return false;
    const parts = oldPath.split('/');
    parts[parts.length - 1] = newName.endsWith('.json') ? newName : newName + '.json';
    const newPath = parts.join('/');
    await writeGraphFile(newPath, data, h);
    // 删除旧文件
    let current = h;
    for (let i = 0; i < parts.length - 1; i++) {
      current = await current.getDirectoryHandle(parts[i]) as any;
    }
    await current.removeEntry(oldPath.split('/').pop()!);
    return true;
  } catch {
    return false;
  }
}

// ---- FileAdapter 工厂 ----
import { FileAdapter, Result, ok, err } from './file-adapter';

export function createFSAAdapter(getDH: () => FileSystemDirectoryHandle | null): FileAdapter {
  const buildCopyName = async (baseName: string, dh: FileSystemDirectoryHandle): Promise<string> => {
    const tree = await listFileTree(dh);
    const paths = flatFilePaths(tree);
    let n = 2;
    let newPath: string;
    do {
      newPath = baseName.replace(/\.json$/, '') + ' ' + n + '.json';
      n++;
    } while (paths.includes(newPath));
    return newPath;
  };

  return {
    async listFiles() {
      const dh = getDH();
      if (!dh) return ok([]);
      try { return ok(await listFileTree(dh)); }
      catch (e: any) { return err(e.message); }
    },
    async readFile(fileName) {
      const dh = getDH();
      if (!dh) return ok(null);
      try {
        const data = await readGraphFile(fileName, dh);
        return ok(data ? JSON.stringify(data) : null);
      } catch (e: any) { return err(e.message); }
    },
    async writeFile(fileName, data) {
      const dh = getDH();
      if (!dh) return err('No directory handle');
      try {
        const ok_ = await writeGraphFile(fileName, JSON.parse(data), dh);
        return ok_ ? ok(true) : err('FSA write failed');
      } catch (e: any) { return err(e.message); }
    },
    async deleteFile(fileName) {
      const dh = getDH();
      if (!dh) return err('No directory handle');
      try { return ok(await deleteFile(fileName, dh)); }
      catch (e: any) { return err(e.message); }
    },
    async renameFile(oldPath, newName) {
      const dh = getDH();
      if (!dh) return err('No directory handle');
      try { return ok(await renameFile(oldPath, newName, dh)); }
      catch (e: any) { return err(e.message); }
    },
    async copyFile(path) {
      const dh = getDH();
      if (!dh) return err('No directory handle');
      try {
        const data = await readGraphFile(path, dh);
        if (!data) return err('Source not found');
        const newPath = await buildCopyName(path, dh);
        return ok(await writeGraphFile(newPath, data, dh));
      } catch (e: any) { return err(e.message); }
    },
    async moveFile(srcPath, dstDir) {
      const dh = getDH();
      if (!dh) return err('No directory handle');
      try {
        const data = await readGraphFile(srcPath, dh);
        if (!data) return err('Source not found');
        const name = srcPath.split('/').pop()!;
        const wrote = await writeGraphFile(dstDir + '/' + name, data, dh);
        if (!wrote) return err('Move write failed');
        await deleteFile(srcPath, dh);
        return ok(true);
      } catch (e: any) { return err(e.message); }
    },
    async createDirectory(dirPath) {
      const dh = getDH();
      if (!dh) return err('No directory handle');
      try {
        await writeGraphFile(dirPath + '/.gitkeep', {} as any, dh);
        await deleteFile(dirPath + '/.gitkeep', dh);
        return ok(true);
      } catch (e: any) { return err(e.message); }
    },
    async suggestCopyName(baseName) {
      const dh = getDH();
      if (!dh) return err('No directory handle');
      try { return ok(await buildCopyName(baseName, dh)); }
      catch (e: any) { return err(e.message); }
    },
  };
}
