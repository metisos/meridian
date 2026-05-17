import type { HecEvent } from "../hec.js";
import type { Scenario, ScenarioContext } from "./types.js";
import { jitter, pick, rndInt } from "./util.js";

const DB_HOSTS = ["prod-db-01", "prod-db-03", "prod-db-04"];

export const cascadingFailure: Scenario = {
  name: "cascading-failure",
  description: "Config deploy → memory leak → DB connection pool exhaustion → service degradation → client 503s",
  build({ baseTimeMs, index, rng }: ScenarioContext): HecEvent[] {
    const dbHost = pick(rng, DB_HOSTS);
    const service = pick(rng, ["service-a", "service-b", "payment-svc"]);
    const client = pick(rng, ["client-alpha", "client-beta", "client-epsilon"]);
    const version = `v2.${rndInt(rng, 1, 9)}.${rndInt(rng, 0, 20)}`;
    const events: HecEvent[] = [];
    const push = (offsetMs: number, jitterMs: number, e: Omit<HecEvent, "time">): void => {
      const t = baseTimeMs + offsetMs + jitter(rng, jitterMs);
      events.push({ ...e, time: t / 1000 } as HecEvent);
    };

    // T+0: config deploy
    push(0, 200, {
      event: {
        level: "INFO",
        service,
        action: "deploy_complete",
        from_version: `v2.${rndInt(rng, 1, 9)}.${rndInt(rng, 0, 20)}`,
        to_version: version,
        msg: `Config deploy completed: ${service} -> ${version}`,
      },
      sourcetype: "webapp:deploy",
      source: "/var/log/ci/deploy.log",
      host: "ci-runner-01",
      index,
    });

    // baseline access
    for (let i = 0; i < 6; i++) {
      push(i * 2_000, 1_500, {
        event: {
          method: pick(rng, ["GET", "POST"]),
          path: pick(rng, ["/api/users", "/api/orders", "/api/health"]),
          status: 200,
          duration_ms: rndInt(rng, 25, 80),
          client_id: client,
          msg: `OK 200`,
        },
        sourcetype: "webapp:access",
        source: "/var/log/webapp/access.log",
        host: pick(rng, ["web-01", "web-02"]),
        index,
      });
    }

    // T+30s-90s memory spike
    for (let i = 0; i < 5; i++) {
      const pct = 85 + (i * 10) / 5 + rng() * 2;
      push(30_000 + i * 10_000, 1_000, {
        event: {
          metric: "mem.used_pct",
          value: Number(pct.toFixed(1)),
          rss_gb: 13 + i * 0.3,
          msg: `Memory usage on ${dbHost}: ${pct.toFixed(1)}%`,
        },
        sourcetype: "metrics:host",
        source: "/proc/meminfo",
        host: dbHost,
        index,
      });
    }

    // T+90s connection pool exhausted
    for (let i = 0; i < 3; i++) {
      push(90_000, 500, {
        event: {
          level: "ERROR",
          component: "conn_pool",
          pool_max: 200,
          pool_in_use: 200,
          waiting: rndInt(rng, 20, 60),
          msg: `Connection pool exhausted on ${dbHost} max=200 in_use=200`,
        },
        sourcetype: "db:error",
        source: "/var/log/postgres/postgres.log",
        host: dbHost,
        index,
      });
    }

    // T+92s service timeouts
    for (let i = 0; i < 6; i++) {
      push(92_000, 1_500, {
        event: {
          level: "ERROR",
          service,
          upstream: dbHost,
          error_type: "PoolTimeoutError",
          duration_ms: 30_000,
          msg: `PoolTimeoutError waiting on ${dbHost}`,
        },
        sourcetype: "webapp:error",
        source: `/var/log/webapp/${service}.log`,
        host: `${service}-01`,
        index,
      });
    }

    // T+5min client 503s
    for (let i = 0; i < 10; i++) {
      push(5 * 60_000, 30_000, {
        event: {
          method: pick(rng, ["GET", "POST"]),
          path: pick(rng, ["/api/orders", "/api/checkout"]),
          status: 503,
          duration_ms: 5_000,
          client_id: client,
          msg: `503 ServiceUnavailable: upstream timeout`,
        },
        sourcetype: "webapp:access",
        source: "/var/log/webapp/access.log",
        host: pick(rng, ["web-01", "web-02"]),
        index,
      });
    }

    return events.sort((a, b) => a.time - b.time);
  },
};
