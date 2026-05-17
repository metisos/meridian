import { describe, it, expect } from "vitest";
import { l2Normalize, applyPrefix } from "../src/embedding.js";

describe("l2Normalize", () => {
  it("scales an arbitrary vector to unit length", () => {
    const v = [3, 4]; // |v| = 5
    const out = l2Normalize(v);
    expect(out[0]).toBeCloseTo(0.6, 10);
    expect(out[1]).toBeCloseTo(0.8, 10);
    const norm = Math.sqrt(out[0]! ** 2 + out[1]! ** 2);
    expect(norm).toBeCloseTo(1.0, 10);
  });

  it("is idempotent for unit vectors", () => {
    const v = [1, 0, 0];
    const out = l2Normalize([...v]);
    expect(out).toEqual(v);
  });

  it("handles zero-vector input without dividing by zero", () => {
    const v = [0, 0, 0];
    expect(l2Normalize(v)).toEqual([0, 0, 0]);
  });
});

describe("applyPrefix (nomic prompt asymmetry)", () => {
  it("prepends 'search_document:' for documents", () => {
    expect(applyPrefix("hello", "document")).toBe("search_document: hello");
  });
  it("prepends 'search_query:' for queries", () => {
    expect(applyPrefix("hello", "query")).toBe("search_query: hello");
  });
});
