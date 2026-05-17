/**
 * Causal chain construction (PRD §7.4 step 4).
 *
 * Takes a set of matched artifacts (with USC fields), orders them by temporal
 * coordinate, and computes a confidence per causal link using the USC
 * cross-tier match formula. Overall chain confidence is the geometric mean
 * of the link confidences (PRD §4.3 / whitepaper §4.3).
 */

import { crossTierMatch, aggregateConfidence, type USC } from "@meridian/usc";

export interface CausalArtifact {
  uri: string;
  name: string;
  usc: Pick<USC, "spatial" | "temporal" | "spatial_uncertainty" | "temporal_uncertainty_ms">;
}

export interface CausalLink {
  from_uri: string;
  to_uri: string;
  dt_ms: number;
  confidence: number;
}

export interface CausalChain {
  ordered: CausalArtifact[];
  links: CausalLink[];
  chain_confidence: number;
}

export interface CausalChainOptions {
  /** Spatial radius for each link's match query (in hops). Default 2. */
  link_spatial_radius?: number;
  /** Temporal radius for each link's match query (in ms). Default 10 minutes. */
  link_temporal_radius_ms?: number;
  /** Drop links below this confidence from the chain. Default 0.05 (whitepaper threshold). */
  min_link_confidence?: number;
}

export function buildCausalChain(
  artifacts: CausalArtifact[],
  options: CausalChainOptions = {},
): CausalChain {
  const rs = options.link_spatial_radius ?? 2;
  const rt = options.link_temporal_radius_ms ?? 10 * 60 * 1000;
  const minC = options.min_link_confidence ?? 0.05;

  const ordered = [...artifacts].sort(
    (a, b) => Date.parse(a.usc.temporal) - Date.parse(b.usc.temporal),
  );

  const links: CausalLink[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1]!;
    const curr = ordered[i]!;
    const C = crossTierMatch({
      primitive: prev.usc,
      query: {
        spatial: curr.usc.spatial,
        temporal: curr.usc.temporal,
        spatial_radius: rs,
        temporal_radius_ms: rt,
      },
    });
    if (C >= minC) {
      links.push({
        from_uri: prev.uri,
        to_uri: curr.uri,
        dt_ms: Math.abs(Date.parse(curr.usc.temporal) - Date.parse(prev.usc.temporal)),
        confidence: C,
      });
    }
  }

  const chain_confidence =
    links.length === 0 ? 0 : aggregateConfidence(links.map((l) => l.confidence));

  return { ordered, links, chain_confidence };
}
