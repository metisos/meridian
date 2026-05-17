import "server-only";
import { getDb } from "./mongo";
import type {
  FeedData,
  Investigation,
  Operator,
  ProvenanceTail,
  Severity,
  Status,
  DashboardCounters,
} from "./types";

interface RawInvestigation {
  investigation_uri: string;
  created_at: string;
  trigger_artifact_uri?: string;
  root_cause_hypothesis: string;
  confidence: number;
  causal_chain?: Investigation["causal_chain"];
  blast_radius?: Partial<Investigation["blast_radius"]>;
  actions_recommended?: Investigation["actions_recommended"];
  similar_past_investigations?: Investigation["similar_past_investigations"];
  resolution_time_minutes?: number;
}

function inferSeverity(confidence: number, totalAffected: number): Severity {
  if (confidence >= 0.85 && totalAffected >= 3) return "critical";
  if (confidence >= 0.7 || totalAffected >= 2) return "high";
  if (confidence >= 0.4) return "medium";
  return "low";
}

function inferStatus(createdAt: string, resolved?: number): Status {
  if (resolved !== undefined && resolved > 0) return "resolved";
  const ageMs = Date.now() - Date.parse(createdAt);
  if (ageMs < 60 * 60_000) return "open";
  return "monitoring";
}

function normalize(rec: RawInvestigation): Investigation {
  const blast = rec.blast_radius ?? {};
  const total =
    blast.total_affected ??
    (blast.infrastructure?.length ?? 0) +
      (blast.business?.length ?? 0) +
      (blast.compliance?.length ?? 0);
  return {
    investigation_uri: rec.investigation_uri,
    created_at: rec.created_at,
    trigger_artifact_uri: rec.trigger_artifact_uri ?? "",
    root_cause_hypothesis: rec.root_cause_hypothesis,
    confidence: rec.confidence,
    severity: inferSeverity(rec.confidence, total),
    status: inferStatus(rec.created_at, rec.resolution_time_minutes),
    causal_chain: rec.causal_chain ?? [],
    blast_radius: {
      root_entity_uri: blast.root_entity_uri ?? null,
      infrastructure: blast.infrastructure ?? [],
      business: blast.business ?? [],
      compliance: blast.compliance ?? [],
      total_affected: total,
    },
    actions_recommended: rec.actions_recommended ?? [],
    similar_past_investigations: rec.similar_past_investigations ?? [],
  };
}

export async function fetchInvestigations(limit = 50): Promise<Investigation[]> {
  const db = await getDb();
  const rows = (await db
    .collection("agent_memory")
    .find({})
    .sort({ created_at: -1 })
    .limit(limit)
    .toArray()) as unknown as RawInvestigation[];
  return rows.map(normalize);
}

export async function fetchOperators(): Promise<Operator[]> {
  const db = await getDb();
  const rows = (await db
    .collection("actors")
    .find({ actor_type: "agent" })
    .toArray()) as unknown as Array<{ actor_id: string; name: string; agent_class?: string | null }>;
  return rows.map((d) => ({
    actor_id: d.actor_id,
    name: d.name.replace(/^Meridian /i, ""),
    agent_class: d.agent_class ?? null,
    state: "active",
  }));
}

export async function fetchProvenanceTail(limit = 10): Promise<ProvenanceTail[]> {
  const db = await getDb();
  const rows = (await db
    .collection("provenance")
    .find({})
    .sort({ created_at: -1 })
    .limit(limit)
    .toArray()) as unknown as ProvenanceTail[];
  return rows.map((r) => ({
    prov_id: r.prov_id,
    actor_id: r.actor_id,
    operation: r.operation,
    artifact_uri: r.artifact_uri,
    created_at: r.created_at,
  }));
}

export async function fetchCounters(): Promise<DashboardCounters> {
  const db = await getDb();
  const since24h = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const sinceLastHour = new Date(Date.now() - 60 * 60_000).toISOString();
  const [
    artifacts_total,
    investigations_total,
    active_open,
    opened_last_hour,
    events_last_24h,
  ] = await Promise.all([
    db.collection("artifacts").estimatedDocumentCount(),
    db.collection("agent_memory").estimatedDocumentCount(),
    // active_open = unresolved investigations (no resolution_time_minutes recorded
    // or recorded as <= 0). This matches the inferStatus() logic used elsewhere
    // in the UI, so the KPI agrees with the Needs-Your-Attention list.
    db.collection("agent_memory").countDocuments({
      $or: [
        { resolution_time_minutes: { $exists: false } },
        { resolution_time_minutes: { $lte: 0 } },
        { resolution_time_minutes: null },
      ],
    }),
    db.collection("agent_memory").countDocuments({
      created_at: { $gte: sinceLastHour },
    }),
    db.collection("provenance").countDocuments({
      operation: "write",
      created_at: { $gte: since24h },
    }),
  ]);
  return { artifacts_total, investigations_total, active_open, opened_last_hour, events_last_24h };
}

export async function fetchFeed(): Promise<FeedData> {
  const [investigations, operators, recent_provenance, counters] = await Promise.all([
    fetchInvestigations(50),
    fetchOperators(),
    fetchProvenanceTail(50),
    fetchCounters(),
  ]);
  return { investigations, operators, recent_provenance, counters };
}
