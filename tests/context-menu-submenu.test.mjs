import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const toModuleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

async function loadMenuTree() {
  const source = await readFile(path.join(root, 'src', 'ui-contextmenu.ts'), 'utf8');
  const orderSource = await readFile(path.join(root, 'src', 'context-wheel-order.ts'), 'utf8');
  const compilerOptions = { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 };
  const orderUrl = toModuleUrl(ts.transpileModule(orderSource, { compilerOptions }).outputText);
  const sharedStateStub = 'export const sharedState = {};';
  const layoutConstantsStub = 'export const Z_CONTEXT_MENU = 1; export const V = (_name, fallback) => fallback;';
  const moduleSource = source
    .replace("import './node-context-wheel.css';", '')
    .replace("from './context-wheel-order'", `from "${orderUrl}"`)
    .replace('from "./shared-state"', `from "${toModuleUrl(sharedStateStub)}"`)
    .replace('from "./layout-constants"', `from "${toModuleUrl(layoutConstantsStub)}"`);
  const output = ts.transpileModule(
    `${moduleSource}\nexport { sharedState };`,
    { compilerOptions },
  ).outputText;
  return import(toModuleUrl(output));
}

const contextMenu = await loadMenuTree();

function fakeMenu(inside) {
  return {
    removed: 0,
    contains(target) { return target === inside; },
    remove() { this.removed += 1; },
  };
}

test('context-menu tree owns root and submenu lifecycle as one unit', () => {
  const rootTarget = {};
  const submenuTarget = {};
  const rootMenu = fakeMenu(rootTarget);
  const submenu = fakeMenu(submenuTarget);
  const menus = new contextMenu.ContextMenuTree();

  menus.register(rootMenu);
  menus.register(submenu);
  assert.equal(menus.size, 2);
  assert.equal(menus.contains(rootTarget), true);
  assert.equal(menus.contains(submenuTarget), true);
  assert.equal(menus.contains({}), false);

  // Reopening a submenu removes the prior submenu while retaining the root.
  menus.closeAllExcept(rootMenu);
  assert.equal(submenu.removed, 1);
  assert.equal(rootMenu.removed, 0);
  assert.equal(menus.size, 1);

  const reopenedSubmenu = fakeMenu({});
  menus.register(reopenedSubmenu);
  menus.closeAll();
  assert.equal(rootMenu.removed, 1);
  assert.equal(reopenedSubmenu.removed, 1);
  assert.equal(menus.size, 0);
});

