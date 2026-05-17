"use client";
import { useState } from "react";
import Link from "next/link";
import type { Investigation } from "@/lib/types";
import { EXPLAINERS } from "@/lib/explainers";
import { InfoTip } from "./InfoTip";
import { Panel, Pill } from "./atoms";
import { ConfidencePill } from "./ConfidencePill";
import { BusinessImpactLine } from "./BusinessImpactLine";
import { ReplayDrawer } from "./ReplayDrawer";
import { HybridRecallPanel } from "./HybridRecallPanel";
import { PatternsBadge } from "./PatternsBadge";
import { IncidentCorrelation } from "./IncidentCorrelation";
import { IncidentRiskGraph } from "./IncidentRiskGraph";
import { IncidentProvenance } from "./IncidentProvenance";
import { deriveLatencyStamp } from "@/lib/latencyStamp";

type Tab = "detail" | "correlation" | "risk" | "provenance";

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour12: false, timeZone: "UTC" }) + " UTC";
}

function fmtDuration(startIso: string | undefined, endIso: string | undefined): string {
  if (!startIso || !endIso) return "—";
  const ms = Date.parse(endIso) - Date.parse(startIso);
  if (Number.isNaN(ms) || ms < 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m ${s % 60}s`;
  return `${(s / 3600).toFixed(1)}h`;
}

export function IncidentDetail({ inv }: { inv: Investigation }) {
  const [tab, setTab] = useState<Tab>("detail");
  const [replayOpen, setReplayOpen] = useState(false);

  const firstStep = inv.causal_chain[0];
  const lastStep = inv.causal_chain[inv.causal_chain.length - 1];
  const duration = fmtDuration(firstStep?.usc_temporal, lastStep?.usc_temporal);

  return (
    <div className="scroll" style={{ flex: 1, overflowY: "auto" }}>
      {/* Sticky header: title + summary stats + sub-tabs */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--bg-1)", borderBottom: "1px solid var(--bd-1)" }}>
        <div style={{ padding: "18px 24px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)", display: "inline-flex", alignItems: "center" }}>
              {inv.investigation_uri}
              <InfoTip term="ctx:// URI" width={300}>{EXPLAINERS.ctxUri}</InfoTip>
            </span>
            <span style={{ flex: 1 }} />
            <button
              onClick={() => setReplayOpen(true)}
              title="Replay the 7-step agent loop"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                background: "var(--accent)",
                color: "var(--accent-text)",
                border: "none",
                borderRadius: 3,
                fontSize: 11.5,
                fontWeight: 600,
                cursor: "pointer",
                letterSpacing: 0.1,
              }}
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 2L10 6L3 10V2Z" fill="currentColor" />
              </svg>
              Replay
            </button>
            <ConfidencePill inv={inv} />
            <InfoTip term="Confidence" width={300}>{EXPLAINERS.confidence}</InfoTip>
            <Pill color={inv.status === "open" ? "crit" : inv.status === "monitoring" ? "accent" : "ok"}>
              {inv.status === "open" ? "Open" : inv.status === "monitoring" ? "Monitoring" : "Resolved"}
            </Pill>
            <InfoTip term="Status" width={300}>{EXPLAINERS.status}</InfoTip>
          </div>
          <h2
            style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 600,
              color: "var(--fg-0)",
              letterSpacing: -0.2,
              lineHeight: 1.35,
            }}
          >
            {inv.root_cause_hypothesis.split(/(?<=[.!?])\s+/)[0]}
          </h2>

          <LatencyStamp inv={inv} />
          <BusinessImpactLine investigationUri={inv.investigation_uri} />
          <PatternsBadge investigationUri={inv.investigation_uri} />

          {/* Summary stats strip */}
          <div
            style={{
              marginTop: 14,
              display: "grid",
              gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
              gap: 1,
              background: "var(--bd-1)",
              border: "1px solid var(--bd-1)",
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            <SummaryStat
              label={
                <>
                  Severity
                  <InfoTip term="Severity" width={320}>{EXPLAINERS.severity}</InfoTip>
                </>
              }
              value={
                <span style={{ color: severityColor(inv.severity), textTransform: "capitalize" }}>
                  {inv.severity}
                </span>
              }
            />
            <SummaryStat
              label={
                <>
                  Events in chain
                  <InfoTip term="Causal chain" width={320}>{EXPLAINERS.causalChain}</InfoTip>
                </>
              }
              value={inv.causal_chain.length.toString()}
            />
            <SummaryStat
              label="Window"
              value={duration}
              sub={firstStep ? `from ${fmtTime(firstStep.usc_temporal).slice(0, 8)}` : undefined}
            />
            <SummaryStat
              label={
                <>
                  Entities affected
                  <InfoTip term="Blast radius" width={320}>{EXPLAINERS.blastRadius}</InfoTip>
                </>
              }
              value={inv.blast_radius.total_affected.toString()}
              sub={`I·${inv.blast_radius.infrastructure.length} · B·${inv.blast_radius.business.length} · C·${inv.blast_radius.compliance.length}`}
            />
            <SummaryStat
              label="Actions"
              value={inv.actions_recommended.length.toString()}
              sub={
                inv.actions_recommended.filter((a) => a.priority === "critical" || a.priority === "high").length +
                " high / crit"
              }
            />
          </div>
        </div>

        {/* Sub-tabs */}
        <nav style={{ display: "flex", padding: "0 24px" }}>
          <SubTab label="Detail" active={tab === "detail"} onClick={() => setTab("detail")} />
          <SubTab label="Correlation" active={tab === "correlation"} onClick={() => setTab("correlation")} />
          <SubTab label="Risk graph" active={tab === "risk"} onClick={() => setTab("risk")} />
          <SubTab label="Provenance" active={tab === "provenance"} onClick={() => setTab("provenance")} />
        </nav>
      </div>

      {/* Body */}
      {tab === "detail" && <DetailBody inv={inv} />}
      {tab === "correlation" && <IncidentCorrelation inv={inv} />}
      {tab === "risk" && <IncidentRiskGraph inv={inv} />}
      {tab === "provenance" && <IncidentProvenance inv={inv} />}

      <ReplayDrawer inv={inv} open={replayOpen} onClose={() => setReplayOpen(false)} />
    </div>
  );
}

function SubTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "10px 16px 12px",
        background: "transparent",
        color: active ? "var(--fg-0)" : "var(--fg-2)",
        border: "none",
        borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`,
        marginBottom: -1,
        fontSize: 12.5,
        fontWeight: active ? 600 : 500,
        letterSpacing: 0.1,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function SummaryStat({
  label,
  value,
  sub,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div style={{ background: "var(--bg-1)", padding: "10px 14px", minWidth: 0 }}>
      <div
        className="overline"
        style={{
          fontSize: 9.5,
          display: "inline-flex",
          alignItems: "center",
        }}
      >
        {label}
      </div>
      <div
        className="mono"
        style={{
          fontSize: 17,
          fontWeight: 600,
          color: "var(--fg-0)",
          letterSpacing: -0.3,
          lineHeight: 1.15,
          marginTop: 4,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          className="mono"
          style={{
            fontSize: 10,
            color: "var(--fg-3)",
            marginTop: 3,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function severityColor(sev: Investigation["severity"]) {
  if (sev === "critical") return "var(--crit)";
  if (sev === "high") return "var(--accent)";
  if (sev === "medium") return "var(--info)";
  return "var(--fg-2)";
}

function LatencyStamp({ inv }: { inv: Investigation }) {
  const stamp = deriveLatencyStamp(inv);
  return (
    <div
      className="mono"
      style={{
        marginTop: 8,
        fontSize: 11,
        color: "var(--fg-3)",
        display: "flex",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <span>
        Investigated in{" "}
        <span style={{ color: "var(--fg-1)", fontWeight: 600 }}>
          {stamp.total_seconds.toFixed(1)}s
        </span>
      </span>
      <span>·</span>
      <span>
        <span style={{ color: "var(--fg-1)", fontWeight: 600 }}>
          {stamp.artifacts_read}
        </span>{" "}
        artifacts read
      </span>
      <span>·</span>
      <span>
        <span style={{ color: "var(--fg-1)", fontWeight: 600 }}>
          {stamp.entities_traversed}
        </span>{" "}
        entit{stamp.entities_traversed === 1 ? "y" : "ies"} traversed
      </span>
    </div>
  );
}

/* Detail sub-tab body — root cause hypothesis, causal chain, blast radius columns,
   recommended actions. */
function DetailBody({ inv }: { inv: Investigation }) {
  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
      <Panel title="Root cause hypothesis" extra={<span style={{ fontSize: 11, color: "var(--fg-3)" }}>agent-meridian-reasoner</span>}>
        <div style={{ padding: 18, fontSize: 13.5, lineHeight: 1.6, color: "var(--fg-0)" }}>
          {inv.root_cause_hypothesis}
        </div>
      </Panel>

      <Panel
        title={
          <span style={{ display: "inline-flex", alignItems: "center" }}>
            Causal chain · {inv.causal_chain.length} events
            <InfoTip term="Causal chain" width={320}>{EXPLAINERS.causalChain}</InfoTip>
          </span>
        }
        extra={
          <span style={{ display: "inline-flex", alignItems: "center" }}>
            <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>
              ordered by USC temporal
            </span>
            <InfoTip term="USC temporal" width={340}>{EXPLAINERS.uscTemporal}</InfoTip>
          </span>
        }
      >
        {inv.causal_chain.length === 0 ? (
          <Empty>No causal chain attached to this investigation.</Empty>
        ) : (
          <ol
            style={{
              margin: 0,
              padding: "8px 0",
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {inv.causal_chain.map((step, i) => (
              <li
                key={step.artifact_uri}
                style={{
                  display: "grid",
                  gridTemplateColumns: "80px 12px 1fr",
                  gap: 16,
                  alignItems: "start",
                  padding: "10px 18px",
                }}
              >
                <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)", paddingTop: 2 }}>
                  {fmtTime(step.usc_temporal)}
                </span>
                <div style={{ position: "relative", width: 12, paddingTop: 4 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      background: i === 0 ? "var(--accent)" : "var(--bd-3)",
                      display: "inline-block",
                      position: "absolute",
                      left: 2,
                      top: 6,
                    }}
                  />
                  {i < inv.causal_chain.length - 1 && (
                    <span
                      style={{
                        position: "absolute",
                        left: 5,
                        top: 14,
                        bottom: -14,
                        width: 2,
                        background: "var(--bd-2)",
                      }}
                    />
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "var(--fg-0)", marginBottom: 2 }}>
                    {step.label}
                  </div>
                  <div className="mono" style={{ fontSize: 10.5, color: "var(--fg-3)" }}>
                    {step.artifact_uri}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        <BlastColumn title="Infrastructure" tone="info" items={inv.blast_radius.infrastructure} />
        <BlastColumn title="Business" tone="accent" items={inv.blast_radius.business} />
        <BlastColumn title="Compliance" tone="crit" items={inv.blast_radius.compliance} />
      </div>

      <Panel
        title={
          <span style={{ display: "inline-flex", alignItems: "center" }}>
            Recommended actions · {inv.actions_recommended.length}
            <InfoTip term="Recommended actions" width={320}>{EXPLAINERS.recommendedActions}</InfoTip>
          </span>
        }
      >
        {inv.actions_recommended.length === 0 ? (
          <Empty>No recommended actions returned.</Empty>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {inv.actions_recommended.map((a, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 18px",
                  borderTop: i === 0 ? "none" : "1px solid var(--bd-1)",
                }}
              >
                <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)", width: 22 }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <Pill color={a.priority === "critical" ? "crit" : a.priority === "high" ? "accent" : "info"}>
                  {a.priority}
                </Pill>
                <span style={{ flex: 1, fontSize: 13, color: "var(--fg-0)", lineHeight: 1.45 }}>
                  {a.action}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <HybridRecallPanel investigationUri={inv.investigation_uri} />
    </div>
  );
}

function BlastColumn({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "info" | "accent" | "crit";
  items: Investigation["blast_radius"]["infrastructure"];
}) {
  return (
    <Panel
      title={
        <span style={{ display: "inline-flex", alignItems: "center" }}>
          {title} · {items.length}
          <InfoTip term={`${title} blast radius`} width={300}>{EXPLAINERS.blastRadius}</InfoTip>
        </span>
      }
    >
      {items.length === 0 ? (
        <Empty>None affected.</Empty>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {items.map((e, i) => (
            <li key={e.uri} style={{ borderTop: i === 0 ? "none" : "1px solid var(--bd-1)" }}>
              <Link
                href={`/app/incidents?entity=${encodeURIComponent(e.uri)}`}
                title={`Filter incidents involving ${e.name}`}
                style={{
                  padding: "10px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  textDecoration: "none",
                  color: "inherit",
                  transition: "background 120ms ease",
                }}
                className="entity-row"
              >
                <span
                  style={{
                    width: 4,
                    alignSelf: "stretch",
                    background:
                      tone === "info" ? "var(--info)" : tone === "accent" ? "var(--accent)" : "var(--crit)",
                    borderRadius: 2,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: "var(--fg-0)", fontWeight: 500 }}>{e.name}</div>
                  <div
                    className="mono"
                    style={{
                      fontSize: 10.5,
                      color: "var(--fg-3)",
                      display: "inline-flex",
                      alignItems: "center",
                    }}
                  >
                    {e.entity_type} · d={e.distance}
                  </div>
                </div>
                <span
                  aria-hidden
                  className="entity-row-arrow"
                  style={{
                    fontSize: 14,
                    color: "var(--fg-3)",
                    opacity: 0,
                    transition: "opacity 120ms ease, color 120ms ease",
                  }}
                >
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "20px 18px", fontSize: 12, color: "var(--fg-3)" }}>{children}</div>
  );
}
