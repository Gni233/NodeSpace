import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const ts = createRequire(import.meta.url)('typescript');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(compile(source)).toString('base64');
const menuSource = await readFile(new URL('../src/context-menu-trigger.ts', import.meta.url), 'utf8');
const menuUrl = moduleUrl(menuSource);
const source = (await readFile(new URL('../src/workbench-file-tree.ts', import.meta.url), 'utf8'))
  .replace("import './workbench-file-tree.css';", '')
  .replace("'./context-menu-trigger'", JSON.stringify(menuUrl));
const { createWorkbenchFileTree } = await import(moduleUrl(source));

test('file tree preserves exact space IDs, groups paths, and returns focus after Escape', t => {
  const owner = { activeElement: null, createElement: tag => new Element(tag) };
  class Element {
    children = [];
    attributes = new Map();
    listeners = new Map();
    open = false;
    constructor(tag) { this.tag = tag; }
    setAttribute(name, value) { this.attributes.set(name, value); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    addEventListener(name, listener, capture = false) {
      const listeners = this.listeners.get(name) ?? [];
      if (capture === true) listeners.unshift(listener);
      else listeners.push(listener);
      this.listeners.set(name, listeners);
    }
    fire(name, event) { for (const listener of this.listeners.get(name) ?? []) listener(event); }
    getBoundingClientRect() { return { left: 20, bottom: 80 }; }
    focus() { owner.activeElement = this; }
  }
  const savedDocument = globalThis.document, savedHTMLElement = globalThis.HTMLElement;
  globalThis.document = owner;
  globalThis.HTMLElement = Element;
  t.after(() => {
    if (savedDocument === undefined) delete globalThis.document;
    else globalThis.document = savedDocument;
    if (savedHTMLElement === undefined) delete globalThis.HTMLElement;
    else globalThis.HTMLElement = savedHTMLElement;
  });
  const opened = [];
  const menus = [];
  const tree = createWorkbenchFileTree(space => opened.push(space), (...menu) => menus.push(menu));
  const [toggle, panel] = tree.element.children;
  assert.equal(toggle.textContent, '文件树');
  tree.update([]);
  assert.equal(panel.children[0].textContent, '暂无空间');

  const first = { id: '课程/章节/笔记.json', title: '笔记' };
  const spaces = [first, { id: '散记.json', title: '散记' }, { id: 'demo', title: '快速开始', example: true }];
  tree.update(spaces, first.id);
  const [list] = panel.children;
  const [outerFolder] = list.children[0].children;
  const [nestedFolder] = outerFolder.children[1].children[0].children;
  const [button] = nestedFolder.children[1].children[0].children;
  assert.equal(outerFolder.children[0].textContent, '课程');
  assert.equal(nestedFolder.children[0].textContent, '章节');
  assert.equal(outerFolder.open && nestedFolder.open, true);
  assert.equal(button.attributes.get('aria-current'), 'page');
  assert.equal(list.children[2].children[0].children[0].textContent, '示例');
  button.fire('click');
  assert.deepEqual(opened, [first]);
  assert.equal(button.attributes.get('aria-haspopup'), 'menu');
  button.fire('contextmenu', { clientX: 25, clientY: 74, preventDefault() {} });
  assert.deepEqual(menus[0].slice(0, 4), [25, 74, button, first]);
  button.fire('keydown', { key: 'F10', shiftKey: true, preventDefault() {} });
  assert.deepEqual(menus[1].slice(0, 4), [20, 80, button, first]);
  menus[1][4]();
  assert.deepEqual(opened, [first, first]);

  tree.element.open = true;
  button.focus();
  tree.update([...spaces, { id: '另一张.json', title: '另一张' }], first.id);
  assert.equal(owner.activeElement.title, first.id);
  let prevented = false, stopped = false;
  tree.element.fire('keydown', {
    key: 'Escape', preventDefault() { prevented = true; }, stopPropagation() { stopped = true; },
  });
  assert.equal(tree.element.open, false);
  assert.equal(owner.activeElement, toggle);
  assert.ok(prevented && stopped);
});
