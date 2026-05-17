/**
 * `meridian provenance <uri>` — show provenance log for an artifact.
 */

import { ContextSyncClient } from "@meridian/contextsync";
import { getEnv } from "../env.js";
import { getMongo } from "../mongoClient.js";
import { color, emitJSON, renderTable, section, type CommandFlags } from "../output.js";

export async function provenanceShow(
  uri: string,
  options: { actor?: string; limit?: number } & CommandFlags = {},
): Promise<unknown> {
  const env = getEnv();
  const mongo = await getMongo();
  const client = new ContextSyncClient({ mongo, dbName: env.MONGODB_DB });
  const rows = await client.queryProvenance({
    artifact_uri: uri,
    actor_id: options.actor,
    limit: options.limit ?? 50,
  });
  if (options.json) {
    emitJSON(rows);
    return rows;
  }
  section(`provenance for ${uri}`);
  process.stdout.write(
    "\n" +
      renderTable(
        [
          { header: "When" },
          { header: "Actor" },
          { header: "Op" },
          { header: "V", align: "right" },
          { header: "Downstream", maxWidth: 60 },
        ],
        rows.map((r) => ({
          When: r.created_at,
          Actor: r.actor_id,
          Op: r.operation,
          V: String(r.version_touched),
          Downstream: r.downstream_uri ?? color.dim("-"),
        })),
      ) +
      `\n${color.dim(`${rows.length} entries`)}\n`,
  );
  return rows;
}
