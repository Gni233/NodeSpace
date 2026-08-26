import type { SourceRange, TextDiagnostic, TextEntityKind, TextProperty } from './types';

export type PropertyContext = Exclude<TextEntityKind, 'graph' | 'settings'>;

export const KEY_ALIASES: Record<string, string> = {
  等级: 'headingLevel',
  级别: 'headingLevel',
  标签: 'tags',
  笔记: 'note',
  颜色: 'color',
  半径: 'radius',
  半径模式: 'radiusMode',
  固定: 'fixed',
  折叠: 'collapsed',
  链接: 'hyperlink',
  媒体: 'mediaUrl',
  媒体类型: 'mediaType',
  名称: 'label',
  线型: 'lineStyle',
  箭头: 'arrow',
  显示: 'displayMode',
  边框颜色: 'borderColor',
  透明度: 'opacity',
  节点颜色模式: 'nodeColorMode',
  节点颜色: 'nodeColor',
  流体半径: 'fluidRadius',
  流体透明度: 'fluidOpacity',
};

export const SETTING_NAME_TO_KEY: Record<string, string> = {
  连线距离: 'linkDist', linkDistance: 'linkDist',
  标签大小: 'labelSize', labelSize: 'labelSize',
  节点斥力: 'charge', charge: 'charge',
  连线强度: 'linkStr', linkStrength: 'linkStr',
  碰撞半径: 'collideR', collisionRadius: 'collideR',
  中心力: 'centerS', centerStrength: 'centerS',
  集合边界: 'groupBound', groupBoundary: 'groupBound',
  加热时间: 'heatingTime', heatingTime: 'heatingTime',
  目标温度: 'alphaTarget', alphaTarget: 'alphaTarget',
  编辑面板透明度: 'editPanelOpacity', editPanelOpacity: 'editPanelOpacity',
  动画帧循环: 'useRAFL', useRAFL: 'useRAFL',
  节点扩张: 'nodeExpand', nodeExpand: 'nodeExpand',
  连线扩张: 'lineExpand', lineExpand: 'lineExpand',
  显示集合标签: 'showGLabels', showGroupLabels: 'showGLabels',
  集合标签最小: 'glMin', groupLabelMin: 'glMin',
  集合标签最大: 'glMax', groupLabelMax: 'glMax',
  显示网格: 'gridVis', showGrid: 'gridVis',
  网格模式: 'gridMode', gridMode: 'gridMode',
  显示坐标轴: 'axisVis', showAxes: 'axisVis',
  坐标轴刻度: 'axisTicks', axisTicks: 'axisTicks',
  网格间距: 'gridSp', gridSpacing: 'gridSp',
  宽高比: 'ar', aspectRatio: 'ar',
  图主题: 'graphTheme', graphTheme: 'graphTheme',
  专注模式: 'focusMode', focusMode: 'focusMode',
  居中模式: 'centerMode', centerMode: 'centerMode',
  选中提示: 'selectedTooltip', selectedTooltip: 'selectedTooltip',
  星形旋转: 'starRotateMode', starRotateMode: 'starRotateMode',
  发光外观: 'glowAppearance', glowAppearance: 'glowAppearance',
  网格宽度: 'gridWidth', gridWidth: 'gridWidth',
  分类布局: 'categoryLayout', categoryLayout: 'categoryLayout',
  布局模式: 'layoutMode', layoutMode: 'layoutMode',
  网格吸附: 'gridSnap', gridSnap: 'gridSnap',
  部分网格吸附: 'partialGridSnap', partialGridSnap: 'partialGridSnap',
  节点配色样式: 'nodeColorStyle', nodeColorStyle: 'nodeColorStyle',
  字体: 'fontFamily', fontFamily: 'fontFamily',
  连线渐变: 'edgeColorGradient', edgeColorGradient: 'edgeColorGradient',
  按等级设置线宽: 'edgeWidthByLevel', edgeWidthByLevel: 'edgeWidthByLevel',
  固定节点空心: 'fixedHollow', fixedHollow: 'fixedHollow',
  卡片边框: 'cardBorderStyle', cardBorderStyle: 'cardBorderStyle',
  卡片顺序: 'cardOrders', cardOrders: 'cardOrders',
  集合卡片顺序: 'groupCardOrders', groupCardOrders: 'groupCardOrders',
  卡片视图: 'cardViews', cardViews: 'cardViews',
  集合卡片视图: 'groupCardViews', groupCardViews: 'groupCardViews',
  展开媒体: 'expandedMedia', expandedMedia: 'expandedMedia',
};

export const SETTING_KEY_TO_NAME: Record<string, string> = {};
for (const [name, key] of Object.entries(SETTING_NAME_TO_KEY)) {
  if (!(key in SETTING_KEY_TO_NAME) || /[\u4e00-\u9fff]/.test(name)) SETTING_KEY_TO_NAME[key] = name;
}

export function settingKey(name: string): string {
  return SETTING_NAME_TO_KEY[name] ?? name;
}

export function parseValue(raw: string, valueRange: SourceRange, diagnostics: TextDiagnostic[]): unknown {
  return parseExplicitValue(raw, valueRange, diagnostics);
}

