import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mainPath = path.join(root, 'src', 'main.ts');
const indexPath = path.join(root, 'index.html');
const workspacePath = path.join(root, 'src', 'workspace-ui.css');

async function importToolbarHelper() {
  const source = await readFile(mainPath, 'utf8');
  const sourceFile = ts.createSourceFile(mainPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const helpers = sourceFile.statements.filter(statement =>
    ts.isFunctionDeclaration(statement)
    && ['calculateToolbarPopoverPosition', 'setupToolbarDropdowns'].includes(statement.name?.text ?? '')
  );
  assert.equal(helpers.length, 2, 'toolbar dropdown helpers must exist');
  const output = ts.transpileModule(helpers.map(helper => helper.getFullText(sourceFile)).join('\n'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

class FakeClassList {
  names = new Set();
  toggle(name, force) {
    if (force) this.names.add(name);
    else this.names.delete(name);
  }
  contains(name) { return this.names.has(name); }
}

class FakeSummary {
  classList = new FakeClassList();
  attributes = new Map();
  focused = false;
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  focus() { this.focused = true; }
}

class FakeDetails extends EventTarget {
  open = false;
  constructor(summary) {
    super();
    this.summary = summary;
  }
  contains(target) { return target === this || target === this.summary; }
  toggle(open) {
    this.open = open;
    this.dispatchEvent(new Event('toggle'));
  }
}

class FakeEventRoot {
  listeners = new Map();
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  emit(type, target, key = '') {
    const event = {
      type,
      target,
      key,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
    };
    for (const listener of this.listeners.get(type) ?? []) listener(event);
    return event;
  }
}

function makePanel() {
  const summary = new FakeSummary();
  return { details: new FakeDetails(summary), summary };
}

test('toolbar dropdown manager synchronizes exclusivity, active state, and aria', async () => {
  const { setupToolbarDropdowns } = await importToolbarHelper();
  const eventRoot = new FakeEventRoot();
  const panels = [makePanel(), makePanel(), makePanel()];
  setupToolbarDropdowns(panels, eventRoot);

  for (const panel of panels) {
    assert.equal(panel.summary.getAttribute('aria-expanded'), 'false');
    assert.equal(panel.summary.classList.contains('is-active'), false);
  }

  panels[0].details.toggle(true);
  assert.equal(panels[0].summary.getAttribute('aria-expanded'), 'true');
  assert.equal(panels[0].summary.classList.contains('is-active'), true);

  panels[1].details.toggle(true);
  assert.equal(panels[0].details.open, false);
  assert.equal(panels[0].summary.getAttribute('aria-expanded'), 'false');
  assert.equal(panels[0].summary.classList.contains('is-active'), false);
  assert.equal(panels[1].details.open, true);
  assert.equal(panels[1].summary.classList.contains('is-active'), true);

  panels[1].details.toggle(false);
  assert.equal(panels[1].summary.getAttribute('aria-expanded'), 'false');
  assert.equal(panels[1].summary.classList.contains('is-active'), false);
});

test('outside pointer and touch close panels while Escape restores summary focus', async () => {
  const { setupToolbarDropdowns } = await importToolbarHelper();
  const eventRoot = new FakeEventRoot();
  const panels = [makePanel(), makePanel(), makePanel()];
  const dispose = setupToolbarDropdowns(panels, eventRoot);

  panels[0].details.toggle(true);
  eventRoot.emit('pointerdown', panels[0].summary);
  assert.equal(panels[0].details.open, true, 'inside pointer must not close its panel');
  eventRoot.emit('pointerdown', {});
  assert.equal(panels[0].details.open, false);

  panels[1].details.toggle(true);
  eventRoot.emit('touchstart', {});
  assert.equal(panels[1].details.open, false);

  panels[2].details.toggle(true);
  const escape = eventRoot.emit('keydown', eventRoot, 'Escape');
  assert.equal(escape.defaultPrevented, true);
  assert.equal(panels[2].details.open, false);
  assert.equal(panels[2].summary.getAttribute('aria-expanded'), 'false');
  assert.equal(panels[2].summary.classList.contains('is-active'), false);
  assert.equal(panels[2].summary.focused, true);

  dispose();
  assert.equal([...eventRoot.listeners.values()].every(listeners => listeners.size === 0), true);
});

test('wide toolbar popovers clamp to both viewport edges', async () => {
  const { calculateToolbarPopoverPosition } = await importToolbarHelper();

  assert.deepEqual(
    calculateToolbarPopoverPosition({ left: 20, right: 80, bottom: 40 }, 360, 1200, 'end'),
    { left: 8, top: 46 },
  );
  assert.deepEqual(
    calculateToolbarPopoverPosition({ left: 1100, right: 1180, bottom: 40 }, 360, 1200, 'start'),
    { left: 832, top: 46 },
  );
  assert.deepEqual(
    calculateToolbarPopoverPosition({ left: 200, right: 280, bottom: 40 }, 1184, 1200, 'end'),
    { left: 8, top: 46 },
  );
});

test('a dropdown uses its full width and opens below both rows of a narrow toolbar', async t => {
  const { setupToolbarDropdowns } = await importToolbarHelper();
  const eventRoot = new FakeEventRoot();
  const frames = [];
  const viewport = Object.assign(new FakeEventRoot(), { innerWidth: 360 });
  const originalWindow = globalThis.window;
  const originalFrame = globalThis.requestAnimationFrame;
  globalThis.window = viewport;
  globalThis.requestAnimationFrame = callback => frames.push(callback);
  t.after(() => {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalFrame === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = originalFrame;
  });
  const panel = makePanel();
  const properties = new Map();
  panel.summary.getBoundingClientRect = () => ({ left: 278, right: 350, bottom: 58 });
  panel.details.parentElement = { getBoundingClientRect: () => ({ bottom: 98 }) };
  panel.popover = {
    offsetWidth: 330,
    getBoundingClientRect: () => ({ width: 320 }),
    style: { setProperty: (name, value) => properties.set(name, value) },
  };
  const dispose = setupToolbarDropdowns([panel], eventRoot);
  panel.details.toggle(true);
  frames.shift()();
  assert.equal(panel.popover.style.left, '22px');
  assert.equal(properties.get('--fg-toolbar-popover-top'), '104px');
  dispose();
});

test('all four canvas dropdowns use the same text-only chrome in the primary toolbar', async () => {
  const source = await readFile(mainPath, 'utf8');

  assert.match(source, /const toolbarSummaryClass = 'fg-toolbar-summary fg-action fg-shell-control';/);
  for (const [summary, label] of [['controlsSum', '工具'], ['layoutSum', '视图'], ['settingsSum', '外观'], ['splitSummary', '分屏']]) {
    assert.ok(source.includes(`${summary}.className = toolbarSummaryClass;`));
    assert.ok(source.includes(`${summary}.textContent = '${label}';`));
  }
  assert.doesNotMatch(source, /splitSummary\.classList\.toggle\('is-active', splitActive\)/);

  assert.match(source, /primaryRow\.appendChild\(controlsDetails\);\s*primaryRow\.appendChild\(layoutDetails\);\s*primaryRow\.appendChild\(settingsDet\);/);
  assert.match(source, /popover: controlsDiv, align: 'start'/);
  assert.match(source, /popover: layoutPopover, align: 'end'/);
  assert.match(source, /popover: setDiv, align: 'end'/);
  assert.match(source, /layoutPopover\.appendChild\(modeRow\);/);
  assert.doesNotMatch(source, /viewIntroStatus|viewIntroHint/);
  assert.match(source, /viewAlternativesSummary\.textContent = '其他观察方式';/);
  assert.match(source, /alternateModeRow\.append\(\s*layoutButton\('自由（力导向）', 'force'/);
  assert.match(source, /const fitAction = viewButton\('全览'/);
  assert.match(source, /viewToolsRow\.appendChild\(fitAction\);/);
  assert.match(source, /semanticLegendDetails\.appendChild\(semanticLegend\);/);
  assert.match(source, /addBtn\.textContent = '\+ 记录';/);
  assert.match(source, /linkBtn\.textContent = '关系';/);
  assert.match(source, /buildSettings\(setDiv,/);
  assert.match(source, /getNodeColorStyle:/);
  assert.match(source, /getFontFamily:/);
  assert.doesNotMatch(source, /setDiv\.appendChild\((?:colorStyleRow|fontStyleRow)\)/);
  assert.doesNotMatch(source, /rightRail|appearanceBtn|modeCollapsed|updateModeToggle/);
  assert.doesNotMatch(source, /floatingTop\.appendChild\(controlsDetails\)/);
});

test('link mode uses the shared aria-pressed active style', async () => {
  const source = await readFile(mainPath, 'utf8');

  assert.match(source, /linkBtn\.className = 'fg-action fg-action-toggle';/);
  assert.match(source, /linkBtn\.setAttribute\('aria-pressed', String\(linkActive\)\);/);
  assert.doesNotMatch(source, /linkBtn\.style\.(?:background|color)\s*=/);
});

test('toolbar CSS provides downward popovers without arrows or hidden mobile layout', async () => {
  const styles = await readFile(indexPath, 'utf8');
  const workspace = await readFile(workspacePath, 'utf8');
  const shell = await readFile(path.join(root, 'src', 'workbench-home.css'), 'utf8');
  const mobile = styles.slice(styles.indexOf('@media (max-width: 720px)'));

  assert.match(styles, /\.fg-toolbar-panel\s*\{/);
  assert.match(styles, /\.fg-toolbar-summary\s*\{[\s\S]*?-webkit-app-region:no-drag/);
  assert.match(styles, /\.fg-toolbar-summary\.is-active\s*\{/);
  assert.match(styles, /\.fg-toolbar-popover\s*\{[\s\S]*?position:fixed;[\s\S]*?max-width:calc\(100vw - 16px\)/);
  assert.match(styles, /\.fg-tools-content\s*\{[\s\S]*?width:min\(480px,/);
  assert.match(styles, /\.fg-layout-popover\s*\{[\s\S]*?width:min\(760px, calc\(100vw - 16px\)\)/);
  assert.match(styles, /\.fg-appearance-content\s*\{[\s\S]*?width:min\(360px, calc\(100vw - 16px\)\);[\s\S]*?max-height:min\(70vh,[\s\S]*?overflow:auto/);
  assert.doesNotMatch(styles, /\.fg-toolbar-summary::(?:before|after)/);
  assert.doesNotMatch(styles, /\.fg-(?:tools|layout|appearance)[^\{]*::after/);
  assert.doesNotMatch(styles, /fg-right-rail|content:\s*['"][⌄⌃×]/);

  const shellRule = shell.match(/\.fg-shell-toolbar\s*\{([^}]*)\}/)[1];
  assert.doesNotMatch(shellRule, /backdrop-filter:|overflow:\s*(?:hidden|auto)/);
  assert.match(shell, /\.fg-shell-toolbar::before\s*\{[^}]*background: var\(--ns-panel,[^}]*backdrop-filter: var\(--ns-frosted-filter\);[^}]*pointer-events: none;/);
  assert.match(workspace, /\.fg-editor-tools \.fg-toolbar-popover\s*\{[^}]*top: var\(--fg-toolbar-popover-top, 56px\)/);
  assert.doesNotMatch(mobile, /\.fg-toolbar-popover\s*\{/);
  assert.doesNotMatch(mobile, /fg-(?:layout-panel|mode-switcher)[^\{]*\{[^}]*display\s*:\s*none/);
});
