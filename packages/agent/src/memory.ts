/**
 * Agent memory — vector search over past investigations.
 *
 * Step 3 of the investigation flow (PRD §7.4): use the trigger event's
 * embedding to find semantically similar past investigations from the
 * agent_memory collection via Atlas $vectorSearch.
 */

import type { Db } from "mongodb";

export interface MemoryHit {
  investigation_uri: string;
  similarity: number;
  root_cause_hypothesis?: string;
  confidence?: number;
  resolution_time_minutes?: number;
}

export async function searchMemory(
  db: Db,
  embedding: number[],
  limit = 3,
): Promise<MemoryHit[]> {
  const hasMemory = await db.collection("agent_memory").estimatedDocumentCount();
  if (hasMemory === 0) return [];

  const rows = await db
    .collection("agent_memory")
    .aggregate([
      {
        $vectorSearch: {
          index: "memory_vector_index",
          path: "embedding",
          queryVector: embedding,
          numCandidates: Math.max(50, limit * 10),
          limit,
        },
      },
      {
        $project: {
          _id: 0,
          investigation_uri: 1,
          root_cause_hypothesis: 1,
          confidence: 1,
          resolution_time_minutes: 1,
          similarity: { $meta: "vectorSearchScore" },
        },
      },
    ])
    .toArray();

  return rows as MemoryHit[];
}
