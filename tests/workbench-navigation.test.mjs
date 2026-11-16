import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const ts = createRequire(import.meta.url)('typescript');
const source = (await readFile(new URL('../src/workbench-home.ts', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;

function fixture(actions) {
  const calls = { scopes: [], fileTree: [], focus: [], menus: [] };
  class Element {
    open = false;
    children = [];
    attributes = new Map();
    listeners = new Map();
    classList = { add() {}, remove() {} };
    constructor(tag) { this.tag = tag; }
    setAttribute(name, value) { this.attributes.set(name, value); }
    append(...children) { this.children.push(...children); }
    querySelector(tag) { return this.children.find(child => child.tag === tag); }
    addEventListener(event, callback) { this.listeners.set(event, callback); }
    getBoundingClientRect() { return { left: 0, top: 0 }; }
    focus() { calls.focus.push(this); }
    showModal() { this.open = true; }
  }
  const gallery = new Element('section');
  const fileTree = new Element('details');
  fileTree.append(new Element('summary'), new Element('nav'));
  let openCard, showSpaceMenu, showGalleryMenu;
  const dependencies = {
    document: { createElement: tag => new Element(tag), activeElement: null },
    HTMLElement: Element,
    Element,
    createWorkbenchGallery(open, _visible, contextMenu) {
      openCard = open;
      showSpaceMenu = contextMenu;
      return {
        element: gallery,
        update(cards, current, location) { calls.scopes.push({ cards, current, location }); return true; },
        refreshCovers() {},
        focusCard(id) { calls.focus.push(id); return false; },
        setCover() {},
      };
    },
    createWorkbenchFileTree() {
      return { element: fileTree, update(...args) { calls.fileTree.push(args); } };
    },
    showContextWheel(_host, _x, _y, commands) { calls.menus.push(commands.map(({ item }) => item)); },
    bindContextMenuTrigger(_target, open) { showGalleryMenu = open; },
    closeContextMenu() {},
  };
  const create = new Function(...Object.keys(dependencies), `${code}\nreturn createWorkbenchHome;`)(...Object.values(dependencies));
  const home = create(actions);
  const cancel = () => home.element.listeners.get('cancel')({ preventDefault() {} });
  return { home, calls, gallery, openCard, showSpaceMenu, showGalleryMenu, cancel };
}

test('a connected library opens inside the wall and each back action exits one level', () => {
  const library = { id: 'vault-space:', title: '资料库名称', kind: 'library' };
  const folder = { id: 'vault-space:课程', title: '课程', kind: 'folder' };
  const note = { id: 'vault:课程/笔记.md', title: '笔记', kind: 'resource' };
  const root = { spaces: [library], current: library };
  const libraryLevel = { spaces: [folder], location: { id: library.id, title: library.title, parentTitle: '主界面' } };
  const folderLevel = { spaces: [note], location: { id: folder.id, title: folder.title, parentTitle: library.title } };
  const stack = [root];
  const opened = [];
  const f = fixture({
    onContinue: () => assert.fail('a library is a navigation entry even with the same active id'),
    onOpen(space) {
      const level = space === library ? libraryLevel : space === folder ? folderLevel : null;
      if (level) { stack.push(level); f.home.update(level); }
      else opened.push(space.id);
    },
    onBack() { stack.pop(); f.home.update(stack[stack.length - 1]); },
    onDismiss: () => opened.push('canvas'),
  });
  f.home.update(root);
  f.home.setVisible(true);
  f.openCard(library);
  assert.equal(f.home.element.open, true);
  assert.equal(f.calls.scopes.at(-1).location, library.id);
  assert.equal(f.gallery.attributes.get('aria-label'), '浏览资料库名称');
  f.openCard(folder);
  const [back, visibleNote] = f.calls.scopes.at(-1).cards;
  assert.equal(back.title, '返回资料库名称');
  assert.equal(visibleNote, note);
  assert.equal(f.calls.fileTree.length, 0);
  f.showGalleryMenu(10, 20);
  f.calls.menus.at(-1).find(item => item.label === '文件树').action();
  assert.deepEqual(f.calls.fileTree.at(-1), [[note], undefined, true]);
  f.openCard(note);
  f.openCard(back);
  assert.equal(f.calls.scopes.at(-1).location, library.id);
  assert.equal(f.calls.fileTree.length, 1);
  assert.ok(f.calls.focus.includes(folder.id));
  f.cancel();
  assert.equal(f.calls.scopes.at(-1).location, undefined);
  assert.deepEqual(f.calls.scopes.at(-1).cards, [library]);
  f.cancel();
  assert.deepEqual(opened, [note.id, 'canvas']);
});

test('library and back cards expose navigation without file mutation actions', () => {
  const f = fixture({});
  for (const card of [
    { id: 'vault-space:', kind: 'library', title: '资料库' },
    { id: 'vault-space:项目', kind: 'folder', title: '项目' },
    { id: 'vault:项目/a.md', kind: 'resource', title: '笔记' },
    { id: 'back', back: true, title: '返回主界面' },
  ]) {
    f.showSpaceMenu(10, 20, f.gallery, card, () => {});
    assert.deepEqual(f.calls.menus.at(-1).map(item => item.label), [card.back ? card.title : '打开']);
  }
  f.showSpaceMenu(10, 20, f.gallery, { id: 'graph.json', title: '图' }, () => {});
  assert.deepEqual(f.calls.menus.at(-1).map(item => item.label), ['打开', '重命名', '创建副本', '删除']);
});
