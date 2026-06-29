# NodeSpace

纯前端图可视化笔记应用。**PixiJS WebGL 渲染 + D3 力导向布局**，零后端依赖，双击 `dist/index.html` 即可运行。

## 设计理念

线性的语言构成线性的思考。受工作记忆容量限制，思维需要留存于纸或屏幕。现有工具未充分利用二维平面辅助发散思维——由此出发，构建基于节点网络的笔记工具。

### 核心元素

| 层次 | 内容 |
|------|------|
| 界面 | 图区、文件树、操作栏、编辑栏、图区自定义、应用设置 |
| 元素 | 节点、边、集合 |
| 视觉 | 颜色、大小（六级等级）、形状、26 套主题 |

## 快速开始

```bash
npm install
npm run build
```

产物在 `dist/` 文件夹，双击 `dist/index.html` 或用任意静态服务即可运行。

## 功能亮点

- **丰富交互**：选中、增删、拖拽、框选、右键拖拽连线、快捷键（Tab 新建子节点、Ctrl+T 新建图、N 新建节点）
- **深度编辑**：节点名称/备注/标签/颜色/等级/半径，边标签/颜色/箭头/线型，集合五模式样式
- **数据持久化**：localStorage 多图隔离（`fg-data-{name}`），FileSystemAccess 磁盘读写，300ms 防抖批量保存
- **多媒体嵌入**：图片/音视频/Markdown 文档，悬停预览，右键打开
- **细致美化**：26 套主题、渐变连线（颜色+线宽）、六级节点视觉、玻璃拟态 UI、点线网格、折叠展开动画
- **分屏系统**：同文件两屏共享 graph 引用，独立 viewport，实时同步

## 数据架构

```
数据                 模拟                渲染
graph.nodes/edges  →  d3-force-simulation  →  PixiJS (WebGL)
     ↑                                        ↓
  localStorage                         scheduleSave()
  FileSystemAccess                     (300ms 防抖)
```

`loadGraphData` 读存储 → `graph.nodes/edges/groups` → `simManager.initSim()` 创建力模拟（link/charge/center/collide/radial + fix-collide）→ `draw()` 每帧从 simulation 读坐标更新 PixiJS sprite。分屏同文件共享 graph 引用。

## 声明

- 本作业界面设计由我提供想法，由 DeepSeek V4 Pro 实现
- 主题色参考 [AnuPpuccin](https://github.com/AnubisNekhet/AnuPpuccin)
- 教程参考 [B 站 @罗大富Bigrich](https://www.bilibili.com/video/BV1BT4y1W7Aw/)
