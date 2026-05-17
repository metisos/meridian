/**
 * `meridian investigate <uri>` — run the agent's 7-step investigation flow on a
 * triggering event. Prints the structured result.
 *
 * `meridian ask "<question>"` — pose a natural-language question; the agent
 * uses an AgenticLoop with meta-tools (search_tools / list_tools / call_tool)
 * to discover and invoke MCP tools on demand. Keeps context small even with
 * many MCP servers wired in.
 */

import { ContextSyncClient } from "@meridian/contextsync";
import { createEmbeddingBackend } from "@meridian/usc";
import {
  connectMongoMcp,
  connectSplunkMcp,
  GeminiClient,
  AgenticLoop,
  investigate,
  type StepEvent,
} from "@meridian/agent";
import type { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { execSync } from "node:child_process";
import { getEnv } from "../env.js";
import { getMongo } from "../mongoClient.js";
import { color, emitJSON, renderTable, section, type CommandFlags } from "../output.js";

interface GeminiAuth {
  vertexai?: boolean;
  apiKey?: string;
  project?: string;
  location?: string;
}

function geminiAuth(env: ReturnType<typeof getEnv>): GeminiAuth {
  if (env.GEMINI_BACKEND === "vertex") {
    return { vertexai: true, project: env.GCP_PROJECT, location: env.VERTEX_LOCATION };
  }
  if (!env.GEMINI_API_KEY) {
    process.stderr.write("GEMINI_BACKEND=apikey but GEMINI_API_KEY not set\n");
    process.exit(1);
  }
  return { apiKey: env.GEMINI_API_KEY };
}

function getSplunkMcpToken(project: string): string | null {
  if (process.env.SPLUNK_MCP_TOKEN) return process.env.SPLUNK_MCP_TOKEN;
  try {
    return execSync(
      `gcloud secrets versions access latest --secret=SPLUNK_MCP_TOKEN --project=${project}`,
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  } catch {
    return null;
  }
}

const AGENT_SYSTEM_PROMPT = `You are Meridian's reasoning agent for security operations.

# Tool discovery (important)

Four meta-tools are always available:
  - search_tools(query)              find tools across all servers by keyword
  - list_tools(server)               list all tools on one server
  - list_tool_details(server, name)  fetch a tool's input schema
  - call_tool(server, name, args)    invoke a specific tool

MCP servers registered: "mongo" and "splunk" (when present).

Discover before you call. Don't guess tool names. Use search_tools FIRST with
a verb from the user's question (e.g. "search", "count", "vector", "aggregate")
to find the right tool, then list_tool_details to see exactly what arguments
it takes, then call_tool.

# Data sources

## mongo — MongoDB Atlas, database "meridian_db"

Collections and the fields you'll most commonly query:

  artifacts (ContextSync artifacts mirroring Splunk events + investigations)
    - uri                          "ctx://meridian/{domain}/{id}"
    - name                         short human-readable label
    - domain                       "splunk-events" | "investigations" | ...
    - head_version                 current version number
    - content.raw                  raw event text
    - content.fields.sourcetype    <-- sourcetype lives HERE, not at top level
    - content.fields.host
    - content.fields.severity
    - usc.tier                     "temporal" | "cognitive" | "spatial"
    - usc.temporal                 ISO 8601
    - usc.spatial.host
    - usc.embedding                768d float array
    - usc.provenance.source_system

  agent_memory (past investigations)
    - investigation_uri
    - root_cause_hypothesis
    - confidence
    - causal_chain[] { artifact_uri, position, label, usc_temporal }
    - blast_radius { infrastructure, business, compliance }
    - embedding                    768d for $vectorSearch (index: memory_vector_index)

  entity_graph
    - uri, entity_type, name
    - relationships[] { target_uri, relation }

  provenance (immutable audit log)
    - actor_id, operation ("read"|"write"), artifact_uri, version_touched, downstream_uri

Vector search index name: "artifact_vector_index" on artifacts.usc.embedding.

When filtering artifacts by sourcetype use { "content.fields.sourcetype": "db:error" } NOT
{ sourcetype: ... }. The same holds for host, severity, etc.

## splunk — Splunk Enterprise REST via MCP

  - Use splunk_run_query with SPL like:
      search index=main sourcetype=db:error | head 5
  - earliest_time / latest_time accept Splunk-relative ("-1d", "-15m") or ISO 8601
  - Hard limits: query must finish in <1 minute AND return <=1000 events

# Output discipline

Always cite the specific evidence:
  - ContextSync URIs as ctx://... in the answer text
  - Splunk events by sourcetype + host + _time
Be concise. Don't dump raw tool output unless asked.`;

export async function investigateCommand(
  triggerUri: string,
  options: { json?: boolean; window?: number } & CommandFlags = {},
): Promise<void> {
  const env = getEnv();
  const auth = geminiAuth(env);
  const mongo = await getMongo();
  const cs = new ContextSyncClient({ mongo, dbName: env.MONGODB_DB });
  const embedding = createEmbeddingBackend(process.env);

  const encodedPw = encodeURIComponent(env.MONGODB_PASSWORD);
  const mongoUriForMcp = `mongodb+srv://${env.MONGODB_USER}:${encodedPw}@${env.MONGODB_HOST}/?appName=${env.MONGODB_APP_NAME}`;
  const mongoMcp = await connectMongoMcp({
    connectionString: mongoUriForMcp,
    defaultDatabase: env.MONGODB_DB,
  });

  const splunkToken = getSplunkMcpToken(env.GCP_PROJECT);
  const splunkMcp = splunkToken
    ? await connectSplunkMcp({ baseUrl: env.SPLUNK_BASE_URL, token: splunkToken })
    : null;
  const mcpClients = splunkMcp ? [mongoMcp.client, splunkMcp.client] : [mongoMcp.client];

  const agent = new GeminiClient({
    ...auth,
    mcpClients,
    defaultModel: env.GEMINI_MODEL,
  });

  try {
    section(`investigating ${triggerUri}`);
    process.stdout.write(
      color.dim(
        `  backend: ${env.GEMINI_BACKEND} (${env.GEMINI_MODEL}@${auth.location ?? "apikey"})\n` +
          `  MCP servers: mongo${splunkMcp ? " + splunk" : ""}\n` +
          "  running 7-step flow (detect → enrich → match → chain → blast → narrative → memory)...\n\n",
      ),
    );

    const result = await investigate({
      trigger_event_uri: triggerUri,
      geminiClient: agent,
      contextSync: cs,
      mongo,
      embeddingBackend: embedding,
      enrichment: { window_minutes: options.window ?? 5 },
    });

    if (options.json) {
      emitJSON(result);
      return;
    }

    process.stdout.write(
      "\n" +
        renderTable(
          [{ header: "Field" }, { header: "Value", maxWidth: 90 }],
          [
            { Field: "investigation_uri", Value: result.investigation_uri },
            { Field: "trigger_event_uri", Value: result.trigger_event_uri },
            {
              Field: "confidence",
              Value:
                result.confidence > 0.7
                  ? color.green(result.confidence.toFixed(4))
                  : result.confidence > 0.3
                    ? color.amber(result.confidence.toFixed(4))
                    : color.red(result.confidence.toFixed(4)),
            },
            { Field: "latency_ms", Value: String(result.latency_ms) },
          ],
        ) +
        "\n",
    );

    process.stdout.write("\n" + color.bold("Root cause hypothesis") + "\n  " + result.root_cause_hypothesis + "\n");

    process.stdout.write(
      `\n${color.bold("Causal chain")} ${color.dim(`(${result.causal_chain.ordered.length} events · ${result.causal_chain.links.length} links)`)}\n`,
    );
    for (const link of result.causal_chain.links.slice(0, 8)) {
      process.stdout.write(
        `  ${color.dim(link.from_uri)}\n    ${color.amber("→")} ${color.dim(link.to_uri)}  ${color.dim(`dt=${(link.dt_ms / 1000).toFixed(1)}s C=${link.confidence.toFixed(3)}`)}\n`,
      );
    }
    if (result.causal_chain.links.length > 8)
      process.stdout.write(color.dim(`  ... and ${result.causal_chain.links.length - 8} more links\n`));

    process.stdout.write(
      `\n${color.bold("Blast radius")} ${color.dim(`(${result.blast_radius.total_affected} affected · root=${result.blast_radius.root_entity_uri})`)}\n`,
    );
    for (const i of result.blast_radius.infrastructure)
      process.stdout.write(`  ${color.blue("infrastructure")}  ${i.name} ${color.dim(`(${i.entity_type}, d=${i.distance})`)}\n`);
    for (const i of result.blast_radius.business)
      process.stdout.write(`  ${color.amber("business      ")}  ${i.name} ${color.dim(`(${i.entity_type}, d=${i.distance})`)}\n`);
    for (const i of result.blast_radius.compliance)
      process.stdout.write(`  ${color.red("compliance    ")}  ${i.name} ${color.dim(`(${i.entity_type}, d=${i.distance})`)}\n`);

    process.stdout.write(`\n${color.bold("Recommended actions")} ${color.dim(`(${result.actions_recommended.length})`)}\n`);
    for (const a of result.actions_recommended) {
      const tag =
        a.priority === "critical"
          ? color.red(`[${a.priority}]`)
          : a.priority === "high"
            ? color.amber(`[${a.priority}]    `)
            : a.priority === "medium"
              ? color.blue(`[${a.priority}]  `)
              : color.dim(`[${a.priority}]     `);
      process.stdout.write(`  ${tag} ${a.action}\n`);
    }

    process.stdout.write(
      `\n${color.bold("Similar past investigations")} ${color.dim(`(${result.similar_past_investigations.length})`)}\n`,
    );
    for (const s of result.similar_past_investigations.slice(0, 3)) {
      process.stdout.write(
        `  ${color.dim(s.similarity.toFixed(3))}  ${s.investigation_uri}\n    ${color.dim((s.root_cause_hypothesis ?? "").slice(0, 100))}\n`,
      );
    }
  } finally {
    await mongoMcp.close();
    if (splunkMcp) await splunkMcp.close();
  }
}

export async function askCommand(question: string, _options: CommandFlags = {}): Promise<void> {
  const env = getEnv();
  const auth = geminiAuth(env);
  const encodedPw = encodeURIComponent(env.MONGODB_PASSWORD);
  const mongoUriForMcp = `mongodb+srv://${env.MONGODB_USER}:${encodedPw}@${env.MONGODB_HOST}/?appName=${env.MONGODB_APP_NAME}`;
  const mongoMcp = await connectMongoMcp({
    connectionString: mongoUriForMcp,
    defaultDatabase: env.MONGODB_DB,
  });

  const splunkToken = getSplunkMcpToken(env.GCP_PROJECT);
  const splunkMcp = splunkToken
    ? await connectSplunkMcp({ baseUrl: env.SPLUNK_BASE_URL, token: splunkToken })
    : null;

  const mcpClients: Record<string, McpClient> = { mongo: mongoMcp.client };
  if (splunkMcp) mcpClients.splunk = splunkMcp.client;

  const loop = new AgenticLoop({
    ...auth,
    mcpClients,
    model: env.GEMINI_MODEL,
    maxSteps: 15,
  });

  try {
    section(`ask: ${question}`);
    process.stdout.write(
      color.dim(
        `  backend: ${env.GEMINI_BACKEND} (${env.GEMINI_MODEL}@${auth.location ?? "apikey"})\n` +
          `  MCP servers: ${Object.keys(mcpClients).join(", ")}\n` +
          "  agent loop (max 15 steps)...\n\n",
      ),
    );

    const t0 = Date.now();
    const result = await loop.run(question, {
      systemInstruction: AGENT_SYSTEM_PROMPT,
      onEvent: (e: StepEvent) => {
        if (e.kind === "tool_call") {
          const qualified =
            e.name === "call_tool" && typeof e.args.server === "string" && typeof e.args.name === "string"
              ? color.amber(`${e.args.server}.${e.args.name}`)
              : color.dim(e.name);
          process.stdout.write(`  ${color.dim(`[step ${e.step}]`)} ${color.dim("→")} ${qualified}\n`);
        } else if (e.kind === "tool_result") {
          const preview =
            typeof e.result === "object" && e.result !== null
              ? JSON.stringify(e.result).slice(0, 80)
              : String(e.result).slice(0, 80);
          process.stdout.write(`  ${color.dim(`         `)} ${color.dim(`← (${e.latencyMs}ms)`)} ${color.dim(preview)}\n`);
        }
      },
    });

    process.stdout.write(`\n${color.bold("Answer:")}\n${result.text}\n`);
    process.stdout.write(
      color.dim(
        `\n${result.steps} step(s) · tools used: ${result.usedTools.join(", ") || "none"} · ${Date.now() - t0}ms\n`,
      ),
    );
  } finally {
    await mongoMcp.close();
    if (splunkMcp) await splunkMcp.close();
  }
}
