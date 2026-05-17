/**
 * `meridian usc show <uri>` — pretty-print the 7 USC fields.
 * `meridian usc match <uri-A> <uri-B>` — cross-tier match score.
 */

import { crossTierMatch } from "@meridian/usc";
import { getEnv } from "../env.js";
import { getMongo } from "../mongoClient.js";
import { color, emitJSON, renderTable, section, type CommandFlags } from "../output.js";

interface ArtifactUSC {
  spatial?: Record<string, unknown>;
  temporal: string;
  spatial_uncertainty: number;
  temporal_uncertainty_ms: number;
  provenance?: Record<string, unknown>;
  tier?: string;
  embedding: number[];
}

async function loadUSC(uri: string): Promise<ArtifactUSC> {
  const env = getEnv();
  const mongo = await getMongo();
  const doc = (await mongo
    .db(env.MONGODB_DB)
    .collection("artifacts")
    .findOne({ uri }, { projection: { usc: 1 } })) as { usc?: ArtifactUSC } | null;
  if (!doc?.usc) throw new Error(`no USC found for ${uri}`);
  return doc.usc;
}

export async function uscShow(uri: string, options: CommandFlags = {}): Promise<unknown> {
  const usc = await loadUSC(uri);
  if (options.json) {
    emitJSON(usc);
    return usc;
  }
  section(`usc ${uri}`);
  const norm = Math.sqrt(usc.embedding.reduce((s, v) => s + v * v, 0));
  const rows = [
    { Field: "tier", Value: String(usc.tier ?? "-") },
    { Field: "temporal", Value: usc.temporal },
    { Field: "spatial", Value: JSON.stringify(usc.spatial ?? {}) },
    { Field: "spatial_uncertainty", Value: String(usc.spatial_uncertainty) },
    { Field: "temporal_uncertainty_ms", Value: String(usc.temporal_uncertainty_ms) },
    { Field: "provenance", Value: JSON.stringify(usc.provenance ?? {}) },
    {
      Field: "embedding",
      Value: `[${usc.embedding.length}d, L2=${norm.toFixed(4)}, first 5: ${usc.embedding
        .slice(0, 5)
        .map((v) => v.toFixed(4))
        .join(", ")}…]`,
    },
  ];
  process.stdout.write(
    "\n" + renderTable([{ header: "Field" }, { header: "Value", maxWidth: 100 }], rows) + "\n",
  );
  return usc;
}

export async function uscMatch(
  uriA: string,
  uriB: string,
  options: CommandFlags = {},
): Promise<unknown> {
  const [a, b] = await Promise.all([loadUSC(uriA), loadUSC(uriB)]);

  // Use B's coordinates as the query, with the radii defaulted to 5min / 1 hop
  // — sensible for testing pairwise relevance between two existing artifacts.
  const rt = 5 * 60 * 1000;
  const rs = 1;

  const C = crossTierMatch({
    primitive: {
      spatial: a.spatial as { host?: string; network_hop?: number; lat?: number; lng?: number; zone?: string; rack?: string },
      temporal: a.temporal,
      spatial_uncertainty: a.spatial_uncertainty,
      temporal_uncertainty_ms: a.temporal_uncertainty_ms,
    },
    query: {
      spatial: b.spatial as { host?: string; network_hop?: number; lat?: number; lng?: number; zone?: string; rack?: string },
      temporal: b.temporal,
      spatial_radius: rs,
      temporal_radius_ms: rt,
    },
  });

  const dtMs = Math.abs(Date.parse(a.temporal) - Date.parse(b.temporal));
  const result = { a: uriA, b: uriB, dt_ms: dtMs, rs, rt_ms: rt, score: C };
  if (options.json) {
    emitJSON(result);
    return result;
  }

  section(`usc match`);
  process.stdout.write(
    "\n" +
      renderTable(
        [{ header: "" }, { header: "URI" }, { header: "tier" }, { header: "temporal" }, { header: "spatial" }],
        [
          { "": "A", URI: uriA, tier: String(a.tier ?? "-"), temporal: a.temporal, spatial: JSON.stringify(a.spatial ?? {}) },
          { "": "B", URI: uriB, tier: String(b.tier ?? "-"), temporal: b.temporal, spatial: JSON.stringify(b.spatial ?? {}) },
        ],
      ) +
      "\n",
  );
  process.stdout.write(
    `\nquery radii: rs=${rs} hop, rt=${(rt / 1000).toFixed(0)}s\n` +
      `dt = ${(dtMs / 1000).toFixed(2)}s\n` +
      `C(p, Q) = ${color.amber(C.toFixed(4))}\n`,
  );
  return result;
}
