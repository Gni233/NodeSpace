/**
 * [阉割] 鸿蒙 WebView 文件系统模块
 * 原文件已备份至 nodespace-backup/src/fs-harmony.ts
 */

export async function listFilesHarmony(): Promise<{ name: string; kind: 'file' | 'directory'; children: any[] }[]> { return []; }
export async function readFileHarmony(_fileName: string): Promise<any | null> { return null; }
export async function writeFileHarmony(_fileName: string, _data: any): Promise<boolean> { return false; }
export async function deleteFileHarmony(_fileName: string): Promise<boolean> { return false; }
export async function importFilesHarmony(_files: FileList): Promise<void> {}
export function createHarmonyFileImporter(_onDone: () => void): { label: HTMLElement } {
  const label = document.createElement('label');
  label.textContent = '导入文件';
  return { label };
}
