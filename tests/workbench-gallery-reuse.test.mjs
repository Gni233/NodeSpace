import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const ts = createRequire(import.meta.url)('typescript');
const source = (await readFile(new URL('../src/workbench-gallery.ts', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;

function fixture() {
  let buttons = 0;
  let artwork = 0;
  let viewport;
  class Element {
    children = Object.assign([], { item(index) { return this[index] ?? null; } });
    style = { setProperty() {} };
    dataset = {};
    hidden = false;
    scrollLeft = 0;
    classList = { add() {}, remove() {} };
    constructor(tag, className) { this.tag = tag; this.className = className; }
    get lastElementChild() { return this.children.at(-1); }
    get childElementCount() { return this.children.length; }
    get clientWidth() { return this.hidden ? 0 : 1024; }
    get clientHeight() { return this.hidden ? 0 : 768; }
    insertBefore(node, target) {
      node.remove();
      const index = this.children.indexOf(target);
      this.children.splice(index < 0 ? this.children.length : index, 0, node);
      node.parent = this;
    }
    append(...nodes) { for (const node of nodes) this.insertBefore(node, null); }
    remove() {
      if (!this.parent) return;
      this.parent.children.splice(this.parent.children.indexOf(this), 1);
      this.parent = null;
    }
    replaceChildren(...nodes) {
      for (const child of [...this.children]) child.remove();
      this.append(...nodes);
    }
    set innerHTML(value) {
      if (this.tag === 'section') {
        viewport = new Element('div', 'ns-gallery-viewport');
        viewport.append(new Element('div', 'ns-gallery-track'));
        this.append(viewport, new Element('p', 'ns-gallery-empty'));
      } else if (this.tag === 'button') {
        this.append(...['ns-home-space-title', 'ns-home-cover-badge', 'ns-home-cover-visual', 'ns-home-space-detail']
          .map(className => new Element('span', className)));
      } else if (value.startsWith('<svg')) artwork++;
    }
    querySelector(selector) {
      const matches = node => selector === `.${node.className}`;
      return this.children.find(matches) ?? this.children.map(child => child.querySelector(selector)).find(Boolean);
    }
    getBoundingClientRect() {
      if (this.className !== 'ns-gallery-column') return { left: 0, right: this.clientWidth, width: this.clientWidth };
      const left = this.parent.children.indexOf(this) * 220 - viewport.scrollLeft;
      return { left, right: left + 220, width: 220 };
    }
    setAttribute() {}
    removeAttribute() {}
    addEventListener() {}
  }
  const globals = {
    HTMLElement: Element,
    document: { createElement: tag => { if (tag === 'button') buttons++; return new Element(tag); } },
    ResizeObserver: class { observe() {} }, matchMedia: () => ({ matches: true }), bindContextMenuTrigger() {},
  };
  const create = new Function(...Object.keys(globals), `${code}\nreturn createWorkbenchGallery;`)(...Object.values(globals));
  const gallery = create(() => {}, () => {}, () => {});
  return { gallery, viewport, counts: () => ({ buttons, artwork }) };
}

test('re-entering a large directory reattaches its cards and painted covers at the old scroll position', () => {
  const { gallery, viewport, counts } = fixture();
  const home = [{ id: 'vault-space:', title: '库', kind: 'library' }];
  const files = [{ id: 'back', title: '返回', back: true }, ...Array.from({ length: 500 }, (_, index) => ({
    id: `vault:file${index}.md`, title: `笔记 ${index}`, kind: 'resource',
  }))];
  gallery.update(home);
  gallery.refreshCovers();
  gallery.update(files, undefined, 'vault-space:');
  gallery.refreshCovers();
  viewport.scrollLeft = 1160;
  gallery.update(home);
  gallery.refreshCovers();
  gallery.update(files, undefined, 'vault-space:');
  gallery.refreshCovers();
  assert.equal(viewport.scrollLeft, 1160);
  const cover = { points: [{ x: .5, y: .5, level: 1 }], links: [], nodeCount: 1 };
  const palette = { levels: [] };
  gallery.setCover(files[25].id, cover, palette);
  const built = counts();
  for (let index = 0; index < 10; index++) {
    gallery.update(home);
    gallery.refreshCovers();
    gallery.update(files, undefined, 'vault-space:');
    gallery.refreshCovers();
    gallery.setCover(files[25].id, cover, palette);
  }
  assert.deepEqual(counts(), built);
  assert.equal(viewport.scrollLeft, 1160);
});

test('leaving several folders releases the oldest detached card layers', () => {
  const { gallery, counts } = fixture();
  const enter = id => {
    gallery.update([{ id, title: id }], undefined, id);
    gallery.refreshCovers();
  };
  for (const id of ['a', 'b', 'c', 'd', 'e']) enter(id);
  assert.equal(counts().buttons, 5);
  enter('d');
  assert.equal(counts().buttons, 5);
  enter('a');
  assert.equal(counts().buttons, 6);
});
