import type { GraphData } from './data/storage';
import { createNodeIds } from './node-order';
import { saveBrowserAttachment } from './media-assets';

export type ImportedMediaType = 'image' | 'audio' | 'video' | 'pdf' | 'md';
export const MEDIA_FILE_ACCEPT = 'image/*,audio/*,video/*,application/pdf,.md,.markdown,.txt,.csv,.json,.yaml,.yml,.log';

export function mediaTypeForFile(name: string, mime = ''): ImportedMediaType | null {
  if (/\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(name) || mime.startsWith('image/')) return 'image';
  if (/\.(mp3|wav|ogg|flac|aac|m4a|opus)$/i.test(name) || mime.startsWith('audio/')) return 'audio';
  if (/\.(mp4|webm|mov|avi|mkv)$/i.test(name) || mime.startsWith('video/')) return 'video';
  if (/\.pdf$/i.test(name) || mime === 'application/pdf') return 'pdf';
  if (/\.(md|markdown|txt|csv|json|ya?ml|log)$/i.test(name) || mime.startsWith('text/')) return 'md';
  return null;
}

export interface MediaImportSource {
  name: string;
  type: ImportedMediaType;
  value: string;
  /** Prepared attachments belong to the graph only after a successful commit. */
  release?: () => void;
}

export function releaseMediaSources(sources: readonly MediaImportSource[]): void {
  for (const source of sources) source.release?.();
}

/** Text attachments store their contents, rather than rendering a blob URL as Markdown. */
export async function readBrowserMediaSources(
  files: readonly File[],
  prepareBinary: (file: File) => Promise<{ value: string; release?: () => void }> = saveBrowserAttachment,
): Promise<{ sources: MediaImportSource[]; unsupported: string[] }> {
  const sources: MediaImportSource[] = [], unsupported: string[] = [];
  try {
    for (const file of files) {
      const type = mediaTypeForFile(file.name, file.type);
      if (!type) { unsupported.push(file.name); continue; }
      if (type === 'md') sources.push({ name: file.name, type, value: await file.text() });
      else {
        const prepared = await prepareBinary(file);
        sources.push({ name: file.name, type, ...prepared });
      }
    }
    return { sources, unsupported };
  } catch (error) {
    releaseMediaSources(sources);
    throw error;
  }
}

export interface MediaImportContext<Owner> {
  getGraph: (owner: Owner) => GraphData;
  canMutate: (owner: Owner) => boolean;
  /** A structure's identity is part of the destination, independent of focus. */
  getContextKey: (owner: Owner) => string | null;
  getOrigin: (owner: Owner) => { x: number; y: number };
  /** Commits the complete batch with one history entry. False leaves the graph untouched. */
  commit: (owner: Owner, graph: GraphData, nodes: any[], contextKey: string | null) => boolean;
}

/** A pending file picker keeps its original destination; it cannot follow later focus changes. */
export function createMediaImportSession<Owner>(
  owner: Owner,
  context: MediaImportContext<Owner>,
  placement?: { x: number; y: number },
) {
  const graph = context.getGraph(owner), key = context.getContextKey(owner);
  const point = placement ?? context.getOrigin(owner), origin = { x: point.x, y: point.y };
  const adopted = new Set<MediaImportSource>();
  let completed = false;
  const valid = () => !completed && graph.settings?.sourceMode !== 'vault-readonly'
    && context.canMutate(owner) && context.getGraph(owner) === graph
    && context.getContextKey(owner) === key;
  return {
    valid,
    add(sources: readonly MediaImportSource[]): any[] {
      if (!valid() || sources.length === 0 || !Number.isFinite(origin.x) || !Number.isFinite(origin.y)) {
        releaseMediaSources(sources.filter(source => !adopted.has(source))); return [];
      }
      const ids = createNodeIds(graph.nodes, sources.length);
      const nodes = sources.map((source, index) => {
        const node = {
          id: ids[index], label: source.name, headingLevel: 4, tags: [],
          x: origin.x + index % 3 * 48, y: origin.y + Math.floor(index / 3) * 48,
          mediaType: source.type, mediaUrl: source.value, _isNew: true,
        };
        return node;
      });
      try {
        if (context.commit(owner, graph, nodes, key)) {
          completed = true;
          for (const source of sources) adopted.add(source);
          return nodes;
        }
      } catch (error) {
        // A rendering/save callback may fail after adoption; retain any referenced files.
        releaseMediaSources(sources.filter((_source, index) => !graph.nodes.includes(nodes[index])));
        throw error;
      }
      releaseMediaSources(sources);
      return [];
    },
  };
}
