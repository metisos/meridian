/**
 * GeminiClient — wraps @google/genai and orchestrates MCP-tool-using model calls.
 *
 * Supports both auth modes:
 *   - Vertex AI (primary in production): uses ADC, bills through GCP project
 *   - API key (fallback): for hackathon demos when ADC isn't available
 *
 * Models used in Meridian:
 *   - gemini-3.1-pro-preview     reasoning (investigation, narrative) — Vertex/global
 *   - gemini-2.5-flash           light/chat tasks — Vertex/us-central1
 *   - gemini-flash-latest        API-key path equivalent (resolves to gemini-3-flash)
 */

import { GoogleGenAI, mcpToTool } from "@google/genai";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

export interface GeminiClientOptions {
  /** API-key auth (Google AI Studio). Ignored when vertexai=true. */
  apiKey?: string;
  /** Vertex AI mode — uses ADC, no API key. */
  vertexai?: boolean;
  project?: string;
  /** Required when vertexai=true. "global" for Gemini 3.1 Pro; "us-central1" for 2.5. */
  location?: string;
  /** Default model for one-shot `ask`. Override per-call if needed. */
  defaultModel?: string;
  /** MCP clients to expose as tools. */
  mcpClients?: Client[];
}

export interface AskOptions {
  model?: string;
  systemInstruction?: string;
  /** Cap on automatic tool-call rounds (per @google/genai). Default 12. */
  maximumRemoteCalls?: number;
}

export interface AskResult {
  text: string;
  /** Raw response object for callers who need usage metadata, tool traces, etc. */
  raw: unknown;
}

export class GeminiClient {
  private genai: GoogleGenAI;
  private mcpClients: Client[];
  private defaultModel: string;

  constructor(opts: GeminiClientOptions) {
    if (opts.vertexai) {
      if (!opts.project || !opts.location) {
        throw new Error("GeminiClient vertexai mode requires project + location");
      }
      this.genai = new GoogleGenAI({ vertexai: true, project: opts.project, location: opts.location });
    } else {
      if (!opts.apiKey) throw new Error("GeminiClient requires apiKey when vertexai is false");
      this.genai = new GoogleGenAI({ apiKey: opts.apiKey });
    }
    this.mcpClients = opts.mcpClients ?? [];
    this.defaultModel = opts.defaultModel ?? "gemini-3.1-pro-preview";
  }

  async ask(prompt: string, opts: AskOptions = {}): Promise<AskResult> {
    const tools =
      this.mcpClients.length > 0
        ? [
            mcpToTool(
              ...(this.mcpClients as unknown as [
                ...Parameters<typeof mcpToTool>[0] extends [...infer R, infer _]
                  ? R
                  : never,
                Parameters<typeof mcpToTool>[0] extends [...infer _, infer L] ? L : never,
              ]),
            ),
          ]
        : [];

    const response = await this.genai.models.generateContent({
      model: opts.model ?? this.defaultModel,
      contents: prompt,
      config: {
        tools,
        automaticFunctionCalling: {
          maximumRemoteCalls: opts.maximumRemoteCalls ?? 12,
        },
        ...(opts.systemInstruction ? { systemInstruction: opts.systemInstruction } : {}),
      },
    });

    return { text: response.text ?? "", raw: response };
  }
}
