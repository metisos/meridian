"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

interface Section {
  id: string;
  number: string;
  title: string;
}

const SECTIONS: Section[] = [
  { id: "problem", number: "01", title: "The problem" },
  { id: "thesis", number: "02", title: "Thesis: state and compute, decoupled" },
  { id: "architecture", number: "03", title: "Architecture" },
  { id: "contextsync", number: "04", title: "ContextSync Protocol" },
  { id: "usc", number: "05", title: "Unified Spatiotemporal Coordinate" },
  { id: "agent-loop", number: "06", title: "Agent loop" },
  { id: "pipeline", number: "07", title: "Data pipeline" },
  { id: "casebook", number: "08", title: "Cognitive memory" },
  { id: "surface", number: "09", title: "Surface" },
  { id: "results", number: "10", title: "Results" },
  { id: "acknowledgements", number: "11", title: "Acknowledgements" },
];

export function TechnicalPaper() {
  const [active, setActive] = useState<string>(SECTIONS[0]!.id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: 0 },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--bg-0)",
        color: "var(--fg-0)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <PaperHeader />
      <main style={{ flex: 1, display: "flex", justifyContent: "center" }}>
        <div
          style={{
            width: "100%",
            maxWidth: 1280,
            padding: "56px 32px 96px",
            display: "grid",
            gridTemplateColumns: "240px minmax(0, 1fr) 220px",
            gap: 48,
          }}
        >
          <TOC active={active} />
          <article style={{ minWidth: 0, fontSize: 15, lineHeight: 1.7, color: "var(--fg-1)" }}>
            <Cover />
            <Problem />
            <Thesis />
            <Architecture />
            <ContextSync />
            <USC />
            <AgentLoop />
            <Pipeline />
            <Casebook />
            <Surface />
            <Results />
            <Acknowledgements />
          </article>
          <Meta />
        </div>
      </main>
    </div>
  );
}

function PaperHeader() {
  return (
    <header
      style={{
        height: 56,
        flexShrink: 0,
        borderBottom: "1px solid var(--bd-1)",
        background: "var(--bg-1)",
        padding: "0 32px",
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}
    >
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
        <svg width="16" height="16" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--accent)" strokeWidth="1.3" />
          <line x1="8" y1="0.5" x2="8" y2="15.5" stroke="var(--accent)" strokeWidth="1.3" />
          <line x1="0.5" y1="8" x2="15.5" y2="8" stroke="var(--accent)" strokeWidth="0.8" opacity="0.5" />
          <circle cx="8" cy="8" r="1.6" fill="var(--accent)" />
        </svg>
        <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: 0.2 }}>MERIDIAN</span>
      </Link>
      <span style={{ color: "var(--fg-4)" }}>/</span>
      <span style={{ fontSize: 12.5, color: "var(--fg-1)", fontWeight: 500 }}>Methodology white paper</span>
      <div style={{ flex: 1 }} />
      <Link
        href="/app"
        style={{
          padding: "8px 14px",
          background: "var(--accent)",
          color: "var(--accent-text)",
          borderRadius: 4,
          fontSize: 12.5,
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        Open the Control Center →
      </Link>
    </header>
  );
}

function TOC({ active }: { active: string }) {
  return (
    <aside
      style={{
        position: "sticky",
        top: 32,
        alignSelf: "start",
        maxHeight: "calc(100dvh - 80px)",
        overflowY: "auto",
        paddingRight: 12,
      }}
    >
      <div className="overline" style={{ marginBottom: 14, fontSize: 10 }}>Contents</div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            style={{
              display: "grid",
              gridTemplateColumns: "28px 1fr",
              gap: 8,
              padding: "7px 10px",
              borderRadius: 3,
              textDecoration: "none",
              fontSize: 12.5,
              color: active === s.id ? "var(--fg-0)" : "var(--fg-2)",
              background: active === s.id ? "var(--bg-2)" : "transparent",
              boxShadow: active === s.id ? "inset 2px 0 0 0 var(--accent)" : "none",
              fontWeight: active === s.id ? 600 : 500,
              lineHeight: 1.35,
            }}
          >
            <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-3)" }}>{s.number}</span>
            <span>{s.title}</span>
          </a>
        ))}
      </nav>
    </aside>
  );
}

function Meta() {
  return (
    <aside style={{ position: "sticky", top: 32, alignSelf: "start", paddingLeft: 0 }}>
      <MetaItem k="Version" v="0.1" />
      <MetaItem k="Status" v="Public draft" />
      <MetaItem k="Author" v="Christian Johnson" />
      <MetaItem k="Organization" v="Metis Analytics" />
      <MetaItem k="License" v="Apache 2.0" />
      <MetaItem k="Source" v={<a href="https://github.com/metisos" style={{ color: "var(--accent)", textDecoration: "none" }}>github.com/metisos</a>} />
    </aside>
  );
}

