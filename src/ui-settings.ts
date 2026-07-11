import { THEMES, getThemeLabel } from "./theme";
import { V } from "./layout-constants";

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
  row.style.cssText = "display:flex;gap:8px;align-items:center;margin:3px 0;";
  const lb = document.createElement("span");
  lb.style.cssText = `font-size:${V('--fg-font-md', '0.85em')};width:${V('--fg-label-width', '110px')};flex-shrink:0;text-align:right;`;
  lb.textContent = label;
  row.appendChild(lb);
  const range = document.createElement("input");
  range.type = "range";
  range.min = String(min);
  range.max = String(max);
  range.step = String(step);
  range.value = String(val);
  range.style.cssText = "flex:1;";
  const num = document.createElement("input");
  num.type = "number";
  num.min = String(min);
  num.max = String(max);
  num.step = String(step);
  num.value = String(val);
  num.style.cssText = `width:${V('--fg-input-number-width', '55px')};font-size:${V('--fg-font-md', '0.85em')};text-align:right;`;
  const round = step < 1 ? Math.max(0, -Math.floor(Math.log10(step))) : 0;
  range.addEventListener("input", () => {
    const v = parseFloat(range.value);
    num.value = round > 0 ? v.toFixed(round) : String(Math.round(v));
    onChange(v);
  });
  num.addEventListener("change", () => {
    const v = parseFloat(num.value);
    if (!isNaN(v)) { range.value = String(v); onChange(v); }
  });
  num.addEventListener("input", () => {
    const v = parseFloat(num.value);
    if (!isNaN(v)) {
      const clamped = Math.max(min, Math.min(max, v));
      if (clamped !== v) { num.value = round > 0 ? clamped.toFixed(round) : String(Math.round(clamped)); }
    }
  });
  row.appendChild(range);
  row.appendChild(num);
  parent.appendChild(row);
  return { set: (v: number) => { range.value = String(v); num.value = round > 0 ? v.toFixed(round) : String(Math.round(v)); onChange(v); } };
}

