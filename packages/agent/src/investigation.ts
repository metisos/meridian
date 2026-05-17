/**
 * Investigation orchestrator — the seven-step flow from PRD §7.4.
 *
 * Steps that are deterministic run in TS (event detection, enrichment via
 * Mongo find, causal chain via USC math, blast radius via entity_graph BFS,
 * memory pattern matching via Atlas $vectorSearch, memory write-back). The
 * narrative-synthesis step calls Gemini to produce a structured human-readable
 * explanation grounded in the matched evidence.
 */

import { randomUUID } from "node:crypto";
import type { MongoClient } from "mongodb";
import { ContextSyncClient, type Artifact } from "@meridian/contextsync";
import { type EmbeddingBackend } from "@meridian/usc";
import { GeminiClient } from "./client.js";
import { buildCausalChain, type CausalArtifact, type CausalChain } from "./causalChain.js";
import { computeBlastRadius, type BlastRadius } from "./blastRadius.js";
import { searchMemory, type MemoryHit } from "./memory.js";

const REASONER_ACTOR = "agent-meridian-reasoner";

export interface InvestigationInput {
  /** ctx:// URI of the triggering event */
  trigger_event_uri: string;
  geminiClient: GeminiClient;
  contextSync: ContextSyncClient;
  mongo: MongoClient;
  embeddingBackend: EmbeddingBackend;
  /** Defaults: ± 5 min, ± 1 hop on same host for enrichment */
  enrichment?: {
    window_minutes?: number;
  };
  /** Maximum artifacts to enrich (cap on Mongo find) */
  max_enriched?: number;
}

export interface InvestigationResult {
  investigation_uri: string;
  trigger_event_uri: string;
  root_cause_hypothesis: string;
  confidence: number;
  causal_chain: CausalChain;
  blast_radius: BlastRadius;
  actions_recommended: Array<{ action: string; priority: "critical" | "high" | "medium" | "low" }>;
  similar_past_investigations: MemoryHit[];
  narrative: string;
  latency_ms: number;
}

interface ArtifactDoc extends Artifact {
  usc: {
    spatial: { host?: string; zone?: string; network_hop?: number; lat?: number; lng?: number; rack?: string };
    temporal: string;
    spatial_uncertainty: number;
    temporal_uncertainty_ms: number;
    embedding: number[];
    provenance?: unknown;
    tier?: string;
  };
}

export async function investigate(input: InvestigationInput): Promise<InvestigationResult> {
  const t0 = Date.now();
  const windowMs = (input.enrichment?.window_minutes ?? 5) * 60 * 1000;
  const maxEnriched = input.max_enriched ?? 30;
  const db = input.mongo.db("meridian_db");

  // Step 1: Event detection — fetch the trigger artifact
  const triggerRes = await input.contextSync.getArtifact(REASONER_ACTOR, input.trigger_event_uri);
  const trigger = triggerRes.artifact as ArtifactDoc;
  const triggerHost = trigger.usc.spatial.host;
  const triggerTime = Date.parse(trigger.usc.temporal);

  // Step 2: Context enrichment — find artifacts within ±N min on same/adjacent host
  // Adjacent hosts: same zone if we have one; otherwise just same host
  const enrichedCursor = db.collection<ArtifactDoc>("artifacts").find(
    {
      domain: "splunk-events",
      "usc.temporal": {
        $gte: new Date(triggerTime - windowMs).toISOString(),
        $lte: new Date(triggerTime + windowMs).toISOString(),
      },
      // Same host OR no host filter if host is missing
      ...(triggerHost ? { "usc.spatial.host": triggerHost } : {}),
    },
    {
      projection: { uri: 1, name: 1, "usc.spatial": 1, "usc.temporal": 1, "usc.spatial_uncertainty": 1, "usc.temporal_uncertainty_ms": 1 },
      limit: maxEnriched,
    },
  );
  const enriched = (await enrichedCursor.toArray()) as Array<Pick<ArtifactDoc, "uri" | "name" | "usc">>;

  // Make sure the trigger itself is in the set
  if (!enriched.find((e) => e.uri === trigger.uri)) {
    enriched.unshift({ uri: trigger.uri, name: trigger.name, usc: trigger.usc });
  }

  // Step 3: Pattern matching — vector search agent_memory using trigger's embedding
  const similarPast = await searchMemory(db, trigger.usc.embedding, 3);

  // Step 4: Causal chain construction
  const causalArtifacts: CausalArtifact[] = enriched.map((e) => ({
    uri: e.uri,
    name: e.name,
    usc: {
      spatial: e.usc.spatial,
      temporal: e.usc.temporal,
      spatial_uncertainty: e.usc.spatial_uncertainty,
      temporal_uncertainty_ms: e.usc.temporal_uncertainty_ms,
    },
  }));
  const chain = buildCausalChain(causalArtifacts);

  // Step 5: Blast radius assessment
  const blast = await computeBlastRadius(db, triggerHost ?? trigger.uri);

  // Step 6: Narrative generation via Gemini
  const narrativeRaw = await synthesizeNarrative(input.geminiClient, {
    trigger,
    enriched,
    chain,
    blast,
    similarPast,
  });

  // Parse the structured response (root cause + recommendations) out of the JSON
  const parsed = parseNarrativeJson(narrativeRaw);

  // Step 7: Memory write-back — create investigation ContextSync artifact + agent_memory record
  const investigationId = `inv_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}_${randomUUID().slice(0, 8)}`;
  const investigation_uri = `ctx://meridian/investigations/${investigationId}`;

  // Embed the narrative for future memory lookups
  const [narrativeEmbedding] = await input.embeddingBackend.embedBatch(
    [parsed.root_cause_hypothesis],
    "document",
  );

  await input.contextSync.createArtifact(REASONER_ACTOR, {
    uri: investigation_uri,
    name: parsed.root_cause_hypothesis.slice(0, 100),
    content_type: "application/json",
    summary: `investigation triggered by ${input.trigger_event_uri}`,
    content: {
      trigger_event_uri: input.trigger_event_uri,
      root_cause_hypothesis: parsed.root_cause_hypothesis,
      confidence: chain.chain_confidence,
      causal_chain: chain,
      blast_radius: blast,
      actions_recommended: parsed.actions_recommended,
      similar_past_investigations: similarPast,
      narrative: narrativeRaw,
    },
    usc: {
      spatial: trigger.usc.spatial,
      temporal: new Date().toISOString(),
      spatial_uncertainty: trigger.usc.spatial_uncertainty,
      temporal_uncertainty_ms: 1000,
      provenance: { source_system: "meridian-agent", fidelity: "high", capture_method: "gemini-3.1-pro-preview" },
      tier: "cognitive",
      embedding: narrativeEmbedding!,
    },
  });

  // Also write a denormalized record into agent_memory for future vector lookup
  await db.collection("agent_memory").insertOne({
    investigation_uri,
    created_at: new Date().toISOString(),
    trigger_artifact_uri: input.trigger_event_uri,
    root_cause_hypothesis: parsed.root_cause_hypothesis,
    confidence: chain.chain_confidence,
    causal_chain: chain.ordered.map((a, i) => ({ artifact_uri: a.uri, position: i, label: a.name, usc_temporal: a.usc.temporal })),
    blast_radius: blast,
    actions_recommended: parsed.actions_recommended,
    embedding: narrativeEmbedding,
  });

  return {
    investigation_uri,
    trigger_event_uri: input.trigger_event_uri,
    root_cause_hypothesis: parsed.root_cause_hypothesis,
    confidence: chain.chain_confidence,
    causal_chain: chain,
    blast_radius: blast,
    actions_recommended: parsed.actions_recommended,
    similar_past_investigations: similarPast,
    narrative: narrativeRaw,
    latency_ms: Date.now() - t0,
  };
}

