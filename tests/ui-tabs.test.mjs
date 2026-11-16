import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
const ts = createRequire(import.meta.url)('typescript');
const source = (await readFile(new URL('../src/ui-tabs.ts', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '').replace('export function createTabBar', 'function createTabBar').replace('export interface', 'interface');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

function fixture() {
  const document = { activeElement: null };
  class Target {
    listeners = new Map();
    addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(fn); }
    removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
    emit(name, event = {}) {
      event.target ??= this; event.detail ??= 1; event.preventDefault ??= () => {}; event.stopPropagation ??= () => { event.stopped = true; };
      const result = this[`on${name}`]?.(event);
      for (const fn of [...(this.listeners.get(name) ?? [])]) fn(event);
      if (!event.stopped && this.parentElement) this.parentElement.emit(name, event);
      return result;
    }
  }
  class Element extends Target {
    constructor(tag) { super(); this.tagName = tag.toUpperCase(); }
    dataset = {}; attributes = {}; style = {}; children = []; className = ''; scrollLeft = 0; clientWidth = 800; offsetWidth = 100;
    get firstChild() { return this.children[0] ?? null; }
    get offsetLeft() { return this.parentElement?.children.indexOf(this) * 100 || 0; }
    set innerHTML(value) { for (const child of this.children) child.parentElement = null; this.children = []; }
    appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
    insertBefore(child, before) { if (!before) return this.appendChild(child); child.parentElement = this; this.children.splice(this.children.indexOf(before), 0, child); }
    remove() { if (this.parentElement) { this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1); this.parentElement = null; } }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    hasAttribute(key) { return key.startsWith('data-') ? key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()) in this.dataset : key in this.attributes; }
    matches(selector) { if (selector.startsWith('[')) return this.hasAttribute(selector.slice(1, -1)); return selector.split('.').filter(Boolean).every(x => this.className.split(' ').includes(x)); }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }
    contains(el) { return el === this || this.children.some(child => child.contains(el)); }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
    focus() { document.activeElement = this; }
    click() { return this.emit('click', { detail: 0 }); }
    cloneNode() { const copy = new Element(this.tagName); copy.dataset = { ...this.dataset }; copy.style = { ...this.style }; return copy; }
    getBoundingClientRect() { return { left: 400 + this.offsetLeft, top: 8, width: this.className === 'fg-tab-bar' ? 800 : 100 }; }
  }
  document.createElement = tag => new Element(tag); document.body = new Element('body');
  const window = new Target(), container = new Element('div'), calls = [], pending = [];
  const confirm = message => new Promise(resolve => pending.push({ message, resolve }));
  const factory = new Function('document', 'window', 'requestAnimationFrame', 'V', 'confirmAction', 'vaultDisplayName', `${code}\nreturn createTabBar;`);
  let api, groups;
  const create = factory(document, window, fn => fn(), (_, fallback) => fallback, confirm, name => name.replace('.json', ''));
  api = create(container, { onSwitchTab: file => calls.push(['switch', file]), onCloseTab: file => calls.push(['close', file]), onNewTab() {}, onReorder: (...args) => calls.push(['reorder', ...args]) });
  const render = value => { groups = value; api.renderTabs(value); };
  const tabs = () => api.tabBar.querySelectorAll('[data-tab-idx]');
  const switches = () => api.tabBar.querySelectorAll('[data-tab-switch]');
  const closes = () => api.tabBar.querySelectorAll('[data-tab-close]');
  const pointer = (button, moves = [], cancel = false) => {
    const x = button.closest('[data-tab-idx]').getBoundingClientRect().left + 20;
    button.emit('pointerdown', { button: 0, pointerId: 9, clientX: x, clientY: 10 });
    for (const delta of moves) window.emit('pointermove', { pointerId: 9, clientX: x + delta, clientY: 10 });
    window.emit(cancel ? 'pointercancel' : 'pointerup', { pointerId: 9, clientX: x + (moves.at(-1) ?? 0), clientY: 10 });
    if (!cancel) button.emit('click', { detail: 1 });
  };
  return { api, document, container, window, calls, pending, render, tabs, switches, closes, pointer, rerender: () => api.renderTabs(groups) };
}

