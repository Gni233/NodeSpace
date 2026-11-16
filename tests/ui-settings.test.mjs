import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
const ts = createRequire(import.meta.url)('typescript');
const compile = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const load = async path => import(`data:text/javascript;base64,${Buffer.from(compile(await readFile(new URL(path, import.meta.url), 'utf8'))).toString('base64')}`);
const theme = await load('../src/theme.ts'), density = await load('../src/force-density-presets.ts');
const { bindContextMenuTrigger } = await load('../src/context-menu-trigger.ts');
const source = await readFile(new URL('../src/ui-settings.ts', import.meta.url), 'utf8');
const panelSource = await readFile(new URL('../src/settings-panel.ts', import.meta.url), 'utf8');
const workspaceStyles = await readFile(new URL('../src/workspace-ui.css', import.meta.url), 'utf8');
const panelCode = compile(panelSource.replace(/^import .*;\r?\n/gm, '').replace(/export /g, '')).replace('export {};', '');
const code = compile(source.replace(/import[\s\S]*?from ["'][^"']+["'];/g, '').replace('export function', 'function')).replace('export {};', '');
const HUAWEN_CANVAS_FONT = '"NodeSpace STZhongsong", serif';

function fixture(scope = 'current', fontAvailable = false, savedFont = 'My Saved Font, serif') {
  const document = { activeElement: null };
  class Element {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.classList = { add: value => this.className += ' ' + value, remove: value => { this.className = this.className.split(' ').filter(x => x !== value).join(' '); } }; }
    isConnected = true; dataset = {}; attributes = {}; style = { setProperty(key, value) { this[key] = value; } }; children = []; className = ''; open = false;
    setAttribute(key, value) { this.attributes[key] = value; }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    appendChild(child) { child.parentElement?.removeChild(child); child.parentElement = this; this.children.push(child); }
    removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentElement = null; }
    replaceChildren() { for (const child of this.children) child.parentElement = null; this.children = []; }
    get firstChild() { return this.children[0]; }
    contains(el) { return el === this || this.children.some(child => child.contains(el)); }
    matches(selector) { if (selector === '[data-setting-key]') return !!this.dataset.settingKey; if (selector.startsWith('.')) return this.className.split(' ').includes(selector.slice(1)); return this.tagName === selector.toUpperCase(); }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0]; }
    listeners = {};
    addEventListener(name, fn) { (this.listeners[name] ??= []).push(fn); }
    emit(name) { for (const fn of this.listeners[name] ?? []) fn({ target: this }); }
    focus() { document.activeElement = this; }
  }
  document.createElement = tag => new Element(tag);
  const timers = []; let activeOwner = 'first';
  const env = { document, ...theme, ...density, HUAWEN_CANVAS_FONT, hasHuawenCanvasFont: () => fontAvailable,
    V: (_, fallback) => fallback, setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout(id) { timers[id - 1] = null; } };
  const build = new Function(...Object.keys(env), code + '\nreturn buildSettings;')(...Object.values(env));
  const state = { LinkDist: 120, LabelSize: 14, Charge: -100, LinkStr: .3, CollideR: 10, CenterS: .02, GroupBound: .8, HeatingTime: 2, AlphaTarget: .2,
    EditPanelOpacity: 1, GlMin: 8, GlMax: 20, GridSp: 30, GridWidth: 1, Ar: 1, GraphTheme: 'paper-light', NodeColorStyle: 'hierarchical', FontFamily: savedFont, CardBorderStyle: 'rounded' };
  const defs = new Proxy({ defaultGraphTheme: 'constellation-dark', defaultFontFamily: 'Another Font', defaultNodeColorStyle: 'uniform', defaultCardBorderStyle: 'straight' }, { get: (obj, key) => obj[key] ?? 1 });
  const calls = [];
  const params = new Proxy({ scope, graph: {}, getDefaultValues: () => defs, getSaveData: () => () => calls.push('save'), getInitSim: () => { const owner = activeOwner; return () => calls.push(['layout', owner]); }, getSimulation: () => null, draw: () => calls.push('draw') }, {
    get(obj, key) { if (key in obj) return obj[key]; if (key.startsWith('get')) return () => state[key.slice(3)] ?? false; if (key.startsWith('set')) return value => { state[key.slice(3)] = value; calls.push([key, value]); }; },
  });
  const container = new Element('div'), api = build(container, params);
  const control = key => container.querySelectorAll('[data-setting-key]').find(item => item.dataset.settingKey === key);
  const mountPanel = () => {
    const panelCalls = [];
    const ctx = { document, window: { innerWidth: 1200, addEventListener() {} }, V: env.V, Z_SETTINGS_PANEL: 50, confirmAction: async () => true, safePrompt: async () => null, bindContextMenuTrigger };
    const factory = new Function(...Object.keys(ctx), panelCode + '\nreturn createSettingsPanel;')(...Object.values(ctx));
    const panel = factory(container, new Element('div'), { getPresets: () => [{ name: 'Paper' }], onLoadPreset: name => panelCalls.push(['load', name]), onDeletePreset: name => panelCalls.push(['delete', name]), onSavePreset() {}, onResetDefaults() {} });
    return { ...panel, calls: panelCalls };
  };
  return { timers, switchOwner: value => { activeOwner = value; }, mountPanel, container, api, state, calls, control, document, mount: () => { const other = new Element('div'); build(other, params); return other; } };
}

