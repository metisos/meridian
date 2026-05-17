import { describe, it, expect } from "vitest";
import { evaluatePermission } from "../src/permissions.js";
import type { PermissionGrant } from "../src/types.js";

const NOW = "2026-05-16T00:00:00.000Z";

function grant(g: Partial<PermissionGrant>): PermissionGrant {
  return {
    artifact_pattern: "ctx://**",
    operations: ["read"],
    created_at: NOW,
    ...g,
  } as PermissionGrant;
}

describe("evaluatePermission (spec §4)", () => {
  it("default-denies with no grants", () => {
    const d = evaluatePermission({
      actor: { actor_id: "h-1" },
      uri: "ctx://meridian/x/y",
      operation: "read",
      grants: [],
    });
    expect(d.allowed).toBe(false);
  });

  it("allows when actor_id and pattern and operation all match", () => {
    const d = evaluatePermission({
      actor: { actor_id: "h-1" },
      uri: "ctx://meridian/x/y",
      operation: "read",
      grants: [grant({ actor_id: "h-1", artifact_pattern: "ctx://meridian/**", operations: ["read"] })],
    });
    expect(d.allowed).toBe(true);
  });

  it("denies when pattern matches but operation does not", () => {
    const d = evaluatePermission({
      actor: { actor_id: "h-1" },
      uri: "ctx://meridian/x/y",
      operation: "write",
      grants: [grant({ actor_id: "h-1", artifact_pattern: "ctx://meridian/**", operations: ["read"] })],
    });
    expect(d.allowed).toBe(false);
  });

  it("matches by agent_class", () => {
    const d = evaluatePermission({
      actor: { actor_id: "a-bot", agent_class: "compliance-monitor" },
      uri: "ctx://acme/compliance/policy",
      operation: "read",
      grants: [
        grant({
          agent_class: "compliance-monitor",
          artifact_pattern: "ctx://acme/compliance/*",
          operations: ["read"],
        }),
      ],
    });
    expect(d.allowed).toBe(true);
  });

  it("admin operation implies all other operations", () => {
    const grants = [
      grant({
        actor_id: "h-ciso",
        artifact_pattern: "ctx://meridian/**",
        operations: ["admin"],
      }),
    ];
    for (const op of ["read", "write", "approve", "suggest"] as const) {
      const d = evaluatePermission({
        actor: { actor_id: "h-ciso" },
        uri: "ctx://meridian/x/y",
        operation: op,
        grants,
      });
      expect(d.allowed).toBe(true);
    }
  });

  it("first matching grant wins (order matters)", () => {
    // Two grants: a narrow read-only first, then a wide admin
    const grants = [
      grant({ actor_id: "h-1", artifact_pattern: "ctx://meridian/**", operations: ["read"] }),
      grant({ actor_id: "h-1", artifact_pattern: "ctx://**", operations: ["admin"] }),
    ];
    const d = evaluatePermission({
      actor: { actor_id: "h-1" },
      uri: "ctx://meridian/x/y",
      operation: "read",
      grants,
    });
    expect(d.allowed).toBe(true);
    expect(d.matched_grant?.operations).toEqual(["read"]); // first match
  });

  it("pattern with single * does not cross slashes", () => {
    const d = evaluatePermission({
      actor: { actor_id: "h-1" },
      uri: "ctx://acme/compliance/sub/policy",
      operation: "read",
      grants: [grant({ actor_id: "h-1", artifact_pattern: "ctx://acme/compliance/*", operations: ["read"] })],
    });
    expect(d.allowed).toBe(false);
  });
});
