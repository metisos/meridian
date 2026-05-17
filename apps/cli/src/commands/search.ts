/**
 * `meridian search "<text>"` — semantic search via Atlas $vectorSearch on
 * artifacts.usc.embedding. Proves the 768-dim vector index works end-to-end.
 *
 * `meridian similar <uri>` — find artifacts similar to a given one (uses its
 * embedding as the query).
 */

import { createEmbeddingBackend } from "@meridian/usc";
import { getEnv } from "../env.js";
import { getMongo } from "../mongoClient.js";
import { color, emitJSON, renderTable, section, type CommandFlags } from "../output.js";

interface SearchHit {
  uri: string;
  name: string;
  domain: string;
  score: number;
  tier?: string;
  temporal?: string;
}

async function runVectorSearch(queryVector: number[], limit: number): Promise<SearchHit[]> {
  const env = getEnv();
  const mongo = await getMongo();
  const col = mongo.db(env.MONGODB_DB).collection("artifacts");
  const rows = await col
    .aggregate([
      {
        $vectorSearch: {
          index: "artifact_vector_index",
          path: "usc.embedding",
          queryVector,
          numCandidates: Math.max(50, limit * 10),
          limit,
        },
      },
      {
        $project: {
          _id: 0,
          uri: 1,
          name: 1,
          domain: 1,
          tier: "$usc.tier",
          temporal: "$usc.temporal",
          score: { $meta: "vectorSearchScore" },
        },
      },
    ])
    .toArray();
  return rows as SearchHit[];
}

export async function searchCommand(
  query: string,
  options: { limit?: number } & CommandFlags = {},
): Promise<SearchHit[]> {
  const limit = options.limit ?? 5;
  const backend = createEmbeddingBackend(process.env);
  const [qVec] = await backend.embedBatch([query], "query");
  const hits = await runVectorSearch(qVec!, limit);
  if (options.json) {
    emitJSON(hits);
    return hits;
  }
  section(`search "${query}" ${color.dim(`(top ${hits.length})`)}`);
  process.stdout.write(
    "\n" +
      renderTable(
        [
          { header: "Score", align: "right" },
          { header: "Tier" },
          { header: "URI", maxWidth: 60 },
          { header: "Name", maxWidth: 60 },
        ],
        hits.map((h) => ({
          Score: h.score.toFixed(3),
          Tier: h.tier ?? "-",
          URI: h.uri,
          Name: h.name,
        })),
      ) +
      "\n",
  );
  return hits;
}

export async function similarCommand(
  uri: string,
  options: { limit?: number } & CommandFlags = {},
): Promise<SearchHit[]> {
  const env = getEnv();
  const limit = options.limit ?? 5;
  const mongo = await getMongo();
  const seed = await mongo
    .db(env.MONGODB_DB)
    .collection("artifacts")
    .findOne({ uri }, { projection: { "usc.embedding": 1 } });
  if (!seed?.usc?.embedding) {
    process.stderr.write(`no artifact or no embedding for ${uri}\n`);
    process.exit(2);
  }
  const hits = await runVectorSearch(seed.usc.embedding as number[], limit + 1);
  const filtered = hits.filter((h) => h.uri !== uri).slice(0, limit);
  if (options.json) {
    emitJSON(filtered);
    return filtered;
  }
  section(`similar to ${uri} ${color.dim(`(top ${filtered.length})`)}`);
  process.stdout.write(
    "\n" +
      renderTable(
        [
          { header: "Score", align: "right" },
          { header: "Tier" },
          { header: "URI", maxWidth: 60 },
          { header: "Name", maxWidth: 60 },
        ],
        filtered.map((h) => ({
          Score: h.score.toFixed(3),
          Tier: h.tier ?? "-",
          URI: h.uri,
          Name: h.name,
        })),
      ) +
      "\n",
  );
  return filtered;
}
