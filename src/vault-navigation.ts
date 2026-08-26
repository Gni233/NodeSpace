import {
  isVaultLocationTabId,
  isVaultSpaceTabId,
  normalizeVaultPath,
  vaultSpacePathFromTabId,
  vaultSpaceTabId,
  vaultPathFromTabId,
  type VaultIndex,
  type VaultResource,
  type VaultResourceKind,
} from './vault';

export interface VaultLocationCrumb {
  label: string;
  tabId: string;
  kind: 'root' | 'folder' | 'resource';
  current: boolean;
}

const allResources = (index: VaultIndex): VaultResource[] =>
  [...index.notes, ...index.attachments, ...index.graphs];

const resourceForPath = (index: VaultIndex, path: string): VaultResource | undefined => {
  const normalized = normalizeVaultPath(path);
  return allResources(index).find(resource => normalizeVaultPath(resource.path) === normalized);
};

export function vaultLocationCrumbs(index: VaultIndex, tabId: string): VaultLocationCrumb[] {
  if (!isVaultLocationTabId(tabId)) return [];
  const folderPath = vaultSpacePathFromTabId(tabId);
  const resourcePath = vaultPathFromTabId(tabId);
  const targetPath = folderPath ?? resourcePath ?? '';
  const parts = normalizeVaultPath(targetPath).split('/').filter(Boolean);
  const crumbs: VaultLocationCrumb[] = [{
    label: index.name || '资料库',
    tabId: vaultSpaceTabId(''),
    kind: 'root',
    current: parts.length === 0 && folderPath !== null,
  }];
  const folderParts = folderPath !== null ? parts : parts.slice(0, -1);
  folderParts.forEach((part, indexInPath) => {
    const path = folderParts.slice(0, indexInPath + 1).join('/');
    crumbs.push({
      label: part,
      tabId: vaultSpaceTabId(path),
      kind: 'folder',
      current: folderPath !== null && indexInPath === folderParts.length - 1,
    });
  });
  if (resourcePath !== null) {
    const resource = resourceForPath(index, resourcePath);
    const fallback = parts[parts.length - 1] || resourcePath;
    crumbs.push({
      label: resource?.title || fallback.replace(/\.[^.]+$/, ''),
      tabId,
      kind: 'resource',
      current: true,
    });
  }
  return crumbs;
}

export function vaultLocationKind(index: VaultIndex, tabId: string): VaultResourceKind | 'root' | null {
  if (isVaultSpaceTabId(tabId)) return vaultSpacePathFromTabId(tabId) ? 'folder' : 'root';
  const path = vaultPathFromTabId(tabId);
  return path === null ? null : resourceForPath(index, path)?.kind ?? (/\.md$/i.test(path) ? 'markdown' : null);
}

export interface VaultSpaceBreadcrumb {
  readonly element: HTMLElement;
  update(index: VaultIndex | null, tabId: string, journey?: ReferenceJourney | null): void;
  hide(): void;
  dispose(): void;
}

export interface ReferenceJourney {
  originLabel: string;
  targetLabel: string;
}

