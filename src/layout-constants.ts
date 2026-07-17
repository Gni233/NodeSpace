/**
 * 布局常量 — 侧边栏宽度、z-index 层级等
 * 所有 UI 模块统一引用这些变量，消除硬编码魔术数字
 */

// ---- 侧边栏 ----
export const SIDEBAR_LEFT = 2;
export const SIDEBAR_WIDTH = 232;
export const SIDEBAR_COLLAPSED_WIDTH = 36;
export const SIDEBAR_MIN_WIDTH = 180;
export const SIDEBAR_EXPANDED_MARGIN = 6; // 侧边栏右边距（展开时）
export const SIDEBAR_COLLAPSED_MARGIN = 4; // 侧边栏右边距（折叠时）

/** 侧边栏展开时，右侧 UI 元素的 left 值（响应式） */
export const sidebarExpandedLeft = () => SIDEBAR_LEFT + getResponsiveSidebarWidth() + SIDEBAR_EXPANDED_MARGIN;

/** 侧边栏折叠时，右侧 UI 元素的 left 值 */
export const sidebarCollapsedLeft = () => SIDEBAR_LEFT + SIDEBAR_COLLAPSED_WIDTH + SIDEBAR_COLLAPSED_MARGIN;

// ---- z-index 层级 ----
export const Z_CANVAS = 0;
export const Z_LOADING = 5;
export const Z_FLOATING_UI = 10; // 顶栏、侧边栏、底部设置面板
export const Z_MOBILE_TOOLBAR = 11; // 移动端浮动工具栏
export const Z_MEDIA_OVERLAY = 8; // 多媒体覆盖层容器
export const Z_EDIT_PANEL = 21; // 浮动编辑面板
export const Z_SELECTION_BOX = 20; // 框选矩形
export const Z_SETTINGS_PANEL = 25; // 设置/预设面板
export const Z_TOOLTIP = 50; // 悬停提示
export const Z_DROPDOWN = 50; // 下拉菜单（与 tooltip 同级）
export const Z_STATS = 80; // 统计栏
export const Z_CONTEXT_MENU = 100; // 右键菜单
export const Z_WINDOW_CONTROLS = 150; // 窗口控制按钮
export const Z_TOAST = 300; // Toast 通知
export const Z_MODAL_BACKDROP = 9990; // 模态遮罩
export const Z_MODAL = 9991; // 模态弹窗

// ---- 窗口控制按钮 ----
/** 窗口控制按钮区域预估宽度（含间距） */
export const WIN_CONTROLS_WIDTH = 140;

// ---- 动画 ----
export const LAYOUT_ANIM_DURATION = 900; // 布局切换动画时长 (ms)
export const SEARCH_MOVE_DURATION = 300; // 搜索跳转动画时长 (ms)
export const FIT_ALL_DURATION = 400; // 适配视口动画时长 (ms)

// ---- 响应式侧边栏 ----
/** 根据屏幕宽度返回合适的侧边栏宽度：桌面 240px，手机（<500px）缩放至 min(180, 内宽-160) */
export const getResponsiveSidebarWidth = (): number => {
  const w = window.innerWidth;
  return w < 500 ? Math.min(180, w - 160) : SIDEBAR_WIDTH;
};

// ---- Toast ----
export const TOAST_MAX_COUNT = 5;

/** CSS var() helper — import from this module */
export const V = (name: string, fallback: string) => `var(${name},${fallback})`;
