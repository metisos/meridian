import type { HecEvent } from "../hec.js";
import type { Scenario, ScenarioContext } from "./types.js";
import { jitter, pick, rndInt, rndIp } from "./util.js";

export const ddosSurge: Scenario = {
  name: "ddos-surge",
  description: "Sudden 100× request rate from many source IPs → CDN saturation → web tier 503s → SLA at risk",
  build({ baseTimeMs, index, rng }: ScenarioContext): HecEvent[] {
    const events: HecEvent[] = [];
    const push = (offsetMs: number, jitterMs: number, e: Omit<HecEvent, "time">): void => {
      events.push({ ...e, time: (baseTimeMs + offsetMs + jitter(rng, jitterMs)) / 1000 } as HecEvent);
    };
    const botIps = Array.from({ length: 20 }, () => rndIp(rng));
    const targetService = pick(rng, ["service-a", "service-b", "payment-svc", "search-svc"]);
    const cdnEdge = pick(rng, ["cdn-edge-01", "cdn-edge-02"]);
    const webHost = pick(rng, ["web-01", "web-02", "web-03"]);

    // CDN spike — many requests from many IPs
    for (let i = 0; i < 25; i++) {
      push(i * 1_000, 800, {
        event: {
          level: "INFO",
          action: "cdn_request",
          edge_node: cdnEdge,
          source_ip: pick(rng, botIps),
          target_service: targetService,
          requests_per_second: rndInt(rng, 5000, 50000),
          msg: `CDN traffic spike from ${botIps.length} unique IPs`,
        },
        sourcetype: "cdn:request",
        source: "/var/log/cdn/edge.log",
        host: cdnEdge,
        index,
      });
    }

    // Firewall sees the volume
    for (let i = 0; i < 10; i++) {
      push(30_000 + i * 5_000, 2_000, {
        event: {
          level: "WARN",
          action: "rate_limit",
          target_service: targetService,
          dropped_requests: rndInt(rng, 5000, 50000),
          rule: "rate_limit_per_ip",
          msg: `Firewall rate-limited ${rndInt(rng, 5000, 50000)} requests on ${targetService}`,
        },
        sourcetype: "firewall:traffic",
        source: "/var/log/firewall/traffic.log",
        host: "firewall-edge-01",
        index,
      });
    }

    // Web tier 503s
    for (let i = 0; i < 20; i++) {
      push(60_000 + i * 4_000, 3_000, {
        event: {
          method: "GET",
          path: pick(rng, ["/api/orders", "/api/checkout", "/api/users/me", "/api/products"]),
          status: 503,
          duration_ms: rndInt(rng, 5000, 30000),
          msg: `503 Service Unavailable: upstream saturated`,
        },
        sourcetype: "webapp:access",
        source: "/var/log/webapp/access.log",
        host: webHost,
        index,
      });
    }

    // Service errors
    for (let i = 0; i < 8; i++) {
      push(80_000 + i * 8_000, 3_000, {
        event: {
          level: "ERROR",
          service: targetService,
          error_type: "Saturation",
          msg: `Service ${targetService} saturated, dropping requests`,
        },
        sourcetype: "webapp:error",
        source: `/var/log/webapp/${targetService}.log`,
        host: `${targetService}-01`,
        index,
      });
    }

    return events.sort((a, b) => a.time - b.time);
  },
};
