import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function importTypeScriptModule(filePath) {
  const source = await readFile(filePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

test('force density presets apply full fixed mechanics and detect custom changes', async () => {
  const {
    FORCE_DENSITY_PRESETS,
    applyForceDensityPreset,
    detectForceDensityPreset,
  } = await importTypeScriptModule(path.join(root, 'src', 'force-density-presets.ts'));

  assert.deepEqual(Object.keys(FORCE_DENSITY_PRESETS), ['极疏', '疏', '均衡', '密', '极密']);
  const source = { ...FORCE_DENSITY_PRESETS.均衡, labelSize: 18 };
  const dense = applyForceDensityPreset(source, '密');

  assert.equal(dense.linkDist, 80);
  assert.equal(dense.charge, -70);
  assert.equal(dense.labelSize, 18);
  assert.equal(detectForceDensityPreset(dense), '密');
  assert.equal(detectForceDensityPreset({ ...dense, linkDist: 81 }), 'custom');
});

test('mobile toolbar exposes contextual child creation and heading actions in its API', async () => {
  const source = await readFile(path.join(root, 'src', 'ui-mobile-toolbar.ts'), 'utf8');

  assert.match(source, /createChildNode\?: \(\) => void/);
  assert.match(source, /raiseHeading\?: \(\) => void/);
  assert.match(source, /lowerHeading\?: \(\) => void/);
  assert.match(source, /getSelectionState\?: \(\) => MobileToolbarSelectionState/);
  assert.match(source, /activateSelection\?: \(\) => void/);
  assert.match(source, /createsChild \? '新建子节点' : '新建节点'/);
  assert.match(source, /runAndSync\(callbacks\.createChildNode\)/);
  assert.match(source, /raiseHeadingBtn/);
  assert.match(source, /lowerHeadingBtn/);
  assert.match(source, /openBtn/);
  assert.match(source, /syncDisabled\(raiseHeadingBtn, !callbacks\.raiseHeading \|\| !selection\.canRaiseHeading\)/);
  assert.match(source, /syncDisabled\(lowerHeadingBtn, !callbacks\.lowerHeading \|\| !selection\.canLowerHeading\)/);
  assert.match(source, /syncDisabled\(openBtn, !callbacks\.activateSelection \|\| !selection\.hasSelection\)/);
  assert.match(source, /classList\.toggle\('has-mobile-toolbar', visible\)/);
  assert.match(source, /classList\.remove\('has-mobile-toolbar'\)/);
});

test('main integrates focused-pane child creation and hierarchy actions', async () => {
  const source = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');

  assert.match(source, /const createChildNodeForPane = \(parentId: string, targetPane = focusedExtraPane\(\)\)/);
  assert.match(source, /childLevel = Math\.min\(6, \(parent\.headingLevel \|\| 6\) \+ 1\)/);
  assert.match(source, /lineStyle: 'solid'/);
  assert.match(source, /assignCreatedOrder\(child, targetGraph\.nodes\)/);
  assert.match(source, /selectAndEditFocusedNode\(childId, targetPane\)/);
  assert.match(source, /reinitializeRuntimeViews\(targetPane\?\.runtime \?\? primaryRuntime\)/);
  assert.match(source, /getSelectionState: focusedMobileSelectionState/);
  assert.match(source, /activateSelection:[\s\S]*?enterStructureForPane/);
  assert.match(source, /raiseHeading: \(\) => changeFocusedHeading\(-1\)/);
  assert.match(source, /lowerHeading: \(\) => changeFocusedHeading\(1\)/);
  assert.match(source, /node\.radius = undefined;\s*node\.radiusMode = undefined/);
  assert.match(source, /if \(!node \|\| isStructureNode\(node\)\) return/);
  assert.match(source, /if \(focusedInteractionBlocked\('新建子节点'\)\) return null/);
});

test('settings UI integrates five density presets and custom detection', async () => {
  const source = await readFile(path.join(root, 'src', 'ui-settings.ts'), 'utf8');

  assert.match(source, /Object\.keys\(FORCE_DENSITY_PRESETS\)/);
  assert.match(source, /customOption\.textContent = '自定义'/);
  assert.match(source, /densitySelect\.value = detectForceDensityPreset\(getForceDensitySettings\(\)\)/);
  assert.match(source, /applyForceDensityPreset\(getForceDensitySettings\(\), densitySelect\.value as ForceDensityPreset\)/);
  assert.match(source, /onMechanicsChange = \(\) => \{ densitySelect\.value = detectForceDensityPreset/);
  assert.doesNotMatch(source, /forceDensityPreset\s*:/);
});

test('node context menu supports disabled hierarchy boundaries and keeps delete last', async () => {
  const mainSource = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');
  const menuSource = await readFile(path.join(root, 'src', 'ui-contextmenu.ts'), 'utf8');

  assert.match(mainSource, /label: '提升层级', disabled: headingLevel <= 1/);
  assert.match(mainSource, /label: '降低层级', disabled: headingLevel >= 6/);
  assert.match(mainSource, /items\.push\(deleteItem\)/);
  assert.match(menuSource, /separator\?: boolean/);
  assert.match(menuSource, /disabled\?: boolean/);
  assert.match(menuSource, /if \(item\.disabled\) return/);
});
