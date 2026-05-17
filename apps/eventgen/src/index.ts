/**
 * @meridian/eventgen — multi-archetype incident event generator
 *
 * Usage:
 *   pnpm --filter @meridian/eventgen start                         # one cascading-failure (default)
 *   pnpm --filter @meridian/eventgen start -- --scenario auth-bruteforce
 *   pnpm --filter @meridian/eventgen start -- --bulk 500           # 500 random incidents across 30d
 *   pnpm --filter @meridian/eventgen start -- --bulk 1000 --span 7 # 1000 incidents over last 7d
 *   pnpm --filter @meridian/eventgen start -- --dry-run            # build but don't post
 *   pnpm --filter @meridian/eventgen start -- --verify             # post + SPL-search count
 *   pnpm --filter @meridian/eventgen start -- --seed 42            # deterministic randomness
 */

import { loadConfig } from "./config.js";
import { createHecClient, type HecEvent } from "./hec.js";
import { SCENARIOS, mulberry32, type Scenario } from "./scenarios/index.js";
import { splSearch } from "./verify.js";

export const EVENTGEN_PACKAGE = "@meridian/eventgen" as const;

interface CliArgs {
  dryRun: boolean;
  verify: boolean;
  atTimeMs?: number;
  bulk?: number;
  spanDays: number;
  scenario?: string;
  seed: number;
  hecBatch: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { dryRun: false, verify: false, spanDays: 30, seed: Date.now(), hecBatch: 500 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--verify") args.verify = true;
    else if (a === "--at" && argv[i + 1]) {
      const ms = Date.parse(argv[++i] ?? "");
      if (Number.isNaN(ms)) throw new Error(`--at: bad date`);
      args.atTimeMs = ms;
    } else if (a === "--bulk" && argv[i + 1]) {
      args.bulk = parseInt(argv[++i] ?? "0", 10);
    } else if (a === "--span" && argv[i + 1]) {
      args.spanDays = parseFloat(argv[++i] ?? "30");
    } else if (a === "--scenario" && argv[i + 1]) {
      args.scenario = argv[++i];
    } else if (a === "--seed" && argv[i + 1]) {
      args.seed = parseInt(argv[++i] ?? "0", 10);
    } else if (a === "--hec-batch" && argv[i + 1]) {
      args.hecBatch = parseInt(argv[++i] ?? "500", 10);
    } else if (a === "--help" || a === "-h") {
      console.log(
        `usage: eventgen [--scenario NAME | --bulk N [--span DAYS]] [--seed N] [--dry-run|--verify] [--at ISO8601]\n` +
          `\nScenarios: ${SCENARIOS.map((s) => s.name).join(", ")}\n`,
      );
      process.exit(0);
    }
  }
  return args;
}

function summarize(events: HecEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of events) counts[e.sourcetype] = (counts[e.sourcetype] ?? 0) + 1;
  return counts;
}

