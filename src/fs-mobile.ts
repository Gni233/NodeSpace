/**
 * [阉割] Capacitor/移动端文件系统模块
 * 原文件已备份至 nodespace-backup/src/fs-mobile.ts
 */

export function isCapacitor(): boolean { return false; }
export async function importFilesMobile(_files: FileList): Promise<void> {}
export async function pickDirectoryAndImport(): Promise<number> { return 0; }
export function createFileImporter(_onDone: () => void): { label: HTMLElement; input: HTMLInputElement } {
  const input = document.createElement('input');
  input.type = 'file';
  const label = document.createElement('label');
  return { label, input };
}
export async function listFilesMobile(): Promise<{ name: string; kind: 'file' | 'directory'; children: any[] }[]> { return []; }
export async function readFileMobile(_fileName: string): Promise<any | null> { return null; }
export async function writeFileMobile(_fileName: string, _data: any): Promise<boolean> { return false; }
export async function deleteFileMobile(_fileName: string): Promise<boolean> { return false; }
export async function installApk(_url: string): Promise<void> {}
export async function downloadApk(_url: string): Promise<void> {}
export async function downloadReleaseApk(): Promise<void> {}
