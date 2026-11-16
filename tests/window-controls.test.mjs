import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const ts = createRequire(import.meta.url)('typescript');
const read = name => readFile(new URL(`../src/${name}`, import.meta.url), 'utf8');

test('the desktop buttons distinguish a click from a drag and stay in sync with the window', async () => {
  const source = (await read('window-controls.ts')).replace(/^import .*;\r?\n/gm, '').replace('export function', 'function');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const makeElement = tag => ({
    tag, children: [], style: {}, attributes: {}, classList: { add() {} },
    append(child) { this.children.push(child); },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(type, callback) { this[type] = callback; },
    setPointerCapture() {},
  });
  const createControls = new Function('document', 'Z_WINDOW_CONTROLS', `${code}\nreturn createWindowControls;`)(
    { createElement: makeElement }, 180,
  );
  const calls = [];
  const dragPhases = [];
  let maximizeChanged;
  const controls = createControls({
    minimizeWindow: () => calls.push('minimize'), maximizeWindow: () => calls.push('toggle'),
    closeWindow: () => calls.push('close'), isMaximized: async () => false,
    onMaximizeChange: callback => { maximizeChanged = callback; },
    dragWindow: phase => dragPhases.push(phase),
  });
  assert.equal(controls.className, 'fg-window-controls');
  const [minimize, maximize, close] = controls.children;
  for (const button of [minimize, maximize, close]) {
    assert.match(button.innerHTML, /viewBox="0 0 16 16"/);
    button.click({ detail: 0 });
  }
  assert.deepEqual(calls, ['minimize', 'toggle', 'close']);
  maximizeChanged(true);
  await Promise.resolve();
  assert.equal(maximize.attributes['aria-label'], '还原窗口');
  maximizeChanged(false);
  assert.equal(maximize.attributes['aria-label'], '最大化');
  const pointer = { pointerId: 1, button: 0, isPrimary: true, screenX: 790, screenY: 27 };
  close.pointerdown(pointer);
  close.pointermove({ ...pointer, screenX: 793 });
  assert.deepEqual(dragPhases, ['start']);
  close.pointermove({ ...pointer, screenY: 37 });
  close.pointerup(pointer);
  let prevented = false;
  close.click({ detail: 1, preventDefault() { prevented = true; } });
  assert.deepEqual(dragPhases, ['start', 'move', 'end']);
  assert.equal(prevented, true);
  assert.deepEqual(calls, ['minimize', 'toggle', 'close']);
  close.pointerdown(pointer);
  close.pointerup(pointer);
  close.click({ detail: 1 });
  assert.equal(calls.length, 4);
});

test('the same desktop button group mounts into the workbench modal and returns to the canvas', async () => {
  const [main, home, styles] = await Promise.all([read('main.ts'), read('workbench-home.ts'), read('workspace-ui.css')]);
  assert.match(main, /appShell\.append\(windowControls\)/);
  assert.match(home, /element\.prepend\(windowControls\);\s*element\.showModal\(\)/);
  assert.match(home, /controlsHost\.append\(windowControls\)/);
  assert.match(styles, /\.fg-window-controls \{[^}]*-webkit-app-region: no-drag;/);
  assert.doesNotMatch(styles, /\.fg-window-titlebar/);
});

test('dragging window buttons keeps the pointer anchor when the maximized window restores', async () => {
  const source = await readFile(new URL('../electron/main.cjs', import.meta.url), 'utf8');
  const start = source.indexOf("ipcMain.on('window-drag',");
  const end = source.indexOf("ipcMain.on('window-close-ready',", start);
  assert.ok(start > 0 && end > start);
  const positions = [];
  let cursor = { x: 900, y: 28 };
  let maximized = true;
  const mainWindow = {
    webContents: {}, isFullScreen: () => false,
    getBounds: () => ({ x: 0, y: 0, width: 1000, height: 720 }),
    getNormalBounds: () => ({ width: 800 }),
    isMaximized: () => maximized, unmaximize() { maximized = false; },
    setPosition: (x, y) => positions.push([x, y]),
  };
  let handle;
  new Function('ipcMain', 'screen', 'mainWindow', `let windowDrag; ${source.slice(start, end)}`)(
    { on: (_channel, listener) => { handle = listener; } }, { getCursorScreenPoint: () => cursor }, mainWindow,
  );
  const sender = { sender: mainWindow.webContents };
  handle(sender, 'start');
  cursor = { x: 950, y: 63 };
  handle(sender, 'move');
  assert.equal(maximized, false);
  assert.deepEqual(positions, [[230, 35]]);
  handle(sender, 'end');
  handle(sender, 'move');
  assert.equal(positions.length, 1);
});
