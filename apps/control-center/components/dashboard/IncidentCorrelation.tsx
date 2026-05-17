"use client";
import { useEffect, useMemo, useState } from "react";
import type { Investigation } from "@/lib/types";
import type { CorrelationData, CorrelationEvent } from "@/lib/uscChain";
import { EXPLAINERS } from "@/lib/explainers";
import { InfoTip } from "./InfoTip";
import { Panel } from "./atoms";

const MATCH_THRESHOLD = 0.7;

export function IncidentCorrelation({ inv }: { inv: Investigation }) {
  const [data, setData] = useState<CorrelationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    setSelected(null);
    fetch(`/api/correlation?id=${encodeURIComponent(inv.investigation_uri)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { data: CorrelationData }) => {
        if (cancelled) return;
        setData(d.data);
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
  }, [inv.investigation_uri]);

  if (loading) {
    return (
      <div style={{ padding: 24, color: "var(--fg-2)", fontSize: 13 }}>
        Computing cross-tier match scores…
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: 24, color: "var(--crit)", fontSize: 13 }}>
        Correlation load failed: {error}
      </div>
    );
  }
  if (!data || data.events.length === 0) {
    return (
      <div style={{ padding: 24 }}>
        <Empty>No causal chain attached — correlation view is empty.</Empty>
      </div>
    );
  }

  const eventsWithUsc = data.events.filter((e) => e.usc != null);
  const eventsWithoutUsc = data.events.length - eventsWithUsc.length;
  const selectedEvent = selected
    ? data.events.find((e) => e.artifact_uri === selected) ?? null
    : null;

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
      <Panel
        title={
          <span style={{ display: "inline-flex", alignItems: "center" }}>
            Spatiotemporal correlation
            <InfoTip term="Correlation">{EXPLAINERS.correlation}</InfoTip>
          </span>
        }
        extra={
          <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>
            r<sub>s</sub>={data.bandwidth.r_s} · r<sub>t</sub>={(data.bandwidth.r_t_ms / 1000).toFixed(1)}s
          </span>
        }
      >
        <div style={{ padding: 18 }}>
          <div
            style={{
              fontSize: 12,
              color: "var(--fg-1)",
              lineHeight: 1.6,
              marginBottom: 14,
              maxWidth: 760,
            }}
          >
            Every event below is scored against the trigger using the real cross-tier match
            formula{" "}
            <FormulaInline />
            , computed live from each artifact&apos;s stored USC tuple (
            <code className="mono" style={{ fontSize: 11, color: "var(--fg-0)" }}>
              spatial · temporal · σ<sub>s</sub> · σ<sub>t</sub>
            </code>
            ). The visualization below is not a synthesis — it&apos;s the agent&apos;s actual
            scoring substrate.
            {eventsWithoutUsc > 0 && (
              <span style={{ color: "var(--warn)", marginLeft: 8 }}>
                · {eventsWithoutUsc} event{eventsWithoutUsc === 1 ? "" : "s"} missing stored USC; shown as &quot;unavailable&quot;
              </span>
            )}
          </div>

          <TimelineSVG events={data.events} selected={selected} onSelect={setSelected} />

          <ScoreTable events={data.events} selected={selected} onSelect={setSelected} />

          {data.links.length > 0 && <LinksTable links={data.links} />}
        </div>
      </Panel>

      {selectedEvent && <UscInspector event={selectedEvent} onClose={() => setSelected(null)} />}
    </div>
  );
}

function FormulaInline() {
  return (
    <code
      className="mono"
      style={{
        fontSize: 11,
        background: "var(--bg-2)",
        border: "1px solid var(--bd-1)",
        padding: "1px 6px",
        borderRadius: 3,
        color: "var(--accent)",
      }}
    >
      C(p,Q) = exp(-d<sub>s</sub>²/(2(σ<sub>s</sub>²+r<sub>s</sub>²))) · exp(-d<sub>t</sub>²/(2(σ<sub>t</sub>²+r<sub>t</sub>²)))
    </code>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Timeline visualization — bars sized by REAL C(p,Q) vs trigger             */
/* ────────────────────────────────────────────────────────────────────────── */

function TimelineSVG({
  events,
  selected,
  onSelect,
}: {
  events: CorrelationEvent[];
  selected: string | null;
  onSelect: (uri: string) => void;
}) {
  const valid = events.filter((e) => e.usc);
  if (valid.length < 1) return null;

  const W = 760;
  const H = 180;
  const padL = 56;
  const padR = 16;
  const padT = 14;
  const padB = 32;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const t0 = Date.parse(valid[0]!.usc!.temporal);
  const tN = Date.parse(valid[valid.length - 1]!.usc!.temporal);
  const span = Math.max(1, tN - t0);
  const fmtDelta = (ms: number) => {
    const s = Math.round(ms / 1000);
    if (s < 60) return `+${s}s`;
    if (s < 3600) return `+${(s / 60).toFixed(1)}m`;
    return `+${(s / 3600).toFixed(2)}h`;
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{
        maxWidth: W,
        display: "block",
        border: "1px solid var(--bd-1)",
        borderRadius: 4,
        background: "var(--bg-1)",
      }}
    >
      {/* Y axis gridlines */}
      {[0, 0.25, 0.5, 0.75, 1].map((g) => {
        const y = padT + innerH - g * innerH;
        return (
          <g key={g}>
            <line
              x1={padL}
              x2={W - padR}
              y1={y}
              y2={y}
              stroke="var(--bd-1)"
              strokeWidth={1}
              strokeDasharray={g === 0 || g === 1 ? "" : "2,3"}
            />
            <text
              x={padL - 6}
              y={y + 3}
              textAnchor="end"
              fontSize={9}
              fill="var(--fg-3)"
              fontFamily="IBM Plex Mono, monospace"
            >
              {Math.round(g * 100)}
            </text>
          </g>
        );
      })}

      <text
        x={padL - 38}
        y={padT + innerH / 2}
        fontSize={9}
        fill="var(--fg-3)"
        fontFamily="IBM Plex Mono, monospace"
        textAnchor="middle"
        transform={`rotate(-90 ${padL - 38} ${padT + innerH / 2})`}
      >
        C(p,Q) %
      </text>

      {/* Match band ≥ threshold */}
      <rect
        x={padL}
        y={padT}
        width={innerW}
        height={(1 - MATCH_THRESHOLD) * innerH}
        fill="var(--accent-soft)"
        opacity={0.7}
      />
      <text
        x={W - padR - 4}
        y={padT + (1 - MATCH_THRESHOLD) * innerH - 4}
        fontSize={9}
        fill="var(--accent)"
        fontFamily="IBM Plex Mono, monospace"
        textAnchor="end"
      >
        match band ≥ {Math.round(MATCH_THRESHOLD * 100)}%
      </text>

      {valid.map((e, i) => {
        const t = Date.parse(e.usc!.temporal);
        const x = padL + ((t - t0) / span) * innerW;
        const c = e.match_vs_trigger?.C ?? 0;
        const barH = c * innerH;
        const y = padT + innerH - barH;
        const above = c >= MATCH_THRESHOLD;
        const isSel = selected === e.artifact_uri;
        return (
          <g
            key={e.artifact_uri}
            onClick={() => onSelect(e.artifact_uri)}
            style={{ cursor: "pointer" }}
          >
            <line
              x1={x}
              x2={x}
              y1={padT + innerH}
              y2={y}
              stroke={above ? "var(--accent)" : "var(--bd-3)"}
              strokeWidth={isSel ? 3 : 2}
            />
            <circle
              cx={x}
              cy={y}
              r={isSel ? 6 : 4}
              fill={above ? "var(--accent)" : "var(--bg-1)"}
              stroke={isSel ? "var(--accent-2)" : above ? "var(--accent)" : "var(--bd-3)"}
              strokeWidth={isSel ? 2 : 1.5}
            />
            {i === 0 && (
              <text
                x={x}
                y={padT - 4}
                fontSize={9}
                fill="var(--accent)"
                fontFamily="IBM Plex Mono, monospace"
                textAnchor="middle"
                fontWeight={600}
              >
                trigger
              </text>
            )}
          </g>
        );
      })}

      <line
        x1={padL}
        x2={W - padR}
        y1={padT + innerH}
        y2={padT + innerH}
        stroke="var(--bd-2)"
        strokeWidth={1}
      />
      <text
        x={padL}
        y={H - 8}
        fontSize={9}
        fill="var(--fg-3)"
        fontFamily="IBM Plex Mono, monospace"
      >
        t₀ = {new Date(t0).toISOString().slice(11, 19)} UTC
      </text>
      <text
        x={W - padR}
        y={H - 8}
        fontSize={9}
        fill="var(--fg-3)"
        fontFamily="IBM Plex Mono, monospace"
        textAnchor="end"
      >
        {fmtDelta(tN - t0)}
      </text>
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Score table — every column comes from real stored USC                     */
/* ────────────────────────────────────────────────────────────────────────── */

function ScoreTable({
  events,
  selected,
  onSelect,
}: {
  events: CorrelationEvent[];
  selected: string | null;
  onSelect: (uri: string) => void;
}) {
  return (
    <div
      style={{
        marginTop: 18,
        border: "1px solid var(--bd-1)",
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "56px 88px minmax(0, 1fr) 72px 72px 80px",
          padding: "8px 14px",
          background: "var(--bg-2)",
          borderBottom: "1px solid var(--bd-1)",
          fontSize: 9.5,
          fontWeight: 600,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          color: "var(--fg-2)",
        }}
      >
        <span>Step</span>
        <span>Δt from t₀</span>
        <span>Event</span>
        <span style={{ textAlign: "right" }}>C_spatial</span>
        <span style={{ textAlign: "right" }}>C_temporal</span>
        <span style={{ textAlign: "right" }}>C(p,Q)</span>
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {events.map((e, i) => (
          <ScoreRow
            key={e.artifact_uri}
            event={e}
            index={i}
            t0={events.find((x) => x.usc)?.usc?.temporal ?? null}
            selected={selected === e.artifact_uri}
            onSelect={() => onSelect(e.artifact_uri)}
          />
        ))}
      </ul>
    </div>
  );
}

function ScoreRow({
  event,
  index,
  t0,
  selected,
  onSelect,
}: {
  event: CorrelationEvent;
  index: number;
  t0: string | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const m = event.match_vs_trigger;
  const dtMs =
    event.usc && t0 ? Math.abs(Date.parse(event.usc.temporal) - Date.parse(t0)) : null;
  const fmtDt = (ms: number) => {
    const s = Math.round(ms / 1000);
    if (s === 0) return "trigger";
    if (s < 60) return `+${s}s`;
    if (s < 3600) return `+${(s / 60).toFixed(1)}m`;
    return `+${(s / 3600).toFixed(2)}h`;
  };
  return (
    <li
      onClick={onSelect}
      style={{
        display: "grid",
        gridTemplateColumns: "56px 88px minmax(0, 1fr) 72px 72px 80px",
        padding: "10px 14px",
        borderTop: index === 0 ? "none" : "1px solid var(--bd-1)",
        fontSize: 12,
        alignItems: "center",
        background: selected ? "var(--bg-2)" : "transparent",
        cursor: "pointer",
      }}
    >
      <span className="mono" style={{ color: "var(--fg-3)", fontSize: 11 }}>
        {String(index + 1).padStart(2, "0")}
      </span>
      <span className="mono" style={{ color: "var(--fg-2)", fontSize: 11 }}>
        {dtMs == null ? "—" : fmtDt(dtMs)}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ color: "var(--fg-0)" }}>{event.label}</span>
        <span
          className="mono"
          style={{
            display: "block",
            fontSize: 10.5,
            color: "var(--fg-3)",
            marginTop: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {event.artifact_uri}
        </span>
      </span>
      <ScoreNum value={m?.C_spatial ?? null} />
      <ScoreNum value={m?.C_temporal ?? null} />
      <ScoreNum value={m?.C ?? null} accent />
    </li>
  );
}

function ScoreNum({ value, accent }: { value: number | null; accent?: boolean }) {
  if (value == null) {
    return (
      <span
        className="mono"
        style={{ textAlign: "right", fontSize: 11, color: "var(--fg-4)" }}
      >
        unavailable
      </span>
    );
  }
  const pct = (value * 100).toFixed(value >= 0.99 ? 0 : 1);
  return (
    <span
      className="mono"
      style={{
        textAlign: "right",
        fontSize: 12,
        fontWeight: accent ? 600 : 500,
        color: accent
          ? value >= MATCH_THRESHOLD
            ? "var(--accent)"
            : "var(--fg-2)"
          : "var(--fg-1)",
      }}
    >
      {pct}%
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Adjacent-link table — shows the per-step chain confidence                 */
/* ────────────────────────────────────────────────────────────────────────── */

function LinksTable({
  links,
}: {
  links: CorrelationData["links"];
}) {
  const product = links.reduce((p, l) => p * l.match.C, 1);
  const geomean = links.length > 0 ? Math.pow(product, 1 / links.length) : 0;
  return (
    <div style={{ marginTop: 16 }}>
      <div
        className="overline"
        style={{ marginBottom: 8, fontSize: 9.5, display: "inline-flex", alignItems: "center" }}
      >
        Adjacent-link match scores · {links.length}
      </div>
      <div
        style={{
          border: "1px solid var(--bd-1)",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        {links.map((l, i) => (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 80px 80px 80px",
              padding: "8px 14px",
              borderTop: i === 0 ? "none" : "1px solid var(--bd-1)",
              fontSize: 11.5,
              alignItems: "center",
            }}
          >
            <span style={{ color: "var(--fg-1)" }}>
              link {String(i + 1).padStart(2, "0")} — Δt{" "}
              <span className="mono" style={{ color: "var(--fg-0)" }}>
                {(l.match.d_t_ms / 1000).toFixed(1)}s
              </span>
            </span>
            <ScoreNum value={l.match.C_spatial} />
            <ScoreNum value={l.match.C_temporal} />
            <ScoreNum value={l.match.C} accent />
          </div>
        ))}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 80px 80px 80px",
            padding: "8px 14px",
            borderTop: "1px solid var(--bd-1)",
            background: "var(--bg-2)",
            fontSize: 11.5,
            alignItems: "center",
          }}
        >
          <span style={{ color: "var(--fg-2)" }}>
            geometric mean ({links.length} links)
          </span>
          <span />
          <span />
          <ScoreNum value={geomean} accent />
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  USC inspector — shows the full 7-field tuple for a selected event         */
/* ────────────────────────────────────────────────────────────────────────── */

function UscInspector({
  event,
  onClose,
}: {
  event: CorrelationEvent;
  onClose: () => void;
}) {
  const usc = event.usc;
  return (
    <Panel
      title={
        <span style={{ display: "inline-flex", alignItems: "center" }}>
          USC inspector
          <InfoTip term="USC tuple" width={340}>{EXPLAINERS.uscTemporal}</InfoTip>
        </span>
      }
      extra={
        <button
          onClick={onClose}
          aria-label="Close inspector"
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
      }
    >
      <div style={{ padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-0)", marginBottom: 4 }}>
          {event.label}
        </div>
        <div className="mono" style={{ fontSize: 11, color: "var(--fg-3)", marginBottom: 14 }}>
          {event.artifact_uri}
        </div>
        {!usc ? (
          <div style={{ padding: 12, fontSize: 12, color: "var(--warn)" }}>
            No USC tuple stored for this artifact.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr",
              gap: "8px 18px",
              fontSize: 12.5,
              lineHeight: 1.5,
            }}
          >
            <Field name="s" label="spatial" />
            <Value mono>
              {usc.spatial.host && `host=${usc.spatial.host}`}
              {usc.spatial.service && (
                <span style={{ marginLeft: 8 }}>service={usc.spatial.service}</span>
              )}
              {usc.spatial.region && (
                <span style={{ marginLeft: 8 }}>region={usc.spatial.region}</span>
              )}
              {!usc.spatial.host && !usc.spatial.service && !usc.spatial.region && "(none recorded)"}
            </Value>

            <Field name="t" label="temporal" />
            <Value mono>{usc.temporal}</Value>

            <Field name="σs" label="spatial uncertainty" />
            <Value mono>{usc.spatial_uncertainty}</Value>

            <Field name="σt" label="temporal uncertainty" />
            <Value mono>{usc.temporal_uncertainty_ms}ms</Value>

            <Field name="π" label="provenance" />
            <Value mono>
              {usc.provenance
                ? Object.entries(usc.provenance)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(" · ")
                : "(none)"}
            </Value>

            <Field name="τ" label="tier" />
            <Value mono>{usc.tier ?? "(unset)"}</Value>

            <Field name="e" label="embedding" />
            <Value mono>768-d nomic-embed-text-v1.5 (truncated)</Value>
          </div>
        )}

        {event.match_vs_trigger && usc && (
          <div
            style={{
              marginTop: 18,
              paddingTop: 14,
              borderTop: "1px solid var(--bd-1)",
              fontSize: 11.5,
              color: "var(--fg-1)",
            }}
          >
            <div className="overline" style={{ marginBottom: 8, fontSize: 9.5 }}>
              Match vs trigger
            </div>
            <div
              className="mono"
              style={{
                display: "grid",
                gridTemplateColumns: "150px 1fr",
                gap: "4px 12px",
                fontSize: 11,
              }}
            >
              <span style={{ color: "var(--fg-3)" }}>d_s</span>
              <span>{event.match_vs_trigger.d_s}</span>
              <span style={{ color: "var(--fg-3)" }}>d_t (ms)</span>
              <span>{event.match_vs_trigger.d_t_ms.toLocaleString()}</span>
              <span style={{ color: "var(--fg-3)" }}>σ_s combined</span>
              <span>{event.match_vs_trigger.sigma_s.toFixed(3)}</span>
              <span style={{ color: "var(--fg-3)" }}>σ_t combined (ms)</span>
              <span>{event.match_vs_trigger.sigma_t_ms.toFixed(2)}</span>
              <span style={{ color: "var(--fg-3)" }}>C_spatial</span>
              <span>{(event.match_vs_trigger.C_spatial * 100).toFixed(2)}%</span>
              <span style={{ color: "var(--fg-3)" }}>C_temporal</span>
              <span>{(event.match_vs_trigger.C_temporal * 100).toFixed(2)}%</span>
              <span style={{ color: "var(--fg-3)" }}>C(p,Q)</span>
              <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                {(event.match_vs_trigger.C * 100).toFixed(2)}%
              </span>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

function Field({ name, label }: { name: string; label: string }) {
  return (
    <span>
      <span
        className="mono"
        style={{ color: "var(--accent)", fontSize: 12, fontWeight: 600, marginRight: 8 }}
      >
        {name}
      </span>
      <span style={{ color: "var(--fg-3)", fontSize: 11 }}>{label}</span>
    </span>
  );
}

function Value({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <span
      className={mono ? "mono" : undefined}
      style={{ fontSize: 12, color: "var(--fg-0)", wordBreak: "break-all" }}
    >
      {children}
    </span>
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
