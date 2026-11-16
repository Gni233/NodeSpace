import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const asUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
let source = await readFile(new URL('../src/utils/animate-nodes.ts', import.meta.url), 'utf8');
source = source.replace("'./easing'", `'${asUrl('export const easeInOutCubic = t => t;')}'`)
  .replace("'../layout-constants'", `'${asUrl('export const LAYOUT_ANIM_DURATION = 300;')}'`);
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { startNodeAnimation } = await import(asUrl(output));

test('reduced motion and zero-duration layouts settle immediately without an animation loop', () => {
  const previous = { matchMedia: globalThis.matchMedia, requestAnimationFrame: globalThis.requestAnimationFrame };
  try {
    globalThis.requestAnimationFrame = () => { throw new Error('No animation loop should be scheduled'); };
    for (const reduced of [true, false]) {
      globalThis.matchMedia = () => ({ matches: reduced });
      const node = { id: 'a', x: 0, y: 0 };
      const simNode = { ...node };
      let completed = 0;
      startNodeAnimation({
        nodes: [node], simNodes: [simNode], duration: reduced ? 300 : 0,
        getTarget: () => ({ x: 40, y: -20 }),
        unfixSimOnComplete: true,
        onComplete: () => { completed++; },
      });
      assert.deepEqual([node.x, node.y, simNode.x, simNode.y], [40, -20, 40, -20]);
      assert.deepEqual([simNode.fx, simNode.fy], [null, null]);
      assert.equal(completed, 1);
    }
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});
