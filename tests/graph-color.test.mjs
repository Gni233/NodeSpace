import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url), ts = require('typescript');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const read = file => readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
const color = await import(url(compile(await read('utils/color.ts'))));
const editor = ts.createSourceFile('ui-edit.ts', await read('ui-edit.ts'), ts.ScriptTarget.ES2022, true);
const main = ts.createSourceFile('main.ts', await read('main.ts'), ts.ScriptTarget.ES2022, true);
const edges = ts.createSourceFile('pixi-edges.ts', await read('pixi-edges.ts'), ts.ScriptTarget.ES2022, true);

function expression(file, name, context) {
  let initializer;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name) initializer = node.initializer;
    if (!initializer) ts.forEachChild(node, visit);
  };
  visit(file); assert.ok(initializer, name);
  return new Function('context', `with(context) { ${compile(`const value = ${initializer.getText(file)};`)}\nreturn value; }`)(context);
}

test('legacy placeholders keep following themes while explicit black and grey remain real choices', () => {
  for (const value of ['#000000', '#000000FF', '#000']) assert.equal(color.getExplicitGraphColor({ color: value }, 'node'), null);
  for (const value of ['#bfbfbf', '#BFBFBFFF']) assert.equal(color.getExplicitGraphColor({ color: value }, 'edge'), null);
  assert.equal(color.getExplicitGraphColor({ color: '#000000', colorMode: 'custom' }, 'node'), '#000000');
  assert.equal(color.getExplicitGraphColor({ color: '#BFBFBF', colorMode: 'custom' }, 'edge'), '#BFBFBF');
  assert.equal(color.getExplicitGraphColor({ color: '#a8563e' }, 'node'), '#a8563e');
  assert.equal(color.getExplicitGraphColor({ color: '#fff' }, 'node'), '#ffffff');
  assert.equal(color.getExplicitGraphColor({ color: 'invalid' }, 'node'), null);
  const record = { color: '#000000', colorMode: 'custom', label: '保留内容' };
  color.setGraphColorOverride(record, null);
  assert.deepEqual(record, { label: '保留内容' });
});

test('media readers follow graph themes and preserve explicit node colors', async () => {
  const theme = await import(url(compile(await read('theme.ts'))));
  const declaration = main.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'mediaAccentForNode');
  const resolve = new Function('getExplicitGraphColor', `${compile(declaration.getText(main)).replace('export ', '')}\nreturn mediaAccentForNode;`)(color.getExplicitGraphColor);
  for (const config of Object.values(theme.THEMES)) {
    assert.equal(resolve({}, config), config.accentColor || config.nodeDefaultColor);
    assert.equal(resolve({ color: '#000000' }, config), config.accentColor || config.nodeDefaultColor);
    assert.equal(resolve({ color: '#000000', colorMode: 'custom' }, config), '#000000');
    assert.equal(resolve({ color: '#738899' }, config), '#738899');
    assert.equal(resolve({ color: '#738899', colorMode: 'theme' }, config), config.accentColor || config.nodeDefaultColor);
  }
});

test('paint reads the current graph color, including clearing an override on a stale simulation node', () => {
  const node = { id: 'n', color: '#000000', colorMode: 'custom' };
  const context = { getExplicitGraphColor: color.getExplicitGraphColor, graphNodeById: new Map([['n', node]]),
    st: { nodeColorStyle: 'uniform' }, theme: { nodeDefaultColor: '#a8563e' } };
  const resolve = expression(main, 'resolveNodeColor', context);
  const stale = { id: 'n', color: '#5B8FF9', colorMode: 'custom' };
  assert.equal(resolve(stale), '#000000');
  color.setGraphColorOverride(node, null);
  assert.equal(resolve(stale), '#a8563e');
  context.theme.nodeDefaultColor = '#ACDCC5';
  assert.equal(resolve(stale), '#ACDCC5');
});

