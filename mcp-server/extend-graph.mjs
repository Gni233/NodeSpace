import { readFileSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { resolve } from 'path';

const requestedFile = process.argv[2];
if (!requestedFile) {
  console.error('Usage: node mcp-server/extend-graph.mjs <graph-file.json>');
  process.exit(1);
}
const fp = resolve(requestedFile);
const data = JSON.parse(readFileSync(fp, 'utf8'));

function genId(label) {
  const short = label.replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fff\-]/g, '').slice(0, 30);
  return short + '-' + randomUUID().slice(0, 6);
}

function addNode(parentId, label, hl, note, px, py, tags) {
  const id = genId(label);
  const angle = Math.random() * 2 * Math.PI;
  const dist = 55 + Math.random() * 50;
  return {
    node: {
      id,
      label,
      headingLevel: hl,
      x: px + Math.cos(angle) * dist,
      y: py + Math.sin(angle) * dist,
      tags: [...(tags || [])],
      note: note || '',
      collapsed: hl >= 3,
      fixed: false, fx: null, fy: null,
      _isNew: false, mediaType: null, mediaUrl: null, radiusMode: 'level',
    },
    edge: { source: parentId, target: id, label: '', color: '#BFBFBF', arrow: false, lineStyle: 'solid' },
    id,
  };
}

// ============ 完整 L3→L10 扩展定义 ============

