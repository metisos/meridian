import "server-only";
import { getDb } from "./mongo";
import type { Investigation } from "./types";
import { fetchInvestigations, fetchCounters, fetchProvenanceTail } from "./queries";

export type Posture = "stable" | "elevated" | "critical";

export interface OverviewKpi {
  label: string;
  value: string;
  sub?: string;
  delta?: { sign: "up" | "down" | "flat"; text: string };
  emphasis?: "default" | "accent" | "crit";
}

export interface OverviewData {
  posture: {
    level: Posture;
    headline: string;
    body: string;
    asOf: string;
  };
  kpis: OverviewKpi[];
  attention: Investigation[];
  recentActivity: Array<{
    when: string;
    actor: string;
    action: string;
    artifact: string;
  }>;
  artifactsByDay: Array<{ day: string; count: number }>;
  highestSeverity: Investigation | null;
  totals: {
    artifacts: number;
    investigations: number;
    open: number;
  };
}

function inferPosture(open: number, topConfidence: number): Posture {
  if (open >= 3 && topConfidence >= 0.8) return "critical";
  if (open >= 1) return "elevated";
  return "stable";
}

function postureCopy(level: Posture, open: number, topHypothesis: string | null) {
  if (level === "critical") {
    return {
      headline: "Critical posture — immediate attention required",
      body: open === 1 && topHypothesis
        ? `One high-confidence incident open: ${firstSentence(topHypothesis)}`
        : `${open} high-confidence incidents open across the environment. Review the prioritized list below.`,
    };
  }
  if (level === "elevated") {
    return {
      headline: "Elevated posture — under investigation",
      body: topHypothesis
        ? `Active: ${firstSentence(topHypothesis)}`
        : `${open} ${open === 1 ? "incident is" : "incidents are"} being investigated.`,
    };
  }
  return {
    headline: "Stable — no active incidents",
    body: "The agent is monitoring telemetry. Historical investigations remain available in Memory.",
  };
}

function firstSentence(text: string): string {
  const s = text.split(/(?<=[.!?])\s+/)[0] ?? text;
  return s.length > 180 ? s.slice(0, 177) + "…" : s;
}

async function fetchArtifactsByDay(days = 7): Promise<Array<{ day: string; count: number }>> {
  const db = await getDb();
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const rows = (await db
    .collection("artifacts")
    .aggregate([
      { $match: { created_at: { $gte: since } } },
      {
        $group: {
          _id: { $substr: ["$created_at", 0, 10] },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray()) as Array<{ _id: string; count: number }>;

  // Backfill missing days so the sparkline has consistent length
  const out: Array<{ day: string; count: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
    const found = rows.find((r) => r._id === d);
    out.push({ day: d, count: found?.count ?? 0 });
  }
  return out;
}

export async function fetchOverview(): Promise<OverviewData> {
  const [investigations, counters, prov, byDay] = await Promise.all([
    fetchInvestigations(50),
    fetchCounters(),
    fetchProvenanceTail(40),
    fetchArtifactsByDay(7),
  ]);

  const open = investigations.filter((i) => i.status === "open" || i.status === "monitoring");
  const sorted = [...open].sort(
    (a, b) => severityWeight(b.severity) - severityWeight(a.severity) || b.confidence - a.confidence,
  );
  const top = sorted[0] ?? null;
  const postureLevel = inferPosture(open.length, top?.confidence ?? 0);
  const { headline, body } = postureCopy(postureLevel, open.length, top?.root_cause_hypothesis ?? null);

  const avgConf =
    investigations.length === 0
      ? 0
      : investigations.reduce((s, i) => s + i.confidence, 0) / investigations.length;

  const last24h = investigations.filter(
    (i) => Date.now() - Date.parse(i.created_at) < 24 * 60 * 60_000,
  ).length;

  const kpis: OverviewKpi[] = [
    {
      label: "Open incidents",
      value: counters.active_open.toString(),
      sub:
        counters.opened_last_hour > 0
          ? `${counters.opened_last_hour} opened in last hour`
          : "no new in last hour",
      emphasis: counters.active_open > 0 ? "accent" : "default",
    },
    {
      label: "Investigations · 24h",
      value: last24h.toString(),
      sub: `${counters.investigations_total.toLocaleString()} total in memory`,
    },
    {
      label: "Avg confidence",
      value: `${Math.round(avgConf * 100)}%`,
      sub: "across last 50 investigations",
    },
    {
      label: "Artifacts ingested",
      value: counters.artifacts_total.toLocaleString(),
      sub: `${counters.events_last_24h.toLocaleString()} writes last 24h`,
    },
  ];

  const recentActivity = prov.map((p) => ({
    when: p.created_at,
    actor: p.actor_id,
    action: p.operation === "write" ? "recorded" : "read",
    artifact: p.artifact_uri,
  }));

  return {
    posture: {
      level: postureLevel,
      headline,
      body,
      asOf: new Date().toISOString(),
    },
    kpis,
    attention: sorted.slice(0, 3),
    recentActivity,
    artifactsByDay: byDay,
    highestSeverity: top,
    totals: {
      artifacts: counters.artifacts_total,
      investigations: counters.investigations_total,
      open: counters.active_open,
    },
  };
}

function severityWeight(sev: Investigation["severity"]): number {
  return sev === "critical" ? 4 : sev === "high" ? 3 : sev === "medium" ? 2 : 1;
}
