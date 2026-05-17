/**
 * End-to-end round-trip against the real Atlas cluster.
 *
 * Skipped automatically when MONGODB_URI is not set in the environment, so the
 * suite stays green in CI and on dev workstations that don't have credentials
 * sourced. To run locally:
 *
 *   set -a && source .env.local && set +a
 *   pnpm --filter @meridian/contextsync test
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoClient } from "mongodb";
import { ContextSyncClient, ContextSyncError } from "../src/index.js";
import type { PermissionGrant } from "../src/types.js";

const URI = process.env.MONGODB_URI;
const SKIP = !URI;
const TEST_DB = "meridian_test";

// vitest's `describe.skip` makes the skipped tests visible in the report
const dbg = SKIP ? describe.skip : describe;

dbg("ContextSync end-to-end (Atlas)", () => {
  let mongo: MongoClient;
  let client: ContextSyncClient;
  // unique URI prefix per run so concurrent test runs don't collide
  const runId = Math.random().toString(36).slice(2, 10);
  const ART_URI = `ctx://meridian-test/run-${runId}/artifact-1`;
  const HUMAN = `human-test-${runId}`;
  const AGENT = `agent-test-${runId}`;

  beforeAll(async () => {
    mongo = new MongoClient(URI!);
    await mongo.connect();
    // Use a separate test DB to keep meridian_db clean
    const db = mongo.db(TEST_DB);
    // Wipe any state from a previous run (idempotent)
    await Promise.all([
      db.collection("artifacts").deleteMany({}),
      db.collection("actors").deleteMany({}),
      db.collection("permissions").deleteMany({}),
      db.collection("provenance").deleteMany({}),
    ]);
    client = new ContextSyncClient({ mongo, dbName: TEST_DB });
  });

  afterAll(async () => {
    if (mongo) await mongo.close();
  });

  it("seeds actors and grants permissions", async () => {
    await client.createActor({
      actor_id: HUMAN,
      actor_type: "human",
      name: "CISO Test User",
    });
    await client.createActor({
      actor_id: AGENT,
      actor_type: "agent",
      name: "Test ingest agent",
      agent_class: "data-ingestion",
    });
    await client.grantPermission({
      actor_id: HUMAN,
      artifact_pattern: "ctx://meridian-test/**",
      operations: ["admin"],
    } as Omit<PermissionGrant, "created_at">);
    await client.grantPermission({
      agent_class: "data-ingestion",
      artifact_pattern: "ctx://meridian-test/**",
      operations: ["write"],
    } as Omit<PermissionGrant, "created_at">);

    expect((await client.listActors()).length).toBeGreaterThanOrEqual(2);
  });

  it("creates an artifact, retrieves it, history shows v1", async () => {
    const created = await client.createArtifact(AGENT, {
      uri: ART_URI,
      name: "Initial event",
      content_type: "application/json",
      content: { msg: "first message", level: "INFO" },
      summary: "initial ingestion",
    });
    expect(created.head_version).toBe(1);
    expect(created.versions).toHaveLength(1);
    expect(created.versions[0]!.hash).toMatch(/^sha256:[a-f0-9]{64}$/);

    const fetched = await client.getArtifact(HUMAN, ART_URI);
    expect(fetched.version).toBe(1);
    expect((fetched.content as { msg: string }).msg).toBe("first message");

    const history = await client.getHistory(HUMAN, ART_URI);
    expect(history).toHaveLength(1);
  });

  it("updates the artifact and history shows v2", async () => {
    const v2 = await client.updateArtifact(AGENT, {
      uri: ART_URI,
      content: { msg: "second message", level: "ERROR" },
      summary: "level escalated",
    });
    expect(v2.head_version).toBe(2);
    expect(v2.versions).toHaveLength(2);
    expect(v2.versions[0]!.hash).not.toBe(v2.versions[1]!.hash);

    const history = await client.getHistory(HUMAN, ART_URI);
    expect(history.map((v) => v.version)).toEqual([2, 1]); // descending
  });

  it("retrieves historical content by version", async () => {
    const v1Read = await client.getArtifact(HUMAN, ART_URI, { version: 1 });
    expect(v1Read.version).toBe(1);
    expect((v1Read.content as { msg: string }).msg).toBe("first message");
    expect((v1Read.content as { level: string }).level).toBe("INFO");

    const v2Read = await client.getArtifact(HUMAN, ART_URI, { version: 2 });
    expect(v2Read.version).toBe(2);
    expect((v2Read.content as { msg: string }).msg).toBe("second message");
    expect((v2Read.content as { level: string }).level).toBe("ERROR");
  });

  it("diffs two real historical versions", async () => {
    const d = await client.diffVersions(HUMAN, ART_URI, 1, 2);
    // The JSON serialization of v1 and v2 differs in two fields (msg + level)
    expect(d.stats.added_lines + d.stats.removed_lines).toBeGreaterThan(0);
    // Diffing v2 against itself should be all-unchanged
    const same = await client.diffVersions(HUMAN, ART_URI, 2, 2);
    expect(same.stats.added_lines).toBe(0);
    expect(same.stats.removed_lines).toBe(0);
  });

  it("logs provenance for both writes and the reads", async () => {
    const prov = await client.queryProvenance({ artifact_uri: ART_URI });
    // Expect at least: write v1, read v1, write v2, plus the read we just did
    expect(prov.length).toBeGreaterThanOrEqual(3);
    const ops = prov.map((p) => p.operation);
    expect(ops).toContain("read");
    expect(ops).toContain("write");
    expect(prov[0]!.prov_id).toMatch(/^prov_/);
  });

  it("default-denies unknown actor", async () => {
    await expect(
      client.getArtifact("does-not-exist", ART_URI),
    ).rejects.toBeInstanceOf(ContextSyncError);
  });

  it("default-denies actor with no grant on a different URI namespace", async () => {
    await client.createActor({
      actor_id: `agent-stranger-${runId}`,
      actor_type: "agent",
      name: "Stranger",
      agent_class: "outsider",
    });
    await expect(
      client.getArtifact(`agent-stranger-${runId}`, ART_URI),
    ).rejects.toBeInstanceOf(ContextSyncError);
  });

  it("listArtifacts filters by read permission", async () => {
    const list = await client.listArtifacts(HUMAN, { org: "meridian-test" });
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.find((a) => a.uri === ART_URI)).toBeTruthy();
  });

  it("explainPermission returns a decision with a reason", async () => {
    const ok = await client.explainPermission({
      actor_id: HUMAN,
      uri: ART_URI,
      operation: "write",
    });
    expect(ok.allowed).toBe(true);
    expect(ok.matched_grant?.operations).toContain("admin");

    const denied = await client.explainPermission({
      actor_id: `agent-stranger-${runId}`,
      uri: ART_URI,
      operation: "read",
    });
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toMatch(/default-deny/);
  });

  it("soft-deletes the artifact and read becomes 404", async () => {
    await client.softDeleteArtifact(HUMAN, ART_URI);
    await expect(client.getArtifact(HUMAN, ART_URI)).rejects.toBeInstanceOf(ContextSyncError);
  });
});
