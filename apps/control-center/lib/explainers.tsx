"use client";
import type { ReactNode } from "react";

/* Single source of truth for every "what is this?" explainer in the UI.
   Centralized so the wording stays consistent across the page and we can
   tune for the hackathon judges in one place. */

export const EXPLAINERS: Record<string, ReactNode> = {
  confidence: (
    <>
      The agent&apos;s confidence that this hypothesis is correct. Derived from
      the <em>geometric mean</em> of cross-tier match scores across the causal
      chain — every claim that contributes loses its support if any single
      link is weak.
    </>
  ),

  severity: (
    <>
      Inferred from agent confidence + size of the affected entity set.{" "}
      <strong>Critical</strong> when confidence ≥ 85% and ≥ 3 entities affected.{" "}
      <strong>High</strong> when confidence ≥ 70% or ≥ 2 entities. <strong>Medium</strong>{" "}
      at ≥ 40%. <strong>Low</strong> below.
    </>
  ),

  status: (
    <>
      <strong>Open</strong> — investigation opened in the last hour, requires
      immediate review. <strong>Monitoring</strong> — older than an hour, not
      yet resolved, agent is watching for new related events. <strong>Resolved</strong> —
      the incident has been marked closed.
    </>
  ),

  causalChain: (
    <>
      The agent&apos;s reconstruction of the sequence of events that led to
      this incident, ordered by USC temporal coordinate. Each step is an
      artifact whose spatial and temporal coordinates were close enough to the
      next to support a causal link.
    </>
  ),

  uscTemporal: (
    <>
      The <strong>Unified Spatiotemporal Coordinate</strong> — a 7-field tuple{" "}
      ⟨s, t, σ<sub>s</sub>, σ<sub>t</sub>, π, τ, e⟩ that locates every artifact
      in space and time with measurable uncertainty. Two events &quot;match&quot;
      via{" "}
      <code style={{ fontSize: 10.5, color: "var(--accent)" }}>
        C = exp(-d<sub>s</sub>²/(2(σ<sub>s</sub>²+r<sub>s</sub>²))) · exp(-d
        <sub>t</sub>²/(2(σ<sub>t</sub>²+r<sub>t</sub>²)))
      </code>
      .
    </>
  ),

  blastRadius: (
    <>
      Every entity downstream of the trigger event, computed by traversing the
      entity dependency graph. Categorized as <strong>Infrastructure</strong>{" "}
      (hosts, services), <strong>Business</strong> (clients, SLAs), or{" "}
      <strong>Compliance</strong> (regulatory controls).
    </>
  ),

  distance: (
    <>
      Hops in the entity dependency graph from the root entity.{" "}
      <strong>d=1</strong> is directly affected. <strong>d=2</strong> is a
      neighbor of a directly-affected entity. <strong>d=3</strong> is three
      relationships removed.
    </>
  ),

  ctxUri: (
    <>
      A <strong>ContextSync Protocol</strong> artifact identifier. Format:{" "}
      <code style={{ fontSize: 10.5 }}>ctx://&#123;org&#125;/&#123;domain&#125;/&#123;id&#125;</code>
      . Every event Meridian sees becomes a versioned, content-addressed
      artifact with this URI. Provenance is recorded for every read and write.
    </>
  ),

  recommendedActions: (
    <>
      Actions the agent surfaced from the investigation, ordered by priority.
      The agent does <strong>not</strong> execute them — it surfaces them for
      review by the SRE / SOC team. Priority is set by the agent based on
      severity and reversibility.
    </>
  ),

  similarInvestigations: (
    <>
      Past investigations whose embeddings are close to this one in vector
      space — surfaced via Atlas Vector Search over the agent_memory
      collection. Useful for spotting recurring failure patterns.
    </>
  ),

  provenance: (
    <>
      The ContextSync <strong>provenance log</strong> — an append-only record
      of every read and write any actor performs against the artifact store.
      Each entry is keyed by actor, operation, artifact URI, and timestamp.
      Provenance is how Meridian proves what the agent saw, what it touched,
      and what it inferred — defensible against audit and the basis for the
      &quot;source-bound&quot; guarantee on every claim.
    </>
  ),

  correlation: (
    <>
      How Meridian decides two events are causally related. The cross-tier
      match formula compares each pair&apos;s spatial and temporal coordinates
      against their combined uncertainty. Events scoring above the threshold
      are linked into the causal chain.
    </>
  ),

  riskGraph: (
    <>
      The entity dependency graph projected from the trigger event. Rings show
      distance from the root: directly affected (d=1), neighbors (d=2),
      transitively affected (d=3). Color codes the entity type: blue =
      infrastructure, green = business, amber = compliance.
    </>
  ),

  riskMapHeat: (
    <>
      How many <strong>investigations</strong> have touched this entity, either
      as the root trigger or somewhere in the blast radius. Bigger and brighter
      nodes are getting hit more often — they&apos;re where the agent&apos;s
      attention has been concentrated.
    </>
  ),

  riskMapEnvironment: (
    <>
      Every entity that appears in any past investigation, grouped by category.
      In production this would be enriched with assets that <em>haven&apos;t</em>
      {" "}been investigated yet by joining against the static{" "}
      <code style={{ fontSize: 10.5 }}>entity_graph</code> collection.
    </>
  ),

  categoryInfrastructure: (
    <>
      Hosts, services, databases, and other operational components. Failures
      here typically propagate downstream into business and compliance impact.
    </>
  ),

  categoryBusiness: (
    <>
      Customer-facing entities — tenants, SLAs, revenue-linked services. An
      incident touching a business entity is by definition CISO-visible.
    </>
  ),

  categoryCompliance: (
    <>
      Regulatory controls, audit obligations, retention policies. Incidents
      touching compliance entities trigger disclosure timers and audit cycles.
    </>
  ),

  inspectorInvestigations: (
    <>
      Every past investigation that recorded this entity in its blast radius.
      Click any row to open that investigation in the Incidents tab.
    </>
  ),

  inspectorConnections: (
    <>
      Other entities that share an investigation with this one. The thicker
      the implied dependency, the more often Meridian has linked them through
      a common incident.
    </>
  ),
};