export function createVaultSpaceBreadcrumb(
  root: HTMLElement,
  callbacks: { navigate: (tabId: string) => void; returnToOrigin?: () => void },
): VaultSpaceBreadcrumb {
  const element = document.createElement('nav');
  element.className = 'fg-vault-space-breadcrumb';
  element.setAttribute('aria-label', '资料库空间导航');
  element.hidden = true;
  root.appendChild(element);

  const update = (index: VaultIndex | null, tabId: string, journey?: ReferenceJourney | null) => {
    element.replaceChildren();
    const isVaultLocation = Boolean(index && isVaultLocationTabId(tabId));
    if (!isVaultLocation && !journey) {
      element.hidden = true;
      return;
    }
    const crumbs = isVaultLocation ? vaultLocationCrumbs(index!, tabId) : [];
    const backTarget = !journey && crumbs.length > 1 ? crumbs[crumbs.length - 2] : null;
    const back = document.createElement('button');
    back.type = 'button';
    back.className = `fg-vault-space-back${journey ? ' is-reference-return' : ''}`;
    back.setAttribute('aria-label', journey ? `返回 ${journey.originLabel}` : '返回上一级空间');
    back.title = journey ? `返回 ${journey.originLabel}` : backTarget ? `返回 ${backTarget.label}` : '已经位于资料库根空间';
    back.disabled = !journey && !backTarget;
    back.innerHTML = '<span aria-hidden="true">←</span>';
    if (journey) back.addEventListener('click', () => callbacks.returnToOrigin?.());
    else if (backTarget) back.addEventListener('click', () => callbacks.navigate(backTarget.tabId));
    element.appendChild(back);

    const trail = document.createElement('div');
    trail.className = 'fg-vault-space-trail';
    const visibleCrumbs = crumbs.length > 0 ? crumbs : journey ? [
      { label: journey.originLabel, tabId: '', kind: 'root' as const, current: false },
      { label: journey.targetLabel, tabId, kind: 'resource' as const, current: true },
    ] : [];
    visibleCrumbs.forEach((crumb, crumbIndex) => {
      if (crumbIndex > 0) {
        const separator = document.createElement('span');
        separator.className = 'fg-vault-space-separator';
        separator.textContent = '›';
        separator.setAttribute('aria-hidden', 'true');
        trail.appendChild(separator);
      }
      if (crumb.current) {
        const current = document.createElement('span');
        current.className = 'fg-vault-space-current';
        current.textContent = crumb.label;
        current.setAttribute('aria-current', 'page');
        trail.appendChild(current);
      } else {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'fg-vault-space-crumb';
        button.textContent = crumb.label;
        if (journey && !crumb.tabId) button.addEventListener('click', () => callbacks.returnToOrigin?.());
        else button.addEventListener('click', () => callbacks.navigate(crumb.tabId));
        trail.appendChild(button);
      }
    });
    element.appendChild(trail);

    const kind = isVaultLocation ? vaultLocationKind(index!, tabId) : null;
    const context = document.createElement('span');
    context.className = 'fg-vault-space-context';
    context.textContent = journey ? `来自 ${journey.originLabel}`
      : kind === 'root' ? '资料库总览'
      : kind === 'folder' ? '文件夹空间'
      : kind === 'markdown' ? 'Markdown 空间'
      : kind === 'graph' ? '图空间'
      : kind === 'pdf' ? 'PDF'
      : kind === 'image' ? '图像'
      : kind === 'audio' ? '音频'
      : kind === 'video' ? '视频'
      : '来源空间';
    element.appendChild(context);
    element.hidden = false;
  };

  return {
    element,
    update,
    hide: () => { element.hidden = true; },
    dispose: () => element.remove(),
  };
}

export interface VaultViewportState {
  centerX: number;
  centerY: number;
  scale: number;
  touchedAt: number;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const VIEWPORT_MEMORY_KEY = 'fg-vault-space-viewports-v1';
const MAX_VIEWPORTS = 160;

export class VaultViewportMemory {
  constructor(private readonly storage: StorageLike) {}

  private read(): Record<string, VaultViewportState> {
    try {
      const value = JSON.parse(this.storage.getItem(VIEWPORT_MEMORY_KEY) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch {
      return {};
    }
  }

  load(tabId: string): VaultViewportState | null {
    if (!isVaultLocationTabId(tabId)) return null;
    const state = this.read()[tabId];
    return state && Number.isFinite(state.centerX) && Number.isFinite(state.centerY)
      && Number.isFinite(state.scale) && state.scale > 0 ? state : null;
  }

  save(tabId: string, state: Omit<VaultViewportState, 'touchedAt'>): void {
    if (!isVaultLocationTabId(tabId) || !Number.isFinite(state.centerX)
      || !Number.isFinite(state.centerY) || !Number.isFinite(state.scale) || state.scale <= 0) return;
    const values = this.read();
    values[tabId] = {
      centerX: state.centerX,
      centerY: state.centerY,
      scale: Math.max(0.05, Math.min(8, state.scale)),
      touchedAt: Date.now(),
    };
    const trimmed = Object.fromEntries(Object.entries(values)
      .filter((entry): entry is [string, VaultViewportState] => Boolean(entry[1] && typeof entry[1] === 'object'))
      .sort((left, right) => right[1].touchedAt - left[1].touchedAt)
      .slice(0, MAX_VIEWPORTS));
    try { this.storage.setItem(VIEWPORT_MEMORY_KEY, JSON.stringify(trimmed)); } catch {}
  }
}
