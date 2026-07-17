#!/usr/bin/env node
/**
 * NodeSpace MCP Server — AI Agent 通过 MCP 协议创作节点网络图
 *
 * 使用方式:
 *   node server.js
 *   node server.js --dir /path/to/graphs
 *   NODESPACE_DATA_DIR=/path/to/graphs node server.js
 *
 * Claude Code 配置 (settings.json):
 *   "mcpServers": {
 *     "nodespace": {
 *       "command": "node",
 *       "args": ["path/to/nodespace/mcp-server/server.js"],
 *       "env": { "NODESPACE_DATA_DIR": "C:/Users/xxx/Documents/NodeSpace" }
 *     }
 *   }
 */

import { readdir, readFile, writeFile, mkdir, stat, unlink, rename, copyFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, extname, basename, resolve, dirname } from 'node:path';
import { homedir, platform } from 'node:os';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { resolveInside } from './path-utils.js';

// ---- 数据目录 ----
function getElectronConfigDir() {
  // 与 Electron main.cjs 中的 getConfigPath() 保持一致
  // app.getPath('userData') → Windows: %APPDATA%/<appName>
  // 默认回退到 Documents/NodeSpace
  try {
    const os = platform();
    // 先尝试常见路径
    const candidates = [];
    if (os === 'win32') {
      const appdata = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
      candidates.push(join(appdata, 'nodespace', 'config.json'));
      candidates.push(join(appdata, 'NodeSpace', 'config.json'));
    } else if (os === 'darwin') {
      candidates.push(join(homedir(), 'Library', 'Application Support', 'nodespace', 'config.json'));
      candidates.push(join(homedir(), 'Library', 'Application Support', 'NodeSpace', 'config.json'));
    } else {
      candidates.push(join(homedir(), '.config', 'nodespace', 'config.json'));
      candidates.push(join(homedir(), '.config', 'NodeSpace', 'config.json'));
    }
    for (const cp of candidates) {
      if (existsSync(cp)) {
        const raw = readFileSync(cp, 'utf-8');
        const config = JSON.parse(raw);
        if (config.folderPath && existsSync(config.folderPath)) {
          return config.folderPath;
        }
      }
    }
  } catch {}
  return null;
}

// 命令行 / 环境变量目录（最高优先级，固定不变）
const CLI_DIR = (() => {
  const args = process.argv.slice(2);
  const dirIdx = args.indexOf('--dir');
  if (dirIdx >= 0 && args[dirIdx + 1]) return resolve(args[dirIdx + 1]);
  if (process.env.NODESPACE_DATA_DIR) return resolve(process.env.NODESPACE_DATA_DIR);
  return null;
})();

let DATA_DIR = CLI_DIR || getElectronConfigDir() || join(homedir(), 'Documents', 'NodeSpace');

// 每次操作前刷新目录，确保与用户当前打开的文件夹同步
function refreshDataDir() {
  if (CLI_DIR) return; // 命令行指定了目录，不动
  const d = getElectronConfigDir();
  if (d && d !== DATA_DIR) {
    DATA_DIR = d;
    log(`[NodeSpace MCP] 目录已切换: ${DATA_DIR}`);
  }
}

// ---- 工具函数 ----
function log(...args) { process.stderr.write(args.join(' ') + '\n'); }

function dataPath(...segments) {
  return resolveInside(DATA_DIR, ...segments);
}

function graphPath(name) {
  if (typeof name !== 'string' || !name.trim()) throw new Error('Graph name is required');
  return dataPath(name.endsWith('.json') ? name : name + '.json');
}

async function readGraph(name) {
  const p = graphPath(name);
  if (!existsSync(p)) return null;
  const raw = await readFile(p, 'utf-8');
  return JSON.parse(raw);
}

// ---- 图操作串行锁（在 tools/call dispatch 层使用，保证每个图只有一个操作执行） ----
const _writeLocks = new Map(); // graphKey → Promise

async function writeGraph(name, data, { undo = true } = {}) {
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
  const sn = snapshotName(name);
  if (undo) {
    const prevData = await readGraph(sn);
    if (prevData) {
      undoStack.push({ graph: sn, data: JSON.parse(JSON.stringify(prevData)) });
      if (undoStack.length > MAX_UNDO) undoStack.shift();
      redoStack.length = 0;
    }
  }
  const p = graphPath(name);
  // 原子写入：先写临时文件，再 rename
  const tmpPath = p + '.tmp.' + randomUUID();
  await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  await rename(tmpPath, p);
}

// ---- 撤销/重做 ----
const MAX_UNDO = 50;
const undoStack = []; // { graph, data }
const redoStack = []; // { graph, data }

function snapshotName(graph) { return graph.replace(/\.json$/, ''); }

async function pushUndo(graph) {
  const name = snapshotName(graph);
  const data = await readGraph(name);
  if (!data) return;
  // 深度拷贝，防止引用污染
  undoStack.push({ graph: name, data: JSON.parse(JSON.stringify(data)) });
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0; // 新操作清空 redo
}

// 在所有会修改数据的 handler 中调用此包装器
async function mutating(graph, fn) {
  await pushUndo(graph);
  return fn();
}

async function listGraphs() {
  if (!existsSync(DATA_DIR)) return [];
  const entries = await readdir(DATA_DIR, { withFileTypes: true });
  return entries
    .filter(e => e.isFile() && e.name.endsWith('.json'))
    .map(e => basename(e.name, '.json'));
}

// ---- 发送 JSON-RPC 响应 ----
function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

