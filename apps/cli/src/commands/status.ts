/**
 * `meridian status` — counts at every layer. Quick health snapshot.
 */

import { getEnv } from "../env.js";
import { getMongo } from "../mongoClient.js";
import { splCountEventsInIndex } from "../splunkClient.js";
import { color, emitJSON, renderTable, section, type CommandFlags } from "../output.js";

export interface StatusResult {
  splunk: { index: string; events: number };
  mongo: Record<string, number>;
}

export async function statusCommand(flags: CommandFlags = {}): Promise<StatusResult> {
  const env = getEnv();
  const [splunkEvents, mongoCounts] = await Promise.all([
    splCountEventsInIndex(env.SPLUNK_HEC_INDEX).catch(() => -1),
    (async () => {
      const c = await getMongo();
      const db = c.db(env.MONGODB_DB);
      const collections = [
        "artifacts",
        "actors",
        "permissions",
        "provenance",
        "agent_memory",
        "entity_graph",
        "chat_sessions",
        "watermarks",
      ];
      const counts: Record<string, number> = {};
      await Promise.all(
        collections.map(async (name) => {
          try {
            counts[name] = await db.collection(name).estimatedDocumentCount();
          } catch {
            counts[name] = 0;
          }
        }),
      );
      return counts;
    })(),
  ]);

  const result: StatusResult = {
    splunk: { index: env.SPLUNK_HEC_INDEX, events: splunkEvents },
    mongo: mongoCounts,
  };

  if (flags.json) {
    emitJSON(result);
    return result;
  }

  section(`meridian status ${color.dim(`(${env.MONGODB_DB} on ${env.MONGODB_HOST})`)}`);
  process.stdout.write(
    "\n" +
      color.bold("Splunk") +
      "\n" +
      renderTable(
        [
          { header: "Index" },
          { header: "Events", align: "right" },
        ],
        [
          {
            Index: result.splunk.index,
            Events: splunkEvents === -1 ? color.red("unreachable") : splunkEvents.toLocaleString(),
          },
        ],
      ) +
      "\n",
  );

  process.stdout.write(
    "\n" +
      color.bold("MongoDB") +
      "\n" +
      renderTable(
        [
          { header: "Collection" },
          { header: "Documents", align: "right" },
        ],
        Object.entries(result.mongo).map(([k, v]) => ({
          Collection: k,
          Documents: v.toLocaleString(),
        })),
      ) +
      "\n",
  );

  return result;
}
