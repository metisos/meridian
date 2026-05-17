"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { FeedData, Investigation } from "@/lib/types";
import { IncidentRow } from "./IncidentRow";
import { IncidentDetail } from "./IncidentDetail";
import { ContextPanel } from "./ContextPanel";

function investigationTouchesEntity(inv: Investigation, entityUri: string): boolean {
  const br = inv.blast_radius;
  if (br.root_entity_uri === entityUri) return true;
  return (
    br.infrastructure.some((e) => e.uri === entityUri) ||
    br.business.some((e) => e.uri === entityUri) ||
    br.compliance.some((e) => e.uri === entityUri)
  );
}

function findEntityName(feed: FeedData, entityUri: string): string | null {
  for (const inv of feed.investigations) {
    for (const e of [
      ...inv.blast_radius.infrastructure,
      ...inv.blast_radius.business,
      ...inv.blast_radius.compliance,
    ]) {
      if (e.uri === entityUri) return e.name;
    }
  }
  return null;
}

export function IncidentsWorkspace({ feed }: { feed: FeedData }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const initial = params.get("id");
  const entityFilter = params.get("entity");

  const [selectedUri, setSelectedUri] = useState<string | null>(
    initial && feed.investigations.some((i) => i.investigation_uri === initial)
      ? initial
      : feed.investigations[0]?.investigation_uri ?? null,
  );

  useEffect(() => {
    if (initial && feed.investigations.some((i) => i.investigation_uri === initial)) {
      setSelectedUri(initial);
    }
  }, [initial, feed.investigations]);

  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved">("all");

  const filtered = useMemo(() => {
    let list = feed.investigations;
    if (entityFilter) {
      list = list.filter((i) => investigationTouchesEntity(i, entityFilter));
    }
    if (statusFilter === "open") {
      list = list.filter((i) => i.status === "open" || i.status === "monitoring");
    } else if (statusFilter === "resolved") {
      list = list.filter((i) => i.status === "resolved");
    }
    return list;
  }, [feed.investigations, entityFilter, statusFilter]);

  // When the entity filter narrows the list and the current selection is no
  // longer in it, jump to the first match.
  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedUri(null);
      return;
    }
    if (!selectedUri || !filtered.some((i) => i.investigation_uri === selectedUri)) {
      setSelectedUri(filtered[0]!.investigation_uri);
    }
  }, [filtered, selectedUri]);

  const selected =
    feed.investigations.find((i) => i.investigation_uri === selectedUri) ?? null;

  const entityName = entityFilter ? findEntityName(feed, entityFilter) : null;
  const clearEntityFilter = () => {
    const next = new URLSearchParams(params.toString());
    next.delete("entity");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
      {/* Feed column */}
      <section
        style={{
          width: 460,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid var(--bd-1)",
          background: "var(--bg-0)",
          minHeight: 0,
        }}
      >
        <header style={{ padding: "16px 20px", borderBottom: "1px solid var(--bd-1)", background: "var(--bg-1)" }}>
          <div className="overline-accent" style={{ marginBottom: 4 }}>Incident intelligence feed</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--fg-0)", letterSpacing: -0.1 }}>
              {filtered.length} {filtered.length === 1 ? "investigation" : "investigations"}
            </div>
            <span style={{ flex: 1 }} />
            <FilterChips value={statusFilter} onChange={setStatusFilter} />
          </div>
          {entityFilter && (
            <div
              style={{
                marginTop: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px 8px 12px",
                background: "var(--accent-soft)",
                border: "1px solid var(--accent-bd)",
                borderRadius: 4,
                fontSize: 11.5,
              }}
            >
              <span style={{ color: "var(--fg-2)" }}>Filtered by entity:</span>
              <span style={{ color: "var(--fg-0)", fontWeight: 600 }}>
                {entityName ?? "(unknown)"}
              </span>
              <span className="mono" style={{ color: "var(--fg-3)", fontSize: 10.5 }}>
                {entityFilter.length > 56 ? entityFilter.slice(0, 53) + "…" : entityFilter}
              </span>
              <span style={{ flex: 1 }} />
              <button
                onClick={clearEntityFilter}
                aria-label="Clear entity filter"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  border: "1px solid var(--accent-bd)",
                  background: "transparent",
                  color: "var(--accent)",
                  cursor: "pointer",
                  fontSize: 12,
                  lineHeight: 1,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title="Clear filter"
              >
                ✕
              </button>
            </div>
          )}
        </header>

        <div className="scroll" style={{ flex: 1, overflowY: "auto", padding: "12px 14px 24px", display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.length === 0 ? (
            <Empty hasEntityFilter={!!entityFilter} onClear={clearEntityFilter} />
          ) : (
            filtered.map((inv) => (
              <IncidentRow
                key={inv.investigation_uri}
                inv={inv}
                selected={selectedUri === inv.investigation_uri}
                onSelect={() => setSelectedUri(inv.investigation_uri)}
              />
            ))
          )}
        </div>
      </section>

      {/* Detail column */}
      <section
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          background: "var(--bg-0)",
          minWidth: 0,
          minHeight: 0,
        }}
      >
        {selected ? <IncidentDetail inv={selected} /> : <NoSelection />}
      </section>

      <ContextPanel selected={selected} provenance={feed.recent_provenance} />
    </div>
  );
}

function FilterChips({
  value,
  onChange,
}: {
  value: "all" | "open" | "resolved";
  onChange: (v: "all" | "open" | "resolved") => void;
}) {
  const opts: Array<{ key: "all" | "open" | "resolved"; label: string }> = [
    { key: "all", label: "All" },
    { key: "open", label: "Active" },
    { key: "resolved", label: "Resolved" },
  ];
  return (
    <div style={{ display: "flex", gap: 2, background: "var(--bg-0)", padding: 2, borderRadius: 4, border: "1px solid var(--bd-1)" }}>
      {opts.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          style={{
            padding: "5px 12px",
            background: value === o.key ? "var(--bg-3)" : "transparent",
            color: value === o.key ? "var(--fg-0)" : "var(--fg-2)",
            border: "none",
            borderRadius: 3,
            fontSize: 11.5,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Empty({ hasEntityFilter, onClear }: { hasEntityFilter: boolean; onClear: () => void }) {
  return (
    <div
      style={{
        marginTop: 28,
        padding: "32px 24px",
        background: "var(--bg-1)",
        border: "1px dashed var(--bd-2)",
        borderRadius: 6,
        textAlign: "center",
      }}
    >
      <div className="overline" style={{ marginBottom: 10 }}>No investigations match</div>
      <div style={{ fontSize: 12.5, color: "var(--fg-2)", marginBottom: 14 }}>
        {hasEntityFilter
          ? "No investigation in memory references this entity."
          : "Switch the filter or check Memory."}
      </div>
      {hasEntityFilter && (
        <button
          onClick={onClear}
          style={{
            padding: "6px 12px",
            background: "transparent",
            color: "var(--accent)",
            border: "1px solid var(--accent-bd)",
            borderRadius: 4,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Clear entity filter
        </button>
      )}
    </div>
  );
}

function NoSelection() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 48,
        color: "var(--fg-2)",
        fontSize: 13,
      }}
    >
      Select an investigation to view details.
    </div>
  );
}