test('spaces expose distinct native switch/close controls and per-pane current state', () => {
  const f = fixture(); f.render([{ tabs: ['A.json', 'B.json'], active: 'A.json', dirty: new Set(['B.json']) }, { tabs: ['C.json'], active: 'C.json', paneIndex: 3 }]);
  assert.equal(f.api.tabBar.tagName, 'NAV');
  assert.deepEqual(f.switches().map(x => x.attributes['aria-pressed']), ['true', 'false', 'true']);
  assert.ok(f.switches()[1].attributes['aria-label'].includes('未保存'));
  assert.ok(f.switches()[2].attributes['aria-label'].includes('窗格 4'));
  for (const button of [...f.switches(), ...f.closes()]) { assert.equal(button.tagName, 'BUTTON'); assert.equal(button.type, 'button'); assert.ok(button.attributes['aria-label']); assert.equal(button.querySelectorAll('button').length, 0); }
});

test('pointer and keyboard activation each switch once, while closing never switches', async () => {
  const f = fixture(); f.render([{ tabs: ['A', 'B'], active: 'A' }]);
  f.pointer(f.switches()[1]);
  assert.deepEqual(f.calls, [['switch', 'B']]);
  f.switches()[1].click();
  await f.closes()[1].click();
  assert.deepEqual(f.calls, [['switch', 'B'], ['switch', 'B'], ['close', 'B']]);
});

test('arrow and boundary navigation move focus without activating, and render preserves the focused action', () => {
  const f = fixture(); f.render([{ tabs: ['A', 'B', 'C'], active: 'A' }]);
  const key = key => f.document.activeElement.emit('keydown', { key });
  f.switches()[0].focus(); key('ArrowRight'); assert.equal(f.document.activeElement, f.switches()[1]);
  key('End'); assert.equal(f.document.activeElement, f.switches()[2]);
  key('ArrowRight'); assert.equal(f.document.activeElement, f.switches()[0]);
  key('ArrowLeft'); assert.equal(f.document.activeElement, f.switches()[2]);
  key('Home'); assert.equal(f.document.activeElement, f.switches()[0]);
  assert.deepEqual(f.calls, []);
  f.closes()[1].focus(); f.rerender(); assert.equal(f.document.activeElement, f.closes()[1]);
  f.render([{ tabs: ['A', 'C'], active: 'A' }]); assert.equal(f.document.activeElement, f.switches()[1]);
  const outside = f.document.createElement('input'); outside.focus(); f.rerender(); assert.equal(f.document.activeElement, outside);
});

test('dirty close prompts once, cancellation restores focus and confirmation closes once', async () => {
  const f = fixture(); f.render([{ tabs: ['A'], active: 'A', dirty: new Set(['A']) }]);
  const first = f.closes()[0].click(); f.closes()[0].click(); assert.equal(f.pending.length, 1);
  f.pending.shift().resolve(false); await first;
  assert.deepEqual(f.calls, []); assert.equal(f.document.activeElement, f.closes()[0]);
  const second = f.closes()[0].click(); f.pending.shift().resolve(true); await second;
  assert.deepEqual(f.calls, [['close', 'A']]);
});

test('drag sorting uses viewport coordinates, stays inside the source pane and suppresses the trailing click', () => {
  const f = fixture(); f.render([{ tabs: ['A', 'B'], active: 'A' }, { tabs: ['C', 'D', 'E'], active: 'C', paneIndex: 3 }]);
  f.pointer(f.switches()[3], [180]);
  assert.deepEqual(f.calls, [['reorder', 1, 2, 3]]);
  f.pointer(f.switches()[3], [-250], true);
  assert.deepEqual(f.calls, [['reorder', 1, 2, 3]]);
  f.pointer(f.switches()[3], [-500]);
  assert.deepEqual(f.calls, [['reorder', 1, 2, 3]], 'dropping over another pane must not reorder either pane');
  assert.equal(f.window.listeners.get('pointermove').size, 0);
  assert.equal(f.window.listeners.get('pointercancel').size, 0);
  f.pointer(f.switches()[3]); assert.deepEqual(f.calls.at(-1), ['switch', 'D']);
});

test('a redraw cancels active drag and an emptied focused bar retains a focus anchor', () => {
  const f = fixture(); f.render([{ tabs: ['A'], active: 'A' }]);
  f.switches()[0].focus();
  f.switches()[0].emit('pointerdown', { button: 0, pointerId: 2, clientX: 420, clientY: 10 });
  f.window.emit('pointermove', { pointerId: 2, clientX: 460, clientY: 10 });
  f.render([]);
  assert.equal(f.window.listeners.get('pointerup').size, 0);
  assert.equal(f.document.activeElement, f.api.tabBar);
});
