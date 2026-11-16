import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const ts = createRequire(import.meta.url)('typescript');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const orderUrl = url(compile(await readFile(new URL('../../src/node-order.ts', import.meta.url), 'utf8')));
const structuresUrl = url(compile((await readFile(new URL('../../src/structure-nodes.ts', import.meta.url), 'utf8'))
  .replace("from './node-order'", `from '${orderUrl}'`)));
export const graphCopyModuleUrl = url(compile((await readFile(new URL('../../src/graph-copy.ts', import.meta.url), 'utf8'))
  .replace("from './node-order'", `from '${orderUrl}'`)
  .replace("from './structure-nodes'", `from '${structuresUrl}'`)));