// Phase1: L3 → L4 (所有 L3 叶子节点的直接子节点)
const L3_TO_L4 = {
  // ── 渲染引擎 ──
  'pixi-app': [
    { l: 'Application.init', n: '初始化 PixiJS WebGL 应用' },
    { l: 'Viewport 视口', n: 'pixi-viewport 缩放平移拖拽' },
    { l: '6层容器', n: 'grid→group→edge→blob→node→label' },
    { l: 'WebGL Context', n: 'webglcontextlost/restored 恢复' },
    { l: 'resolution适配', n: 'devicePixelRatio 高清渲染' },
  ],
  'pixi-nodes': [
    { l: 'createNodeSprite', n: '创建圆形节点 + 标签文本' },
    { l: 'getSpectrumColor', n: '六级色相 137.5° 黄金角' },
    { l: 'getHeadingColor', n: '基于强调色的明度渐变' },
    { l: 'NodeVisualState', n: '选中/固定/聚焦/折叠等视觉状态' },
  ],
  'pixi-edges': [
    { l: 'updateEdges', n: '全量重绘所有边' },
    { l: '线型渲染', n: 'solid/dash/dash-2/dash-3' },
    { l: '箭头绘制', n: 'forward/reverse/both/none' },
    { l: '颜色渐变', n: 'edgeColorGradient 渐变模式' },
  ],
  'pixi-groups': [
    { l: 'updateGroups', n: '绘制流体/轮廓分组背景' },
    { l: '流体区域', n: 'fluid 模式凸包包围' },
    { l: '分组标签', n: 'glMin/glMax 自适应字号' },
  ],
  'pixi-grid': [
    { l: 'updateGrid', n: '绘制网格/点阵/坐标轴' },
    { l: 'dot 点阵', n: 'gridMode=dot 圆点网格' },
    { l: 'line 线条', n: 'gridMode=line 实线网格' },
    { l: '坐标轴', n: 'axisVis/axisTicks 轴线刻度' },
  ],
  'pixi-viewport': [
    { l: 'drag 拖拽', n: '鼠标拖拽平移画布' },
    { l: 'wheel 滚轮', n: '滚轮缩放' },
    { l: 'pinch 双指', n: '触屏双指缩放' },
    { l: 'decelerate 惯性', n: '拖拽释放后惯性滑行' },
    { l: 'clampZoom', n: '缩放范围 0.1-4x' },
  ],

  // ── 力导向模拟 ──
  'graph-sim': [
    { l: 'initSim', n: '初始化 d3 forceSimulation' },
    { l: 'setDragNode', n: '设置当前拖拽节点' },
    { l: 'wrappedTick', n: '每帧注入粘滞力 + 拖拽效果' },
    { l: 'heatTimer', n: 'heatingTime 秒后 alphaTarget=0' },
    { l: 'updateCenter', n: '重新设置中心力' },
  ],
  'simulation': [
    { l: 'forceLink', n: 'd3.forceLink 边弹簧力' },
    { l: 'forceManyBody', n: 'd3.forceManyBody 电荷斥力' },
    { l: 'forceCollide', n: 'd3.forceCollide 碰撞避免' },
    { l: 'forceCenter', n: 'd3.forceCenter(0,0) 居中约束' },
    { l: 'forceRadial', n: 'd3.forceRadial 径向约束' },
    { l: 'fix-collide', n: '固定节点排斥力（自定义力）' },
  ],

  // ── 文件系统 ──
  'file-adapter': [
    { l: 'FileAdapter 接口', n: '统一 6 方法跨平台 I/O' },
    { l: 'Result<T> 类型', n: 'ok(value)/err(message) 永不 throw' },
    { l: '5平台实现', n: 'FSA/Electron/Capacitor/SAF/Storage' },
  ],
  'file-system': [
    { l: 'openFolder', n: 'showDirectoryPicker 选择文件夹' },
    { l: 'readGraphFile', n: '递归读取 JSON 文件' },
    { l: 'writeGraphFile', n: 'createWritable 写入文件' },
    { l: 'validateFileName', n: '路径穿越防护 .. / \\' },
    { l: 'listFileTree', n: '递归列目录+JSON文件' },
  ],
  'fs-electron': [
    { l: 'IPC 通信', n: 'contextBridge 暴露 electronAPI' },
    { l: 'getConfigPath', n: 'app.getPath(userData) 配置路径' },
    { l: '文件变更监听', n: 'fs.watch 外部文件变更通知' },
  ],
  'fs-mobile': [
    { l: 'Capacitor Filesystem', n: '@capacitor/filesystem 插件' },
    { l: 'importFiles', n: '导入外部文件到图数据' },
    { l: 'pickDirectory', n: '选择目录导入所有 JSON' },
  ],
  'fs-harmony': [
    { l: 'localStorage 后备', n: '鸿蒙不支持 FSA API 时的回退' },
    { l: 'SAF 桥接', n: '通过 saf-bridge 间接访问文件' },
  ],
  'saf-bridge': [
    { l: 'SAF 权限', n: 'Android Storage Access Framework' },
    { l: 'URI 转换', n: 'content:// URI 转文件路径' },
    { l: 'safPickDirectory', n: 'SAF 目录选择器' },
  ],
  'folder-store': [
    { l: 'IndexedDB', n: 'nodespace-folders 数据库' },
    { l: 'saveFolderHandle', n: '持久化 FileSystemDirectoryHandle' },
    { l: 'loadFolderHandle', n: '恢复上次打开的文件夹' },
  ],

  // ── 桌面端 ──
  'main.cjs': [
    { l: 'BrowserWindow', n: '创建无边框窗口' },
    { l: 'IPC 处理', n: '文件读写/窗口控制/文件监听' },
    { l: '菜单栏', n: '自定义应用菜单' },
    { l: 'MCP Server 集成', n: '内嵌 MCP 协议服务端' },
  ],
  'preload.cjs': [
    { l: 'contextBridge', n: '安全暴露 API 到渲染进程' },
    { l: 'electronAPI', n: '窗口控制+文件操作+IPC' },
  ],

  // ── 移动端 ──
  'fs-mobile-cap': [
    { l: 'Filesystem API', n: 'readFile/writeFile/mkdir' },
    { l: '导入导出', n: 'JSON 文件导入导出流程' },
  ],
  'capacitor.config': [
    { l: 'appId', n: 'com.nodespace.app' },
    { l: 'plugins', n: 'Filesystem/FilePicker 插件配置' },
    { l: 'server', n: '开发服务器 url 配置' },
  ],

  // ── UI 交互（L3→L4）──
  'ui-sidebar': [
    { l: '文件树渲染', n: '递归目录 + JSON 文件列表' },
    { l: '侧边栏折叠', n: 'sidebarExpandedLeft/sidebarCollapsedLeft' },
    { l: '新建/删除/重命名', n: '文件右键菜单操作' },
  ],
  'ui-tabs': [
    { l: 'createTabBar', n: '标签栏 UI 组件' },
    { l: '标签切换', n: 'onSwitchTab 切换并保存' },
    { l: '关闭标签', n: 'onCloseTab 关闭+清理' },
    { l: '分屏标签', n: 'onSplitTab 创建分屏' },
  ],
  'ui-edit': [
    { l: '节点编辑面板', n: 'label/headingLevel/tags/note' },
    { l: '边编辑', n: 'source/target/label/color/lineStyle' },
    { l: '分组编辑', n: 'displayMode/color/opacity/fluidRadius' },
    { l: '属性面板', n: 'editPanelOpacity 可调' },
  ],
  'ui-settings': [
    { l: '模拟参数', n: 'charge/linkDist/collideR 等' },
    { l: '视觉参数', n: 'theme/focusMode/glow/colorStyle' },
    { l: '网格参数', n: 'gridVis/gridMode/gridSp/gridSnap' },
  ],
  'ui-contextmenu': [
    { l: '右键菜单', n: 'showContextMenu 弹出菜单' },
    { l: '新建节点', n: '空白处右键创建节点' },
    { l: '删除节点', n: '节点右键删除' },
    { l: '节点操作', n: '复制/粘贴/固定/链接' },
  ],
  'shared-state': [
    { l: 'focusMode', n: '专注模式高亮选中' },
    { l: 'hoverNodeId', n: '当前悬停节点 ID' },
    { l: 'selectedNodeIds', n: '多选节点 ID 列表' },
    { l: 'nodeClipboard', n: '跨图复制粘贴剪贴板' },
    { l: 'rightDragLink', n: '右键拖拽连线临时状态' },
  ],
  'theme': [
    { l: 'ThemeConfig', n: '8 色主题配置接口' },
    { l: '30+ THEMES', n: 'nord/solarized/dracula/gruvbox...' },
    { l: 'applyThemeVars', n: 'CSS 变量注入 body' },
    { l: 'getAccentColors', n: '从 CSS 提取强调色/警告色' },
  ],
  'pane-manager': [
    { l: 'PaneState', n: '每窗格独立状态对象' },
    { l: 'Proxy 代理', n: '$ 自动路由到焦点窗格' },
    { l: 'drawAll', n: '统一循环渲染所有窗格' },
    { l: '惰性加载', n: '分屏时按需创建 pixi/sim' },
  ],
  'undo-redo': [
    { l: 'pushSnapshot', n: 'structuredClone 深拷贝快照' },
    { l: 'undo', n: '弹出栈顶恢复旧状态' },
    { l: 'redo', n: '重做被撤销的操作' },
    { l: 'MAX_STACK=50', n: '最多保存 50 步历史' },
  ],
};

