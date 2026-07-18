/**
 * 鸿蒙 WebView 文件系统模块
 * 使用 localStorage 存储图数据（无原生文件系统访问）
 */
import { GraphData } from './data/storage';

const STORAGE_PREFIX = 'fg-data-';

function storageKey(fileName: string): string {
  return STORAGE_PREFIX + fileName;
}

/** 列出所有 localStorage 中的图文件 */
export async function listFilesHarmony(): Promise<{ name: string; kind: 'file' | 'directory'; children: any[] }[]> {
  const files: { name: string; kind: 'file' | 'directory'; children: any[] }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(STORAGE_PREFIX)) {
      const name = key.slice(STORAGE_PREFIX.length);
      if (name === 'demo') continue; // demo 始终存在，单独处理
      files.push({ name, kind: 'file', children: [] });
    }
  }
  files.sort((a, b) => a.name.localeCompare(b.name));
  return files;
}

/** 从 localStorage 读取图数据 */
export async function readFileHarmony(fileName: string): Promise<GraphData | null> {
  try {
    const raw = localStorage.getItem(storageKey(fileName));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** 写入图数据到 localStorage */
export async function writeFileHarmony(fileName: string, data: GraphData): Promise<boolean> {
  try {
    localStorage.setItem(storageKey(fileName), JSON.stringify(data, null, 2));
    return true;
  } catch {
    return false;
  }
}

/** 从 localStorage 删除图文件 */
export async function deleteFileHarmony(fileName: string): Promise<boolean> {
  try {
    localStorage.removeItem(storageKey(fileName));
    return true;
  } catch {
    return false;
  }
}

/**
 * 处理用户选取的 JSON 文件：写入 localStorage。
 * 供设置面板内嵌 <input type="file"> 的 change 事件调用。
 */
export async function importFilesHarmony(files: FileList): Promise<void> {
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const name = file.name.endsWith('.json') ? file.name : file.name + '.json';
    try {
      const text = await file.text();
      localStorage.setItem(storageKey(name), text);
    } catch (e) {
      console.error('HarmonyOS import failed:', name, e);
    }
  }
}

/**
 * 创建文件导入控件（通过 <input type="file"> 导入 JSON 到 localStorage）
 * 返回 { label } 供设置面板显示为"导入文件"按钮
 */
export function createHarmonyFileImporter(onDone: () => void): { label: HTMLElement } {
  const id = 'fg-harmony-importer-' + Date.now();
  const input = document.createElement('input');
  input.type = 'file';
  input.id = id;
  input.accept = '.json,application/json';
  input.multiple = true;
  input.style.cssText = 'position:fixed;top:-9999px;left:-9999px;';

  const label = document.createElement('label');
  label.setAttribute('for', id);
  label.textContent = '导入文件';
  label.style.cssText = 'display:inline-block;cursor:pointer;';

  document.body.appendChild(input);

  // 兜底：部分 WebView 不支持 label-for 触发隐藏 input
  // 加 pointerdown 直接调 input.click()（用户手势上下文内有效）
  label.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    input.click();
  });

  input.addEventListener('change', async () => {
    const files = input.files;
    if (!files || files.length === 0) { onDone(); return; }
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const name = file.name.endsWith('.json') ? file.name : file.name + '.json';
      try {
        const text = await file.text();
        localStorage.setItem(storageKey(name), text);
      } catch (e) {
        console.error('HarmonyOS import failed:', name, e);
      }
    }
    input.value = '';
    onDone();
  });

  return { label };
}

// ---- FileAdapter 工厂 ----
import { FileAdapter, joinPath, ok, err, replacePathName } from './file-adapter';

export function createHarmonyAdapter(): FileAdapter {
  const dedup = async (baseName: string): Promise<string> => {
    const files = await listFilesHarmony();
    let n = 2;
    let newPath: string;
    do {
      newPath = baseName.replace(/\.json$/, '') + ' ' + n + '.json';
      n++;
    } while (files.some(f => f.name === newPath));
    return newPath;
  };

  return {
    async listFiles() {
      try { return ok(await listFilesHarmony()); }
      catch (e: any) { return err(e.message); }
    },
    async readFile(fileName) {
      try {
        const data = await readFileHarmony(fileName);
        return ok(data ? JSON.stringify(data) : null);
      } catch (e: any) { return err(e.message); }
    },
    async writeFile(fileName, data) {
      try { return ok(await writeFileHarmony(fileName, JSON.parse(data))); }
      catch (e: any) { return err(e.message); }
    },
    async deleteFile(fileName) {
      try { return ok(await deleteFileHarmony(fileName)); }
      catch { return ok(true); }
    },
    async renameFile(oldPath, newName) {
      try {
        const content = await readFileHarmony(oldPath);
        if (!content) return err('Source not found');
        const wrote = await writeFileHarmony(replacePathName(oldPath, newName), content);
        if (!wrote) return err('Write failed');
        await deleteFileHarmony(oldPath);
        return ok(true);
      } catch (e: any) { return err(e.message); }
    },
    async copyFile(path) {
      try {
        const content = await readFileHarmony(path);
        if (!content) return err('Source not found');
        const newPath = await dedup(path);
        return ok(await writeFileHarmony(newPath, content));
      } catch (e: any) { return err(e.message); }
    },
    async moveFile(srcPath, dstDir) {
      try {
        const name = srcPath.split('/').pop()!;
        const dstName = joinPath(dstDir, name);
        const content = await readFileHarmony(srcPath);
        if (!content) return err('Source not found');
        const wrote = await writeFileHarmony(dstName, content);
        if (!wrote) return err('Move write failed');
        await deleteFileHarmony(srcPath);
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
