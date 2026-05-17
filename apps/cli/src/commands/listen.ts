/**
 * `meridian listen` — tail MongoDB Change Streams on the artifacts collection.
 * Streams new artifacts as they land. Ctrl-C exits cleanly.
 */

import { getEnv } from "../env.js";
import { getMongo } from "../mongoClient.js";
import { color, symbols, type CommandFlags } from "../output.js";

export async function listenCommand(
  options: { pattern?: string } & CommandFlags = {},
): Promise<void> {
  const env = getEnv();
  const mongo = await getMongo();
  const db = mongo.db(env.MONGODB_DB);
  const collection = db.collection("artifacts");

  process.stdout.write(
    `${color.dim(symbols.bullet)} listening for new artifacts on ${env.MONGODB_DB}.artifacts ${color.dim("(Ctrl-C to exit)")}\n`,
  );

  const stream = collection.watch([], { fullDocument: "updateLookup" });

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stdout.write(color.dim(`\n${symbols.bullet} stopping listener\n`));
    try {
      await stream.close();
    } catch {
      // ignore
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  for await (const change of stream) {
    if (shuttingDown) break;
    if (change.operationType !== "insert" && change.operationType !== "update") continue;
    const doc = (change as { fullDocument?: { uri?: string; name?: string; head_version?: number; usc?: { tier?: string } } })
      .fullDocument;
    const op = change.operationType === "insert" ? color.green("INS") : color.amber("UPD");
    const uri = doc?.uri ?? "?";
    const name = doc?.name ?? "?";
    const tier = doc?.usc?.tier ?? "-";
    const v = doc?.head_version ?? 0;
    const ts = new Date().toISOString();
    if (options.json) {
      process.stdout.write(JSON.stringify({ ts, op: change.operationType, uri, v, tier, name }) + "\n");
    } else {
      process.stdout.write(`${color.dim(ts)} ${op} ${color.blue(`v${v}`)} ${color.dim(`[${tier}]`)} ${uri} ${color.dim("→ " + name.slice(0, 80))}\n`);
    }
  }
}