// Phase2: L4→L5 对关键节点继续扩展
const L4_TO_L5 = {
  'Application.init': [
    { l: 'preference: webgl', n: 'WebGL 渲染后端' },
    { l: 'resizeTo', n: '自适应容器尺寸' },
    { l: 'resolution: dpr', n: 'devicePixelRatio 高清' },
    { l: 'backgroundAlpha: 0', n: '透明背景' },
  ],
  'Viewport 视口': [
    { l: 'screenWidth/Height', n: '屏幕尺寸匹配' },
    { l: 'worldWidth/Height', n: '世界坐标范围 3000x2000' },
    { l: '原点居中', n: 'position.set(cw/2, ch/2)' },
  ],
  '6层容器': [
    { l: 'gridLayer', n: '网格层（最底层）' },
    { l: 'edgeLayer', n: '边层' },
    { l: 'nodeLayer', n: '节点层' },
    { l: 'labelLayer', n: '标签层（最顶层）' },
  ],
  'getSpectrumColor': [
    { l: 'HSL→RGB 转换', n: '色相/饱和度/亮度→RGB' },
    { l: '137.5° 黄金角', n: '各主题间色差明显' },
    { l: '六级色阶', n: 'h1(hue-240°)→h6(hue)' },
  ],
  'wrappedTick': [
    { l: 'VISCOUS_RADIUS=150', n: '粘滞半径常量' },
    { l: 'VISCOUS_STRENGTH=0.015', n: '粘滞强度系数' },
    { l: '速度衰减', n: 'n.vx-=n.vx*0.02 阻尼' },
  ],
  'forceLink': [
    { l: 'linkDist 距离', n: '边的理想长度' },
    { l: 'linkStr 强度', n: '弹簧劲度系数 0-1' },
    { l: 'id 访问器', n: '.id(d=>d.id) 节点标识' },
  ],
  'forceManyBody': [
    { l: 'charge 电荷', n: '负值=排斥，默认-100' },
    { l: 'fixed 节点豁免', n: '固定节点不受力' },
  ],
  'forceCollide': [
    { l: 'collideR 半径', n: '碰撞半径，防重叠' },
    { l: '空间哈希网格', n: '100px 格子分桶加速' },
  ],
  'fix-collide': [
    { l: 'grid 分桶', n: 'cellSize=100 空间哈希' },
    { l: 'fixed-fixed 跳过', n: '两个固定节点不互斥' },
    { l: 'free-fixed 排斥', n: '自由节点被固定节点推开' },
  ],
  'Result<T> 类型': [
    { l: 'ok(value)', n: '成功返回包装' },
    { l: 'err(message)', n: '错误返回包装' },
  ],
  'validateFileName': [
    { l: '禁止 ..', n: '路径穿越防护' },
    { l: '禁止 / 和 \\', n: '跨目录攻击防护' },
  ],
  'IPC 通信': [
    { l: 'ipcMain.handle', n: '主进程处理请求' },
    { l: 'ipcRenderer.invoke', n: '渲染进程调用' },
  ],
  'Capacitor Filesystem': [
    { l: 'Directory.Data', n: '应用私有数据目录' },
    { l: 'Encoding.UTF8', n: 'UTF-8 文本编码' },
  ],
  'BrowserWindow': [
    { l: 'frame: false', n: '无边框窗口' },
    { l: 'webPreferences', n: 'preload/nodeIntegration' },
  ],
  'contextBridge': [
    { l: 'exposeInMainWorld', n: '暴露 API 到 window' },
    { l: '安全隔离', n: '渲染进程无法直接访问 Node' },
  ],
  '30+ THEMES': [
    { l: '暗色主题', n: 'nord-dark/dracula/tokyo-night/amoled...' },
    { l: '亮色主题', n: 'atom-light/solarized-light/everforest-light...' },
  ],
  'Proxy 代理': [
    { l: 'get 拦截', n: '自动读取焦点窗格属性' },
    { l: 'set 拦截', n: '自动写入焦点窗格' },
  ],
  'pushSnapshot': [
    { l: 'structuredClone', n: '深拷贝 nodes/edges/groups' },
    { l: 'redo 清空', n: '新操作清空 redo 栈' },
  ],
  // 力导向模拟继续
  'initSim': [
    { l: 'simulation.stop()', n: '停止旧模拟' },
    { l: 'alpha(1).restart()', n: '以最高能量重启' },
    { l: 'alphaTarget', n: '目标衰减值' },
  ],
  'setDragNode': [
    { l: 'dragNodeId 引用', n: '当前拖拽节点 ID' },
  ],
  // 文件系统继续
  'openFolder': [
    { l: 'showDirectoryPicker', n: 'mode: readwrite' },
    { l: 'AbortError', n: '用户取消选择' },
  ],
  'readGraphFile': [
    { l: 'getDirectoryHandle', n: '递归进入子目录' },
    { l: 'getFileHandle', n: '获取文件句柄' },
    { l: 'file.text()', n: '读取文本内容' },
  ],
  'writeGraphFile': [
    { l: 'createWritable', n: '创建可写流' },
    { l: 'writable.write()', n: '写入 JSON 字符串' },
    { l: 'writable.close()', n: '关闭释放锁' },
  ],
  // 桌面端继续
  'IPC 处理': [
    { l: 'read-file', n: 'fs.readFile 读 JSON' },
    { l: 'write-file', n: 'fs.writeFile 写 JSON' },
    { l: 'watch-file', n: 'fs.watch 文件变更' },
  ],
};

