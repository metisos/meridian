/**
 * Spawn MongoDB MCP server (npm: mongodb-mcp-server) as a stdio subprocess
 * and return an MCP Client connected to it. Caller is responsible for closing.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Find the mongodb-mcp-server bin shim by walking up from this file. pnpm
 * creates `node_modules/.bin/mongodb-mcp-server` in the package that depends
 * on it (and the workspace root). Walk parents until we find it.
 */
function resolveServerBin(): string {
  const start = dirname(fileURLToPath(import.meta.url));
  let dir = start;
  // Climb up to filesystem root looking for node_modules/.bin/mongodb-mcp-server
  for (let i = 0; i < 12; i++) {
    const candidate = resolve(dir, "node_modules/.bin/mongodb-mcp-server");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    "mongodb-mcp-server bin not found in any node_modules/.bin/ from " + start,
  );
}

export interface MongoMcpOptions {
  /** Full mongodb+srv URI (URL-encoded password). */
  connectionString: string;
  /** Default DB the server scopes operations to. */
  defaultDatabase?: string;
  /** Restrict to read-only operations. Default: false for the agent. */
  readOnly?: boolean;
}

export interface MongoMcpHandle {
  client: Client;
  close: () => Promise<void>;
}

export async function connectMongoMcp(opts: MongoMcpOptions): Promise<MongoMcpHandle> {
  // Resolve the server bin from the workspace so we don't depend on PATH
  const binPath = resolveServerBin();

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    MDB_MCP_CONNECTION_STRING: opts.connectionString,
    MDB_MCP_TELEMETRY: "disabled",
  };
  if (opts.readOnly) env.MDB_MCP_READ_ONLY = "true";

  // pnpm's bin shim is a shell script that internally execs node; invoke directly
  const transport = new StdioClientTransport({
    command: binPath,
    args: [],
    env,
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
