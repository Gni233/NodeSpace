import type { FileAdapter } from './file-adapter';

const reservedWindowsName = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i;

/** Keep imported titles human-readable, but never interpret them as a path. */
export function backupFileStem(value: string): string {
  const stem = [...value.normalize('NFC')
    .replace(/\.json$/i, '')
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, ' ')
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\s+/gu, ' ')
    .replace(/^[. ]+|[. ]+$/gu, '')].slice(0, 56).join('').replace(/[. ]+$/u, '');
  if (!stem) return '未命名空间';
  return reservedWindowsName.test(stem) ? '空间 ' + stem : stem;
}

/** Check the adapter before using a fresh, root-level name. Never fall back on read errors. */
export async function findRestoreCopyPath(
  name: string,
  adapter: Pick<FileAdapter, 'readFile'>,
  isReserved: (path: string) => boolean = () => false,
): Promise<string> {
  return findAvailableSpacePath(backupFileStem(name) + '（恢复）', adapter, isReserved);
}

export async function findAvailableSpacePath(
  stem: string,
  adapter: Pick<FileAdapter, 'readFile'>,
  isReserved: (path: string) => boolean = () => false,
): Promise<string> {
  for (let index = 1; index <= 100; index++) {
    const candidate = stem + (index === 1 ? '' : ` ${index}`) + '.json';
    if (isReserved(candidate)) continue;
    const result = await adapter.readFile(candidate);
    if (!result.ok) throw new Error('无法检查目标文件是否已存在');
    if (result.value === null) return candidate;
  }
  throw new Error('已有过多同名空间，请换一个名称');
}

export function describeBackupContents(summary: {
  bundledAttachments: number;
  missingAttachments: number;
  externalMedia: number;
  vaultReferences: number;
  spaceReferences: number;
}): string {
  const result = [`${summary.bundledAttachments} 个随包附件`];
  if (summary.missingAttachments) result.push(`${summary.missingAttachments} 个找不到原文件的附件`);
  const references = summary.externalMedia + summary.vaultReferences + summary.spaceReferences;
  if (references) result.push(`${references} 条需重新关联的外部引用`);
  return result.join('，');
}
