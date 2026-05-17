/**
 * @meridian/usc — Unified Spatiotemporal Coordinate system
 *
 * Implements the seven-field primitive (whitepaper §4.1), the cross-tier match
 * formula (§4.2), confidence aggregation (§4.3), and a pluggable embedding
 * backend (transformers.js + nomic, with Gemini fallback).
 *
 * The stamper (Splunk event → full USC) lands in B5 (see docs/pipeline-plan.md).
 */

export const USC_PACKAGE = "@meridian/usc" as const;

export {
  SpatialSchema,
  ProvenanceSchema,
  USCSchema,
  QuerySchema,
  EMBEDDING_DIM,
  DEFAULT_MATCH_THRESHOLD,
  type Tier,
  type Fidelity,
  type Spatial,
  type Provenance,
  type USC,
  type Query,
} from "./primitive.js";

export {
  crossTierMatch,
  spatialDistance,
  temporalDistanceMs,
  type MatchInput,
} from "./match.js";

export { aggregateConfidence } from "./confidence.js";

export {
  createEmbeddingBackend,
  LocalNomicBackend,
  GeminiBackend,
  l2Normalize,
  applyPrefix,
  type EmbeddingBackend,
  type EmbeddingKind,
} from "./embedding.js";
