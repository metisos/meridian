/**
 * @meridian/contextsync — ContextSync Protocol v0.2 implementation
 *
 * Spec source: https://github.com/metisos/contextsync-protocol/blob/main/SPEC.md
 *
 * Provides URI semantics, artifact CRUD with versioning + content hashing,
 * actor registry, default-deny permission evaluation, immutable provenance,
 * and line-level diff.
 */

export const CONTEXTSYNC_PACKAGE = "@meridian/contextsync" as const;

// Types
export {
  type Artifact,
  type Version,
  type Link,
  type Actor,
  type Operation,
  type PermissionGrant,
  type ProvenanceRecord,
  type ProvenanceOperation,
  type ChangeEvent,
  type ChangeEventType,
  OPERATIONS,
  ArtifactSchema,
  VersionSchema,
  LinkSchema,
  ActorSchema,
  PermissionGrantSchema,
  ProvenanceRecordSchema,
  ChangeEventSchema,
} from "./types.js";

// URI
export { parseCtxURI, buildCtxURI, compilePattern, matchPattern, type ParsedCtxURI } from "./uri.js";

// Hash + diff
export { hashArtifactContent, canonicalJSONStringify } from "./hash.js";
export { diffContent, type DiffResult, type DiffOp } from "./diff.js";

// Permissions
export { evaluatePermission, type PermissionDecision } from "./permissions.js";

// Client
export {
  ContextSyncClient,
  ContextSyncError,
  type ContextSyncClientOptions,
  type CreateArtifactInput,
  type UpdateArtifactInput,
} from "./client.js";
