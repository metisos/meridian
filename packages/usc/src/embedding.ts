/**
 * Embedding module — pluggable backend.
 *
 * Default: local `@xenova/transformers` running nomic-embed-text-v1.5 in ONNX
 * (768-dim, Apache 2.0, MTEB retrieval ~62.4). Requires asymmetric prompts:
 *   - documents going INTO the store: "search_document: <text>"
 *   - queries: "search_query: <text>"
 * The module hides the prefix; callers use embedDocument() / embedQuery().
 *
 * Fallback: Gemini API (`gemini-embedding-001`) with outputDimensionality=768.
 * Switch backends with EMBED_BACKEND=local|gemini in .env.local.
 */

import { EMBEDDING_DIM } from "./primitive.js";

export type EmbeddingKind = "document" | "query";

export interface EmbeddingBackend {
  /** Embed a single text. Returns 768-dim L2-normalized vector. */
  embed(text: string, kind: EmbeddingKind): Promise<number[]>;
  /** Embed many texts in one call. Strongly preferred for ingest. */
  embedBatch(texts: string[], kind: EmbeddingKind): Promise<number[][]>;
  /** Free model weights / close clients. */
  close?(): Promise<void>;
}

/** L2-normalize a vector in place and return it. Idempotent for unit vectors. */
export function l2Normalize(v: number[]): number[] {
  let sumSq = 0;
  for (const x of v) sumSq += x * x;
  const norm = Math.sqrt(sumSq);
  if (norm === 0) return v;
  for (let i = 0; i < v.length; i++) v[i] = v[i]! / norm;
  return v;
}

/** Prepend the Nomic/Arctic-style task prefix. */
export function applyPrefix(text: string, kind: EmbeddingKind): string {
  return kind === "query" ? `search_query: ${text}` : `search_document: ${text}`;
}

/**
 * Local backend using @xenova/transformers + nomic-embed-text-v1.5.
 * Model weights are downloaded on first use to ~/.cache/huggingface/.
 */
export class LocalNomicBackend implements EmbeddingBackend {
  private modelPromise: Promise<unknown> | null = null;

  private async load(): Promise<unknown> {
    if (this.modelPromise) return this.modelPromise;
    this.modelPromise = (async () => {
      // Dynamic import so the package loads quickly when only types are needed
      const transformers = await import("@xenova/transformers");
      // Allow remote model downloads
      transformers.env.allowRemoteModels = true;
      const pipeline = transformers.pipeline;
      // featureExtraction returns a Tensor with our pooled embedding
      return pipeline("feature-extraction", "nomic-ai/nomic-embed-text-v1.5", {
        quantized: true,
      });
    })();
    return this.modelPromise;
  }

  async embed(text: string, kind: EmbeddingKind): Promise<number[]> {
    const [vec] = await this.embedBatch([text], kind);
    return vec!;
  }

  async embedBatch(texts: string[], kind: EmbeddingKind): Promise<number[][]> {
    if (texts.length === 0) return [];
    const model = (await this.load()) as (
      input: string[],
      opts: { pooling: "mean"; normalize: boolean },
    ) => Promise<{ data: Float32Array; dims: number[] }>;

    const prefixed = texts.map((t) => applyPrefix(t, kind));
    const out = await model(prefixed, { pooling: "mean", normalize: true });

    // out.dims = [batch, dim]. Slice the flat Float32Array into rows.
    const dim = out.dims[1] ?? EMBEDDING_DIM;
    if (dim !== EMBEDDING_DIM) {
      throw new Error(
        `nomic-embed-text-v1.5 returned dim=${dim}, expected ${EMBEDDING_DIM}`,
      );
    }
    const rows: number[][] = [];
    for (let i = 0; i < texts.length; i++) {
      const start = i * dim;
      rows.push(Array.from(out.data.slice(start, start + dim)));
    }
    return rows;
  }
}

/** Gemini API fallback. Calls gemini-embedding-001 with outputDimensionality=768. */
export class GeminiBackend implements EmbeddingBackend {
  constructor(private opts: { apiKey: string; model?: string }) {}

  async embed(text: string, kind: EmbeddingKind): Promise<number[]> {
    const [vec] = await this.embedBatch([text], kind);
    return vec!;
  }

  async embedBatch(texts: string[], kind: EmbeddingKind): Promise<number[][]> {
    const model = this.opts.model ?? "gemini-embedding-001";
    const rows: number[][] = [];
    for (const t of texts) {
      const taskType = kind === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT";
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-goog-api-key": this.opts.apiKey,
          },
          body: JSON.stringify({
            content: { parts: [{ text: t }] },
            outputDimensionality: EMBEDDING_DIM,
            taskType,
          }),
        },
      );
      if (!res.ok) throw new Error(`Gemini embed ${res.status}: ${await res.text()}`);
      const j = (await res.json()) as { embedding: { values: number[] } };
      // Truncated Matryoshka vectors are not unit-norm; renormalize for cosine search
      rows.push(l2Normalize(j.embedding.values));
    }
    return rows;
  }
}

/** Factory that respects EMBED_BACKEND env var. */
export function createEmbeddingBackend(env: NodeJS.ProcessEnv = process.env): EmbeddingBackend {
  const backend = (env.EMBED_BACKEND ?? "local").toLowerCase();
  if (backend === "local") return new LocalNomicBackend();
  if (backend === "gemini") {
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("EMBED_BACKEND=gemini requires GEMINI_API_KEY");
    return new GeminiBackend({ apiKey });
  }
  throw new Error(`Unknown EMBED_BACKEND: ${env.EMBED_BACKEND}`);
}
