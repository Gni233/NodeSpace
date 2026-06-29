import type { GraphData } from "./data/storage";

export const DEMO_DATA: GraphData = {
  "nodes": [
    {
      "id": "n_17826610000001",
      "label": "NodeSpace",
      "headingLevel": 1,
      "tags": [],
      "note": "图可视化笔记应用——由DeepSeek V4 Pro协助开发"
    },
    {
      "id": "n_17826610000101",
      "label": "操作栏",
      "headingLevel": 2,
      "tags": [
        "交互"
      ],
      "note": "新建节点/连线/搜索/聚焦/撤销/刷新"
    },
    {
      "id": "n_17826610000102",
      "label": "编辑栏",
      "headingLevel": 2,
      "tags": [
        "交互"
      ],
      "note": "名称/备注/标签/颜色/等级/半径/媒体URL"
    },
    {
      "id": "n_17826610000103",
      "label": "图区自定义",
      "headingLevel": 2,
      "tags": [
        "样式"
      ],
      "note": "26套主题/力学/外观/集合/网格/性能"
    },
    {
      "id": "n_17826610000104",
      "label": "文件树",
      "headingLevel": 2,
      "tags": [
        "数据"
      ],
      "note": "多标签/本地文件夹/文件导入/IndexedDB恢复"
    },
    {
      "id": "n_17826610000105",
      "label": "边与交互",
      "headingLevel": 2,
      "tags": [
        "交互"
      ],
      "note": "点击选边/右键连线/框选/右键菜单/连线编辑"
    },
    {
      "id": "n_17826610000106",
      "label": "折叠/展开",
      "headingLevel": 2,
      "tags": [
        "交互"
      ],
      "note": "折叠一级/逐级折叠/展开一级/全部展开/动画"
    },
    {
      "id": "n_17826610000107",
      "label": "网格/布局",
      "headingLevel": 2,
      "tags": [
        "布局"
      ],
      "note": "点线网格/坐标轴/格点吸附/树形/分类布局"
    },
    {
      "id": "n_17826610000108",
      "label": "分屏系统",
      "headingLevel": 2,
      "tags": [
        "架构"
      ],
      "note": "左右分屏/同文件共享graph/独立viewport"
    },
    {
      "id": "n_17826610000109",
      "label": "本地存储",
      "headingLevel": 2,
      "tags": [
        "数据"
      ],
      "note": "localStorage多图隔离/FileSystemAccess"
    },
    {
      "id": "n_17826610000110",
      "label": "多媒体",
      "headingLevel": 2,
      "tags": [
        "渲染"
      ],
      "note": "图片/音视频/文档/hover预览/右键更多菜单"
    },
    {
      "id": "n_17826610000111",
      "label": "主题系统",
      "headingLevel": 2,
      "tags": [
        "样式"
      ],
      "note": "26套预设/glass拟态UI/CSS变量/暗色亮色"
    },
    {
      "id": "n_17826610000112",
      "label": "动画系统",
      "headingLevel": 2,
      "tags": [
        "动画"
      ],
      "note": "新建grow-in/删除shrink-out/折叠逐层/展开分向"
    },
    {
      "id": "n_17826610000113",
      "label": "搜索高亮",
      "headingLevel": 3,
      "tags": [
        "交互"
      ],
      "note": "关键词搜索/节点连线匹配/高亮跳转"
    },
    {
      "id": "n_17826610000114",
      "label": "链接模式",
      "headingLevel": 3,
      "tags": [
        "交互"
      ],
      "note": "点击源节点→点目标建边"
    },
    {
      "id": "n_17826610000115",
      "label": "标签pill",
      "headingLevel": 3,
      "tags": [
        "交互"
      ],
      "note": "点击进入集合/删除标签清理孤立集合"
    },
    {
      "id": "n_17826610000116",
      "label": "等级调整",
      "headingLevel": 3,
      "tags": [
        "交互"
      ],
      "note": "1~6级大小/快捷键调整/主题色映射"
    },
    {
      "id": "n_17826610000117",
      "label": "连线颜色渐变",
      "headingLevel": 3,
      "tags": [
        "渲染"
      ],
      "note": "基于两端节点颜色做线段渐变"
    },
    {
      "id": "n_17826610000118",
      "label": "连线粗细等级",
      "headingLevel": 3,
      "tags": [
        "渲染"
      ],
      "note": "基于两端节点等级做线宽渐变"
    },
    {
      "id": "n_17826610000119",
      "label": "格点吸附",
      "headingLevel": 3,
      "tags": [
        "布局"
      ],
      "note": "释放时对齐/拖拽中自由/部分吸附"
    },
    {
      "id": "n_17826610000120",
      "label": "内存优化",
      "headingLevel": 3,
      "tags": [
        "架构"
      ],
      "note": "同文件共享simulation/nodeSprites"
    },
    {
      "id": "n_17826610000121",
      "label": "折叠时固定父节点",
      "headingLevel": 3,
      "tags": [
        "动画"
      ],
      "note": "防位移/动画结束释放/速度清零"
    },
    {
      "id": "n_17826610000122",
      "label": "展开圆分布",
      "headingLevel": 3,
      "tags": [
        "动画"
      ],
      "note": "父节点周围均匀分布目标位置"
    },
    {
      "id": "n_17826610000123",
      "label": "26套主题",
      "headingLevel": 3,
      "tags": [
        "样式"
      ],
      "note": "nord/solarized/monokai/flexoki等"
    }
  ],
  "edges": [
    {
      "source": "n_17826610000001",
      "target": "n_17826610000101",
      "label": "",
      "color": "#BFBFBF"
    },
    {
      "source": "n_17826610000001",
      "target": "n_17826610000102",
      "label": "",
      "color": "#BFBFBF"
    },
    {
      "source": "n_17826610000001",
      "target": "n_17826610000103",
      "label": "",
      "color": "#BFBFBF"
    },
    {
      "source": "n_17826610000001",
      "target": "n_17826610000104",
      "label": "",
      "color": "#BFBFBF"
    },
    {
      "source": "n_17826610000001",
      "target": "n_17826610000105",
      "label": "",
      "color": "#BFBFBF"
    },
    {
      "source": "n_17826610000001",
      "target": "n_17826610000106",
      "label": "",
      "color": "#BFBFBF"
    },
    {
      "source": "n_17826610000001",
      "target": "n_17826610000107",
      "label": "",
      "color": "#BFBFBF"
    },
    {
      "source": "n_17826610000001",
      "target": "n_17826610000108",
      "label": "",
      "color": "#BFBFBF"
    },
    {
      "source": "n_17826610000001",
      "target": "n_17826610000109",
      "label": "",
      "color": "#BFBFBF"
    },
    {
      "source": "n_17826610000001",
      "target": "n_17826610000110",
      "label": "",
      "color": "#BFBFBF"
    },
    {
      "source": "n_17826610000001",
      "target": "n_17826610000111",
      "label": "",
      "color": "#BFBFBF"
    },
    {
      "source": "n_17826610000001",
      "target": "n_17826610000112",
      "label": "",
      "color": "#BFBFBF"
    },
    {
      "source": "n_17826610000101",
      "target": "n_17826610000113",
      "label": "",
      "color": "#BFBFBF"
    },
    {
      "source": "n_17826610000101",
      "target": "n_17826610000114",
      "label": "",
      "color": "#BFBFBF"
    },
    {
      "source": "n_17826610000102",
      "target": "n_17826610000115",
      "label": "",
      "color": "#BFBFBF"
    },
    {
      "source": "n_17826610000102",
      "target": "n_17826610000116",
      "label": "",
      "color": "#BFBFBF"
    },
    {
      "source": "n_17826610000105",
      "target": "n_17826610000117",
      "label": "",
      "color": "#BFBFBF"
    },
    {
      "source": "n_17826610000105",
      "target": "n_17826610000118",
      "label": "",
      "color": "#BFBFBF"
    },
    {
      "source": "n_17826610000107",
      "target": "n_17826610000119",
      "label": "",
      "color": "#BFBFBF"
    },
    {
      "source": "n_17826610000108",
      "target": "n_17826610000120",
      "label": "",
      "color": "#BFBFBF"
    },
    {
      "source": "n_17826610000112",
      "target": "n_17826610000121",
      "label": "",
      "color": "#BFBFBF"
    },
    {
      "source": "n_17826610000112",
      "target": "n_17826610000122",
      "label": "",
      "color": "#BFBFBF"
    },
    {
      "source": "n_17826610000111",
      "target": "n_17826610000123",
      "label": "",
      "color": "#BFBFBF"
    }
  ],
  "groups": [],
  "settings": {
    "linkDist": 120,
    "labelSize": 18,
    "charge": -100,
    "linkStr": 0.3,
    "collideR": 10,
    "centerS": 0.02,
    "groupBound": 0.8,
    "heatingTime": 2,
    "alphaTarget": 0.3,
    "editPanelOpacity": 0.9,
    "useRAFL": true,
    "nodeExpand": 8,
    "lineExpand": 6,
    "showGLabels": true,
    "glMin": 10,
    "glMax": 28,
    "gridVis": true,
    "gridMode": "dot",
    "axisVis": false,
    "axisTicks": false,
    "gridSp": 30,
    "gridWidth": 0.5,
    "ar": 0.75,
    "graphTheme": "flexoki-dark",
    "focusMode": false,
    "glowAppearance": true,
    "categoryLayout": false,
    "layoutMode": "default",
    "gridSnap": false,
    "partialGridSnap": false,
    "nodeColorStyle": "spectrum-narrow",
    "fontFamily": "\"SiYuan Songti\", serif",
    "edgeColorGradient": false,
    "edgeWidthByLevel": false
  }
};