function MetaItem({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div style={{ padding: "8px 0", borderBottom: "1px solid var(--bd-1)" }}>
      <div className="overline" style={{ fontSize: 9.5, marginBottom: 3 }}>{k}</div>
      <div className="mono" style={{ fontSize: 11.5, color: "var(--fg-0)" }}>{v}</div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Section components                                                          */
/* ────────────────────────────────────────────────────────────────────────── */

function Cover() {
  return (
    <div style={{ paddingBottom: 56, borderBottom: "1px solid var(--bd-1)", marginBottom: 56 }}>
      <div className="overline-accent" style={{ marginBottom: 18 }}>
        Methodology white paper · v0.1
      </div>
      <h1
        style={{
          margin: 0,
          fontSize: 44,
          fontWeight: 600,
          letterSpacing: -1.4,
          lineHeight: 1.1,
          color: "var(--fg-0)",
        }}
      >
        Meridian
        <br />
        <span style={{ color: "var(--fg-2)" }}>
          context-aware incident intelligence
        </span>
      </h1>
      <p
        style={{
          marginTop: 22,
          fontSize: 17,
          lineHeight: 1.6,
          color: "var(--fg-1)",
          maxWidth: 640,
        }}
      >
        How Meridian turns raw detection telemetry into source-bound incident narratives
        using a decoupled state/compute architecture, the ContextSync Protocol, and a
        Gemini-3 reasoning agent.
      </p>
      <div
        style={{
          marginTop: 30,
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 1,
          background: "var(--bd-1)",
          border: "1px solid var(--bd-1)",
          borderRadius: 6,
        }}
      >
        <CoverStat k="Architecture" v="5 layers" />
        <CoverStat k="State protocol" v="ContextSync v0.2" />
        <CoverStat k="Reasoning" v="Gemini 3.1 Pro" />
        <CoverStat k="License" v="Apache 2.0" />
      </div>
    </div>
  );
}

function CoverStat({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ background: "var(--bg-1)", padding: "16px 18px" }}>
      <div className="overline" style={{ fontSize: 9.5, marginBottom: 6 }}>{k}</div>
      <div className="mono" style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-0)" }}>{v}</div>
    </div>
  );
}

function H2({ id, num, children }: { id: string; num: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      style={{
        margin: "64px 0 24px",
        scrollMarginTop: 80,
        fontSize: 26,
        fontWeight: 600,
        letterSpacing: -0.6,
        lineHeight: 1.2,
        color: "var(--fg-0)",
        display: "flex",
        alignItems: "baseline",
        gap: 16,
      }}
    >
      <span className="mono" style={{ fontSize: 13, color: "var(--accent)", fontWeight: 500 }}>{num}</span>
      <span>{children}</span>
    </h2>
  );
}

function H3({ children }: { children: ReactNode }) {
  return (
    <h3
      style={{
        margin: "32px 0 14px",
        fontSize: 17,
        fontWeight: 600,
        color: "var(--fg-0)",
        letterSpacing: -0.2,
      }}
    >
      {children}
    </h3>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p style={{ margin: "0 0 16px", fontSize: 14.5, lineHeight: 1.7, color: "var(--fg-1)" }}>{children}</p>;
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code
      className="mono"
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--bd-1)",
        borderRadius: 3,
        padding: "1px 6px",
        fontSize: 12.5,
        color: "var(--fg-0)",
      }}
    >
      {children}
    </code>
  );
}

function Block({ children }: { children: ReactNode }) {
  return (
    <pre
      className="mono scroll"
      style={{
        margin: "0 0 18px",
        padding: "14px 16px",
        background: "var(--bg-1)",
        border: "1px solid var(--bd-1)",
        borderRadius: 4,
        fontSize: 12,
        lineHeight: 1.6,
        color: "var(--fg-0)",
        overflowX: "auto",
      }}
    >
      {children}
    </pre>
  );
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        margin: "0 0 20px",
        padding: "14px 18px",
        background: "var(--accent-soft)",
        borderLeft: "3px solid var(--accent)",
        borderRadius: 3,
        fontSize: 14,
        lineHeight: 1.6,
        color: "var(--fg-0)",
        fontWeight: 500,
      }}
    >
      {children}
    </div>
  );
}

