"use client";
import { useState } from "react";
import Link from "next/link";
import type { Investigation, BlastEntity } from "@/lib/types";
import { EXPLAINERS } from "@/lib/explainers";
import { InfoTip } from "./InfoTip";
import { Panel } from "./atoms";

interface PlacedNode {
  entity: BlastEntity;
  bucket: "infra" | "business" | "compliance";
  angle: number;
  ring: number;
  x: number;
  y: number;
}

const COLORS = {
  infra: "var(--info)",
  business: "var(--accent)",
  compliance: "var(--warn)",
} as const;

const BUCKET_LABELS = {
  infra: "Infrastructure",
  business: "Business",
  compliance: "Compliance",
} as const;

export function IncidentRiskGraph({ inv }: { inv: Investigation }) {
  const [selected, setSelected] = useState<PlacedNode | null>(null);
  const total = inv.blast_radius.total_affected;
  if (total === 0) {
    return (
      <div style={{ padding: 24 }}>
        <Empty>No entities affected — risk graph is empty for this investigation.</Empty>
      </div>
    );
  }

  // SVG canvas
  const W = 720;
  const H = 460;
  const cx = W / 2;
  const cy = H / 2 + 6;
  const rings = [120, 180, 240];

  // Group entities by ring (distance 1, 2, 3+)
  const byRing: Record<number, Array<{ entity: BlastEntity; bucket: "infra" | "business" | "compliance" }>> = {
    1: [],
    2: [],
    3: [],
  };
  const groups: Array<{
    bucket: "infra" | "business" | "compliance";
    items: BlastEntity[];
  }> = [
    { bucket: "infra", items: inv.blast_radius.infrastructure },
    { bucket: "business", items: inv.blast_radius.business },
    { bucket: "compliance", items: inv.blast_radius.compliance },
  ];
  for (const g of groups) {
    for (const e of g.items) {
      const ringIdx = Math.min(3, Math.max(1, e.distance));
      const slot = byRing[ringIdx as 1 | 2 | 3];
      if (slot) slot.push({ entity: e, bucket: g.bucket });
    }
  }

  // Place entities around the rings
  const placed: PlacedNode[] = [];
  for (const r of [1, 2, 3] as const) {
    const items = byRing[r];
    if (!items || items.length === 0) continue;
    const count = items.length;
    const radius = rings[r - 1]!;
    for (let i = 0; i < count; i++) {
      const item = items[i]!;
      const angle = (2 * Math.PI * i) / count - Math.PI / 2;
      placed.push({
        entity: item.entity,
        bucket: item.bucket,
        angle,
        ring: r,
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
      });
    }
  }

  const rootLabel = inv.blast_radius.root_entity_uri?.split("/").pop() ?? "root entity";

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
      <Panel
        title={
          <span style={{ display: "inline-flex", alignItems: "center" }}>
            Risk graph
            <InfoTip term="Risk graph" width={300}>{EXPLAINERS.riskGraph}</InfoTip>
          </span>
        }
        extra={
          <Legend />
        }
      >
        <div style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: "var(--fg-1)", lineHeight: 1.6, marginBottom: 14, maxWidth: 720 }}>
            {total} entit{total === 1 ? "y" : "ies"} downstream of the trigger event,
            grouped by hop distance and category. Click a node to see its
            classification.
          </div>

          <div style={{ display: "flex", justifyContent: "center", position: "relative" }}>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              width="100%"
              onClick={(e) => {
                if (e.target === e.currentTarget) setSelected(null);
              }}
              style={{
                maxWidth: W,
                display: "block",
                background: "var(--bg-1)",
                border: "1px solid var(--bd-1)",
                borderRadius: 4,
              }}
            >
              {/* Concentric rings */}
              {rings.map((r, i) => (
                <g key={r}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="none"
                    stroke="var(--bd-2)"
                    strokeWidth={1}
                    strokeDasharray="3,4"
                    opacity={0.6}
                  />
                  <text
                    x={cx + r + 6}
                    y={cy + 3}
                    fontSize={9}
                    fill="var(--fg-3)"
                    fontFamily="IBM Plex Mono, monospace"
                  >
                    d={i + 1}
                  </text>
                </g>
              ))}

              {/* Lines from root */}
              {placed.map((n) => (
                <line
                  key={`l-${n.entity.uri}`}
                  x1={cx}
                  y1={cy}
                  x2={n.x}
                  y2={n.y}
                  stroke={COLORS[n.bucket]}
                  strokeWidth={1}
                  opacity={0.35}
                />
              ))}

              {/* Root node */}
              <g>
                <circle cx={cx} cy={cy} r={22} fill="var(--bg-1)" stroke="var(--crit)" strokeWidth={2} />
                <circle cx={cx} cy={cy} r={9} fill="var(--crit)" opacity={0.85} />
                <text
                  x={cx}
                  y={cy + 36}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--fg-0)"
                  fontFamily="Inter, sans-serif"
                  fontWeight={600}
                >
                  trigger
                </text>
                <text
                  x={cx}
                  y={cy + 50}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--fg-3)"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {rootLabel.length > 30 ? rootLabel.slice(0, 27) + "…" : rootLabel}
                </text>
              </g>

              {/* Entity nodes */}
              {placed.map((n) => {
                const labelOffsetX = Math.cos(n.angle) * 14;
                const labelOffsetY = Math.sin(n.angle) * 14;
                const labelAnchor =
                  Math.cos(n.angle) > 0.3 ? "start" : Math.cos(n.angle) < -0.3 ? "end" : "middle";
                const isSelected = selected?.entity.uri === n.entity.uri;
                return (
                  <g
                    key={n.entity.uri}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected((cur) => (cur?.entity.uri === n.entity.uri ? null : n));
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    {isSelected && (
                      <circle
                        cx={n.x}
                        cy={n.y}
                        r={15}
                        fill="none"
                        stroke={COLORS[n.bucket]}
                        strokeWidth={2}
                        opacity={0.6}
                      />
                    )}
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={9}
                      fill={COLORS[n.bucket]}
                      opacity={isSelected ? 1 : 0.92}
                    />
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={9}
                      fill="none"
                      stroke="var(--bg-1)"
                      strokeWidth={2}
                    />
                    <text
                      x={n.x + labelOffsetX}
                      y={n.y + labelOffsetY + 3}
                      textAnchor={labelAnchor}
                      fontSize={10}
                      fill="var(--fg-0)"
                      fontFamily="Inter, sans-serif"
                      fontWeight={500}
                    >
                      {n.entity.name.length > 18 ? n.entity.name.slice(0, 15) + "…" : n.entity.name}
                    </text>
                    <text
                      x={n.x + labelOffsetX}
                      y={n.y + labelOffsetY + 15}
                      textAnchor={labelAnchor}
                      fontSize={8.5}
                      fill="var(--fg-3)"
                      fontFamily="IBM Plex Mono, monospace"
                    >
                      {n.entity.entity_type} · d={n.entity.distance}
                    </text>
                    <title>
                      {`${n.entity.name}\n${n.entity.entity_type}\n${BUCKET_LABELS[n.bucket]} · d=${n.entity.distance}`}
                    </title>
                  </g>
                );
              })}
            </svg>
            {selected && <NodeDetailCard node={selected} onClose={() => setSelected(null)} />}
          </div>

          {/* Group counts */}
          <div
            style={{
              marginTop: 18,
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 1,
              background: "var(--bd-1)",
              border: "1px solid var(--bd-1)",
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            {(["infra", "business", "compliance"] as const).map((bucket) => {
              const count =
                bucket === "infra"
                  ? inv.blast_radius.infrastructure.length
                  : bucket === "business"
                  ? inv.blast_radius.business.length
                  : inv.blast_radius.compliance.length;
              return (
                <div key={bucket} style={{ padding: "12px 16px", background: "var(--bg-1)" }}>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 10.5,
                      fontWeight: 600,
                      letterSpacing: 0.4,
                      textTransform: "uppercase",
                      color: COLORS[bucket],
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: 4, background: COLORS[bucket] }} />
                    {BUCKET_LABELS[bucket]}
                  </div>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 600, color: "var(--fg-0)" }}>
                    {count}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Panel>
    </div>
  );
}

