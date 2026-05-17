"use client";
import Link from "next/link";
import type { OverviewData } from "@/lib/overview";
import type { Investigation } from "@/lib/types";
import { EXPLAINERS } from "@/lib/explainers";
import { Pill } from "./atoms";
import { InfoTip } from "./InfoTip";

function timeAgo(iso: string): string {
  const sec = Math.floor((Date.now() - Date.parse(iso)) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function severityColor(sev: Investigation["severity"]) {
  if (sev === "critical") return "var(--crit)";
  if (sev === "high") return "var(--accent)";
  if (sev === "medium") return "var(--info)";
  return "var(--fg-3)";
}

function postureColor(level: OverviewData["posture"]["level"]) {
  if (level === "critical") return "var(--crit)";
  if (level === "elevated") return "var(--accent)";
  return "var(--ok)";
}

function postureLabel(level: OverviewData["posture"]["level"]) {
  return level === "critical" ? "Critical" : level === "elevated" ? "Elevated" : "Stable";
}

function firstSentence(text: string): string {
  const s = text.split(/(?<=[.!?])\s+/)[0] ?? text;
  return s.length > 160 ? s.slice(0, 157) + "…" : s;
}

export function Overview({ data }: { data: OverviewData }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        display: "grid",
        gridTemplateRows: "auto auto auto 1fr",
        gap: 14,
        padding: "14px 20px 20px",
        background: "var(--bg-0)",
        overflow: "hidden",
      }}
    >
      <PostureBanner posture={data.posture} highest={data.highestSeverity} />
      <KpiStrip kpis={data.kpis} spark={data.artifactsByDay} />
      <AskStrip topHypothesis={data.highestSeverity?.root_cause_hypothesis ?? null} />

      <div
        style={{
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.55fr) minmax(0, 1fr)",
          gap: 14,
        }}
      >
        <AttentionList items={data.attention} />
        <ActivityCard activity={data.recentActivity} totals={data.totals} />
      </div>
    </div>
  );
}

function PostureBanner({
  posture,
  highest,
}: {
  posture: OverviewData["posture"];
  highest: Investigation | null;
}) {
  const color = postureColor(posture.level);
  const bgSoft =
    posture.level === "critical"
      ? "var(--crit-soft)"
      : posture.level === "elevated"
      ? "var(--accent-soft)"
      : "var(--ok-soft)";
  return (
    <section
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--bd-1)",
        borderRadius: 6,
        padding: "14px 18px",
        display: "flex",
        alignItems: "center",
        gap: 18,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: color,
        }}
      />
      <div style={{ paddingLeft: 6, display: "flex", flexDirection: "column", gap: 4 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 9px",
            border: `1px solid ${color}55`,
            borderRadius: 3,
            background: bgSoft,
            color,
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            alignSelf: "flex-start",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 3, background: color }} />
          {postureLabel(posture.level)} posture
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 17,
            fontWeight: 600,
            color: "var(--fg-0)",
            letterSpacing: -0.2,
            lineHeight: 1.25,
          }}
        >
          {posture.headline}
        </div>
        <div
          style={{
            fontSize: 12.5,
            lineHeight: 1.45,
            color: "var(--fg-1)",
            marginTop: 3,
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {posture.body}
        </div>
      </div>
      {highest && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            paddingLeft: 18,
            borderLeft: "1px solid var(--bd-1)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <span className="overline" style={{ fontSize: 9.5 }}>Top investigation</span>
            <span className="mono" style={{ fontSize: 11, color: "var(--fg-1)" }}>
              {(highest.investigation_uri.split("/").pop() ?? "").slice(0, 28)}
            </span>
          </div>
          <Pill color="accent" mono>{Math.round(highest.confidence * 100)}%</Pill>
          <Link
            href={`/app/incidents?id=${encodeURIComponent(highest.investigation_uri)}`}
            style={{
              padding: "7px 14px",
              background: "var(--accent)",
              color: "var(--accent-text)",
              borderRadius: 3,
              fontSize: 12,
              fontWeight: 600,
              textDecoration: "none",
              letterSpacing: 0.1,
              whiteSpace: "nowrap",
            }}
          >
            Review →
          </Link>
        </div>
      )}
      <div
        style={{
          fontSize: 10,
          color: "var(--fg-3)",
          alignSelf: "flex-start",
          paddingTop: 2,
          fontFamily: "var(--font-mono, monospace)",
        }}
        className="mono"
      >
        {new Date(posture.asOf).toISOString().slice(11, 19)} UTC
      </div>
    </section>
  );
}

