import type { HecEvent } from "../hec.js";
import type { Scenario, ScenarioContext } from "./types.js";
import { jitter, pick, rndInt, rndIp } from "./util.js";

const SUSPICIOUS_DOMAINS = ["pastebin-mirror.xyz", "transfer-here.io", "ipfs-gateway.example", "anon-upload.net"];
const FOREIGN_GEOS = ["RU", "CN", "KP", "IR"];

export const dataExfiltration: Scenario = {
  name: "data-exfiltration",
  description: "Large outbound transfers from low-traffic host → suspicious DNS → unusual geographic destination",
  build({ baseTimeMs, index, rng }: ScenarioContext): HecEvent[] {
    const sourceHost = pick(rng, ["web-03", "data-api-01"]);
    const targetDomain = pick(rng, SUSPICIOUS_DOMAINS);
    const dstIp = rndIp(rng);
    const geo = pick(rng, FOREIGN_GEOS);
    const events: HecEvent[] = [];
    const push = (offsetMs: number, jitterMs: number, e: Omit<HecEvent, "time">): void => {
      events.push({ ...e, time: (baseTimeMs + offsetMs + jitter(rng, jitterMs)) / 1000 } as HecEvent);
    };

    // DNS lookups to suspicious domains (the staging signal)
    for (let i = 0; i < 6; i++) {
      push(i * 30_000, 5_000, {
        event: {
          level: "INFO",
          action: "dns_query",
          query_name: targetDomain,
          query_type: "A",
          source_host: sourceHost,
          resolved_ip: dstIp,
          msg: `DNS lookup ${targetDomain} -> ${dstIp}`,
        },
        sourcetype: "dns:query",
        source: "/var/log/dns/named.log",
        host: "dns-resolver-01",
        index,
      });
    }

    // Large outbound transfers (the exfil)
    for (let i = 0; i < 15; i++) {
      const bytes = rndInt(rng, 50_000_000, 500_000_000);
      push(2 * 60_000 + i * 40_000, 10_000, {
        event: {
          level: "WARN",
          action: "outbound_transfer",
          source_host: sourceHost,
          destination_ip: dstIp,
          destination_domain: targetDomain,
          destination_geo: geo,
          bytes_sent: bytes,
          duration_ms: rndInt(rng, 30_000, 90_000),
          protocol: pick(rng, ["HTTPS", "TLS", "SFTP"]),
          msg: `Large outbound transfer ${(bytes / 1_000_000).toFixed(1)} MB to ${targetDomain} (${geo})`,
        },
        sourcetype: "firewall:traffic",
        source: "/var/log/firewall/traffic.log",
        host: "firewall-edge-01",
        index,
      });
    }

    // Proxy access pattern
    for (let i = 0; i < 8; i++) {
      push(3 * 60_000 + i * 45_000, 15_000, {
        event: {
          level: "INFO",
          action: "proxy_request",
          source_host: sourceHost,
          url: `https://${targetDomain}/upload/chunk-${i}`,
          method: "POST",
          bytes_sent: rndInt(rng, 50_000_000, 200_000_000),
          response_code: 200,
          msg: `Proxy POST to ${targetDomain}`,
        },
        sourcetype: "proxy:access",
        source: "/var/log/proxy/access.log",
        host: "proxy-01",
        index,
      });
    }

    return events.sort((a, b) => a.time - b.time);
  },
};