function NodeDetailCard({
  node,
  onClose,
}: {
  node: PlacedNode;
  onClose: () => void;
}) {
  const color = COLORS[node.bucket];
  return (
    <div
      style={{
        position: "absolute",
        left: 16,
        bottom: 16,
        width: 320,
        padding: "14px 16px",
        background: "var(--bg-1)",
        border: "1px solid var(--bd-2)",
        borderRadius: 5,
        boxShadow: "var(--shadow-2)",
        fontSize: 12,
        zIndex: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "2px 8px",
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            color,
            background:
              node.bucket === "infra"
                ? "var(--info-soft)"
                : node.bucket === "business"
                ? "var(--accent-soft)"
                : "var(--warn-soft)",
            border: `1px solid ${color}55`,
            borderRadius: 3,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 4, background: color }} />
          {BUCKET_LABELS[node.bucket]}
        </span>
        <span style={{ flex: 1 }} />
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            border: "1px solid var(--bd-2)",
            background: "transparent",
            color: "var(--fg-2)",
            cursor: "pointer",
            fontSize: 12,
            lineHeight: 1,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ✕
        </button>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-0)", letterSpacing: -0.1 }}>
        {node.entity.name}
      </div>
      <div
        className="mono"
        style={{ fontSize: 10.5, color: "var(--fg-3)", marginTop: 2 }}
      >
        {node.entity.entity_type} · d={node.entity.distance}
      </div>
      <div
        className="mono"
        style={{
          fontSize: 10,
          color: "var(--fg-3)",
          marginTop: 6,
          wordBreak: "break-all",
        }}
        title={node.entity.uri}
      >
        {node.entity.uri}
      </div>
      <Link
        href={`/app/incidents?entity=${encodeURIComponent(node.entity.uri)}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          marginTop: 12,
          padding: "6px 12px",
          background: "var(--accent)",
          color: "var(--accent-text)",
          border: "none",
          borderRadius: 3,
          fontSize: 11.5,
          fontWeight: 600,
          textDecoration: "none",
          letterSpacing: 0.1,
        }}
      >
        Filter incidents by entity →
      </Link>
    </div>
  );
}

function Legend() {
  return (
    <div style={{ display: "flex", gap: 14, fontSize: 10.5, color: "var(--fg-2)" }}>
      {(["infra", "business", "compliance"] as const).map((b) => (
        <span key={b} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 7, height: 7, borderRadius: 4, background: COLORS[b] }} />
          {BUCKET_LABELS[b]}
        </span>
      ))}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "32px 24px",
        textAlign: "center",
        color: "var(--fg-2)",
        fontSize: 13,
        background: "var(--bg-1)",
        border: "1px dashed var(--bd-2)",
        borderRadius: 6,
      }}
    >
      {children}
    </div>
  );
}
