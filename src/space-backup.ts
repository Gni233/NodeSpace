import type { GraphData } from './data/storage';
import { serializeGraphSnapshot } from './graph-snapshot';
import { isStoredAttachment, MissingBrowserAttachmentError, readBrowserAttachment, saveBrowserAttachment } from './media-assets';

const FORMAT = 'nodespace-space-backup';
const VERSION = 1;
const MIB = 1024 ** 2;
const MAX_GRAPH_BYTES = 8 * MIB;
const MAX_ATTACHMENT_BYTES = 25 * MIB;
const MAX_TOTAL_ATTACHMENT_BYTES = 48 * MIB;
const MAX_ATTACHMENTS = 1024;
const BASE64_CHUNK = 24 * 1024;
export const SPACE_BACKUP_MAX_FILE_BYTES = 73 * MIB;
export const SPACE_BACKUP_EXTENSION = '.nodespace-backup.json';

const binaryMediaTypes = ['image', 'audio', 'video', 'pdf'] as const;
type BinaryMediaType = typeof binaryMediaTypes[number];
type JsonRecord = Record<string, unknown>;
type Attachment = { reference: string; mime: string; data: string | null };
type PreparedAttachment = { value: string; release: () => void | Promise<void> };

export interface SpaceBackupSummary {
  bundledAttachments: number;
  missingAttachments: number;
  externalMedia: number;
  vaultReferences: number;
  spaceReferences: number;
}

export interface SpaceBackupInfo {
  name: string;
  summary: SpaceBackupSummary;
}

interface SpaceBackupPackage {
  format: typeof FORMAT;
  version: typeof VERSION;
  name: string;
  graphId?: string;
  graph: GraphData;
  attachments: Attachment[];
}

const isRecord = (value: unknown): value is JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const stringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string');

const isReservedName = (value: string): boolean =>
  value === 'prototype' || Object.prototype.hasOwnProperty.call(Object.prototype, value);

const safeId = (value: unknown): value is string | number =>
  (typeof value === 'string' && value.trim().length > 0 && !isReservedName(value))
  || (typeof value === 'number' && Number.isSafeInteger(value));

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function utf8Size(text: string): number {
  let size = text.length;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) continue;
    if (code < 0x800) { size++; continue; }
    size += 2;
    const next = text.charCodeAt(i + 1);
    if (code >= 0xd800 && code <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) i++;
  }
  return size;
}

function validateJsonTree(value: unknown, depth = 0): void {
  if (depth > 40) throw new Error('空间数据的嵌套层级过深');
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('空间数据包含无效数字');
  if (Array.isArray(value)) {
    for (const item of value) validateJsonTree(item, depth + 1);
  } else if (isRecord(value)) {
    for (const [key, field] of Object.entries(value)) {
      if (isReservedName(key)) throw new Error('空间数据包含无效字段名');
      validateJsonTree(field, depth + 1);
    }
  }
}

function validateFields(record: JsonRecord, keys: string[], valid: (value: unknown) => boolean): void {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && !valid(value)) throw new Error(`空间数据字段无效（${key}）`);
  }
}

