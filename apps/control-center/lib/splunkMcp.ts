import "server-only";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Agent, setGlobalDispatcher } from "undici";
import { env } from "./env";

/* Connection to the Splunk MCP server (Splunkbase app 7931) running inside the
 * self-hosted Splunk Enterprise on GCE. The Splunk VM uses a self-signed TLS
 * cert, so we install a global undici dispatcher that accepts it.
 *
 * The client is cached on globalThis so Next.js HMR doesn't leak connections
 * and so each chat request reuses the same MCP session. */

declare global {
  // eslint-disable-next-line no-var
  var __meridianSplunkMcp:
    | { client: Client | null; promise: Promise<Client> | null; dispatcherSet: boolean }
    | undefined;
}

function cache() {
  if (!globalThis.__meridianSplunkMcp) {
    globalThis.__meridianSplunkMcp = { client: null, promise: null, dispatcherSet: false };
  }
  return globalThis.__meridianSplunkMcp;
}

function ensureDispatcher() {
  const c = cache();
  if (c.dispatcherSet) return;
  setGlobalDispatcher(new Agent({ connect: { rejectUnauthorized: false } }));
  c.dispatcherSet = true;
}

async function connect(): Promise<Client> {
  ensureDispatcher();
  if (!env.SPLUNK_BASE_URL) throw new Error("SPLUNK_BASE_URL not set");
  if (!env.SPLUNK_MCP_TOKEN) throw new Error("SPLUNK_MCP_TOKEN not set");

  const endpoint = new URL("/services/mcp", env.SPLUNK_BASE_URL.replace(/\/$/, ""));
  const transport = new StreamableHTTPClientTransport(endpoint, {
    requestInit: {
      headers: {
        Authorization: `Bearer ${env.SPLUNK_MCP_TOKEN}`,
      },
    },
  });
  const client = new Client({ name: "meridian-control-center", version: "0.1.0" });
  await client.connect(transport);
  return client;
}

export async function getSplunkMcp(): Promise<Client | null> {
  const c = cache();
  if (c.client) return c.client;
  if (!c.promise) {
    c.promise = connect()
      .then((client) => {
        c.client = client;
        return client;
      })
      .catch((err) => {
        c.promise = null;
        console.error("[splunkMcp] connect failed:", err);
        throw err;
      });
  }
  try {
    return await c.promise;
  } catch {
    return null;
  }
}
