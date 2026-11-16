import { THEMES, getThemeLabel } from "./theme";
import { V } from "./layout-constants";
import { hasHuawenCanvasFont, HUAWEN_CANVAS_FONT } from "./local-canvas-font";
import {
  applyForceDensityPreset,
  detectForceDensityPreset,
  FORCE_DENSITY_PRESETS,
  ForceDensityPreset,
  ForceDensitySettings,
} from "./force-density-presets";

let settingControlId = 0;
function connectLabel(label: HTMLLabelElement, control: HTMLElement, key: string) {
  control.id = 'ns-setting-' + ++settingControlId;
  label.htmlFor = control.id;
  control.dataset.settingKey = key;
}

function makeSelect(parent: HTMLElement, label: string, key: string, value: string,
  options: [string, string, boolean?][], onChange: (value: string) => void) {
  const row = document.createElement('div');
  row.className = 'fg-setting-row fg-setting-select-row';
  const caption = document.createElement('label');
  caption.className = 'fg-setting-label'; caption.textContent = label;
  const select = document.createElement('select');
  select.className = 'fg-setting-select';
  connectLabel(caption, select, key);
  const entries: typeof options = options.some(([entry]) => entry === value) ? options : [...options, [value, '自定义：' + value]];
  for (const [entry, title, disabled] of entries) {
    const option = document.createElement('option');
    option.value = entry;
    option.textContent = title;
    option.disabled = Boolean(disabled);
    select.appendChild(option);
  }
  select.value = value;
  select.addEventListener('change', () => onChange(select.value));
  row.append(caption, select); parent.appendChild(row);
  return select;
}

interface SliderHandle {
  set: (v: number) => void;
}

function makeSlider(
  parent: HTMLElement,
  label: string,
  min: number,
  max: number,
  val: number,
  step: number,
  onChange: (v: number) => void
): SliderHandle {
  const row = document.createElement("div");
  row.className = 'fg-setting-row fg-setting-slider-row';
  row.style.cssText = "display:flex;gap:8px;align-items:center;margin:3px 0;";
  const lb = document.createElement("label");
  lb.className = 'fg-setting-label';
  lb.style.cssText = `font-size:${V('--fg-font-md', '0.85em')};width:${V('--fg-label-width', '110px')};flex-shrink:0;text-align:right;`;
  lb.textContent = label;
  row.appendChild(lb);
  const range = document.createElement("input");
  range.className = 'fg-setting-range';
  range.type = "range";
  connectLabel(lb, range, label + ":range");
  range.min = String(min);
  range.max = String(max);
  range.step = String(step);
  range.value = String(val);
  range.style.cssText = "flex:1;";
  const num = document.createElement("input");
  num.className = 'fg-setting-number';
  num.type = "number";
  num.dataset.settingKey = label + ":number";
  num.setAttribute("aria-label", label + "，数值");
  num.min = String(min);
  num.max = String(max);
  num.step = String(step);
  num.value = String(val);
  num.style.cssText = `width:${V('--fg-input-number-width', '55px')};font-size:${V('--fg-font-md', '0.85em')};text-align:right;`;
  const round = step < 1 ? Math.max(0, -Math.floor(Math.log10(step))) : 0;
  let current = val;
  const commit = (raw: number) => {
    const clamped = Number.isFinite(raw) ? Math.max(min, Math.min(max, raw)) : current;
    const v = Number((min + Math.round((clamped - min) / step) * step).toFixed(round));
    current = v;
    range.value = String(v);
    num.value = round > 0 ? v.toFixed(round) : String(Math.round(v));
    onChange(v);
  };
  range.addEventListener('input', () => commit(Number(range.value)));
  num.addEventListener('change', () => commit(num.value.trim() === '' ? NaN : Number(num.value)));

  row.appendChild(range);
  row.appendChild(num);
  parent.appendChild(row);
  return { set: commit };
}

