import { describe, it, expect } from "vitest";
import { SCENARIOS, mulberry32, cascadingFailure } from "../src/scenarios/index.js";

describe("scenario archetypes", () => {
  it("has all 5 archetypes registered", () => {
    const names = SCENARIOS.map((s) => s.name).sort();
    expect(names).toEqual([
      "auth-bruteforce",
      "cascading-failure",
      "data-exfiltration",
      "ddos-surge",
      "privilege-escalation",
    ]);
  });

  it("each scenario builds non-empty chronologically-ordered events", () => {
    for (const s of SCENARIOS) {
      const ev = s.build({ baseTimeMs: 1_700_000_000_000, index: "main", rng: mulberry32(42) });
      expect(ev.length, `${s.name} should emit events`).toBeGreaterThan(10);
      for (let i = 1; i < ev.length; i++) {
        expect(ev[i]!.time).toBeGreaterThanOrEqual(ev[i - 1]!.time);
      }
      // every event has the required fields
      for (const e of ev) {
        expect(typeof e.sourcetype).toBe("string");
        expect(typeof e.index).toBe("string");
        expect(typeof e.time).toBe("number");
      }
    }
  });

  it("cascading-failure reproduces the PRD §9.1 sequence", () => {
    const ev = cascadingFailure.build({ baseTimeMs: 1_700_000_000_000, index: "main", rng: mulberry32(1) });
    const sourcetypes = new Set(ev.map((e) => e.sourcetype));
    expect(sourcetypes).toContain("webapp:deploy");
    expect(sourcetypes).toContain("metrics:host");
    expect(sourcetypes).toContain("db:error");
    expect(sourcetypes).toContain("webapp:error");
    expect(sourcetypes).toContain("webapp:access");
    // Spans roughly 5 minutes
    const span = ev[ev.length - 1]!.time - ev[0]!.time;
    expect(span).toBeGreaterThanOrEqual(4 * 60);
    expect(span).toBeLessThanOrEqual(7 * 60);
  });

  it("deterministic seed produces identical events", () => {
    const a = cascadingFailure.build({ baseTimeMs: 1_700_000_000_000, index: "main", rng: mulberry32(123) });
    const b = cascadingFailure.build({ baseTimeMs: 1_700_000_000_000, index: "main", rng: mulberry32(123) });
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]!.time).toBe(b[i]!.time);
      expect(a[i]!.host).toBe(b[i]!.host);
    }
  });
});
