/**
 * `meridian artifact list|show|history|diff` — inspect ContextSync artifacts.
 */

import { ContextSyncClient } from "@meridian/contextsync";
import { getEnv } from "../env.js";
import { getMongo } from "../mongoClient.js";
import { color, emitJSON, renderTable, section, type CommandFlags } from "../output.js";

const DEFAULT_ACTOR = "human-ciso";

function client(): ContextSyncClient {
  return new ContextSyncClient({} as { mongo: never }); // placeholder, replaced below
}

async function mkClient(): Promise<ContextSyncClient> {
  const env = getEnv();
  const mongo = await getMongo();
  return new ContextSyncClient({ mongo, dbName: env.MONGODB_DB });
}

void client; // silence unused

export async function artifactList(
  options: { domain?: string; limit?: number; actor?: string } & CommandFlags = {},
): Promise<unknown> {
  const c = await mkClient();
  const actor = options.actor ?? DEFAULT_ACTOR;
  const rows = await c.listArtifacts(actor, { domain: options.domain, limit: options.limit ?? 50 });
  if (options.json) {
    emitJSON(rows);
    return rows;
  }
  section(`artifacts ${color.dim(`(actor=${actor}${options.domain ? `, domain=${options.domain}` : ""})`)}`);
  process.stdout.write(
    "\n" +
      renderTable(
        [
          { header: "URI", maxWidth: 60 },
          { header: "Name", maxWidth: 40 },
          { header: "V", align: "right" },
          { header: "Updated" },
        ],
        rows.map((r) => ({
          URI: r.uri,
          Name: r.name,
          V: String(r.head_version),
          Updated: r.updated_at,
        })),
      ) +
      `\n${color.dim(`${rows.length} artifacts`)}\n`,
  );
  return rows;
}

export async function artifactShow(
  uri: string,
  options: { version?: number; actor?: string } & CommandFlags = {},
): Promise<unknown> {
  const c = await mkClient();
  const actor = options.actor ?? DEFAULT_ACTOR;
  const res = await c.getArtifact(actor, uri, options.version ? { version: options.version } : undefined);
  if (options.json) {
    emitJSON({ ...res.artifact, _read_version: res.version });
    return res;
  }

  section(`${res.artifact.uri} ${color.dim(`v${res.version}`)}`);
  const usc = res.artifact.usc as
    | { spatial?: Record<string, unknown>; temporal?: string; tier?: string; provenance?: Record<string, unknown>; embedding?: number[] }
    | undefined;
  const rows: Array<{ Field: string; Value: string }> = [
    { Field: "name", Value: res.artifact.name },
    { Field: "domain", Value: res.artifact.domain },
    { Field: "head_version", Value: String(res.artifact.head_version) },
    { Field: "created_at", Value: res.artifact.created_at },
    { Field: "updated_at", Value: res.artifact.updated_at },
    { Field: "deleted_at", Value: String(res.artifact.deleted_at ?? "-") },
  ];
  if (usc) {
    rows.push({ Field: "usc.tier", Value: String(usc.tier ?? "-") });
    rows.push({ Field: "usc.temporal", Value: String(usc.temporal ?? "-") });
    rows.push({ Field: "usc.spatial", Value: JSON.stringify(usc.spatial ?? {}) });
    rows.push({ Field: "usc.provenance", Value: JSON.stringify(usc.provenance ?? {}) });
    if (Array.isArray(usc.embedding)) {
      const norm = Math.sqrt(usc.embedding.reduce((s, v) => s + v * v, 0));
      rows.push({
        Field: "usc.embedding",
        Value: `[${usc.embedding.length}d, L2=${norm.toFixed(4)}, first 5: ${usc.embedding
          .slice(0, 5)
          .map((v) => v.toFixed(4))
          .join(", ")}…]`,
      });
    }
  }
  process.stdout.write(
    "\n" + renderTable([{ header: "Field" }, { header: "Value", maxWidth: 100 }], rows) + "\n",
  );
  process.stdout.write(
    "\n" +
      color.bold("Content") +
      "\n" +
      JSON.stringify(res.content, null, 2).slice(0, 2000) +
      "\n",
  );
  return res;
}

export async function artifactHistory(
  uri: string,
  options: { actor?: string } & CommandFlags = {},
): Promise<unknown> {
  const c = await mkClient();
  const actor = options.actor ?? DEFAULT_ACTOR;
  const versions = await c.getHistory(actor, uri);
  if (options.json) {
    emitJSON(versions);
    return versions;
  }
  section(`history for ${uri}`);
  process.stdout.write(
    "\n" +
      renderTable(
        [
          { header: "V", align: "right" },
          { header: "Author" },
          { header: "Timestamp" },
          { header: "Summary", maxWidth: 60 },
          { header: "Hash", maxWidth: 20 },
        ],
        versions.map((v) => ({
          V: String(v.version),
          Author: v.author_id,
          Timestamp: v.timestamp,
          Summary: v.summary,
          Hash: v.hash.slice(7, 19) + "…",
        })),
      ) +
      "\n",
  );
  return versions;
}

export async function artifactDiff(
  uri: string,
  options: { from: number; to: number; actor?: string } & CommandFlags,
): Promise<unknown> {
  const c = await mkClient();
  const actor = options.actor ?? DEFAULT_ACTOR;
  const diff = await c.diffVersions(actor, uri, options.from, options.to);
  if (options.json) {
    emitJSON(diff);
    return diff;
  }
  section(`diff ${uri} v${options.from} → v${options.to}`);
  process.stdout.write(
    `\n${color.green(`+${diff.stats.added_lines}`)} ${color.red(`-${diff.stats.removed_lines}`)} ${color.dim(`=${diff.stats.unchanged_lines}`)}\n\n`,
  );
  for (const op of diff.ops.slice(0, 100)) {
    if (op.kind === "+") process.stdout.write(color.green(`+ ${op.line}\n`));
    else if (op.kind === "-") process.stdout.write(color.red(`- ${op.line}\n`));
    else process.stdout.write(color.dim(`  ${op.line}\n`));
  }
  if (diff.ops.length > 100) process.stdout.write(color.dim(`... and ${diff.ops.length - 100} more lines\n`));
  return diff;
}
