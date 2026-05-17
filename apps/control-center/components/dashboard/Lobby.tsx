"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useTheme } from "./ThemeProvider";
import { LiveDot } from "./atoms";

export interface LobbyData {
  artifacts_total: number;
  investigations_total: number;
  events_last_24h: number;
}

interface MethodologyCard {
  title: string;
  blurb: string;
  href: string;
  tag: string;
}

const METHODOLOGY: MethodologyCard[] = [
  {
    tag: "03",
    title: "Architecture",
    blurb: "Five layers — integration, protocol, persistence, compute, surface — each decoupled from the others.",
    href: "/technical#architecture",
  },
  {
    tag: "04",
    title: "ContextSync Protocol",
    blurb: "Versioned, content-addressed artifacts with default-deny ACLs and immutable provenance.",
    href: "/technical#contextsync",
  },
  {
    tag: "05",
    title: "USC",
    blurb: "Seven-field spatiotemporal coordinate. Cross-tier match formula links events across noisy sources.",
    href: "/technical#usc",
  },
  {
    tag: "06",
    title: "Agent loop",
    blurb: "Seven-step investigate() procedure plus agentic-loop meta-tools for free-form questions.",
    href: "/technical#agent-loop",
  },
];

interface FutureConsole {
  title: string;
  source: string;
  body: string;
}

const FUTURE_CONSOLES: FutureConsole[] = [
  {
    title: "Connect Splunk Cloud",
    source: "Splunk",
    body: "Stream detections and saved searches from your tenant. Inherits ContextSync versioning automatically.",
  },
  {
    title: "Connect Microsoft Sentinel",
    source: "Sentinel",
    body: "Ingest analytic rule fires, incident records, and entity behavior from a Log Analytics workspace.",
  },
  {
    title: "Production console",
    source: "Org-wide",
    body: "Promote the agent against your live SOC. RBAC, audit export, and SOC2-grade retention.",
  },
];

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      onClick={() => setTheme(next)}
      title={`Switch to ${next} theme`}
      aria-label={`Switch to ${next} theme`}
      style={{
        width: 32,
        height: 32,
        border: "1px solid transparent",
        borderRadius: 4,
        background: "transparent",
        color: "var(--fg-2)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {theme === "dark" ? (
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <circle cx="7.5" cy="7.5" r="2.5" />
          <path d="M7.5 1.5v1.5M7.5 12V13.5M1.5 7.5h1.5M12 7.5h1.5M3.1 3.1l1.1 1.1M10.9 10.9l1.1 1.1M3.1 11.9l1.1-1.1M10.9 4.2l1.1-1.1" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <path d="M12.5 9A5.5 5.5 0 0 1 6 2.5 5.5 5.5 0 1 0 12.5 9Z" />
        </svg>
      )}
    </button>
  );
}

