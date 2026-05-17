"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { Investigation } from "@/lib/types";
import { Pill } from "./atoms";

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

function firstSentence(text: string): string {
  const s = text.split(/(?<=[.!?])\s+/)[0] ?? text;
  return s.length > 220 ? s.slice(0, 217) + "…" : s;
}

export function Memory({ investigations }: { investigations: Investigation[] }) {
  const [q, setQ] = useState("");
  const [severity, setSeverity] = useState<"any" | Investigation["severity"]>("any");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return investigations.filter((inv) => {
      if (severity !== "any" && inv.severity !== severity) return false;
      if (!needle) return true;
      return (
        inv.root_cause_hypothesis.toLowerCase().includes(needle) ||
        inv.investigation_uri.toLowerCase().includes(needle) ||
        inv.blast_radius.infrastructure.some((e) => e.name.toLowerCase().includes(needle)) ||
        inv.blast_radius.business.some((e) => e.name.toLowerCase().includes(needle))
      );
    });
  }, [investigations, q, severity]);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-0)",
        minHeight: 0,
      }}
    >
      <header
        style={{
          padding: "20px 40px 18px",
          borderBottom: "1px solid var(--bd-1)",
          background: "var(--bg-1)",
        }}
      >
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div className="overline-accent" style={{ marginBottom: 4 }}>Casebook</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--fg-0)", letterSpacing: -0.1 }}>
              {investigations.length.toLocaleString()} investigations recorded
            </div>
            <span style={{ flex: 1 }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search hypothesis, URI, entity…"
              style={{
                padding: "8px 12px",
                background: "var(--bg-0)",
                border: "1px solid var(--bd-2)",
                borderRadius: 4,
                color: "var(--fg-0)",
                fontSize: 12.5,
                width: 280,
                outline: "none",
              }}
            />
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as typeof severity)}
              style={{
                padding: "8px 10px",
                background: "var(--bg-0)",
                border: "1px solid var(--bd-2)",
                borderRadius: 4,
                color: "var(--fg-0)",
                fontSize: 12.5,
                outline: "none",
              }}
            >
              <option value="any">All severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>
      </header>

      <div className="scroll" style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "20px 40px 64px" }}>
          {filtered.length === 0 ? (
            <div
              style={{
                marginTop: 36,
                padding: "32px 24px",
                background: "var(--bg-1)",
                border: "1px dashed var(--bd-2)",
                borderRadius: 6,
                textAlign: "center",
                color: "var(--fg-2)",
                fontSize: 13,
              }}
            >
              No investigations match your search.
            </div>
          ) : (
            <div
              style={{
                background: "var(--bg-1)",
                border: "1px solid var(--bd-1)",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px minmax(0, 1fr) 110px 130px 90px",
                  gap: 18,
                  padding: "12px 22px",
                  background: "var(--bg-2)",
                  borderBottom: "1px solid var(--bd-1)",
                }}
              >
                {["When", "Hypothesis", "Severity", "Confidence", ""].map((h) => (
                  <div key={h} className="overline" style={{ fontSize: 10 }}>{h}</div>
                ))}
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {filtered.map((inv) => (
                  <li
                    key={inv.investigation_uri}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "120px minmax(0, 1fr) 110px 130px 90px",
                      gap: 18,
                      padding: "14px 22px",
                      borderTop: "1px solid var(--bd-1)",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div className="mono" style={{ fontSize: 11.5, color: "var(--fg-1)" }}>
                        {timeAgo(inv.created_at)}
                      </div>
                      <div className="mono" style={{ fontSize: 10, color: "var(--fg-3)", marginTop: 1 }}>
                        {inv.created_at.slice(0, 10)}
                      </div>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: "var(--fg-0)", lineHeight: 1.45 }}>
                        {firstSentence(inv.root_cause_hypothesis)}
                      </div>
                      <div className="mono" style={{ fontSize: 10.5, color: "var(--fg-3)", marginTop: 3 }}>
                        {inv.investigation_uri}
                      </div>
                    </div>
                    <div>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "3px 9px",
                          fontSize: 11,
                          fontWeight: 500,
                          color: severityColor(inv.severity),
                          background: "var(--bg-2)",
                          border: `1px solid ${severityColor(inv.severity)}55`,
                          borderRadius: 3,
                          textTransform: "capitalize",
                          letterSpacing: 0.2,
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 3,
                            background: severityColor(inv.severity),
                          }}
                        />
                        {inv.severity}
                      </span>
                    </div>
                    <div>
                      <Pill color="accent" mono>{Math.round(inv.confidence * 100)}%</Pill>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <Link
                        href={`/app/incidents?id=${encodeURIComponent(inv.investigation_uri)}`}
                        style={{ fontSize: 12, color: "var(--accent-2)", textDecoration: "none" }}
                      >
                        Open →
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
