/**
 * [阉割] SAF (Storage Access Framework) 原生桥接模块
 * 原文件已备份至 nodespace-backup/src/saf-bridge.ts
 */

export async function safPickDirectory(): Promise<{ path: string; name: string } | null> { return null; }
export async function safRestoreDirectory(): Promise<{ path: string; name: string } | null> { return null; }
export async function safListFiles(): Promise<any[]> { return []; }
export async function safReadFile(_fileName: string): Promise<string | null> { return null; }
export async function safWriteFile(_fileName: string, _data: string): Promise<boolean> { return false; }
export async function safDeleteFile(_fileName: string): Promise<boolean> { return false; }
export function safIsAvailable(): boolean { return false; }
