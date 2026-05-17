import "server-only";
import { getDb } from "./mongo";

export type SourceKind = "splunk-index" | "unknown";

export interface ConnectedSource {
  id: string;             // unique key — e.g., "splunk:main"
  kind: SourceKind;
  display_name: string;   // e.g., "main"
  vendor: string;         // e.g., "Splunk Enterprise"
  server: string | null;  // splunk_server, etc.
  event_count: number;
  events_last_24h: number;
  events_last_1h: number;
  last_seen: string | null;
  sourcetypes: string[];
  hosts: string[];
}

export interface FutureSource {
  vendor: string;
  display_name: string;
  body: string;
}

export interface SourcesData {
  connected: ConnectedSource[];
  total_events: number;
  total_events_24h: number;
  total_hosts: number;
  total_sourcetypes: number;
  generated_at: string;
  future: FutureSource[];
}

export const FUTURE_SOURCES: FutureSource[] = [
  {
    vendor: "Sentinel",
    display_name: "Microsoft Sentinel",
    body: "Ingest analytic rule fires, incident records, and entity behavior from a Log Analytics workspace.",
  },
  {
    vendor: "CrowdStrike",
    display_name: "CrowdStrike Falcon",
    body: "Stream Falcon detections, agent telemetry, and identity protection signals.",
  },
  {
    vendor: "GuardDuty",
    display_name: "AWS GuardDuty",
    body: "Ingest findings from AWS GuardDuty across organization accounts and regions.",
  },
];

interface IndexAggRow {
  _id: string | null;
  event_count: number;
  events_last_24h: number;
  events_last_1h: number;
  last_seen: string | null;
  sourcetypes: string[];
  hosts: string[];
  servers: string[];
}

export async function fetchSources(): Promise<SourcesData> {
  const db = await getDb();
  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60_000).toISOString();
  const since1h = new Date(now - 60 * 60_000).toISOString();

  const rows = (await db
    .collection("artifacts")
    .aggregate([
      { $match: { domain: "splunk-events" } },
      {
        $group: {
          _id: "$content.fields.index",
          event_count: { $sum: 1 },
          events_last_24h: {
            $sum: { $cond: [{ $gte: ["$created_at", since24h] }, 1, 0] },
          },
          events_last_1h: {
            $sum: { $cond: [{ $gte: ["$created_at", since1h] }, 1, 0] },
          },
          last_seen: { $max: "$created_at" },
          sourcetypes: { $addToSet: "$content.fields.sourcetype" },
          hosts: { $addToSet: "$content.fields.host" },
          servers: { $addToSet: "$content.fields.splunk_server" },
        },
      },
      { $sort: { event_count: -1 } },
    ])
    .toArray()) as unknown as IndexAggRow[];

  const connected: ConnectedSource[] = rows.map((r) => {
    const indexName = r._id ?? "(unspecified)";
    const server = (r.servers ?? []).filter(Boolean)[0] ?? null;
    const sourcetypes = (r.sourcetypes ?? []).filter(Boolean).sort();
    const hosts = (r.hosts ?? []).filter(Boolean).sort();
    return {
      id: `splunk:${indexName}`,
      kind: "splunk-index",
      display_name: indexName,
      vendor: "Splunk Enterprise",
      server,
      event_count: r.event_count,
      events_last_24h: r.events_last_24h,
      events_last_1h: r.events_last_1h,
      last_seen: r.last_seen,
      sourcetypes,
      hosts,
    };
  });

  const total_events = connected.reduce((s, c) => s + c.event_count, 0);
  const total_events_24h = connected.reduce((s, c) => s + c.events_last_24h, 0);
  const total_hosts = new Set(connected.flatMap((c) => c.hosts)).size;
  const total_sourcetypes = new Set(connected.flatMap((c) => c.sourcetypes)).size;

  return {
    connected,
    total_events,
    total_events_24h,
    total_hosts,
    total_sourcetypes,
    generated_at: new Date().toISOString(),
    future: FUTURE_SOURCES,
  };
}
