import "server-only";
import { getGenAI } from "./gemini";
import { env } from "./env";
import type { Investigation } from "./types";

/* In-process cache keyed by investigation_uri.
   Lives for the life of the Node process — fine for demo, and
   protects us from re-prompting Gemini on every page render. */
const cache = new Map<string, string>();

function summarizeBlast(inv: Investigation): string {
  const br = inv.blast_radius;
  const parts: string[] = [];
  if (br.infrastructure.length > 0) {
    parts.push(
      `${br.infrastructure.length} infrastructure: ${br.infrastructure
        .slice(0, 4)
        .map((e) => e.name)
        .join(", ")}`,
    );
  }
  if (br.business.length > 0) {
    parts.push(
      `${br.business.length} business: ${br.business
        .slice(0, 4)
        .map((e) => e.name)
        .join(", ")}`,
    );
  }
  if (br.compliance.length > 0) {
    parts.push(
      `${br.compliance.length} compliance: ${br.compliance
        .slice(0, 4)
        .map((e) => e.name)
        .join(", ")}`,
    );
  }
  return parts.join(" · ") || "no entities affected";
}

const SYSTEM_PROMPT = `
You are a CISO chief of staff. Given a security/operations investigation,
write exactly ONE complete sentence describing the business consequence.

HARD CONSTRAINTS:
- One sentence. Begins with a capital letter and ends with a period.
- 16–28 words. Not more. Not fewer.
- No bullet points. No lists. No newlines. No markdown formatting.
- No quotes around the sentence.
- No technical URIs, no ctx://, no inv_ ids, no evt_ ids.
- No labels like "Impact:" or "Summary:".
- Plain prose only.

CONTENT:
- Lead with the consequence (the "so what"), not the cause.
- Mention specific SLA, customer, revenue, or compliance impact when data supports it.
- Use concrete numbers from the investigation when present.
- CISO voice — direct and unemotional. No marketing language. No emoji.

Output the sentence. Nothing else.
`.trim();

export async function fetchBusinessImpact(inv: Investigation): Promise<string> {
  if (cache.has(inv.investigation_uri)) {
    return cache.get(inv.investigation_uri)!;
  }

  const userPrompt = `
Severity: ${inv.severity}    Status: ${inv.status}    Confidence: ${Math.round(inv.confidence * 100)}%
Hypothesis: ${inv.root_cause_hypothesis.slice(0, 800)}
Blast radius: ${summarizeBlast(inv)}
Top actions: ${inv.actions_recommended
    .slice(0, 3)
    .map((a) => `[${a.priority}] ${a.action.slice(0, 120)}`)
    .join(" | ") || "(none)"}
`.trim();

  try {
    const genai = getGenAI();
    const result = await genai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: userPrompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.35,
        maxOutputTokens: 2048,
        // Gemini 3 Pro uses an internal "thinking" budget that can consume the
        // output cap on simple tasks. Disable thinking for one-sentence output.
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    const text = sanitize(result.text ?? "");
    if (text && isWellFormed(text)) {
      cache.set(inv.investigation_uri, text);
      return text;
    }
    console.warn("[businessImpact] Gemini returned malformed output, using fallback:", JSON.stringify(result.text ?? "").slice(0, 200));
  } catch (err) {
    console.error("[businessImpact] Gemini call failed:", err);
  }

  // Fallback when Gemini is unreachable — derive a deterministic line
  const fallback = deriveFallback(inv);
  cache.set(inv.investigation_uri, fallback);
  return fallback;
}

/* Strip whitespace, surrounding quotes, leading "Impact:" labels, list markers. */
function sanitize(raw: string): string {
  let t = raw.trim();
  t = t.replace(/^["'`]+|["'`]+$/g, "");
  t = t.replace(/^(impact|summary|consequence|risk)\s*:\s*/i, "");
  // Strip leading list markers (* - 1.)
  t = t.replace(/^\s*[\*\-•]\s+/, "");
  t = t.replace(/^\s*\d+\.\s+/, "");
  // Collapse internal newlines into single spaces
  t = t.replace(/\s*\n+\s*/g, " ");
  return t.trim();
}

function isWellFormed(s: string): boolean {
  if (s.length < 20) return false;
  if (s.length > 400) return false;
  // Must start with a capital letter or digit
  if (!/^[A-Z0-9]/.test(s)) return false;
  // Must end with a sentence terminator
  if (!/[.!?]$/.test(s)) return false;
  // No bullets or list markers
  if (/^[\*\-•]/.test(s) || /\n[\*\-•]/.test(s)) return false;
  // Word count between 12 and 40 (a touch lax vs. the prompt to allow some drift)
  const words = s.split(/\s+/).filter(Boolean).length;
  return words >= 12 && words <= 40;
}

function deriveFallback(inv: Investigation): string {
  const br = inv.blast_radius;
  const biz = br.business.filter((b) => b.entity_type === "client" || b.entity_type === "sla");
  if (biz.length > 0 && br.compliance.length > 0) {
    return `Customer impact across ${biz.length} business ${biz.length === 1 ? "entity" : "entities"} with ${br.compliance.length} compliance control${br.compliance.length === 1 ? "" : "s"} in scope.`;
  }
  if (biz.length > 0) {
    return `Customer-facing impact across ${biz.length} entit${biz.length === 1 ? "y" : "ies"} including ${biz[0]!.name}.`;
  }
  if (br.compliance.length > 0) {
    return `${br.compliance.length} compliance control${br.compliance.length === 1 ? "" : "s"} in scope; disclosure timer may apply.`;
  }
  return `${br.total_affected} downstream entit${br.total_affected === 1 ? "y" : "ies"} affected; no direct customer or compliance exposure identified.`;
}
