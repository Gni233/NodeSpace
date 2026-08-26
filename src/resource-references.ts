import type { GraphData } from './data/storage';
import {
  joinVaultPath,
  normalizeVaultPath,
  vaultFolderResources,
  type VaultIndex,
  type VaultResource,
  type VaultResourceKind,
  type VaultSourceRef,
} from './vault';

export interface VaultResourceFingerprint {
  size: number;
  mtime: number;
}

/**
 * A persisted pointer from a writable NodeSpace graph to a Vault resource.
 * The wrapper card is editable; the referenced source is never copied or mutated.
 */
export interface ResourceReference extends VaultSourceRef {
  provider: 'vault';
  version: 1;
  fingerprint?: VaultResourceFingerprint;
}

export type ResourceReferenceStatus = 'ok' | 'broken';

export interface ResourceReferenceReconcileReport {
  checked: number;
  repaired: number;
  broken: number;
}

const allResources = (index: VaultIndex): VaultResource[] =>
  [...index.notes, ...index.attachments, ...index.graphs];

const referenceLabel = (source: Pick<VaultSourceRef, 'path' | 'displayLabel' | 'heading'>): string => {
  if (source.heading?.trim()) return source.heading.trim();
  if (source.displayLabel?.trim()) return source.displayLabel.trim();
  const name = normalizeVaultPath(source.path).split('/').pop() || '引用';
  return name.replace(/\.[^.]+$/, '') || name;
};

const resourceLabel = (resource: VaultResource): string =>
  resource.title?.trim() || resource.name.replace(/\.[^.]+$/, '') || resource.name;

const resourceMatchesKind = (resource: VaultResource, kind: VaultResourceKind): boolean =>
  resource.kind === kind;

const folderPaths = (index: VaultIndex): string[] => {
  const values = new Set<string>(['']);
  for (const resource of allResources(index)) {
    const parts = normalizeVaultPath(resource.path).split('/').filter(Boolean);
    for (let depth = 1; depth < parts.length; depth++) values.add(parts.slice(0, depth).join('/'));
  }
  return [...values];
};

const unique = <T>(values: T[]): T | null => values.length === 1 ? values[0] : null;

function resolveMovedResource(index: VaultIndex, reference: ResourceReference): VaultResource | null {
  const resources = allResources(index).filter(resource => resourceMatchesKind(resource, reference.kind));
  const exact = resources.find(resource => normalizeVaultPath(resource.path) === normalizeVaultPath(reference.path));
  if (exact) return exact;

  const fingerprint = reference.fingerprint;
  if (fingerprint) {
    const fingerprintMatch = unique(resources.filter(resource =>
      resource.size === fingerprint.size && resource.mtime === fingerprint.mtime));
    if (fingerprintMatch) return fingerprintMatch;
  }

  const oldName = normalizeVaultPath(reference.path).split('/').pop()?.toLocaleLowerCase('zh-CN');
  if (oldName) {
    const nameMatch = unique(resources.filter(resource => resource.name.toLocaleLowerCase('zh-CN') === oldName));
    if (nameMatch) return nameMatch;
  }

  const oldLabel = reference.displayLabel?.trim().toLocaleLowerCase('zh-CN');
  return oldLabel
    ? unique(resources.filter(resource => resourceLabel(resource).toLocaleLowerCase('zh-CN') === oldLabel))
    : null;
}

function resolveMovedFolder(index: VaultIndex, reference: ResourceReference): string | null {
  const normalized = normalizeVaultPath(reference.path).replace(/\/$/, '');
  const folders = folderPaths(index);
  if (folders.includes(normalized)) return normalized;
  const oldName = normalized.split('/').pop()?.toLocaleLowerCase('zh-CN');
  if (!oldName) return folders.includes('') ? '' : null;
  return unique(folders.filter(folder => folder.split('/').pop()?.toLocaleLowerCase('zh-CN') === oldName));
}

export function createVaultResourceReference(
  source: VaultSourceRef,
  index?: VaultIndex | null,
): ResourceReference {
  const normalized = normalizeVaultPath(source.path);
  const path = source.kind === 'folder' ? normalized.replace(/\/$/, '') : normalized;
  const resource = index && source.kind !== 'folder'
    ? allResources(index).find(candidate => normalizeVaultPath(candidate.path) === path)
    : undefined;
  return {
    provider: 'vault',
    version: 1,
    path,
    kind: source.kind,
    ...(source.heading ? { heading: source.heading } : {}),
    ...(Number.isFinite(source.line) ? { line: source.line } : {}),
    displayLabel: source.displayLabel || (resource ? resourceLabel(resource) : referenceLabel(source)),
    ...(resource ? { fingerprint: { size: resource.size, mtime: resource.mtime } } : {}),
  };
}

