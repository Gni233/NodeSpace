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

test('static simulation retains only the supplied node array and no force state', async () => {
  const { createStaticSimulation, isStaticSimulation } = await importTypeScriptModule(
    path.join(root, 'src', 'static-simulation.ts'),
  );
  const nodes = [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: 30, y: 40 },
  ];
  const simulation = createStaticSimulation(nodes);

  assert.equal(isStaticSimulation(simulation), true);
  assert.equal(simulation.nodes(), nodes);
  assert.equal(simulation.alpha(), 0);
  assert.equal(simulation.alphaTarget(), 0);
  assert.equal(simulation.force('link', { retainedByD3: true }), simulation);
  assert.equal(simulation.force('link'), undefined);
  assert.equal(simulation.alpha(1).alphaTarget(0.3).restart().tick().stop(), simulation);
  assert.equal(simulation.find(25, 35), nodes[1]);
  assert.equal(simulation.find(500, 500, 10), undefined);

  const replacement = [{ id: 'c', x: 2, y: 3 }];
  assert.equal(simulation.nodes(replacement), simulation);
  assert.equal(simulation.nodes(), replacement);
});

test('auto layout uses a static runtime and Pixi renders on demand', async () => {
  const [main, graphSim, pixiApp] = await Promise.all([
    readFile(path.join(root, 'src', 'main.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'graph-sim.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'pixi-app.ts'), 'utf8'),
  ]);
  const semanticSection = main.slice(
    main.indexOf('const applySemanticPositions'),
    main.indexOf('activateSemanticLayoutForPane ='),
  );

  assert.match(semanticSection, /targetSimManager\.initStatic/);
  assert.doesNotMatch(semanticSection, /targetSimManager\.initSim/);
  assert.match(main, /setStaticMode\(mode === 'auto'\)/);
  assert.match(graphSim, /createStaticSimulation\(nodes\)/);
  assert.match(graphSim, /uses graph nodes directly|uses graph nodes directly/i);
  assert.match(pixiApp, /autoStart:\s*false/);
  assert.match(main, /const renderPixiFrames/);
  assert.match(main, /pixi\?\.app\.render\(\)/);
  assert.doesNotMatch(main, /pixi\?\.app\?\.ticker\?\.update\(\)/);
  const gridOnlySection = main.slice(main.indexOf('const drawGridOnly'), main.indexOf('let _skipDraw'));
  assert.match(gridOnlySection, /updateSemanticBodiesForViewport\(nodeSprites\.values\(\), t\.k\)/);
  assert.match(gridOnlySection, /updateSemanticBodiesForViewport\(extraSprites\[i\]\?\.values\(\) \|\| \[\], t\.k\)/);
  assert.doesNotMatch(gridOnlySection, /pane0Draw\(\)|drawExtraPanes\(\)/);
});

test('external graph refresh rebuilds auto static nodes instead of appending duplicates', async () => {
  const main = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');
  const handlerStart = main.indexOf('async function handleExternalGraphChange');
  const guardStart = main.indexOf("if (activeMode === 'auto')", handlerStart);
  const incrementalStart = main.indexOf('// 8) 增量更新', guardStart);
  assert.ok(handlerStart > 0 && guardStart > handlerStart && incrementalStart > guardStart);
  const guard = main.slice(guardStart, incrementalStart);
  assert.match(guard, /simManager\.setStaticMode\(true\)/);
  assert.match(guard, /simManager\.initStatic\(\)/);
  assert.match(guard, /activateSemanticLayoutForPane/);
  assert.match(guard, /return;/);
  assert.doesNotMatch(main.slice(handlerStart, guardStart), /clearRuntimeLayouts\(targetRuntime\)/);
  assert.doesNotMatch(guard, /activeMode\s*=\s*'auto'/);
});

test('live layout choice survives graph and Vault refreshes and every mode switch is persisted', async () => {
  const main = await readFile(path.join(root, 'src', 'main.ts'), 'utf8');
  const externalStart = main.indexOf('async function handleExternalGraphChange');
  const externalEnd = main.indexOf('function clearPaneLayout', externalStart);
  const externalSection = main.slice(externalStart, externalEnd);
  assert.match(externalSection, /primaryModeBeforeReload/);
  assert.match(externalSection, /activeMode = primaryModeBeforeReload/);
  assert.match(externalSection, /owner\.activeMode = retainedMode/);

  const vaultStart = main.indexOf('reloadVaultResourceViews = async');
  const vaultEnd = main.indexOf('const semanticLensTimers', vaultStart);
  const vaultSection = main.slice(vaultStart, vaultEnd);
  assert.match(vaultSection, /retainedPrimaryMode/);
  assert.match(vaultSection, /retainedPaneModes/);
  assert.doesNotMatch(vaultSection, /activeMode\s*=\s*'auto'/);
  assert.doesNotMatch(vaultSection, /owner\.activeMode\s*=\s*'auto'/);

  const applyStart = main.indexOf('const applyLayoutMode =');
  const applyEnd = main.indexOf('const renderModeBar =', applyStart);
  const applySection = main.slice(applyStart, applyEnd);
  const selectedAt = applySection.indexOf('activeMode = mode');
  const persistedAt = applySection.indexOf('scheduleSaveForRuntime(targetRuntime)', selectedAt);
  const branchAt = applySection.indexOf("if (mode === 'auto')", selectedAt);
  assert.ok(selectedAt >= 0 && persistedAt > selectedAt && persistedAt < branchAt);
});
