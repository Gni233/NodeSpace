import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const ts = createRequire(import.meta.url)('typescript');
const source = ts.createSourceFile('ui-edit.ts', await readFile(new URL('../src/ui-edit.ts', import.meta.url), 'utf8'), ts.ScriptTarget.ES2022, true);
function actual(name, context) {
  let expression;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) expression = node.initializer;
    if (!expression) ts.forEachChild(node, visit);
  };
  visit(source);
  const code = ts.transpileModule(`const handler = ${expression.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function('context', `with(context) { ${code}; return handler; }`)(context);
}

test('a hidden scrolled editor reopens at its new content while refreshing the same item preserves reading position', () => {
  let scroll = 240;
  const panel = {
    style: { display: 'none' }, setAttribute() {}, querySelectorAll: () => [],
    // A display:none element has no scrolling box. Browsers ignore writes to
    // scrollTop until that box is rendered again.
    get scrollTop() { return this.style.display === 'none' ? 0 : scroll; },
    set scrollTop(value) { if (this.style.display !== 'none') scroll = value; },
  };
  const section = () => ({ style: {} }), graph = {}, item = {};
  const context = {
    editPanel: panel, _cleanedUp: false, resetScrollOnShow: false,
    ctx: { graph, canMutate: () => true }, displayedGraph: null, displayedItem: null,
    inspectorTitle: {}, document: { activeElement: null },
    radModeSelect: {}, groupDelBtn: {}, isStructureNode: () => false, isStructureCollection: () => false,
    nodeEdit: section(), edgeEdit: section(), groupEdit: section(), titleBar: section(),
    resizeHandle: section(), collapsedHandle: section(), collapsed: false, revealCoordinator: null,
  };
  const sectionFor = actual('showSection', context), show = actual('showPanel', context);
  sectionFor('node', item);
  assert.equal(scroll, 240, 'hidden scroll writes cannot reset the retained reading position');
  context.displayedGraph = graph; context.displayedItem = item;
  show();
  assert.equal(panel.scrollTop, 0, 'the new item starts with its name and content visible');
  panel.scrollTop = 140;
  sectionFor('node', item); show();
  assert.equal(panel.scrollTop, 140, 'refreshing the same item does not interrupt reading');
  panel.style.display = 'none';
  context.displayedGraph = null; context.displayedItem = null;
  sectionFor('edge', {}); show();
  assert.equal(panel.scrollTop, 0, 'changing section also resets after the hidden panel is rendered');
});
