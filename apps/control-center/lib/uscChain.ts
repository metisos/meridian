import "server-only";
import { getDb } from "./mongo";
import { fetchInvestigations } from "./queries";
import { crossTierMatch, DEFAULT_R_S, DEFAULT_R_T_MS, type MatchResult, type USC } from "./uscMatch";
import type { CausalStep } from "./types";

export interface CorrelationEvent extends CausalStep {
  usc: USC | null;
  /** Match score against the trigger event (causal_chain[0]). null when either side has no USC. */
  match_vs_trigger: MatchResult | null;
}

export interface CorrelationLink {
  from_uri: string;
  to_uri: string;
  match: MatchResult;
}

export interface CorrelationData {
  investigation_uri: string;
  events: CorrelationEvent[];
  links: CorrelationLink[];
  bandwidth: {
    r_s: number;
    r_t_ms: number;
  };
}

interface ArtifactDoc {
  uri: string;
  usc?: USC;
}

export async function fetchCorrelation(investigationUri: string): Promise<CorrelationData | null> {
  const investigations = await fetchInvestigations(200);
  const inv = investigations.find((i) => i.investigation_uri === investigationUri);
  if (!inv) return null;
  const chain = inv.causal_chain;

  const db = await getDb();
  const uris = chain.map((s) => s.artifact_uri);
  const rows = (await db
    .collection("artifacts")
    .find({ uri: { $in: uris } })
    .project({ uri: 1, usc: 1 })
    .toArray()) as unknown as ArtifactDoc[];

  const uscByUri = new Map<string, USC>();
  for (const r of rows) {
    if (r.usc && r.usc.temporal) uscByUri.set(r.uri, r.usc);
  }

  const trigger = chain[0];
  const triggerUsc = trigger ? uscByUri.get(trigger.artifact_uri) ?? null : null;

  const events: CorrelationEvent[] = chain.map((step) => {
    const usc = uscByUri.get(step.artifact_uri) ?? null;
    const match_vs_trigger =
      triggerUsc && usc ? crossTierMatch(triggerUsc, usc) : null;
    return { ...step, usc, match_vs_trigger };
  });

  const links: CorrelationLink[] = [];
  for (let i = 1; i < chain.length; i++) {
    const a = uscByUri.get(chain[i - 1]!.artifact_uri);
    const b = uscByUri.get(chain[i]!.artifact_uri);
    if (!a || !b) continue;
    links.push({
      from_uri: chain[i - 1]!.artifact_uri,
      to_uri: chain[i]!.artifact_uri,
      match: crossTierMatch(a, b),
    });
  }

  return {
    investigation_uri: investigationUri,
    events,
    links,
    bandwidth: { r_s: DEFAULT_R_S, r_t_ms: DEFAULT_R_T_MS },
  };
}
