import { describe, it, expect } from "vitest";
import { canonicalJSONStringify, hashArtifactContent } from "../src/hash.js";

describe("canonical JSON", () => {
  it("sorts object keys recursively", () => {
    const a = canonicalJSONStringify({ b: 1, a: { y: 2, x: 1 } });
    const b = canonicalJSONStringify({ a: { x: 1, y: 2 }, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe(`{"a":{"x":1,"y":2},"b":1}`);
  });

  it("treats arrays as ordered (does not sort)", () => {
    expect(canonicalJSONStringify([1, 2, 3])).toBe("[1,2,3]");
    expect(canonicalJSONStringify([3, 2, 1])).toBe("[3,2,1]");
  });

  it("handles primitives and nulls", () => {
    expect(canonicalJSONStringify(null)).toBe("null");
    expect(canonicalJSONStringify(true)).toBe("true");
    expect(canonicalJSONStringify(42)).toBe("42");
    expect(canonicalJSONStringify("a\"b")).toBe(`"a\\"b"`);
  });

  it("rejects non-finite numbers", () => {
    expect(() => canonicalJSONStringify(NaN)).toThrow();
    expect(() => canonicalJSONStringify(Infinity)).toThrow();
  });
});

describe("hashArtifactContent", () => {
  it("is deterministic across object key orderings", () => {
    const h1 = hashArtifactContent({
      name: "x",
      content_type: "application/json",
      content: { a: 1, b: 2 },
    });
    const h2 = hashArtifactContent({
      name: "x",
      content_type: "application/json",
      content: { b: 2, a: 1 },
    });
    expect(h1).toBe(h2);
  });

  it("changes when content changes", () => {
    const h1 = hashArtifactContent({ name: "x", content_type: "text/plain", content: "v1" });
    const h2 = hashArtifactContent({ name: "x", content_type: "text/plain", content: "v2" });
    expect(h1).not.toBe(h2);
  });

  it("returns sha256: prefix and 64 hex chars", () => {
    const h = hashArtifactContent({ name: "x", content_type: "text/plain", content: "v1" });
    expect(h).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
