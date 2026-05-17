"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Pattern } from "@/lib/patterns";

const COLOR: Record<Pattern["kind"], string> = {
  "root-entity": "var(--info)",
  keyword: "var(--accent)",
  "entity-overlap": "var(--accent)",
  "severity-burst": "var(--crit)",
};

const LABEL: Record<Pattern["kind"], string> = {
  "root-entity": "Recurring root",
  keyword: "Archetype",
  "entity-overlap": "Entity overlap",
  "severity-burst": "Severity burst",
};

export function PatternsBadge({ investigationUri }: { investigationUri: string }) {
  const [patterns, setPatterns] = useState<Pattern[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setPatterns(null);
    fetch(`/api/patterns?id=${encodeURIComponent(investigationUri)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { patterns?: Pattern[] }) => {
        if (cancelled) return;
        setPatterns(d.patterns ?? []);
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

  if (loading || error || !patterns || patterns.length === 0) return null;

  return (
    <div
      style={{
        marginTop: 10,
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
      }}
    >
      {patterns.map((p, i) => (
        <PatternChip key={i} pattern={p} />
      ))}
    </div>
  );
}

function PatternChip({ pattern }: { pattern: Pattern }) {
  const color = COLOR[pattern.kind];
  const ref = pattern.references[0];
  return (
    <span
      title={pattern.detail}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px 4px 8px",
        background: "var(--bg-2)",
        border: `1px solid ${color}55`,
        borderRadius: 3,
        fontSize: 11.5,
        color: "var(--fg-0)",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          background: color,
        }}
      />
      <span
        style={{
          fontSize: 9.5,
          fontWeight: 600,
          color,
          letterSpacing: 0.3,
          textTransform: "uppercase",
          marginRight: 2,
        }}
      >
        {LABEL[pattern.kind]}
      </span>
      <span>{pattern.text}</span>
      {ref && (
        <Link
          href={`/app/incidents?id=${encodeURIComponent(ref.uri)}`}
          className="mono"
          style={{
            fontSize: 10.5,
            color: "var(--accent)",
            textDecoration: "none",
            paddingLeft: 4,
          }}
        >
          {ref.short_id} →
        </Link>
      )}
    </span>
  );
}
