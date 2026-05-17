/**
 * Thin Splunk REST wrapper. Reads credentials from env and Secret Manager;
 * supports oneshot SPL search, index listing, and sourcetype enumeration.
 *
 * Uses HTTP Basic auth with the admin password — fine because we own the VM.
 * Self-signed TLS allowed via the global undici dispatcher set elsewhere.
 */

import { Agent, fetch as undiciFetch, setGlobalDispatcher } from "undici";
import { execSync } from "node:child_process";
import { getEnv } from "./env.js";

setGlobalDispatcher(new Agent({ connect: { rejectUnauthorized: false } }));

let cachedPassword: string | null = null;

export function splunkAdminPassword(): string {
  if (cachedPassword) return cachedPassword;
  const env = getEnv();
  if (env.SPLUNK_ADMIN_PASSWORD) {
    cachedPassword = env.SPLUNK_ADMIN_PASSWORD;
    return cachedPassword;
  }
  // Fall back to gcloud Secret Manager — same path docs/infrastructure.md describes
  const project = env.GCP_PROJECT;
  try {
    const out = execSync(
      `gcloud secrets versions access latest --secret=SPLUNK_ADMIN_PASSWORD --project=${project}`,
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
    if (!out) throw new Error("empty");
    cachedPassword = out;
    return cachedPassword;
  } catch (e) {
    throw new Error(
      `Could not resolve SPLUNK_ADMIN_PASSWORD. Set it in .env.local or run: gcloud auth login. (${e instanceof Error ? e.message : String(e)})`,
    );
  }
}

function authHeader(): string {
  const env = getEnv();
  const pw = splunkAdminPassword();
  return `Basic ${Buffer.from(`${env.SPLUNK_USERNAME}:${pw}`).toString("base64")}`;
}

export interface SplunkEvent {
  _time: string;
  _raw: string;
  sourcetype: string;
  source?: string;
  host?: string;
  index: string;
  [field: string]: string | undefined;
}

/**
 * Run a SPL `search` and return results as an array. `query` should already
 * include the leading "search" keyword (or any other generating command).
 */
export async function splSearch(opts: {
  query: string;
  maxResults?: number;
  earliest?: string;
  latest?: string;
}): Promise<SplunkEvent[]> {
  const env = getEnv();
  const search = opts.query.startsWith("search ") || opts.query.startsWith("| ")
    ? opts.query
    : `search ${opts.query}`;

  const body = new URLSearchParams({
    search,
    output_mode: "json",
    exec_mode: "oneshot",
    count: String(opts.maxResults ?? 100),
  });
  if (opts.earliest) body.set("earliest_time", opts.earliest);
  if (opts.latest) body.set("latest_time", opts.latest);

  const res = await undiciFetch(`${env.SPLUNK_BASE_URL}/services/search/jobs/export`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SPL ${res.status}: ${text.slice(0, 200)}`);
  }
  const raw = await res.text();
  const rows: SplunkEvent[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const j = JSON.parse(line);
      if (j.result) rows.push(j.result as SplunkEvent);
    } catch {
      // skip stats / progress lines
    }
  }
  return rows;
}

export async function splListIndexes(): Promise<Array<{ name: string; totalEventCount: number }>> {
  const env = getEnv();
  const res = await undiciFetch(`${env.SPLUNK_BASE_URL}/services/data/indexes?output_mode=json&count=0`, {
    method: "GET",
    headers: { Authorization: authHeader() },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`indexes ${res.status}`);
  const json = (await res.json()) as {
    entry: Array<{ name: string; content: { totalEventCount: number | string } }>;
  };
  return json.entry.map((e) => ({
    name: e.name,
    totalEventCount: Number(e.content.totalEventCount ?? 0),
  }));
}

export async function splCountEventsInIndex(index: string): Promise<number> {
  const rows = await splSearch({
    query: `search index=${index} | stats count`,
    maxResults: 1,
  });
  return Number(rows[0]?.count ?? 0);
}
