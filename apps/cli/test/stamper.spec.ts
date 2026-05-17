import { describe, it, expect } from "vitest";
import { stampEvents, canonicalEventText } from "../src/pipeline/stamper.js";
import type { EmbeddingBackend } from "@meridian/usc";

/** Deterministic in-test embedding backend so we don't load the real model. */
const fakeBackend: EmbeddingBackend = {
  async embed() {
    return new Array(768).fill(0).map((_, i) => (i % 2 === 0 ? 0.01 : -0.01));
  },
  async embedBatch(texts) {
    return texts.map((_, i) =>
      new Array(768).fill(0).map((_, j) => (j === i % 768 ? 1 : 0)),
    );
  },
};

const event = (over: Record<string, unknown>): Parameters<typeof stampEvents>[0][number] => ({
  _time: "2026-05-20T14:03:01.000Z",
  _raw: "raw event text",
  sourcetype: "db:error",
  host: "prod-db-03",
  index: "main",
  ...over,
} as Parameters<typeof stampEvents>[0][number]);

describe("stamper", () => {
  it("canonicalEventText prefers msg over _raw", () => {
    const t = canonicalEventText({ ...event({}), msg: "pool exhausted" } as never);
    expect(t).toContain("pool exhausted");
    expect(t).toContain("db:error");
    expect(t).toContain("prod-db-03");
  });

  it("stamps a single event with all 7 USC fields", async () => {
    const [out] = await stampEvents([event({})], { embeddingBackend: fakeBackend });
    expect(out!.usc.tier).toBe("temporal");
    expect(out!.usc.temporal).toBe("2026-05-20T14:03:01.000Z");
    expect(out!.usc.spatial.host).toBe("prod-db-03");
    expect(out!.usc.spatial_uncertainty).toBe(0);
    expect(out!.usc.temporal_uncertainty_ms).toBe(50);
    expect(out!.usc.provenance.source_system).toBe("splunk");
    expect(out!.usc.provenance.fidelity).toBe("high");
    expect(out!.usc.embedding).toHaveLength(768);
  });

  it("produces deterministic URIs from event content (idempotent re-ingest)", async () => {
    const a = await stampEvents([event({})], { embeddingBackend: fakeBackend });
    const b = await stampEvents([event({})], { embeddingBackend: fakeBackend });
    expect(a[0]!.uri).toBe(b[0]!.uri);
    expect(a[0]!.uri).toMatch(/^ctx:\/\/meridian\/splunk-events\/evt_[a-f0-9]{16}$/);
  });

  it("different events produce different URIs", async () => {
    const out = await stampEvents(
      [event({}), event({ _raw: "different content", _time: "2026-05-20T14:04:00.000Z" })],
      { embeddingBackend: fakeBackend },
    );
    expect(out[0]!.uri).not.toBe(out[1]!.uri);
  });

  it("batches embedding calls", async () => {
    let batchCount = 0;
    const counting: EmbeddingBackend = {
      async embed() {
        return new Array(768).fill(0);
      },
      async embedBatch(texts) {
        batchCount++;
        return texts.map(() => new Array(768).fill(0));
      },
    };
    await stampEvents([event({}), event({ _raw: "b" }), event({ _raw: "c" })], { embeddingBackend: counting });
    expect(batchCount).toBe(1);
  });

  it("parses Splunk-style space-separated UTC time as well as ISO", async () => {
    const out = await stampEvents(
      [event({ _time: "2026-05-20 14:03:01.045 UTC" })],
      { embeddingBackend: fakeBackend },
    );
    expect(out[0]!.usc.temporal).toBe("2026-05-20T14:03:01.045Z");
  });
});
