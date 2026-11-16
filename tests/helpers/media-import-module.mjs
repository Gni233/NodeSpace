import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const ts = createRequire(import.meta.url)('typescript');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
export const mediaAssetsModuleUrl = url(compile(await readFile(new URL('../../src/media-assets.ts', import.meta.url), 'utf8')));
const nodeOrderUrl = url(compile(await readFile(new URL('../../src/node-order.ts', import.meta.url), 'utf8')));
export const mediaImportModuleUrl = url(compile((await readFile(new URL('../../src/media-import.ts', import.meta.url), 'utf8'))
  .replace("from './node-order'", `from '${nodeOrderUrl}'`)
  .replace("from './media-assets'", `from '${mediaAssetsModuleUrl}'`)));
