import "server-only";
import { getDb } from "./mongo";

export interface HybridHit {
  investigation_uri: string;
  short_id: string;
  hypothesis: string;
  /** Atlas Vector Search cosine similarity (0-1). null if not in top-K vector results. */
  cosine: number | null;
  /** MongoDB $text BM25 score. null if not in text results. */
  bm25: number | null;
  /** Normalized BM25 (divided by max in this result set), 0-1. */
  bm25_norm: number;
  /** Reciprocal Rank Fusion combined score, 0-1. */
  hybrid: number;
}

interface AgentMemoryDoc {
  _id: unknown;
  investigation_uri: string;
  embedding?: number[];
  root_cause_hypothesis?: string;
}

interface TextHit extends AgentMemoryDoc {
  bm25_score: number;
}

interface VectorHit extends AgentMemoryDoc {
  cosine_score: number;
}

const RRF_K = 60;

/* Extracts a handful of high-signal terms from the hypothesis so the $text
   query doesn't get diluted by stop words and proper-noun ids. */
function extractQueryTerms(hypothesis: string): string {
  const tokens = hypothesis
    .replace(/ctx:\/\/[^\s)]+/g, " ")
    .replace(/inv_[a-z0-9_]+/gi, " ")
    .replace(/evt_[a-z0-9_]+/gi, " ")
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((t) => t.length >= 4)
    .slice(0, 20);
  return [...new Set(tokens)].join(" ");
}

export async function fetchHybridRecall(invUri: string, limit = 5): Promise<HybridHit[]> {
  const db = await getDb();
  const col = db.collection<AgentMemoryDoc>("agent_memory");

  const subject = await col.findOne({ investigation_uri: invUri });
  if (!subject) return [];

  const queryText = extractQueryTerms(subject.root_cause_hypothesis ?? "");

  // BM25 lane: regular MongoDB $text search
  let textHits: TextHit[] = [];
  try {
    const cursor = col.aggregate<TextHit>([
      { $match: { $text: { $search: queryText } } },
      {
        $project: {
          investigation_uri: 1,
          root_cause_hypothesis: 1,
          bm25_score: { $meta: "textScore" },
        },
      },
      { $sort: { bm25_score: -1 } },
      { $limit: 12 },
    ]);
    textHits = await cursor.toArray();
  } catch (e) {
    // Text index missing or query empty — leave textHits as []
    console.warn("[hybridRecall] $text search failed:", (e as Error).message);
  }

  // Cosine lane: Atlas Vector Search
  let vectorHits: VectorHit[] = [];
  if (Array.isArray(subject.embedding) && subject.embedding.length > 0) {
    try {
      const cursor = col.aggregate<VectorHit>([
        {
          $vectorSearch: {
            index: "memory_vector_index",
            path: "embedding",
            queryVector: subject.embedding,
            numCandidates: 50,
            limit: 12,
          },
        },
        {
          $project: {
            investigation_uri: 1,
            root_cause_hypothesis: 1,
            cosine_score: { $meta: "vectorSearchScore" },
          },
        },
      ]);
      vectorHits = await cursor.toArray();
    } catch (e) {
      console.warn("[hybridRecall] $vectorSearch failed:", (e as Error).message);
    }
  }

  // Build per-URI lookups (excluding the subject itself)
  const textByUri = new Map<string, TextHit>();
  const vectorByUri = new Map<string, VectorHit>();
  for (const t of textHits) {
    if (t.investigation_uri !== invUri) textByUri.set(t.investigation_uri, t);
  }
  for (const v of vectorHits) {
    if (v.investigation_uri !== invUri) vectorByUri.set(v.investigation_uri, v);
  }

  const textRank = new Map<string, number>();
  const vectorRank = new Map<string, number>();
  textHits
    .filter((t) => t.investigation_uri !== invUri)
    .forEach((t, i) => textRank.set(t.investigation_uri, i + 1));
  vectorHits
    .filter((v) => v.investigation_uri !== invUri)
    .forEach((v, i) => vectorRank.set(v.investigation_uri, i + 1));

  const maxBm25 = Math.max(...Array.from(textByUri.values()).map((t) => t.bm25_score), 1);

  const allUris = new Set([...textByUri.keys(), ...vectorByUri.keys()]);
  const hits: HybridHit[] = [];

  for (const uri of allUris) {
    const t = textByUri.get(uri);
    const v = vectorByUri.get(uri);
    const tr = textRank.get(uri);
    const vr = vectorRank.get(uri);

    const rrf = (tr ? 1 / (RRF_K + tr) : 0) + (vr ? 1 / (RRF_K + vr) : 0);

    hits.push({
      investigation_uri: uri,
      short_id: uri.split("/").pop() ?? uri,
      hypothesis: (t?.root_cause_hypothesis ?? v?.root_cause_hypothesis ?? "").slice(0, 200),
      cosine: v ? v.cosine_score : null,
      bm25: t ? t.bm25_score : null,
      bm25_norm: t ? t.bm25_score / maxBm25 : 0,
      hybrid: rrf,
    });
  }

  hits.sort((a, b) => b.hybrid - a.hybrid);
  return hits.slice(0, limit);
}
