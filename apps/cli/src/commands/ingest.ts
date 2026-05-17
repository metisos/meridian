/**
 * `meridian ingest run` — pull new Splunk events since the watermark, stamp
 * with USC, write ContextSync artifacts. Idempotent (URI is deterministic
 * from event content).
 *
 * Uses ContextSyncClient.createArtifactsMany for batch inserts (≥10× faster
 * than serial createArtifact at scale).
 *
 * Storage guard: aborts with a clear error if the projected post-ingest size
 * would exceed Atlas M0's safe budget (412 MB; 100 MB buffer below the 512 MB
 * hard cap). Override with --no-storage-guard if you've upgraded the cluster.
 *
 * `meridian ingest watermark` — show or reset the watermark.
 */

import { ContextSyncClient } from "@meridian/contextsync";
import { createEmbeddingBackend } from "@meridian/usc";
import { getEnv } from "../env.js";
import { getMongo } from "../mongoClient.js";
import { splSearch } from "../splunkClient.js";
import { stampEvents, type StampedArtifact } from "../pipeline/stamper.js";
import { getWatermark, setWatermark, resetWatermark } from "../pipeline/watermark.js";
import {
  color,
  emitJSON,
  renderTable,
  section,
  statusBadge,
  symbols,
  type CommandFlags,
} from "../output.js";

const INGEST_ACTOR = "agent-meridian-ingest";

// Atlas M0 free tier safety budget. Measured at ~25.5 KB per artifact end-to-end
// (data + B-tree + vector index). Leave 100 MB buffer below the 512 MB hard cap.
const M0_SAFE_BUDGET_MB = 412;
const KB_PER_ARTIFACT = 26; // conservative

export interface IngestResult {
  fetched: number;
  written: number;
  skipped_duplicates: number;
  high_watermark: string;
  latencyMs: number;
}

export interface IngestOptions extends CommandFlags {
  since?: string;
  limit?: number;
  dryRun?: boolean;
  /** Embedding batch size — keep ≤200 to avoid OOM and give progress visibility */
  embedBatch?: number;
  /** Disable the M0 storage guard (set to true if you've upgraded to M10+) */
  noStorageGuard?: boolean;
}

async function checkStorageHeadroom(
  db: ReturnType<Awaited<ReturnType<typeof getMongo>>["db"]>,
  newArtifacts: number,
  override: boolean,
): Promise<{ ok: boolean; currentMB: number; projectedMB: number; budgetMB: number }> {
  const stats = (await db.command({ dbStats: 1 })) as { storageSize: number; indexSize: number };
  const currentMB = (stats.storageSize + stats.indexSize) / 1024 / 1024;
  const projectedMB = currentMB + (newArtifacts * KB_PER_ARTIFACT) / 1024;
  const ok = override || projectedMB <= M0_SAFE_BUDGET_MB;
  return { ok, currentMB, projectedMB, budgetMB: M0_SAFE_BUDGET_MB };
}

