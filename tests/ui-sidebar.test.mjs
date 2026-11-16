import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
const ts = createRequire(import.meta.url)('typescript');
const source = (await readFile(new URL('../src/ui-sidebar.ts', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
const wheelSource = (await readFile(new URL('../src/ui-contextmenu.ts', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
const orderSource = (await readFile(new URL('../src/context-wheel-order.ts', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
const code = ts.transpileModule(`${orderSource}\n${wheelSource}\n${source}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace('export {};', '');
function fixture({ docked = false, writableVault = false } = {}) {
  class Target {
    listeners = new Map();
    addEventListener(key, fn) { if (!this.listeners.has(key)) this.listeners.set(key, new Set()); this.listeners.get(key).add(fn); }
    removeEventListener(key, fn) { this.listeners.get(key)?.delete(fn); }
    dispatchEvent(event) {
      event.target ??= this; event.preventDefault ??= () => {}; event.stopPropagation ??= () => { event.stopped = true; };
      this['on' + event.type]?.(event); for (const fn of this.listeners.get(event.type) ?? []) fn(event);
      if (!event.stopped) this.parentElement?.dispatchEvent(event); return true;
    }
  }
  const document = new Target(); document.activeElement = null;
  class Element extends Target {
    constructor(tag) {
      super(); this.tagName = tag.toUpperCase();
      this.classList = {
        add: value => { if (!this.matches(`.${value}`)) this.className = `${this.className} ${value}`.trim(); },
        toggle: (value, on) => { this.className = this.className.split(' ').filter(x => x !== value).concat(on ? [value] : []).join(' '); },
      };
    }
    children = []; attributes = {}; dataset = {}; style = { setProperty(key, value) { this[key] = value; } }; className = ''; isConnected = true;
    appendChild(child) { child.parentElement = this; this.children.push(child); }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    remove() { if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1); this.parentElement = null; this.isConnected = false; }
    set innerHTML(html) { this.children.forEach(child => { child.parentElement = null; }); this.children = []; for (const match of html.matchAll(/<span(?: class="([^"]*)")?[^>]*>(.*?)<\/span>/g)) { const span = new Element('span'); span.className = match[1] ?? ''; span.textContent = match[2]; this.appendChild(span); } }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key] ?? null; }
    matches(selector) { if (selector === '[data-navigation-key]') return !!this.dataset.navigationKey; if (selector.startsWith('.')) return this.className.split(' ').includes(selector.slice(1)); return this.tagName === selector.toUpperCase(); }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }
    contains(el) { return this === el || this.children.some(child => child.contains(el)); }
    focus() { document.activeElement = this; }
    click() { this.dispatchEvent({ type: 'click' }); }
    getBoundingClientRect() { return { left: 10, top: 30, bottom: 60, width: 200, height: 30 }; }
  }
  document.createElement = tag => new Element(tag); document.body = new Element('body');
  const window = new Target(); window.innerWidth = 1000; window.innerHeight = 800;
  window.matchMedia = () => ({ matches: false });
  document.body.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 800 });
  const calls = [], env = { document, window, HTMLElement: Element, safePrompt: async () => null, confirmAction: async () => true, SIDEBAR_WIDTH: 220, SIDEBAR_COLLAPSED_WIDTH: 36, SIDEBAR_MIN_WIDTH: 180, getResponsiveSidebarWidth: () => 220, Z_CONTEXT_MENU: 100, V: (_, fallback) => fallback, setTimeout: () => 1, clearTimeout() {}, CustomEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } }, MouseEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } } };
  const create = new Function(...Object.keys(env), code + '\nreturn createSidebar;')(...Object.values(env));
  const callbacks = Object.fromEntries(['onSelectFile', 'onNewFile', 'onDeleteFile', 'onRenameFile', 'onOpenFolder', 'onCopyFile', 'onNewFolder', 'onMoveFile', 'onSelectVaultFolder', 'onSelectVaultResource', 'onReferenceVaultFolder', 'onReferenceVaultResource', 'onOpenVaultResourceInObsidian'].map(name => [name, (...args) => calls.push([name, ...args])]));
  if (writableVault) callbacks.onEditVaultMarkdown = path => calls.push(['onEditVaultMarkdown', path]);
  const dock = docked ? document.createElement('nav') : undefined;
  if (dock) document.body.appendChild(dock);
  const api = create(document.body, callbacks, dock);
  const row = key => api.sidebar.querySelectorAll('[data-navigation-key]').find(item => item.dataset.navigationKey === key);
  const key = (value, extra = {}) => document.activeElement.dispatchEvent({ type: 'keydown', key: value, ...extra });
  return { api, document, calls, row, key, dock };
}
const tree = [{ name: 'Notes', kind: 'directory', children: [{ name: 'A.json', kind: 'file', children: [] }, { name: 'B.json', kind: 'file', children: [] }] }, { name: 'C.json', kind: 'file', children: [] }];

test('the docked file-tree label uses a content-width toolbar button in both states', () => {
  const { api, dock } = fixture({ docked: true });
  const button = dock.querySelector('.fg-shell-control');
  assert.ok(button.matches('.fg-action'));
  assert.equal(button.matches('.fg-sidebar-collapse'), false);
  assert.equal(button.getAttribute('aria-controls'), api.sidebar.id);
  assert.equal(button.textContent, '文件树');
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  button.click();
  assert.equal(button.textContent, '文件树');
  assert.equal(button.getAttribute('aria-expanded'), 'true');
});

test('space files are named native buttons, folders disclose expansion and arrow keys navigate their hierarchy', () => {
  const f = fixture(); f.api.updateFileTree(tree, 'Notes/A.json');
  const directory = f.row('graph:Notes'); assert.equal(directory.tagName, 'BUTTON'); assert.equal(directory.getAttribute('aria-expanded'), 'false');
  directory.focus(); f.key('ArrowRight'); assert.equal(directory.getAttribute('aria-expanded'), 'true');
  f.key('ArrowRight'); assert.equal(f.document.activeElement, f.row('graph:Notes/A.json'));
  assert.equal(f.document.activeElement.getAttribute('aria-current'), 'page');
  f.document.activeElement.click(); assert.deepEqual(f.calls, [['onSelectFile', 'Notes/A.json']]);
  assert.equal(f.document.activeElement, f.row('graph:Notes/A.json'));
  f.key('ArrowDown'); assert.equal(f.document.activeElement, f.row('graph:Notes/B.json'));
  f.key('ArrowLeft'); assert.equal(f.document.activeElement, directory === f.row('graph:Notes') ? directory : f.row('graph:Notes'));
  f.key('ArrowLeft'); assert.equal(f.row('graph:Notes').getAttribute('aria-expanded'), 'false');
  f.key('End'); assert.equal(f.document.activeElement, f.row('graph:C.json'));
});

test('filesystem refresh preserves a keyed row or nearest surviving row without stealing outside focus', () => {
  const f = fixture(); f.api.updateFileTree(tree); f.row('graph:C.json').focus();
  f.api.updateFileTree([...tree], 'C.json'); assert.equal(f.document.activeElement, f.row('graph:C.json'));
  f.api.updateFileTree([tree[0]]); assert.equal(f.document.activeElement, f.row('graph:Notes'));
  f.api.updateFileTree([]); assert.equal(f.document.activeElement, f.api.sidebar.querySelector('.fg-sidebar-new'));
  const outside = f.document.createElement('input'); outside.focus(); f.api.updateFileTree(tree); assert.equal(f.document.activeElement, outside);
});

test('file tree context wheel supports keyboard navigation and Escape returns to its origin', () => {
  const f = fixture(); f.api.updateFileTree(tree); f.row('graph:C.json').focus(); f.key('F10', { shiftKey: true });
  const menu = f.document.body.querySelector('.fg-node-wheel'); assert.ok(menu);
  assert.equal(f.document.activeElement.tagName, 'BUTTON'); assert.equal(f.document.activeElement.title, '重命名');
  f.key('ArrowRight'); assert.equal(f.document.activeElement.title, '创建副本');
  f.document.activeElement.click(); assert.deepEqual(f.calls, [['onCopyFile', 'C.json']]);
  assert.equal(f.document.activeElement, f.row('graph:C.json'));
  f.key('ContextMenu'); f.key('Escape'); assert.equal(f.document.body.querySelector('.fg-node-wheel'), null);
  assert.equal(f.document.activeElement, f.row('graph:C.json'));
});

test('Vault sources expose read-only navigation and retain focus across resource refreshes without graph writes', () => {
  const f = fixture();
  const resource = { path: 'Ideas/Note.md', name: 'Note.md', title: 'A note', kind: 'markdown', headingCount: 2 };
  const index = { name: 'My Vault', rootPath: 'D:/Notes', isObsidianVault: true, notes: [resource], attachments: [] };
  const before = structuredClone(index); f.api.updateVaultIndex(index);
  assert.match(f.api.sidebar.querySelector('.fg-vault-access-note').textContent, /只读/);
  const directory = f.row('vault-dir:notes:Ideas'); directory.focus(); f.key('ArrowRight');
  assert.equal(f.document.activeElement, f.row('vault-dir:notes:Ideas')); assert.equal(f.document.activeElement.getAttribute('aria-expanded'), 'true');
  f.key('ArrowRight'); const note = f.row('vault-resource:Ideas/Note.md'); assert.equal(f.document.activeElement, note); assert.match(note.getAttribute('aria-label'), /只读来源/);
  note.click(); assert.equal(f.document.activeElement, f.row('vault-resource:Ideas/Note.md')); assert.equal(f.document.activeElement.getAttribute('aria-current'), 'page');
  f.api.updateVaultIndex(index); assert.equal(f.document.activeElement, f.row('vault-resource:Ideas/Note.md'));
  assert.deepEqual(f.calls, [['onSelectVaultResource', 'Ideas/Note.md']]); assert.deepEqual(index, before);
});

test('a desktop Vault note has a direct keyboard action to edit the original Markdown', () => {
  const f = fixture({ docked: true, writableVault: true });
  const resource = { path: 'Note.md', name: 'Note.md', title: 'A note', kind: 'markdown' };
  f.api.updateVaultIndex({ name: 'My Vault', rootPath: 'D:/Notes', isObsidianVault: true, notes: [resource], attachments: [] });
  assert.match(f.api.sidebar.querySelector('.fg-vault-access-note').textContent, /编辑原文与投影/);
  const note = f.row('vault-resource:Note.md');
  assert.match(note.getAttribute('aria-label'), /原文可编辑/);
  note.focus();
  f.key('ContextMenu');
  assert.equal(f.document.activeElement.title, '编辑原文');
  f.document.activeElement.click();
  assert.deepEqual(f.calls, [['onEditVaultMarkdown', 'Note.md']]);
});