test('context menu routes all outside handling through the menu tree', async () => {
  const source = await readFile(path.join(root, 'src', 'ui-contextmenu.ts'), 'utf8');

  assert.match(source, /const openMenus = new ContextMenuTree<HTMLElement>\(\);/);
  assert.match(source, /export function closeContextMenu\(\) \{\s*openMenus\.closeAll\(\);/);
  assert.match(source, /!openMenus\.contains\(e\.target as Node \| null\)/);
  assert.match(source, /openMenus\.closeAllExcept\(menu\);\s*container\.appendChild\(sub\);\s*openMenus\.register\(sub\);/);
  assert.match(source, /item\.action\?\.\(\);\s*closeContextMenu\(\);/);
  assert.doesNotMatch(source, /onSubClose/);
  assert.match(source, /if \(currentMenu !== menu\) return;/);
});

test('node wheel keeps its concentric fans, supports drag ordering, and restores scoped preferences', t => {
  const document = { listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }, removeEventListener(type) { delete this.listeners[type]; } };
  const window = { ...document, listeners: {}, innerWidth: 800, innerHeight: 600,
    getComputedStyle: () => ({ getPropertyValue: name => window.innerWidth === 390 && name === '--fg-wheel-safe-right' ? '26px' : '' }),
  };
  let hitTarget = null;
  document.elementFromPoint = () => hitTarget;
  class Element {
    children = [];
    className = '';
    dataset = {};
    attributes = {};
    listeners = {};
    style = { setProperty(name, value) { this[name] = value; } };
    classList = { add: value => { this.className += ` ${value}`; }, toggle: (value, enabled) => { if (enabled) this.classList.add(value); } };
    offsetWidth = 160;
    offsetHeight = 100;
    appendChild(child) { this.children.push(child); child.parent = this; }
    contains(target) { return this === target || this.children.some(child => child.contains(target)); }
    remove() {
      this.parent.children = this.parent.children.filter(child => child !== this);
      this.parent = null;
      if (this.contains(document.activeElement)) document.activeElement = document.body;
    }
    get isConnected() { return this === document.body || !!this.parent?.isConnected; }
    closest(selector) { return this.className.split(' ').includes(selector.slice(1)) ? this : this.parent?.closest(selector) ?? null; }
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name]; }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    focus() { document.activeElement = this; }
    click() { this.onclick?.(); }
  }
  document.body = new Element();
  document.createElement = () => new Element();
  const timers = new Map();
  let nextTimer = 0;
  const setTimeout = (callback, delay) => {
    const id = ++nextTimer;
    if (delay === 0) callback();
    else timers.set(id, callback);
    return id;
  };
  const clearTimeout = id => timers.delete(id);
  const runHover = () => {
    for (const [id, callback] of [...timers]) {
      timers.delete(id);
      callback();
    }
  };
  const menuStorage = new Map();
  const localStorage = { getItem: key => menuStorage.get(key), setItem: (key, value) => menuStorage.set(key, value) };
  const previous = Object.fromEntries(['document', 'window', 'HTMLElement', 'setTimeout', 'clearTimeout', 'localStorage'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries({ document, window, HTMLElement: Element, setTimeout, clearTimeout, localStorage })) {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
  t.after(() => {
    contextMenu.closeContextMenu();
    delete contextMenu.sharedState.clearSelection;
    for (const [name, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });

  const container = new Element();
  document.body.appendChild(container);
  container.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
  const opener = new Element();
  opener.focus();
  const calls = [];
  let focusWhenInvoked;
  const action = label => ({ label, action: () => { focusWhenInvoked = document.activeElement; calls.push(label); } });
  const commands = ['edit', 'child', 'link', 'pin'].map(icon => ({ icon, item: action(icon) }));
  const remaining = [
    action('duplicate'),
    { label: '共享到', children: [{ label: '笔记', children: [action('图 A')] }] },
    ...['折叠', '展开', '移动', '重命名', '标记', '删除'].map(action),
  ];
  const fallbackItems = [...commands.map(command => command.item), ...remaining];
  const open = options => contextMenu.showContextWheel(container, 795, 590, commands, remaining, fallbackItems, options);
  const press = (menu, key) => menu.listeners.keydown({ key, stopPropagation() {}, preventDefault() {} });
  const pointer = { pointerType: 'mouse', clientX: 600, clientY: 420 };
  const label = button => button.children[0]?.children.at(-1)?.textContent;
  const wedge = (ring, text) => {
    const button = ring.children.find(button => label(button) === text);
    assert.ok(button, `Expected a wedge for ${text}`);
    return button;
  };

  open();
  const [wheel] = container.children;
  const [initial] = wheel.children;
  assert.equal(wheel.className, 'fg-node-wheel');
  assert.equal(wheel.style.left, '645px');
  assert.equal(wheel.style.top, '445px');
  assert.equal(initial.children.length, 5);
  assert.equal(document.activeElement, initial.children[0]);
  assert.ok(initial.children.every(button => /^path\("M .* A 146 146 .* L .* A 52 52 .* Z"\)$/.test(button.style['--fg-wheel-sector'])));
  press(wheel, 'ArrowRight');
  assert.notEqual(document.activeElement, initial.children[0]);
  press(wheel, 'End');
  assert.equal(label(document.activeElement), '更多');
  assert.notEqual(document.activeElement.style['--fg-wheel-y'], '0px');
  press(wheel, 'Home');
  assert.equal(document.activeElement, initial.children[0]);
  initial.children[0].listeners.pointerenter(pointer);
  runHover();
  assert.deepEqual(calls, []);
  initial.children[0].click();
  assert.deepEqual(calls, ['edit']);
  assert.equal(container.children.length, 0);

  open();
  const [expanded] = container.children;
  const [primary] = expanded.children;
  const more = wedge(primary, '更多');
  more.listeners.pointerenter(pointer);
  more.listeners.pointerleave();
  runHover();
  assert.equal(expanded.children.length, 1);
  more.listeners.pointerenter(pointer);
  runHover();
  more.listeners.pointerleave();
  const [retainedPrimary, second] = expanded.children;
  assert.equal(retainedPrimary, primary);
  assert.equal(more.getAttribute('aria-expanded'), 'true');
  assert.equal(second.children.length, remaining.length);
  assert.deepEqual(second.children.map(label), remaining.map(item => item.label));
  assert.ok(second.children.every(button => / A 153 153 /.test(button.style['--fg-wheel-sector'])));
  assert.notEqual(expanded.style.top, '445px');
  wedge(second, '共享到').listeners.pointerenter(pointer);
  runHover();
  assert.equal(expanded.children.length, 2);
  wedge(second, '共享到').click();
  assert.equal(label(document.activeElement), '笔记');
  document.activeElement.click();
  assert.equal(expanded.children.length, 4);
  assert.equal(label(document.activeElement), '图 A');
  press(expanded, 'Escape');
  assert.equal(label(document.activeElement), '笔记');
  press(expanded, 'Backspace');
  assert.equal(label(document.activeElement), '共享到');
  press(expanded, 'Escape');
  assert.equal(label(document.activeElement), '更多');
  press(expanded, 'Escape');
  assert.equal(container.children.length, 0);
  assert.equal(document.activeElement, opener);

  window.innerWidth = 390;
  let selectionClears = 0;
  contextMenu.sharedState.clearSelection = () => { selectionClears++; };
  open({ label: '空间操作', returnFocus: () => opener, clearSelection: false });
  const [compactWheel] = container.children;
  assert.equal(compactWheel.className, 'fg-node-wheel');
  assert.equal(compactWheel.getAttribute('aria-label'), '空间操作');
  const diameter = parseFloat(compactWheel.children[0].style['--fg-wheel-diameter']);
  assert.ok(parseFloat(compactWheel.style.left) + diameter / 2 <= 390 - 26 - 8);
  const compactMore = wedge(compactWheel.children[0], '更多');
  const tap = button => { button.listeners.pointerdown({ button: 0, pointerType: 'touch' }); button.click(); };
  tap(compactMore);
  assert.equal(compactWheel.children.length, 2);
  assert.equal(compactMore.getAttribute('aria-expanded'), 'true');
  compactMore.listeners.pointerdown({ button: 0, pointerType: 'touch' });
  compactMore.listeners.pointercancel();
  compactMore.click();
  assert.equal(compactWheel.children.length, 2);
  tap(compactMore);
  assert.equal(compactWheel.children.length, 1);
  assert.equal(compactMore.getAttribute('aria-expanded'), 'false');

  window.innerWidth = 200;
  open({ label: '空间操作', returnFocus: () => opener, clearSelection: false });
  const [fallback] = container.children;
  assert.match(fallback.className, /fg-context-menu/);
  assert.equal(fallback.getAttribute('aria-label'), '空间操作');
  assert.equal(fallback.children.length, fallbackItems.length);
  document.listeners.pointerdown({ target: document.body });
  assert.equal(container.children.length, 0);
  assert.equal(document.activeElement, opener);
  assert.equal(selectionClears, 0);

  window.innerWidth = 800;
  open({ label: '空间操作', returnFocus: opener, clearSelection: false });
  container.children[0].children[0].children[0].click();
  assert.equal(focusWhenInvoked, opener);
  assert.equal(selectionClears, 0);

  const actions = Array.from({ length: 9 }, (_, index) => action(`动作 ${index + 1}`));
  const swatchAction = { ...actions[8], icon: 'color', swatch: '#4477aa' };
  actions[8] = swatchAction;
  contextMenu.showActionWheel(container, 300, 300, actions);
  const [actionWheel] = container.children;
  const [actionRing] = actionWheel.children;
  assert.deepEqual(actionRing.children.map(label), [...actions.slice(0, 6).map(item => item.label), '更多']);
  wedge(actionRing, '更多').click();
  const [swatch] = wedge(actionWheel.children[1], '动作 9').children[0].children;
  assert.equal(swatch.style['--fg-menu-swatch-color'], '#4477aa');

  window.innerWidth = 200;
  contextMenu.showActionWheel(container, 300, 300, [swatchAction]);
  const [fallbackSwatch] = container.children[0].children[0].children;
  assert.equal(fallbackSwatch.style['--fg-menu-swatch-color'], '#4477aa');

  window.innerWidth = 800;
  contextMenu.showActionWheel(container, 300, 300, [{ label: '只读来源', disabled: true }]);
  assert.match(container.children[0].className, /fg-context-menu/);

  const reorderItems = [action('编辑 (6)'), action('固定'), { label: '分类', children: [] }];
  const openReorder = label => contextMenu.showActionWheel(container, 300, 300, reorderItems, { label });
  const currentWheel = () => container.children[0];
  const primaryRing = () => currentWheel().children[0];
  const labels = () => primaryRing().children.map(label);
  const center = wheel => [parseFloat(wheel.style.left), parseFloat(wheel.style.top)];
  const at = (wheel, button, scale = 1) => button
    ? center(wheel).map((value, index) => value + parseFloat(button.style[index ? '--fg-wheel-y' : '--fg-wheel-x']) * scale)
    : center(wheel);
  const dragEvent = ([clientX, clientY], buttons = 1) => ({
    clientX, clientY, buttons, button: 0, pointerId: 1, pointerType: 'mouse', preventDefault() {}, stopPropagation() {},
  });
  const startDrag = (source, target, scale) => {
    const wheel = currentWheel();
    source.listeners.pointerdown(dragEvent(at(wheel, source)));
    hitTarget = target;
    const end = at(wheel, target, scale);
    window.listeners.pointermove(dragEvent(end));
    return end;
  };
  const drop = (source, target, scale) => {
    const end = startDrag(source, target, scale);
    window.listeners.pointerup(dragEvent(end, 0));
  };
  const actionsBeforeDrag = [...calls];
  openReorder('测试轮盘 · 图 A');
  assert.equal(contextMenu.hasOpenContextMenu(), true);
  assert.deepEqual(labels(), ['编辑 (6)', '固定', '分类']);
  drop(wedge(primaryRing(), '固定'), wedge(primaryRing(), '编辑 (6)'));
  assert.deepEqual(labels(), ['固定', '编辑 (6)', '分类']);
  let preventedClick = false;
  currentWheel().listeners.click({ detail: 1, stopPropagation() {}, preventDefault() { preventedClick = true; } });
  assert.equal(preventedClick, true);
  assert.deepEqual(calls, actionsBeforeDrag);

  contextMenu.closeContextMenu();
  assert.equal(contextMenu.hasOpenContextMenu(), false);
  reorderItems[0].label = '编辑 (7)';
  openReorder('测试轮盘 · 图 B');
  assert.deepEqual(labels(), ['固定', '编辑 (7)', '分类']);
  assert.equal(wedge(primaryRing(), '分类').disabled, true);
  drop(wedge(primaryRing(), '编辑 (7)'), wedge(primaryRing(), '分类'), 1.35);
  assert.deepEqual(labels(), ['固定', '分类']);
  assert.equal(wedge(primaryRing(), '分类').disabled, false);
  assert.equal(currentWheel().children[1].children.map(label).join(), '编辑 (7)');

  drop(wedge(currentWheel().children[1], '编辑 (7)'), null);
  assert.deepEqual(labels(), ['固定', '分类', '编辑 (7)']);
  assert.equal(wedge(primaryRing(), '分类').disabled, true);
  assert.equal(currentWheel().children.length, 1);

  startDrag(wedge(primaryRing(), '编辑 (7)'), wedge(primaryRing(), '固定'));
  assert.equal(currentWheel().children.length, 2);
  window.listeners.blur();
  assert.equal(window.listeners.pointerup, undefined);
  assert.equal(currentWheel().children.length, 1);
  assert.deepEqual(labels(), ['固定', '分类', '编辑 (7)']);
  const end = startDrag(wedge(primaryRing(), '编辑 (7)'), wedge(primaryRing(), '固定'));
  window.listeners.pointermove(dragEvent(end, 0));
  assert.equal(window.listeners.pointerup, undefined);

  openReorder('独立轮盘');
  assert.deepEqual(labels(), ['编辑 (7)', '固定', '分类']);
  openReorder('测试轮盘 · 图 C');
  assert.deepEqual(labels(), ['固定', '分类', '编辑 (7)']);
  assert.deepEqual(calls, actionsBeforeDrag);
});
