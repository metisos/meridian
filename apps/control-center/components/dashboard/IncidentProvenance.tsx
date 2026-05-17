"use client";
import { useEffect, useMemo, useState } from "react";
import type { Investigation } from "@/lib/types";
import type { ProvenanceGraphData } from "@/lib/provenanceGraph";
import { EXPLAINERS } from "@/lib/explainers";
import { InfoTip } from "./InfoTip";
import { Panel } from "./atoms";

const DOMAIN_COLOR: Record<string, string> = {
  "splunk-events": "var(--info)",
  investigations: "var(--accent)",
  server: "var(--info)",
  service: "var(--info)",
  client: "var(--accent)",
  compliance: "var(--warn)",
  sla: "var(--accent)",
};

function domainColor(domain: string): string {
  return DOMAIN_COLOR[domain] ?? "var(--fg-3)";
}

export function IncidentProvenance({ inv }: { inv: Investigation }) {
  const [data, setData] = useState<ProvenanceGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoverActor, setHoverActor] = useState<string | null>(null);
  const [hoverArtifact, setHoverArtifact] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`/api/provenance-graph?id=${encodeURIComponent(inv.investigation_uri)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { data: ProvenanceGraphData }) => {
        if (cancelled) return;
        setData(d.data);
        setLoading(false);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [inv.investigation_uri]);

  if (loading) {
    return (
      <div style={{ padding: 24, color: "var(--fg-2)", fontSize: 13 }}>
        Loading provenance entries…
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: 24, color: "var(--crit)", fontSize: 13 }}>
        Failed to load provenance: {error}
      </div>
    );
  }
  if (!data || data.edges.length === 0) {
    return (
      <div style={{ padding: 24, color: "var(--fg-2)", fontSize: 13 }}>
        No provenance entries recorded for this investigation.
      </div>
    );
  }

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
      <Panel
        title={
          <span style={{ display: "inline-flex", alignItems: "center" }}>
            Provenance trace · {data.total_entries} entries
            <InfoTip term="Provenance trace" width={320}>{EXPLAINERS.provenance}</InfoTip>
          </span>
        }
        extra={
          <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>
            {data.scoped_artifact_count} artifacts scoped
          </span>
        }
      >
        <div style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: "var(--fg-1)", lineHeight: 1.6, marginBottom: 14 }}>
            Bipartite trace of every read and write captured in the ContextSync provenance log
            for this investigation. Actor on the left; artifacts the agent touched on the right,
            grouped by domain. Edges colored by operation: green = write, blue = read.
          </div>
          <ProvenanceSVG
            data={data}
            hoverActor={hoverActor}
            hoverArtifact={hoverArtifact}
            onHoverActor={setHoverActor}
            onHoverArtifact={setHoverArtifact}
          />
        </div>
      </Panel>
    </div>
  );
}

function ProvenanceSVG({
  data,
  hoverActor,
  hoverArtifact,
  onHoverActor,
  onHoverArtifact,
}: {
  data: ProvenanceGraphData;
  hoverActor: string | null;
  hoverArtifact: string | null;
  onHoverActor: (a: string | null) => void;
  onHoverArtifact: (a: string | null) => void;
}) {
  const W = 880;
  const ACTOR_X = 140;
  const ARTIFACT_X = 720;
  const TOP = 30;
  const ROW = 30;

  // Group artifacts by domain, sort within each domain
  const byDomain = useMemo(() => {
    const m = new Map<string, ProvenanceGraphData["artifacts"]>();
    for (const a of data.artifacts) {
      if (!m.has(a.domain)) m.set(a.domain, []);
      m.get(a.domain)!.push(a);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => b.writes + b.reads - (a.writes + a.reads));
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [data.artifacts]);

  // Compute Y positions
  const artifactY = useMemo(() => {
    const out = new Map<string, number>();
    let y = TOP;
    for (const [, arr] of byDomain) {
      y += 22; // domain header
      for (const a of arr) {
        out.set(a.uri, y);
        y += ROW;
      }
      y += 8;
    }
    return out;
  }, [byDomain]);

  const actorY = useMemo(() => {
    const out = new Map<string, number>();
    const totalH = data.actors.length * 60;
    const startY = TOP + 120 - totalH / 2;
    data.actors.forEach((a, i) => out.set(a.id, Math.max(TOP, startY + i * 60)));
    return out;
  }, [data.actors]);

  const lastY = Math.max(
    ...Array.from(artifactY.values()),
    ...Array.from(actorY.values()),
    TOP,
  );
  const H = lastY + 40;

  // Edge highlight: an edge is "focus" if either endpoint is hovered
  const focusEdge = (edge: typeof data.edges[number]) =>
    (hoverActor && edge.actor_id === hoverActor) ||
    (hoverArtifact && edge.artifact_uri === hoverArtifact);

  return (
    <div
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--bd-1)",
        borderRadius: 4,
        overflow: "auto",
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: "block", minWidth: 720 }}
      >
        {/* Edges first so nodes sit on top */}
        {data.edges.map((e, i) => {
          const ay = actorY.get(e.actor_id);
          const by = artifactY.get(e.artifact_uri);
          if (ay == null || by == null) return null;
          const isFocus = focusEdge(e);
          const stroke = e.operation === "write" ? "var(--accent)" : "var(--info)";
          const opacity = isFocus ? 0.85 : hoverActor || hoverArtifact ? 0.08 : 0.22;
          // Cubic bezier
          const c1x = ACTOR_X + 80;
          const c2x = ARTIFACT_X - 80;
          return (
            <path
              key={i}
              d={`M ${ACTOR_X} ${ay} C ${c1x} ${ay}, ${c2x} ${by}, ${ARTIFACT_X} ${by}`}
              stroke={stroke}
              strokeWidth={isFocus ? 2 : 1}
              fill="none"
              opacity={opacity}
            />
          );
        })}

        {/* Actor labels */}
        {data.actors.map((a) => {
          const y = actorY.get(a.id);
          if (y == null) return null;
          const isHover = hoverActor === a.id;
          return (
            <g
              key={a.id}
              onMouseEnter={() => onHoverActor(a.id)}
              onMouseLeave={() => onHoverActor(null)}
              style={{ cursor: "pointer" }}
            >
              <rect
                x={ACTOR_X - 130}
                y={y - 16}
                width={130}
                height={32}
                rx={4}
                fill={isHover ? "var(--accent-soft)" : "var(--bg-2)"}
                stroke={isHover ? "var(--accent)" : "var(--bd-2)"}
                strokeWidth={1}
              />
              <text
                x={ACTOR_X - 10}
                y={y - 2}
                textAnchor="end"
                fontSize={11.5}
                fontWeight={600}
                fill="var(--fg-0)"
                fontFamily="Inter, sans-serif"
              >
                {a.display_name}
              </text>
              <text
                x={ACTOR_X - 10}
                y={y + 10}
                textAnchor="end"
                fontSize={9.5}
                fill="var(--fg-3)"
                fontFamily="IBM Plex Mono, monospace"
              >
                {a.reads}r · {a.writes}w
              </text>
              <circle
                cx={ACTOR_X}
                cy={y}
                r={5}
                fill={isHover ? "var(--accent)" : "var(--fg-2)"}
                stroke="var(--bg-1)"
                strokeWidth={2}
              />
            </g>
          );
        })}

        {/* Artifact labels with domain headers */}
        {(() => {
          const els: React.ReactNode[] = [];
          let y = TOP;
          for (const [domain, arr] of byDomain) {
            els.push(
              <text
                key={`dh-${domain}`}
                x={ARTIFACT_X + 14}
                y={y + 12}
                fontSize={9}
                fontWeight={600}
                letterSpacing={1.4}
                fontFamily="IBM Plex Mono, monospace"
                fill={domainColor(domain)}
              >
                {domain.toUpperCase()} · {arr.length}
              </text>,
            );
            y += 22;
            for (const a of arr) {
              const isHover = hoverArtifact === a.uri;
              const color = domainColor(a.domain);
              els.push(
                <g
                  key={a.uri}
                  onMouseEnter={() => onHoverArtifact(a.uri)}
                  onMouseLeave={() => onHoverArtifact(null)}
                  style={{ cursor: "pointer" }}
                >
                  <circle
                    cx={ARTIFACT_X}
                    cy={y}
                    r={5}
                    fill={isHover ? color : "var(--bg-1)"}
                    stroke={color}
                    strokeWidth={isHover ? 2.5 : 1.5}
                  />
                  <text
                    x={ARTIFACT_X + 14}
                    y={y + 4}
                    fontSize={11}
                    fill="var(--fg-0)"
                    fontFamily="IBM Plex Mono, monospace"
                    fontWeight={isHover ? 600 : 500}
                  >
                    {a.short_id.length > 36 ? a.short_id.slice(0, 33) + "…" : a.short_id}
                  </text>
                  <text
                    x={W - 12}
                    y={y + 4}
                    textAnchor="end"
                    fontSize={9.5}
                    fill="var(--fg-3)"
                    fontFamily="IBM Plex Mono, monospace"
                  >
                    {a.reads > 0 && (
                      <tspan fill="var(--info)" fontWeight={600}>
                        {a.reads}r
                      </tspan>
                    )}
                    {a.reads > 0 && a.writes > 0 && " · "}
                    {a.writes > 0 && (
                      <tspan fill="var(--accent)" fontWeight={600}>
                        {a.writes}w
                      </tspan>
                    )}
                  </text>
                </g>,
              );
              y += ROW;
            }
            y += 8;
          }
          return els;
        })()}
      </svg>
      <div
        style={{
          padding: "10px 16px",
          borderTop: "1px solid var(--bd-1)",
          display: "flex",
          gap: 16,
          fontSize: 11,
          color: "var(--fg-2)",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 14, height: 2, background: "var(--info)" }} /> read
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 14, height: 2, background: "var(--accent)" }} /> write
        </span>
        <span style={{ flex: 1 }} />
        <span className="mono">
          {data.earliest && data.latest && data.earliest !== data.latest
            ? `${new Date(data.earliest).toISOString().slice(11, 19)} → ${new Date(data.latest).toISOString().slice(11, 19)} UTC`
            : data.earliest
            ? new Date(data.earliest).toISOString().slice(0, 19) + " UTC"
            : ""}
        </span>
      </div>
    </div>
  );
}