// Phase3: L5→L6
const L5_TO_L6 = {
  '137.5° 黄金角': [
    { l: 'HSL 色相偏移', n: 'baseHue + 137.5° % 360' },
    { l: '六等分渐变', n: 't × 240° 跨距' },
  ],
  'VISCOUS_RADIUS=150': [
    { l: 'dist < 150 检测', n: '距离小于阈值时激活' },
    { l: '1-dist/150 比例', n: '越近粘滞力越大' },
  ],
  'VISCOUS_STRENGTH=0.015': [
    { l: 'n.vx += dx*force', n: '直接修改节点速度' },
    { l: 'n.vy += dy*force', n: 'Y方向同步修改' },
  ],
  'grid 分桶': [
    { l: 'cellSize=100', n: '100px 网格单元' },
    { l: '九宫格扫描', n: 'dx,dy ∈ {-1,0,1} × 3' },
  ],
  'HSL→RGB 转换': [
    { l: 'chroma 计算', n: 'c = (1-|2L-1|)×S' },
    { l: '六段映射', n: 'hue 按 60° 分段取色' },
  ],
  'charge 电荷': [
    { l: '负值排斥', n: 'charge=-100 节点互相推开' },
    { l: '固定节点豁免', n: 'fixed ? 0 : charge' },
  ],
  'initSim': [
    { l: 'alpha(1)', n: '满能量开始' },
    { l: 'restart()', n: '重新启动模拟' },
  ],
  'showDirectoryPicker': [
    { l: 'mode: readwrite', n: '读写权限' },
  ],
  'createWritable': [
    { l: 'FileSystemWritableFileStream', n: '可写文件流' },
  ],
  'exposeInMainWorld': [
    { l: 'electronAPI', n: 'window.electronAPI' },
  ],
  '暗色主题': [
    { l: 'nord-dark', n: '#2E3440 背景' },
    { l: 'dracula', n: '#282A36 背景' },
  ],
};