export function Lobby({ data }: { data: LobbyData }) {
  return (
    <div
      style={{
        height: "100dvh",
        background: "var(--bg-0)",
        color: "var(--fg-0)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <LobbyHeader />
      <main
        className="scroll"
        style={{
          flex: 1,
          overflowY: "auto",
          minHeight: 0,
        }}
      >
        <div
          style={{
            maxWidth: 1240,
            margin: "0 auto",
            padding: "28px 32px 36px",
            display: "flex",
            flexDirection: "column",
            gap: 22,
          }}
        >
          <Welcome data={data} />
          <DemoCard data={data} />
          <MethodologyRow />
          <FutureSection />
        </div>
      </main>
    </div>
  );
}

function LobbyHeader() {
  return (
    <header
      style={{
        height: 56,
        flexShrink: 0,
        background: "var(--bg-1)",
        borderBottom: "1px solid var(--bd-1)",
        padding: "0 28px",
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
        <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: 0.2, color: "var(--fg-0)" }}>MERIDIAN</span>
      </Link>
      <span style={{ color: "var(--fg-4)", fontSize: 14 }}>/</span>
      <span style={{ fontSize: 12.5, color: "var(--fg-1)", fontWeight: 500 }}>Console lobby</span>
      <div style={{ flex: 1 }} />
      <Link
        href="/technical"
        style={{
          padding: "6px 12px",
          background: "transparent",
          color: "var(--fg-1)",
          border: "1px solid var(--bd-2)",
          borderRadius: 4,
          fontSize: 12,
          fontWeight: 500,
          textDecoration: "none",
          marginRight: 8,
        }}
      >
        Read the methodology →
      </Link>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          fontSize: 11.5,
          color: "var(--fg-1)",
          paddingRight: 14,
          borderRight: "1px solid var(--bd-1)",
        }}
      >
        <LiveDot color="var(--ok)" />
        Pipeline live
      </span>
      <ThemeToggle />
      <div
        aria-hidden
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          background: "var(--bg-3)",
          border: "1px solid var(--bd-2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 600,
          color: "var(--accent)",
          letterSpacing: 0.4,
        }}
      >
        CJ
      </div>
    </header>
  );
}

function Welcome({ data }: { data: LobbyData }) {
  return (
    <section style={{ display: "flex", alignItems: "flex-end", gap: 28 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="overline-accent" style={{ fontSize: 10.5, marginBottom: 5 }}>Welcome, Christian</div>
        <h1
          style={{
            margin: 0,
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: -0.5,
            lineHeight: 1.15,
            color: "var(--fg-0)",
          }}
        >
          Choose a console.
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 13.5, lineHeight: 1.5, color: "var(--fg-2)", maxWidth: 720 }}>
          Each console is an isolated Meridian workspace bound to one detection source. The demo
          console below runs against a live pipeline — no mock data.
        </p>
      </div>
      <div
        className="mono"
        style={{
          display: "flex",
          gap: 20,
          fontSize: 11,
          color: "var(--fg-2)",
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}
      >
        <span>{data.artifacts_total.toLocaleString()} artifacts</span>
        <span style={{ color: "var(--fg-4)" }}>·</span>
        <span>{data.investigations_total.toLocaleString()} investigations</span>
        <span style={{ color: "var(--fg-4)" }}>·</span>
        <span>{data.events_last_24h.toLocaleString()} writes / 24h</span>
      </div>
    </section>
  );
}

function DemoCard({ data }: { data: LobbyData }) {
  return (
    <section
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--bd-1)",
        borderRadius: 8,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: "linear-gradient(90deg, var(--accent) 0%, transparent 80%)",
          opacity: 0.7,
        }}
      />
      <div
        style={{
          padding: "20px 24px 18px",
          display: "flex",
          alignItems: "flex-start",
          gap: 20,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
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
              <LiveDot color="var(--accent)" />
              Reference workspace
            </span>
            <span className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>
              console-id: demo
            </span>
          </div>
          <h2
            style={{
              margin: 0,
              fontSize: 19,
              fontWeight: 600,
              letterSpacing: -0.3,
              lineHeight: 1.25,
              color: "var(--fg-0)",
            }}
          >
            Meridian Demo Console
          </h2>
          <p
            style={{
              margin: "5px 0 0",
              fontSize: 13,
              lineHeight: 1.5,
              color: "var(--fg-1)",
              maxWidth: 700,
            }}
          >
            A fully wired incident-intelligence workspace running against a live MongoDB Atlas
            cluster fed by Splunk Enterprise. Five incident archetypes seeded; the Gemini-3
            reasoning agent has investigated them end-to-end.
          </p>
        </div>
        <Link
          href="/app/overview"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 18px",
            background: "var(--accent)",
            color: "var(--accent-text)",
            borderRadius: 4,
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
            letterSpacing: 0.1,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          Enter console
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M3 6h6M6.5 3.5L9 6L6.5 8.5" />
          </svg>
        </Link>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          borderTop: "1px solid var(--bd-1)",
        }}
      >
        <StatTile label="Artifacts" value={data.artifacts_total.toLocaleString()} sub="ContextSync URIs" />
        <StatTile label="Investigations" value={data.investigations_total.toLocaleString()} sub="in agent_memory" />
        <StatTile label="Writes / 24h" value={data.events_last_24h.toLocaleString()} sub="provenance log" />
        <StatTile label="Storage" value="60 / 512 MB" sub="Atlas M0 budget" last />
      </div>
    </section>
  );
}

