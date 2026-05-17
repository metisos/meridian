/**
 * USC stamper — turn a Splunk event into a complete 7-field USC primitive
 * (whitepaper §4.1, PRD §4) attached to a ContextSync artifact body.
 *
 * Field mapping for Meridian's Splunk → temporal-tier ingest:
 *   spatial:               { host, zone?, network_hop? }    from event.host
 *   temporal:              ISO 8601                          from event._time
 *   spatial_uncertainty:   0 (we have exact host)            hops
 *   temporal_uncertainty:  50ms (high-fidelity HEC)          per PRD §4.4
 *   provenance:            source_system=splunk, fidelity=high
 *   tier:                  "temporal" (operational events)
 *   embedding:             nomic v1.5 of canonical text       768d L2-normalized
 */

import { createHash } from "node:crypto";
import type { SplunkEvent } from "../splunkClient.js";
import type { EmbeddingBackend } from "@meridian/usc";

export interface StampedArtifact {
  uri: string;
  name: string;
  domain: "splunk-events";
  content_type: "application/json";
  content: {
    raw: string;
    fields: Record<string, string | undefined>;
  };
  usc: {
    spatial: { host?: string; zone?: string; network_hop?: number };
    temporal: string;
    spatial_uncertainty: number;
    temporal_uncertainty_ms: number;
    provenance: { source_system: "splunk"; fidelity: "high"; capture_method: string };
    tier: "temporal";
    embedding: number[];
  };
}

/** Tier classification by sourcetype. For Meridian's current scope all Splunk
 *  events go to "temporal" — runbooks/SLA/compliance would be "cognitive". */
function classifyTier(_sourcetype: string): "temporal" {
  return "temporal";
}

/**
 * Convert a Splunk event to a canonical text representation for embedding.
 * Prefers a `msg` field if present (richer semantic content), falls back to
 * _raw, then to a sourcetype + host + serialized-fields fallback.
 */
export function canonicalEventText(event: SplunkEvent): string {
  // HEC events delivered with sourcetype=_json have their JSON body parsed and
  // the inner fields lifted up. The eventgen sets a `msg` field consistently.
  const msg = (event as Record<string, unknown>).msg;
  if (typeof msg === "string" && msg.length > 0) {
    return `${event.sourcetype} on ${event.host ?? "?"}: ${msg}`;
  }
  if (event._raw && event._raw.length > 0) {
    return `${event.sourcetype} on ${event.host ?? "?"}: ${event._raw}`;
  }
  return `${event.sourcetype} on ${event.host ?? "?"}: ${JSON.stringify(event).slice(0, 500)}`;
}

/** Deterministic URI suffix from event content so re-ingestion is idempotent. */
function uriIdFor(event: SplunkEvent): string {
  const key = `${event.sourcetype}|${event.host ?? ""}|${event._time}|${event._raw ?? canonicalEventText(event)}`;
  const hex = createHash("sha256").update(key, "utf8").digest("hex");
  return hex.slice(0, 16);
}

/** Convert a Splunk ISO timestamp ("2026-05-16 15:47:07.000 UTC") to RFC 3339 UTC. */
function toISO(splunkTime: string): string {
  // Splunk emits times like "2026-05-20 14:03:01.045 UTC". Date.parse handles
  // most variants; if it fails we substitute a 'T' for the space and add 'Z'.
  const direct = Date.parse(splunkTime);
  if (!Number.isNaN(direct)) return new Date(direct).toISOString();
  const cleaned = splunkTime.replace(" UTC", "Z").replace(" ", "T");
  const parsed = Date.parse(cleaned);
  if (Number.isNaN(parsed)) {
    throw new Error(`Cannot parse Splunk _time: ${splunkTime}`);
  }
  return new Date(parsed).toISOString();
}

export interface StamperOptions {
  org?: string;
  embeddingBackend: EmbeddingBackend;
  /** Optional batch — when provided, embeds in one call for speed. */
  batchEmbed?: boolean;
}

/** Stamp a single event. Convenient for tests; prefer `stampEvents` for batch. */
export async function stampEvent(
  event: SplunkEvent,
  opts: StamperOptions,
): Promise<StampedArtifact> {
  const [stamped] = await stampEvents([event], opts);
  return stamped!;
}

/**
 * Stamp many events. Embeds in a single batch call (much faster than per-event)
 * which keeps ingest fast even on large windows.
 */
export async function stampEvents(
  events: SplunkEvent[],
  opts: StamperOptions,
): Promise<StampedArtifact[]> {
  if (events.length === 0) return [];

  const org = opts.org ?? "meridian";
  const texts = events.map(canonicalEventText);
  const vectors = await opts.embeddingBackend.embedBatch(texts, "document");
  if (vectors.length !== events.length) {
    throw new Error(`embedBatch returned ${vectors.length} for ${events.length} events`);
  }

  return events.map((event, i) => {
    const id = uriIdFor(event);
    const uri = `ctx://${org}/splunk-events/evt_${id}`;
    const tier = classifyTier(event.sourcetype);
    const temporal = toISO(event._time);
    const text = texts[i]!;

    const truncatedName =
      text.length <= 100 ? text : text.slice(0, 99) + "…";

    // Strip _raw + structural Splunk fields out of `fields` for cleanliness
    const fields: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(event)) {
      if (k === "_raw" || k === "_time" || k === "_indextime") continue;
      if (typeof v === "string" || v === undefined) fields[k] = v;
    }

    return {
      uri,
      name: truncatedName,
      domain: "splunk-events",
      content_type: "application/json",
      content: {
        raw: event._raw ?? "",
        fields,
      },
      usc: {
        spatial: event.host ? { host: event.host } : {},
        temporal,
        spatial_uncertainty: 0,
        temporal_uncertainty_ms: 50,
        provenance: {
          source_system: "splunk",
          fidelity: "high",
          capture_method: "splunk_rest_search",
        },
        tier,
        embedding: vectors[i]!,
      },
    };
  });
}