function makeCheckbox(
  parent: HTMLElement,
  label: string,
  checked: boolean,
  onChange: (v: boolean) => void
): { set: (v: boolean) => void } {
  const row = document.createElement("label");
  row.className = 'fg-setting-row fg-setting-checkbox-row';
  row.style.cssText = "display:flex;gap:6px;align-items:center;margin:3px 0;cursor:pointer;";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.dataset.settingKey = label;
  cb.checked = checked;
  cb.addEventListener("change", () => onChange(cb.checked));
  row.appendChild(cb);
  const lb = document.createElement("span");
  lb.className = 'fg-setting-checkbox-label';
  lb.style.cssText = `font-size:${V('--fg-font-md', '0.85em')};`;
  lb.textContent = label;
  row.appendChild(lb);
  parent.appendChild(row);
  return { set: (v: boolean) => { cb.checked = v; } };
}

export function buildSettings(
  container: HTMLElement,
  params: {
    getLinkDist: () => number; setLinkDist: (v: number) => void;
    getLabelSize: () => number; setLabelSize: (v: number) => void;
    getCharge: () => number; setCharge: (v: number) => void;
    getLinkStr: () => number; setLinkStr: (v: number) => void;
    getCollideR: () => number; setCollideR: (v: number) => void;
    getCenterS: () => number; setCenterS: (v: number) => void;
    getGroupBound: () => number; setGroupBound: (v: number) => void;
    getHeatingTime: () => number; setHeatingTime: (v: number) => void;
    getAlphaTarget: () => number; setAlphaTarget: (v: number) => void;
    getEditPanelOpacity: () => number; setEditPanelOpacity: (v: number) => void;
    getNodeExpand: () => number; setNodeExpand: (v: number) => void;
    getLineExpand: () => number; setLineExpand: (v: number) => void;
    getShowGLabels: () => boolean; setShowGLabels: (v: boolean) => void;
    getGlMin: () => number; setGlMin: (v: number) => void;
    getGlMax: () => number; setGlMax: (v: number) => void;
    getGridVis: () => boolean; setGridVis: (v: boolean) => void;
    getAxisVis: () => boolean; setAxisVis: (v: boolean) => void;
    getAxisTicks: () => boolean; setAxisTicks: (v: boolean) => void;
    getGridSp: () => number; setGridSp: (v: number) => void;
    draw: () => void;
    getInitSim: () => () => void;
    getSaveData: () => () => Promise<void>;
    getGraphTheme: () => string;
    setGraphTheme: (v: string) => void;
    getDefaultValues: () => Record<string, number | boolean | string>;
    getFocusMode: () => boolean;
    setFocusMode: (v: boolean) => void;
    getCenterMode: () => boolean;
    setCenterMode: (v: boolean) => void;
    getGlowAppearance: () => boolean;
    setGlowAppearance: (v: boolean) => void;
    getGridWidth: () => number;
    setGridWidth: (v: number) => void;
    getGridMode?: () => 'line' | 'dot'; setGridMode?: (v: 'line' | 'dot') => void;
    getGridSnapEnabled?: () => boolean; setGridSnapEnabled?: (v: boolean) => void;
    getPartialGridSnap?: () => boolean; setPartialGridSnap?: (v: boolean) => void;
    getNodeColorStyle?: () => string; setNodeColorStyle?: (v: string) => void;
    getFixedHollow?: () => boolean; setFixedHollow?: (v: boolean) => void;
    getFontFamily?: () => string; setFontFamily?: (v: string) => void;
    getActiveMode?: () => string;
    getEdgeColorGradient?: () => boolean; setEdgeColorGradient?: (v: boolean) => void;
    getEdgeWidthByLevel?: () => boolean; setEdgeWidthByLevel?: (v: boolean) => void;
    getSelectedTooltip?: () => boolean; setSelectedTooltip?: (v: boolean) => void;
    getCardBorderStyle?: () => string; setCardBorderStyle?: (v: string) => void;
    onApplyPreset?: () => void;
    onResetPresets?: () => void;
    scope?: 'current' | 'defaults';
  }
) {
  const {
    getLinkDist, setLinkDist, getLabelSize, setLabelSize,
    getCharge, setCharge, getLinkStr, setLinkStr,
    getCollideR, setCollideR, getCenterS, setCenterS,
    getGroupBound, setGroupBound, getHeatingTime, setHeatingTime,
    getAlphaTarget, setAlphaTarget, getEditPanelOpacity, setEditPanelOpacity,
    getNodeExpand, setNodeExpand, getLineExpand, setLineExpand,
    getShowGLabels, setShowGLabels, getGlMin, setGlMin,
    getGlMax, setGlMax, getGridVis, setGridVis,
    getAxisVis, setAxisVis, getAxisTicks, setAxisTicks,
    getGridSp, setGridSp,
    draw, getInitSim, getSaveData,
    getGraphTheme, setGraphTheme, getFocusMode, setFocusMode,
    getCenterMode, setCenterMode,
    getGlowAppearance, setGlowAppearance, getGridWidth, setGridWidth, getDefaultValues,
    getEdgeColorGradient, setEdgeColorGradient, getEdgeWidthByLevel, setEdgeWidthByLevel,
    getNodeColorStyle, setNodeColorStyle, getFontFamily, setFontFamily,
    getSelectedTooltip, setSelectedTooltip,
    getCardBorderStyle, setCardBorderStyle,
  } = params;
  const settingsScope = params.scope ?? 'current';
  container.classList.add('fg-settings-form');
  container.dataset.settingsScope = settingsScope;

  const themeRow = document.createElement("div");
  themeRow.className = 'fg-setting-row fg-setting-select-row fg-setting-theme-row';
  themeRow.style.cssText = "margin-bottom:10px;display:flex;align-items:center;gap:6px;";
  const themeLabel = document.createElement("label");
  themeLabel.className = 'fg-setting-label';
  themeLabel.textContent = settingsScope === 'defaults' ? '默认主题' : '空间主题';
  themeLabel.style.cssText = `font-size:${V('--fg-font-sm', '0.8em')};opacity:0.6;`;
  themeRow.appendChild(themeLabel);
  const themeSelect = document.createElement("select");
  themeSelect.className = 'fg-setting-select';
  connectLabel(themeLabel, themeSelect, 'theme');
  themeSelect.style.cssText = `font-size:${V('--fg-font-sm', '0.8em')};`;
  Object.keys(THEMES).forEach(key => {
    const opt = document.createElement("option");
    opt.value = key; opt.textContent = getThemeLabel(key);
    themeSelect.appendChild(opt);
  });
  themeSelect.value = getGraphTheme() || 'default';
  const headingPalette = document.createElement('div');
  headingPalette.className = 'fg-setting-heading-palette';
  headingPalette.setAttribute('role', 'img');
  headingPalette.setAttribute('aria-label', '节点配色预览，从一级到六级');
  const updateHeadingPalette = () => {
    const colors = getNodeColorStyle?.() === 'hierarchical' ? THEMES[getGraphTheme()]?.headingColors : undefined;
    headingPalette.hidden = !colors;
    headingPalette.replaceChildren();
    colors?.forEach((color, index) => {
      const sample = document.createElement('span');
      sample.className = 'fg-setting-heading-sample';
      sample.style.setProperty('--heading-swatch', color);
      sample.textContent = String(index + 1);
      sample.title = `第 ${index + 1} 级 · ${color}`;
      headingPalette.appendChild(sample);
    });
  };
  themeSelect.addEventListener('change', () => {
    setGraphTheme(themeSelect.value);
    updateHeadingPalette();
    getSaveData()();
    draw();
  });
  themeRow.appendChild(themeSelect);

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.dataset.settingKey = "reset";
  resetBtn.className = 'fg-settings-reset';
  resetBtn.textContent = settingsScope === 'defaults' ? '恢复内置默认值' : '应用默认值到此空间';
  resetBtn.style.cssText = "margin-top:10px;";
  resetBtn.onclick = () => {
    const defs = getDefaultValues();
    setLinkDist(defs.defaultLinkDistance as number);
    setLabelSize(defs.defaultFontSize as number);
    setCharge(defs.defaultCharge as number);
    setLinkStr(defs.defaultLinkStrength as number);
    setCollideR(defs.defaultCollideRadius as number);
    setCenterS(defs.defaultCenterStrength as number);
    setGroupBound(defs.defaultGroupBound as number);
    setHeatingTime(defs.defaultHeatingTime as number);
    setAlphaTarget(defs.defaultAlphaTarget as number);
    setEditPanelOpacity(defs.defaultEditPanelOpacity as number);
    setFocusMode(defs.defaultFocusMode as boolean);
    setCenterMode(defs.defaultCenterMode as boolean);
    setGlowAppearance(defs.defaultGlowAppearance as boolean);
    setSelectedTooltip?.((defs.defaultSelectedTooltip as boolean) ?? false);
    setEdgeColorGradient?.((defs.defaultEdgeColorGradient as boolean) ?? false);
    setEdgeWidthByLevel?.((defs.defaultEdgeWidthByLevel as boolean) ?? false);
    setGridWidth(defs.defaultGridWidth as number);
    setNodeExpand(defs.defaultNodeExpand as number);
    setLineExpand(defs.defaultLineExpand as number);
    setShowGLabels(defs.defaultShowGLabels as boolean);
    setGlMin(defs.defaultGlMin as number);
    setGlMax(defs.defaultGlMax as number);
    setGridVis(defs.defaultGridVis as boolean);
    setAxisVis(defs.defaultAxisVis as boolean);
    setAxisTicks(defs.defaultAxisTicks as boolean);
    setGridSp(defs.defaultGridSpacing as number);
    setGraphTheme(defs.defaultGraphTheme as string);
    if (typeof defs.defaultNodeColorStyle === 'string') setNodeColorStyle?.(defs.defaultNodeColorStyle);
    if (typeof defs.defaultFontFamily === 'string') setFontFamily?.(defs.defaultFontFamily);
    setCardBorderStyle?.((defs.defaultCardBorderStyle as string) ?? 'straight');
    getInitSim()?.(); getSaveData()(); draw();
    rebuild();
    status.textContent = settingsScope === 'defaults' ? '已恢复内置默认值' : '已将默认值应用到此空间';
  };

  const status = document.createElement('p');
  status.className = 'fg-settings-feedback';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  let simDebounce: ReturnType<typeof setTimeout> | null = null;
  const debouncedInitSim = () => {
    if (simDebounce) clearTimeout(simDebounce);
    // The getter follows the focused pane. Capture its bound manager now,
    // before a focus change can redirect this delayed layout update.
    const init = getInitSim();
    simDebounce = setTimeout(() => { simDebounce = null; init?.(); }, 150);
  };
  function rebuild() { buildAll(); }

  function buildAll() {
    const oldFocus = document.activeElement as HTMLElement | null;
    const focusKey = oldFocus && container.contains(oldFocus) ? oldFocus.dataset.settingKey : undefined;
    const openSections = new Set(Array.from(container.querySelectorAll<HTMLDetailsElement>('details'))
      .filter(section => section.open).map(section => section.dataset.settingSection));
    container.replaceChildren();
    themeSelect.value = getGraphTheme();
    const scopeNote = document.createElement('p');
    scopeNote.className = 'fg-settings-scope-note';
    scopeNote.textContent = settingsScope === 'defaults'
      ? '新空间默认样式'
      : '当前空间 · 自动保存';
    container.appendChild(scopeNote);
    const look = document.createElement('fieldset');
    look.className = 'fg-settings-fieldset';
    const legend = document.createElement('legend');
    legend.textContent = '主题与文字';
    look.appendChild(legend);
    container.appendChild(look);
    look.appendChild(themeRow);
    if (getNodeColorStyle && setNodeColorStyle) {
      makeSelect(look, '节点配色', 'node-color', getNodeColorStyle(), [
        ['uniform', '统一'], ['hierarchical', '分级'], ['spectrum', '多彩分级'], ['spectrum-narrow', '分级窄'],
      ], value => { setNodeColorStyle(value); updateHeadingPalette(); getSaveData()(); draw(); });
      look.appendChild(headingPalette);
      updateHeadingPalette();
    }
    if (getFontFamily && setFontFamily) {
      const selectedFont = getFontFamily();
      const fonts: [string, string, boolean?][] = [
        ['system-ui, -apple-system, sans-serif', '系统默认'], ['"SiYuan Songti", serif', '思源宋体'],
      ];
      if (hasHuawenCanvasFont()) fonts.push([HUAWEN_CANVAS_FONT, '华文中宋']);
      else if (selectedFont === HUAWEN_CANVAS_FONT) fonts.push([HUAWEN_CANVAS_FONT, '华文中宋（未导入）', true]);
      makeSelect(look, '画布字体', 'font', selectedFont, fonts,
        value => { setFontFamily(value); getSaveData()(); draw(); });
    }
    makeSlider(look, '文字大小', 8, 40, getLabelSize(), 1, value => { setLabelSize(value); getSaveData()(); draw(); });

    const getForceDensitySettings = (): ForceDensitySettings => ({
      linkDist: getLinkDist(),
      charge: getCharge(),
      linkStr: getLinkStr(),
      collideR: getCollideR(),
      centerS: getCenterS(),
      groupBound: getGroupBound(),
      heatingTime: getHeatingTime(),
      alphaTarget: getAlphaTarget(),
    });

    const densityRow = document.createElement('div');
    densityRow.className = 'fg-setting-row fg-setting-select-row fg-setting-density-row';
    densityRow.style.cssText = 'display:flex;gap:8px;align-items:center;margin:4px 0 8px;';
    const densityLabel = document.createElement('label');
    densityLabel.className = 'fg-setting-label';
    densityLabel.textContent = settingsScope === 'defaults' ? '默认疏密' : '节点疏密';
    densityLabel.style.cssText = `font-size:${V('--fg-font-md', '0.85em')};width:${V('--fg-label-width', '110px')};flex-shrink:0;text-align:right;`;
    const densitySelect = document.createElement('select');
    densitySelect.className = 'fg-setting-select';
    connectLabel(densityLabel, densitySelect, 'density');
    densitySelect.style.cssText = `flex:1;font-size:${V('--fg-font-md', '0.85em')};`;
    for (const preset of Object.keys(FORCE_DENSITY_PRESETS) as ForceDensityPreset[]) {
      const option = document.createElement('option');
      option.value = preset;
      option.textContent = preset;
      densitySelect.appendChild(option);
    }
    const customOption = document.createElement('option');
    customOption.value = 'custom';
    customOption.textContent = '自定义';
    customOption.disabled = true;
    densitySelect.appendChild(customOption);
    densitySelect.value = detectForceDensityPreset(getForceDensitySettings());
    densitySelect.addEventListener('change', () => {
      if (densitySelect.value === 'custom') return;
      const next = applyForceDensityPreset(getForceDensitySettings(), densitySelect.value as ForceDensityPreset);
      setLinkDist(next.linkDist);
      setCharge(next.charge);
      setLinkStr(next.linkStr);
      setCollideR(next.collideR);
      setCenterS(next.centerS);
      setGroupBound(next.groupBound);
      setHeatingTime(next.heatingTime);
      setAlphaTarget(next.alphaTarget);
      getInitSim()?.();
      getSaveData()();
      draw();
      const selected = densitySelect.value;
      rebuild();
      status.textContent = '已应用' + selected + '布局';
    });
    densityRow.append(densityLabel, densitySelect);

    // 高级设置
    const advancedDetails = document.createElement("details");
    advancedDetails.className = 'fg-settings-details fg-settings-advanced';
    advancedDetails.style.cssText = `margin-top:2px;border-top:1px solid ${V('--fg-border-light', 'rgba(255,255,255,0.08)')};padding-top:6px;`;
    const advancedSum = document.createElement("summary");
    advancedSum.className = 'fg-settings-details-summary';
    advancedSum.textContent = "详细参数";
    advancedSum.style.cssText = `font-size:${V('--fg-font-sm', '0.8em')};cursor:pointer;opacity:0.6;padding:2px 0;`;
    advancedDetails.appendChild(advancedSum);
    const advancedBody = document.createElement("div");
    advancedBody.className = 'fg-settings-details-body';
    advancedBody.style.cssText = "padding:4px 0;";
    const onMechanicsChange = () => { densitySelect.value = detectForceDensityPreset(getForceDensitySettings()); };
    const refreshAppearance = () => { draw(); getSaveData()(); };

    // 力学
    const mechanicsDet = document.createElement("details");
    mechanicsDet.className = 'fg-settings-subdetails';
    const mechSum = document.createElement("summary");
    mechSum.className = 'fg-settings-subsummary';
    mechSum.textContent = "力导向布局";
    mechSum.style.cssText = `font-size:${V('--fg-font-xs', '0.72em')};cursor:pointer;opacity:0.5;margin-top:6px;`;
    mechanicsDet.appendChild(mechSum);
    const mechBody = document.createElement("div");
    mechBody.className = 'fg-settings-subbody';
    mechBody.appendChild(densityRow);
    makeSlider(mechBody, "连线距离", 30, 300, getLinkDist(), 1, v => { setLinkDist(v); onMechanicsChange(); debouncedInitSim(); getSaveData()(); });
    makeSlider(mechBody, "节点斥力", -500, -10, getCharge(), 10, v => { setCharge(v); onMechanicsChange(); debouncedInitSim(); getSaveData()(); });
    makeSlider(mechBody, "连线强度", 0, 1, getLinkStr(), 0.05, v => { setLinkStr(v); onMechanicsChange(); debouncedInitSim(); getSaveData()(); });
    makeSlider(mechBody, "碰撞半径", 0, 50, getCollideR(), 1, v => { setCollideR(v); onMechanicsChange(); debouncedInitSim(); getSaveData()(); });
    makeSlider(mechBody, "向心强度", 0, 0.2, getCenterS(), 0.01, v => { setCenterS(v); onMechanicsChange(); debouncedInitSim(); getSaveData()(); });
    makeSlider(mechBody, "集合边界", 0, 2, getGroupBound(), 0.1, v => { setGroupBound(v); onMechanicsChange(); debouncedInitSim(); getSaveData()(); });
    makeSlider(mechBody, "加热时间(秒)", 0, 10, getHeatingTime(), 0.5, v => { setHeatingTime(v); onMechanicsChange(); getSaveData()(); });
    makeSlider(mechBody, "目标活跃度", 0, 1, getAlphaTarget(), 0.05, v => { setAlphaTarget(v); onMechanicsChange(); debouncedInitSim(); getSaveData()(); });
    mechanicsDet.appendChild(mechBody);
    advancedBody.appendChild(mechanicsDet);

    // 外观
    const appearDet = document.createElement("details");
    appearDet.className = 'fg-settings-subdetails';
    const appearSum = document.createElement("summary");
    appearSum.className = 'fg-settings-subsummary';
    appearSum.textContent = "节点、连线与交互";
    appearSum.style.cssText = `font-size:${V('--fg-font-xs', '0.72em')};cursor:pointer;opacity:0.5;margin-top:4px;`;
    appearDet.appendChild(appearSum);
    const appearBody = document.createElement("div");
    appearBody.className = 'fg-settings-subbody';
    makeSlider(appearBody, "编辑面板透明度", 0, 1, getEditPanelOpacity(), 0.05, v => { setEditPanelOpacity(v); getSaveData()(); });
    makeSlider(appearBody, "节点点击扩展", 0, 20, getNodeExpand(), 1, v => { setNodeExpand(v); getSaveData()(); });
    makeSlider(appearBody, "边点击扩展", 0, 20, getLineExpand(), 1, v => { setLineExpand(v); getSaveData()(); });
    makeCheckbox(appearBody, "节点光晕", getGlowAppearance(), v => { setGlowAppearance(v); draw(); getSaveData()(); });
    makeCheckbox(appearBody, "聚焦模式", getFocusMode(), v => { setFocusMode(v); draw(); getSaveData()(); });
    makeCheckbox(appearBody, "居中模式", getCenterMode(), v => { setCenterMode(v); getSaveData()(); });
    if (getSelectedTooltip) makeCheckbox(appearBody, "选中显示内容", getSelectedTooltip(), v => { setSelectedTooltip!(v); getSaveData()(); });
    if (getEdgeColorGradient) makeCheckbox(appearBody, "连线渐变颜色", getEdgeColorGradient(), v => { setEdgeColorGradient?.(v); draw(); getSaveData()(); });
    if (getEdgeWidthByLevel) makeCheckbox(appearBody, "连线等级粗细", getEdgeWidthByLevel(), v => { setEdgeWidthByLevel?.(v); draw(); getSaveData()(); });
    if (getCardBorderStyle) {
      const cbRow = document.createElement("div");
      cbRow.className = 'fg-setting-row fg-setting-select-row';
      cbRow.style.cssText = "display:flex;gap:6px;align-items:center;margin:3px 0;";
      const cbLb = document.createElement("label");
      cbLb.className = 'fg-setting-label';
      cbLb.textContent = "卡片边框风格";
      cbLb.style.cssText = `font-size:${V('--fg-font-md', '0.85em')};width:${V('--fg-label-width', '110px')};flex-shrink:0;text-align:right;`;
      cbRow.appendChild(cbLb);
      const cbSel = document.createElement("select");
      cbSel.className = 'fg-setting-select';
      connectLabel(cbLb, cbSel, 'card-border');
      cbSel.style.cssText = `flex:1;font-size:${V('--fg-font-md', '0.85em')};`;
      const opt1 = document.createElement("option"); opt1.value = 'straight'; opt1.textContent = '直线';
      const opt2 = document.createElement("option"); opt2.value = 'rounded'; opt2.textContent = '圆角';
      cbSel.appendChild(opt1); cbSel.appendChild(opt2);
      cbSel.value = getCardBorderStyle();
      cbSel.addEventListener('change', () => { setCardBorderStyle!(cbSel.value); draw(); getSaveData()(); });
      cbRow.appendChild(cbSel);
      appearBody.appendChild(cbRow);
    }
    appearDet.appendChild(appearBody);
    advancedBody.appendChild(appearDet);

    // 集合标签
    const groupLabelDet = document.createElement("details");
    groupLabelDet.className = 'fg-settings-subdetails';
    const glSum = document.createElement("summary");
    glSum.className = 'fg-settings-subsummary';
    glSum.textContent = "集合标签";
    glSum.style.cssText = `font-size:${V('--fg-font-xs', '0.72em')};cursor:pointer;opacity:0.5;margin-top:4px;`;
    groupLabelDet.appendChild(glSum);
    const glBody = document.createElement("div");
    glBody.className = 'fg-settings-subbody';
    makeCheckbox(glBody, "显示集合标签", getShowGLabels(), v => { setShowGLabels(v); refreshAppearance(); });
    makeSlider(glBody, "最小集合标签", 5, 20, getGlMin(), 1, v => { setGlMin(v); refreshAppearance(); });
    makeSlider(glBody, "最大集合标签", 10, 50, getGlMax(), 1, v => { setGlMax(v); refreshAppearance(); });
    groupLabelDet.appendChild(glBody);
    advancedBody.appendChild(groupLabelDet);

    // 网格
    const gridDet = document.createElement("details");
    gridDet.className = 'fg-settings-subdetails';
    const gridSum = document.createElement("summary");
    gridSum.className = 'fg-settings-subsummary';
    gridSum.textContent = "网格与坐标轴";
    gridSum.style.cssText = `font-size:${V('--fg-font-xs', '0.72em')};cursor:pointer;opacity:0.5;margin-top:4px;`;
    gridDet.appendChild(gridSum);
    const gridBody = document.createElement("div");
    gridBody.className = 'fg-settings-subbody';
    makeCheckbox(gridBody, "显示网格", getGridVis(), v => { setGridVis(v); refreshAppearance(); });
    makeCheckbox(gridBody, "显示坐标轴", getAxisVis(), v => { setAxisVis(v); refreshAppearance(); });
    makeCheckbox(gridBody, "坐标轴刻度", getAxisTicks(), v => { setAxisTicks(v); refreshAppearance(); });
    makeSlider(gridBody, "网格间距", 10, 100, getGridSp(), 5, v => { setGridSp(v); refreshAppearance(); });
    makeSlider(gridBody, "网格线宽", 0.2, 4, getGridWidth(), 0.1, v => { setGridWidth(v); refreshAppearance(); });
    gridDet.appendChild(gridBody);
    advancedBody.appendChild(gridDet);

    advancedDetails.appendChild(advancedBody);
    container.appendChild(advancedDetails);
    container.appendChild(resetBtn);
    container.appendChild(status);
    for (const detail of Array.from(container.querySelectorAll<HTMLDetailsElement>('details'))) {
      const summary = detail.querySelector('summary');
      const key = summary?.textContent ?? '';
      detail.dataset.settingSection = key;
      if (summary) summary.dataset.settingKey = 'section:' + key;
      detail.open = openSections.has(key);
    }
    if (focusKey) Array.from(container.querySelectorAll<HTMLElement>('[data-setting-key]'))
      .find(control => control.dataset.settingKey === focusKey)?.focus({ preventScroll: true });
  }

  buildAll();

  return {
    updateInfo: () => { rebuild(); },
    rebuild: () => { rebuild(); }
  };
}
