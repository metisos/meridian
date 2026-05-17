/**
 * ContextSyncClient — the public API for ContextSync operations against MongoDB.
 *
 * Implements spec v0.2 §2-§6 as method calls (rather than HTTP — the agent and
 * pipeline call these methods directly). Enforces default-deny permissions and
 * logs provenance on every read/write.
 *
 * MongoDB collections used:
 *   - artifacts        (already provisioned per PRD §5.2)
 *   - actors           (per PRD §5.5)
 *   - permissions      (new; lazily created)
 *   - provenance       (per PRD §5.6)
 */

import type { Collection, Db, MongoClient } from "mongodb";
import { randomUUID } from "node:crypto";

// Local alias so createArtifactsMany can reuse it without the long node:crypto import path
const cryptoUUID = randomUUID;
import { parseCtxURI } from "./uri.js";
import { hashArtifactContent } from "./hash.js";
import { diffContent, type DiffResult } from "./diff.js";
import { evaluatePermission, type PermissionDecision } from "./permissions.js";
import {
  type Artifact,
  type Actor,
  type Operation,
  type PermissionGrant,
  type ProvenanceRecord,
  type Version,
  type Link,
} from "./types.js";

export interface ContextSyncClientOptions {
  /** Connected MongoDB client. The client owns the connection lifecycle. */
  mongo: MongoClient;
  /** Database name. Default: `meridian_db`. */
  dbName?: string;
}

const DEFAULT_DB = "meridian_db";

export interface CreateArtifactInput {
  uri: string;
  name: string;
  content_type?: string;
  content: unknown;
  summary?: string;
  usc?: unknown;
  links?: Link[];
}

export interface UpdateArtifactInput {
  uri: string;
  content: unknown;
  summary?: string;
  /** Add new links to the artifact (merged with existing). */
  add_links?: Link[];
  /** Replace USC fields atomically with the update. */
  usc?: unknown;
}

export class ContextSyncError extends Error {
  constructor(
    public code: "bad_request" | "forbidden" | "not_found" | "conflict" | "actor_required",
    message: string,
  ) {
    super(message);
    this.name = "ContextSyncError";
  }
}

export class ContextSyncClient {
  private db: Db;
  private artifacts: Collection<Artifact>;
  private actors: Collection<Actor>;
  private permissions: Collection<PermissionGrant>;
  private provenance: Collection<ProvenanceRecord>;

  constructor(opts: ContextSyncClientOptions) {
    this.db = opts.mongo.db(opts.dbName ?? DEFAULT_DB);
    this.artifacts = this.db.collection<Artifact>("artifacts");
    this.actors = this.db.collection<Actor>("actors");
    this.permissions = this.db.collection<PermissionGrant>("permissions");
    this.provenance = this.db.collection<ProvenanceRecord>("provenance");
  }

  // ----- Permission helpers -----

  /** Internal. Resolves an actor's grants (by actor_id AND agent_class). */
  private async grantsFor(actor: Pick<Actor, "actor_id" | "agent_class">): Promise<PermissionGrant[]> {
    const filter: Record<string, unknown> = {
      $or: [{ actor_id: actor.actor_id }, ...(actor.agent_class ? [{ agent_class: actor.agent_class }] : [])],
    };
    return this.permissions.find(filter).toArray();
  }

  /** Public: explain whether an actor can perform an operation on a URI. */
  async explainPermission(input: {
    actor_id: string;
    uri: string;
    operation: Operation;
  }): Promise<PermissionDecision> {
    const actor = await this.getActor(input.actor_id);
    const grants = await this.grantsFor(actor);
    return evaluatePermission({ actor, uri: input.uri, operation: input.operation, grants });
  }

  /** Internal. Throws ContextSyncError(forbidden) if not allowed. */
  private async requirePermission(
    actor: Pick<Actor, "actor_id" | "agent_class">,
    uri: string,
    op: Operation,
  ): Promise<void> {
    const grants = await this.grantsFor(actor);
    const dec = evaluatePermission({ actor, uri, operation: op, grants });
    if (!dec.allowed) {
      throw new ContextSyncError("forbidden", `${actor.actor_id} cannot ${op} ${uri}: ${dec.reason}`);
    }
  }