function validateGraph(graph: unknown, json?: string): asserts graph is GraphData {
  if (!isRecord(graph) || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || !Array.isArray(graph.groups)
    || (graph.settings !== undefined && !isRecord(graph.settings))) throw new Error('空间数据格式无效');
  validateJsonTree(graph);
  if (utf8Size(json ?? JSON.stringify(graph)) > MAX_GRAPH_BYTES) throw new Error('空间数据超过 8 MiB');
  const settings = graph.settings;
  if (settings) {
    if (settings.sourceMode !== undefined) throw new Error('只能备份可编辑的图空间');
    validateFields(settings, ['graphTheme', 'fontFamily', 'layoutMode', 'gridMode', 'semanticCardDensity'], value => typeof value === 'string');
    if (typeof settings.graphTheme === 'string' && isReservedName(settings.graphTheme)) throw new Error('空间主题无效');
    validateFields(settings, ['linkDist', 'labelSize', 'charge', 'linkStr', 'collideR', 'centerS', 'groupBound', 'heatingTime', 'alphaTarget', 'editPanelOpacity',
      'nodeExpand', 'lineExpand', 'glMin', 'glMax', 'gridSp', 'ar', 'gridWidth'], isFiniteNumber);
    validateFields(settings, ['useRAFL', 'showGLabels', 'gridVis', 'axisVis', 'axisTicks', 'focusMode', 'centerMode', 'selectedTooltip', 'starRotateMode',
      'glowAppearance', 'categoryLayout', 'gridSnap', 'partialGridSnap', 'edgeColorGradient', 'edgeWidthByLevel', 'fixedHollow'], value => typeof value === 'boolean');
    validateFields(settings, ['cardOrders', 'groupCardOrders', 'cardViews', 'groupCardViews', 'semanticCardForms', 'semanticLayoutMemory', 'spaceFragments'], isRecord);
    validateFields(settings, ['expandedMedia'], stringArray);
    if (isRecord(settings.spaceFragments)) {
      for (const fragment of Object.values(settings.spaceFragments)) {
        if (!isRecord(fragment) || typeof fragment.id !== 'string' || typeof fragment.label !== 'string'
          || !stringArray(fragment.nodeIds)) throw new Error('空间片段数据无效');
      }
    }
  }
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (!isRecord(node) || !safeId(node.id) || ids.has(String(node.id))) throw new Error('节点身份无效或重复');
    ids.add(String(node.id));
    validateFields(node, ['label', 'note', 'mediaUrl', 'hyperlink', 'color', 'structureParentId'], value => typeof value === 'string');
    validateFields(node, ['x', 'y', 'fx', 'fy', 'headingLevel', 'radius'], isFiniteNumber);
    validateFields(node, ['tags'], stringArray);
    validateFields(node, ['mediaType'], value => value === 'md' || binaryMediaTypes.some(type => type === value));
    validateFields(node, ['sourceRef', 'resourceRef', 'spaceRef', 'structure', 'backupReferences'], isRecord);
    if (isRecord(node.structure) && !stringArray(node.structure.memberIds)) throw new Error('结构成员数据无效');
  }
  for (const edge of graph.edges) {
    if (!isRecord(edge) || !safeId(edge.source) || !safeId(edge.target)
      || !ids.has(String(edge.source)) || !ids.has(String(edge.target))) throw new Error('连线端点无效');
    validateFields(edge, ['label', 'color'], value => typeof value === 'string');
  }
  for (const group of graph.groups) {
    if (!isRecord(group)) throw new Error('集合数据无效');
    validateFields(group, ['label', 'color'], value => typeof value === 'string');
  }
}

function validName(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 255 && value.trim().length > 0 && !/[\x00-\x1f\x7f]/.test(value);
}

function validGraphId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 1024 && !/[\\:\x00-\x1f\x7f]/.test(value)
    && value.split('/').every(part => part !== '' && part !== '.' && part !== '..');
}

function isBinaryMedia(type: unknown): type is BinaryMediaType {
  return binaryMediaTypes.some(candidate => candidate === type);
}

function attachmentUses(graph: GraphData): Map<string, Set<BinaryMediaType>> {
  const uses = new Map<string, Set<BinaryMediaType>>();
  for (const { mediaUrl, mediaType } of graph.nodes) {
    if (!isBinaryMedia(mediaType) || typeof mediaUrl !== 'string' || !isStoredAttachment(mediaUrl)) continue;
    if (!/^nodespace-attachment:[\w-]{1,128}$/.test(mediaUrl)) throw new Error('附件标识无效');
    const types = uses.get(mediaUrl) ?? new Set<BinaryMediaType>();
    types.add(mediaType);
    uses.set(mediaUrl, types);
  }
  if (uses.size > MAX_ATTACHMENTS) throw new Error('附件数量超过 1024');
  return uses;
}

function base64Size(data: string): number {
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  const size = (data.length / 4) * 3 - padding;
  if (size > MAX_ATTACHMENT_BYTES) throw new Error('单个附件超过 25 MiB');
  if (data.length % 4 !== 0 || /[^A-Za-z0-9+/]/.test(padding ? data.slice(0, -padding) : data)) {
    throw new Error('附件编码无效');
  }
  return size;
}

function expectedMime(mime: string, types: Set<BinaryMediaType>): string {
  // A PDF opens in an iframe. Its blob must never carry an active document MIME type.
  if (types.has('pdf')) {
    if (types.size !== 1) throw new Error('PDF 附件被多个媒体类型使用');
    return 'application/pdf';
  }
  if (/^(?:image|audio|video)\/[a-z0-9][a-z0-9+.-]{0,99}$/.test(mime)
    && [...types].every(type => mime.startsWith(`${type}/`))) return mime;
  return 'application/octet-stream';
}

