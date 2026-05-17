import type { Investigation } from "./types";

export type PatternKind = "root-entity" | "keyword" | "entity-overlap" | "severity-burst";

export interface Pattern {
  kind: PatternKind;
  text: string;
  detail: string;
  references: Array<{ uri: string; short_id: string }>;
}

const KEYWORD_GROUPS: Array<{ label: string; regex: RegExp }> = [
  { label: "UpstreamSlowResponse cascade", regex: /upstream\s*slow|upstream_slow|service-?\s*latency/i },
  { label: "connection pool exhaustion", regex: /connection\s*pool|exhaust/i },
  { label: "role revocation pattern", regex: /role\s*revocation|access\s*control|privilege/i },
  { label: "auth brute-force pattern", regex: /brute[- ]?force|repeated\s*failed\s*login/i },
  { label: "data exfiltration pattern", regex: /exfil|large\s*outbound|data\s*staging/i },
  { label: "DDoS surge pattern", regex: /ddos|distributed\s*denial|traffic\s*surge/i },
];

const RECENT_WINDOW_HOURS = 48;
const ENTITY_OVERLAP_THRESHOLD = 0.4;

function shortId(uri: string): string {
  return uri.split("/").pop() ?? uri;
}

function allEntityUris(inv: Investigation): Set<string> {
  const s = new Set<string>();
  if (inv.blast_radius.root_entity_uri) s.add(inv.blast_radius.root_entity_uri);
  for (const e of inv.blast_radius.infrastructure) s.add(e.uri);
  for (const e of inv.blast_radius.business) s.add(e.uri);
  for (const e of inv.blast_radius.compliance) s.add(e.uri);
  return s;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function withinHours(iso: string, otherIso: string, hours: number): boolean {
  const dt = Math.abs(Date.parse(iso) - Date.parse(otherIso));
  return dt <= hours * 60 * 60_000;
}

export function detectPatterns(
  subject: Investigation,
  population: Investigation[],
): Pattern[] {
  const others = population.filter((i) => i.investigation_uri !== subject.investigation_uri);
  const patterns: Pattern[] = [];

  // 1. Same root entity
  if (subject.blast_radius.root_entity_uri) {
    const matches = others.filter(
      (o) => o.blast_radius.root_entity_uri === subject.blast_radius.root_entity_uri,
    );
    if (matches.length > 0) {
      const rootName = shortId(subject.blast_radius.root_entity_uri);
      patterns.push({
        kind: "root-entity",
        text: `Same root entity as ${matches.length} other investigation${matches.length === 1 ? "" : "s"}`,
        detail: `Root entity ${rootName} has been the trigger ${matches.length + 1} times in agent memory.`,
        references: matches
          .slice(0, 4)
          .map((m) => ({ uri: m.investigation_uri, short_id: shortId(m.investigation_uri) })),
      });
    }
  }

  // 2. Keyword cascade — find archetype in subject hypothesis, count occurrences in 48h
  const text = subject.root_cause_hypothesis;
  for (const group of KEYWORD_GROUPS) {
    if (!group.regex.test(text)) continue;
    const sameGroup = others.filter(
      (o) =>
        group.regex.test(o.root_cause_hypothesis) &&
        withinHours(subject.created_at, o.created_at, RECENT_WINDOW_HOURS),
    );
    if (sameGroup.length > 0) {
      const total = sameGroup.length + 1;
      patterns.push({
        kind: "keyword",
        text: `${ordinal(total)} ${group.label} in ${RECENT_WINDOW_HOURS}h`,
        detail: `${total - 1} prior incident${total - 1 === 1 ? "" : "s"} of this archetype within the last ${RECENT_WINDOW_HOURS} hours.`,
        references: sameGroup
          .slice(0, 4)
          .map((m) => ({ uri: m.investigation_uri, short_id: shortId(m.investigation_uri) })),
      });
    }
    break; // one keyword archetype is enough
  }

  // 3. Entity overlap (Jaccard ≥ 0.4)
  const subjEntities = allEntityUris(subject);
  if (subjEntities.size > 0) {
    const scored = others
      .map((o) => ({ o, score: jaccard(subjEntities, allEntityUris(o)) }))
      .filter(({ score }) => score >= ENTITY_OVERLAP_THRESHOLD)
      .sort((a, b) => b.score - a.score);
    if (scored.length > 0 && !patterns.some((p) => p.kind === "root-entity")) {
      const top = scored[0]!;
      patterns.push({
        kind: "entity-overlap",
        text: `Shares ${Math.round(top.score * 100)}% of affected entities with ${shortId(top.o.investigation_uri)}`,
        detail: `Entity-overlap suggests these investigations are touching the same blast-radius surface.`,
        references: scored
          .slice(0, 4)
          .map(({ o }) => ({ uri: o.investigation_uri, short_id: shortId(o.investigation_uri) })),
      });
    }
  }

  // 4. Severity burst — multiple critical/high in 48h
  if (subject.severity === "critical" || subject.severity === "high") {
    const burst = others.filter(
      (o) =>
        (o.severity === "critical" || o.severity === "high") &&
        withinHours(subject.created_at, o.created_at, RECENT_WINDOW_HOURS),
    );
    if (burst.length >= 1) {
      patterns.push({
        kind: "severity-burst",
        text: `${burst.length + 1} critical/high incidents in last ${RECENT_WINDOW_HOURS}h`,
        detail: `This is part of a cluster of ${burst.length + 1} elevated-severity investigations within ${RECENT_WINDOW_HOURS} hours.`,
        references: burst
          .slice(0, 4)
          .map((m) => ({ uri: m.investigation_uri, short_id: shortId(m.investigation_uri) })),
      });
    }
  }

  return patterns;
}

function ordinal(n: number): string {
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  if (n === 1) return "1st";
  return `${n}th`;
}
