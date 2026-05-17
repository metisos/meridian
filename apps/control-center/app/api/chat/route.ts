import { NextResponse } from "next/server";
import { mcpToTool } from "@google/genai";
import { env } from "@/lib/env";
import { getGenAI } from "@/lib/gemini";
import { buildChatContext } from "@/lib/chatContext";
import { getSplunkMcp } from "@/lib/splunkMcp";
import { prepareAttachments, type IncomingAttachment, type GeminiPart } from "@/lib/attachments";
import { appendProvenance } from "@/lib/provenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface IncomingMessage {
  role: "user" | "assistant";
  content: string;
  attachments?: IncomingAttachment[];
}

interface ChatRequest {
  messages: IncomingMessage[];
}

async function toGenaiHistory(messages: IncomingMessage[]) {
  const out: Array<{ role: "user" | "model"; parts: GeminiPart[] }> = [];
  for (const m of messages) {
    const role = m.role === "assistant" ? "model" : "user";
    const parts: GeminiPart[] = [];

    let prefaceText = "";
    if (m.role === "user" && m.attachments && m.attachments.length > 0) {
      const prepared = await prepareAttachments(m.attachments);
      parts.push(...prepared.parts);
      prefaceText = prepared.prefaceText;
    }
    const textBody = (m.content ?? "") + prefaceText;
    parts.push({ text: textBody });

    out.push({ role, parts });
  }
  return out;
}

export async function POST(req: Request) {
  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "missing_messages" }, { status: 400 });
  }

  const ctx = await buildChatContext();
  const genai = getGenAI();

  // Best-effort attach the Splunk MCP tool surface.
  const splunkClient = await getSplunkMcp();
  const tools = splunkClient ? [mcpToTool(splunkClient)] : [];

  let contents;
  try {
    contents = await toGenaiHistory(body.messages);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "attachments_failed", message: msg }, { status: 400 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, payload: unknown) => {
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
      };

      try {
        send("meta", {
          model: env.GEMINI_MODEL,
          cited: ctx.citedUris,
          tools_available: splunkClient ? ["splunk"] : [],
        });

        // Log a read provenance entry for every investigation the agent will
        // ground this turn on. Fire-and-forget so chat latency is unaffected.
        appendProvenance("agent-meridian-chat", "read", ctx.citedUris, {
          source: "ask-meridian",
          model: env.GEMINI_MODEL,
          tool_surface: splunkClient ? ["splunk"] : [],
        });

        const result = await genai.models.generateContentStream({
          model: env.GEMINI_MODEL,
          contents,
          config: {
            systemInstruction: ctx.systemInstruction,
            temperature: ctx.temperature,
            maxOutputTokens: ctx.maxOutputTokens,
            tools,
            automaticFunctionCalling: { maximumRemoteCalls: 6 },
          },
        });

        for await (const chunk of result) {
          const text = chunk.text ?? "";
          if (text) send("chunk", { text });
        }
        send("done", { ok: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send("error", { message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
