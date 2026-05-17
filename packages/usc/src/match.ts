/**
 * Cross-tier match — whitepaper §4.2:
 *
 *   C(p, Q) = exp( -ds² / (2(σs² + rs²)) ) · exp( -dt² / (2(σt² + rt²)) )
 *
 * Property worth pinning down: the primitive's uncertainty is *added* to the
 * query radius before the Gaussian decay is computed. The match fires when the
 * query region overlaps the primitive's region of confidence — NOT when the
 * point estimates coincide. This is what makes USC robust against fuzzy data.
 */

import type { USC, Query } from "./primitive.js";

export interface MatchInput {
  primitive: Pick<USC, "spatial" | "temporal" | "spatial_uncertainty" | "temporal_uncertainty_ms">;
  query: Pick<Query, "spatial" | "temporal" | "spatial_radius" | "temporal_radius_ms">;
}

/**
 * Spatial distance between a primitive and a query.
 *
 * - If both have lat/lng, use Euclidean distance in degrees (good enough for
 *   the bounded scenarios Meridian operates in; if Meridian ever does true
 *   geospatial, swap for haversine).
 * - Else fall back to a logical-hop distance derived from host equality and
 *   network_hop. Same host and same zone => 0 hops. Different host with no
 *   topology info => Infinity (no match).
 *
 * Returns Infinity when the spaces are incomparable — Gaussian decay then
 * naturally drives the score to 0.
 */
export function spatialDistance(
  a: USC["spatial"],
  b: Query["spatial"] | USC["spatial"],
): number {
  const aHasLatLng = a.lat !== undefined && a.lng !== undefined;
  const bHasLatLng = b.lat !== undefined && b.lng !== undefined;
  if (aHasLatLng && bHasLatLng) {
    const dx = (a.lng as number) - (b.lng as number);
    const dy = (a.lat as number) - (b.lat as number);
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Topological path: hops first if both supply them; else host equality
  const aHop = a.network_hop;
  const bHop = b.network_hop;
  if (aHop !== undefined && bHop !== undefined) {
    return Math.abs(aHop - bHop);
  }

  // Hop count missing on one side — use host as a 0/1 indicator
  if (a.host && b.host) {
    return a.host === b.host ? 0 : 1;
  }

  // No comparable spatial signal — incomparable
  return Number.POSITIVE_INFINITY;
}

/** Absolute temporal distance in milliseconds. */
export function temporalDistanceMs(aIso: string, bIso: string): number {
  return Math.abs(Date.parse(aIso) - Date.parse(bIso));
}

/**
 * The match formula. Pure function, side-effect-free.
 *
 * Returns a score in [0, 1]. Returns 0 if either factor underflows due to
 * incomparable spatial spaces (ds = Infinity).
 */
export function crossTierMatch(input: MatchInput): number {
  const { primitive: p, query: q } = input;

  const ds = spatialDistance(p.spatial, q.spatial);
  const dt = temporalDistanceMs(p.temporal, q.temporal);

  const sigmaS2 = p.spatial_uncertainty * p.spatial_uncertainty;
  const rs2 = q.spatial_radius * q.spatial_radius;
  const sigmaT2 = p.temporal_uncertainty_ms * p.temporal_uncertainty_ms;
  const rt2 = q.temporal_radius_ms * q.temporal_radius_ms;

  // Guard against degenerate query (zero radii AND zero uncertainty)
  const spatialDenom = 2 * (sigmaS2 + rs2);
  const temporalDenom = 2 * (sigmaT2 + rt2);

  const spatialFactor =
    spatialDenom === 0
      ? ds === 0
        ? 1
        : 0
      : Math.exp(-(ds * ds) / spatialDenom);
  const temporalFactor =
    temporalDenom === 0
      ? dt === 0
        ? 1
        : 0
      : Math.exp(-(dt * dt) / temporalDenom);

  return spatialFactor * temporalFactor;
}