function Problem() {
  return (
    <section>
      <H2 id="problem" num="01">The problem</H2>
      <P>
        Modern security operations centers receive tens of thousands of detections per day across
        SIEM, EDR, identity, network, and cloud sources. Each detection arrives as a discrete row
        in a query tool. The analyst&apos;s job is to convert those rows into an answer the
        business cares about:{" "}
        <strong style={{ color: "var(--fg-0)" }}>
          what happened, what does it mean, who is affected, and what should we do.
        </strong>
      </P>
      <P>
        That conversion is mostly manual. The analyst pivots between queries, takes notes in a
        ticket, traces dependencies in a runbook, and writes a narrative for the executive team.
        The work product — the incident write-up — is the only deliverable that matters, and it&apos;s
        produced last, slowly, by hand.
      </P>
      <P>
        We argue that the gap between &quot;the alert fired&quot; and &quot;the executive understands the
        incident&quot; is a problem of state, not of compute. The events exist. The relationships
        between them exist. The dependency graph exists. What&apos;s missing is a substrate that
        unifies them so a reasoning agent can compose the narrative directly.
      </P>
    </section>
  );
}

function Thesis() {
  return (
    <section>
      <H2 id="thesis" num="02">Thesis: state and compute, decoupled</H2>
      <Callout>
        The truth of what the organization knows belongs in a protocol-governed state layer. The
        reasoning belongs in a stateless compute layer that operates against it. The surface
        belongs in a third layer that presents the result. Each tier evolves without the others.
      </Callout>
      <P>
        Most agent products today put state and compute in the same place: the model&apos;s
        conversation buffer, plus a vector store for retrieval. This collapses several distinct
        concerns — provenance, versioning, multi-actor permissions, audit, retention — onto a
        substrate that wasn&apos;t designed for them.
      </P>
      <P>
        Meridian inverts this. We treat the state of what the organization knows as a first-class
        protocol-governed artifact store. The agent reasons over it. The Control Center surfaces
        the result. The compute layer can be swapped (today Gemini 3, tomorrow whatever wins) and
        the state layer doesn&apos;t move. The surface layer can be rebuilt and the agent
        doesn&apos;t notice. This is the architectural pattern we believe wins the next decade of
        operational AI products.
      </P>
    </section>
  );
}

function Architecture() {
  return (
    <section>
      <H2 id="architecture" num="03">Architecture</H2>
      <P>
        Meridian organizes its work into five stacked layers. Each layer has a stable contract
        with the layers above and below it. Internal evolution of any one layer does not require
        coordination with the others.
      </P>

      <ArchDiagram />

      <H3>Integration</H3>
      <P>
        Source-system connectors. The current implementation uses the Model Context Protocol
        (MCP) to talk to a Splunk Enterprise tenant for telemetry and to a MongoDB Atlas cluster
        for the artifact store. MCP gives us a stable tool interface that the reasoning agent can
        consume natively, and lets us add or swap sources without changing the agent.
      </P>

      <H3>Protocol</H3>
      <P>
        ContextSync Protocol v0.2 — the rules that govern every artifact Meridian writes:
        URIs, versioning, content addressing, default-deny permissions, immutable provenance.
        Detailed in §04.
      </P>

      <H3>Persistence</H3>
      <P>
        MongoDB Atlas. Three collections matter:
        {" "}<Code>artifacts</Code> (every event ever ingested, ~7,800 today),
        {" "}<Code>agent_memory</Code> (every investigation the agent has completed),
        {" "}<Code>provenance</Code> (the immutable read/write log).
        A fourth collection,{" "}<Code>entity_graph</Code>, holds dependency relationships used
        for blast-radius traversal. All artifacts are stamped with a Unified Spatiotemporal
        Coordinate (§05) and indexed via Atlas Vector Search on 768-dimensional embeddings
        produced by nomic-embed-text-v1.5.
      </P>

      <H3>Compute</H3>
      <P>
        Gemini 3.1 Pro (preview) via Vertex AI. The model has direct access to the persistence
        layer via two MCP servers (one for MongoDB, one for Splunk) routed through{" "}
        <Code>mcpToTool()</Code>. Agent code uses an explicit{" "}
        <Code>investigate(eventUri)</Code> entry point that walks a seven-step procedure
        described in §06.
      </P>

      <H3>Surface</H3>
      <P>
        The Meridian Control Center — a Next.js 16 / React 19 application. Server Components
        query MongoDB directly on every request. Real-time updates flow via change streams. UI
        design is deliberately CISO-grade: calm, source-cited, no dashboards-for-the-sake-of-dashboards.
      </P>
    </section>
  );
}

