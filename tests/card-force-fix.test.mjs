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

test('card link force excludes ordinary visual edges and transient edges', async () => {
  const { isCardForceLink } = await importTypeScriptModule(
    path.join(root, 'src', 'cardgrid', 'force-links.ts'),
  );

  assert.equal(isCardForceLink({}), true);
  assert.equal(isCardForceLink({ lineStyle: 'dash-2' }), false);
  assert.equal(isCardForceLink({ lineStyle: 'dot' }), false);
  assert.equal(isCardForceLink({ lineStyle: 'dash-2', _structureMembership: true }), true);
  assert.equal(isCardForceLink({ _structureMembership: true, _conflict: true }), false);
  assert.equal(isCardForceLink({ _structureMembership: true, _dyingAt: 1 }), false);
});

test('card grid applies the force-link eligibility rule and canvas has no tap highlight', async () => {
  const cardGrid = await readFile(path.join(root, 'src', 'cardgrid', 'index.ts'), 'utf8');
  const styles = await readFile(path.join(root, 'index.html'), 'utf8');

  assert.match(cardGrid, /import \{ isCardForceLink \} from '\.\/force-links';/);
  assert.match(cardGrid, /cardNodeIds\.has\(s\) && cardNodeIds\.has\(t\) && isCardForceLink\(e\)/);
  assert.match(styles, /canvas \{\s*touch-action: none;\s*-webkit-tap-highlight-color: transparent;/);
});
