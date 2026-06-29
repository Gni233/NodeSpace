/**
 * [阉割] GitHub 更新检测模块
 * 原文件已备份至 nodespace-backup/src/update-checker.ts
 */

export interface UpdateInfo {
  version: string;
  body: string;
  htmlUrl: string;
  assets: { name: string; downloadUrl: string; size: number }[];
}

export async function checkUpdate(): Promise<UpdateInfo | null> { return null; }
export function getCurrentVersion(): string { return '0.1.0'; }
