import type { GraphData } from './data/storage';
import { isSensitiveSemanticText, semanticNodeBody } from './layouts/semantic';

export type LocalSemanticStatus = 'idle' | 'probing' | 'ready' | 'unavailable';

export interface LocalSemanticState {
  status: LocalSemanticStatus;
  model: string | null;
  vectorCount: number;
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:1234/v1';
const MODEL_HINT = /qwen3[-_ ]embedding/i;
const MAX_EMBEDDED_NODES = 600;
const BATCH_SIZE = 48;
const MAX_TEXT_LENGTH = 1200;

function normalizedNodeText(node: any): string {
  return [node.label, semanticNodeBody(node), ...(node.tags || [])]
    .map(value => String(value ?? '').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, MAX_TEXT_LENGTH);
}

function cacheKey(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${text.length}:${(hash >>> 0).toString(36)}`;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Opportunistic localhost-only embedding provider for LM Studio. The compositor
 * renders immediately with deterministic lexical features, then may refine once
 * vectors arrive. Failure is silent and never blocks editing.
 */
export class LocalSemanticEmbeddingProvider {
  private state: LocalSemanticState = { status: 'idle', model: null, vectorCount: 0 };
  private readonly vectorCache = new Map<string, readonly number[]>();
  private probePromise: Promise<string | null> | null = null;
  private retryAfter = 0;
  private listeners = new Set<(state: LocalSemanticState) => void>();

  constructor(private readonly baseUrl = DEFAULT_BASE_URL) {}

  getState(): LocalSemanticState {
    return { ...this.state };
  }

  subscribe(listener: (state: LocalSemanticState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private update(patch: Partial<LocalSemanticState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.getState());
  }

  private async findModel(): Promise<string | null> {
    if (this.state.model) return this.state.model;
    if (Date.now() < this.retryAfter) return null;
    if (this.probePromise) return this.probePromise;
    this.update({ status: 'probing' });
    this.probePromise = (async () => {
      try {
        const response = await fetchWithTimeout(`${this.baseUrl}/models`, { method: 'GET' }, 1800);
        if (!response.ok) throw new Error(`models ${response.status}`);
        const payload = await response.json();
        const ids = Array.isArray(payload?.data)
          ? payload.data.map((item: any) => String(item?.id || '')).filter(Boolean)
          : [];
        const model = ids.find((id: string) => MODEL_HINT.test(id)) || null;
        if (!model) throw new Error('Qwen3 Embedding model not loaded');
        this.update({ status: 'ready', model });
        return model;
      } catch {
        this.retryAfter = Date.now() + 30_000;
        this.update({ status: 'unavailable', model: null });
        return null;
      } finally {
        this.probePromise = null;
      }
    })();
    return this.probePromise;
  }

  async vectorsForGraph(graph: GraphData): Promise<ReadonlyMap<string, readonly number[]>> {
    const nodes = (graph.nodes || []).slice(0, MAX_EMBEDDED_NODES);
    if (nodes.length < 2) return new Map();
    const model = await this.findModel();
    if (!model) return new Map();

    const vectors = new Map<string, readonly number[]>();
    const missing: { id: string; text: string; key: string }[] = [];
    for (const node of nodes) {
      const text = normalizedNodeText(node);
      if (!text || isSensitiveSemanticText(text)) continue;
      const key = cacheKey(text);
      const cached = this.vectorCache.get(key);
      if (cached) vectors.set(String(node.id), cached);
      else missing.push({ id: String(node.id), text, key });
    }

    try {
      for (let start = 0; start < missing.length; start += BATCH_SIZE) {
        const batch = missing.slice(start, start + BATCH_SIZE);
        const response = await fetchWithTimeout(`${this.baseUrl}/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, input: batch.map(item => item.text) }),
        }, 60_000);
        if (!response.ok) throw new Error(`embeddings ${response.status}`);
        const payload = await response.json();
        const data = Array.isArray(payload?.data) ? payload.data : [];
        for (const item of data) {
          const request = batch[Number(item?.index)];
          if (!request || !Array.isArray(item?.embedding) || item.embedding.length === 0) continue;
          const vector = item.embedding.map((value: unknown) => Number(value) || 0);
          this.vectorCache.set(request.key, vector);
          vectors.set(request.id, vector);
        }
      }
      this.update({ status: 'ready', model, vectorCount: vectors.size });
    } catch {
      // Keep cached vectors useful, but back off before touching LM Studio again.
      this.retryAfter = Date.now() + 30_000;
      this.update({ status: 'unavailable', vectorCount: vectors.size });
    }
    return vectors;
  }
}
