/**
 * Permission evaluation — spec §4.
 *
 * Default-deny. Grants are evaluated in order; first match wins. `admin`
 * implies all other operations.
 */

import { matchPattern } from "./uri.js";
import type { Actor, Operation, PermissionGrant } from "./types.js";

export interface PermissionDecision {
  allowed: boolean;
  reason: string;
  matched_grant?: PermissionGrant;
}

export function evaluatePermission(input: {
  actor: Pick<Actor, "actor_id" | "agent_class">;
  uri: string;
  operation: Operation;
  grants: readonly PermissionGrant[];
}): PermissionDecision {
  const { actor, uri, operation, grants } = input;

  for (const g of grants) {
    // Actor / class match
    const actorMatch =
      (g.actor_id && g.actor_id === actor.actor_id) ||
      (g.agent_class && g.agent_class === actor.agent_class);
    if (!actorMatch) continue;

    // Pattern match
    if (!matchPattern(uri, g.artifact_pattern)) continue;

    // Operation match (admin implies all)
    const opsMatch = g.operations.includes(operation) || g.operations.includes("admin");
    if (!opsMatch) continue;

    return { allowed: true, reason: "matched grant", matched_grant: g };
  }

  return { allowed: false, reason: "no matching grant (default-deny)" };
}
