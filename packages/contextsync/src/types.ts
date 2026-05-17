/**
 * Type schemas for ContextSync artifacts, actors, permissions, provenance, and change events.
 * Follows the protocol spec v0.2 from github.com/metisos/contextsync-protocol, extended
 * with Meridian-specific fields (usc, links — PRD §5).
 */

import { z } from "zod";

// ---------- Versions ----------

export const VersionSchema = z.object({
  version: z.number().int().positive(),
  author_id: z.string(),
  timestamp: z.string().datetime(),
  summary: z.string(),
  /** SHA-256 of canonical content; prefixed "sha256:" */
  hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  /**
   * Full content body at this version. Meridian extension beyond the spec —
   * lets getArtifact(version) and diffVersions(from, to) work without external
   * snapshot storage. Trade-off: O(N×V) storage. Acceptable for incident-scale
   * artifacts; revisit if any artifact body grows >1MB.
   */
  content_snapshot: z.unknown(),
});

export type Version = z.infer<typeof VersionSchema>;

// ---------- Links (Meridian extension) ----------

export const LinkSchema = z.object({
  target_uri: z.string(),
  relation: z.string(),
  confidence: z.number().min(0).max(1).default(1.0),
});

export type Link = z.infer<typeof LinkSchema>;

// ---------- Artifact (spec §2 + Meridian usc/links) ----------

export const ArtifactSchema = z.object({
  uri: z.string(),
  name: z.string(),
  org: z.string(),
  domain: z.string(),
  content_type: z.string().default("application/json"),
  head_version: z.number().int().positive(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  /** Soft delete marker (spec §2). Null/undefined when not deleted. */
  deleted_at: z.string().datetime().nullable().optional(),

  /** Content payload — shape is up to the domain. */
  content: z.unknown(),

  /** USC seven-field tuple (Meridian extension on top of vanilla ContextSync). */
  usc: z.unknown().optional(),

  /** Cross-artifact relationships (Meridian extension). */
  links: z.array(LinkSchema).default([]),

  /** Full version history. */
  versions: z.array(VersionSchema).min(1),
});

export type Artifact = z.infer<typeof ArtifactSchema>;

// ---------- Actor (spec §3) ----------

export const ActorSchema = z.object({
  actor_id: z.string(),
  actor_type: z.enum(["human", "agent"]),
  name: z.string(),
  agent_class: z.string().nullable().optional(),
  created_at: z.string().datetime(),
});

export type Actor = z.infer<typeof ActorSchema>;

// ---------- Permission (spec §4) ----------

export const OPERATIONS = ["read", "write", "approve", "suggest", "admin"] as const;
export const OperationSchema = z.enum(OPERATIONS);
export type Operation = z.infer<typeof OperationSchema>;

export const PermissionGrantSchema = z
  .object({
    actor_id: z.string().optional(),
    agent_class: z.string().optional(),
    artifact_pattern: z.string(),
    operations: z.array(OperationSchema).min(1),
    created_at: z.string().datetime(),
    granted_by: z.string().optional(),
  })
  .refine(
    (g) => (g.actor_id ? !g.agent_class : !!g.agent_class),
    "PermissionGrant must specify exactly one of actor_id or agent_class",
  );

export type PermissionGrant = z.infer<typeof PermissionGrantSchema>;

// ---------- Provenance (spec §6) ----------

export const ProvenanceOperationSchema = z.enum(["read", "write"]);
export type ProvenanceOperation = z.infer<typeof ProvenanceOperationSchema>;

export const ProvenanceRecordSchema = z.object({
  prov_id: z.string(),
  actor_id: z.string(),
  operation: ProvenanceOperationSchema,
  artifact_uri: z.string(),
  /** Version of the artifact the operation touched. */
  version_touched: z.number().int().positive(),
  /** If this read informed a downstream write, link it here (spec §6). */
  downstream_uri: z.string().nullable().optional(),
  created_at: z.string().datetime(),
});

export type ProvenanceRecord = z.infer<typeof ProvenanceRecordSchema>;

// ---------- Change events (spec §5) ----------

export const ChangeEventTypeSchema = z.enum([
  "artifact.created",
  "artifact.updated",
  "artifact.deleted",
]);
export type ChangeEventType = z.infer<typeof ChangeEventTypeSchema>;

export const ChangeEventSchema = z.object({
  event_id: z.string(),
  event_type: ChangeEventTypeSchema,
  artifact_uri: z.string(),
  version: z.number().int().positive(),
  previous_version: z.number().int().positive().optional(),
  author_id: z.string(),
  summary: z.string(),
  diff_json: z.unknown().optional(),
  created_at: z.string().datetime(),
});

export type ChangeEvent = z.infer<typeof ChangeEventSchema>;