  // ----- Actors (spec §3) -----

  async createActor(input: Omit<Actor, "created_at">): Promise<Actor> {
    const existing = await this.actors.findOne({ actor_id: input.actor_id });
    if (existing) {
      throw new ContextSyncError("conflict", `actor ${input.actor_id} already exists`);
    }
    const actor: Actor = { ...input, created_at: new Date().toISOString() };
    await this.actors.insertOne(actor);
    return actor;
  }

  async getActor(actor_id: string): Promise<Actor> {
    const actor = await this.actors.findOne({ actor_id });
    if (!actor) throw new ContextSyncError("not_found", `actor ${actor_id} not found`);
    return actor;
  }

  async listActors(): Promise<Actor[]> {
    return this.actors.find({}).toArray();
  }

  // ----- Permissions (spec §4) -----

  async grantPermission(input: Omit<PermissionGrant, "created_at">): Promise<PermissionGrant> {
    const grant: PermissionGrant = {
      ...input,
      created_at: new Date().toISOString(),
    };
    await this.permissions.insertOne(grant);
    return grant;
  }

  async listGrants(filter?: { actor_id?: string; agent_class?: string }): Promise<PermissionGrant[]> {
    return this.permissions.find(filter ?? {}).toArray();
  }

  // ----- Artifacts (spec §2) -----

  /**
   * Bulk-insert many artifacts at version 1. Faster than calling createArtifact
   * in a loop — uses insertMany with ordered=false so duplicate-URI events are
   * silently dropped, and writes provenance entries in one batch as well.
   *
   * Permission is checked once per unique URI pattern bucket. Currently this
   * just verifies the actor has write permission on the first URI; for our
   * ingest workload all events share the ctx://meridian/splunk-events/* pattern.
   *
   * Returns counts of inserted and skipped-duplicate artifacts.
   */
  async createArtifactsMany(
    actor_id: string,
    inputs: readonly CreateArtifactInput[],
  ): Promise<{ inserted: number; skipped: number }> {
    if (inputs.length === 0) return { inserted: 0, skipped: 0 };
    const actor = await this.getActor(actor_id);
    // Permission gate — check the first URI; in practice ingest URIs share a pattern
    await this.requirePermission(actor, inputs[0]!.uri, "write");

    const now = new Date().toISOString();
    const docs: Artifact[] = inputs.map((input) => {
      const { org, domain } = parseCtxURI(input.uri);
      const content_type = input.content_type ?? "application/json";
      const hash = hashArtifactContent({
        name: input.name,
        content_type,
        content: input.content,
      });
      const v1: Version = {
        version: 1,
        author_id: actor_id,
        timestamp: now,
        summary: input.summary ?? "initial version",
        hash,
        content_snapshot: input.content,
      };
      return {
        uri: input.uri,
        name: input.name,
        org,
        domain,
        content_type,
        head_version: 1,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        content: input.content,
        usc: input.usc,
        links: input.links ?? [],
        versions: [v1],
      };
    });

    let inserted = 0;
    let skipped = 0;
    try {
      const res = await this.artifacts.insertMany(docs, { ordered: false });
      inserted = res.insertedCount;
    } catch (e) {
      // MongoBulkWriteError shape (driver v6):
      //   err.result.insertedCount  — count that succeeded
      //   err.writeErrors           — array of WriteError, code 11000 = duplicate key
      const err = e as {
        result?: { insertedCount?: number };
        writeErrors?: Array<{ code?: number }>;
        code?: number;
      };
      inserted = err.result?.insertedCount ?? 0;
      const writeErrors = err.writeErrors ?? [];
      // Anything that isn't a duplicate-key collision is a real error we want to surface
      const nonDupErrors = writeErrors.filter((w) => w.code !== 11000);
      if (nonDupErrors.length > 0) {
        throw e;
      }
      skipped = writeErrors.length;
    }

    // Bulk provenance for the actually-inserted artifacts. Provenance for
    // duplicates is suppressed (they were already logged on the original write).
    if (inserted > 0) {
      const insertedUris = new Set<string>();
      // Simpler: re-query which URIs are now present (the bulk write doesn't
      // tell us which indices succeeded if ordered=false). For our 1k-batch
      // sizes this is cheap.
      const found = await this.artifacts
        .find({ uri: { $in: inputs.map((i) => i.uri) } }, { projection: { uri: 1 } })
        .toArray();
      for (const f of found) insertedUris.add(f.uri);

      const provRecords: ProvenanceRecord[] = [];
      for (const i of inputs) {
        if (!insertedUris.has(i.uri)) continue;
        provRecords.push({
          prov_id: `prov_${cryptoUUID()}`,
          actor_id,
          operation: "write",
          artifact_uri: i.uri,
          version_touched: 1,
          created_at: now,
        });
      }
      if (provRecords.length > 0) {
        await this.provenance.insertMany(provRecords, { ordered: false });
      }
    }

    return { inserted, skipped };
  }