async function postInBatches(
  events: HecEvent[],
  hec: ReturnType<typeof createHecClient>,
  batchSize: number,
): Promise<{ ok: number; bytesSent: number; batches: number }> {
  let ok = 0;
  let bytesSent = 0;
  let batches = 0;
  for (let i = 0; i < events.length; i += batchSize) {
    const slice = events.slice(i, i + batchSize);
    const res = await hec.send(slice);
    ok += res.ok;
    bytesSent += res.bytesSent;
    batches++;
    if (batches % 5 === 0 || i + batchSize >= events.length) {
      process.stdout.write(`  batch ${batches}: ${ok}/${events.length} sent (${(bytesSent / 1024 / 1024).toFixed(2)} MB)\r`);
    }
  }
  process.stdout.write("\n");
  return { ok, bytesSent, batches };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cfg = loadConfig();
  console.log(`eventgen → ${cfg.SPLUNK_HEC_URL} (index=${cfg.SPLUNK_HEC_INDEX})  seed=${args.seed}`);

  const events: HecEvent[] = [];
  const archetypeCounts: Record<string, number> = {};

  if (args.bulk && args.bulk > 0) {
    // Bulk mode — N random incidents across the span
    console.log(`\nBulk: ${args.bulk} incidents over ${args.spanDays} days`);
    const baseRng = mulberry32(args.seed);
    const spanMs = args.spanDays * 24 * 60 * 60 * 1000;
    const now = args.atTimeMs ?? Date.now();
    for (let i = 0; i < args.bulk; i++) {
      const scenarioRng = mulberry32(args.seed + i * 1009);
      const scenario = SCENARIOS[Math.floor(baseRng() * SCENARIOS.length)]!;
      const offsetBack = baseRng() * spanMs;
      const baseTimeMs = now - offsetBack;
      const built = scenario.build({ baseTimeMs, index: cfg.SPLUNK_HEC_INDEX, rng: scenarioRng });
      events.push(...built);
      archetypeCounts[scenario.name] = (archetypeCounts[scenario.name] ?? 0) + 1;
    }
  } else {
    // Single scenario
    const name = args.scenario ?? "cascading-failure";
    const scenario: Scenario | undefined = SCENARIOS.find((s) => s.name === name);
    if (!scenario) {
      console.error(`unknown scenario "${name}". Available: ${SCENARIOS.map((s) => s.name).join(", ")}`);
      process.exit(1);
    }
    const rng = mulberry32(args.seed);
    const built = scenario.build({
      baseTimeMs: args.atTimeMs ?? Date.now(),
      index: cfg.SPLUNK_HEC_INDEX,
      rng,
    });
    events.push(...built);
    archetypeCounts[scenario.name] = 1;
  }

  events.sort((a, b) => a.time - b.time);

  // Summary
  console.log(`\nTotal events: ${events.length.toLocaleString()}`);
  console.log("Archetype mix:");
  for (const [name, n] of Object.entries(archetypeCounts).sort()) {
    console.log(`  ${name.padEnd(24)} ${n} instances`);
  }
  console.log("Sourcetype mix:");
  for (const [st, n] of Object.entries(summarize(events)).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${st.padEnd(24)} ${n.toLocaleString()}`);
  }

  if (args.dryRun) {
    console.log("\n--dry-run: skipping HEC POST");
    return;
  }

  const hec = createHecClient({ url: cfg.SPLUNK_HEC_URL, token: cfg.SPLUNK_HEC_TOKEN });
  console.log(`\nPosting in batches of ${args.hecBatch}...`);
  const t0 = Date.now();
  const result = await postInBatches(events, hec, args.hecBatch);
  const ms = Date.now() - t0;
  const eps = (result.ok * 1000) / ms;
  console.log(`Posted ${result.ok.toLocaleString()} events (${(result.bytesSent / 1024 / 1024).toFixed(2)} MB) in ${(ms / 1000).toFixed(1)}s → ${eps.toFixed(0)} events/s\n`);

  if (args.verify) {
    if (!cfg.SPLUNK_BASE_URL) {
      console.error("--verify requires SPLUNK_BASE_URL");
      process.exit(1);
    }
    const password = process.env.SPLUNK_ADMIN_PASSWORD;
    if (!password) {
      console.error("--verify requires SPLUNK_ADMIN_PASSWORD in env");
      process.exit(1);
    }
    console.log("Verifying via SPL (may take 5-30s for index to catch up)...");
    for (let attempt = 1; attempt <= 8; attempt++) {
      await new Promise((r) => setTimeout(r, 5000));
      const rows = await splSearch({
        baseUrl: cfg.SPLUNK_BASE_URL,
        username: cfg.SPLUNK_USERNAME,
        password,
        spl: `search index=${cfg.SPLUNK_HEC_INDEX} earliest=-${Math.ceil(args.spanDays + 1)}d | stats count`,
        maxResults: 1,
      });
      const total = parseInt(String(rows[0]?.count ?? "0"), 10);
      console.log(`  attempt ${attempt}: ${total.toLocaleString()} events visible in Splunk`);
      if (total >= result.ok) {
        console.log(`  All ${result.ok.toLocaleString()} events indexed.\n`);
        return;
      }
    }
    console.warn("  Timed out waiting for Splunk to finish indexing.");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("eventgen failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