// Phase4: L6→L7
const L6_TO_L7 = {
  'dist < 150 检测': [
    { l: '欧几里得距离', n: 'sqrt(dx² + dy²)' },
    { l: '提前返回', n: 'dist < 1 跳过（除零保护）' },
  ],
  '1-dist/150 比例': [
    { l: '线性衰减', n: '力 ∝ (1 - dist/R)' },
    { l: '最大力 0.015', n: 'dist=0 时达到最大值' },
  ],
  'n.vx += dx*force': [
    { l: '方向向量', n: 'dx = dragNode.x - n.x' },
    { l: '力方向', n: '周围节点被拖向拖拽节点' },
  ],
  '九宫格扫描': [
    { l: '9 个相邻格子', n: '(cx±1, cy±1) × 3×3' },
    { l: '碰撞推离', n: '距离<minGap 时推远' },
  ],
  'chroma 计算': [
    { l: 'saturation=0.62', n: '固定饱和度' },
    { l: 'lightness 渐变', n: '0.42→0.58 (暗色)' },
  ],
  'nord-dark': [
    { l: 'canvas #2E3440', n: '深蓝灰画布' },
    { l: 'accent #5B8FF9', n: '蓝色强调' },
  ],
  'alpha(1)': [
    { l: 'alpha 冷却', n: 'alphaTarget 控制最终能量' },
    { l: 'heatingTime', n: '预热秒数后 alphaTarget=0' },
  ],
  'restart()': [
    { l: '重启模拟循环', n: '重新开始 tick 迭代' },
  ],
};

// Phase5: L7→L8
const L7_TO_L8 = {
  '欧几里得距离': [
    { l: 'Math.hypot(dx, dy)', n: '内置 hypot 函数优化' },
  ],
  '线性衰减': [
    { l: '比例系数 ∈ [0,1]', n: 'dist=150→ratio=0, dist=0→ratio=1' },
  ],
  '方向向量': [
    { l: 'dragNode.x - n.x', n: '从节点指向拖拽源' },
  ],
  'alpha 冷却': [
    { l: 'alphaTarget(0)', n: '目标能量为 0，逐步衰减' },
  ],
  'canvas #2E3440': [
    { l: 'Nord 极夜调色板', n: '著名暗色主题配色' },
  ],
  'saturation=0.62': [
    { l: '中高饱和度', n: '颜色鲜明但不刺眼' },
  ],
  'heatingTime': [
    { l: '默认 2 秒', n: 'setTimeout 延迟关闭加热' },
  ],
};

// Phase6: L8→L9
const L8_TO_L9 = {
  'Math.hypot(dx, dy)': [
    { l: 'ES2015 内置', n: '比手动 sqrt 更精确' },
  ],
  '比例系数 ∈ [0,1]': [
    { l: 'clamp 操作', n: 'Math.max(0, Math.min(1, ratio))' },
  ],
  'alphaTarget(0)': [
    { l: 'tick 结束条件', n: 'alpha < alphaTarget 时结束' },
  ],
  'Nord 极夜调色板': [
    { l: '4 级灰度背景', n: 'nord0→nord3 由深到浅' },
  ],
  '中高饱和度': [
    { l: 'HSL 色彩空间', n: 'Hue Saturation Lightness' },
  ],
};

// Phase7: L9→L10
const L9_TO_L10 = {
  'clamp 操作': [
    { l: '安全边界', n: '防止 NaN/Infinity 溢出' },
  ],
  'tick 结束条件': [
    { l: 'simulation.stop()', n: '手动停止模拟' },
  ],
  '4 级灰度背景': [
    { l: '#2E3440→#ECEFF4', n: '从极夜到极昼' },
  ],
  'HSL 色彩空间': [
    { l: 'H:0-360 S:0-1 L:0-1', n: '比 RGB 更语义化' },
  ],
};

// ============ 执行扩展 ============

