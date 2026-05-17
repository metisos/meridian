import "server-only";
import { getDb } from "./mongo";

export interface ProvActor {
  id: string;
  display_name: string;
  reads: number;
  writes: number;
}

export interface ProvArtifact {
  uri: string;
  short_id: string;
  domain: string;
  reads: number;
  writes: number;
}

export interface ProvEdge {
  actor_id: string;
  artifact_uri: string;
  operation: "read" | "write";
  created_at: string;
}

export interface ProvenanceGraphData {
  actors: ProvActor[];
  artifacts: ProvArtifact[];
  edges: ProvEdge[];
  total_entries: number;
  scoped_artifact_count: number;
  earliest: string | null;
  latest: string | null;
}

interface AgentMemoryDoc {
  investigation_uri: string;
  causal_chain?: Array<{ artifact_uri: string }>;
  blast_radius?: {
    root_entity_uri?: string | null;
    infrastructure?: Array<{ uri: string }>;
    business?: Array<{ uri: string }>;
    compliance?: Array<{ uri: string }>;
  };
}

interface ProvDoc {
  prov_id: string;
  actor_id: string;
  operation: "read" | "write";
  artifact_uri: string;
  created_at: string;
}

export async function fetchProvenanceGraph(invUri: string): Promise<ProvenanceGraphData> {
  const db = await getDb();
  const inv = (await db
    .collection("agent_memory")
    .findOne({ investigation_uri: invUri })) as AgentMemoryDoc | null;
  if (!inv) {
    return { actors: [], artifacts: [], edges: [], total_entries: 0, scoped_artifact_count: 0, earliest: null, latest: null };
  }

  const uris = new Set<string>([invUri]);
  for (const step of inv.causal_chain ?? []) uris.add(step.artifact_uri);
  if (inv.blast_radius?.root_entity_uri) uris.add(inv.blast_radius.root_entity_uri);
  for (const e of inv.blast_radius?.infrastructure ?? []) uris.add(e.uri);
  for (const e of inv.blast_radius?.business ?? []) uris.add(e.uri);
  for (const e of inv.blast_radius?.compliance ?? []) uris.add(e.uri);

  const provs = (await db
    .collection("provenance")
    .find({ artifact_uri: { $in: Array.from(uris) } })
    .sort({ created_at: 1 })
    .limit(120)
    .toArray()) as unknown as ProvDoc[];

  const actorMap = new Map<string, ProvActor>();
  const artifactMap = new Map<string, ProvArtifact>();
  const edges: ProvEdge[] = [];
  let earliest: string | null = null;
  let latest: string | null = null;

  for (const p of provs) {
    if (!actorMap.has(p.actor_id)) {
      actorMap.set(p.actor_id, {
        id: p.actor_id,
        display_name: p.actor_id,
        reads: 0,
        writes: 0,
      });
    }
    if (!artifactMap.has(p.artifact_uri)) {
      const segs = p.artifact_uri.split("/");
      const short = segs.pop() ?? p.artifact_uri;
      const domain = segs[segs.length - 1] ?? "unknown";
      artifactMap.set(p.artifact_uri, {
        uri: p.artifact_uri,
        short_id: short,
        domain,
        reads: 0,
        writes: 0,
      });
    }
    const actor = actorMap.get(p.actor_id)!;
    const artifact = artifactMap.get(p.artifact_uri)!;
    if (p.operation === "read") {
      actor.reads++;
      artifact.reads++;
    } else {
      actor.writes++;
      artifact.writes++;
    }
    edges.push({
      actor_id: p.actor_id,
      artifact_uri: p.artifact_uri,
      operation: p.operation,
      created_at: p.created_at,
    });
    if (!earliest || p.created_at < earliest) earliest = p.created_at;
    if (!latest || p.created_at > latest) latest = p.created_at;
  }

  return {
    actors: Array.from(actorMap.values()).sort(
      (a, b) => b.reads + b.writes - (a.reads + a.writes),
    ),
    artifacts: Array.from(artifactMap.values()),
    edges,
    total_entries: provs.length,
    scoped_artifact_count: uris.size,
    earliest,
    latest,
  };
}
