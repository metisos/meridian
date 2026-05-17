/**
 * meridian — Meridian CLI root. See docs/cli-plan.md for the full surface.
 */

import { Command } from "commander";
import { doctorCommand } from "./commands/doctor.js";
import { statusCommand } from "./commands/status.js";
import { seedActors, seedPermissions, seedEntities, seedAll } from "./commands/seed.js";
import { ingestRun, ingestWatermark } from "./commands/ingest.js";
import { artifactList, artifactShow, artifactHistory, artifactDiff } from "./commands/artifact.js";
import { provenanceShow } from "./commands/provenance.js";
import { splunkSearch, splunkIndexes, splunkSourcetypes } from "./commands/splunk.js";
import { listenCommand } from "./commands/listen.js";
import { searchCommand, similarCommand } from "./commands/search.js";
import { uscShow, uscMatch } from "./commands/usc.js";
import { scenarioReset, scenarioRun } from "./commands/scenario.js";
import { investigateCommand, askCommand } from "./commands/investigate.js";
import { closeMongo } from "./mongoClient.js";

const program = new Command();

program
  .name("meridian")
  .description("Meridian CLI — pipeline harness and incident-intelligence query interface")
  .version("0.1.0")
  .option("--json", "emit machine-readable JSON instead of human-formatted output", false);

const flags = (): { json: boolean } => program.opts<{ json: boolean }>();

program
  .command("doctor")
  .description("Probe every dependency (env, Atlas, Splunk REST + HEC, embedding)")
  .action(async () => {
    const { ok } = await doctorCommand(flags());
    await closeMongo();
    process.exit(ok ? 0 : 1);
  });

program
  .command("status")
  .description("Counts at every layer: Splunk events, ContextSync artifacts, actors, etc.")
  .action(async () => {
    await statusCommand(flags());
    await closeMongo();
  });

// seed
const seed = program.command("seed").description("Load static seed data into MongoDB");
seed
  .command("actors")
  .description("Seed the actor registry from infra/seed/actors.json")
  .action(async () => {
    await seedActors(flags());
    await closeMongo();
  });
seed
  .command("permissions")
  .description("Seed permission grants from infra/seed/permissions.json")
  .action(async () => {
    await seedPermissions(flags());
    await closeMongo();
  });
seed
  .command("entities")
  .description("Seed the entity_graph from infra/seed/entities.json")
  .action(async () => {
    await seedEntities(flags());
    await closeMongo();
  });
seed
  .command("all")
  .description("Seed everything (actors + permissions + entities)")
  .action(async () => {
    await seedAll(flags());
    await closeMongo();
  });

// ingest
const ingest = program.command("ingest").description("Pull events from Splunk into ContextSync artifacts");
ingest
  .command("run")
  .description("Run one ingestion pass")
  .option("--since <iso>", "earliest event time (overrides watermark)")
  .option("--limit <n>", "max events to fetch this run", (v) => parseInt(v, 10))
  .option("--embed-batch <n>", "events per embedding call (default 100)", (v) => parseInt(v, 10))
  .option("--dry-run", "stamp but don't write", false)
  .option("--no-storage-guard", "disable Atlas M0 storage guard (after upgrading to M10+)", false)
  .action(
    async (opts: {
      since?: string;
      limit?: number;
      embedBatch?: number;
      dryRun: boolean;
      storageGuard: boolean;
    }) => {
      await ingestRun({
        since: opts.since,
        limit: opts.limit,
        embedBatch: opts.embedBatch,
        dryRun: opts.dryRun,
        noStorageGuard: !opts.storageGuard,
        ...flags(),
      });
      await closeMongo();
    },
  );
ingest
  .command("watermark")
  .description("Show or reset the ingestion watermark")
  .option("--reset", "reset the watermark to none", false)
  .action(async (opts: { reset: boolean }) => {
    await ingestWatermark({ ...opts, ...flags() });
    await closeMongo();
  });

program
  .command("listen")
  .description("Tail MongoDB Change Streams on artifacts (Ctrl-C to exit)")
  .action(async () => {
    await listenCommand(flags());
  });

// artifact
const artifact = program.command("artifact").description("Inspect ContextSync artifacts");
artifact
  .command("list")
  .description("List artifacts")
  .option("--domain <name>", "filter by domain")
  .option("--limit <n>", "max rows", (v) => parseInt(v, 10))
  .option("--actor <id>", "actor for read permission (default human-ciso)")
  .action(async (opts: { domain?: string; limit?: number; actor?: string }) => {
    await artifactList({ ...opts, ...flags() });
    await closeMongo();
  });
artifact
  .command("show <uri>")
  .description("Show full artifact metadata + USC + content")
  .option("--version <n>", "fetch a specific version", (v) => parseInt(v, 10))
  .option("--actor <id>", "actor for read permission")
  .action(async (uri: string, opts: { version?: number; actor?: string }) => {
    await artifactShow(uri, { ...opts, ...flags() });
    await closeMongo();
  });
artifact
  .command("history <uri>")
  .description("Version history for an artifact")
  .option("--actor <id>", "actor for read permission")
  .action(async (uri: string, opts: { actor?: string }) => {
    await artifactHistory(uri, { ...opts, ...flags() });
    await closeMongo();
  });