function expand(nodes, edges, parentLabel, map, parentHL) {
  const entries = map[parentLabel];
  if (!entries) return [];
  const parent = nodes.find(n => n.label === parentLabel);
  if (!parent) return [];
  const results = [];
  for (const e of entries) {
    const hl = parentHL + 1;
    const r = addNode(parent.id, e.l, hl, e.n, parent.x, parent.y, parent.tags);
    results.push({ node: r.node, edge: r.edge, id: r.id, label: e.l });
    nodes.push(r.node);
    edges.push(r.edge);
  }
  return results;
}

let totalNew = 0;

// 1) L3→L4 全部覆盖
console.log('Phase 1: L3 → L4');
for (const [label, children] of Object.entries(L3_TO_L4)) {
  const parent = data.nodes.find(n => n.label === label);
  if (!parent) { console.log('  SKIP (not found):', label); continue; }
  for (const ch of children) {
    const r = addNode(parent.id, ch.l, 4, ch.n, parent.x, parent.y, parent.tags);
    data.nodes.push(r.node);
    data.edges.push(r.edge);
    totalNew++;
  }
  console.log('  OK:', label, '→', children.length, 'children');
}

// 2) L4→L5
console.log('Phase 2: L4 → L5');
for (const [label, children] of Object.entries(L4_TO_L5)) {
  const parent = data.nodes.find(n => n.label === label);
  if (!parent) continue;
  for (const ch of children) {
    const r = addNode(parent.id, ch.l, 5, ch.n, parent.x, parent.y, parent.tags);
    data.nodes.push(r.node);
    data.edges.push(r.edge);
    totalNew++;
  }
}

// 3) L5→L6
console.log('Phase 3: L5 → L6');
for (const [label, children] of Object.entries(L5_TO_L6)) {
  const parent = data.nodes.find(n => n.label === label);
  if (!parent) continue;
  for (const ch of children) {
    const r = addNode(parent.id, ch.l, 6, ch.n, parent.x, parent.y, parent.tags);
    data.nodes.push(r.node);
    data.edges.push(r.edge);
    totalNew++;
  }
}

// 4) L6→L7
console.log('Phase 4: L6 → L7');
for (const [label, children] of Object.entries(L6_TO_L7)) {
  const parent = data.nodes.find(n => n.label === label);
  if (!parent) continue;
  for (const ch of children) {
    const r = addNode(parent.id, ch.l, 7, ch.n, parent.x, parent.y, parent.tags);
    data.nodes.push(r.node);
    data.edges.push(r.edge);
    totalNew++;
  }
}

// 5) L7→L8
console.log('Phase 5: L7 → L8');
for (const [label, children] of Object.entries(L7_TO_L8)) {
  const parent = data.nodes.find(n => n.label === label);
  if (!parent) continue;
  for (const ch of children) {
    const r = addNode(parent.id, ch.l, 8, ch.n, parent.x, parent.y, parent.tags);
    data.nodes.push(r.node);
    data.edges.push(r.edge);
    totalNew++;
  }
}

// 6) L8→L9
console.log('Phase 6: L8 → L9');
for (const [label, children] of Object.entries(L8_TO_L9)) {
  const parent = data.nodes.find(n => n.label === label);
  if (!parent) continue;
  for (const ch of children) {
    const r = addNode(parent.id, ch.l, 9, ch.n, parent.x, parent.y, parent.tags);
    data.nodes.push(r.node);
    data.edges.push(r.edge);
    totalNew++;
  }
}

// 7) L9→L10
console.log('Phase 7: L9 → L10');
for (const [label, children] of Object.entries(L9_TO_L10)) {
  const parent = data.nodes.find(n => n.label === label);
  if (!parent) continue;
  for (const ch of children) {
    const r = addNode(parent.id, ch.l, 10, ch.n, parent.x, parent.y, parent.tags);
    data.nodes.push(r.node);
    data.edges.push(r.edge);
    totalNew++;
  }
}

// 写入
writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');

console.log('\n=== DONE ===');
console.log('New nodes added:', totalNew);
console.log('Max headingLevel:', Math.max(...data.nodes.map(n => n.headingLevel || 1)));
console.log('Total:', data.nodes.length, 'nodes,', data.edges.length, 'edges');

const lvlCount = {};
for (const n of data.nodes) {
  const l = n.headingLevel || 1;
  lvlCount[l] = (lvlCount[l] || 0) + 1;
}
console.log('Levels:', JSON.stringify(lvlCount));
