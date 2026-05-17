/**
 * `meridian scenario reset|run` — demo helpers.
 *
 *   reset:  wipe ingested artifacts, agent memory, provenance, watermarks.
 *           Preserves actors, permissions, entity_graph (the seed data).
 *   run:    one-shot demo flow (eventgen → wait → ingest → list).
 */

import { execSync } from "node:child_process";
import { getEnv } from "../env.js";
import { getMongo } from "../mongoClient.js";
import { color, symbols, type CommandFlags } from "../output.js";
import { ingestRun } from "./ingest.js";

const RESET_COLLECTIONS = ["artifacts", "agent_memory", "provenance", "watermarks", "chat_sessions"];

export async function scenarioReset(_: CommandFlags = {}): Promise<{ wiped: Record<string, number> }> {
  const env = getEnv();
  const mongo = await getMongo();
  const db = mongo.db(env.MONGODB_DB);
  const wiped: Record<string, number> = {};
  for (const c of RESET_COLLECTIONS) {
    const before = await db.collection(c).estimatedDocumentCount();
    await db.collection(c).deleteMany({});
    wiped[c] = before;
  }
  process.stdout.write(
    `${color.green(symbols.ok)} scenario reset: ` +
      Object.entries(wiped)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ") +
      "\n",
  );
  return { wiped };
}

export async function scenarioRun(options: CommandFlags = {}): Promise<void> {
  process.stdout.write(`${color.dim(symbols.bullet)} pushing cascading-failure scenario into Splunk HEC...\n`);
  try {
    execSync("pnpm --filter @meridian/eventgen start --silent", {
      cwd: process.cwd(),
      stdio: "inherit",
    });
  } catch (e) {
    process.stderr.write(`eventgen failed: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  }
  process.stdout.write(`${color.dim(symbols.bullet)} waiting 6s for Splunk to index...\n`);
  await new Promise((r) => setTimeout(r, 6000));
  process.stdout.write(`${color.dim(symbols.bullet)} running ingest...\n`);
  await ingestRun(options);
  process.stdout.write(`${color.green(symbols.ok)} scenario complete. Run 'meridian search' or 'meridian listen' next.\n`);
}