// ---------- Helpers ----------

interface NarrativePayload {
  trigger: ArtifactDoc;
  enriched: Array<Pick<ArtifactDoc, "uri" | "name" | "usc">>;
  chain: CausalChain;
  blast: BlastRadius;
  similarPast: MemoryHit[];
}

async function synthesizeNarrative(agent: GeminiClient, p: NarrativePayload): Promise<string> {
  const sys = `You are Meridian's incident-investigation agent. You produce structured
incident narratives grounded in evidence from ContextSync artifacts. Every claim
you make MUST be traceable to a specific ctx:// URI in the evidence. Output
strict JSON matching this shape:

{
  "root_cause_hypothesis": "2-3 sentence natural-language explanation",
  "actions_recommended": [
    { "action": "string", "priority": "critical|high|medium|low" }
  ]
}

Do NOT call any tools. Synthesize from the evidence I provide directly.`;

  const evidence = {
    trigger: {
      uri: p.trigger.uri,
      name: p.trigger.name,
      content: p.trigger.content,
      usc: { temporal: p.trigger.usc.temporal, spatial: p.trigger.usc.spatial },
    },
    enriched_events: p.enriched.map((e) => ({
      uri: e.uri,
      name: e.name,
      usc_temporal: e.usc.temporal,
      usc_host: e.usc.spatial.host,
    })),
    causal_chain: {
      ordered_uris: p.chain.ordered.map((a) => a.uri),
      links: p.chain.links,
      chain_confidence: p.chain.chain_confidence,
    },
    blast_radius: {
      root_entity: p.blast.root_entity_uri,
      infrastructure: p.blast.infrastructure.map((i) => `${i.name} (${i.entity_type})`),
      business: p.blast.business.map((i) => `${i.name} (${i.entity_type})`),
      compliance: p.blast.compliance.map((i) => `${i.name} (${i.entity_type})`),
    },
    similar_past_investigations: p.similarPast,
  };

  const prompt = `Trigger event URI: ${p.trigger.uri}

Evidence (JSON):
${JSON.stringify(evidence, null, 2)}

Produce the structured incident narrative now. Respond with ONLY the JSON object — no markdown, no preamble.`;

  // 1 = effectively no tool calling (model just synthesizes); 0 logs a warning
  const result = await agent.ask(prompt, { systemInstruction: sys, model: "gemini-flash-latest", maximumRemoteCalls: 1 });
  return result.text;
}

function parseNarrativeJson(raw: string): {
  root_cause_hypothesis: string;
  actions_recommended: Array<{ action: string; priority: "critical" | "high" | "medium" | "low" }>;
} {
  // Strip code-fence wrappers if present
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(cleaned);
    return {
      root_cause_hypothesis:
        typeof parsed.root_cause_hypothesis === "string"
          ? parsed.root_cause_hypothesis
          : "(no hypothesis produced)",
      actions_recommended: Array.isArray(parsed.actions_recommended)
        ? parsed.actions_recommended.filter(
            (a: { action?: unknown; priority?: unknown }) =>
              typeof a.action === "string" &&
              ["critical", "high", "medium", "low"].includes(String(a.priority)),
          )
        : [],
    };
  } catch {
    return {
      root_cause_hypothesis: raw.slice(0, 300),
      actions_recommended: [],
    };
  }
}