test('local Huawen font is selectable across scopes when available and labeled when missing', () => {
  for (const scope of ['current', 'defaults']) {
    const available = fixture(scope, true);
    const picker = available.control('font');
    assert.equal(picker.value, 'My Saved Font, serif');
    const installedOption = picker.children.find(option => option.value === HUAWEN_CANVAS_FONT);
    assert.equal(installedOption.textContent, '华文中宋');
    assert.equal(installedOption.disabled, false);
    picker.value = HUAWEN_CANVAS_FONT;
    picker.emit('change');
    assert.equal(available.state.FontFamily, HUAWEN_CANVAS_FONT);
    assert.ok(!fixture(scope).control('font').children.some(option => option.value === HUAWEN_CANVAS_FONT));
    const missing = fixture(scope, false, HUAWEN_CANVAS_FONT).control('font');
    assert.equal(missing.value, HUAWEN_CANVAS_FONT);
    const missingOption = missing.children.find(option => option.value === HUAWEN_CANVAS_FONT);
    assert.equal(missingOption.textContent, '华文中宋（未导入）');
    assert.equal(missingOption.disabled, true);
  }
});

test('every settings input is named and simultaneous forms use unique label targets', () => {
  const f = fixture(), forms = [f.container, f.mount()];
  const ids = [];
  for (const form of forms) {
    const labels = form.querySelectorAll('label');
    for (const control of [...form.querySelectorAll('input'), ...form.querySelectorAll('select')]) {
      assert.ok(control.attributes['aria-label'] || labels.some(label => label.htmlFor === control.id && control.id || label.contains(control)), control.dataset.settingKey);
      if (control.id) ids.push(control.id);
    }
  }
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(f.control('theme').children.length, Object.keys(theme.THEMES).length);
});

test('the six-level preview follows the current theme and hierarchical mode', () => {
  const f = fixture(), palette = f.container.querySelector('.fg-setting-heading-palette');
  assert.equal(palette.hidden, false);
  assert.deepEqual(palette.children.map(sample => sample.textContent), ['1', '2', '3', '4', '5', '6']);
  assert.deepEqual(palette.children.map(sample => sample.style['--heading-swatch']), [...theme.getTheme('paper-light').headingColors]);
  const mode = f.control('node-color'); mode.value = 'uniform'; mode.emit('change');
  assert.equal(palette.hidden, true);
  mode.value = 'hierarchical'; mode.emit('change'); assert.equal(palette.hidden, false);
  const scheme = f.control('theme'); scheme.value = 'nord-dark'; scheme.emit('change');
  assert.equal(palette.hidden, true);
  scheme.value = 'paper-light'; scheme.emit('change');
  assert.equal(palette.hidden, false);
  assert.equal(palette.children.length, 6);
});

test('density rebuild retains keyboard focus, detail disclosures and saved custom font', () => {
  const f = fixture(); const details = f.container.querySelectorAll('details'); details[0].open = true; details[1].open = true;
  f.control('density').focus(); f.control('density').value = '密'; f.control('density').emit('change');
  assert.equal(f.document.activeElement, f.control('density'));
  assert.ok(f.container.querySelectorAll('details')[0].open && f.container.querySelectorAll('details')[1].open);
  assert.equal(f.control('font').value, 'My Saved Font, serif');
  assert.ok(f.control('font').children.some(option => option.value === 'My Saved Font, serif'));
  assert.equal(f.container.querySelector('.fg-settings-feedback').textContent, '已应用密布局');
  assert.equal(f.state.LinkDist, density.FORCE_DENSITY_PRESETS['密'].linkDist);
});

test('expanded appearance details retain their content height inside the scrollable toolbar popup', () => {
  const f = fixture();
  const advanced = f.container.querySelector('.fg-settings-advanced');
  assert.equal(advanced.parentElement, f.container);
  assert.equal(advanced.children[0].textContent, '详细参数');
  assert.equal(advanced.querySelectorAll('details').length, 4);
  assert.ok(advanced.contains(f.control('density')));
  assert.match(workspaceStyles, /\.fg-editor-tools \.fg-toolbar-popover\s*\{[^}]*max-height:[^;]+;[^}]*overflow: auto;/);
  assert.match(workspaceStyles, /\.fg-appearance-content > \.fg-settings-advanced\s*\{[^}]*flex-shrink: 0;/);
});

