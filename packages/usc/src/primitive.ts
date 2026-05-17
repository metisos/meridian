/**
 * USC primitive — the seven-field tuple from whitepaper §4.1 and PRD §4.1.
 *
 *   p = ⟨ s, t, σs, σt, π, τ, e ⟩
 *
 * In Meridian, the spatial frame is *infrastructure topology* — host/zone/network_hop —
 * rather than 3D physical coordinates (whitepaper allows "any defined frame"). σs is
 * therefore expressed in "logical hops" rather than meters when a spatial coordinate
 * has a host but no lat/lng. See pipeline-plan.md and the USC whitepaper §4.1.
 */

import { z } from "zod";

export type Tier = "cognitive" | "temporal" | "spatial";

export type Fidelity = "high" | "medium" | "low" | "projected";

/**
 * Spatial coordinate. Either physical (lat/lng) or topological (host/zone/network_hop)
 * or both. All fields are optional — `null` is valid for cognitive primitives that
 * don't inherit a spatial position.
 */
export const SpatialSchema = z.object({
  host: z.string().optional(),
  zone: z.string().optional(),
  region: z.string().optional(),
  rack: z.string().optional(),
  /** Logical hops from a reference point in the infrastructure topology. */
  network_hop: z.number().int().nonnegative().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export type Spatial = z.infer<typeof SpatialSchema>;

export const ProvenanceSchema = z.object({
  source_system: z.string(),
  fidelity: z.enum(["high", "medium", "low", "projected"]),
  capture_method: z.string().optional(),
});

export type Provenance = z.infer<typeof ProvenanceSchema>;

/**
 * Full USC payload that rides on every ContextSync artifact.
 * Embedding dimension is fixed at 768 in Meridian to match the Atlas vector indexes;
 * see EMBED_DIM in .env.local.
 */
export const USCSchema = z.object({
  spatial: SpatialSchema,
  /** Temporal coordinate as ISO 8601 UTC string. */
  temporal: z.string().datetime(),
  /**
   * Spatial uncertainty. Units are "meters" when lat/lng are set, "logical hops"
   * when only network_hop / host / zone are set. Whitepaper §4.1 + PRD §4.1.
   */
  spatial_uncertainty: z.number().nonnegative(),
  /** Temporal uncertainty in milliseconds. */
  temporal_uncertainty_ms: z.number().nonnegative(),
  provenance: ProvenanceSchema,
  tier: z.enum(["cognitive", "temporal", "spatial"]),
  /** Semantic embedding, 768-dim, L2-normalized. */
  embedding: z.array(z.number()).length(768),
});

export type USC = z.infer<typeof USCSchema>;

/**
 * Query region from whitepaper §4.2:
 *   Q = ⟨ s_q, t_q, r_s, r_t, optional tier filter ⟩
 *
 * Used by crossTierMatch() and confidence aggregation.
 */
export const QuerySchema = z.object({
  spatial: SpatialSchema,
  /** Temporal center, ISO 8601 UTC. */
  temporal: z.string().datetime(),
  /** Spatial query radius. Units must match the primitive's σs units. */
  spatial_radius: z.number().nonnegative(),
  /** Temporal query radius in milliseconds. */
  temporal_radius_ms: z.number().nonnegative(),
  tier: z.enum(["cognitive", "temporal", "spatial"]).optional(),
});

export type Query = z.infer<typeof QuerySchema>;

/** Embedding dimension is a hard constant — Atlas indexes are bound to it. */
export const EMBEDDING_DIM = 768 as const;

/** Default match-score threshold from whitepaper §4.5. Below this, suppress or cite-only. */
export const DEFAULT_MATCH_THRESHOLD = 0.05 as const;
