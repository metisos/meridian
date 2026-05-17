"use client";
import type { ConnectedSource, FutureSource, SourcesData } from "@/lib/sources";
import { Pill } from "./atoms";
import { InfoTip } from "./InfoTip";

const EXPLAINER_TEXT = {
  source: "A detection source is anything Meridian ingests events from. Today: a Splunk Enterprise instance with one or more indexes. Each Splunk index is treated as its own logical source so the agent can attribute every event to a known feed.",
  lastSeen: "Timestamp of the most recent event ingested from this source. If this falls behind the wall clock, your pipeline is stalled.",
  throughput: "Events ingested in the last hour vs. the last 24 hours. The 1h number rolls forward; the 24h gives you a stable baseline.",
} as const;

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const sec = Math.floor((Date.now() - Date.parse(iso)) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function Sources({ data }: { data: SourcesData }) {
  return (
    <div
      className="scroll"
      style={{
        flex: 1,
        overflowY: "auto",
        background: "var(--bg-0)",
        minHeight: 0,
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "24px 32px 56px",
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        <Header data={data} />
        <StatsStrip data={data} />
        <ConnectedSection sources={data.connected} />
        <FutureSection future={data.future} />
      </div>
    </div>
  );
}

function Header({ data }: { data: SourcesData }) {
  return (
    <section style={{ display: "flex", alignItems: "flex-end", gap: 20 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="overline-accent" style={{ marginBottom: 5, fontSize: 10.5, display: "inline-flex", alignItems: "center" }}>
          Sources
          <InfoTip term="Detection source" width={320}>{EXPLAINER_TEXT.source}</InfoTip>
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: -0.4,
            lineHeight: 1.2,
            color: "var(--fg-0)",
          }}
        >
          Operational visibility into your detection pipeline.
        </h1>
        <p style={{ margin: "5px 0 0", fontSize: 13, lineHeight: 1.55, color: "var(--fg-2)", maxWidth: 760 }}>
          Every feed Meridian listens to, with throughput, last-seen, and breakdown by sourcetype
          and host. If something stops shipping, you&apos;ll see it here first.
        </p>
      </div>
      <div className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>
        as of {new Date(data.generated_at).toISOString().slice(11, 19)} UTC
      </div>
    </section>
  );
}

function StatsStrip({ data }: { data: SourcesData }) {
  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
        gap: 1,
        background: "var(--bd-1)",
        border: "1px solid var(--bd-1)",
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      <Stat label="Connected sources" value={data.connected.length.toString()} sub={`${data.connected.length === 1 ? "1 feed" : data.connected.length + " feeds"} live`} />
      <Stat label="Events ingested" value={data.total_events.toLocaleString()} sub="all time" />
      <Stat
        label={
          <>
            Events · 24h
            <InfoTip term="Throughput" width={300}>{EXPLAINER_TEXT.throughput}</InfoTip>
          </>
        }
        value={data.total_events_24h.toLocaleString()}
        sub="rolling window"
      />
      <Stat label="Unique hosts" value={data.total_hosts.toString()} sub="across all feeds" />
      <Stat label="Sourcetypes" value={data.total_sourcetypes.toString()} sub="event categories" last />
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  last,
}: {
  label: React.ReactNode;
  value: string;
  sub?: string;
  last?: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--bg-1)",
        padding: "14px 18px",
        minWidth: 0,
        borderRight: last ? "none" : undefined,
      }}
    >
      <div
        className="overline"
        style={{ fontSize: 9.5, marginBottom: 6, display: "inline-flex", alignItems: "center" }}
      >
        {label}
      </div>
      <div
        className="mono"
        style={{
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: -0.4,
          lineHeight: 1,
          color: "var(--fg-0)",
        }}
      >
        {value}
      </div>
      {sub && <div style={{ marginTop: 4, fontSize: 11, color: "var(--fg-2)" }}>{sub}</div>}
    </div>
  );
}

function ConnectedSection({ sources }: { sources: ConnectedSource[] }) {
  return (
    <section>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
        <div className="overline" style={{ fontSize: 10 }}>Connected sources · {sources.length}</div>
        <span style={{ fontSize: 11.5, color: "var(--fg-3)" }}>
          Live feeds delivering events into this workspace.
        </span>
      </div>
      {sources.length === 0 ? (
        <div
          style={{
            padding: "28px 24px",
            background: "var(--bg-1)",
            border: "1px dashed var(--bd-2)",
            borderRadius: 6,
            textAlign: "center",
            color: "var(--fg-2)",
            fontSize: 13,
          }}
        >
          No connected sources yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {sources.map((s) => (
            <SourceCard key={s.id} source={s} />
          ))}
        </div>
      )}
    </section>
  );
}

