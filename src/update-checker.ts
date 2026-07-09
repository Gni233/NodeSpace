/**
 * GitHub 更新检测模块
 * 查询 GitHub Releases API，对比版本号，返回更新信息
 */

const REPO_OWNER = 'Gni233';
const REPO_NAME = 'nodespace';
const CURRENT_VERSION = '0.1.0';

export interface UpdateInfo {
  version: string;
  body: string;
  htmlUrl: string;
  assets: { name: string; downloadUrl: string; size: number }[];
}

/** 简易 semver 比较：返回 1 表示 a > b，-1 表示 a < b，0 表示相等 */
function compareVersion(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

/** 查询 GitHub 最新 release */
export async function checkUpdate(): Promise<UpdateInfo | null> {
  try {
    const resp = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
      { headers: { Accept: 'application/vnd.github.v3+json' } }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const latestVersion = data.tag_name || '';
    if (compareVersion(latestVersion, CURRENT_VERSION) <= 0) return null;

    return {
      version: latestVersion,
      body: data.body || '',
      htmlUrl: data.html_url || '',
      assets: (data.assets || []).map((a: any) => ({
        name: a.name,
        downloadUrl: a.browser_download_url,
        size: a.size,
      })),
    };
  } catch {
    return null;
  }
}

export function getCurrentVersion(): string {
  return CURRENT_VERSION;
}