// ---- MCP 工具定义 ----
const TOOLS = [
  {
    name: 'list_graphs',
    description: '列出所有可用的图文件。返回文件名列表（不含 .json 后缀）。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'read_graph',
    description: '读取一个图的完整数据：所有节点、边、分组和设置。',
    inputSchema: {
      type: 'object',
      properties: {
        graph: { type: 'string', description: '图文件名，不含 .json 后缀' },
      },
      required: ['graph'],
    },
  },
  {
    name: 'search_nodes',
    description: '在一个图中搜索节点，支持按标签模糊匹配和标签筛选。',
    inputSchema: {
      type: 'object',
      properties: {
        graph: { type: 'string', description: '图文件名，不含 .json 后缀' },
        query: { type: 'string', description: '关键词，在节点 label 中模糊搜索' },
        tag: { type: 'string', description: '按 tag 精确筛选' },
        headingLevel: { type: 'number', description: '按 headingLevel(1-6) 筛选' },
        limit: { type: 'number', description: '返回数量上限，默认 20' },
      },
      required: ['graph'],
    },
  },
  {
    name: 'create_node',
    description: '在图中创建一个新节点。返回创建的节点数据。x/y 坐标默认随机生成。',
    inputSchema: {
      type: 'object',
      properties: {
        graph: { type: 'string', description: '图文件名，不含 .json 后缀' },
        label: { type: 'string', description: '节点显示标签' },
        x: { type: 'number', description: 'X 坐标，默认随机 0~800' },
        y: { type: 'number', description: 'Y 坐标，默认随机 0~600' },
        headingLevel: { type: 'number', description: '标题级别 1-6，1=最大，默认 1' },
        tags: { type: 'array', items: { type: 'string' }, description: '标签数组' },
        note: { type: 'string', description: '备注文本' },
        color: { type: 'string', description: '自定义颜色，如 #FF6600' },
        radius: { type: 'number', description: '节点半径，默认基于 headingLevel' },
        hyperlink: { type: 'string', description: '超链接 URL' },
        fixed: { type: 'boolean', description: '是否固定位置，默认 false' },
        collapsed: { type: 'boolean', description: '是否折叠，默认 false' },
      },
      required: ['graph', 'label'],
    },
  },
  {
    name: 'create_nodes_batch',
    description: '批量创建节点。每项只需 label 和可选的 tags/x/y 等字段。',
    inputSchema: {
      type: 'object',
      properties: {
        graph: { type: 'string', description: '图文件名' },
        nodes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              x: { type: 'number' },
              y: { type: 'number' },
              headingLevel: { type: 'number' },
              tags: { type: 'array', items: { type: 'string' } },
              note: { type: 'string' },
              color: { type: 'string' },
              radius: { type: 'number' },
              fixed: { type: 'boolean' },
              collapsed: { type: 'boolean' },
            },
            required: ['label'],
          },
          description: '节点数组',
        },
      },
      required: ['graph', 'nodes'],
    },
  },
  {
    name: 'update_node',
    description: '更新一个节点的属性。只传需要修改的字段，未传字段保持不变。',
    inputSchema: {
      type: 'object',
      properties: {
        graph: { type: 'string', description: '图文件名' },
        nodeId: { type: 'string', description: '节点 ID' },
        label: { type: 'string', description: '新标签' },
        x: { type: 'number', description: '新 X 坐标' },
        y: { type: 'number', description: '新 Y 坐标' },
        headingLevel: { type: 'number', description: '标题级别 1-6' },
        tags: { type: 'array', items: { type: 'string' }, description: '标签数组（替换全部）' },
        note: { type: 'string', description: '备注' },
        color: { type: 'string', description: '颜色' },
        radius: { type: 'number', description: '半径' },
        hyperlink: { type: 'string', description: '超链接' },
        fixed: { type: 'boolean', description: '是否固定' },
        collapsed: { type: 'boolean', description: '是否折叠' },
      },
      required: ['graph', 'nodeId'],
    },
  },
  {
    name: 'delete_node',
    description: '删除一个节点。同时会删除关联该节点的所有边。',
    inputSchema: {
      type: 'object',
      properties: {
        graph: { type: 'string', description: '图文件名' },
        nodeId: { type: 'string', description: '要删除的节点 ID' },
      },
      required: ['graph', 'nodeId'],
    },
  },
  {
    name: 'create_edge',
    description: '在两个节点之间创建一条边（连线）。',
    inputSchema: {
      type: 'object',
      properties: {
        graph: { type: 'string', description: '图文件名' },
        source: { type: 'string', description: '源节点 ID' },
        target: { type: 'string', description: '目标节点 ID' },
        label: { type: 'string', description: '边标签' },
        color: { type: 'string', description: '边颜色，如 #888888' },
        lineStyle: { type: 'string', description: '线型: solid, dash, dash-2, dash-3' },
        arrow: { type: 'string', description: '箭头方向: none, forward, reverse, both' },
      },
      required: ['graph', 'source', 'target'],
    },
  },
  {
    name: 'create_edges_batch',
    description: '批量创建边。一次读写，比多次调用 create_edge 快得多，且不会出现 JSON 损坏。',
    inputSchema: {
      type: 'object',
      properties: {
        graph: { type: 'string', description: '图文件名' },
        edges: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              source: { type: 'string', description: '源节点 ID' },
              target: { type: 'string', description: '目标节点 ID' },
              label: { type: 'string', description: '边标签' },
              color: { type: 'string', description: '边颜色，如 #888888' },
              lineStyle: { type: 'string', description: '线型: solid, dash, dash-2, dash-3' },
              arrow: { type: 'string', description: '箭头: none, forward, reverse, both' },
            },
            required: ['source', 'target'],
          },
          description: '边数组',
        },
      },
      required: ['graph', 'edges'],
    },
  },
  {
    name: 'delete_edge',
    description: '删除一条边。',
    inputSchema: {
      type: 'object',
      properties: {
        graph: { type: 'string', description: '图文件名' },
        edgeIndex: { type: 'number', description: '边的索引（从 read_graph 的 edges 数组获取）' },
      },
      required: ['graph', 'edgeIndex'],
    },
  },
  {
    name: 'create_group',
    description: '创建一个节点分组（用标签关联节点）。',
    inputSchema: {
      type: 'object',
      properties: {
        graph: { type: 'string', description: '图文件名' },
        label: { type: 'string', description: '分组标签，匹配节点 tags' },
        color: { type: 'string', description: '分组颜色，如 #4488ff' },
        borderColor: { type: 'string', description: '边框颜色' },
        displayMode: { type: 'string', description: '显示模式: fluid, outline, none' },
        opacity: { type: 'number', description: '填充透明度 0-1，默认 0.15' },
        fluidRadius: { type: 'number', description: '流体半径倍数，默认 3' },
      },
      required: ['graph', 'label'],
    },
  },
  {
    name: 'get_stats',
    description: '获取图的统计信息：节点数、边数、分组数、标签分布等。',
    inputSchema: {
      type: 'object',
      properties: {
        graph: { type: 'string', description: '图文件名' },
      },
      required: ['graph'],
    },
  },
  {
    name: 'layout_nodes',
    description: '为节点自动排列位置。可选圆形、网格或随机布局。建议批量创建后调用，避免所有节点堆叠在同一位置。',
    inputSchema: {
      type: 'object',
      properties: {
        graph: { type: 'string', description: '图文件名' },
        mode: { type: 'string', description: '布局模式: circle(圆形), grid(网格), random(随机)。默认 circle' },
        spacing: { type: 'number', description: '节点间距，默认 150' },
      },
      required: ['graph'],
    },
  },
  {
    name: 'read_node_context',
    description: '读取一个节点及其相邻节点，不加载整个图。适用于大图（上千节点）场景，只需查看局部上下文。返回目标节点、直接邻接节点、以及它们之间的边。',
    inputSchema: {
      type: 'object',
      properties: {
        graph: { type: 'string', description: '图文件名' },
        nodeId: { type: 'string', description: '目标节点 ID' },
        depth: { type: 'number', description: '邻域深度：1=直接邻居（默认），2=邻居的邻居。大图建议 depth=1' },
      },
      required: ['graph', 'nodeId'],
    },
  },
  {
    name: 'read_settings',
    description: '读取图的设置：模拟参数、网格、主题、字体等所有可配置项。就是修改图中"图区自定义"里的那些设置。',
    inputSchema: {
      type: 'object',
      properties: {
        graph: { type: 'string', description: '图文件名' },
      },
      required: ['graph'],
    },
  },
  {
    name: 'update_settings',
    description: '修改图的设置。只传需要改的字段，未传字段保持不变。可修改模拟参数、网格、主题、字体等所有"图区自定义"中的设置。',
    inputSchema: {
      type: 'object',
      properties: {
        graph: { type: 'string', description: '图文件名' },

        // ── 力导向模拟 ──
        linkDist: { type: 'number', description: '边的理想长度（默认 120）' },
        charge: { type: 'number', description: '节点间斥力。负值=排斥，越大排斥越强（默认 -100）' },
        linkStr: { type: 'number', description: '边的强度 0~1，越大越紧（默认 0.3）' },
        collideR: { type: 'number', description: '碰撞半径，防止节点重叠（默认 10）' },
        centerS: { type: 'number', description: '向心力强度，越大越聚拢（默认 0.02）' },
        groupBound: { type: 'number', description: '分组约束强度 0~1（默认 0.8）' },
        heatingTime: { type: 'number', description: '模拟预热时间（秒，默认 2）' },
        alphaTarget: { type: 'number', description: '模拟止息阈值 0~1（默认 0.3）' },
        useRAFL: { type: 'boolean', description: '启用 RAF 节流（默认 true）' },
        categoryLayout: { type: 'boolean', description: '按分类布局（默认 false）' },
        layoutMode: { type: 'string', description: '布局模式: default / radial / tree' },

        // ── 视觉效果 ──
        graphTheme: { type: 'string', description: '主题: nord-dark, nord-light, solarized-dark, solarized-light, dracula, gruvbox-dark, gruvbox-light, tokyo-night, tokyo-light' },
        focusMode: { type: 'boolean', description: '专注模式（高亮选中节点，淡化其余）' },
        glowAppearance: { type: 'boolean', description: '节点发光效果（默认 true）' },
        nodeColorStyle: { type: 'string', description: '节点配色: spectrum-wide(宽色谱), spectrum-narrow(窄色谱), heading(标题色), accent(强调色单色)' },
        edgeColorGradient: { type: 'boolean', description: '边使用渐变色（默认 false）' },
        edgeWidthByLevel: { type: 'boolean', description: '边宽度随节点等级变化（默认 false）' },

        // ── 网格 ──
        gridVis: { type: 'boolean', description: '显示网格（默认 true）' },
        gridMode: { type: 'string', description: '网格样式: dot(点阵), line(线条)' },
        gridSp: { type: 'number', description: '网格间距（默认 30）' },
        gridWidth: { type: 'number', description: '网格线宽（默认 0.5）' },
        axisVis: { type: 'boolean', description: '显示坐标轴（默认 false）' },
        axisTicks: { type: 'boolean', description: '坐标轴刻度（默认 false）' },
        gridSnap: { type: 'boolean', description: '全部吸附网格（默认 false）' },
        partialGridSnap: { type: 'boolean', description: '固定节点吸附网格（默认 false）' },

        // ── 标签 ──
        labelSize: { type: 'number', description: '标签字号（默认 18）' },
        showGLabels: { type: 'boolean', description: '显示分组标签（默认 true）' },
        glMin: { type: 'number', description: '分组标签最小字号（默认 10）' },
        glMax: { type: 'number', description: '分组标签最大字号（默认 28）' },
        fontFamily: { type: 'string', description: '字体，如 "SiYuan Songti", "Microsoft YaHei", "sans-serif"' },

        // ── 交互 ──
        nodeExpand: { type: 'number', description: '节点点击扩展距离（px，默认 8）' },
        lineExpand: { type: 'number', description: '边点击扩展距离（px，默认 6）' },
        editPanelOpacity: { type: 'number', description: '编辑面板透明度 0~1（默认 0.9）' },
        ar: { type: 'number', description: '宽高比（默认 0.75）' },
        fixedHollow: { type: 'boolean', description: '固定节点显示为镂空环（默认 false）' },
      },
      required: ['graph'],
    },
  },
  {
    name: 'create_graph',
    description: '创建一个新的空图文件',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '图名（不含 .json 后缀）' },
      },
      required: ['name'],
    },
  },
  {
    name: 'delete_graph',
    description: '删除一个图文件',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '图名（不含 .json 后缀）' },
      },
      required: ['name'],
    },
  },
  {
    name: 'rename_graph',
    description: '重命名一个图文件',
    inputSchema: {
      type: 'object',
      properties: {
        oldName: { type: 'string', description: '原图名' },
        newName: { type: 'string', description: '新图名' },
      },
      required: ['oldName', 'newName'],
    },
  },
  {
    name: 'update_edge',
    description: '更新一条边的属性：标签、颜色、线型、箭头方向。',
    inputSchema: {
      type: 'object',
      properties: {
        graph: { type: 'string', description: '图文件名' },
        edgeIndex: { type: 'number', description: '边的索引（从 read_graph 的 edges 数组获取）' },
        label: { type: 'string', description: '边标签' },
        color: { type: 'string', description: '边颜色，如 #888888' },
        lineStyle: { type: 'string', description: '线型: solid, dash, dash-2, dash-3' },
        arrow: { type: 'string', description: '箭头: none, forward, reverse, both' },
      },
      required: ['graph', 'edgeIndex'],
    },
  },
  {
    name: 'update_group',
    description: '更新一个分组的属性：标签、颜色、显示模式、透明度等。',
    inputSchema: {
      type: 'object',
      properties: {
        graph: { type: 'string', description: '图文件名' },
        groupId: { type: 'string', description: '分组 ID' },
        label: { type: 'string', description: '分组标签（修改后匹配新标签的节点）' },
        color: { type: 'string', description: '填充颜色，如 #4488ff' },
        borderColor: { type: 'string', description: '边框颜色' },
        displayMode: { type: 'string', description: '显示模式: fluid, outline, none' },
        opacity: { type: 'number', description: '填充透明度 0~1' },
        fluidRadius: { type: 'number', description: '流体半径倍数' },
        nodeColorMode: { type: 'string', description: '节点着色: inherit(统一), keep(保留原色)' },
        nodeColor: { type: 'string', description: '统一节点颜色（nodeColorMode=inherit 时生效）' },
      },
      required: ['graph', 'groupId'],
    },
  },
  {
    name: 'delete_group',
    description: '删除一个分组（不影响节点本身）。',
    inputSchema: {
      type: 'object',
      properties: {
        graph: { type: 'string', description: '图文件名' },
        groupId: { type: 'string', description: '分组 ID' },
      },
      required: ['graph', 'groupId'],
    },
  },
  {
    name: 'undo',
    description: '撤销上一步操作。所有修改节点/边/分组/设置的操作都支持撤销。最多保存 50 步。',
    inputSchema: {
      type: 'object',
      properties: {
        graph: { type: 'string', description: '图文件名' },
      },
      required: ['graph'],
    },
  },
  {
    name: 'redo',
    description: '重做被撤销的上一步操作。',
    inputSchema: {
      type: 'object',
      properties: {
        graph: { type: 'string', description: '图文件名' },
      },
      required: ['graph'],
    },
  },
  {
    name: 'clear_undo',
    description: '清空指定图的撤销历史。释放内存。',
    inputSchema: {
      type: 'object',
      properties: {
        graph: { type: 'string', description: '图文件名（不传则清空所有图的撤销历史）' },
      },
      required: [],
    },
  },
  {
    name: 'import_media',
    description: '将一个本地媒体文件（图片/音频/视频）导入到图中，并关联到指定节点。文件会被复制到图数据目录下的 media 文件夹。',
    inputSchema: {
      type: 'object',
      properties: {
        graph: { type: 'string', description: '图文件名' },
        nodeId: { type: 'string', description: '目标节点 ID' },
        filePath: { type: 'string', description: '本地媒体文件的绝对路径' },
      },
      required: ['graph', 'nodeId', 'filePath'],
    },
  },
  {
    name: 'select_nodes',
    description: '按条件筛选节点，返回匹配的节点 ID 列表。相当于框选/多选：之后可以和 update_nodes_batch、delete_nodes_batch、copy_nodes 配合使用。',
    inputSchema: {
      type: 'object',
      properties: {
        graph: { type: 'string', description: '图文件名' },
        ids: { type: 'array', items: { type: 'string' }, description: '指定节点 ID 列表（与其他条件取交集）' },
        tags: { type: 'array', items: { type: 'string' }, description: '按标签筛选（任一匹配即可）' },
        headingLevel: { type: 'number', description: '按标题等级筛选 1-6' },
        fixed: { type: 'boolean', description: '筛选固定/非固定节点' },
        collapsed: { type: 'boolean', description: '筛选折叠/展开节点' },
        labelContains: { type: 'string', description: '标签名模糊匹配' },
        limit: { type: 'number', description: '返回数量上限' },
      },
      required: ['graph'],
    },
  },
  {
    name: 'update_nodes_batch',
    description: '按条件批量更新节点。先筛选匹配的节点，再统一修改它们的属性。只传需要改的字段。',
    inputSchema: {
      type: 'object',
      properties: {
        graph: { type: 'string', description: '图文件名' },
        ids: { type: 'array', items: { type: 'string' }, description: '指定节点 ID 列表' },
        tags: { type: 'array', items: { type: 'string' }, description: '按标签筛选（任一匹配）' },
        headingLevel: { type: 'number', description: '按标题等级筛选' },
        labelContains: { type: 'string', description: '标签名模糊匹配' },
        // 要修改的字段
        setTags: { type: 'array', items: { type: 'string' }, description: '设置标签（替换全部已有标签）' },
        addTags: { type: 'array', items: { type: 'string' }, description: '追加标签（保留已有标签）' },
        removeTags: { type: 'array', items: { type: 'string' }, description: '移除指定标签' },
        setHeadingLevel: { type: 'number', description: '设置标题等级 1-6' },
        setColor: { type: 'string', description: '设置颜色' },
        setRadius: { type: 'number', description: '设置半径' },
        setNote: { type: 'string', description: '设置备注' },
        setFixed: { type: 'boolean', description: '设置是否固定' },
        setCollapsed: { type: 'boolean', description: '设置是否折叠' },
      },
      required: ['graph'],
    },
  },
  {
    name: 'delete_nodes_batch',
    description: '按条件批量删除节点。会同时删除关联的边。',
    inputSchema: {
      type: 'object',
      properties: {
        graph: { type: 'string', description: '图文件名' },
        ids: { type: 'array', items: { type: 'string' }, description: '要删除的节点 ID 列表' },
        tags: { type: 'array', items: { type: 'string' }, description: '删除所有匹配这些标签的节点' },
        headingLevel: { type: 'number', description: '删除所有指定等级的节点' },
        labelContains: { type: 'string', description: '删除标签名匹配的节点' },
      },
      required: ['graph'],
    },
  },
  {
    name: 'copy_nodes',
    description: '复制一个或多个节点（含副本之间的边），坐标自动偏移防止重叠。返回新节点的 ID 映射。',
    inputSchema: {
      type: 'object',
      properties: {
        graph: { type: 'string', description: '图文件名' },
        ids: { type: 'array', items: { type: 'string' }, description: '要复制的节点 ID 列表' },
        offsetX: { type: 'number', description: 'X 偏移量，默认 50' },
        offsetY: { type: 'number', description: 'Y 偏移量，默认 50' },
      },
      required: ['graph', 'ids'],
    },
  },
];

