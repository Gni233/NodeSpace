import type { GraphData } from './data/storage';
import { getStructureInteriorProjection } from './structure-nodes';

export interface StructureNavigationOptions {
  /** V1 permits one entered structure; callers may opt into deeper paths later. */
  maxDepth?: number;
}

/**
 * Pane-local navigation state for viewing the contents of structure nodes.
 * The root graph is represented by an empty path rather than a synthetic ID.
 */
export class StructureNavigationState {
  readonly maxDepth: number;
  private readonly ids: string[] = [];

  constructor({ maxDepth = 1 }: StructureNavigationOptions = {}) {
    this.maxDepth = Number.isFinite(maxDepth)
      ? Math.max(0, Math.floor(maxDepth))
      : 1;
  }

  get currentId(): string | null {
    return this.ids.length > 0 ? this.ids[this.ids.length - 1] : null;
  }

  get path(): readonly string[] {
    return Object.freeze([...this.ids]);
  }

  /** Enters an unseen structure when the configured depth limit allows it. */
  enter(id: string): boolean {
    if (!id || this.ids.includes(id) || this.ids.length >= this.maxDepth) return false;
    this.ids.push(id);
    return true;
  }

  /** Leaves the current structure and returns whether navigation changed. */
  exit(): boolean {
    if (this.ids.length === 0) return false;
    this.ids.pop();
    return true;
  }

  /**
   * Keeps the path through the requested structure index. Use -1 to return
   * directly to the graph root.
   */
  exitTo(index: number): boolean {
    if (!Number.isInteger(index) || index < -1 || index >= this.ids.length) return false;
    const nextLength = index + 1;
    if (this.ids.length === nextLength) return false;
    this.ids.length = nextLength;
    return true;
  }
}

export interface PaneStructureView {
  readonly structureId: string;
  readonly graph: GraphData;
  readonly proxyNodeIds: ReadonlySet<string>;
  readonly proxyEdgeIndexes: ReadonlySet<number>;
  readonly directStructureEdgeCount: number;
  /** Maps a pane-projected edge index back to its current runtime edge index. */
  getOriginalEdgeIndex(projectedIndex: number): number | null;
  /** Proxy/boundary/whole-entry edges are deliberately pane-only and read-only. */
  isReadOnlyEdge(projectedIndex: number): boolean;
  simManager: any;
}

const endpointId = (endpoint: any): string | undefined =>
  typeof endpoint === 'object' ? endpoint?.id : endpoint;

/**
 * Builds a mutable pane-only graph around the immutable projection metadata.
 * Member nodes remain the real runtime objects so edits persist; proxy nodes and
 * proxy edges are pane-owned clones and can never enter persistence or undo.
 */
