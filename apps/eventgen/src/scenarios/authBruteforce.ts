import type { HecEvent } from "../hec.js";
import type { Scenario, ScenarioContext } from "./types.js";
import { jitter, pick, rndIp, rndInt, rndUser } from "./util.js";

export const authBruteforce: Scenario = {
  name: "auth-bruteforce",
  description: "Credential stuffing wave → eventual success → anomalous data access from compromised account",
  build({ baseTimeMs, index, rng }: ScenarioContext): HecEvent[] {
    const targetUser = rndUser(rng);
    const authHost = pick(rng, ["auth-svc-01", "auth-svc-02"]);
    const events: HecEvent[] = [];
    const push = (offsetMs: number, jitterMs: number, e: Omit<HecEvent, "time">): void => {
      events.push({ ...e, time: (baseTimeMs + offsetMs + jitter(rng, jitterMs)) / 1000 } as HecEvent);
    };

    // Wave of failed logins from rotating IPs
    const ips = Array.from({ length: 8 }, () => rndIp(rng));
    for (let i = 0; i < 40; i++) {
      push(i * 1_500, 800, {
        event: {
          level: "WARN",
          action: "login_failed",
          username: targetUser,
          source_ip: pick(rng, ips),
          reason: "invalid_password",
          attempt: i + 1,
          msg: `Authentication failed for ${targetUser}: invalid password`,
        },
        sourcetype: "auth:login",
        source: "/var/log/auth/auth.log",
        host: authHost,
        index,
      });
    }

    // Success (the breach moment)
    push(40 * 1_500, 200, {
      event: {
        level: "INFO",
        action: "login_success",
        username: targetUser,
        source_ip: ips[ips.length - 1],
        msg: `User ${targetUser} authenticated successfully`,
      },
      sourcetype: "auth:login",
      source: "/var/log/auth/auth.log",
      host: authHost,
      index,
    });

    // Anomalous data access from the compromised account
    for (let i = 0; i < 12; i++) {
      push(40 * 1_500 + 10_000 + i * 4_000, 1_500, {
        event: {
          level: "WARN",
          action: "data_access",
          username: targetUser,
          dataset: pick(rng, ["customers.pii", "payment.cards", "employees.salary", "audit.logs"]),
          rows_accessed: rndInt(rng, 1000, 50000),
          anomaly_score: 0.92 + rng() * 0.07,
          msg: `Anomalous data access by ${targetUser}: large row count outside normal pattern`,
        },
        sourcetype: "audit:datasource",
        source: "/var/log/audit/audit.log",
        host: "data-api-01",
        index,
      });
    }

    return events.sort((a, b) => a.time - b.time);
  },
};
