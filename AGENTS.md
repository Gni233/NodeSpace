# NodeSpace

跨平台节点图可视化/笔记应用。默认使用确定性的语义自动布局，D3.js 力导向作为可选布局；PixiJS 8 WebGL 渲染，Electron 桌面 + Capacitor Android。

## MCP Server

项目自带 MCP Server，Agent 可通过 MCP 协议直接读写 `.json` 图文件。

路径：`mcp-server/server.js`
数据目录默认：`~/Documents/NodeSpace`，可通过 `--dir` 或环境变量 `NODESPACE_DATA_DIR` 指定。

当桌面应用打开的是 Obsidian Vault 时，应用、Vite 开发服务和按应用配置启动的 MCP Server 共用用户选择的图专用文件夹；新资料库默认为 `./NodeSpace`。Vault 中的 Markdown 与附件只作为只读来源投影，不当作图 JSON 改写。

详细用法见 `mcp-server/AGENT_INSTRUCTIONS.md`。

快速示例（用 `--dir` 指定数据目录）：
```
node mcp-server/server.js --dir D:/Notes/NodeSpace
```

然后通过 MCP 工具操作图：
- `list_graphs` / `read_graph` / `create_graph` / `delete_graph`
- `create_node` / `create_nodes_batch` / `update_node` / `delete_node`
- `create_edge` / `update_edge` / `delete_edge`
- `create_group` / `update_group` / `delete_group`
- `search_nodes` / `get_stats` / `layout_nodes`
- `read_settings` / `update_settings` / `read_node_context`
- `undo` / `redo`

## 直接改 JSON

MCP 工具本质就是读写 JSON，也可以直接写脚本处理：

```js
const data = JSON.parse(readFileSync('D:/Notes/NodeSpace/实例1.json', 'utf8'));
// ...增删节点/边...
writeFileSync('D:/Notes/NodeSpace/实例1.json', JSON.stringify(data, null, 2));
```

图文件结构：`{ nodes: [...], edges: [...], groups: [...], settings: {...} }`

节点字段：id, label, x, y, headingLevel(1-6), tags[], note, resourceRef（Vault 引用卡片）, color, radius, fixed, collapsed
边字段：source(id), target(id), label, color, lineStyle, arrow
分组字段：id, label(匹配节点tags), displayMode, color, opacity

已有扩展脚本：`mcp-server/extend-graph.mjs`（用于补全图的层级深度）