test('changing advanced grid and label parameters saves and redraws a static canvas immediately', () => {
  const f = fixture();
  for (const [key, setter] of [['显示网格', 'setGridVis'], ['显示坐标轴', 'setAxisVis'],
    ['坐标轴刻度', 'setAxisTicks'], ['显示集合标签', 'setShowGLabels']]) {
    const checkbox = f.control(key);
    checkbox.checked = true;
    checkbox.emit('change');
    assert.deepEqual(f.calls.splice(0), [[setter, true], 'draw', 'save']);
  }
  for (const [key, setter, value] of [['网格间距', 'setGridSp', 50], ['网格线宽', 'setGridWidth', 1.2],
    ['最小集合标签', 'setGlMin', 10], ['最大集合标签', 'setGlMax', 32]]) {
    const input = f.control(`${key}:range`);
    input.value = String(value);
    input.emit('input');
    assert.deepEqual(f.calls.splice(0), [[setter, value], 'draw', 'save']);
  }
});

test('number fields clamp committed values and reject invalid input without persisting NaN', () => {
  const f = fixture(), input = f.control('文字大小:number');
  input.value = '1000'; input.emit('change'); assert.equal(f.state.LabelSize, 40); assert.equal(f.control('文字大小:range').value, '40');
  input.value = ''; input.emit('change'); assert.equal(f.state.LabelSize, 40); assert.equal(input.value, '40');
  input.value = 'Infinity'; input.emit('change'); assert.equal(f.state.LabelSize, 40);
  input.value = '12'; input.emit('change'); assert.equal(f.state.LabelSize, 12);
});

test('reset applies font and color defaults in the correct independently built settings scope', () => {
  const current = fixture(), defaults = fixture('defaults');
  const reset = current.control('reset'); reset.focus(); reset.onclick();
  assert.equal(current.state.FontFamily, 'Another Font'); assert.equal(current.state.NodeColorStyle, 'uniform');
  assert.equal(defaults.state.FontFamily, 'My Saved Font, serif');
  assert.equal(current.document.activeElement, current.control('reset'));
  assert.match(current.container.querySelector('.fg-settings-scope-note').textContent, /当前空间/);
  assert.equal(defaults.container.querySelector('.fg-settings-scope-note').textContent, '新空间默认样式');
  assert.equal(current.control('font').value, 'Another Font');
});

test('theme and custom font changes call the supplied scoped setters without erasing preferences', () => {
  const f = fixture('defaults');
  f.control('theme').value = 'dracula'; f.control('theme').emit('change');
  assert.equal(f.state.GraphTheme, 'dracula');
  f.control('font').value = '"SiYuan Songti", serif'; f.control('font').emit('change');
  f.api.rebuild(); assert.equal(f.control('font').value, '"SiYuan Songti", serif');
  assert.equal(f.state.GraphTheme, 'dracula');
  const outside = f.document.createElement('input'); outside.focus(); f.api.updateInfo(); assert.equal(f.document.activeElement, outside);
});


test('application settings focus their close control, restore the opener and expose a separate preset delete button', async () => {
  const f = fixture(), panel = f.mountPanel();
  const opener = f.document.createElement('button'); opener.focus();
  panel.show(); assert.equal(f.document.activeElement, panel.panel.querySelector('.fg-dialog-close'));
  panel.hide(); assert.equal(f.document.activeElement, opener);
  panel.show();
  const remove = panel.panel.querySelector('.fg-settings-preset-remove');
  assert.equal(remove.tagName, 'BUTTON'); assert.equal(remove.attributes['aria-label'], '删除方案 Paper');
  await remove.onclick(); assert.deepEqual(panel.calls, [['delete', 'Paper']]);
  const event = { key: 'Escape', preventDefault() {}, stopPropagation() {} };
  for (const handler of panel.panel.listeners.keydown) handler(event);
  assert.equal(panel.panel.style.display, 'none'); assert.equal(f.document.activeElement, opener);
});


test('deferred mechanics changes restart the originating pane even if focus switches before the timer fires', () => {
  const f = fixture();
  f.control('连线距离:range').value = '180'; f.control('连线距离:range').emit('input');
  f.switchOwner('second');
  f.timers.filter(Boolean).forEach(fn => fn());
  assert.deepEqual(f.calls.filter(call => Array.isArray(call) && call[0] === 'layout'), [['layout', 'first']]);
});