function ArchDiagram() {
  const layers = [
    { name: "Surface", body: "Meridian Control Center" },
    { name: "Compute", body: "Gemini 3.1 Pro · investigate() · agentic loop" },
    { name: "Persistence", body: "MongoDB Atlas · vector search · provenance log" },
    { name: "Protocol", body: "ContextSync v0.2 · USC stamps · default-deny ACLs" },
    { name: "Integration", body: "MCP — Splunk Enterprise, MongoDB, future sources" },
  ];
  return (
    <div
      style={{
        margin: "0 0 28px",
        border: "1px solid var(--bd-1)",
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      {layers.map((l, i) => (
        <div
          key={l.name}
          style={{
            display: "grid",
            gridTemplateColumns: "140px 1fr",
            background: "var(--bg-1)",
            borderTop: i === 0 ? "none" : "1px solid var(--bd-1)",
          }}
        >
          <div
            style={{
              padding: "14px 18px",
              background: "var(--bg-2)",
              borderRight: "1px solid var(--bd-1)",
              display: "flex",
              alignItems: "center",
            }}
          >
            <span
              className="overline-accent"
              style={{ fontSize: 11 }}
            >
              {String(layers.length - i).padStart(2, "0")} · {l.name}
            </span>
          </div>
          <div style={{ padding: "14px 18px", fontSize: 13.5, color: "var(--fg-1)" }}>{l.body}</div>
        </div>
      ))}
    </div>
  );
}

function ContextSync() {
  return (
    <section>
      <H2 id="contextsync" num="04">ContextSync Protocol</H2>
      <P>
        ContextSync is the substrate every artifact in Meridian lives on. The contract is small,
        intentional, and stable.
      </P>

      <H3>URIs</H3>
      <P>
        Every artifact has a globally-unique identifier of the form{" "}
        <Code>ctx://&#123;org&#125;/&#123;domain&#125;/&#123;id&#125;</Code>. The{" "}
        <Code>org</Code> field scopes the artifact to a tenant. The <Code>domain</Code>{" "}
        partitions by kind ({" "}<Code>splunk-events</Code>, <Code>investigations</Code>,{" "}
        <Code>entities</Code>, <Code>compliance</Code>). The <Code>id</Code> is the
        content-addressable hash of the artifact body. URIs are stable; payloads are immutable
        for a given URI. New versions get new URIs.
      </P>

      <H3>Versioning + provenance</H3>
      <P>
        Updates produce a new content-addressed artifact rather than mutating in place. Each
        write is appended to the <Code>provenance</Code> log with actor, operation, artifact
        URI, and timestamp. This is what powers the &quot;source-bound&quot; guarantee — every
        claim the agent surfaces in an investigation can be traced back to a specific read or
        write, and the audit trail is non-repudiable.
      </P>

      <H3>Permissions</H3>
      <P>
        Default-deny. Actors must hold an explicit grant for{" "}
        <Code>read</Code>, <Code>write</Code>, or <Code>publish</Code> on a given URI prefix.
        Grants are themselves artifacts and follow the same versioning + provenance rules.
      </P>

      <H3>Specification</H3>
      <P>
        Full protocol spec lives at{" "}
        <a
          href="https://github.com/metisos/contextsync-protocol"
          style={{ color: "var(--accent)", textDecoration: "none" }}
        >
          github.com/metisos/contextsync-protocol
        </a>
        . Meridian implements the v0.2 surface.
      </P>
    </section>
  );
}

function USC() {
  return (
    <section>
      <H2 id="usc" num="05">Unified Spatiotemporal Coordinate</H2>
      <P>
        The USC is a 7-field tuple that locates every artifact in space and time with measurable
        uncertainty. It is how Meridian decides which events are related across noisy,
        distributed sources.
      </P>

      <Block>{`USC = ⟨ s, t, σs, σt, π, τ, e ⟩

s   spatial coordinate    (host, region, service, asset URI)
t   temporal coordinate   (ISO-8601 UTC, with sub-millisecond resolution)
σs  spatial uncertainty   (Gaussian std; topology-aware)
σt  temporal uncertainty  (Gaussian std; clock-skew aware)
π   provenance reference  (ctx:// URI of the producing actor)
τ   tier label            (cognitive · temporal · spatial)
e   embedding            (768-d nomic-embed-text-v1.5)`}</Block>

      <H3>Cross-tier match formula</H3>
      <P>
        Two artifacts are considered candidates for causal linkage when the Gaussian-product
        score across their spatial and temporal coordinates exceeds a threshold:
      </P>

      <div
        style={{
          margin: "0 0 18px",
          padding: "20px 24px",
          background: "var(--bg-1)",
          border: "1px solid var(--accent-bd)",
          borderRadius: 6,
          textAlign: "center",
        }}
      >
        <span className="mono" style={{ fontSize: 15, color: "var(--accent)", letterSpacing: 0.4 }}>
          C(p, Q) = exp(−d<sub>s</sub>² / (2(σ<sub>s</sub>² + r<sub>s</sub>²))) · exp(−d<sub>t</sub>² / (2(σ<sub>t</sub>² + r<sub>t</sub>²)))
        </span>
      </div>

      <P>
        where <Code>d<sub>s</sub></Code> and <Code>d<sub>t</sub></Code> are the spatial and
        temporal distances between the candidate <Code>p</Code> and the query{" "}
        <Code>Q</Code>, and <Code>r<sub>s</sub></Code> / <Code>r<sub>t</sub></Code> are the
        match-bandwidth parameters of the query. A score of <Code>1.0</Code> means perfect
        co-location; the agent treats any link below <Code>0.7</Code> as too weak to chain.
      </P>

      <H3>Worked example</H3>
      <P>
        For two events on the same host (<Code>d<sub>s</sub> = 0</Code>) separated by 16 seconds
        (<Code>d<sub>t</sub> = 16s</Code>), with temporal uncertainties of 5 seconds each, the
        score collapses to a one-dimensional Gaussian:
      </P>
      <Block>{`d_s = 0           →  exp(0) = 1.000
d_t = 16s         →  exp(−256 / (2 · (25 + 25))) = exp(−2.56) ≈ 0.077

C = 1.000 · 0.077 = 0.077    (below threshold, no link)`}</Block>
      <P>
        Tighten either uncertainty parameter and the link strengthens. The agent surfaces these
        scores per step in the Correlation sub-tab of an incident, so the user can audit which
        events were chained on what evidence.
      </P>
    </section>
  );
}

function AgentLoop() {
  return (
    <section>
      <H2 id="agent-loop" num="06">Agent loop</H2>
      <P>
        The reasoning agent has one canonical entry point —{" "}
        <Code>investigate(triggerArtifactUri)</Code> — and walks a seven-step procedure to
        produce a complete investigation record:
      </P>

      <ol style={{ paddingLeft: 22, fontSize: 14.5, lineHeight: 1.7, color: "var(--fg-1)", margin: "0 0 18px" }}>
        <li style={{ marginBottom: 6 }}>
          <strong style={{ color: "var(--fg-0)" }}>Fetch trigger.</strong> Read the artifact at{" "}
          <Code>triggerArtifactUri</Code> from the persistence layer.
        </li>
        <li style={{ marginBottom: 6 }}>
          <strong style={{ color: "var(--fg-0)" }}>Recall.</strong> Vector-search{" "}
          <Code>agent_memory</Code> for similar past investigations.
        </li>
        <li style={{ marginBottom: 6 }}>
          <strong style={{ color: "var(--fg-0)" }}>Causal chain.</strong> Walk backward through
          USC-matched artifacts to assemble the sequence of events that led here.
        </li>
        <li style={{ marginBottom: 6 }}>
          <strong style={{ color: "var(--fg-0)" }}>Blast radius.</strong> Traverse the{" "}
          <Code>entity_graph</Code> outward from the trigger&apos;s root entity, categorizing
          hits as infrastructure, business, or compliance.
        </li>
        <li style={{ marginBottom: 6 }}>
          <strong style={{ color: "var(--fg-0)" }}>Hypothesis.</strong> Compose a root-cause
          hypothesis grounded in the chain.
        </li>
        <li style={{ marginBottom: 6 }}>
          <strong style={{ color: "var(--fg-0)" }}>Actions.</strong> Surface a prioritized
          action list with severity and reversibility annotations.
        </li>
        <li style={{ marginBottom: 6 }}>
          <strong style={{ color: "var(--fg-0)" }}>Persist.</strong> Write the full
          investigation record to <Code>agent_memory</Code>, append to{" "}
          <Code>provenance</Code>, and notify the surface layer via change streams.
        </li>
      </ol>

      <H3>Agentic loop with meta-tools</H3>
      <P>
        For free-form questions (the Meridian Agent surface), we use the Claude-style
        agentic loop pattern with four meta-tools: <Code>search_tools</Code>,{" "}
        <Code>list_tools</Code>, <Code>list_tool_details</Code>, <Code>call_tool</Code>. This
        keeps the agent&apos;s context window small — we never load the full MCP tool catalog
        into the prompt. The agent discovers tools on demand.
      </P>

      <H3>Splunk-native tool calls</H3>
      <P>
        The Meridian Agent surface attaches the Splunkbase MCP server (app 7931) to Gemini via{" "}
        <Code>mcpToTool()</Code>. When the CISO asks a search-shaped question, Gemini
        autonomously translates it into SPL, executes the search against live Splunk via the
        MCP transport, and renders both the SPL query and the result table in the chat
        response. Examples:
      </P>
      <ul style={{ paddingLeft: 22, fontSize: 14.5, lineHeight: 1.7, color: "var(--fg-1)", margin: "0 0 16px" }}>
        <li>
          <em>&quot;Show the top 5 sourcetypes by event count over the last 30 days&quot;</em>{" "}
          → agent emits <Code>| tstats count by sourcetype | sort -count | head 5</Code>,
          executes, returns the actual table.
        </li>
        <li>
          <em>&quot;Find proxy events with response_code &gt;= 500&quot;</em> → agent constructs
          a bounded SPL search with proper time range and surfaces the results.
        </li>
      </ul>
      <P>
        If the MCP server is unreachable, the agent falls back to emitting the SPL block for
        the user to run manually via a <em>Run in Splunk</em> button. The chat never
        hard-breaks on infrastructure issues.
      </P>

      <H3>Multimodal input</H3>
      <P>
        The composer accepts up to four files per message (images, PDFs, DOCX, plain text;
        10 MB each, 20 MB total). Images and PDFs pass through to Gemini natively as inline
        binary parts. DOCX is parsed server-side via <Code>mammoth.js</Code> and attached as a
        text part. The agent reads attachments and reasons about them alongside the
        investigation casebook — a screenshot of a Slack alert, a prior post-mortem, a network
        diagram, all become first-class context.
      </P>
    </section>
  );
}

function Pipeline() {
  return (
    <section>
      <H2 id="pipeline" num="07">Data pipeline</H2>
      <P>
        End-to-end flow for a single detection:
      </P>
      <Block>{`Detection source  →  Splunk Enterprise   (8089 REST, 8088 HEC)
                  →  Splunk MCP server   (/services/mcp, Splunkbase app 7931)
                  →  Ingest worker       (ContextSync wrap + USC stamp)
                  →  MongoDB Atlas       (artifacts collection)
                                          ↓
                                          embedding (nomic v1.5)
                                          ↓
                                          Atlas Vector Search index
                                          ↓
                                          available to agent recall`}</Block>
      <P>
        Today the demo console runs against a self-hosted Splunk Enterprise 10.2.3 instance with
        five seeded incident archetypes (cascading failure, auth brute-force, privilege
        escalation, data exfiltration, DDoS surge). The artifact count is ~7,800. Investigations
        in <Code>agent_memory</Code> count three end-to-end runs at the time of writing. Storage
        footprint is ~60 MB against the Atlas M0 free-tier 512 MB cap, leaving generous room for
        production load.
      </P>
      <H3>Why MCP</H3>
      <P>
        We chose MCP over ad-hoc REST integration because it gives Gemini native tool routing
        via <Code>mcpToTool()</Code> in the <Code>@google/genai</Code> SDK. The agent doesn&apos;t
        need a custom adapter per source — every MCP server is a uniform interface. Adding a new
        detection source (Sentinel, CrowdStrike Falcon, GuardDuty) becomes installing its MCP
        server and granting the agent read permission.
      </P>
    </section>
  );
}

function Casebook() {
  return (
    <section>
      <H2 id="casebook" num="08">Cognitive memory</H2>
      <P>
        The agent has three tiers of memory, all backed by ContextSync artifacts:
      </P>
      <ul style={{ paddingLeft: 22, fontSize: 14.5, lineHeight: 1.7, color: "var(--fg-1)", margin: "0 0 16px" }}>
        <li style={{ marginBottom: 6 }}>
          <strong style={{ color: "var(--fg-0)" }}>Cognitive</strong> — what the agent has
          figured out. Stored in <Code>agent_memory</Code>. Surfaced as the{" "}
          <em>Casebook</em> tab and as the &quot;Similar past investigations&quot; panel.
        </li>
        <li style={{ marginBottom: 6 }}>
          <strong style={{ color: "var(--fg-0)" }}>Temporal</strong> — when things happened.
          Stored as the <Code>t</Code> and <Code>σt</Code> fields of every USC stamp.
        </li>
        <li style={{ marginBottom: 6 }}>
          <strong style={{ color: "var(--fg-0)" }}>Spatial</strong> — where things live. Stored
          as the <Code>entity_graph</Code> with edges encoding dependency.
        </li>
      </ul>

      <H3>Recall</H3>
      <P>
        Every new investigation begins with a vector-search over <Code>agent_memory</Code>{" "}
        using a 768-d cosine index. The agent treats matching past investigations as evidence
        for or against its current hypothesis. This is how Meridian learns from its own work
        without retraining the model.
      </P>

      <H3>Hybrid retrieval</H3>
      <P>
        For the human-facing &quot;similar past investigations&quot; surface in Incidents,
        Meridian runs <strong style={{ color: "var(--fg-0)" }}>hybrid retrieval</strong>{" "}
        against MongoDB Atlas — a{" "}
        <Code>$vectorSearch</Code> over the 768-d cosine index in parallel with a{" "}
        <Code>$text</Code> BM25 query over the hypothesis field — and fuses the two ranked
        lists with{" "}
        <strong style={{ color: "var(--fg-0)" }}>Reciprocal Rank Fusion</strong> (
        <Code>k = 60</Code>). Hits that appear high in either lane win. Both raw scores are
        shown next to the fused score in the UI so the analyst can audit the ranking instead
        of trusting a black-box similarity number.
      </P>
    </section>
  );
}

function Surface() {
  return (
    <section>
      <H2 id="surface" num="09">Surface</H2>
      <P>
        The Control Center is built to be read by a Chief Information Security Officer at 7am
        with a coffee, not by an L1 SOC analyst hunting for a needle. That constraint drives
        every design decision:
      </P>
      <ul style={{ paddingLeft: 22, fontSize: 14.5, lineHeight: 1.7, color: "var(--fg-1)", margin: "0 0 18px" }}>
        <li style={{ marginBottom: 6 }}>
          <strong style={{ color: "var(--fg-0)" }}>One posture above the fold.</strong>{" "}
          Stable, Elevated, or Critical — with the narrative answer underneath.
        </li>
        <li style={{ marginBottom: 6 }}>
          <strong style={{ color: "var(--fg-0)" }}>Source-bound everything.</strong> Every claim
          in every surface carries a <Code>ctx://</Code> URI you can click to read the
          underlying evidence — citation pills inline in chat, canvas, and incident detail.
        </li>
        <li style={{ marginBottom: 6 }}>
          <strong style={{ color: "var(--fg-0)" }}>Meridian Agent is primary.</strong> The CISO
          talks to the agent in plain English. It executes Splunk searches itself via MCP,
          summarizes the rows, and cites every claim. Multimodal — accepts attached
          screenshots, PDFs, and Word docs inline.
        </li>
        <li style={{ marginBottom: 6 }}>
          <strong style={{ color: "var(--fg-0)" }}>Canvas for deliverables.</strong> When the
          response is a written incident report — RCA, exec brief, weekly summary — it streams
          into a Claude-style canvas with copy / download as Markdown / export to PDF (via
          browser print pipeline) / export to Word <Code>.docx</Code>.
        </li>
        <li style={{ marginBottom: 6 }}>
          <strong style={{ color: "var(--fg-0)" }}>Incident drill-down with four lenses.</strong>{" "}
          Each incident in the feed opens to four sub-tabs:{" "}
          <em>Detail</em> (root-cause hypothesis, causal chain, blast radius, recommended
          actions),{" "}
          <em>Correlation</em> (real <Code>C(p,Q)</Code> match scores computed live from stored
          USC tuples — see §05),{" "}
          <em>Risk graph</em> (radial blast-radius visualization, click any entity to drill in),
          and{" "}
          <em>Provenance</em> (bipartite trace of the agent&apos;s actual reads and writes from
          the immutable provenance log).
        </li>
        <li style={{ marginBottom: 6 }}>
          <strong style={{ color: "var(--fg-0)" }}>Risk Map (org-wide).</strong> Force-directed
          graph of every entity in <Code>entity_graph</Code> with incident heat overlay. Toggle
          between Category view and Compliance lens (PCI-DSS / SOC 2 / GDPR / HIPAA / ISO 27001
          umbrellas derived by BFS from compliance entities).
        </li>
        <li style={{ marginBottom: 6 }}>
          <strong style={{ color: "var(--fg-0)" }}>Replay the agent loop.</strong> A{" "}
          <em>Replay</em> button on every incident streams the seven-step <Code>investigate()</Code>{" "}
          procedure as named events with per-step durations and the evidence each step touched.
          Transforms the product from a summary tool into a visible, auditable reasoning system.
        </li>
        <li style={{ marginBottom: 6 }}>
          <strong style={{ color: "var(--fg-0)" }}>Confidence with receipts.</strong> Every
          confidence pill opens a popover decomposing the number into <em>causal chain
          coherence</em>, <em>recall match strength</em>, and <em>action grounding</em>{" "}
          components with explicit weights — no black-box percentages.
        </li>
        <li style={{ marginBottom: 6 }}>
          <strong style={{ color: "var(--fg-0)" }}>Cross-incident patterns.</strong> Pattern
          chips on each incident surface relationships across the casebook: <em>same root
          entity</em>, <em>archetype cascade in 48h</em>, <em>entity overlap</em>, <em>severity
          burst</em>.
        </li>
        <li>
          <strong style={{ color: "var(--fg-0)" }}>Modular workspaces.</strong> Each console is
          an isolated workspace bound to one detection source. The lobby is the entry point;
          production sources are first-class peers of the demo, not afterthoughts.
        </li>
      </ul>
    </section>
  );
}

function Results() {
  return (
    <section>
      <H2 id="results" num="10">Results</H2>
      <P>
        Numbers from the live demo console at the time of writing:
      </P>
      <div
        style={{
          margin: "0 0 24px",
          border: "1px solid var(--bd-1)",
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        <ResultRow k="Artifacts ingested" v="~7,800" sub="across 5 incident archetypes" />
        <ResultRow k="Investigations completed" v="3 end-to-end" sub="100%, 100%, 95% confidence" />
        <ResultRow k="Cross-tier match accuracy" v="real C(p,Q) on every chain" sub="computed live from stored USC tuples, no synthesis" />
        <ResultRow k="Hybrid retrieval" v="$vectorSearch + $text + RRF" sub="both raw scores surfaced, k = 60" />
        <ResultRow k="Splunk MCP tool calls" v="agent executes SPL itself" sub="Splunkbase app 7931 via mcpToTool()" />
        <ResultRow k="Storage" v="60 MB / 512 MB" sub="Atlas M0 free tier, well within budget" />
        <ResultRow k="Median investigation latency" v="≈ 20 seconds" sub="trigger → narrative" />
        <ResultRow k="Provenance entries" v="100+ recorded" sub="every read/write logged, surfaced in Provenance sub-tab" last />
      </div>
      <P>
        The 20-second figure deserves context. The manual equivalent — an analyst writing an
        executive incident summary from raw Splunk results, with sources cited — is measured in
        hours. Meridian collapses the work, not the rigor: every claim in the resulting
        narrative is bound to a specific artifact URI that the analyst (or auditor) can open.
      </P>
    </section>
  );
}

function ResultRow({
  k,
  v,
  sub,
  last,
}: {
  k: string;
  v: string;
  sub: string;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 180px",
        gap: 24,
        padding: "14px 22px",
        background: "var(--bg-1)",
        borderBottom: last ? "none" : "1px solid var(--bd-1)",
        alignItems: "center",
      }}
    >
      <div>
        <div style={{ fontSize: 13.5, color: "var(--fg-0)", fontWeight: 500 }}>{k}</div>
        <div style={{ fontSize: 12, color: "var(--fg-2)", marginTop: 2 }}>{sub}</div>
      </div>
      <div className="mono" style={{ fontSize: 16, fontWeight: 600, color: "var(--fg-0)", textAlign: "right" }}>
        {v}
      </div>
    </div>
  );
}

function Acknowledgements() {
  return (
    <section>
      <H2 id="acknowledgements" num="11">Acknowledgements</H2>
      <P>
        Meridian is built on the shoulders of giants. The reasoning agent runs on{" "}
        <strong style={{ color: "var(--fg-0)" }}>Google Gemini 3.1 Pro</strong> via Vertex AI. The
        persistence layer is <strong style={{ color: "var(--fg-0)" }}>MongoDB Atlas</strong> with
        Vector Search. Detection telemetry is sourced from{" "}
        <strong style={{ color: "var(--fg-0)" }}>Splunk Enterprise</strong> via the Splunk MCP
        server (Splunkbase app 7931). Embeddings come from{" "}
        <strong style={{ color: "var(--fg-0)" }}>nomic-embed-text-v1.5</strong> (Apache 2.0). The
        surface is{" "}
        <strong style={{ color: "var(--fg-0)" }}>Next.js 16 + React 19 + TypeScript 5.7</strong>.
      </P>
      <P>
        Meridian itself is open source under Apache 2.0 at{" "}
        <a href="https://github.com/metisos" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}>
          github.com/metisos
        </a>
        . The ContextSync Protocol specification lives at{" "}
        <a
          href="https://github.com/metisos/contextsync-protocol"
          style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}
        >
          github.com/metisos/contextsync-protocol
        </a>
        .
      </P>
      <P>
        Built by Christian Johnson at <strong style={{ color: "var(--fg-0)" }}>Metis Analytics</strong>,
        Saint Louis, Missouri.
      </P>
    </section>
  );
}