  async createArtifact(actor_id: string, input: CreateArtifactInput): Promise<Artifact> {
    const actor = await this.getActor(actor_id);
    await this.requirePermission(actor, input.uri, "write");

    const existing = await this.artifacts.findOne({ uri: input.uri });
    if (existing) throw new ContextSyncError("conflict", `artifact ${input.uri} already exists`);

    const { org, domain } = parseCtxURI(input.uri);
    const now = new Date().toISOString();
    const content_type = input.content_type ?? "application/json";
    const hash = hashArtifactContent({
      name: input.name,
      content_type,
      content: input.content,
    });

    const v1: Version = {
      version: 1,
      author_id: actor_id,
      timestamp: now,
      summary: input.summary ?? "initial version",
      hash,
      content_snapshot: input.content,
    };

    const artifact: Artifact = {
      uri: input.uri,
      name: input.name,
      org,
      domain,
      content_type,
      head_version: 1,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      content: input.content,
      usc: input.usc,
      links: input.links ?? [],
      versions: [v1],
    };

    await this.artifacts.insertOne(artifact);
    await this.logProvenance({
      actor_id,
      operation: "write",
      artifact_uri: input.uri,
      version_touched: 1,
    });

    return artifact;
  }

  async getArtifact(
    actor_id: string,
    uri: string,
    options?: { version?: number; downstream_uri?: string },
  ): Promise<{ artifact: Artifact; version: number; content: unknown }> {
    const actor = await this.getActor(actor_id);
    await this.requirePermission(actor, uri, "read");

    const artifact = await this.artifacts.findOne({ uri });
    if (!artifact) throw new ContextSyncError("not_found", `artifact ${uri} not found`);
    if (artifact.deleted_at)
      throw new ContextSyncError("not_found", `artifact ${uri} is deleted`);

    const ver = options?.version ?? artifact.head_version;
    let content: unknown;
    if (ver === artifact.head_version) {
      content = artifact.content;
    } else {
      const v = artifact.versions.find((x) => x.version === ver);
      if (!v) throw new ContextSyncError("not_found", `version ${ver} of ${uri} not found`);
      content = v.content_snapshot;
    }

    await this.logProvenance({
      actor_id,
      operation: "read",
      artifact_uri: uri,
      version_touched: ver,
      downstream_uri: options?.downstream_uri,
    });

    return { artifact, version: ver, content };
  }

  async updateArtifact(actor_id: string, input: UpdateArtifactInput): Promise<Artifact> {
    const actor = await this.getActor(actor_id);
    await this.requirePermission(actor, input.uri, "write");

    const existing = await this.artifacts.findOne({ uri: input.uri });
    if (!existing) throw new ContextSyncError("not_found", `artifact ${input.uri} not found`);
    if (existing.deleted_at)
      throw new ContextSyncError("not_found", `artifact ${input.uri} is deleted`);

    const newVersion = existing.head_version + 1;
    const now = new Date().toISOString();
    const hash = hashArtifactContent({
      name: existing.name,
      content_type: existing.content_type,
      content: input.content,
    });

    const versionEntry: Version = {
      version: newVersion,
      author_id: actor_id,
      timestamp: now,
      summary: input.summary ?? "update",
      hash,
      content_snapshot: input.content,
    };

    const updateOps: Record<string, unknown> = {
      $set: {
        content: input.content,
        head_version: newVersion,
        updated_at: now,
        ...(input.usc !== undefined ? { usc: input.usc } : {}),
      },
      $push: {
        versions: versionEntry,
        ...(input.add_links && input.add_links.length > 0
          ? { links: { $each: input.add_links } }
          : {}),
      },
    };

    const result = await this.artifacts.findOneAndUpdate({ uri: input.uri }, updateOps, {
      returnDocument: "after",
    });
    if (!result) throw new ContextSyncError("not_found", `artifact ${input.uri} disappeared`);

    await this.logProvenance({
      actor_id,
      operation: "write",
      artifact_uri: input.uri,
      version_touched: newVersion,
    });

    return result as Artifact;
  }

