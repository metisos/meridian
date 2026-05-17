import { Agent, setGlobalDispatcher } from "undici";

setGlobalDispatcher(new Agent({ connect: { rejectUnauthorized: false } }));

/**
 * Run a one-shot SPL search via the REST API and return result rows.
 * Uses HTTP Basic auth (admin + password). Password is expected via env var
 * SPLUNK_ADMIN_PASSWORD (sourced from Secret Manager at the shell level).
 */
export async function splSearch(opts: {
  baseUrl: string;
  username: string;
  password: string;
  spl: string;
  maxResults?: number;
}): Promise<Array<Record<string, string>>> {
  const search = opts.spl.startsWith("search ") ? opts.spl : `search ${opts.spl}`;
  const body = new URLSearchParams({
    search,
    output_mode: "json",
    exec_mode: "oneshot",
    count: String(opts.maxResults ?? 100),
  });

  const res = await fetch(`${opts.baseUrl}/services/search/jobs/export`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${opts.username}:${opts.password}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SPL search ${res.status}: ${text.slice(0, 300)}`);
  }

  const raw = await res.text();
  // export endpoint returns newline-delimited JSON, one object per result or status update
  const rows: Array<Record<string, string>> = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const j = JSON.parse(line);
      if (j.result) rows.push(j.result);
    } catch {
      // skip malformed lines
    }
  }
  return rows;
}
