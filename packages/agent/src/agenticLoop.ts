/**
 * AgenticLoop — manually-driven multi-step agent loop in the Claude style.
 *
 * Differences from Gemini's built-in automaticFunctionCalling:
 *   1. We register THREE meta-tools (list_tools, search_tools, call_tool)
 *      instead of stuffing every MCP tool into context. The model discovers
 *      tools on demand. Keeps context small even with many MCP servers.
 *   2. We drive the loop step-by-step in TS so we can log each call,
 *      enforce per-tool guardrails, and surface partial state to the caller.
 *   3. We yield each step as a structured event so the CLI can stream it.
 *
 * Tradeoff: one extra LLM round trip when the model has to "discover" a tool
 * via list_tools/search_tools. In practice the model learns the toolset in 1-2
 * turns and stays inside it for the rest of the conversation.
 */

import type { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import {
  GoogleGenAI,
  type Content,
  type FunctionCall,
  type FunctionDeclaration,
  Type,
} from "@google/genai";

export interface AgenticLoopOptions {
  /** API-key auth (Google AI Studio / generativelanguage). Ignored when vertexai=true. */
  apiKey?: string;
  /** Vertex AI mode — uses ADC, no API key. Requires project + location. */
  vertexai?: boolean;
  project?: string;
  location?: string;
  /** Map of MCP server name → connected MCP client. The model addresses servers by these names. */
  mcpClients: Record<string, McpClient>;
  model?: string;
  /** Max iterations before forcing the loop to stop. Default 12. */
  maxSteps?: number;
  /** Optional cache to avoid re-fetching tool lists repeatedly per server. */
  cacheTools?: boolean;
}

export type StepEvent =
  | { kind: "model_text"; text: string; step: number }
  | { kind: "tool_call"; name: string; args: Record<string, unknown>; step: number }
  | { kind: "tool_result"; name: string; result: unknown; latencyMs: number; step: number }
  | { kind: "final"; text: string; steps: number; usedTools: string[] };

export interface RunOptions {
  systemInstruction?: string;
  /** Receives every step event as it happens (logs, UI, etc.). */
  onEvent?: (event: StepEvent) => void;
}

export interface RunResult {
  text: string;
  steps: number;
  usedTools: string[];
  conversation: Content[];
}

const META_TOOLS: FunctionDeclaration[] = [
  {
    name: "list_tools",
    description:
      "List the tools exposed by a specific MCP server. Use this FIRST to discover what each server can do before calling call_tool. Returns tool names and brief descriptions only — call list_tool_details if you need the input schema.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        server: { type: Type.STRING, description: "Name of the MCP server (one of the registered servers)" },
      },
      required: ["server"],
    },
  },
  {
    name: "search_tools",
    description:
      "Search for tools across ALL MCP servers whose name or description matches the query string. Returns matches with server, name, and description. Use this when you're not sure which server has the capability you need.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "Substring or keyword to match against tool names and descriptions (case-insensitive)" },
      },
      required: ["query"],
    },
  },
  {
    name: "list_tool_details",
    description:
      "Fetch the full input schema for a specific tool. Use this when you have a tool name and need to know what arguments it accepts.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        server: { type: Type.STRING, description: "Name of the MCP server" },
        name: { type: Type.STRING, description: "Tool name as returned by list_tools" },
      },
      required: ["server", "name"],
    },
  },
  {
    name: "call_tool",
    description:
      "Invoke a tool on an MCP server. Look up the tool's required arguments with list_tool_details first if unsure. Returns the tool's response.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        server: { type: Type.STRING, description: "Name of the MCP server hosting the tool" },
        name: { type: Type.STRING, description: "Tool name" },
        arguments: {
          type: Type.OBJECT,
          description: "Arguments object to pass to the tool. Schema depends on the specific tool.",
          properties: {},
        },
      },
      required: ["server", "name", "arguments"],
    },
  },
];

export class AgenticLoop {
  private genai: GoogleGenAI;
  private model: string;
  private maxSteps: number;
  private mcp: Record<string, McpClient>;
  private toolCache: Map<string, Array<{ name: string; description: string }>> = new Map();
  private cacheEnabled: boolean;

  constructor(opts: AgenticLoopOptions) {
    if (opts.vertexai) {
      if (!opts.project || !opts.location) {
        throw new Error("AgenticLoop vertexai mode requires project + location");
      }
      this.genai = new GoogleGenAI({ vertexai: true, project: opts.project, location: opts.location });
    } else {
      if (!opts.apiKey) throw new Error("AgenticLoop requires apiKey when vertexai is false");
      this.genai = new GoogleGenAI({ apiKey: opts.apiKey });
    }
    this.model = opts.model ?? "gemini-flash-latest";
    this.maxSteps = opts.maxSteps ?? 12;
    this.mcp = opts.mcpClients;
    this.cacheEnabled = opts.cacheTools ?? true;
  }