// ---- 工具实现 ----
const handlers = {
  async list_graphs() {
    const graphs = await listGraphs();
    return { graphs, count: graphs.length, dataDir: DATA_DIR };
  },

  async create_graph({ name }) {
    if (existsSync(graphPath(name))) return { error: `图 "${name}" 已存在。` };
    await writeGraph(name, { nodes: [], edges: [], groups: [], settings: {
        linkDist: 120, labelSize: 18, charge: -100, linkStr: 0.3,
        collideR: 10, centerS: 0.02, groupBound: 0.8,
        heatingTime: 2, alphaTarget: 0.3, editPanelOpacity: 0.9,
        useRAFL: true, nodeExpand: 8, lineExpand: 6,
        showGLabels: true, glMin: 10, glMax: 28,
        gridVis: true, gridMode: 'dot', axisVis: false, axisTicks: false,
        gridSp: 30, ar: 0.75, graphTheme: 'nord-dark', focusMode: false,
        centerMode: false, glowAppearance: true, gridWidth: 0.5,
        categoryLayout: false, layoutMode: 'default',
        gridSnap: false, partialGridSnap: false,
        nodeColorStyle: 'spectrum-narrow',
        fontFamily: '"SiYuan Songti", serif',
        edgeColorGradient: false, edgeWidthByLevel: false,
        fixedHollow: true, starRotateMode: false,
        selectedTooltip: false, expandedMedia: [],
      } });
    return { ok: true, name };
  },

  async delete_graph({ name }) {
    const fp = graphPath(name);
    if (!existsSync(fp)) return { error: `图 "${name}" 不存在。` };
    await unlink(fp);
    return { ok: true };
  },

  async rename_graph({ oldName, newName }) {
    const oldFp = graphPath(oldName);
    const newFp = graphPath(newName);
    if (!existsSync(oldFp)) return { error: `图 "${oldName}" 不存在。` };
    if (existsSync(newFp)) return { error: `目标图名 "${newName}" 已存在。` };
    await rename(oldFp, newFp);
    return { ok: true, oldName, newName };
  },

  async read_graph({ graph }) {
    const data = await readGraph(graph);
    if (!data) return { error: `图 "${graph}" 不存在。可用 list_graphs 查看所有图。` };
    const name = graph.replace(/\.json$/, '');
    return {
      name,
      nodes: data.nodes || [],
      edges: data.edges || [],
      groups: data.groups || [],
      settings: data.settings || {},
      counts: {
        nodes: (data.nodes || []).length,
        edges: (data.edges || []).length,
        groups: (data.groups || []).length,
      },
    };
  },

  async read_node_context({ graph, nodeId, depth = 1 }) {
    const data = await readGraph(graph);
    if (!data) return { error: `图 "${graph}" 不存在。` };
    const nodes = data.nodes || [];
    const edges = data.edges || [];

    const target = nodes.find(n => n.id === nodeId);
    if (!target) return { error: `节点 "${nodeId}" 不存在。可用 search_nodes 查找。` };

    // BFS 收集邻域内的节点 ID
    const neighborIds = new Set();
    let frontier = new Set([nodeId]);
    for (let d = 0; d < depth; d++) {
      const nextFrontier = new Set();
      for (const e of edges) {
        const s = typeof e.source === 'string' ? e.source : e.source?.id;
        const t = typeof e.target === 'string' ? e.target : e.target?.id;
        if (frontier.has(s) && !neighborIds.has(t) && t !== nodeId) {
          neighborIds.add(t);
          nextFrontier.add(t);
        }
        if (frontier.has(t) && !neighborIds.has(s) && s !== nodeId) {
          neighborIds.add(s);
          nextFrontier.add(s);
        }
      }
      frontier = nextFrontier;
      if (frontier.size === 0) break;
    }

    // 收集涉及的边：任意一端在 {nodeId} ∪ neighborIds 中
    const contextNodeIds = new Set([nodeId, ...neighborIds]);
    const contextEdges = edges.filter(e => {
      const s = typeof e.source === 'string' ? e.source : e.source?.id;
      const t = typeof e.target === 'string' ? e.target : e.target?.id;
      return contextNodeIds.has(s) || contextNodeIds.has(t);
    });

    // 收集邻接节点数据
    const contextNodes = nodes.filter(n => contextNodeIds.has(n.id));

    // 按与目标的距离分组
    const directNeighbors = contextNodes.filter(n => neighborIds.has(n.id) &&
      edges.some(e => {
        const s = typeof e.source === 'string' ? e.source : e.source?.id;
        const t = typeof e.target === 'string' ? e.target : e.target?.id;
        return (s === nodeId && t === n.id) || (t === nodeId && s === n.id);
      }));

    const depth2Neighbors = depth >= 2 ? contextNodes.filter(n =>
      neighborIds.has(n.id) && !directNeighbors.includes(n)
    ) : [];

    return {
      node: target,
      directNeighbors,
      depth2Neighbors,
      edges: contextEdges,
      summary: {
        depth,
        totalNodesInGraph: nodes.length,
        totalEdgesInGraph: edges.length,
        contextNodeCount: contextNodes.length,
        contextEdgeCount: contextEdges.length,
        directNeighborCount: directNeighbors.length,
      },
    };
  },

  async search_nodes({ graph, query, tag, headingLevel, limit = 20 }) {
    const data = await readGraph(graph);
    if (!data) return { error: `图 "${graph}" 不存在。` };
    let nodes = data.nodes || [];

    if (query) {
      const q = query.toLowerCase();
      nodes = nodes.filter(n => (n.label || '').toLowerCase().includes(q));
    }
    if (tag) {
      nodes = nodes.filter(n => (n.tags || []).includes(tag));
    }
    if (headingLevel != null) {
      nodes = nodes.filter(n => (n.headingLevel || 1) === headingLevel);
    }

    const result = nodes.slice(0, limit);
    return {
      results: result,
      total: nodes.length,
      returned: result.length,
      query, tag, headingLevel,
    };
  },

  async create_node({ graph, label, x, y, headingLevel = 1, tags, note, color, radius, hyperlink, fixed = false, collapsed = false }) {
    const data = await readGraph(graph);
    if (!data) {
      // 自动创建新图
      const newData = { nodes: [], edges: [], groups: [], settings: {} };
      const r = handlers._createNode(newData, { label, x, y, headingLevel, tags, note, color, radius, hyperlink, fixed, collapsed });
      await writeGraph(graph, newData);
      return { created: r.node, message: `已在新图 "${graph}" 中创建节点。` };
    }

    const r = handlers._createNode(data, { label, x, y, headingLevel, tags, note, color, radius, hyperlink, fixed, collapsed });
    await writeGraph(graph, data);
    return { created: r.node };
  },

  _createNode(data, { label, x, y, headingLevel = 1, tags, note, color, radius, hyperlink, fixed = false, collapsed }) {
    const id = label.replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fff\-]/g, '').slice(0, 40) + '-' + randomUUID().slice(0, 6);
    const h = Math.max(1, Math.min(6, headingLevel));
    const defaultRadius = [0, 20, 17, 14, 12, 10, 8][Math.min(6, h)];
    const nx = x ?? Math.round(Math.random() * 800);
    const ny = y ?? Math.round(Math.random() * 600);
    // headingLevel >= 3 的节点默认折叠，减少初始渲染压力
    const isCollapsed = collapsed !== undefined ? collapsed : (h >= 3);
    const node = {
      id,
      label,
      x: nx,
      y: ny,
      headingLevel: h,
      tags: tags || [],
      note: note || '',
      color: color || '',
      radius: radius ?? defaultRadius,
      hyperlink: hyperlink || '',
      fixed,
      fx: fixed ? nx : null,
      fy: fixed ? ny : null,
      collapsed: isCollapsed,
      _isNew: false,
      mediaType: null,
      mediaUrl: null,
      radiusMode: 'level',
    };
    data.nodes.push(node);
    return { node };
  },

  async create_nodes_batch({ graph, nodes }) {
    const data = await readGraph(graph);
    if (!data) {
      const newData = { nodes: [], edges: [], groups: [], settings: {} };
      const created = nodes.map(n => handlers._createNode(newData, n).node);
      await writeGraph(graph, newData);
      return { created, count: created.length, message: `已在新图 "${graph}" 中批量创建 ${created.length} 个节点。` };
    }
    const created = nodes.map(n => handlers._createNode(data, n).node);
    await writeGraph(graph, data);
    return { created, count: created.length };
  },

  async update_node({ graph, nodeId, ...updates }) {
    const data = await readGraph(graph);
    if (!data) return { error: `图 "${graph}" 不存在。` };
    const node = (data.nodes || []).find(n => n.id === nodeId);
    if (!node) return { error: `节点 "${nodeId}" 不存在。可用 search_nodes 查找节点 ID。` };

    const allowed = ['label', 'x', 'y', 'headingLevel', 'tags', 'note', 'color', 'radius', 'hyperlink', 'fixed', 'collapsed'];
    for (const k of allowed) {
      if (updates[k] !== undefined) node[k] = updates[k];
    }
    if (updates.x !== undefined) node.fx = updates.x;
    if (updates.y !== undefined) node.fy = updates.y;

    await writeGraph(graph, data);
    return { updated: node };
  },

  async delete_node({ graph, nodeId }) {
    const data = await readGraph(graph);
    if (!data) return { error: `图 "${graph}" 不存在。` };
    const idx = (data.nodes || []).findIndex(n => n.id === nodeId);
    if (idx < 0) return { error: `节点 "${nodeId}" 不存在。` };

    const removed = data.nodes.splice(idx, 1)[0];
    // 同时删除关联边
    const beforeEdgeCount = (data.edges || []).length;
    data.edges = (data.edges || []).filter(e => {
      const s = typeof e.source === 'string' ? e.source : e.source?.id;
      const t = typeof e.target === 'string' ? e.target : e.target?.id;
      return s !== nodeId && t !== nodeId;
    });
    const removedEdges = beforeEdgeCount - data.edges.length;

    await writeGraph(graph, data);
    return { removed, removedEdges, message: removedEdges > 0 ? `同时删除了 ${removedEdges} 条关联边。` : '' };
  },

  async create_edge({ graph, source, target, label = '', color = '#BFBFBF', lineStyle, arrow }) {
    const data = await readGraph(graph);
    if (!data) return { error: `图 "${graph}" 不存在。` };

    const srcNode = (data.nodes || []).find(n => n.id === source);
    const tgtNode = (data.nodes || []).find(n => n.id === target);
    if (!srcNode) return { error: `源节点 "${source}" 不存在。` };
    if (!tgtNode) return { error: `目标节点 "${target}" 不存在。` };

    // 检查是否已存在相同边
    const exists = (data.edges || []).some(e => {
      const s = typeof e.source === 'string' ? e.source : e.source?.id;
      const t = typeof e.target === 'string' ? e.target : e.target?.id;
      return s === source && t === target;
    });
    if (exists) return { error: '这条边已存在。' };

    data.edges = data.edges || [];
    const idx = data.edges.length;
    const edge = { source, target, label, color, lineStyle: lineStyle || 'solid', arrow: arrow === 'forward' || arrow === true || arrow === 'both', index: idx };
    data.edges.push(edge);

    await writeGraph(graph, data);
    return { created: edge, index: idx };
  },

  async create_edges_batch({ graph, edges }) {
    const data = await readGraph(graph);
    if (!data) return { error: `图 "${graph}" 不存在。` };
    if (!edges || edges.length === 0) return { error: 'edges 数组不能为空。' };

    data.edges = data.edges || [];
    const created = [];
    const skipped = [];
    const existing = new Set(
      data.edges.map(e => {
        const s = typeof e.source === 'string' ? e.source : e.source?.id;
        const t = typeof e.target === 'string' ? e.target : e.target?.id;
        return s + '|' + t;
      })
    );

    for (const e of edges) {
      const { source, target, label = '', color = '#BFBFBF', lineStyle, arrow } = e;
      // 验证源和目标节点存在
      const srcNode = (data.nodes || []).find(n => n.id === source);
      const tgtNode = (data.nodes || []).find(n => n.id === target);
      if (!srcNode || !tgtNode) {
        skipped.push({ source, target, reason: `节点不存在: ${!srcNode ? source : target}` });
        continue;
      }
      const key = source + '|' + target;
      if (existing.has(key)) {
        skipped.push({ source, target, reason: '边已存在' });
        continue;
      }
      const edge = { source, target, label, color, lineStyle: lineStyle || 'solid', arrow: arrow === 'forward' || arrow === true || arrow === 'both', index: data.edges.length };
      data.edges.push(edge);
      existing.add(key);
      created.push(edge);
    }

    await writeGraph(graph, data);
    return { created, createdCount: created.length, skipped, skippedCount: skipped.length };
  },

  async delete_edge({ graph, edgeIndex }) {
    const data = await readGraph(graph);
    if (!data) return { error: `图 "${graph}" 不存在。` };
    if (edgeIndex < 0 || edgeIndex >= (data.edges || []).length) {
      return { error: `边索引 ${edgeIndex} 无效。共 ${(data.edges || []).length} 条边（索引 0～${(data.edges || []).length - 1}）。` };
    }
    const removed = data.edges.splice(edgeIndex, 1)[0];
    await writeGraph(graph, data);
    return { removed };
  },

  async update_edge({ graph, edgeIndex, ...updates }) {
    const data = await readGraph(graph);
    if (!data) return { error: `图 "${graph}" 不存在。` };
    if (edgeIndex < 0 || edgeIndex >= (data.edges || []).length) {
      return { error: `边索引 ${edgeIndex} 无效。共 ${(data.edges || []).length} 条边。` };
    }
    const edge = data.edges[edgeIndex];
    const allowed = ['label', 'color', 'lineStyle', 'arrow'];
    const changed = [];
    for (const k of allowed) {
      if (updates[k] !== undefined) {
        if (k === 'arrow' && typeof updates[k] === 'string') {
          edge[k] = updates[k] === 'forward' || updates[k] === 'both' || updates[k] === 'true' || updates[k] === true;
        } else {
          edge[k] = updates[k];
        }
        changed.push(k);
      }
    }
    if (changed.length === 0) return { error: '未提供任何有效更新字段。可更新: label, color, lineStyle, arrow' };
    await writeGraph(graph, data);
    return { ok: true, changed, edge };
  },

  async create_group({ graph, label, color = '#4488ff', borderColor, displayMode = 'fluid', opacity = 0.15, fluidRadius = 3, nodeColorMode, nodeColor, fluidOpacity }) {
    const data = await readGraph(graph);
    if (!data) return { error: `图 "${graph}" 不存在。` };
    const id = 'group-' + randomUUID().slice(0, 8);
    const group = {
      id, label, displayMode, color, opacity, fluidRadius,
      borderColor: borderColor || color,
      nodeColorMode: nodeColorMode || 'off',
      nodeColor: nodeColor || color,
      fluidOpacity: fluidOpacity ?? opacity,
    };
    data.groups = data.groups || [];
    data.groups.push(group);

    await writeGraph(graph, data);
    // 统计匹配此标签的节点数
    const matching = (data.nodes || []).filter(n => (n.tags || []).includes(label)).length;
    return { created: group, matchingNodes: matching, message: `有 ${matching} 个节点带有标签 "${label}"，将与分组关联。` };
  },

  async update_group({ graph, groupId, ...updates }) {
    const data = await readGraph(graph);
    if (!data) return { error: `图 "${graph}" 不存在。` };
    const idx = (data.groups || []).findIndex(g => g.id === groupId);
    if (idx === -1) return { error: `分组 "${groupId}" 不存在。可用 read_graph 查看所有分组的 ID。` };
    const group = data.groups[idx];
    const allowed = ['label', 'color', 'borderColor', 'displayMode', 'opacity', 'fluidRadius', 'nodeColorMode', 'nodeColor'];
    const changed = [];
    for (const k of allowed) {
      if (updates[k] !== undefined) { group[k] = updates[k]; changed.push(k); }
    }
    if (changed.length === 0) return { error: '未提供任何有效更新字段。' };
    await writeGraph(graph, data);
    // 如果改了 label，统计新匹配节点
    let matchingMsg = '';
    if (updates.label !== undefined) {
      const matching = (data.nodes || []).filter(n => (n.tags || []).includes(updates.label)).length;
      matchingMsg = `，${matching} 个节点匹配新标签`;
    }
    return { ok: true, changed, group, message: matchingMsg };
  },

  async delete_group({ graph, groupId }) {
    const data = await readGraph(graph);
    if (!data) return { error: `图 "${graph}" 不存在。` };
    const before = (data.groups || []).length;
    data.groups = (data.groups || []).filter(g => g.id !== groupId);
    if (data.groups.length === before) return { error: `分组 "${groupId}" 不存在。` };
    await writeGraph(graph, data);
    return { ok: true, message: `已删除分组，剩余 ${data.groups.length} 个分组。` };
  },

  async undo({ graph }) {
    const name = snapshotName(graph);
    const entry = undoStack.filter(e => e.graph === name).pop();
    if (!entry) return { error: `图 "${name}" 没有可撤销的操作。` };

    // 从栈中移除
    const idx = undoStack.lastIndexOf(entry);
    undoStack.splice(idx, 1);

    // 当前状态推入 redo
    const current = await readGraph(name);
    if (current) {
      redoStack.push({ graph: name, data: JSON.parse(JSON.stringify(current)) });
    }

    // 恢复旧状态（writeGraph 时禁用 undo 循环）
    await writeGraph(name, entry.data, { undo: false });
    return { ok: true, remainingUndo: undoStack.filter(e => e.graph === name).length, redoAvailable: redoStack.filter(e => e.graph === name).length };
  },

  async redo({ graph }) {
    const name = snapshotName(graph);
    const entry = redoStack.filter(e => e.graph === name).pop();
    if (!entry) return { error: `图 "${name}" 没有可重做的操作。` };

    const idx = redoStack.lastIndexOf(entry);
    redoStack.splice(idx, 1);

    // 当前状态推入 undo
    const current = await readGraph(name);
    if (current) {
      undoStack.push({ graph: name, data: JSON.parse(JSON.stringify(current)) });
    }

    await writeGraph(name, entry.data, { undo: false });
    return { ok: true, redoRemaining: redoStack.filter(e => e.graph === name).length, undoAvailable: undoStack.filter(e => e.graph === name).length };
  },

  async clear_undo({ graph }) {
    if (graph) {
      const name = snapshotName(graph);
      const before = undoStack.filter(e => e.graph === name).length + redoStack.filter(e => e.graph === name).length;
      for (let i = undoStack.length - 1; i >= 0; i--) { if (undoStack[i].graph === name) undoStack.splice(i, 1); }
      for (let i = redoStack.length - 1; i >= 0; i--) { if (redoStack[i].graph === name) redoStack.splice(i, 1); }
      return { ok: true, cleared: before };
    }
    const total = undoStack.length + redoStack.length;
    undoStack.length = 0;
    redoStack.length = 0;
    return { ok: true, cleared: total };
  },

  async import_media({ graph, nodeId, filePath }) {
    const data = await readGraph(graph);
    if (!data) return { error: `图 "${graph}" 不存在。` };
    const node = (data.nodes || []).find(n => n.id === nodeId);
    if (!node) return { error: `节点 "${nodeId}" 不存在。` };

    // 检查源文件
    if (!existsSync(filePath)) return { error: `文件不存在: ${filePath}` };

    const ext = extname(filePath).toLowerCase();
    const typeMap = {
      '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image', '.webp': 'image', '.svg': 'image', '.bmp': 'image',
      '.mp3': 'audio', '.wav': 'audio', '.ogg': 'audio', '.flac': 'audio', '.aac': 'audio', '.m4a': 'audio',
      '.mp4': 'video', '.webm': 'video', '.mov': 'video', '.avi': 'video', '.mkv': 'video',
    };
    const mediaType = typeMap[ext];
    if (!mediaType) return { error: `不支持的媒体格式: ${ext}。支持: ${Object.keys(typeMap).join(', ')}` };

    // 复制到 media 目录
    const mediaDir = dataPath('media', snapshotName(graph));
    if (!existsSync(mediaDir)) await mkdir(mediaDir, { recursive: true });
    const destName = `${nodeId}${ext}`;
    const destPath = join(mediaDir, destName);
    await copyFile(filePath, destPath);

    node.mediaUrl = destPath;
    node.mediaType = mediaType;
    await writeGraph(graph, data);
    return { ok: true, mediaType, mediaUrl: destPath, message: `已导入 ${mediaType} 文件到节点 "${node.label || nodeId}"` };
  },

  async get_stats({ graph }) {
    const data = await readGraph(graph);
    if (!data) return { error: `图 "${graph}" 不存在。` };
    const nodes = data.nodes || [];
    const edges = data.edges || [];
    const groups = data.groups || [];

    // 标签分布
    const tagCounts = {};
    const headingCounts = {};
    for (const n of nodes) {
      for (const t of (n.tags || [])) {
        tagCounts[t] = (tagCounts[t] || 0) + 1;
      }
      const hl = n.headingLevel || 1;
      headingCounts[hl] = (headingCounts[hl] || 0) + 1;
    }

    // 度分布
    const degree = {};
    for (const e of edges) {
      const s = typeof e.source === 'string' ? e.source : e.source?.id;
      const t = typeof e.target === 'string' ? e.target : e.target?.id;
      degree[s] = (degree[s] || 0) + 1;
      degree[t] = (degree[t] || 0) + 1;
    }

    const fixedCount = nodes.filter(n => n.fixed).length;
    const collapsedCount = nodes.filter(n => n.collapsed).length;

    return {
      graph,
      nodes: nodes.length,
      edges: edges.length,
      groups: groups.length,
      fixedNodes: fixedCount,
      collapsedNodes: collapsedCount,
      tagDistribution: tagCounts,
      headingLevels: headingCounts,
      mostConnected: Object.entries(degree)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([id, deg]) => {
          const n = nodes.find(nd => nd.id === id);
          return { id, label: n?.label || '?', degree: deg };
        }),
    };
  },

  async read_settings({ graph }) {
    const data = await readGraph(graph);
    if (!data) return { error: `图 "${graph}" 不存在。` };
    return {
      graph,
      settings: data.settings || {},
      defaults: {
        linkDist: 120, labelSize: 18, charge: -100, linkStr: 0.3,
        collideR: 10, centerS: 0.02, groupBound: 0.8,
        heatingTime: 2, alphaTarget: 0.3, editPanelOpacity: 0.9,
        useRAFL: true, nodeExpand: 8, lineExpand: 6,
        showGLabels: true, glMin: 10, glMax: 28,
        gridVis: true, gridMode: 'dot', axisVis: false, axisTicks: false,
        gridSp: 30, gridWidth: 0.5, gridSnap: false, partialGridSnap: false,
        graphTheme: 'nord-dark', focusMode: false, glowAppearance: true,
        nodeColorStyle: 'spectrum-narrow', fontFamily: '"SiYuan Songti", serif',
        ar: 0.75, layoutMode: 'default', categoryLayout: false,
        edgeColorGradient: false, edgeWidthByLevel: false, fixedHollow: false,
      },
    };
  },

  async update_settings({ graph, ...updates }) {
    const data = await readGraph(graph);
    if (!data) return { error: `图 "${graph}" 不存在。` };

    const validKeys = [
      'linkDist', 'labelSize', 'charge', 'linkStr', 'collideR',
      'centerS', 'groupBound', 'heatingTime', 'alphaTarget',
      'editPanelOpacity', 'useRAFL', 'nodeExpand', 'lineExpand',
      'showGLabels', 'glMin', 'glMax', 'gridVis', 'gridMode',
      'axisVis', 'axisTicks', 'gridSp', 'gridWidth', 'gridSnap',
      'partialGridSnap', 'graphTheme', 'focusMode', 'glowAppearance',
      'nodeColorStyle', 'fontFamily', 'ar', 'layoutMode',
      'categoryLayout', 'edgeColorGradient', 'edgeWidthByLevel',
      'fixedHollow',
    ];

    const unknownKeys = Object.keys(updates).filter(k => !validKeys.includes(k));
    if (unknownKeys.length > 0) {
      return { error: `未知的设置项: ${unknownKeys.join(', ')}。可用 read_settings 查看所有可配置项。` };
    }

    if (!data.settings) data.settings = {};
    const changed = [];
    for (const k of validKeys) {
      if (updates[k] !== undefined) {
        data.settings[k] = updates[k];
        changed.push(k);
      }
    }

    await writeGraph(graph, data);
    return { ok: true, changed };
  },

  async layout_nodes({ graph, mode = 'circle', spacing = 150 }) {
    const data = await readGraph(graph);
    if (!data) return { error: `图 "${graph}" 不存在。` };
    const nodes = data.nodes || [];
    if (nodes.length === 0) return { message: '图中没有节点。' };

    const cx = 400, cy = 300;
    if (mode === 'circle') {
      const radius = Math.max(spacing, nodes.length * spacing / (2 * Math.PI));
      nodes.forEach((n, i) => {
        const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
        n.x = Math.round(cx + radius * Math.cos(angle));
        n.y = Math.round(cy + radius * Math.sin(angle));
      });
    } else if (mode === 'grid') {
      const cols = Math.ceil(Math.sqrt(nodes.length));
      nodes.forEach((n, i) => {
        n.x = Math.round((i % cols) * spacing);
        n.y = Math.round(Math.floor(i / cols) * spacing);
      });
    } else if (mode === 'random') {
      nodes.forEach(n => {
        n.x = Math.round(Math.random() * 800);
        n.y = Math.round(Math.random() * 600);
      });
    }

    await writeGraph(graph, data);
    return { message: `已将 ${nodes.length} 个节点按 ${mode} 模式排列。`, mode, count: nodes.length };
  },

  // ---- 批量操作辅助 ----
  _filterNodes(nodes, { ids, tags, headingLevel, fixed, collapsed, labelContains, limit }) {
    let result = nodes;
    if (ids) {
      const idSet = new Set(ids);
      result = result.filter(n => idSet.has(n.id));
    }
    if (tags && tags.length > 0) {
      result = result.filter(n => (n.tags || []).some(t => tags.includes(t)));
    }
    if (headingLevel != null) {
      result = result.filter(n => (n.headingLevel || 1) === headingLevel);
    }
    if (fixed != null) {
      result = result.filter(n => (n.fixed || false) === fixed);
    }
    if (collapsed != null) {
      result = result.filter(n => (n.collapsed || false) === collapsed);
    }
    if (labelContains) {
      const q = labelContains.toLowerCase();
      result = result.filter(n => (n.label || '').toLowerCase().includes(q));
    }
    if (limit != null && limit > 0) {
      result = result.slice(0, limit);
    }
    return result;
  },

  async select_nodes({ graph, ...filters }) {
    const data = await readGraph(graph);
    if (!data) return { error: `图 "${graph}" 不存在。` };
    const matched = this._filterNodes(data.nodes || [], filters);
    return {
      count: matched.length,
      nodeIds: matched.map(n => n.id),
      nodes: matched.map(n => ({ id: n.id, label: n.label, tags: n.tags, headingLevel: n.headingLevel })),
    };
  },

  async update_nodes_batch({ graph, ids, tags, headingLevel, labelContains, ...updates }) {
    const data = await readGraph(graph);
    if (!data) return { error: `图 "${graph}" 不存在。` };
    const matched = this._filterNodes(data.nodes || [], { ids, tags, headingLevel, labelContains });
    if (matched.length === 0) return { message: '没有节点匹配筛选条件。' };

    const changed = [];
    for (const n of matched) {
      if (updates.setTags !== undefined) { n.tags = [...updates.setTags]; changed.push('setTags'); }
      if (updates.addTags !== undefined) {
        n.tags = [...new Set([...(n.tags || []), ...updates.addTags])];
        changed.push('addTags');
      }
      if (updates.removeTags !== undefined) {
        const removeSet = new Set(updates.removeTags);
        n.tags = (n.tags || []).filter(t => !removeSet.has(t));
        changed.push('removeTags');
      }
      if (updates.setHeadingLevel !== undefined) { n.headingLevel = updates.setHeadingLevel; changed.push('setHeadingLevel'); }
      if (updates.setColor !== undefined) { n.color = updates.setColor; changed.push('setColor'); }
      if (updates.setRadius !== undefined) { n.radius = updates.setRadius; changed.push('setRadius'); }
      if (updates.setNote !== undefined) { n.note = updates.setNote; changed.push('setNote'); }
      if (updates.setFixed !== undefined) {
        n.fixed = updates.setFixed;
        if (updates.setFixed) { n.fx = n.x; n.fy = n.y; } else { n.fx = null; n.fy = null; }
        changed.push('setFixed');
      }
      if (updates.setCollapsed !== undefined) { n.collapsed = updates.setCollapsed; changed.push('setCollapsed'); }
    }

    await writeGraph(graph, data);
    return { ok: true, matched: matched.length, changed: [...new Set(changed)], sampleIds: matched.slice(0, 5).map(n => n.id) };
  },

  async delete_nodes_batch({ graph, ids, tags, headingLevel, labelContains }) {
    const data = await readGraph(graph);
    if (!data) return { error: `图 "${graph}" 不存在。` };
    if (!ids && !tags && headingLevel == null && !labelContains) {
      return { error: '必须提供至少一个筛选条件: ids, tags, headingLevel, labelContains。如需全删，请用 delete_graph。' };
    }
    const matched = this._filterNodes(data.nodes || [], { ids, tags, headingLevel, labelContains });
    if (matched.length === 0) return { message: '没有节点匹配筛选条件。' };

    const removeIds = new Set(matched.map(n => n.id));
    const beforeEdges = (data.edges || []).length;
    data.nodes = (data.nodes || []).filter(n => !removeIds.has(n.id));
    data.edges = (data.edges || []).filter(e => {
      const s = typeof e.source === 'string' ? e.source : e.source?.id;
      const t = typeof e.target === 'string' ? e.target : e.target?.id;
      return !removeIds.has(s) && !removeIds.has(t);
    });

    await writeGraph(graph, data);
    return { ok: true, deletedNodes: matched.length, deletedEdges: beforeEdges - data.edges.length };
  },

  async copy_nodes({ graph, ids, offsetX = 50, offsetY = 50 }) {
    const data = await readGraph(graph);
    if (!data) return { error: `图 "${graph}" 不存在。` };
    const sourceNodes = (data.nodes || []).filter(n => ids.includes(n.id));
    if (sourceNodes.length === 0) return { error: '没有找到指定的节点。' };
    const missing = ids.filter(id => !sourceNodes.find(n => n.id === id));
    if (missing.length > 0) return { error: `以下节点不存在: ${missing.join(', ')}` };

    // 生成新 ID 映射
    const idMap = {};
    const newNodeIds = [];
    for (const n of sourceNodes) {
      const newId = n.id.replace(/-\w{6}$/, '') + '-' + randomUUID().slice(0, 6);
      idMap[n.id] = newId;
      newNodeIds.push(newId);
    }

    // 复制节点（偏移坐标）
    const newNodes = sourceNodes.map(n => ({
      ...JSON.parse(JSON.stringify(n)),
      id: idMap[n.id],
      x: (n.x || 0) + offsetX,
      y: (n.y || 0) + offsetY,
      fx: n.fx != null ? (n.fx + offsetX) : null,
      fy: n.fy != null ? (n.fy + offsetY) : null,
      _createdAt: performance.now(),
    }));

    // 复制副本之间的边
    const sourceSet = new Set(ids);
    const targetSet = new Set(newNodeIds);
    const newEdges = (data.edges || [])
      .filter(e => {
        const s = typeof e.source === 'string' ? e.source : e.source?.id;
        const t = typeof e.target === 'string' ? e.target : e.target?.id;
        return sourceSet.has(s) && sourceSet.has(t);
      })
      .map(e => {
        const s = typeof e.source === 'string' ? e.source : e.source?.id;
        const t = typeof e.target === 'string' ? e.target : e.target?.id;
        return { ...JSON.parse(JSON.stringify(e)), source: idMap[s], target: idMap[t] };
      });

    data.nodes = (data.nodes || []).concat(newNodes);
    data.edges = (data.edges || []).concat(newEdges);
    await writeGraph(graph, data);

    return {
      ok: true,
      copiedNodes: sourceNodes.length,
      copiedEdges: newEdges.length,
      idMap,
      message: `已复制 ${sourceNodes.length} 个节点（${newEdges.length} 条内部边），偏移 (${offsetX}, ${offsetY})`,
    };
  },
};

