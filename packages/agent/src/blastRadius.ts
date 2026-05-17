/**
 * Blast radius assessment (PRD §7.4 step 5).
 *
 * Starting from the root-cause artifact's host (or any entity URI we can
 * derive from its spatial coordinate), BFS through `entity_graph` following
 * relationships: hosts -> services, serves -> clients, bound_by -> SLAs,
 * governed_by -> compliance obligations.
 */

import type { Db } from "mongodb";

export interface EntityNode {
  uri: string;
  entity_type: string;
  name: string;
  metadata?: Record<string, unknown>;
  relationships?: Array<{ target_uri: string; relation: string }>;
}

export interface BlastRadius {
  root_entity_uri: string;
  infrastructure: Array<{ uri: string; name: string; entity_type: string; distance: number; path: string[] }>;
  business: Array<{ uri: string; name: string; entity_type: string; distance: number; path: string[] }>;
  compliance: Array<{ uri: string; name: string; entity_type: string; distance: number; path: string[] }>;
  total_affected: number;
}

const INFRA_TYPES = new Set(["server", "service", "host", "rack", "zone"]);
const BUSINESS_TYPES = new Set(["client", "sla", "contract"]);
const COMPLIANCE_TYPES = new Set(["compliance"]);

/**
 * Compute the blast radius for an event whose root-cause spatial host maps to
 * an entity in `entity_graph`. If the host has no matching entity, returns
 * empty blast (still includes the root entity uri as null indicator).
 */
export async function computeBlastRadius(
  db: Db,
  hostOrEntityUri: string,
  options: { maxDepth?: number } = {},
): Promise<BlastRadius> {
  const maxDepth = options.maxDepth ?? 4;
  const col = db.collection<EntityNode>("entity_graph");

  // Resolve the root: if input looks like a ctx:// URI, use it directly; else
  // try to find an entity whose `name` matches (e.g., "prod-db-03").
  let rootUri: string;
  let root: EntityNode | null;
  if (hostOrEntityUri.startsWith("ctx://")) {
    rootUri = hostOrEntityUri;
    root = await col.findOne({ uri: rootUri });
  } else {
    root = await col.findOne({ name: hostOrEntityUri });
    rootUri = root?.uri ?? hostOrEntityUri;
  }

  const blast: BlastRadius = {
    root_entity_uri: rootUri,
    infrastructure: [],
    business: [],
    compliance: [],
    total_affected: 0,
  };

  if (!root) return blast;

  // BFS
  type QueueItem = { uri: string; distance: number; path: string[] };
  const visited = new Set<string>([rootUri]);
  const queue: QueueItem[] = [{ uri: rootUri, distance: 0, path: [rootUri] }];

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (node.distance >= maxDepth) continue;
    const entity = await col.findOne({ uri: node.uri });
    if (!entity?.relationships) continue;

    for (const rel of entity.relationships) {
      if (visited.has(rel.target_uri)) continue;
      visited.add(rel.target_uri);
      const target = await col.findOne({ uri: rel.target_uri });
      const distance = node.distance + 1;
      const path = [...node.path, rel.target_uri];

      const summary = {
        uri: rel.target_uri,
        name: target?.name ?? rel.target_uri,
        entity_type: target?.entity_type ?? "unknown",
        distance,
        path,
      };

      const t = target?.entity_type ?? "";
      if (INFRA_TYPES.has(t)) blast.infrastructure.push(summary);
      else if (BUSINESS_TYPES.has(t)) blast.business.push(summary);
      else if (COMPLIANCE_TYPES.has(t)) blast.compliance.push(summary);

      queue.push({ uri: rel.target_uri, distance, path });
    }
  }

  blast.total_affected = blast.infrastructure.length + blast.business.length + blast.compliance.length;
  return blast;
}
