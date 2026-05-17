import { describe, it, expect } from "vitest";
import { aggregateConfidence } from "../src/confidence.js";

describe("aggregateConfidence (geometric mean, whitepaper §4.3)", () => {
  it("returns 0 for empty input (no evidence = no confidence)", () => {
    expect(aggregateConfidence([])).toBe(0);
  });

  it("returns the only score when input has one element", () => {
    expect(aggregateConfidence([0.7])).toBeCloseTo(0.7, 10);
  });

  it("returns the geometric mean of multiple scores", () => {
    // ∛(0.5 · 0.5 · 0.5) = 0.5
    expect(aggregateConfidence([0.5, 0.5, 0.5])).toBeCloseTo(0.5, 10);
    // √(0.9 · 0.81) ≈ 0.854
    expect(aggregateConfidence([0.9, 0.81])).toBeCloseTo(0.854, 3);
  });

  it("a single zero drives the result to zero (no over-claim)", () => {
    expect(aggregateConfidence([0.99, 0.99, 0])).toBe(0);
  });

  it("matches the worked-example aggregate of 0.878 and 0.946", () => {
    // √(0.878 · 0.946) ≈ 0.9114
    expect(aggregateConfidence([0.878, 0.946])).toBeCloseTo(0.9114, 3);
  });

  it("rejects out-of-range scores", () => {
    expect(() => aggregateConfidence([0.5, 1.5])).toThrow(RangeError);
    expect(() => aggregateConfidence([-0.1, 0.5])).toThrow(RangeError);
  });
});
