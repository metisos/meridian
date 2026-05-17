import type { HecEvent } from "../hec.js";
import type { Scenario, ScenarioContext } from "./types.js";
import { jitter, pick, rndInt, rndUser } from "./util.js";

export const privilegeEscalation: Scenario = {
  name: "privilege-escalation",
  description: "Normal user grants themselves admin → config changes → access to restricted resources",
  build({ baseTimeMs, index, rng }: ScenarioContext): HecEvent[] {
    const actor = rndUser(rng);
    const target = rndUser(rng);
    const events: HecEvent[] = [];
    const push = (offsetMs: number, jitterMs: number, e: Omit<HecEvent, "time">): void => {
      events.push({ ...e, time: (baseTimeMs + offsetMs + jitter(rng, jitterMs)) / 1000 } as HecEvent);
    };

    // T+0: self-elevation (red flag)
    push(0, 100, {
      event: {
        level: "WARN",
        action: "role_grant",
        actor,
        target: actor,
        role: pick(rng, ["admin", "super_admin", "iam_full_access"]),
        msg: `Role grant: ${actor} granted '${pick(rng, ["admin"])}' to themselves`,
      },
      sourcetype: "iam:role-change",
      source: "/var/log/iam/iam.log",
      host: "iam-svc-01",
      index,
    });

    // Config changes
    for (let i = 0; i < 5; i++) {
      push(60_000 + i * 30_000, 5_000, {
        event: {
          level: "INFO",
          action: "config_change",
          actor,
          resource: pick(rng, [
            "/api/firewall-rules",
            "/api/audit/sinks",
            "/api/iam/policies",
            "/api/secrets/keys",
          ]),
          operation: pick(rng, ["update", "delete"]),
          msg: `Config changed by ${actor}`,
        },
        sourcetype: "config:change",
        source: "/var/log/config/audit.log",
        host: pick(rng, ["iam-svc-01", "firewall-edge-01"]),
        index,
      });
    }

    // Access to restricted resources
    for (let i = 0; i < 8; i++) {
      push(4 * 60_000 + i * 20_000, 5_000, {
        event: {
          level: "WARN",
          action: "restricted_access",
          actor,
          resource: pick(rng, [
            "index=secrets",
            "index=audit",
            "collection=employee_pii",
            "kv_store=apikeys",
          ]),
          rows: rndInt(rng, 100, 5000),
          msg: `Restricted resource accessed by ${actor}`,
        },
        sourcetype: "audit:access",
        source: "/var/log/audit/access.log",
        host: pick(rng, ["prod-db-01", "iam-svc-01"]),
        index,
      });
    }

    // Cover-track: target user role removal (one more red flag)
    push(10 * 60_000, 1_000, {
      event: {
        level: "WARN",
        action: "role_revoke",
        actor,
        target,
        role: "viewer",
        msg: `Role revoke: ${actor} removed 'viewer' from ${target}`,
      },
      sourcetype: "iam:role-change",
      source: "/var/log/iam/iam.log",
      host: "iam-svc-01",
      index,
    });

    return events.sort((a, b) => a.time - b.time);
  },
};
