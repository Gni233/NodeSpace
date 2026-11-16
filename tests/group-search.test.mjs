import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
const ts = createRequire(import.meta.url)('typescript');
const output = ts.transpileModule(await readFile(new URL('../src/group-search.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { setupGroupSearch } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);

class Element extends EventTarget {
  constructor(tag, doc) {
    super(); this.tagName = tag; this.ownerDocument = doc; this.style = {}; this.attributes = {}; this.children = [];
    this.id = ''; this.value = ''; this.textContent = ''; this.scrolled = 0;
    this.classList = { toggle() {} };
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  scrollIntoView() { this.scrolled++; }
  click() { this.dispatchEvent(new Event('click')); }
  send(type, props = {}) { const event = new Event(type, { cancelable: true, bubbles: true }); Object.assign(event, props); this.dispatchEvent(event); return event; }
}
function fixture() {
  const doc = { createElement: tag => new Element(tag, doc), createTextNode: text => ({ textContent: text }) };
  const input = doc.createElement('input'), list = doc.createElement('div');
  const state = { mutable: true, current: true, groups: [{ id: 'a', label: 'NodeJS', color: '#a8563e' }, { id: 'b', label: 'nodeGraph' }], opened: [], created: [] };
  const dispose = setupGroupSearch(input, list, () => ({
    groups: state.groups, isCurrent: () => state.current, canCreate: () => state.mutable,
    open: group => state.opened.push(group.id), create: label => { state.created.push(label); state.groups.push({ id: 'new', label }); },
  }));
  const search = value => { input.value = value; input.send('input'); };
  const key = (key, props) => input.send('keydown', { key, ...props });
  return { input, list, state, dispose, search, key };
}

test('group search exposes an associated listbox and supports keyboard selection', () => {
  const { input, list, state, search, key } = fixture(); search('node');
  assert.equal(input.attributes.role, 'combobox'); assert.equal(input.attributes['aria-controls'], list.id);
  assert.equal(list.attributes.role, 'listbox'); assert.equal(input.attributes['aria-expanded'], 'true');
  assert.equal(list.children.length, 3);
  assert.equal(key('ArrowDown').defaultPrevented, true);
  assert.equal(input.attributes['aria-activedescendant'], list.children[0].id);
  key('ArrowDown'); assert.equal(list.children[1].attributes['aria-selected'], 'true');
  key('Enter'); assert.deepEqual(state.opened, ['b']); assert.deepEqual(state.created, []);
  assert.equal(input.attributes['aria-expanded'], 'false'); assert.equal(input.attributes['aria-activedescendant'], undefined);
});

test('creating a group preserves case, trims the label and offers no duplicate creation', () => {
  const { state, list, search, key } = fixture();
  search('  NodeSpace  '); key('Enter'); assert.deepEqual(state.created, ['NodeSpace']);
  search('NodeSpace'); assert.equal(list.children.length, 1); key('Enter');
  assert.deepEqual(state.opened, ['new']); assert.deepEqual(state.created, ['NodeSpace']);
});

test('stale targets, deleted groups and newly read-only spaces cannot act through pending results', () => {
  for (const mode of ['target', 'deleted', 'readonly']) {
    const { state, list, search, key } = fixture(); search(mode === 'readonly' ? 'new group' : 'node');
    if (mode === 'target') state.current = false;
    if (mode === 'deleted') state.groups.splice(0, 1);
    if (mode === 'readonly') state.mutable = false;
    key('Enter'); assert.deepEqual(state.opened, [], mode); assert.deepEqual(state.created, [], mode);
    assert.equal(list.style.display, 'none', mode);
  }
});

test('read-only searches still open existing groups and explain empty results without creation', () => {
  const { state, list, search, key } = fixture(); state.mutable = false;
  search('node'); assert.equal(list.children.length, 2); key('Enter'); assert.deepEqual(state.opened, ['a']);
  search('does not exist'); assert.equal(list.children[0].textContent, '没有匹配的集合');
  key('Enter'); assert.deepEqual(state.created, []);
});

test('IME confirmation cannot create a partial group and composition end refreshes results', () => {
  const { input, list, state, search, key } = fixture();
  input.send('compositionstart'); search('拼');
  key('Enter', { isComposing: true }); assert.deepEqual(state.created, []); assert.equal(list.style.display, 'none');
  input.value = '拼音'; input.send('compositionend'); key('Enter', { keyCode: 229 }); assert.deepEqual(state.created, []);
  key('Enter'); assert.deepEqual(state.created, ['拼音']);
});

test('pointer choices retain input focus and blur, Escape and cleanup close the list immediately', () => {
  const { input, list, state, search, key, dispose } = fixture(); search('node');
  assert.equal(list.children[0].send('pointerdown').defaultPrevented, true);
  list.children[0].click(); assert.deepEqual(state.opened, ['a']);
  search('node'); assert.equal(key('Escape').defaultPrevented, true); assert.equal(list.style.display, 'none');
  key('ArrowUp'); assert.equal(input.attributes['aria-activedescendant'], list.children.at(-1).id);
  input.send('blur'); assert.equal(list.style.display, 'none');
  dispose(); search('something'); assert.equal(list.style.display, 'none');
});
