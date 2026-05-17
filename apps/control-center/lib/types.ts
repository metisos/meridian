/** Domain types — what the UI consumes. Pure shapes, no values. */

export type Severity = "critical" | "high" | "medium" | "low";
export type Status = "open" | "monitoring" | "resolved";

export interface CausalStep {
  artifact_uri: string;
  position: number;
  label: string;
  usc_temporal: string; // ISO 8601
}

export interface BlastEntity {
  uri: string;
  name: string;
  entity_type: string;
  distance: number;
}

export interface BlastRadius {
  root_entity_uri: string | null;
  infrastructure: BlastEntity[];
  business: BlastEntity[];
  compliance: BlastEntity[];
  total_affected: number;
}

export interface ActionItem {
  action: string;
  priority: "critical" | "high" | "medium" | "low";
}

export interface SimilarMatch {
  investigation_uri: string;
  similarity: number;
  root_cause_hypothesis?: string;
  resolution_time_minutes?: number;
}

export interface Investigation {
  investigation_uri: string;
  created_at: string; // ISO 8601
  trigger_artifact_uri: string;
  root_cause_hypothesis: string;
  confidence: number;
  severity: Severity;
  status: Status;
  causal_chain: CausalStep[];
  blast_radius: BlastRadius;
  actions_recommended: ActionItem[];
  similar_past_investigations: SimilarMatch[];
}

export interface Operator {
  actor_id: string;
  name: string;
  agent_class: string | null;
  state: "active" | "idle";
}

export interface ProvenanceTail {
  prov_id: string;
  actor_id: string;
  operation: "read" | "write";
  artifact_uri: string;
  created_at: string;
}

export interface DashboardCounters {
  artifacts_total: number;
  investigations_total: number;
  /** Unresolved investigations (no resolution_time_minutes recorded). */
  active_open: number;
  /** Investigations created in the last 60 minutes. */
  opened_last_hour: number;
  events_last_24h: number;
}

export interface FeedData {
  investigations: Investigation[];
  operators: Operator[];
  recent_provenance: ProvenanceTail[];
  counters: DashboardCounters;
}
