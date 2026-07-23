import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadSharedState() {
  const source = await readFile(path.join(root, 'src', 'shared-state.ts'), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

test('selection handler registration removes only its own pane handlers', async () => {
  const { sharedState } = await loadSharedState();
  sharedState.resetClearSelection();
  sharedState.resetSetSelectedNodeIds();

  const calls = [];
  const disposeFirst = sharedState.registerSelectionHandlers(
    () => ['first'],
    () => calls.push('first-clear'),
    ids => calls.push(`first-set:${ids.join(',')}`),
  );
  const disposeSecond = sharedState.registerSelectionHandlers(
    () => ['second'],
    () => calls.push('second-clear'),
    ids => calls.push(`second-set:${ids.join(',')}`),
  );

  sharedState.clearSelection();
  sharedState.setSelectedNodeIds(['n1']);
  assert.deepEqual(calls, ['first-clear', 'second-clear', 'first-set:n1', 'second-set:n1']);
  assert.deepEqual(sharedState.selectedNodeIds, ['second']);

  disposeSecond();
  disposeSecond();
  calls.length = 0;
  sharedState.clearSelection();
  sharedState.setSelectedNodeIds(['n2']);
  assert.deepEqual(calls, ['first-clear', 'first-set:n2']);
  assert.deepEqual(sharedState.selectedNodeIds, []);

  disposeFirst();
});

test('canvas event disposer explicitly unregisters external listeners and pane lifecycle invokes it', async () => {
  const [eventsSource, paneStateSource, paneManagerSource, mainSource] = await Promise.all([
    readFile(path.join(root, 'src', 'ui-events.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'pane-state.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'pane-manager.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'main.ts'), 'utf8'),
  ]);

  assert.match(eventsSource, /export type CanvasEventsDisposer = \(\) => void/);
  assert.match(eventsSource, /return \(\) => \{[\s\S]*?clearLongPress\(\)/);
  assert.match(eventsSource, /window\.removeEventListener\("pointerup", onPointerUp, \{ capture: true \}\)/);
  assert.match(eventsSource, /canvas\.removeEventListener\("pointerdown", onPointerDown, \{ capture: true \}\)/);
  assert.match(eventsSource, /canvas\.removeEventListener\("pointermove", onPointerMove\)/);
  assert.match(eventsSource, /canvas\.removeEventListener\("pointercancel", onPointerCancel\)/);
  assert.match(eventsSource, /canvas\.removeEventListener\("pointerleave", onPointerLeave\)/);
  assert.match(eventsSource, /canvas\.removeEventListener\("contextmenu", onContextMenu\)/);
  assert.match(eventsSource, /ctx\.viewport\?\.off\?\.\('drag-start', onViewportDragStart\)/);
  assert.match(eventsSource, /tooltip\.remove\(\)/);
  assert.match(eventsSource, /for \(const timer of pendingTimers\) clearTimeout\(timer\)/);
  assert.match(eventsSource, /canvas\.releasePointerCapture\(activePointerId\)/);
  assert.match(eventsSource, /if \(ctx\.viewport && !ctx\.isCardGridMode\?\.\(\)\) ctx\.viewport\.pause = false/);

  assert.match(paneStateSource, /disposeCanvasEvents: \(\(\) => void\) \| null/);
  assert.match(paneManagerSource, /pane\.disposeCanvasEvents\?\.\(\);[\s\S]*?pane\.disposeCanvasEvents = null/);
  assert.match(paneManagerSource, /pane\.disposeCanvasEvents = setupCanvasEvents/);
  assert.match(mainSource, /pane\.disposeCanvasEvents\?\.\(\);[\s\S]*?pane\.disposeCanvasEvents = setupCanvasEvents/);
  assert.match(mainSource, /np\.disposeCanvasEvents\?\.\(\);[\s\S]*?np\.disposeCanvasEvents = null/);
  assert.match(mainSource, /disposePane0CanvasEvents\?\.\(\);[\s\S]*?for \(const pane of extraPanes\)/);
});