// ---- MCP 协议处理 ----
const SERVER_NAME = 'nodespace-mcp';
const SERVER_VERSION = '0.1.0';

function handleRequest(req) {
  const { id, method, params } = req;

  if (method === 'initialize') {
    return send({
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      },
    });
  }

  if (method === 'notifications/initialized') {
    // 客户端通知初始化完成，无需响应
    return;
  }

  if (method === 'tools/list') {
    return send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params || {};
    const handler = handlers[name];
    if (!handler) {
      return send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown tool: ${name}` } });
    }
    // 刷新数据目录（与用户当前打开的文件夹同步）
    refreshDataDir();
    // 同一图的工具调用串行化：先到先执行，后续排队（防止并发读→改→写导致数据丢失）
    const graphKey = args?.graph || args?.name || args?.oldName || '_global';
    const prevLock = _writeLocks.get(graphKey) || Promise.resolve();
    let lockResolve;
    const nextLock = new Promise(r => { lockResolve = r; });
    _writeLocks.set(graphKey, nextLock);

    prevLock.then(() => {
      return Promise.resolve(handler(args || {}));
    }).then(result => {
      const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } });
    }).catch(err => {
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true } });
    }).finally(() => {
      lockResolve();
    });
    return;
  }

  // Unknown method
  send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
}

// ---- 主循环 ----
function main() {
  // 确保数据目录存在
  if (!existsSync(DATA_DIR)) {
    mkdir(DATA_DIR, { recursive: true }).catch(() => {});
  }

  log(`[NodeSpace MCP] Data dir: ${DATA_DIR}`);
  log(`[NodeSpace MCP] Ready, waiting for commands on stdin...`);

  const rl = createInterface({ input: process.stdin, terminal: false });
  rl.on('line', (line) => {
    line = line.trim();
    if (!line) return;
    try {
      const req = JSON.parse(line);
      handleRequest(req);
    } catch (e) {
      log(`[NodeSpace MCP] Parse error: ${e.message}`);
    }
  });

  process.stdin.on('end', () => {
    // 等待所有正在执行的图操作完成后才退出
    const pending = [..._writeLocks.values()];
    Promise.all(pending).then(() => {
      log('[NodeSpace MCP] Shutdown.');
      process.exit(0);
    });
  });
}

main();
