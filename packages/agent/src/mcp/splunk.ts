/**
 * Connect to the Splunk MCP Server (Splunkbase app 7931) running inside our
 * self-hosted Splunk Enterprise. Uses Streamable HTTP transport with a bearer
 * token (the RSA-encrypted token from the app's /mcp_token endpoint).
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Agent, setGlobalDispatcher } from "undici";

// Allow self-signed cert from the Splunk Enterprise VM
setGlobalDispatcher(new Agent({ connect: { rejectUnauthorized: false } }));

export interface SplunkMcpOptions {
  /** e.g. https://splunk.example.com:8089 */
  baseUrl: string;
  /** Bearer token from the Splunk MCP app's /mcp_token endpoint */
  token: string;
}

export interface SplunkMcpHandle {
  client: Client;
  close: () => Promise<void>;
}

export async function connectSplunkMcp(opts: SplunkMcpOptions): Promise<SplunkMcpHandle> {
  const endpoint = new URL("/services/mcp", opts.baseUrl.replace(/\/$/, ""));
  const transport = new StreamableHTTPClientTransport(endpoint, {
    requestInit: {
      headers: {
        Authorization: `Bearer ${opts.token}`,
      },
    },
  });

  const client = new Client({ name: "meridian-agent", version: "0.1.0" });
  await client.connect(transport);

  return {
    client,
    close: async () => {
      try {
        await client.close();
      } catch {
        // ignore
      }
    },
  };
}
