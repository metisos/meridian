/**
 * `meridian seed actors|permissions|entities` — load static seed data into Mongo.
 * Idempotent: re-running won't duplicate (uses unique indexes / upsert).
 */

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContextSyncClient } from "@meridian/contextsync";
import type { Actor, PermissionGrant } from "@meridian/contextsync";
import { getEnv } from "../env.js";
import { getMongo } from "../mongoClient.js";
import { color, emitJSON, symbols, type CommandFlags } from "../output.js";

// Resolve the seed/ directory relative to this source file, not the CWD.
const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_DIR = resolve(__dirname, "../../../../infra/seed");

async function loadSeed<T>(filename: string): Promise<T> {
  const raw = await readFile(resolve(SEED_DIR, filename), "utf8");
  return JSON.parse(raw) as T;
}

export async function seedActors(flags: CommandFlags = {}): Promise<{ created: number; skipped: number }> {
  const env = getEnv();
  const client = new ContextSyncClient({ mongo: await getMongo(), dbName: env.MONGODB_DB });
  const seed = await loadSeed<Omit<Actor, "created_at">[]>("actors.json");

  let created = 0;
  let skipped = 0;
  for (const a of seed) {
    try {
      await client.createActor(a);
      created++;
    } catch (e) {
      if (e instanceof Error && /already exists/.test(e.message)) skipped++;
      else throw e;
    }
  }
  if (flags.json) emitJSON({ created, skipped });
  else process.stdout.write(`${color.green(symbols.ok)} actors: created=${created} skipped=${skipped}\n`);
  return { created, skipped };
}

export async function seedPermissions(flags: CommandFlags = {}): Promise<{ inserted: number }> {
  const env = getEnv();
  const client = new ContextSyncClient({ mongo: await getMongo(), dbName: env.MONGODB_DB });
  const seed = await loadSeed<Omit<PermissionGrant, "created_at">[]>("permissions.json");

  // Wipe + reinsert so permissions are deterministic from the seed file.
  const mongo = await getMongo();
  await mongo.db(env.MONGODB_DB).collection("permissions").deleteMany({});

  let inserted = 0;
  for (const g of seed) {
    await client.grantPermission(g);
    inserted++;
  }
  if (flags.json) emitJSON({ inserted });
  else process.stdout.write(`${color.green(symbols.ok)} permissions: inserted=${inserted}\n`);
  return { inserted };
}

interface EntitySeed {
  uri: string;
  entity_type: string;
  name: string;
  metadata?: Record<string, unknown>;
  relationships?: Array<{ target_uri: string; relation: string }>;
}

export async function seedEntities(flags: CommandFlags = {}): Promise<{ upserted: number }> {
  const env = getEnv();
  const seed = await loadSeed<EntitySeed[]>("entities.json");
  const mongo = await getMongo();
  const col = mongo.db(env.MONGODB_DB).collection("entity_graph");

  let upserted = 0;
  for (const e of seed) {
    await col.updateOne({ uri: e.uri }, { $set: e }, { upsert: true });
    upserted++;
  }
  if (flags.json) emitJSON({ upserted });
  else process.stdout.write(`${color.green(symbols.ok)} entities: upserted=${upserted}\n`);
  return { upserted };
}

export async function seedAll(flags: CommandFlags = {}): Promise<void> {
  await seedActors(flags);
  await seedPermissions(flags);
  await seedEntities(flags);
}
