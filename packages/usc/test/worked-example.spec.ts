/**
 * Whitepaper §4.5 worked example — the proof-point for the math layer.
 *
 * Query: Founders Lounge AI Summit keynote, 2026-04-23, stage center (10, 13, 0),
 * 14:15:00 local, spatial radius rs = 3m, temporal radius rt = 15min.
 *
 * Four primitives, expected scores from the whitepaper:
 *
 *   | Primitive                       | Tier      | ds (m) | dt (s)  | C(p,Q)   |
 *   |---------------------------------|-----------|--------|---------|----------|
 *   | Splat region near stage         | spatial   |  1.52  |    60   |  0.878   |
 *   | Scheduled keynote event         | temporal  |  0.00  |   300   |  0.946   |
 *   | Format decision (3 days prior)  | cognitive |  0.00  | 258 900 |  0.011   |
 *   | Unrelated splat across hall     | spatial   | 13.68  |     0   |  ~3e-5   |
 *
 * For our formula to match the published table, we set σs and σt to small values
 * so the dominant denominator is the query radius (rs, rt). The whitepaper
 * doesn't publish σ values for the worked example; the standard inference is
 * σs ≈ 0, σt ≈ 0 — the query radii are the operative widths.
 *
 * Tolerances are ±0.005 on the headline scores; the format-decision and
 * unrelated-splat values are well below the 0.05 threshold either way.
 */

import { describe, it, expect } from "vitest";
import { crossTierMatch } from "../src/match.js";

// rs = 3m, rt = 15 min = 900,000 ms
const QUERY = {
  spatial: { lat: 13.0, lng: 10.0 }, // stage center
  temporal: "2026-04-23T14:15:00.000Z",
  spatial_radius: 3,
  temporal_radius_ms: 15 * 60 * 1000,
};

describe("USC worked example (whitepaper §4.5)", () => {
  it("splat region near stage scores ~0.878", () => {
    // ds = 1.52m, dt = 60s
    const C = crossTierMatch({
      primitive: {
        // Place the splat 1.52m away in lat space (degrees ≈ meters for this toy frame)
        spatial: { lat: 13.0, lng: 10.0 + 1.52 },
        temporal: "2026-04-23T14:16:00.000Z", // +60s
        spatial_uncertainty: 0,
        temporal_uncertainty_ms: 0,
      },
      query: QUERY,
    });
    expect(C).toBeCloseTo(0.878, 2);
  });

  it("scheduled keynote event scores ~0.946", () => {
    // ds = 0, dt = 300s
    const C = crossTierMatch({
      primitive: {
        spatial: { lat: 13.0, lng: 10.0 },
        temporal: "2026-04-23T14:20:00.000Z", // +300s
        spatial_uncertainty: 0,
        temporal_uncertainty_ms: 0,
      },
      query: QUERY,
    });
    expect(C).toBeCloseTo(0.946, 2);
  });

  it("format decision 3 days prior scores ~0.011 (below threshold)", () => {
    // ds = 0, dt = 258900s ≈ 71.92h
    // Cognitive primitives carry meaningful temporal uncertainty. A decision
    // recorded ~3 days ago has σt on the order of a day. Setting σt = 24h
    // back-solves to C ≈ 0.011 against rt = 15min — this is the published
    // whitepaper value and demonstrates the whole point of the example:
    // uncertainty determines whether the cognitive primitive surfaces at all.
    const C = crossTierMatch({
      primitive: {
        spatial: { lat: 13.0, lng: 10.0 },
        temporal: "2026-04-20T14:23:00.000Z", // -258900s
        spatial_uncertainty: 0,
        temporal_uncertainty_ms: 24 * 60 * 60 * 1000, // 24h
      },
      query: QUERY,
    });
    expect(C).toBeCloseTo(0.011, 2);
    expect(C).toBeLessThan(0.05); // below the default match threshold
  });

  it("unrelated splat across hall scores ~3e-5 (effectively excluded)", () => {
    // ds = 13.68m, dt = 0
    const C = crossTierMatch({
      primitive: {
        spatial: { lat: 13.0, lng: 10.0 + 13.68 },
        temporal: "2026-04-23T14:15:00.000Z",
        spatial_uncertainty: 0,
        temporal_uncertainty_ms: 0,
      },
      query: QUERY,
    });
    expect(C).toBeLessThan(1e-4);
    expect(C).toBeGreaterThan(0);
  });
});

describe("crossTierMatch properties", () => {
  it("returns 1.0 when the primitive sits exactly on the query with zero uncertainty", () => {
    const C = crossTierMatch({
      primitive: {
        spatial: { lat: 13, lng: 10 },
        temporal: "2026-04-23T14:15:00.000Z",
        spatial_uncertainty: 0,
        temporal_uncertainty_ms: 0,
      },
      query: QUERY,
    });
    expect(C).toBeCloseTo(1.0, 6);
  });

  it("σs adds to rs in the denominator (the crucial whitepaper §4.2 property)", () => {
    // Same primitive, but with σs raised. Score should increase: confidence region grew.
    const base = crossTierMatch({
      primitive: {
        spatial: { lat: 13, lng: 10 + 4 },
        temporal: "2026-04-23T14:15:00.000Z",
        spatial_uncertainty: 0,
        temporal_uncertainty_ms: 0,
      },
      query: QUERY,
    });
    const fuzzy = crossTierMatch({
      primitive: {
        spatial: { lat: 13, lng: 10 + 4 },
        temporal: "2026-04-23T14:15:00.000Z",
        spatial_uncertainty: 5,
        temporal_uncertainty_ms: 0,
      },
      query: QUERY,
    });
    expect(fuzzy).toBeGreaterThan(base);
  });

  it("returns 0 when spatial spaces are incomparable", () => {
    // Primitive has only a host; query has lat/lng. ds is Infinity, factor goes to 0.
    const C = crossTierMatch({
      primitive: {
        spatial: { host: "prod-db-03" },
        temporal: "2026-04-23T14:15:00.000Z",
        spatial_uncertainty: 0,
        temporal_uncertainty_ms: 0,
      },
      query: QUERY,
    });
    expect(C).toBe(0);
  });
});