function validateAttachments(attachments: unknown, uses: Map<string, Set<BinaryMediaType>>): asserts attachments is Attachment[] {
  if (!Array.isArray(attachments) || attachments.length !== uses.size) throw new Error('附件清单与空间数据不一致');
  const seen = new Set<string>();
  let total = 0;
  for (const item of attachments) {
    if (!isRecord(item) || typeof item.reference !== 'string' || seen.has(item.reference)) throw new Error('附件条目无效或重复');
    const types = uses.get(item.reference);
    if (!types) throw new Error('备份包含未引用的附件');
    seen.add(item.reference);
    if (item.data === null && item.mime === '') continue;
    if (typeof item.data !== 'string' || typeof item.mime !== 'string' || item.mime !== expectedMime(item.mime, types)) {
      throw new Error('附件类型或数据无效');
    }
    total += base64Size(item.data);
    if (total > MAX_TOTAL_ATTACHMENT_BYTES) throw new Error('附件总大小超过 48 MiB');
    if (item.mime === 'application/pdf' && !atob(item.data.slice(0, 8)).startsWith('%PDF-')) {
      throw new Error('PDF 附件的文件头无效');
    }
  }
}

function parsePackage(text: string): SpaceBackupPackage {
  if (text.length > SPACE_BACKUP_MAX_FILE_BYTES || utf8Size(text) > SPACE_BACKUP_MAX_FILE_BYTES) {
    throw new Error('备份文件超过 73 MiB');
  }
  let data: unknown;
  try { data = JSON.parse(text); }
  catch { throw new Error('备份文件的 JSON 格式无效'); }
  if (!isRecord(data) || data.format !== FORMAT) throw new Error('文件不是 NodeSpace 空间备份');
  if (data.version !== VERSION) throw new Error('当前版本无法读取这个空间备份');
  if (!validName(data.name) || (data.graphId !== undefined && !validGraphId(data.graphId))) throw new Error('备份中的空间标识无效');
  validateGraph(data.graph);
  validateAttachments(data.attachments, attachmentUses(data.graph));
  return { format: FORMAT, version: VERSION, name: data.name, graphId: data.graphId, graph: data.graph, attachments: data.attachments };
}

function isSelfReference(reference: unknown, graphId?: string): reference is JsonRecord {
  return Boolean(graphId && isRecord(reference) && reference.provider === 'nodespace' && reference.version === 1
    && reference.graph === graphId && (
      reference.kind === 'space'
      || (reference.kind === 'node' && typeof reference.nodeId === 'string' && reference.nodeId.length > 0)
      || (reference.kind === 'fragment' && typeof reference.fragmentId === 'string' && reference.fragmentId.length > 0)
    ));
}

function summarize({ attachments, graph, graphId }: SpaceBackupPackage, keepSelfReferences: boolean): SpaceBackupSummary {
  const summary = { bundledAttachments: 0, missingAttachments: 0, externalMedia: 0, vaultReferences: 0, spaceReferences: 0 };
  const missing = new Set(attachments.filter(item => item.data === null).map(item => item.reference));
  for (const node of graph.nodes) {
    const references = node.backupReferences;
    if (references?.missingAttachment) missing.add(references.missingAttachment.reference);
    if (references?.media || (isBinaryMedia(node.mediaType) && node.mediaUrl && !isStoredAttachment(node.mediaUrl))) summary.externalMedia++;
    if (references?.vault || node.resourceRef || node.sourceRef) summary.vaultReferences++;
    if (references?.space || (node.spaceRef && !(keepSelfReferences && isSelfReference(node.spaceRef, graphId)))) summary.spaceReferences++;
  }
  summary.missingAttachments = missing.size;
  summary.bundledAttachments = attachments.filter(item => item.data !== null).length;
  return summary;
}

async function encodeAttachment(blob: Blob): Promise<string> {
  const parts: string[] = [];
  const bytes = new Uint8Array(await blob.arrayBuffer());
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK) {
    parts.push(btoa(String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK))));
  }
  return parts.join('');
}

function decodeAttachment(data: string, mime: string): Blob {
  const parts: Uint8Array<ArrayBuffer>[] = [];
  for (let offset = 0; offset < data.length; offset += BASE64_CHUNK) {
    const decoded = atob(data.slice(offset, offset + BASE64_CHUNK));
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
    parts.push(bytes);
  }
  return new Blob(parts, { type: mime });
}

