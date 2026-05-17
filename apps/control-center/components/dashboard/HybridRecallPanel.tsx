"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { HybridHit } from "@/lib/hybridRecall";
import { InfoTip } from "./InfoTip";
import { Panel } from "./atoms";

const EXPLAINER = (
  <>
    Combined ranking from two parallel queries against{" "}
    <strong style={{ color: "var(--fg-0)" }}>MongoDB Atlas</strong>: a{" "}
    <strong style={{ color: "var(--fg-0)" }}>$vectorSearch</strong> over the
    768-dim cosine index, and a <strong style={{ color: "var(--fg-0)" }}>$text</strong>{" "}
    BM25 query on the hypothesis field. Scores are fused with Reciprocal Rank
    Fusion (k=60) — a hit appearing high in either lane wins.
  </>
);

export function HybridRecallPanel({ investigationUri }: { investigationUri: string }) {
  const [hits, setHits] = useState<HybridHit[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setHits(null);
    fetch(`/api/hybrid-recall?id=${encodeURIComponent(investigationUri)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { hits?: HybridHit[] }) => {
        if (cancelled) return;
        setHits(d.hits ?? []);
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
  }, [investigationUri]);

  return (
    <Panel
      title={
        <span style={{ display: "inline-flex", alignItems: "center" }}>
          Hybrid recall · vector + BM25
          <InfoTip term="Hybrid recall" width={340}>{EXPLAINER}</InfoTip>
        </span>
      }
      extra={
        <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>
          Atlas Vector Search · MongoDB $text
        </span>
      }
    >
      {loading ? (
        <div style={{ padding: "16px 18px", fontSize: 12, color: "var(--fg-3)" }}>
          running hybrid query…
        </div>
      ) : error ? (
        <div style={{ padding: "12px 18px", fontSize: 12, color: "var(--crit)" }}>
          Recall failed: {error}
        </div>
      ) : !hits || hits.length === 0 ? (
        <div style={{ padding: "16px 18px", fontSize: 12, color: "var(--fg-3)" }}>
          No prior investigations match this incident on either lane.
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) 88px 88px 88px 60px",
              gap: 12,
              padding: "8px 18px",
              background: "var(--bg-2)",
              borderBottom: "1px solid var(--bd-1)",
              fontSize: 9.5,
              fontWeight: 600,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              color: "var(--fg-2)",
            }}
          >
            <span>Investigation</span>
            <span style={{ textAlign: "right" }}>Cosine</span>
            <span style={{ textAlign: "right" }}>BM25</span>
            <span style={{ textAlign: "right" }}>Hybrid (RRF)</span>
            <span />
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {hits.map((h, i) => (
              <li
                key={h.investigation_uri}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) 88px 88px 88px 60px",
                  gap: 12,
                  padding: "12px 18px",
                  borderTop: i === 0 ? "none" : "1px solid var(--bd-1)",
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div className="mono" style={{ fontSize: 10.5, color: "var(--accent)", fontWeight: 500 }}>
                    {h.short_id}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--fg-1)", marginTop: 3, lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                    {h.hypothesis}
                  </div>
                </div>
                <ScoreCell value={h.cosine != null ? Math.round(h.cosine * 100) + "%" : "—"} present={h.cosine != null} />
                <ScoreCell value={h.bm25 != null ? h.bm25.toFixed(2) : "—"} present={h.bm25 != null} sub={h.bm25 != null ? `norm ${h.bm25_norm.toFixed(2)}` : undefined} />
                <ScoreCell value={(h.hybrid * 100).toFixed(2)} present={true} accent />
                <Link
                  href={`/app/incidents?id=${encodeURIComponent(h.investigation_uri)}`}
                  style={{
                    fontSize: 11,
                    color: "var(--accent)",
                    textDecoration: "none",
                    textAlign: "right",
                  }}
                >
                  Open →
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

function ScoreCell({
  value,
  present,
  accent,
  sub,
}: {
  value: string;
  present: boolean;
  accent?: boolean;
  sub?: string;
}) {
  return (
    <div style={{ textAlign: "right" }}>
      <div
        className="mono"
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: !present
            ? "var(--fg-4)"
            : accent
            ? "var(--accent)"
            : "var(--fg-0)",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div className="mono" style={{ fontSize: 9.5, color: "var(--fg-3)", marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  );
}