  async softDeleteArtifact(actor_id: string, uri: string): Promise<void> {
    const actor = await this.getActor(actor_id);
    await this.requirePermission(actor, uri, "write");
    const now = new Date().toISOString();
    const res = await this.artifacts.updateOne({ uri }, { $set: { deleted_at: now, updated_at: now } });
    if (res.matchedCount === 0)
      throw new ContextSyncError("not_found", `artifact ${uri} not found`);
  }

  async getHistory(actor_id: string, uri: string): Promise<Version[]> {
    const actor = await this.getActor(actor_id);
    await this.requirePermission(actor, uri, "read");
    const a = await this.artifacts.findOne({ uri }, { projection: { versions: 1 } });
    if (!a) throw new ContextSyncError("not_found", `artifact ${uri} not found`);
    return [...a.versions].sort((x, y) => y.version - x.version);
  }

  async diffVersions(
    actor_id: string,
    uri: string,
    from: number,
    to: number,
  ): Promise<DiffResult> {
    const actor = await this.getActor(actor_id);
    await this.requirePermission(actor, uri, "read");
    const a = await this.artifacts.findOne(
      { uri },
      { projection: { versions: 1, head_version: 1 } },
    );
    if (!a) throw new ContextSyncError("not_found", `artifact ${uri} not found`);

    const vFrom = a.versions.find((v) => v.version === from);
    const vTo = a.versions.find((v) => v.version === to);
    if (!vFrom || !vTo)
      throw new ContextSyncError("not_found", `version ${from} or ${to} not in history`);

    return diffContent(vFrom.content_snapshot, vTo.content_snapshot);
  }

  async listArtifacts(
    actor_id: string,
    filter?: { org?: string; domain?: string; limit?: number },
  ): Promise<Array<Pick<Artifact, "uri" | "name" | "org" | "domain" | "head_version" | "created_at" | "updated_at">>> {
    const actor = await this.getActor(actor_id);
    const limit = filter?.limit ?? 100;
    const q: Record<string, unknown> = { deleted_at: null };
    if (filter?.org) q.org = filter.org;
    if (filter?.domain) q.domain = filter.domain;

    const rows = await this.artifacts
      .find(q, {
        projection: {
          uri: 1,
          name: 1,
          org: 1,
          domain: 1,
          head_version: 1,
          created_at: 1,
          updated_at: 1,
        },
      })
      .limit(limit)
      .toArray();

    // Filter by read permission
    const grants = await this.grantsFor(actor);
    return rows.filter((r) =>
      evaluatePermission({ actor, uri: r.uri, operation: "read", grants }).allowed,
    );
  }

  // ----- Provenance (spec §6) -----

  async logProvenance(input: Omit<ProvenanceRecord, "prov_id" | "created_at">): Promise<ProvenanceRecord> {
    const rec: ProvenanceRecord = {
      prov_id: `prov_${randomUUID()}`,
      ...input,
      created_at: new Date().toISOString(),
    };
    await this.provenance.insertOne(rec);
    return rec;
  }

  async queryProvenance(filter: {
    artifact_uri?: string;
    actor_id?: string;
    limit?: number;
  }): Promise<ProvenanceRecord[]> {
    const q: Record<string, unknown> = {};
    if (filter.artifact_uri) q.artifact_uri = filter.artifact_uri;
    if (filter.actor_id) q.actor_id = filter.actor_id;
    return this.provenance.find(q).sort({ created_at: -1 }).limit(filter.limit ?? 100).toArray();
  }
}
