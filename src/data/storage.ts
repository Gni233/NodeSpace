import { FileAdapter, FileEntry, ok, err } from '../file-adapter';
export interface GraphSettings {
  linkDist: number;
  labelSize: number;
  charge: number;
  linkStr: number;
  collideR: number;
  centerS: number;
  groupBound: number;
  heatingTime: number;
  alphaTarget: number;
  editPanelOpacity: number;
  useRAFL: boolean;
  nodeExpand: number;
  lineExpand: number;
  showGLabels: boolean;
  glMin: number;
  glMax: number;
  gridVis: boolean;
  gridMode: 'line' | 'dot';
  axisVis: boolean;
  axisTicks: boolean;
  gridSp: number;
  ar: number;
  graphTheme: string;
  focusMode: boolean;
  centerMode?: boolean;
  selectedTooltip?: boolean;
  starRotateMode?: boolean;
  glowAppearance: boolean;
  gridWidth: number;
  categoryLayout: boolean;
  layoutMode?: string;
  gridSnap?: boolean;
  partialGridSnap?: boolean;
  nodeColorStyle?: string;
  fontFamily?: string;
  edgeColorGradient?: boolean;
  edgeWidthByLevel?: boolean;
  fixedHollow?: boolean;
  cardBorderStyle?: 'straight' | 'rounded';
  expandedMedia?: string[];
}

/** 图数据：节点+边+集合+设置
 *  Node fields: id, label, x, y, headingLevel(1-6), tags[], note, mediaUrl, mediaType, color, radius, radiusMode, fixed, fx, fy, collapsed, hyperlink
 *  Edge fields: source, target, label, color, arrow, lineStyle
 *  Group fields: id, label, displayMode, color, borderColor, opacity, nodeColorMode, nodeColor, fluidRadius, fluidOpacity
 */
export interface GraphData {
  nodes: any[];
  edges: any[];
  groups: any[];
  settings?: GraphSettings;
}

const STORAGE_PREFIX = 'fg-data-';

export function createStorage(graphName: string) {
  const key = STORAGE_PREFIX + graphName;

  const ensureDir = async () => {
    // localStorage 无需创建目录
  };
  const readData = async (): Promise<GraphData | null> => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  const writeData = async (data: GraphData): Promise<boolean> => {
    try {
      localStorage.setItem(key, JSON.stringify(data, null, 2));
      return true;
    } catch (e) {
      console.warn('Failed to write to localStorage, quota may be full:', e);
      return false;
    }
  };
  const deleteData = async (): Promise<boolean> => {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.warn('Failed to delete from localStorage:', e);
      return false;
    }
  };
  return { ensureDir, readData, writeData, deleteData };
}


export function createStorageAdapter(): FileAdapter {
  return {
    async listFiles() {
      try {
        const files: FileEntry[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(STORAGE_PREFIX)) {
            const name = key.slice(STORAGE_PREFIX.length);
            if (name === 'demo') continue;
            files.push({ name, kind: 'file', children: [] });
          }
        }
        return ok(files);
      } catch (e: any) { return err(e.message); }
    },
    async readFile(fileName) {
      try {
        const raw = localStorage.getItem(STORAGE_PREFIX + fileName);
        return ok(raw || null);
      } catch (e: any) { return err(e.message); }
    },
    async writeFile(fileName, data) {
      try {
        localStorage.setItem(STORAGE_PREFIX + fileName, data);
        return ok(true);
      } catch (e: any) { return err(e.message || 'localStorage write failed'); }
    },
    async deleteFile(fileName) {
      try {
        localStorage.removeItem(STORAGE_PREFIX + fileName);
        return ok(true);
      } catch (e: any) { return err(e.message); }
    },
    async renameFile(oldPath, newName) {
      try {
        const raw = localStorage.getItem(STORAGE_PREFIX + oldPath);
        if (!raw) return err('Source not found');
        localStorage.setItem(STORAGE_PREFIX + newName, raw);
        localStorage.removeItem(STORAGE_PREFIX + oldPath);
        return ok(true);
      } catch (e: any) { return err(e.message); }
    },
    async copyFile(path) {
      try {
        const raw = localStorage.getItem(STORAGE_PREFIX + path);
        if (!raw) return err('Source not found');
        const baseName = path;
        let n = 2;
        let newPath: string;
        do {
          newPath = baseName.replace(/\.json$/, '') + ' ' + n + '.json';
          n++;
        } while (localStorage.getItem(STORAGE_PREFIX + newPath));
        localStorage.setItem(STORAGE_PREFIX + newPath, raw);
        return ok(true);
      } catch (e: any) { return err(e.message); }
    },
    async moveFile(srcPath, dstDir) {
      try {
        const name = srcPath.split('/').pop()!;
        const dstName = dstDir + '/' + name;
        const raw = localStorage.getItem(STORAGE_PREFIX + srcPath);
        if (!raw) return err('Source not found');
        localStorage.setItem(STORAGE_PREFIX + dstName, raw);
        localStorage.removeItem(STORAGE_PREFIX + srcPath);
        return ok(true);
      } catch (e: any) { return err(e.message); }
    },
    async createDirectory(_dirPath) { return ok(true); },
    async suggestCopyName(baseName) {
      let n = 2;
      let newPath: string;
      do {
        newPath = baseName.replace(/\.json$/, '') + ' ' + n + '.json';
        n++;
      } while (localStorage.getItem(STORAGE_PREFIX + newPath));
      return ok(newPath);
    },
  };
}
