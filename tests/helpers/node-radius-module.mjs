import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = await readFile(new URL('../../src/node-radius.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
export const nodeRadiusModuleUrl = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;

export function inlineNodeRadiusModule(source) {
  return source.replace(/(['"])\.\.?\/node-radius\1/g, `'${nodeRadiusModuleUrl}'`);
}