artifact
  .command("diff <uri>")
  .description("Diff two versions of an artifact")
  .requiredOption("--from <n>", "from version", (v) => parseInt(v, 10))
  .requiredOption("--to <n>", "to version", (v) => parseInt(v, 10))
  .option("--actor <id>", "actor for read permission")
  .action(async (uri: string, opts: { from: number; to: number; actor?: string }) => {
    await artifactDiff(uri, { ...opts, ...flags() });
    await closeMongo();
  });

program
  .command("provenance <uri>")
  .description("Show provenance log for an artifact")
  .option("--actor <id>", "filter by actor")
  .option("--limit <n>", "max entries", (v) => parseInt(v, 10))
  .action(async (uri: string, opts: { actor?: string; limit?: number }) => {
    await provenanceShow(uri, { ...opts, ...flags() });
    await closeMongo();
  });

// splunk
const splunk = program.command("splunk").description("Splunk passthrough");
splunk
  .command("search <spl>")
  .description("Run a SPL search and print results")
  .option("--limit <n>", "max results", (v) => parseInt(v, 10))
  .option("--earliest <t>", "earliest_time (Splunk syntax, e.g. -1h, 2026-05-20T00:00:00)")
  .option("--latest <t>", "latest_time")
  .action(async (spl: string, opts: { limit?: number; earliest?: string; latest?: string }) => {
    await splunkSearch(spl, { ...opts, ...flags() });
  });
splunk
  .command("indexes")
  .description("List Splunk indexes")
  .action(async () => {
    await splunkIndexes(flags());
  });
splunk
  .command("sourcetypes")
  .description("List sourcetypes seen in a window")
  .option("--earliest <t>", "earliest_time", "-24h")
  .action(async (opts: { earliest?: string }) => {
    await splunkSourcetypes({ ...opts, ...flags() });
  });

program
  .command("search <text>")
  .description("Semantic search across ContextSync artifacts via Atlas Vector Search")
  .option("--limit <n>", "max hits", (v) => parseInt(v, 10))
  .action(async (text: string, opts: { limit?: number }) => {
    await searchCommand(text, { ...opts, ...flags() });
    await closeMongo();
  });

program
  .command("similar <uri>")
  .description("Find artifacts semantically similar to a given one")
  .option("--limit <n>", "max hits", (v) => parseInt(v, 10))
  .action(async (uri: string, opts: { limit?: number }) => {
    await similarCommand(uri, { ...opts, ...flags() });
    await closeMongo();
  });

const usc = program.command("usc").description("USC primitive inspection");
usc
  .command("show <uri>")
  .description("Pretty-print USC fields for an artifact")
  .action(async (uri: string) => {
    await uscShow(uri, flags());
    await closeMongo();
  });
usc
  .command("match <a> <b>")
  .description("Compute cross-tier match score between two artifacts")
  .action(async (a: string, b: string) => {
    await uscMatch(a, b, flags());
    await closeMongo();
  });

// scenario
const scenario = program.command("scenario").description("Demo helpers");
scenario
  .command("reset")
  .description("Wipe ingested artifacts, memory, provenance, watermarks (preserves seed data)")
  .action(async () => {
    await scenarioReset(flags());
    await closeMongo();
  });
scenario
  .command("run")
  .description("Push events + ingest + summarize (one-shot demo)")
  .action(async () => {
    await scenarioRun(flags());
    await closeMongo();
  });

// Phase C: agent-driven commands
program
  .command("investigate <uri>")
  .description("Run the 7-step investigation flow on a trigger event URI")
  .option("--window <minutes>", "enrichment window in minutes (default 5)", (v) => parseInt(v, 10))
  .action(async (uri: string, opts: { window?: number }) => {
    await investigateCommand(uri, { ...opts, ...flags() });
    await closeMongo();
  });

program
  .command("ask <question...>")
  .description("Ask the agent a natural-language question (uses MongoDB MCP tools)")
  .action(async (questionParts: string[]) => {
    const question = questionParts.join(" ");
    await askCommand(question, flags());
    await closeMongo();
  });

program
  .command("report <investigation-uri>")
  .description("(Phase D) Generate exportable post-incident report")
  .action(() => {
    process.stderr.write("'report' is Phase D. See docs/cli-plan.md\n");
    process.exit(2);
  });

// pnpm injects a literal "--" between the script name and our args; strip it
// so commander doesn't treat it as end-of-options for the root program.
const argv = process.argv.filter((a, i) => !(i === 2 && a === "--"));

// `listen` is the only command that's supposed to keep the event loop alive
// (it tails MongoDB Change Streams). Every other command should exit cleanly
// after parseAsync resolves. Some transitive deps (transformers.js workers,
// undici keep-alive pools, MCP-SDK background timers) hold the event loop
// open even after our explicit closeMongo(), so we exit on our own terms.
const exitWhenDone = !argv.includes("listen");

program
  .parseAsync(argv)
  .then(async () => {
    if (exitWhenDone) {
      await closeMongo().catch(() => undefined);
      process.exit(0);
    }
  })
  .catch(async (err) => {
    process.stderr.write(`meridian: ${err instanceof Error ? err.message : String(err)}\n`);
    await closeMongo().catch(() => undefined);
    process.exit(1);
  });