function SourceCard({ source }: { source: ConnectedSource }) {
  const stale =
    !source.last_seen || Date.now() - Date.parse(source.last_seen) > 24 * 60 * 60_000;
  return (
    <article
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--bd-1)",
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "16px 22px 14px",
          display: "flex",
          alignItems: "flex-start",
          gap: 16,
          borderBottom: "1px solid var(--bd-1)",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 9px",
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            color: "var(--accent)",
            background: "var(--accent-soft)",
            border: "1px solid var(--accent-bd)",
            borderRadius: 3,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 4, background: "var(--accent)" }} />
          Splunk
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: "var(--fg-0)", letterSpacing: -0.2 }}>
              index =
            </span>
            <span className="mono" style={{ fontSize: 16, fontWeight: 600, color: "var(--accent)" }}>
              {source.display_name}
            </span>
          </div>
          <div
            className="mono"
            style={{ fontSize: 11.5, color: "var(--fg-3)", marginTop: 3 }}
          >
            {source.vendor}
            {source.server ? ` · ${source.server}` : ""}
          </div>
        </div>
        <Pill color={stale ? "crit" : "ok"}>
          {stale ? "Stale" : "Healthy"}
        </Pill>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          borderBottom: "1px solid var(--bd-1)",
        }}
      >
        <CardStat label="Events ingested" value={source.event_count.toLocaleString()} />
        <CardStat label="Events · 24h" value={source.events_last_24h.toLocaleString()} sub={`${source.events_last_1h.toLocaleString()} in last hour`} />
        <CardStat
          label={
            <>
              Last seen
              <InfoTip term="Last seen" width={300}>{EXPLAINER_TEXT.lastSeen}</InfoTip>
            </>
          }
          value={timeAgo(source.last_seen)}
          sub={source.last_seen ? new Date(source.last_seen).toISOString().slice(0, 19) + " UTC" : ""}
        />
        <CardStat label="Sourcetypes" value={source.sourcetypes.length.toString()} sub={`${source.hosts.length} hosts`} last />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 1,
          background: "var(--bd-1)",
        }}
      >
        <ChipList label="Sourcetypes" items={source.sourcetypes} mono accent />
        <ChipList label="Hosts" items={source.hosts} mono />
      </div>
    </article>
  );
}

function CardStat({
  label,
  value,
  sub,
  last,
}: {
  label: React.ReactNode;
  value: string;
  sub?: string;
  last?: boolean;
}) {
  return (
    <div
      style={{
        padding: "12px 18px",
        borderRight: last ? "none" : "1px solid var(--bd-1)",
        minWidth: 0,
      }}
    >
      <div className="overline" style={{ fontSize: 9, marginBottom: 5, display: "inline-flex", alignItems: "center" }}>
        {label}
      </div>
      <div className="mono" style={{ fontSize: 16, fontWeight: 600, color: "var(--fg-0)", letterSpacing: -0.2, lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && (
        <div
          className="mono"
          style={{
            marginTop: 4,
            fontSize: 10.5,
            color: "var(--fg-3)",
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

function ChipList({
  label,
  items,
  mono,
  accent,
}: {
  label: string;
  items: string[];
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div style={{ background: "var(--bg-1)", padding: "12px 18px" }}>
      <div className="overline" style={{ fontSize: 9, marginBottom: 8 }}>
        {label} · {items.length}
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 11, color: "var(--fg-3)" }}>(none)</div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {items.slice(0, 18).map((item) => (
            <span
              key={item}
              className={mono ? "mono" : undefined}
              style={{
                fontSize: 10.5,
                padding: "2px 7px",
                background: accent ? "var(--accent-soft)" : "var(--bg-2)",
                color: accent ? "var(--accent)" : "var(--fg-1)",
                border: `1px solid ${accent ? "var(--accent-bd)" : "var(--bd-1)"}`,
                borderRadius: 3,
                lineHeight: 1.4,
              }}
            >
              {item}
            </span>
          ))}
          {items.length > 18 && (
            <span
              className="mono"
              style={{ fontSize: 10, padding: "2px 7px", color: "var(--fg-3)" }}
            >
              + {items.length - 18} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function FutureSection({ future }: { future: FutureSource[] }) {
  return (
    <section>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
        <div className="overline" style={{ fontSize: 10 }}>Add a source</div>
        <span style={{ fontSize: 11.5, color: "var(--fg-3)" }}>
          Detection platforms Meridian will support in production.
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {future.map((f) => (
          <GhostSourceCard key={f.vendor} src={f} />
        ))}
      </div>
    </section>
  );
}

function GhostSourceCard({ src }: { src: FutureSource }) {
  return (
    <div
      style={{
        background: "transparent",
        border: "1px dashed var(--bd-2)",
        borderRadius: 6,
        padding: "14px 18px",
        opacity: 0.78,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minHeight: 116,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          className="mono"
          style={{
            fontSize: 9.5,
            color: "var(--fg-3)",
            letterSpacing: 0.4,
            textTransform: "uppercase",
            padding: "2px 7px",
            border: "1px solid var(--bd-2)",
            borderRadius: 3,
          }}
        >
          {src.vendor}
        </span>
        <span style={{ flex: 1 }} />
        <span
          className="mono"
          style={{
            fontSize: 9.5,
            color: "var(--fg-3)",
            letterSpacing: 0.4,
            textTransform: "uppercase",
          }}
        >
          Coming soon
        </span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-1)" }}>{src.display_name}</div>
      <div style={{ fontSize: 12, lineHeight: 1.5, color: "var(--fg-2)" }}>{src.body}</div>
    </div>
  );
}
