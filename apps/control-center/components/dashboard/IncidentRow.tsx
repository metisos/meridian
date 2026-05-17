"use client";
import type { Investigation } from "@/lib/types";
import { Pill, Dot } from "./atoms";

function severityColor(sev: Investigation["severity"]) {
  if (sev === "critical") return "var(--crit)";
  if (sev === "high") return "var(--accent)";
  if (sev === "medium") return "var(--info)";
  return "var(--fg-3)";
}

function statusPill(status: Investigation["status"]) {
  if (status === "open") return <Pill color="crit">Open</Pill>;
  if (status === "monitoring") return <Pill color="accent">Monitoring</Pill>;
  return <Pill color="ok">Resolved</Pill>;
}

function firstSentence(text: string): string {
  const s = text.split(/(?<=[.!?])\s+/)[0] ?? text;
  return s.length > 140 ? s.slice(0, 137) + "…" : s;
}

function timeAgo(iso: string): string {
  const sec = Math.floor((Date.now() - Date.parse(iso)) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function IncidentRow({
  inv,
  selected,
  onSelect,
}: {
  inv: Investigation;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      style={{
        position: "relative",
        textAlign: "left",
        cursor: "pointer",
        padding: "14px 18px 14px 22px",
        background: selected ? "var(--bg-2)" : "var(--bg-1)",
        border: "1px solid var(--bd-1)",
        borderLeft: `3px solid ${severityColor(inv.severity)}`,
        borderRadius: 4,
        width: "100%",
        color: "inherit",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-3)" }}>
          {inv.investigation_uri.split("/").pop()}
        </span>
        <span style={{ width: 1, height: 10, background: "var(--bd-2)" }} />
        <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-2)" }}>
          {timeAgo(inv.created_at)}
        </span>
        <span style={{ flex: 1 }} />
        {statusPill(inv.status)}
        <Pill color="accent" mono>
          {Math.round(inv.confidence * 100)}%
        </Pill>
      </div>

      <div
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: "var(--fg-0)",
          lineHeight: 1.35,
          marginBottom: 6,
        }}
      >
        {firstSentence(inv.root_cause_hypothesis)}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 11.5, color: "var(--fg-2)" }}>
        {inv.blast_radius.infrastructure.length > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Dot color="info" /> {inv.blast_radius.infrastructure.length} infrastructure
          </span>
        )}
        {inv.blast_radius.business.length > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Dot color="warn" /> {inv.blast_radius.business.length} business
          </span>
        )}
        {inv.blast_radius.compliance.length > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Dot color="crit" /> {inv.blast_radius.compliance.length} compliance
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-3)" }}>
          {inv.causal_chain.length} events in chain
        </span>
      </div>
    </button>
  );
}