export async function createSpaceBackup(
  input: { name: string; graph: GraphData; graphId?: string },
  { readAttachment = readBrowserAttachment }: { readAttachment?: (reference: string) => Promise<Blob | null> } = {},
): Promise<{ text: string; summary: SpaceBackupSummary }> {
  const { name, graphId } = input;
  if (!validName(name) || (graphId !== undefined && !validGraphId(graphId))) throw new Error('空间标识无效');
  const snapshot = serializeGraphSnapshot(input.graph);
  const graph: unknown = JSON.parse(snapshot);
  validateGraph(graph, snapshot);
  const uses = attachmentUses(graph);
  const attachments: Attachment[] = [];
  let total = 0;
  for (const [reference, types] of uses) {
    const blob = await readAttachment(reference).catch(error => {
      if (error instanceof MissingBrowserAttachmentError) return null;
      throw error;
    });
    if (!blob) {
      attachments.push({ reference, mime: '', data: null });
      continue;
    }
    if (blob.size > MAX_ATTACHMENT_BYTES) throw new Error('单个附件超过 25 MiB');
    total += blob.size;
    if (total > MAX_TOTAL_ATTACHMENT_BYTES) throw new Error('附件总大小超过 48 MiB');
    const mime = expectedMime(blob.type, types);
    if (mime === 'application/pdf' && !(await blob.slice(0, 5).text()).startsWith('%PDF-')) {
      throw new Error('PDF 附件的文件头无效');
    }
    attachments.push({ reference, mime, data: await encodeAttachment(blob) });
  }
  const data = { format: FORMAT, version: VERSION, name, graphId, graph, attachments } as const;
  const text = JSON.stringify(data);
  if (utf8Size(text) > SPACE_BACKUP_MAX_FILE_BYTES) throw new Error('备份文件超过 73 MiB');
  return { text, summary: summarize(data, true) };
}

export function inspectSpaceBackup(text: string): SpaceBackupInfo {
  const data = parsePackage(text);
  return { name: data.name, summary: summarize(data, true) };
}

function isSafeHyperlink(url: string): boolean {
  try { return ['http:', 'https:', 'mailto:'].includes(new URL(url).protocol); }
  catch { return false; }
}

function applyRestoredReferences(graph: GraphData, remapped: Map<string, string>, graphId?: string, restoredGraphId?: string): void {
  if (graph.settings) delete graph.settings.expandedMedia;
  for (const record of [...graph.nodes, ...graph.edges, ...graph.groups]) {
    for (const key of Object.keys(record)) if (key.startsWith('_')) delete record[key];
  }
  for (const node of graph.nodes) {
    const references = { ...node.backupReferences };
    if (isBinaryMedia(node.mediaType) && node.mediaUrl) {
      const source = { reference: node.mediaUrl, type: node.mediaType };
      if (remapped.has(node.mediaUrl)) node.mediaUrl = remapped.get(node.mediaUrl);
      else {
        if (isStoredAttachment(node.mediaUrl)) references.missingAttachment = source;
        else references.media = source;
        delete node.mediaType;
        delete node.mediaUrl;
      }
    }
    if (node.resourceRef || node.sourceRef) {
      references.vault = { resourceRef: node.resourceRef, sourceRef: node.sourceRef };
      delete node.resourceRef;
      delete node.sourceRef;
    }
    if (node.spaceRef) {
      if (restoredGraphId && isSelfReference(node.spaceRef, graphId)) node.spaceRef.graph = restoredGraphId;
      else {
        references.space = node.spaceRef;
        delete node.spaceRef;
      }
    }
    if (node.hyperlink && !isSafeHyperlink(node.hyperlink)) {
      references.hyperlink = node.hyperlink;
      delete node.hyperlink;
    }
    if (Object.keys(references).length) node.backupReferences = references;
  }
}

/** saveGraph must write a fresh graph and reject if its write could not be committed. */
export async function restoreSpaceBackup(text: string, {
  saveGraph, restoredGraphId, saveAttachment = saveBrowserAttachment,
}: {
  saveGraph: (graph: GraphData) => Promise<void>;
  restoredGraphId?: string;
  saveAttachment?: (blob: Blob) => Promise<PreparedAttachment>;
}): Promise<SpaceBackupInfo> {
  const data = parsePackage(text);
  if (restoredGraphId !== undefined && !validGraphId(restoredGraphId)) throw new Error('目标空间标识无效');
  const summary = summarize(data, Boolean(restoredGraphId));
  const prepared: PreparedAttachment[] = [];
  const remapped = new Map<string, string>();
  const usedIds = new Set(data.attachments.map(item => item.reference));
  try {
    for (const item of data.attachments) {
      if (item.data === null) continue;
      const attachment = await saveAttachment(decodeAttachment(item.data, item.mime));
      prepared.push(attachment);
      if (!isStoredAttachment(attachment.value) || usedIds.has(attachment.value)) throw new Error('无法为附件分配新标识');
      usedIds.add(attachment.value);
      remapped.set(item.reference, attachment.value);
    }
    applyRestoredReferences(data.graph, remapped, data.graphId, restoredGraphId);
    await saveGraph(data.graph);
  } catch (error) {
    const cleanup = await Promise.allSettled(prepared.map(async attachment => attachment.release()));
    if (cleanup.some(result => result.status === 'rejected')) throw new Error('恢复失败，且部分新附件无法清理');
    throw error;
  }
  return { name: data.name, summary };
}