export function createPaneStructureView(runtimeGraph: GraphData, structureId: string): Omit<PaneStructureView, 'simManager'> | null {
  const projection = getStructureInteriorProjection(runtimeGraph, structureId);
  if (!projection) return null;

  const memberIds = new Set(projection.metadata.memberIds);
  const memberNodes = projection.memberNodes as any[];
  const reservedNodeIds = new Set(runtimeGraph.nodes.map(node => node.id));
  const allocatePaneNodeId = (requestedId: string): string => {
    let id = requestedId;
    let suffix = 1;
    while (reservedNodeIds.has(id)) id = `${requestedId}__${suffix++}`;
    reservedNodeIds.add(id);
    return id;
  };
  const proxyIdByExternalId = new Map<string, string>();
  const proxyNodes = projection.externalProxyNodes.map(node => {
    const id = allocatePaneNodeId(node.id);
    proxyIdByExternalId.set(node._externalNodeId, id);
    return {
      ...node,
      id,
      label: `外部：${node.label}`,
      fixed: true,
      fx: node.x,
      fy: node.y,
      radiusMode: 'custom',
      radius: 8,
      note: `结构外部节点：${node.label}`,
      _structureInteriorReadOnly: true,
    };
  });
  const proxyEdges = projection.externalProxyEdges.map(edge => ({
    ...edge,
    source: edge._direction === 'outbound' ? edge.source : proxyIdByExternalId.get(edge._externalNodeId)!,
    target: edge._direction === 'outbound' ? proxyIdByExternalId.get(edge._externalNodeId)! : edge.target,
    _structureInteriorReadOnly: true,
  }));

  // A direct edge targets the structure as a whole rather than a member. Give
  // each relationship an explicit, stable read-only entry node in the interior.
  const directNodes: any[] = [];
  const directEdges: any[] = [];
  projection.metadata.directStructureEdges.forEach((item, index) => {
    const externalId = item.sourceId === structureId ? item.targetId : item.sourceId;
    const external = runtimeGraph.nodes.find(node => node.id === externalId);
    const angle = (Math.PI * 2 * index) / Math.max(1, projection.metadata.directStructureEdges.length);
    const id = allocatePaneNodeId(`__structure_entry__${encodeURIComponent(structureId)}__${item.originalIndex}`);
    const entry = {
      id,
      label: `整体关系：${external?.label || externalId || index + 1}`,
      x: Math.cos(angle) * 240,
      y: Math.sin(angle) * 240,
      fx: Math.cos(angle) * 240,
      fy: Math.sin(angle) * 240,
      fixed: true,
      radiusMode: 'custom',
      radius: 9,
      _structureInteriorProxy: true,
      _structureInteriorEntry: true,
      _structureInteriorReadOnly: true,
      _externalNodeId: externalId,
      note: '这是直接连接结构本体的只读整体关系入口。请退出内部视图后编辑。',
    };
    directNodes.push(entry);
    const anchor = memberNodes[index % Math.max(1, memberNodes.length)];
    if (anchor) {
      directEdges.push({
        ...item.edge,
        source: item.sourceId === structureId ? anchor.id : id,
        target: item.targetId === structureId ? anchor.id : id,
        _originalIndex: item.originalIndex,
        _structureInteriorProxy: true,
        _structureInteriorEntry: true,
        _structureInteriorReadOnly: true,
        originalEdge: item.edge,
      });
    }
  });

  // Place ordinary external proxies deterministically around the member bounds.
  const connectedMemberIdsByExternalId = new Map<string, string[]>();
  for (const edge of proxyEdges) {
    const source = endpointId(edge.source);
    const target = endpointId(edge.target);
    const memberId = source && memberIds.has(source) ? source : target && memberIds.has(target) ? target : null;
    if (!memberId) continue;
    const ids = connectedMemberIdsByExternalId.get(edge._externalNodeId) ?? [];
    ids.push(memberId);
    connectedMemberIdsByExternalId.set(edge._externalNodeId, ids);
  }
  const memberById = new Map(memberNodes.map(node => [node.id, node]));
  const memberCenter = memberNodes.reduce((acc, node) => ({
    x: acc.x + (Number.isFinite(node.x) ? node.x : 0),
    y: acc.y + (Number.isFinite(node.y) ? node.y : 0),
  }), { x: 0, y: 0 });
  if (memberNodes.length) {
    memberCenter.x /= memberNodes.length;
    memberCenter.y /= memberNodes.length;
  }
  proxyNodes.forEach((node, index) => {
    const anchor = (connectedMemberIdsByExternalId.get(node._externalNodeId) ?? [])
      .map(id => memberById.get(id))
      .find(Boolean);
    const angle = (Math.PI * 2 * index) / Math.max(1, proxyNodes.length);
    const ax = Number.isFinite(anchor?.x) ? anchor.x : memberCenter.x;
    const ay = Number.isFinite(anchor?.y) ? anchor.y : memberCenter.y;
    node.x = ax + Math.cos(angle) * 180;
    node.y = ay + Math.sin(angle) * 180;
    node.fx = node.x;
    node.fy = node.y;
  });

  const nodes = [...memberNodes, ...proxyNodes, ...directNodes];
  const edges = [...projection.internalEdges, ...proxyEdges, ...directEdges];
  const proxyNodeIds = new Set([...proxyNodes, ...directNodes].map(node => node.id));
  const proxyEdgeIndexes = new Set<number>();
  const originalEdgeIndexes = new Map<number, number>();
  edges.forEach((edge, projectedIndex) => {
    if (edge._structureInteriorReadOnly) {
      proxyEdgeIndexes.add(projectedIndex);
      return;
    }
    const originalIndex = Number.isInteger(edge._originalIndex)
      ? edge._originalIndex
      : runtimeGraph.edges.indexOf(edge);
    if (originalIndex >= 0 && runtimeGraph.edges[originalIndex] === edge) {
      originalEdgeIndexes.set(projectedIndex, originalIndex);
    }
  });
  const isReadOnlyEdge = (projectedIndex: number): boolean =>
    !Number.isInteger(projectedIndex) || !originalEdgeIndexes.has(projectedIndex);
  return {
    structureId,
    graph: { nodes, edges, groups: [] },
    proxyNodeIds,
    proxyEdgeIndexes,
    directStructureEdgeCount: projection.metadata.directStructureEdges.length,
    getOriginalEdgeIndex: projectedIndex => originalEdgeIndexes.get(projectedIndex) ?? null,
    isReadOnlyEdge,
  };
}