test('paper nodes inherit Claude heading colors only in hierarchical mode', async () => {
  const { getTheme } = await import(url(compile(await read('theme.ts'))));
  const node = { id: 'a', headingLevel: 1 };
  const context = { getExplicitGraphColor: color.getExplicitGraphColor, graphNodeById: new Map([['a', node]]),
    st: { nodeColorStyle: 'hierarchical' }, theme: getTheme('paper-light'), accentHex: '#a8563e', isDarkTheme: false,
    getHeadingColor: () => 0x123456, getSpectrumColor: () => 0x456789, getNarrowSpectrumColor: () => 0x56789a };
  context.defaultNodeColor = expression(main, 'defaultNodeColor', context);
  const resolve = expression(main, 'resolveNodeColor', context);
  const stale = { id: node.id, headingLevel: 6 };
  for (const [index, hex] of ['#96442b', '#7c3620', '#a8751f', '#3e8153', '#3e6b58', '#8c5f72'].entries()) {
    node.headingLevel = index + 1;
    assert.equal(resolve(stale), hex);
  }
  node.headingLevel = undefined;
  assert.equal(resolve(stale), '#8c5f72');
  color.setGraphColorOverride(node, '#2468ac'); assert.equal(resolve(stale), '#2468ac');
  color.setGraphColorOverride(node, null);
  for (const [mode, expected] of [['uniform', '#a8563e'], ['spectrum', '#456789'], ['spectrum-narrow', '#56789a']]) {
    context.st.nodeColorStyle = mode;
    assert.equal(resolve(stale), expected);
  }
  context.st.nodeColorStyle = 'hierarchical'; context.theme = getTheme('nord-dark');
  assert.equal(resolve(stale), '#123456');
});

test('semantic edge paint preserves curated theme colors and explicit legacy-grey choices', () => {
  const context = { conflict: false, userDashed: false, semanticMode: true, explicitColor: null,
    opts: { semanticColors: { explicit: '#8b8170' } }, grammar: { role: 'explicit' }, e: {} };
  assert.equal(expression(edges, 'baseColor', context), '#8b8170');
  context.explicitColor = '#BFBFBF';
  assert.equal(expression(edges, 'baseColor', context), '#BFBFBF');
  const gradient = { useGradient: true, explicitColor: '#BFBFBF' };
  assert.equal(expression(edges, 'edgeGradient', gradient), false);
  gradient.explicitColor = null;
  assert.equal(expression(edges, 'edgeGradient', gradient), true);
});

class Element {
  constructor(tag, options = {}) { this.tagName = tag.toUpperCase(); this.style = {}; this.children = []; this.attributes = { ...options.attrs }; this.textContent = options.text || ''; this.events = new Map(); }
  appendChild(child) { this.children.push(child); }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(name, callback) { this.events.set(name, callback); }
}

test('color controls refresh on selection and expose accessible preset and theme buttons', () => {
  const context = { ...color, colors: color.GRAPH_EDITOR_COLORS, el: (tag, options) => new Element(tag, options), gCont: {},
    inheritedColorPickers: new Set(), touchedControls: new Set(), colorControls: new Map(), formBaseline: new Map(),
    ctx: { graph: {} }, displayedItem: {},
    getComputedStyle: () => ({ getPropertyValue: () => '#a8563e' }),
    begins: 0, saves: 0, beginPropertyEdit() { this.begins++; }, saveCurrent() { this.saves++; } };
  context.beginPropertyEdit = () => { context.begins++; }; context.saveCurrent = () => { context.saves++; };
  const picker = new Element('input'); picker.value = '#000000'; picker.click = () => {};
  const root = expression(editor, 'makeColorPresets', context)(picker, 'node');
  const control = context.colorControls.get(picker), swatch = root.children[0].children[0], theme = root.children[0].children[1];
  const buttons = [...root.children[0].children, ...root.children[1].children];
  control.sync({ color: '#E8684A', colorMode: 'custom' });
  assert.equal(swatch.style.background, '#E8684A'); // Existing vivid overrides remain available.
  control.sync({ color: '#8B9270', colorMode: 'custom' });
  assert.equal(swatch.style.background, '#8B9270');
  assert.equal(buttons.find(button => button.attributes['aria-label'] === '使用颜色 #8B9270').attributes['aria-pressed'], 'true');
  control.sync({});
  assert.equal(swatch.style.background, 'var(--fg-accent)');
  assert.equal(theme.attributes['aria-pressed'], 'true');
  context.getComputedStyle = () => ({ getPropertyValue: () => '#ACDCC5' });
  swatch.onclick();
  assert.equal(picker.value, '#ACDCC5');
  assert.equal(context.formBaseline.get(picker), '#ACDCC5');
  assert.equal(context.saves, 0);
  buttons.find(button => button.attributes['aria-label'] === '使用颜色 #A8563E').onclick();
  assert.equal(context.inheritedColorPickers.has(picker), false);
  assert.equal(context.saves, 1);
  theme.onclick(); theme.onclick();
  assert.equal(context.inheritedColorPickers.has(picker), true);
  assert.equal(context.saves, 2);
  assert.ok(buttons.every(button => button.tagName === 'BUTTON' && button.attributes.type === 'button'));
});
