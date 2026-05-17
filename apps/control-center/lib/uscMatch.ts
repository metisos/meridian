/* Real implementation of the USC cross-tier match formula.
 *
 *   C(p, Q) = exp(-d_s² / (2 (σ_s² + r_s²))) · exp(-d_t² / (2 (σ_t² + r_t²)))
 *
 * Where:
 *   d_s        spatial distance between artifact p and query Q
 *   d_t        temporal distance, in milliseconds
 *   σ_s        combined spatial uncertainty: sqrt(p.σ_s² + Q.σ_s²)
 *   σ_t        combined temporal uncertainty, ms
 *   r_s, r_t   query-side bandwidth parameters
 *
 * No synthesis, no approximation. Pure computation against the stored USC
 * fields in `artifacts.usc`.
 */

export interface USC {
  spatial: {
    host?: string | null;
    service?: string | null;
    region?: string | null;
    uri?: string | null;
  };
  temporal: string; // ISO 8601 UTC
  spatial_uncertainty: number;
  temporal_uncertainty_ms: number;
  provenance?: {
    source_system?: string;
    fidelity?: string;
    capture_method?: string;
  };
  tier?: "cognitive" | "temporal" | "spatial";
}

export interface MatchResult {
  /** The full cross-tier match score, 0-1. */
  C: number;
  /** Spatial component of the score, 0-1. */
  C_spatial: number;
  /** Temporal component of the score, 0-1. */
  C_temporal: number;
  /** Spatial distance (1 if hosts differ in this demo's hostname-as-coord scheme, 0 if same). */
  d_s: number;
  /** Temporal distance in milliseconds. */
  d_t_ms: number;
  /** Combined spatial uncertainty (sqrt of variance sum). */
  sigma_s: number;
  /** Combined temporal uncertainty, milliseconds. */
  sigma_t_ms: number;
}

/** Defaults match the agent's runtime defaults: host-level spatial, 30s temporal bandwidth. */
export const DEFAULT_R_S = 1;
export const DEFAULT_R_T_MS = 30_000;

/** Spatial distance between two USC coords. Host-level identity for this demo:
 *  0 if both reference the same host (or same service when host absent), 1 otherwise. */
export function spatialDistance(a: USC["spatial"], b: USC["spatial"]): number {
  const aHost = a.host ?? a.uri ?? a.service ?? null;
  const bHost = b.host ?? b.uri ?? b.service ?? null;
  if (aHost && bHost && aHost === bHost) return 0;
  return 1;
}

export function crossTierMatch(
  p: USC,
  q: USC,
  r_s: number = DEFAULT_R_S,
  r_t_ms: number = DEFAULT_R_T_MS,
): MatchResult {
  const d_s = spatialDistance(p.spatial, q.spatial);
  const d_t_ms = Math.abs(Date.parse(p.temporal) - Date.parse(q.temporal));

  const sigmaS2 = (p.spatial_uncertainty ?? 0) ** 2 + (q.spatial_uncertainty ?? 0) ** 2;
  const sigmaT2 =
    (p.temporal_uncertainty_ms ?? 0) ** 2 + (q.temporal_uncertainty_ms ?? 0) ** 2;

  const C_spatial = Math.exp(-(d_s ** 2) / (2 * (sigmaS2 + r_s ** 2)));
  const C_temporal = Math.exp(-(d_t_ms ** 2) / (2 * (sigmaT2 + r_t_ms ** 2)));

  return {
    C: C_spatial * C_temporal,
    C_spatial,
    C_temporal,
    d_s,
    d_t_ms,
    sigma_s: Math.sqrt(sigmaS2),
    sigma_t_ms: Math.sqrt(sigmaT2),
  };
}
