/**
 * `meridian doctor` — probe every dependency the CLI/agent will use and report
 * green/red per check. First command we wrote, sets the bar for the rest.
 */

import { MongoClient } from "mongodb";
import { Agent, fetch as undiciFetch, setGlobalDispatcher } from "undici";
import { getEnv, mongoUri, type EnvConfig } from "../env.js";
import { color, statusBadge, renderTable, emitJSON, symbols, section, type CommandFlags } from "../output.js";

setGlobalDispatcher(new Agent({ connect: { rejectUnauthorized: false } }));

export interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
  latencyMs: number;
}

async function timeit<T>(fn: () => Promise<T>): Promise<{ result?: T; error?: Error; ms: number }> {
  const t0 = Date.now();
  try {
    const result = await fn();
    return { result, ms: Date.now() - t0 };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), ms: Date.now() - t0 };
  }
}

async function checkEnv(env: EnvConfig): Promise<CheckResult> {
  const required: Array<keyof EnvConfig> = [
    "MONGODB_USER",
    "MONGODB_PASSWORD",
    "MONGODB_HOST",
    "SPLUNK_BASE_URL",
    "SPLUNK_HEC_URL",
    "SPLUNK_HEC_TOKEN",
  ];
  const missing = required.filter((k) => !env[k]);
  return {
    name: "env",
    ok: missing.length === 0,
    detail: missing.length === 0 ? "all required vars present" : `missing: ${missing.join(", ")}`,
    latencyMs: 0,
  };
}

async function checkAtlas(env: EnvConfig): Promise<CheckResult> {
  const { result, error, ms } = await timeit(async () => {
    const client = new MongoClient(mongoUri(env), { serverSelectionTimeoutMS: 8000 });
    try {
      await client.connect();
      const info = await client.db(env.MONGODB_DB).command({ hello: 1 });
      return info.primary as string;
    } finally {
      await client.close();
    }
  });
  return {
    name: "atlas",
    ok: !error,
    detail: error ? error.message : `connected via ${result}`,
    latencyMs: ms,
  };
}

interface SearchIndexInfo {
  name: string;
  status?: string;
  queryable?: boolean;
}

async function checkAtlasVectorIndexes(env: EnvConfig): Promise<CheckResult> {
  const { result, error, ms } = await timeit(async () => {
    const client = new MongoClient(mongoUri(env), { serverSelectionTimeoutMS: 8000 });
    try {
      await client.connect();
      const db = client.db(env.MONGODB_DB);
      const arts = (await db
        .collection("artifacts")
        .listSearchIndexes()
        .toArray()) as SearchIndexInfo[];
      const mems = (await db
        .collection("agent_memory")
        .listSearchIndexes()
        .toArray()) as SearchIndexInfo[];
      const a = arts.find((i) => i.name === "artifact_vector_index");
      const m = mems.find((i) => i.name === "memory_vector_index");
      if (!a || !m) throw new Error("one or both vector indexes missing");
      if (a.status !== "READY") throw new Error(`artifact_vector_index status=${a.status ?? "?"}`);
      if (m.status !== "READY") throw new Error(`memory_vector_index status=${m.status ?? "?"}`);
      return "both READY (768d cosine)";
    } finally {
      await client.close();
    }
  });
  return { name: "atlas:vectors", ok: !error, detail: error ? error.message : (result as string), latencyMs: ms };
}

async function checkSplunkRest(env: EnvConfig): Promise<CheckResult> {
  const password = env.SPLUNK_ADMIN_PASSWORD;
  const { error, result, ms } = await timeit(async () => {
    if (!password) throw new Error("SPLUNK_ADMIN_PASSWORD not in env (source it from Secret Manager)");
    const auth = Buffer.from(`${env.SPLUNK_USERNAME}:${password}`).toString("base64");
    const url = `${env.SPLUNK_BASE_URL}/services/server/info?output_mode=json`;
    const res = await undiciFetch(url, {
      method: "GET",
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { entry: Array<{ content: { version: string; serverName: string } }> };
    const e = json.entry[0]!.content;
    return `${e.serverName} v${e.version}`;
  });
  return { name: "splunk:rest", ok: !error, detail: error ? error.message : (result as string), latencyMs: ms };
}

async function checkSplunkHec(env: EnvConfig): Promise<CheckResult> {
  const { error, result, ms } = await timeit(async () => {
    const healthUrl = env.SPLUNK_HEC_URL.replace(/\/services\/collector\/?$/, "/services/collector/health");
    const res = await undiciFetch(healthUrl, {
      method: "GET",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { text?: string };
    return json.text ?? "healthy";
  });
  return { name: "splunk:hec", ok: !error, detail: error ? error.message : (result as string), latencyMs: ms };
}

async function checkEmbedding(env: EnvConfig): Promise<CheckResult> {
  const { error, result, ms } = await timeit(async () => {
    if (env.EMBED_BACKEND === "local") {
      const { LocalNomicBackend } = await import("@meridian/usc");
      const backend = new LocalNomicBackend();
      const v = await backend.embed("doctor smoke", "document");
      if (v.length !== env.EMBED_DIM)
        throw new Error(`expected dim=${env.EMBED_DIM}, got ${v.length}`);
      return `nomic v1.5 → ${v.length}d`;
    }
    const { GeminiBackend } = await import("@meridian/usc");
    if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");
    const backend = new GeminiBackend({ apiKey: env.GEMINI_API_KEY });
    const v = await backend.embed("doctor smoke", "document");
    return `gemini → ${v.length}d`;
  });
  return { name: "embedding", ok: !error, detail: error ? error.message : (result as string), latencyMs: ms };
}

export async function doctorCommand(flags: CommandFlags = {}): Promise<{ ok: boolean; checks: CheckResult[] }> {
  const env = getEnv();

  // Run checks in parallel where they don't share state
  const checks = await Promise.all([
    checkEnv(env),
    checkAtlas(env),
    checkAtlasVectorIndexes(env),
    checkSplunkRest(env),
    checkSplunkHec(env),
    checkEmbedding(env),
  ]);

  const ok = checks.every((c) => c.ok);

  if (flags.json) {
    emitJSON({ ok, checks });
    return { ok, checks };
  }

  section(`meridian doctor ${color.dim(`(project=${env.GCP_PROJECT})`)}`);
  const rows = checks.map((c) => ({
    "": statusBadge(c.ok),
    Check: c.name,
    Latency: c.latencyMs > 0 ? `${c.latencyMs}ms` : "-",
    Detail: c.ok ? color.dim(c.detail) : color.red(c.detail),
  }));
  process.stdout.write(
    "\n" +
      renderTable(
        [
          { header: "", maxWidth: 2 },
          { header: "Check", maxWidth: 20 },
          { header: "Latency", align: "right", maxWidth: 10 },
          { header: "Detail", maxWidth: 80 },
        ],
        rows,
      ) +
      "\n",
  );

  const summary = ok
    ? color.green(`\n${symbols.ok} all systems green\n`)
    : color.red(`\n${symbols.fail} ${checks.filter((c) => !c.ok).length} check(s) failed\n`);
  process.stdout.write(summary);

  return { ok, checks };
}