function StatTile({ label, value, sub, last }: { label: string; value: string; sub: string; last?: boolean }) {
  return (
    <div
      style={{
        padding: "12px 18px",
        borderRight: last ? "none" : "1px solid var(--bd-1)",
      }}
    >
      <div className="overline" style={{ fontSize: 9, marginBottom: 4 }}>{label}</div>
      <div
        className="mono"
        style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.4, lineHeight: 1, color: "var(--fg-0)" }}
      >
        {value}
      </div>
      <div style={{ fontSize: 10.5, color: "var(--fg-2)", marginTop: 3 }}>{sub}</div>
    </div>
  );
}

function MethodologyRow() {
  return (
    <section>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
        <div className="overline" style={{ fontSize: 10 }}>How it works</div>
        <span style={{ fontSize: 11.5, color: "var(--fg-3)" }}>
          Click any card to read the section in the methodology paper.
        </span>
        <span style={{ flex: 1 }} />
        <Link
          href="/technical"
          style={{
            fontSize: 11.5,
            color: "var(--accent)",
            textDecoration: "none",
            fontWeight: 500,
          }}
        >
          Full white paper →
        </Link>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        {METHODOLOGY.map((m) => (
          <MethodCard key={m.title} card={m} />
        ))}
      </div>
    </section>
  );
}

function MethodCard({ card }: { card: MethodologyCard }) {
  return (
    <Link
      href={card.href}
      className="method-card"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "14px 16px",
        background: "var(--bg-1)",
        border: "1px solid var(--bd-1)",
        borderRadius: 6,
        textDecoration: "none",
        color: "inherit",
        minHeight: 112,
        position: "relative",
        transition: "border-color 120ms ease, background 120ms ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="mono" style={{ fontSize: 10.5, color: "var(--accent)", fontWeight: 600 }}>
          {card.tag}
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--fg-0)" }}>{card.title}</span>
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.5, color: "var(--fg-2)", flex: 1 }}>{card.blurb}</div>
      <div
        className="method-arrow"
        style={{
          fontSize: 11,
          color: "var(--fg-3)",
          transition: "color 120ms ease",
          marginTop: 2,
        }}
      >
        Read more →
      </div>
    </Link>
  );
}

function FutureSection() {
  return (
    <section>
      <header style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
        <div className="overline" style={{ fontSize: 10 }}>Add a console</div>
        <span style={{ fontSize: 11.5, color: "var(--fg-3)" }}>
          Roadmap — additional detection sources Meridian will support in production.
        </span>
      </header>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {FUTURE_CONSOLES.map((c) => (
          <GhostCard key={c.title} console={c} />
        ))}
      </div>
    </section>
  );
}

function GhostCard({ console: c }: { console: FutureConsole }) {
  return (
    <div
      style={{
        background: "transparent",
        border: "1px dashed var(--bd-2)",
        borderRadius: 6,
        padding: "12px 16px",
        opacity: 0.75,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minHeight: 104,
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
          {c.source}
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
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-1)" }}>{c.title}</div>
      <div style={{ fontSize: 11.5, lineHeight: 1.45, color: "var(--fg-2)" }}>{c.body}</div>
    </div>
  );
}

// Small body of CSS used by the method cards' hover state lives in globals.css
// (.method-card:hover, .method-card:hover .method-arrow)
export type _LobbyLayoutMarker = ReactNode;
