"use client";
import { useEffect, useState } from "react";

/* Lazy-loads the "Why this matters" business impact line for an investigation.
   Cached in-process server-side by uri so the second render is instant. */
export function BusinessImpactLine({ investigationUri }: { investigationUri: string }) {
  const [line, setLine] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setLine(null);
    fetch(`/api/business-impact?id=${encodeURIComponent(investigationUri)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { line?: string }) => {
        if (cancelled) return;
        setLine(d.line ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [investigationUri]);

  if (error) return null;

  return (
    <div
      style={{
        marginTop: 10,
        padding: "8px 12px",
        background: "var(--accent-soft)",
        borderLeft: "3px solid var(--accent)",
        borderRadius: 3,
      }}
    >
      <div
        className="overline-accent"
        style={{ fontSize: 9, marginBottom: 3, letterSpacing: 0.4 }}
      >
        Impact
      </div>
      {loading ? (
        <div
          style={{
            fontSize: 13,
            color: "var(--fg-3)",
            fontStyle: "italic",
            lineHeight: 1.45,
          }}
        >
          summarizing business impact…
        </div>
      ) : (
        <div
          style={{
            fontSize: 13.5,
            color: "var(--fg-0)",
            fontWeight: 500,
            lineHeight: 1.45,
          }}
        >
          {line}
        </div>
      )}
    </div>
  );
}
