/**
 * Scenario archetype interface — each archetype emits a self-contained set of
 * events that tell one incident story. Scenarios are time-relative (offsetMs
 * from a base time); the bulk runner re-anchors them across a span.
 */

import type { HecEvent } from "../hec.js";

export interface ScenarioContext {
  /** Wall-clock anchor for T+0 of this incident instance. */
  baseTimeMs: number;
  /** Splunk index to land events in. */
  index: string;
  /** Per-instance random suffix so repeated invocations produce different IDs/hosts/IPs. */
  rng: () => number;
}

export interface Scenario {
  /** Stable identifier ("cascading-failure", "auth-bruteforce", etc.) */
  name: string;
  /** One-line human description. */
  description: string;
  /** Build all events for one instance of this scenario. */
  build(ctx: ScenarioContext): HecEvent[];
}