export async function ingestRun(options: IngestOptions): Promise<IngestResult> {
  const env = getEnv();
  const t0 = Date.now();
  const mongo = await getMongo();
  const db = mongo.db(env.MONGODB_DB);

  // Resolve "since" — argument > watermark > 24h ago
  const watermark = await getWatermark(db, env.SPLUNK_HEC_INDEX);
  const earliest =
    options.since ?? watermark ?? new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const limit = options.limit ?? 1000;
  const embedBatch = options.embedBatch ?? 100;

  // Fetch events from Splunk (oneshot)
  process.stdout.write(color.dim(`  fetching from Splunk (since ${earliest}, limit ${limit})...\n`));
  const events = await splSearch({
    query: `search index=${env.SPLUNK_HEC_INDEX}`,
    earliest,
    maxResults: limit,
  });

  if (events.length === 0) {
    const result: IngestResult = {
      fetched: 0,
      written: 0,
      skipped_duplicates: 0,
      high_watermark: watermark ?? earliest,
      latencyMs: Date.now() - t0,
    };
    if (options.json) emitJSON(result);
    else process.stdout.write(`${color.amber(symbols.warn)} no new events since ${earliest}\n`);
    return result;
  }
  process.stdout.write(color.dim(`  fetched ${events.length.toLocaleString()} events\n`));

  // Storage guard — projecting from event count (worst case: all new artifacts)
  const headroom = await checkStorageHeadroom(db, events.length, !!options.noStorageGuard);
  process.stdout.write(
    color.dim(
      `  storage: ${headroom.currentMB.toFixed(1)} MB now → ~${headroom.projectedMB.toFixed(1)} MB projected (budget ${headroom.budgetMB} MB)\n`,
    ),
  );
  if (!headroom.ok) {
    process.stderr.write(
      color.red(
        `\n${symbols.fail} M0 storage guard: projected ${headroom.projectedMB.toFixed(1)} MB > ${headroom.budgetMB} MB safe budget.\n` +
          `  Run with --no-storage-guard if you've upgraded the cluster, or scale back --limit.\n`,
      ),
    );
    process.exit(2);
  }

  // Embed in chunks to keep memory bounded and surface progress
  const backend = createEmbeddingBackend(process.env);
  const stamped: StampedArtifact[] = [];
  for (let i = 0; i < events.length; i += embedBatch) {
    const slice = events.slice(i, i + embedBatch);
    const chunk = await stampEvents(slice, { embeddingBackend: backend });
    stamped.push(...chunk);
    process.stdout.write(
      `\r  ${color.dim(
        `stamped ${stamped.length.toLocaleString()}/${events.length.toLocaleString()} (${((stamped.length / events.length) * 100).toFixed(0)}%)`,
      )}`,
    );
  }
  process.stdout.write("\n");

  // Bulk write (unless dry-run)
  let written = 0;
  let skipped = 0;
  if (!options.dryRun) {
    const client = new ContextSyncClient({ mongo, dbName: env.MONGODB_DB });
    const writeBatch = 500;
    for (let i = 0; i < stamped.length; i += writeBatch) {
      const slice = stamped.slice(i, i + writeBatch);
      const inputs = slice.map((s) => ({
        uri: s.uri,
        name: s.name,
        content_type: s.content_type,
        content: s.content,
        summary: `ingested from Splunk via REST search`,
        usc: s.usc,
      }));
      const res = await client.createArtifactsMany(INGEST_ACTOR, inputs);
      written += res.inserted;
      skipped += res.skipped;
      process.stdout.write(
        `\r  ${color.dim(
          `written ${written.toLocaleString()} / skipped ${skipped.toLocaleString()} of ${stamped.length.toLocaleString()}`,
        )}`,
      );
    }
    process.stdout.write("\n");
  }

  // Watermark advance to the latest event time we observed
  const highWatermarkIso = stamped.reduce(
    (acc, s) => (s.usc.temporal > acc ? s.usc.temporal : acc),
    earliest,
  );
  if (!options.dryRun) await setWatermark(db, env.SPLUNK_HEC_INDEX, highWatermarkIso);

  const result: IngestResult = {
    fetched: events.length,
    written,
    skipped_duplicates: skipped,
    high_watermark: highWatermarkIso,
    latencyMs: Date.now() - t0,
  };

  if (options.json) {
    emitJSON(result);
    return result;
  }

  section(
    `meridian ingest ${options.dryRun ? color.amber("(dry-run)") : ""} ${color.dim(
      `index=${env.SPLUNK_HEC_INDEX}`,
    )}`,
  );
  process.stdout.write(
    "\n" +
      renderTable(
        [{ header: "Metric" }, { header: "Value", align: "right" }],
        [
          { Metric: "Fetched (since " + earliest + ")", Value: events.length.toLocaleString() },
          { Metric: "Written", Value: written.toLocaleString() },
          { Metric: "Skipped (duplicate URI)", Value: skipped.toLocaleString() },
          { Metric: "High watermark", Value: result.high_watermark },
          {
            Metric: "Latency",
            Value: `${(result.latencyMs / 1000).toFixed(1)}s (${((written * 1000) / result.latencyMs).toFixed(0)} events/s)`,
          },
        ],
      ) +
      "\n",
  );
  const grouped = groupBySourcetype(stamped);
  if (grouped.length > 0) {
    process.stdout.write(
      "\n" +
        color.bold("By sourcetype") +
        "\n" +
        renderTable(
          [{ header: "Sourcetype" }, { header: "Count", align: "right" }],
          grouped.slice(0, 12).map(([k, v]) => ({ Sourcetype: k, Count: v.toLocaleString() })),
        ) +
        "\n",
    );
  }
  return result;
}

function groupBySourcetype(
  stamped: Array<{ content: { fields: Record<string, string | undefined> } }>,
): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const s of stamped) {
    const st = s.content.fields.sourcetype ?? "?";
    counts.set(st, (counts.get(st) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export async function ingestWatermark(
  options: { reset?: boolean } & CommandFlags = {},
): Promise<{ index: string; watermark: string | null }> {
  const env = getEnv();
  const mongo = await getMongo();
  const db = mongo.db(env.MONGODB_DB);

  if (options.reset) {
    await resetWatermark(db, env.SPLUNK_HEC_INDEX);
    if (options.json) emitJSON({ index: env.SPLUNK_HEC_INDEX, watermark: null });
    else
      process.stdout.write(
        `${statusBadge(true)} watermark reset for index=${env.SPLUNK_HEC_INDEX}\n`,
      );
    return { index: env.SPLUNK_HEC_INDEX, watermark: null };
  }

  const watermark = await getWatermark(db, env.SPLUNK_HEC_INDEX);
  const result = { index: env.SPLUNK_HEC_INDEX, watermark };
  if (options.json) emitJSON(result);
  else
    process.stdout.write(
      `index=${env.SPLUNK_HEC_INDEX} watermark=${watermark ?? color.dim("(none)")}\n`,
    );
  return result;
}
