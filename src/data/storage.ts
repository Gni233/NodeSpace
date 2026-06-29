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
}

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
  const writeData = async (data: GraphData) => {
    localStorage.setItem(key, JSON.stringify(data, null, 2));
  };
  const deleteData = async () => {
    localStorage.removeItem(key);
  };
  return { ensureDir, readData, writeData, deleteData };
}