  async run(prompt: string, options: RunOptions = {}): Promise<RunResult> {
    const conversation: Content[] = [{ role: "user", parts: [{ text: prompt }] }];
    const usedTools = new Set<string>();
    let step = 0;
    let lastText = "";

    while (step < this.maxSteps) {
      step++;
      const response = await this.genai.models.generateContent({
        model: this.model,
        contents: conversation,
        config: {
          tools: [{ functionDeclarations: META_TOOLS }],
          ...(options.systemInstruction ? { systemInstruction: options.systemInstruction } : {}),
        },
      });

      const candidate = response.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];
      const text = response.text ?? "";
      if (text) lastText = text;

      // Echo any text from the model first
      if (text) options.onEvent?.({ kind: "model_text", text, step });

      // Collect function calls
      const calls: FunctionCall[] = [];
      for (const p of parts) {
        if (p.functionCall) calls.push(p.functionCall);
      }

      // Append model turn to conversation
      conversation.push({ role: "model", parts });

      if (calls.length === 0) {
        // Model produced a final answer with no further tool calls
        const result: RunResult = {
          text: lastText,
          steps: step,
          usedTools: [...usedTools],
          conversation,
        };
        options.onEvent?.({ kind: "final", text: lastText, steps: step, usedTools: [...usedTools] });
        return result;
      }

      // Execute calls and append responses
      const responseParts: Content["parts"] = [];
      for (const call of calls) {
        const name = call.name ?? "";
        const args = (call.args ?? {}) as Record<string, unknown>;
        usedTools.add(this.qualifiedToolName(name, args));
        options.onEvent?.({ kind: "tool_call", name, args, step });

        const t0 = Date.now();
        let toolResponse: unknown;
        try {
          toolResponse = await this.executeMetaTool(name, args);
        } catch (err) {
          toolResponse = { error: err instanceof Error ? err.message : String(err) };
        }
        const latencyMs = Date.now() - t0;
        options.onEvent?.({ kind: "tool_result", name, result: toolResponse, latencyMs, step });

        responseParts.push({
          functionResponse: {
            name,
            response: toolResponse as Record<string, unknown>,
          },
        });
      }
      conversation.push({ role: "user", parts: responseParts });
    }

    // Hit step limit — return whatever we have
    return {
      text: lastText || `(reached max ${this.maxSteps} steps without final answer)`,
      steps: step,
      usedTools: [...usedTools],
      conversation,
    };
  }

  private qualifiedToolName(metaTool: string, args: Record<string, unknown>): string {
    if (metaTool === "call_tool" && typeof args.server === "string" && typeof args.name === "string") {
      return `${args.server}.${args.name}`;
    }
    return metaTool;
  }

  private async fetchTools(server: string): Promise<Array<{ name: string; description: string }>> {
    if (this.cacheEnabled && this.toolCache.has(server)) return this.toolCache.get(server)!;
    const client = this.mcp[server];
    if (!client) throw new Error(`unknown MCP server "${server}". Available: ${Object.keys(this.mcp).join(", ")}`);
    const list = await client.listTools();
    const summary = list.tools.map((t) => ({ name: t.name, description: t.description ?? "" }));
    if (this.cacheEnabled) this.toolCache.set(server, summary);
    return summary;
  }

  private async executeMetaTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case "list_tools": {
        const server = String(args.server);
        return { server, tools: await this.fetchTools(server) };
      }
      case "search_tools": {
        const q = String(args.query ?? "").toLowerCase();
        const out: Array<{ server: string; name: string; description: string }> = [];
        for (const server of Object.keys(this.mcp)) {
          const tools = await this.fetchTools(server);
          for (const t of tools) {
            if (t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)) {
              out.push({ server, name: t.name, description: t.description });
            }
          }
        }
        return { query: q, matches: out };
      }
      case "list_tool_details": {
        const server = String(args.server);
        const toolName = String(args.name);
        const client = this.mcp[server];
        if (!client) throw new Error(`unknown server "${server}"`);
        const list = await client.listTools();
        const tool = list.tools.find((t) => t.name === toolName);
        if (!tool) throw new Error(`tool "${toolName}" not found on server "${server}"`);
        return { name: tool.name, description: tool.description, inputSchema: tool.inputSchema };
      }
      case "call_tool": {
        const server = String(args.server);
        const toolName = String(args.name);
        const toolArgs = (args.arguments ?? {}) as Record<string, unknown>;
        const client = this.mcp[server];
        if (!client) throw new Error(`unknown server "${server}"`);
        const result = await client.callTool({ name: toolName, arguments: toolArgs });
        return result;
      }
      default:
        throw new Error(`unknown meta-tool "${name}"`);
    }
  }
}