export function resourceReferenceForPath(
  index: VaultIndex,
  path: string,
  kind?: VaultResourceKind,
): ResourceReference | null {
  const normalized = normalizeVaultPath(path).replace(/\/$/, '');
  if (kind === 'folder') {
    const label = normalized.split('/').pop() || index.name || '资料库';
    return createVaultResourceReference({ path: normalized, kind: 'folder', displayLabel: label }, index);
  }
  const resource = allResources(index).find(candidate =>
    normalizeVaultPath(candidate.path) === normalized && (!kind || candidate.kind === kind));
  if (!resource) return null;
  return createVaultResourceReference({
    path: resource.path,
    kind: resource.kind,
    displayLabel: resourceLabel(resource),
  }, index);
}

export function createResourceReferenceNode(
  sourceNode: any,
  reference: ResourceReference,
  position: { x: number; y: number },
  id = `ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
): any {
  const tags = [...new Set([...(Array.isArray(sourceNode?.tags) ? sourceNode.tags : []), '引用'])];
  return {
    id,
    label: sourceNode?.label || referenceLabel(reference),
    headingLevel: Math.max(1, Math.min(6, Number(sourceNode?.headingLevel) || (reference.kind === 'folder' ? 2 : 3))),
    tags,
    note: String(sourceNode?.note || `引用 · ${reference.path}`),
    x: position.x,
    y: position.y,
    resourceRef: { ...reference },
    _resourceReferenceStatus: 'ok' as ResourceReferenceStatus,
    _isNew: true,
  };
}

export function isResourceReferenceNode(node: any): node is { resourceRef: ResourceReference; [key: string]: any } {
  const reference = node?.resourceRef;
  return Boolean(reference && reference.provider === 'vault' && reference.version === 1
    && typeof reference.path === 'string' && typeof reference.kind === 'string');
}

export function reconcileGraphResourceReferences(
  graph: GraphData,
  index: VaultIndex,
  absoluteRootPath = index.rootPath,
): ResourceReferenceReconcileReport {
  const report: ResourceReferenceReconcileReport = { checked: 0, repaired: 0, broken: 0 };
  for (const node of graph.nodes || []) {
    if (!isResourceReferenceNode(node)) continue;
    report.checked += 1;
    const reference = node.resourceRef;
    const previousPath = normalizeVaultPath(reference.path);
    const previousLabel = reference.displayLabel;
    if (reference.kind === 'folder') {
      const folder = resolveMovedFolder(index, reference);
      if (folder === null) {
        node._resourceReferenceStatus = 'broken';
        report.broken += 1;
        continue;
      }
      reference.path = folder;
      reference.displayLabel = folder.split('/').pop() || index.name || '资料库';
      node._resourceReferenceStatus = 'ok';
      if (folder !== previousPath) report.repaired += 1;
      if (!node.label || node.label === previousLabel) node.label = reference.displayLabel;
      continue;
    }

    const resource = resolveMovedResource(index, reference);
    if (!resource) {
      node._resourceReferenceStatus = 'broken';
      report.broken += 1;
      continue;
    }
    reference.path = normalizeVaultPath(resource.path);
    reference.displayLabel = resourceLabel(resource);
    reference.fingerprint = { size: resource.size, mtime: resource.mtime };
    node._resourceReferenceStatus = 'ok';
    if (reference.path !== previousPath) report.repaired += 1;
    if (!node.label || node.label === previousLabel) node.label = reference.displayLabel;
    if (resource.kind === 'image' || resource.kind === 'audio' || resource.kind === 'video' || resource.kind === 'pdf') {
      node.mediaType = resource.kind;
      node.mediaUrl = joinVaultPath(absoluteRootPath, resource.path);
    }
  }
  return report;
}

export function rewriteGraphResourceReferencePaths(
  graph: GraphData,
  oldVaultPath: string,
  newVaultPath: string,
): number {
  const from = normalizeVaultPath(oldVaultPath);
  const to = normalizeVaultPath(newVaultPath);
  let changed = 0;
  for (const node of graph.nodes || []) {
    if (!isResourceReferenceNode(node)) continue;
    const current = normalizeVaultPath(node.resourceRef.path);
    if (current !== from && !current.startsWith(`${from}/`)) continue;
    node.resourceRef.path = `${to}${current.slice(from.length)}`;
    node._resourceReferenceStatus = 'ok';
    changed += 1;
  }
  return changed;
}

export function resourceReferencePreviewMarkdown(
  reference: ResourceReference,
  index: VaultIndex,
): string {
  const label = referenceLabel(reference);
  if (reference.kind === 'folder') {
    const children = vaultFolderResources(index, reference.path);
    const lines = children.slice(0, 60).map(child =>
      `- ${child.kind === 'folder' ? '▸' : child.kind === 'markdown' ? '¶' : child.kind === 'graph' ? '⌘' : '◇'} ${child.name}`);
    const remaining = Math.max(0, children.length - lines.length);
    return [`# ${label}`, '', `路径：${reference.path || '/'}`, '', ...lines,
      ...(remaining ? ['', `另有 ${remaining} 项…`] : [])].join('\n');
  }
  return [`# ${label}`, '', `类型：${reference.kind}`, `路径：${reference.path}`,
    ...(reference.heading ? [`位置：${reference.heading}`] : [])].join('\n');
}