function parseExplicitValue(raw: string, diagnosticRange: SourceRange, diagnostics: TextDiagnostic[]): unknown {
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  try {
    return JSON.parse(trimmed);
  } catch {
    if (/^(?:\{|\[|"|-?\d|true\b|false\b|null\b)/.test(trimmed)) {
      diagnostics.push({
        code: 'INVALID_JSON',
        message: `无法解析 JSON 值：${trimmed}`,
        severity: 'error',
        range: diagnosticRange,
      });
    }
    return trimmed;
  }
}

interface Candidate {
  key: string;
  value: unknown;
}

function inferredCandidates(context: PropertyContext, token: string): Candidate[] {
  const normalized = token.trim();
  const candidates: Candidate[] = [];
  const add = (key: string, value: unknown): void => { candidates.push({ key, value }); };
  const levelWords: Record<string, number> = {
    一级: 1, 二级: 2, 三级: 3, 四级: 4, 五级: 5, 六级: 6,
    '1级': 1, '2级': 2, '3级': 3, '4级': 4, '5级': 5, '6级': 6,
  };

  if (context === 'node') {
    if (normalized in levelWords) add('headingLevel', levelWords[normalized]);
    if (/^-?\d+$/.test(normalized)) add('headingLevel', Number(normalized));
    const pixels = normalized.match(/^(-?\d+(?:\.\d+)?)px$/i);
    if (pixels) add('radius', Number(pixels[1]));
    if (normalized === '固定' || normalized === 'fixed') add('fixed', true);
    if (normalized === '不固定' || normalized === 'unfixed') add('fixed', false);
    if (normalized === '折叠' || normalized === 'collapsed') add('collapsed', true);
    if (normalized === '展开' || normalized === 'expanded') add('collapsed', false);
    if (normalized === '自定义' || normalized === 'custom') add('radiusMode', 'custom');
    if (normalized === '按等级' || normalized === 'level') add('radiusMode', 'level');
    if (/^#[0-9a-f]{3,8}$/i.test(normalized)) add('color', normalized);
  } else if (context === 'edge') {
    const styles: Record<string, string> = {
      实线: 'solid', solid: 'solid', 虚线: 'dash-2', 'dash-2': 'dash-2',
      点线: 'dot', dot: 'dot', 'dash-1': 'dash-1', 'dash-3': 'dash-3', 'dash-4': 'dash-4',
    };
    if (normalized in styles) add('lineStyle', styles[normalized]);
    if (normalized === '箭头' || normalized === 'arrow') add('arrow', true);
    if (normalized === '无箭头' || normalized === 'no-arrow') add('arrow', false);
    if (/^#[0-9a-f]{3,8}$/i.test(normalized)) add('color', normalized);
  } else if (context === 'group') {
    const modes: Record<string, string> = {
      隐藏: 'none', none: 'none', 矩形: 'rect', rectangle: 'rect', rect: 'rect', 流体: 'fluid', fluid: 'fluid',
    };
    if (normalized in modes) add('displayMode', modes[normalized]);
    const colorModes: Record<string, string> = {
      不着色: 'off', off: 'off', 填充: 'fill', fill: 'fill', 边缘: 'edge', edge: 'edge',
    };
    if (normalized in colorModes) add('nodeColorMode', colorModes[normalized]);
    if (/^#[0-9a-f]{3,8}$/i.test(normalized)) {
      add('color', normalized);
      add('borderColor', normalized);
      add('nodeColor', normalized);
    }
  } else {
    if (normalized === '默认' || normalized === '自动' || normalized === 'default' || normalized === 'auto') add('layoutMode', 'auto');
    if (normalized === '力导向' || normalized === 'force') add('layoutMode', 'force');
    if (normalized === '线' || normalized === 'line') add('gridMode', 'line');
    if (normalized === '点' || normalized === 'dot') add('gridMode', 'dot');
    if (normalized === '直角' || normalized === 'straight') add('cardBorderStyle', 'straight');
    if (normalized === '圆角' || normalized === 'rounded') add('cardBorderStyle', 'rounded');
  }
  return candidates;
}

export function parseProperty(
  context: PropertyContext,
  token: string,
  propertyRange: SourceRange,
  diagnostics: TextDiagnostic[],
): TextProperty | undefined {
  const equals = token.indexOf('=');
  if (equals > 0) {
    const sourceKey = token.slice(0, equals).trim();
    const key = KEY_ALIASES[sourceKey] ?? sourceKey;
    if (!/^[$A-Z_a-z\u4e00-\u9fff][$\w\u4e00-\u9fff-]*$/.test(key)) {
      diagnostics.push({ code: 'INVALID_PROPERTY', message: `非法属性名：${sourceKey}`, severity: 'error', range: propertyRange });
      return undefined;
    }
    const value = parseExplicitValue(token.slice(equals + 1), propertyRange, diagnostics);
    if (key === 'headingLevel' && (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 6)) {
      diagnostics.push({ code: 'INVALID_LEVEL', message: '节点等级必须是 1 到 6 的整数', severity: 'error', range: propertyRange });
    }
    return { key, value, range: propertyRange, explicit: true };
  }

  const candidates = inferredCandidates(context, token);
  if (candidates.length === 1) {
    const candidate = candidates[0];
    if (candidate.key === 'headingLevel' && (!Number.isInteger(candidate.value) || (candidate.value as number) < 1 || (candidate.value as number) > 6)) {
      diagnostics.push({ code: 'INVALID_LEVEL', message: '节点等级必须是 1 到 6 的整数', severity: 'error', range: propertyRange });
    }
    return { ...candidate, range: propertyRange, explicit: false };
  }
  const reason = candidates.length === 0 ? '无法根据上下文推断' : '有多个可能属性，请使用 key=value 消歧';
  diagnostics.push({ code: 'INVALID_PROPERTY', message: `${reason}：${token}`, severity: 'error', range: propertyRange });
  return undefined;
}

export function applyProperties(target: Record<string, any>, properties: TextProperty[]): void {
  for (const property of properties) target[property.key] = structuredClone(property.value);
  if ('radius' in target && !('radiusMode' in target)) target.radiusMode = 'custom';
}
