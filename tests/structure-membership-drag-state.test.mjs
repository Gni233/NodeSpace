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

async function importTypeScript(filePath, replacements = {}) {
  let source = await readFile(filePath, 'utf8');
  for (const [specifier, replacement] of Object.entries(replacements)) {
    source = source.replaceAll(`from '${specifier}'`, `from '${toModuleUrl(replacement)}'`);
  }
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(toModuleUrl(output));
}

function parse(source, fileName) {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
}

function visit(node, predicate) {
  if (predicate(node)) return node;
  return ts.forEachChild(node, child => visit(child, predicate));
}

function propertyName(node) {
  return node.name && ts.isIdentifier(node.name) ? node.name.text : null;
}

const gesture = await importTypeScript(path.join(root, 'src', 'canvas-gesture-state.ts'));
const eventsFile = parse(await readFile(path.join(root, 'src', 'ui-events.ts'), 'utf8'), 'ui-events.ts');
const canvasSetup = visit(eventsFile, node => ts.isFunctionDeclaration(node) && node.name?.text === 'setupCanvasEvents');
const canvasSetupCode = ts.transpileModule(canvasSetup.getText(eventsFile).replace(/^export /, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const renderer = await importTypeScript(path.join(root, 'src', 'pixi-structure-boundaries.ts'), {
  'pixi.js': 'export class Container {}; export class Graphics {}; export class Text {};',
});
const paneState = await importTypeScript(path.join(root, 'src', 'pane-state.ts'), {
  './theme': ts.transpileModule(await readFile(path.join(root, 'src', 'theme.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  './undo-redo': 'export class UndoManager {}',
  './layout-controller': 'export class LayoutSlot {}',
  './graph-runtime': 'export class GraphRuntime { constructor(_tab, graph, undoManager) { this.graph = graph; this.undoManager = undoManager; this.simManager = null; this.saveTimeout = null; } attach() {} }',
  './structure-view': 'export class StructureNavigationState { constructor() {} }',
  './geometry/structure-boundary': 'export const containsPoint = () => false; export const hitTestStructureBoundary = () => false;',
  './pixi-structure-boundaries': 'export const clearStructureBoundaries = () => {}; export const destroyStructureBoundaries = () => {};',
});

test('membership drag lifecycle begins after the gesture threshold and ends once', () => {
  const pointer = new gesture.CanvasGestureState();
  const membership = new gesture.NodeMembershipDragState();

  pointer.begin(7, 10, 10, 'node-a', false, 3);
  const beforeThreshold = pointer.move(7, 12, 10);
  assert.equal(beforeThreshold.startedNodeDrag, false);
  assert.equal(membership.isActive, false);

  const atThreshold = pointer.move(7, 13, 10);
  assert.equal(atThreshold.startedNodeDrag, true);
  assert.deepEqual(membership.start('node-a', 13, 10), { nodeId: 'node-a', x: 13, y: 10 });
  assert.deepEqual(membership.move('node-a', 18, 14), { nodeId: 'node-a', x: 18, y: 14 });
  assert.deepEqual(membership.end(20, 16, false), { nodeId: 'node-a', x: 20, y: 16, cancelled: false });
  assert.equal(membership.cancel(), null);
  assert.equal(membership.end(20, 16, true), null);
});

function pointerFixture(t, sourceMode, readOnly) {
  const target = () => {
    const handlers = new Map();
    return {
      addEventListener: (type, handler) => handlers.set(type, handler),
      removeEventListener: type => handlers.delete(type),
      fire: (type, event) => handlers.get(type)?.(event),
    };
  };
  const pointer = (clientX, clientY, pointerId = 1) => ({
    clientX, clientY, pointerId, pointerType: 'mouse', button: 0, buttons: 1,
    preventDefault() {}, stopImmediatePropagation() {},
  });
  const canvas = { ...target(), style: {}, getBoundingClientRect: () => ({ left: 0, top: 0 }),
    setPointerCapture() {}, releasePointerCapture() {} };
  const window = target();
  const node = { id: 'folder', x: 30, y: 40 };
  const viewport = { pause: false, x: 0, toWorld: (x, y) => ({ x: x - viewport.x, y }), on() {}, off() {} };
  const env = {
    ...gesture, window, document: { ...target(), body: {} },
    sharedState: { registerSelectionHandlers: () => () => {} },
    hitTestNode: (x, y, nodes) => nodes.find(node => Math.hypot(x - node.x, y - node.y) < 10),
    closeContextMenu() {}, createNodeNotePreview: () => ({ hide() {}, destroy() {} }),
    createCanvasMagnifier: () => ({ destroy() {} }),
    DRAG_THRESHOLD: 3, TOUCH_DRAG_THRESHOLD: 10, LONG_PRESS_DURATION: 500,
  };
  let dragged = null;
  const calls = [];
  const ctx = {
    graph: { nodes: [node], edges: [], groups: [], settings: { sourceMode } },
    viewport, isReadOnlyNode: () => readOnly, isFixedNode: () => true,
    getSelNode: () => null, getNodeExpand: () => 0, getTransform: () => ({ k: 1 }),
    getVisibleNodes: () => [node], getSimulation: () => null,
    getDraggingNode: () => dragged, setDraggingNode: value => { dragged = value; },
    setWasDragged() {}, draw() {},
    onTap: (_x, _y, id) => calls.push(['tap', id]),
    onDragStart: () => calls.push('edit'), onDragEnd: () => calls.push('end'), triggerSave: () => calls.push('save'),
    onNodeMembershipDragStart: () => calls.push('membership'),
  };
  const setup = new Function(...Object.keys(env), `${canvasSetupCode}\nreturn setupCanvasEvents;`)(...Object.values(env));
  const dispose = setup(canvas, ctx);
  t.after(dispose);
  return {
    canvas, window, viewport, pointer, node, calls, dispose,
    move(x, y, pointerId) {
      // The viewport recognizer runs alongside the canvas listener and is free
      // to pan only when the card recognizer did not take the gesture.
      if (!viewport.pause) viewport.x += 13;
      canvas.fire('pointermove', pointer(x, y, pointerId));
    },
  };
}

test('a Vault projection card owns its drag and releases the viewport on drop, cancel or disposal', t => {
  for (const end of ['drop', 'cancel', 'dispose']) {
    const { canvas, window, viewport, pointer, node, calls, move, dispose } = pointerFixture(t, 'vault-readonly', true);
    canvas.fire('pointerdown', pointer(30, 40));
    assert.equal(viewport.pause, true, end);
    move(55, 60);
    assert.deepEqual(node, { id: 'folder', x: 55, y: 60 }, end);
    assert.equal(viewport.x, 0, end);
    move(90, 90, 9);
    assert.deepEqual(node, { id: 'folder', x: 55, y: 60 }, end);
    if (end === 'drop') window.fire('pointerup', pointer(55, 60));
    if (end === 'cancel') canvas.fire('pointercancel', pointer(55, 60));
    if (end === 'dispose') dispose();
    assert.equal(viewport.pause, false, end);
    assert.deepEqual(node, { id: 'folder', x: 30, y: 40 }, end);
    assert.deepEqual(calls, [], end);
  }
});

test('a projection card can still be tapped and blank space or a read-only proxy can pan', t => {
  const projection = pointerFixture(t, 'vault-readonly', true);
  projection.canvas.fire('pointerdown', projection.pointer(30, 40));
  projection.window.fire('pointerup', projection.pointer(30, 40));
  assert.deepEqual(projection.calls, [['tap', 'folder']]);
  projection.canvas.fire('pointerdown', projection.pointer(100, 100));
  projection.move(130, 100);
  assert.equal(projection.viewport.x, 13);
  projection.window.fire('pointerup', projection.pointer(130, 100));

  const proxy = pointerFixture(t, undefined, true);
  proxy.canvas.fire('pointerdown', proxy.pointer(30, 40));
  proxy.move(55, 60);
  assert.equal(proxy.viewport.x, 13);
  assert.deepEqual(proxy.node, { id: 'folder', x: 30, y: 40 });
  assert.deepEqual(proxy.calls, []);
});

test('pointer event API only wires membership callbacks to real node drag lifecycle', async () => {
  const source = await readFile(path.join(root, 'src', 'ui-events.ts'), 'utf8');
  const file = parse(source, 'ui-events.ts');
  const context = visit(file, node => ts.isInterfaceDeclaration(node) && node.name.text === 'EventsContext');
  assert.ok(context);
  for (const name of ['onNodeMembershipDragStart', 'onNodeMembershipDragMove', 'onNodeMembershipDragEnd']) {
    const member = context.members.find(candidate => propertyName(candidate) === name);
    assert.ok(member, `${name} is optional EventsContext API`);
    assert.equal(member.questionToken?.kind, ts.SyntaxKind.QuestionToken);
  }

  const setup = visit(file, node => ts.isFunctionDeclaration(node) && node.name?.text === 'setupCanvasEvents');
  const body = setup.body.getText(file);
  assert.match(body, /gestureMove\?\.startedNodeDrag[\s\S]*?membershipDrag\.start\(node\.id, mx, my\)/);
  assert.match(body, /membershipDrag\.move\(draggedNode\.id, mx, my\)/);
  assert.match(body, /endMembershipDrag\(false, e\)/);
  assert.match(body, /endMembershipDrag\(true, e\)/);
  assert.match(body, /endMembershipDrag\(true\);/);
});

test('disposer completes only an active node drag after cancelling membership drag', async () => {
  const source = await readFile(path.join(root, 'src', 'ui-events.ts'), 'utf8');
  const disposer = source.slice(source.indexOf('  return () => {'));

  assert.match(source, /let nodeDragStarted = false;/);
  assert.match(source, /if \(membershipStart\) \{\s*nodeDragStarted = true;/);
  assert.match(
    disposer,
    /endMembershipDrag\(true\);\s*if \(nodeDragStarted\) \{\s*ctx\.onDragEnd\?\.\(\);\s*nodeDragStarted = false;/,
  );
  assert.equal((disposer.match(/ctx\.onDragEnd\?\.\(\);/g) ?? []).length, 1);

  const mainSource = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');
  assert.match(
    mainSource,
    /onDragEnd: \(\) => \{[\s\S]*?lastDragId\.v = null;[\s\S]*?getSM\(\)\.setDragNode\(null\);[\s\S]*?dragCount = Math\.max\(0, dragCount - 1\);[\s\S]*?classList\.remove\('is-dragging-node'\)/,
  );
});

test('membership preview defaults and clearing are pane-local', () => {
  const first = paneState.createPaneState(0, {});
  const second = paneState.createPaneState(1, {});
  assert.equal(first.membershipDragPreview, null);
  assert.equal(first.membershipDragSession, null);
  assert.equal(second.membershipDragPreview, null);
  assert.equal(second.membershipDragSession, null);

  first.membershipDragPreview = {
    nodeId: 'node-a', sourceStructureId: null, targetStructureId: 'structure-a',
    mode: 'add', message: 'ready',
  };
  first.membershipDragSession = { nodeId: 'node-a' };
  assert.equal(second.membershipDragPreview, null);
  paneState.clearMembershipDragPreview(first);
  assert.equal(first.membershipDragPreview, null);
  assert.equal(first.membershipDragSession, null);
  assert.equal(second.membershipDragPreview, null);
});

test('boundary visual state resolves add, remove, and rejection feedback without graph mutation', () => {
  const add = renderer.resolveBoundaryVisualState({ id: 'target' }, {
    nodeId: 'node-a', sourceStructureId: null, targetStructureId: 'target', mode: 'add', message: 'ready',
  });
  assert.deepEqual(add, {
    mode: 'add-target', accent: renderer.MEMBERSHIP_DRAG_BOUNDARY_COLORS.add, emphasized: true, titleSuffix: '松手加入',
  });

  const remove = renderer.resolveBoundaryVisualState({ id: 'source' }, {
    nodeId: 'node-a', sourceStructureId: 'source', targetStructureId: null, mode: 'remove', message: 'ready',
  });
  assert.deepEqual(remove, {
    mode: 'remove-source', accent: renderer.MEMBERSHIP_DRAG_BOUNDARY_COLORS.remove, emphasized: true, titleSuffix: '松手移出',
  });

  const reject = renderer.resolveBoundaryVisualState({ id: 'target' }, {
    nodeId: 'node-a', sourceStructureId: 'source', targetStructureId: 'target', mode: 'reject', message: 'duplicate',
  });
  assert.deepEqual(reject, {
    mode: 'reject-target', accent: renderer.MEMBERSHIP_DRAG_BOUNDARY_COLORS.reject, emphasized: true, titleSuffix: '不可加入',
  });
  assert.deepEqual(renderer.resolveBoundaryVisualState({ id: 'other' }, null), { mode: 'default', emphasized: false });
});

test('PaneManager forwards optional membership drag callbacks without business logic', async () => {
  const source = await readFile(path.join(root, 'src', 'pane-manager.ts'), 'utf8');
  assert.match(source, /onNodeMembershipDragStart\?: \(pane: PaneState, id: string, x: number, y: number\) => void/);
  assert.match(source, /onNodeMembershipDragMove\?: \(pane: PaneState, id: string, x: number, y: number\) => void/);
  assert.match(source, /onNodeMembershipDragEnd\?: \(pane: PaneState, id: string, x: number, y: number, cancelled: boolean\) => void/);
  assert.match(source, /onNodeMembershipDragStart: \(id: string, x: number, y: number\) => ext\.onNodeMembershipDragStart\?\.\(pi, id, x, y\)/);
  assert.match(source, /onNodeMembershipDragMove: \(id: string, x: number, y: number\) => ext\.onNodeMembershipDragMove\?\.\(pi, id, x, y\)/);
  assert.match(source, /onNodeMembershipDragEnd: \(id: string, x: number, y: number, cancelled: boolean\) => ext\.onNodeMembershipDragEnd\?\.\(pi, id, x, y, cancelled\)/);
});
