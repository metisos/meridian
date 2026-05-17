"use client";
import type { Investigation, ProvenanceTail } from "@/lib/types";
import { EXPLAINERS } from "@/lib/explainers";
import { InfoTip } from "./InfoTip";
import { LiveDot, Pill } from "./atoms";

/* Renders an ISO timestamp so day-boundary changes are visible. Same shape as
   the Overview Provenance card: "HH:MM:SS" when today, "yest HH:MM:SS" for
   yesterday, "MM-DD · HH:MM:SS" otherwise. */
function timeOnly(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  const sameDay =
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60_000);
  const isYesterday =
    d.getUTCFullYear() === yesterday.getUTCFullYear() &&
    d.getUTCMonth() === yesterday.getUTCMonth() &&
    d.getUTCDate() === yesterday.getUTCDate();
  const hhmmss = d.toISOString().slice(11, 19);
  if (sameDay) return hhmmss;
  if (isYesterday) return `yest ${hhmmss}`;
  return `${d.toISOString().slice(5, 10)} · ${hhmmss}`;
}

export function ContextPanel({
  selected,
  provenance,
}: {
  selected: Investigation | null;
  provenance: ProvenanceTail[];
}) {
  return (
    <aside
      style={{
        width: 320,
        flexShrink: 0,
        background: "var(--bg-1)",
        borderLeft: "1px solid var(--bd-1)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--bd-1)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div className="overline-accent" style={{ flex: 1 }}>Context</div>
        <LiveDot />
        <span className="mono" style={{ fontSize: 10.5, color: "var(--accent-2)" }}>LIVE</span>
      </header>

      <div className="scroll" style={{ flex: 1, overflowY: "auto", padding: "16px 16px 24px" }}>
        {/* Provenance — the ContextSync immutable read/write log */}
        <div className="overline" style={{ marginBottom: 10, display: "inline-flex", alignItems: "center" }}>
          Provenance
          <InfoTip term="Provenance" width={320}>{EXPLAINERS.provenance}</InfoTip>
        </div>
        <div
          className="scroll"
          style={{
            background: "var(--bg-2)",
            border: "1px solid var(--bd-1)",
            borderRadius: 4,
            marginBottom: 22,
            maxHeight: 280,
            overflowY: "auto",
          }}
        >
          {provenance.length === 0 && (
            <div style={{ padding: 12, fontSize: 11.5, color: "var(--fg-3)" }}>
              No agent activity recorded yet.
            </div>
          )}
          {provenance.map((p, i) => (
            <div
              key={p.prov_id}
              style={{
                display: "grid",
                gridTemplateColumns: "62px 1fr",
                gap: 10,
                padding: "8px 12px",
                fontSize: 11.5,
                lineHeight: 1.4,
                borderTop: i === 0 ? "none" : "1px dashed var(--bd-1)",
              }}
            >
              <span className="mono" style={{ color: "var(--fg-3)", fontSize: 10.5 }}>
                {timeOnly(p.created_at)}
              </span>
              <div style={{ minWidth: 0 }}>
                <span style={{ color: p.operation === "write" ? "var(--accent-2)" : "var(--fg-1)", fontWeight: 500 }}>
                  {p.operation}
                </span>
                <span style={{ color: "var(--fg-2)" }}> by </span>
                <span style={{ color: "var(--fg-0)" }}>{p.actor_id}</span>
                <div
                  className="mono"
                  style={{
                    fontSize: 10,
                    color: "var(--fg-3)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    marginTop: 2,
                  }}
                >
                  {p.artifact_uri}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Similar past investigations */}
        <div className="overline" style={{ marginBottom: 10, display: "inline-flex", alignItems: "center" }}>
          Similar past investigations
          <InfoTip term="Similar past investigations" width={300}>{EXPLAINERS.similarInvestigations}</InfoTip>
        </div>
        {!selected || selected.similar_past_investigations.length === 0 ? (
          <div
            style={{
              padding: 12,
              fontSize: 11.5,
              color: "var(--fg-3)",
              background: "var(--bg-2)",
              border: "1px solid var(--bd-1)",
              borderRadius: 4,
              marginBottom: 22,
            }}
          >
            {selected ? "No similar past investigations." : "Select an incident to see related history."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 22 }}>
            {selected.similar_past_investigations.slice(0, 4).map((s) => (
              <div
                key={s.investigation_uri}
                style={{
                  background: "var(--bg-2)",
                  border: "1px solid var(--bd-1)",
                  borderRadius: 4,
                  padding: "10px 12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-3)", flex: 1 }}>
                    {s.investigation_uri.split("/").pop()}
                  </span>
                  <Pill color="accent" mono>{Math.round(s.similarity * 100)}%</Pill>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--fg-1)", lineHeight: 1.4 }}>
                  {s.root_cause_hypothesis
                    ? s.root_cause_hypothesis.slice(0, 120) + (s.root_cause_hypothesis.length > 120 ? "…" : "")
                    : "(no hypothesis text)"}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Selected entity */}
        {selected && selected.blast_radius.root_entity_uri && (
          <>
            <div className="overline" style={{ marginBottom: 10 }}>Root entity</div>
            <div
              style={{
                background: "var(--bg-2)",
                border: "1px solid var(--bd-1)",
                borderRadius: 4,
                padding: 12,
              }}
            >
              <div
                className="mono"
                style={{ fontSize: 11.5, color: "var(--fg-0)", marginBottom: 6, wordBreak: "break-all" }}
              >
                {selected.blast_radius.root_entity_uri}
              </div>
              <div style={{ fontSize: 11, color: "var(--fg-2)" }}>
                {selected.blast_radius.total_affected} downstream entities affected
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