function makeCheckbox(
  parent: HTMLElement,
  label: string,
  checked: boolean,
  onChange: (v: boolean) => void
): { set: (v: boolean) => void } {
  const row = document.createElement("label");
  row.style.cssText = "display:flex;gap:6px;align-items:center;margin:3px 0;cursor:pointer;";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = checked;
  cb.addEventListener("change", () => onChange(cb.checked));
  row.appendChild(cb);
  const lb = document.createElement("span");
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
    getUseRAFL: () => boolean; setUseRAFL: (v: boolean) => void;
    getNodeExpand: () => number; setNodeExpand: (v: number) => void;
    getLineExpand: () => number; setLineExpand: (v: number) => void;
    getShowGLabels: () => boolean; setShowGLabels: (v: boolean) => void;
    getGlMin: () => number; setGlMin: (v: number) => void;
    getGlMax: () => number; setGlMax: (v: number) => void;
    getGridVis: () => boolean; setGridVis: (v: boolean) => void;
    getAxisVis: () => boolean; setAxisVis: (v: boolean) => void;
    getAxisTicks: () => boolean; setAxisTicks: (v: boolean) => void;
    getGridSp: () => number; setGridSp: (v: number) => void;
    getAr: () => number; setAr: (v: number) => void;
    getSimulation: () => any;
    getGw: () => number;
    getGh: () => number;
    draw: () => void;
    getInitSim: () => () => void;
    getSaveData: () => () => Promise<void>;
    graph: any;
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
  }
) {
  const {
    getLinkDist, setLinkDist, getLabelSize, setLabelSize,
    getCharge, setCharge, getLinkStr, setLinkStr,
    getCollideR, setCollideR, getCenterS, setCenterS,
    getGroupBound, setGroupBound, getHeatingTime, setHeatingTime,
    getAlphaTarget, setAlphaTarget, getEditPanelOpacity, setEditPanelOpacity,
    getUseRAFL, setUseRAFL,
    getNodeExpand, setNodeExpand, getLineExpand, setLineExpand,
    getShowGLabels, setShowGLabels, getGlMin, setGlMin,
    getGlMax, setGlMax, getGridVis, setGridVis,
    getAxisVis, setAxisVis, getAxisTicks, setAxisTicks,
    getGridSp, setGridSp, getAr, setAr,
    getSimulation, getGw, getGh,
    draw, getInitSim, getSaveData, graph,
    getGraphTheme, setGraphTheme, getFocusMode, setFocusMode,
    getCenterMode, setCenterMode,
    getGlowAppearance, setGlowAppearance, getGridWidth, setGridWidth, getDefaultValues,
    getEdgeColorGradient, setEdgeColorGradient, getEdgeWidthByLevel, setEdgeWidthByLevel,
    getNodeColorStyle, setNodeColorStyle, getFontFamily, setFontFamily,
    getSelectedTooltip, setSelectedTooltip,
    getCardBorderStyle, setCardBorderStyle,
  } = params;

  const themeRow = document.createElement("div");
  themeRow.style.cssText = "margin-bottom:10px;display:flex;align-items:center;gap:6px;";
  const themeLabel = document.createElement("span");
  themeLabel.textContent = "主题：";
  themeLabel.style.cssText = `font-size:${V('--fg-font-sm', '0.8em')};opacity:0.6;`;
  themeRow.appendChild(themeLabel);
  const themeSelect = document.createElement("select");
  themeSelect.style.cssText = `font-size:${V('--fg-font-sm', '0.8em')};`;
  Object.keys(THEMES).forEach(key => {
    const opt = document.createElement("option");
    opt.value = key; opt.textContent = getThemeLabel(key);
    themeSelect.appendChild(opt);
  });
  themeSelect.value = getGraphTheme() || 'default';
  themeSelect.addEventListener('change', () => {
    setGraphTheme(themeSelect.value);
    getSaveData()();
    draw();
  });
  themeRow.appendChild(themeSelect);

  const resetBtn = document.createElement("button");
  resetBtn.textContent = "恢复默认";
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
    setUseRAFL(defs.defaultUseRAFL as boolean);
    setFocusMode(defs.defaultFocusMode as boolean);
    setGlowAppearance(defs.defaultGlowAppearance as boolean);
    setSelectedTooltip?.((defs.defaultSelectedTooltip as boolean) ?? false);
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
    setAr(defs.defaultAr as number);
    setGraphTheme(defs.defaultGraphTheme as string);
    setCardBorderStyle?.((defs.defaultCardBorderStyle as string) ?? 'straight');
    getInitSim()(); getSaveData()(); draw();
    rebuild();
  };

  // 重建函数：用于加载预设后同步所有值
  function rebuild() {
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    buildAll();
  }

  function buildAll() {
    let _simDebounce: ReturnType<typeof setTimeout> | null = null;
    const debouncedInitSim = () => {
      if (_simDebounce) clearTimeout(_simDebounce);
      _simDebounce = setTimeout(() => { getInitSim()(); }, 150);
    };
    // 先清空再构建，确保无论从哪条路径进入都不会残留旧 DOM
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    // 每次重建时刷新当前图主题（复用同一个 select 元素）
    themeSelect.value = getGraphTheme();
    // 主题
    container.appendChild(themeRow);

    // 高级设置
    const advancedDetails = document.createElement("details");
    advancedDetails.style.cssText = `margin-top:2px;border-top:1px solid ${V('--fg-border-light', 'rgba(255,255,255,0.08)')};padding-top:6px;`;
    const advancedSum = document.createElement("summary");
    advancedSum.textContent = "高级设置";
    advancedSum.style.cssText = `font-size:${V('--fg-font-sm', '0.8em')};cursor:pointer;opacity:0.6;padding:2px 0;`;
    advancedDetails.appendChild(advancedSum);
    const advancedBody = document.createElement("div");
    advancedBody.style.cssText = "padding:4px 0;";

    // 力学
    const mechanicsDet = document.createElement("details");
    const mechSum = document.createElement("summary");
    mechSum.textContent = "力学参数";
    mechSum.style.cssText = `font-size:${V('--fg-font-xs', '0.72em')};cursor:pointer;opacity:0.5;margin-top:6px;`;
    mechanicsDet.appendChild(mechSum);
    const mechBody = document.createElement("div");
    makeSlider(mechBody, "连线距离", 30, 300, getLinkDist(), 1, v => { setLinkDist(v); debouncedInitSim(); getSaveData()(); });
    makeSlider(mechBody, "节点斥力", -500, -10, getCharge(), 10, v => { setCharge(v); debouncedInitSim(); getSaveData()(); });
    makeSlider(mechBody, "连线强度", 0, 1, getLinkStr(), 0.05, v => { setLinkStr(v); debouncedInitSim(); getSaveData()(); });
    makeSlider(mechBody, "碰撞半径", 0, 50, getCollideR(), 1, v => { setCollideR(v); debouncedInitSim(); getSaveData()(); });
    makeSlider(mechBody, "向心强度", 0, 0.2, getCenterS(), 0.01, v => { setCenterS(v); debouncedInitSim(); getSaveData()(); });
    makeSlider(mechBody, "集合边界", 0, 2, getGroupBound(), 0.1, v => { setGroupBound(v); debouncedInitSim(); getSaveData()(); });
    makeSlider(mechBody, "加热时间(秒)", 0, 10, getHeatingTime(), 0.5, v => { setHeatingTime(v); getSaveData()(); });
    makeSlider(mechBody, "目标活跃度", 0, 1, getAlphaTarget(), 0.05, v => { setAlphaTarget(v); debouncedInitSim(); getSaveData()(); });
    mechanicsDet.appendChild(mechBody);
    advancedBody.appendChild(mechanicsDet);

    // 外观
    const appearDet = document.createElement("details");
    const appearSum = document.createElement("summary");
    appearSum.textContent = "外观效果";
    appearSum.style.cssText = `font-size:${V('--fg-font-xs', '0.72em')};cursor:pointer;opacity:0.5;margin-top:4px;`;
    appearDet.appendChild(appearSum);
    const appearBody = document.createElement("div");
    makeSlider(appearBody, "文字大小", 8, 40, getLabelSize(), 1, v => { setLabelSize(v); getSaveData()(); });
    makeSlider(appearBody, "编辑面板透明度", 0, 1, getEditPanelOpacity(), 0.05, v => { setEditPanelOpacity(v); getSaveData()(); });
    makeSlider(appearBody, "节点点击扩展", 0, 20, getNodeExpand(), 1, v => { setNodeExpand(v); getSaveData()(); });
    makeSlider(appearBody, "边点击扩展", 0, 20, getLineExpand(), 1, v => { setLineExpand(v); getSaveData()(); });
    makeCheckbox(appearBody, "节点光晕", getGlowAppearance(), v => { setGlowAppearance(v); draw(); getSaveData()(); });
    makeCheckbox(appearBody, "聚焦模式", getFocusMode(), v => { setFocusMode(v); draw(); getSaveData()(); });
    makeCheckbox(appearBody, "居中模式", getCenterMode(), v => { setCenterMode(v); getSaveData()(); });
    if (getSelectedTooltip) makeCheckbox(appearBody, "选中显示内容", getSelectedTooltip(), v => { setSelectedTooltip!(v); getSaveData()(); });
    if (getNodeColorStyle) {
      const nsRow = document.createElement("div");
      nsRow.style.cssText = "display:flex;gap:6px;align-items:center;margin:3px 0;";
      const nsLb = document.createElement("span");
      nsLb.textContent = "节点默认色";
      nsLb.style.cssText = `font-size:${V('--fg-font-md', '0.85em')};width:${V('--fg-label-width', '110px')};flex-shrink:0;text-align:right;`;
      nsRow.appendChild(nsLb);
      const nsSel = document.createElement("select");
      nsSel.style.cssText = `flex:1;font-size:${V('--fg-font-md', '0.85em')};`;
      (['uniform','hierarchical','spectrum','spectrum-narrow'] as const).forEach(v => {
        const o = document.createElement("option"); o.value = v;
        o.textContent = v === 'uniform' ? '统一' : v === 'hierarchical' ? '分级' : v === 'spectrum-narrow' ? '分级窄' : '多彩分级';
        nsSel.appendChild(o);
      });
      nsSel.value = getNodeColorStyle();
      nsSel.addEventListener('change', () => { setNodeColorStyle!(nsSel.value); draw(); getSaveData()(); });
      nsRow.appendChild(nsSel);
      appearBody.appendChild(nsRow);
    }
    if (getFontFamily) {
      const fsRow = document.createElement("div");
      fsRow.style.cssText = "display:flex;gap:6px;align-items:center;margin:3px 0;";
      const fsLb = document.createElement("span");
      fsLb.textContent = "字体";
      fsLb.style.cssText = `font-size:${V('--fg-font-md', '0.85em')};width:${V('--fg-label-width', '110px')};flex-shrink:0;text-align:right;`;
      fsRow.appendChild(fsLb);
      const fsSel = document.createElement("select");
      fsSel.style.cssText = `flex:1;font-size:${V('--fg-font-md', '0.85em')};`;
      (['system-ui, -apple-system, sans-serif','"SiYuan Songti", serif','"LXGW WenKai", sans-serif','"Noto Serif SC", serif','monospace'] as const).forEach(f => {
        const o = document.createElement("option"); o.value = f;
        o.textContent = f.startsWith('system') ? '系统默认' : f.includes('SiYuan') ? '思源宋体' : f.includes('WenKai') ? '霞鹜文楷' : f.includes('Noto') ? 'Noto 衬线' : '等宽';
        fsSel.appendChild(o);
      });
      fsSel.value = getFontFamily();
      fsSel.addEventListener('change', () => { setFontFamily!(fsSel.value); draw(); getSaveData()(); });
      fsRow.appendChild(fsSel);
      appearBody.appendChild(fsRow);
    }
    if (getEdgeColorGradient) makeCheckbox(appearBody, "连线渐变颜色", getEdgeColorGradient(), v => { setEdgeColorGradient?.(v); draw(); getSaveData()(); });
    if (getEdgeWidthByLevel) makeCheckbox(appearBody, "连线等级粗细", getEdgeWidthByLevel(), v => { setEdgeWidthByLevel?.(v); draw(); getSaveData()(); });
    if (getCardBorderStyle) {
      const cbRow = document.createElement("div");
      cbRow.style.cssText = "display:flex;gap:6px;align-items:center;margin:3px 0;";
      const cbLb = document.createElement("span");
      cbLb.textContent = "卡片边框风格";
      cbLb.style.cssText = `font-size:${V('--fg-font-md', '0.85em')};width:${V('--fg-label-width', '110px')};flex-shrink:0;text-align:right;`;
      cbRow.appendChild(cbLb);
      const cbSel = document.createElement("select");
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
    const glSum = document.createElement("summary");
    glSum.textContent = "集合标签";
    glSum.style.cssText = `font-size:${V('--fg-font-xs', '0.72em')};cursor:pointer;opacity:0.5;margin-top:4px;`;
    groupLabelDet.appendChild(glSum);
    const glBody = document.createElement("div");
    makeCheckbox(glBody, "显示集合标签", getShowGLabels(), v => { setShowGLabels(v); getSaveData()(); });
    makeSlider(glBody, "最小集合标签", 5, 20, getGlMin(), 1, v => { setGlMin(v); getSaveData()(); });
    makeSlider(glBody, "最大集合标签", 10, 50, getGlMax(), 1, v => { setGlMax(v); getSaveData()(); });
    groupLabelDet.appendChild(glBody);
    advancedBody.appendChild(groupLabelDet);

    // 网格
    const gridDet = document.createElement("details");
    const gridSum = document.createElement("summary");
    gridSum.textContent = "网格与坐标轴";
    gridSum.style.cssText = `font-size:${V('--fg-font-xs', '0.72em')};cursor:pointer;opacity:0.5;margin-top:4px;`;
    gridDet.appendChild(gridSum);
    const gridBody = document.createElement("div");
    makeCheckbox(gridBody, "显示网格", getGridVis(), v => { setGridVis(v); getSaveData()(); });
    makeCheckbox(gridBody, "显示坐标轴", getAxisVis(), v => { setAxisVis(v); getSaveData()(); });
    makeCheckbox(gridBody, "坐标轴刻度", getAxisTicks(), v => { setAxisTicks(v); getSaveData()(); });
    makeSlider(gridBody, "网格间距", 10, 100, getGridSp(), 5, v => { setGridSp(v); getSaveData()(); });
    makeSlider(gridBody, "网格线宽", 0.2, 4, getGridWidth(), 0.1, v => { setGridWidth(v); getSaveData()(); });
    gridDet.appendChild(gridBody);
    advancedBody.appendChild(gridDet);

    // 性能
    const perfDet = document.createElement("details");
    const perfSum = document.createElement("summary");
    perfSum.textContent = "性能";
    perfSum.style.cssText = `font-size:${V('--fg-font-xs', '0.72em')};cursor:pointer;opacity:0.5;margin-top:4px;`;
    perfDet.appendChild(perfSum);
    const perfBody = document.createElement("div");
    makeCheckbox(perfBody, "性能模式 (RAF 节流)", getUseRAFL(), v => { setUseRAFL(v); if (getSimulation()) getSimulation()!.alpha(0.3).restart(); getSaveData()(); });
    makeSlider(perfBody, "图区高宽比", 0.3, 1.5, getAr(), 0.05, v => { setAr(v); getSaveData()(); });
    perfDet.appendChild(perfBody);
    advancedBody.appendChild(perfDet);

    advancedDetails.appendChild(advancedBody);
    container.appendChild(advancedDetails);
    container.appendChild(resetBtn);
  }

  buildAll();

  return {
    updateInfo: () => { rebuild(); },
    rebuild: () => { rebuild(); }
  };
}
