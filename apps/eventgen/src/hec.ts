import { Agent, setGlobalDispatcher } from "undici";

/**
 * Allow self-signed certs from the Splunk Enterprise VM (default install).
 * Confined to this process; not a global TLS bypass elsewhere.
 */
let dispatcherInstalled = false;
function installInsecureDispatcher(): void {
  if (dispatcherInstalled) return;
  setGlobalDispatcher(new Agent({ connect: { rejectUnauthorized: false } }));
  dispatcherInstalled = true;
}

export interface HecEvent {
  /** Event payload — Splunk indexes the `event` field. String or object both work. */
  event: string | Record<string, unknown>;
  sourcetype: string;
  source: string;
  index: string;
  /** Unix epoch seconds (floating point ok for sub-second precision) */
  time: number;
  host?: string;
}

export interface HecClient {
  send(events: HecEvent[]): Promise<{ ok: number; bytesSent: number }>;
}

export function createHecClient(opts: { url: string; token: string }): HecClient {
  installInsecureDispatcher();

  return {
    async send(events) {
      if (events.length === 0) return { ok: 0, bytesSent: 0 };

      // HEC accepts newline-delimited JSON for multiple events in one request.
      const body = events.map((e) => JSON.stringify(e)).join("\n");

      const res = await fetch(opts.url, {
        method: "POST",
        headers: {
          Authorization: `Splunk ${opts.token}`,
          "Content-Type": "application/json",
        },
        body,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HEC ${res.status}: ${text.slice(0, 300)}`);
      }

      const json = (await res.json()) as { code: number; text: string };
      if (json.code !== 0) {
        throw new Error(`HEC code=${json.code} text=${json.text}`);
      }

      return { ok: events.length, bytesSent: Buffer.byteLength(body, "utf8") };
    },
  };
}