function KpiStrip({
  kpis,
  spark,
}: {
  kpis: OverviewData["kpis"];
  spark: OverviewData["artifactsByDay"];
}) {
  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${kpis.length}, minmax(0, 1fr)) minmax(0, 1.05fr)`,
        gap: 1,
        background: "var(--bd-1)",
        border: "1px solid var(--bd-1)",
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      {kpis.map((k) => (
        <div key={k.label} style={{ background: "var(--bg-1)", padding: "12px 16px", minWidth: 0 }}>
          <div className="overline" style={{ marginBottom: 6, fontSize: 9.5 }}>{k.label}</div>
          <div
            className="mono"
            style={{
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: -0.5,
              lineHeight: 1,
              color:
                k.emphasis === "accent"
                  ? "var(--accent-2)"
                  : k.emphasis === "crit"
                  ? "var(--crit)"
                  : "var(--fg-0)",
            }}
          >
            {k.value}
          </div>
          {k.sub && (
            <div
              style={{
                marginTop: 4,
                fontSize: 11,
                color: "var(--fg-2)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {k.sub}
            </div>
          )}
        </div>
      ))}
      <SparkCell spark={spark} />
    </section>
  );
}

function SparkCell({ spark }: { spark: OverviewData["artifactsByDay"] }) {
  const max = Math.max(1, ...spark.map((d) => d.count));
  const total = spark.reduce((s, d) => s + d.count, 0);
  return (
    <div style={{ background: "var(--bg-1)", padding: "12px 16px", display: "flex", gap: 12, minWidth: 0 }}>
      <div style={{ minWidth: 0 }}>
        <div className="overline" style={{ marginBottom: 6, fontSize: 9.5 }}>Ingest · 7d</div>
        <div className="mono" style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.5, lineHeight: 1, color: "var(--fg-0)" }}>
          {total.toLocaleString()}
        </div>
        <div style={{ marginTop: 4, fontSize: 11, color: "var(--fg-2)", whiteSpace: "nowrap" }}>
          artifacts written
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 3, height: 48, minWidth: 60 }}>
        {spark.map((d) => (
          <div
            key={d.day}
            title={`${d.day}: ${d.count.toLocaleString()} artifacts`}
            style={{
              flex: 1,
              minWidth: 0,
              height: `${Math.max(4, (d.count / max) * 100)}%`,
              background: d.count > 0 ? "var(--accent)" : "var(--bd-2)",
              opacity: d.count > 0 ? 0.85 : 0.4,
              borderRadius: 1.5,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function AskStrip({ topHypothesis }: { topHypothesis: string | null }) {
  const suggestions = topHypothesis
    ? [
        "Summarize the open incidents for the exec team",
        "Why is confidence high on the top investigation?",
        "Blast radius of the most recent incident?",
      ]
    : [
        "Summarize this week's investigations",
        "Which incidents touched compliance assets?",
        "What patterns is the agent seeing?",
      ];

  return (
    <section
      style={{
        background: "linear-gradient(90deg, var(--bg-1) 0%, var(--bg-2) 100%)",
        border: "1px solid var(--bd-1)",
        borderRadius: 6,
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          right: -30,
          top: -50,
          width: 180,
          height: 180,
          borderRadius: "50%",
          background: "radial-gradient(circle, var(--accent-soft) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
          <circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--accent)" strokeWidth="1.3" />
          <line x1="8" y1="0.5" x2="8" y2="15.5" stroke="var(--accent)" strokeWidth="1.3" />
          <circle cx="8" cy="8" r="1.8" fill="var(--accent)" />
        </svg>
        <div>
          <div className="overline-accent" style={{ fontSize: 9.5 }}>Ask Meridian</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-0)", lineHeight: 1.2 }}>
            Skip the dashboard.
          </div>
        </div>
      </div>
      <div style={{ position: "relative", display: "flex", flex: 1, minWidth: 0, gap: 8, overflow: "hidden" }}>
        {suggestions.map((s) => (
          <Link
            key={s}
            href={`/app/ask?q=${encodeURIComponent(s)}`}
            style={{
              padding: "7px 12px",
              borderRadius: 4,
              background: "var(--bg-0)",
              border: "1px solid var(--bd-2)",
              fontSize: 12,
              color: "var(--fg-1)",
              textDecoration: "none",
              lineHeight: 1.3,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              flex: "0 1 auto",
            }}
          >
            {s}
          </Link>
        ))}
      </div>
      <Link
        href="/app/ask"
        style={{
          position: "relative",
          padding: "8px 14px",
          background: "var(--accent)",
          color: "var(--accent-text)",
          borderRadius: 3,
          fontSize: 12,
          fontWeight: 600,
          textDecoration: "none",
          letterSpacing: 0.1,
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        Open chat →
      </Link>
    </section>
  );
}

function AttentionList({ items }: { items: Investigation[] }) {
  return (
    <section
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--bd-1)",
        borderRadius: 6,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <header
        style={{
          padding: "12px 18px",
          borderBottom: "1px solid var(--bd-1)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <div className="overline-accent" style={{ flex: 1, fontSize: 10 }}>Needs your attention</div>
        <Link
          href="/app/incidents"
          style={{ fontSize: 11.5, color: "var(--fg-2)", textDecoration: "none" }}
        >
          View all →
        </Link>
      </header>
      <div className="scroll" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {items.length === 0 ? (
          <div
            style={{
              padding: "28px 24px",
              textAlign: "center",
              color: "var(--fg-2)",
              fontSize: 12.5,
            }}
          >
            No active incidents. The agent is monitoring.
          </div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {items.map((inv, i) => (
              <li
                key={inv.investigation_uri}
                style={{
                  padding: "12px 18px",
                  borderTop: i === 0 ? "none" : "1px solid var(--bd-1)",
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  gap: 14,
                  alignItems: "start",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    marginTop: 4,
                    width: 3,
                    height: 32,
                    borderRadius: 2,
                    background: severityColor(inv.severity),
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--fg-0)",
                      lineHeight: 1.4,
                      marginBottom: 4,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {firstSentence(inv.root_cause_hypothesis)}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                      fontSize: 10.5,
                      color: "var(--fg-2)",
                    }}
                  >
                    <span className="mono" style={{ color: "var(--fg-3)" }}>
                      {inv.investigation_uri.split("/").pop()}
                    </span>
                    <span>·</span>
                    <span>{timeAgo(inv.created_at)}</span>
                    {inv.blast_radius.total_affected > 0 && (
                      <>
                        <span>·</span>
                        <span>{inv.blast_radius.total_affected} entities</span>
                      </>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <Pill color="accent" mono>
                    {Math.round(inv.confidence * 100)}%
                  </Pill>
                  <Link
                    href={`/app/incidents?id=${encodeURIComponent(inv.investigation_uri)}`}
                    style={{ fontSize: 11, color: "var(--accent-2)", textDecoration: "none" }}
                  >
                    Open →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ActivityCard({
  activity,
  totals,
}: {
  activity: OverviewData["recentActivity"];
  totals: OverviewData["totals"];
}) {
  return (
    <section
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--bd-1)",
        borderRadius: 6,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <header
        style={{
          padding: "12px 18px",
          borderBottom: "1px solid var(--bd-1)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <div
          className="overline-accent"
          style={{ flex: 1, fontSize: 10, display: "inline-flex", alignItems: "center" }}
        >
          Provenance
          <InfoTip term="Provenance" width={320}>{EXPLAINERS.provenance}</InfoTip>
        </div>
        <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-3)" }}>
          live · {totals.investigations.toLocaleString()} in memory
        </span>
      </header>
      <div className="scroll" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {activity.length === 0 ? (
          <div style={{ padding: 16, fontSize: 12, color: "var(--fg-3)" }}>No recent activity.</div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {activity.map((a, i) => (
              <li
                key={i}
                style={{
                  padding: "9px 18px",
                  borderTop: i === 0 ? "none" : "1px dashed var(--bd-1)",
                  fontSize: 11.5,
                  lineHeight: 1.4,
                }}
              >
                <div className="mono" style={{ fontSize: 10, color: "var(--fg-3)", marginBottom: 2 }}>
                  {new Date(a.when).toISOString().slice(11, 19)} · {a.actor}
                </div>
                <div style={{ color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <span style={{ color: "var(--accent-2)", fontWeight: 500 }}>{a.action}</span>{" "}
                  <span className="mono" style={{ fontSize: 10.5 }}>
                    {a.artifact}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
