import { describe, it, expect } from "vitest";
import { diffContent } from "../src/diff.js";

describe("diffContent", () => {
  it("reports zero changes for identical inputs", () => {
    const r = diffContent("a\nb\nc", "a\nb\nc");
    expect(r.stats).toEqual({ added_lines: 0, removed_lines: 0, unchanged_lines: 3 });
  });

  it("counts pure additions", () => {
    const r = diffContent("a\nb", "a\nb\nc");
    expect(r.stats.added_lines).toBe(1);
    expect(r.stats.removed_lines).toBe(0);
  });

  it("counts pure removals", () => {
    const r = diffContent("a\nb\nc", "a\nc");
    expect(r.stats.added_lines).toBe(0);
    expect(r.stats.removed_lines).toBe(1);
  });

  it("handles substitutions (one add + one remove)", () => {
    const r = diffContent("a\nb\nc", "a\nB\nc");
    expect(r.stats.added_lines).toBe(1);
    expect(r.stats.removed_lines).toBe(1);
  });

  it("serializes non-string content via JSON for diff input", () => {
    const r = diffContent({ a: 1 }, { a: 2 });
    expect(r.stats.added_lines + r.stats.removed_lines).toBeGreaterThan(0);
  });
});