export const isPaneStructureProxyNode = (view: PaneStructureView | null | undefined, id: string | null | undefined): boolean =>
  !!id && !!view?.proxyNodeIds.has(id);

export const isPaneStructureProxyEdge = (view: PaneStructureView | null | undefined, index: number | null | undefined): boolean =>
  index !== null && index !== undefined && !!view?.isReadOnlyEdge(index);

export const getPaneOriginalEdgeIndex = (
  view: PaneStructureView | null | undefined,
  projectedIndex: number | null | undefined,
): number | null => {
  if (projectedIndex === null || projectedIndex === undefined || !Number.isInteger(projectedIndex)) return null;
  return view ? view.getOriginalEdgeIndex(projectedIndex) : projectedIndex;
};

export interface StructureBreadcrumbCallbacks {
  /** Called when the graph name is selected. */
  exit: () => void;
  /** Called with a zero-based structure-path index. */
  exitTo: (index: number) => void;
  /** Opens the global structure editor after leaving the interior. */
  editStructure?: () => void;
}

export interface StructureBreadcrumbDetails {
  purpose?: string;
  summary?: string;
  directStructureEdgeCount?: number;
}

export interface StructureBreadcrumb {
  readonly element: HTMLElement;
  /** Labels contain the graph name first, followed by structure names. */
  update(labels: readonly string[], details?: StructureBreadcrumbDetails): void;
  show(): void;
  hide(): void;
  dispose(): void;
}

const breadcrumbStyle = [
  'display:flex',
  'align-items:center',
  'gap:0.25rem',
  'min-width:0',
  'max-width:100%',
  'overflow-x:auto',
  'overflow-y:hidden',
  'padding:0.35rem 0.5rem',
  'font-size:0.875rem',
  'line-height:1.4',
  'white-space:nowrap',
  'touch-action:manipulation',
].join(';');

const buttonStyle = [
  'flex:0 0 auto',
  'border:0',
  'border-radius:0.35rem',
  'padding:0.3rem 0.45rem',
  'background:transparent',
  'color:inherit',
  'font:inherit',
  'cursor:pointer',
  'text-decoration:underline',
  'text-underline-offset:0.15em',
].join(';');

/**
 * Creates an independently-owned breadcrumb. It is hidden initially and has
 * no global styling or shared DOM state, so each pane can own one safely.
 */
export function createStructureBreadcrumb(
  root: HTMLElement,
  callbacks: StructureBreadcrumbCallbacks,
): StructureBreadcrumb {
  const element = document.createElement('nav');
  element.setAttribute('aria-label', '结构导航');
  element.style.cssText = breadcrumbStyle;
  element.hidden = true;
  root.append(element);

  let disposed = false;

  const update = (labels: readonly string[], details: StructureBreadcrumbDetails = {}) => {
    if (disposed) return;
    element.replaceChildren();
    const [graphLabel = '图名', ...structureLabels] = labels;

    const appendButton = (label: string, onClick: () => void) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.style.cssText = buttonStyle;
      button.addEventListener('click', onClick);
      element.append(button);
    };
    const appendSeparator = () => {
      const separator = document.createElement('span');
      separator.textContent = '/';
      separator.setAttribute('aria-hidden', 'true');
      element.append(separator);
    };

    appendButton(graphLabel, callbacks.exit);
    structureLabels.forEach((label, index) => {
      appendSeparator();
      appendButton(label, () => callbacks.exitTo(index));
    });
    const reflection = [details.purpose, details.summary].filter(value => value?.trim()).join(' · ');
    if (reflection) {
      const summary = document.createElement('span');
      summary.textContent = reflection.length > 100 ? `${reflection.slice(0, 100)}…` : reflection;
      summary.title = reflection;
      summary.style.cssText = 'overflow:hidden;text-overflow:ellipsis;opacity:.78;max-width:32rem;';
      element.append(summary);
    }
    if ((details.directStructureEdgeCount ?? 0) > 0) {
      const direct = document.createElement('span');
      direct.textContent = `整体关系 ${details.directStructureEdgeCount}`;
      direct.title = '内部画布中的“整体关系”节点为只读入口';
      direct.style.cssText = 'flex:0 0 auto;opacity:.68;';
      element.append(direct);
    }
    if (callbacks.editStructure) appendButton('编辑结构说明', callbacks.editStructure);
  };

  return {
    element,
    update,
    show: () => { if (!disposed) element.hidden = false; },
    hide: () => { if (!disposed) element.hidden = true; },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      element.remove();
    },
  };
}
