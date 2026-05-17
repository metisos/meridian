import Link from "next/link";
import "server-only";
import { fetchCounters } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const counters = await fetchCounters();
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-0)",
        color: "var(--fg-0)",
      }}
    >
      <Nav />
      <Hero counters={counters} />
      <Architecture />
      <Numbers counters={counters} />
      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        background: "var(--scrim)",
        borderBottom: "1px solid var(--bd-1)",
      }}
    >
      <div
        style={{
          width: "100%",
          padding: "16px 40px",
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <Wordmark />
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 4 }}>
          {[
            { label: "Architecture", href: "#architecture" },
            { label: "Methodology", href: "/technical" },
            { label: "Numbers", href: "#numbers" },
            { label: "GitHub", href: "https://github.com/metisos" },
          ].map((item) => (
            <a
              key={item.label}
              href={item.href}
              style={{
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--fg-1)",
                textDecoration: "none",
                borderRadius: 4,
              }}
            >
              {item.label}
            </a>
          ))}
        </div>
        <Link
          href="/app"
          style={{
            padding: "9px 18px",
            background: "var(--fg-0)",
            color: "var(--bg-1)",
            borderRadius: 4,
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
            letterSpacing: 0.1,
          }}
        >
          Open Control Center →
        </Link>
      </div>
    </nav>
  );
}

function Wordmark() {
  return (
    <Link href="/" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "inherit" }}>
      <svg width="18" height="18" viewBox="0 0 18 18">
        <circle cx="9" cy="9" r="7.5" fill="none" stroke="var(--accent)" strokeWidth="1.3" />
        <line x1="9" y1="0.5" x2="9" y2="17.5" stroke="var(--accent)" strokeWidth="1.3" />
        <circle cx="9" cy="9" r="2" fill="var(--accent)" />
      </svg>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: 0.2, color: "var(--fg-0)" }}>MERIDIAN</span>
        <span style={{ fontSize: 11, color: "var(--fg-3)", letterSpacing: 0.14 }}>BY METIS ANALYTICS</span>
      </div>
    </Link>
  );
}

const HERO_IMAGE_URL =
  "https://res.cloudinary.com/ddqz7fp5i/image/upload/v1778985683/Park-University-What-is-Cybersecurity-Blog-Banner-min_bmaivy.avif";

function Hero({
  counters,
}: {
  counters: { artifacts_total: number; investigations_total: number };
}) {
  return (
    <header
      style={{
        padding: "104px 32px 88px",
        borderBottom: "1px solid var(--bd-1)",
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#070b12",
        color: "#f0f3f8",
      }}
    >
      {/* Cybersecurity banner image */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url("${HERO_IMAGE_URL}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          pointerEvents: "none",
        }}
      />
      {/* Dark gradient overlay — keeps text legible, fades to page bg at bottom */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(7,11,18,0.78) 0%, rgba(7,11,18,0.65) 35%, rgba(7,11,18,0.85) 80%, var(--bg-0) 100%)",
          pointerEvents: "none",
        }}
      />
      {/* Subtle grid texture on top — visual depth */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
          maskImage: "radial-gradient(ellipse at 70% 35%, rgba(0,0,0,0.5), transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse at 70% 35%, rgba(0,0,0,0.5), transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div style={{ maxWidth: 1200, margin: "0 auto", position: "relative" }}>
        <div
          className="overline-accent"
          style={{ marginBottom: 28, color: "var(--accent)" }}
        >
          Context-aware incident intelligence
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: 68,
            lineHeight: 1.02,
            fontWeight: 600,
            letterSpacing: -2.2,
            maxWidth: 960,
            color: "#ffffff",
          }}
        >
          From detection to
          <br />
          full investigation.{" "}
          <span style={{ position: "relative", display: "inline-block" }}>
            Seconds.
            <span
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: -4,
                height: 3,
                background: "var(--accent)",
              }}
            />
          </span>
        </h1>
        <p
          style={{
            margin: "32px 0 0",
            maxWidth: 700,
            fontSize: 18,
            lineHeight: 1.55,
            color: "rgba(240, 243, 248, 0.82)",
          }}
        >
          Meridian is a reasoning agent for the SOC. It ingests detections from{" "}
          <strong style={{ color: "#ffffff", fontWeight: 600 }}>Splunk, Sentinel, or CrowdStrike</strong>
          , reconstructs the causal chain, maps blast radius, and ranks response actions — all
          cited to source events. No hallucinations. No hand-waving. Every claim is traceable.
        </p>

        <div style={{ display: "flex", gap: 12, marginTop: 40, alignItems: "center" }}>
          <Link
            href="/app"
            style={{
              padding: "14px 22px",
              background: "var(--accent)",
              color: "var(--accent-text)",
              borderRadius: 4,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              letterSpacing: 0.1,
            }}
          >
            Open the Control Center →
          </Link>
          <a
            href="https://github.com/metisos"
            style={{
              padding: "13px 22px",
              background: "transparent",
              color: "#ffffff",
              border: "1px solid rgba(255, 255, 255, 0.35)",
              borderRadius: 4,
              fontSize: 14,
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            View on GitHub
          </a>
        </div>

        <div
          style={{
            marginTop: 56,
            paddingTop: 28,
            borderTop: "1px solid rgba(255, 255, 255, 0.12)",
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 32,
            maxWidth: 920,
          }}
        >
          <Metric value={counters.artifacts_total.toLocaleString()} label="Events ingested" onDark />
          <Metric value={counters.investigations_total.toLocaleString()} label="Investigations in memory" onDark />
          <Metric value="768d" label="Embedding · nomic v1.5" onDark />
          <Metric value="Apache 2.0" label="Open source · github.com/metisos" onDark />
        </div>
      </div>
    </header>
  );
}

function Metric({ value, label, onDark }: { value: string; label: string; onDark?: boolean }) {
  return (
    <div>
      <div
        className="mono"
        style={{
          fontSize: 30,
          fontWeight: 600,
          letterSpacing: -0.5,
          lineHeight: 1,
          color: onDark ? "#ffffff" : "var(--fg-0)",
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 12,
          color: onDark ? "rgba(240, 243, 248, 0.6)" : "var(--fg-2)",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function Architecture() {
  const layers = [
    {
      tag: "State",
      title: "ContextSync Protocol + USC",
      body:
        "Every event becomes a versioned, content-addressed ctx:// artifact stamped with a seven-field spatiotemporal coordinate. Immutable provenance log, default-deny permissions.",
    },
    {
      tag: "Compute",
      title: "Gemini 3 reasoning agent",
      body:
        "Causal chain inference uses the USC cross-tier match formula. Blast radius traverses the entity graph. Memory is queried via Atlas Vector Search ($vectorSearch on 768-d cosine).",
    },
    {
      tag: "Surface",
      title: "Meridian Control Center",
      body:
        "Real-time incident feed where every claim is bound to a ctx:// URI. Built on Next.js 16, Server Components, MongoDB Change Streams for live updates.",
    },
  ];
  return (
    <section id="architecture" style={{ padding: "112px 32px", borderBottom: "1px solid var(--bd-1)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div className="overline-accent" style={{ marginBottom: 16 }}>Architecture</div>
        <h2 style={{ margin: 0, fontSize: 42, fontWeight: 600, letterSpacing: -1.2, lineHeight: 1.05, maxWidth: 720 }}>
          State and compute, decoupled.
        </h2>
        <p style={{ margin: "20px 0 0", maxWidth: 680, fontSize: 16, lineHeight: 1.55, color: "var(--fg-1)" }}>
          The protocol layer holds the truth of what the organization knows. The compute layer
          reasons over it. The surface layer presents it. Each can evolve without the others.
        </p>
        <div
          style={{
            marginTop: 56,
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 1,
            background: "var(--bd-1)",
            border: "1px solid var(--bd-1)",
            borderRadius: 6,
          }}
        >
          {layers.map((l, i) => (
            <article key={l.tag} style={{ background: "var(--bg-1)", padding: "32px 28px" }}>
              <div
                className="mono"
                style={{
                  fontSize: 11,
                  color: "var(--fg-3)",
                  marginBottom: 6,
                  letterSpacing: 0.16,
                }}
              >
                0{i + 1} · {l.tag.toUpperCase()}
              </div>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: -0.4, color: "var(--fg-0)" }}>
                {l.title}
              </h3>
              <p style={{ margin: "12px 0 0", fontSize: 13.5, lineHeight: 1.55, color: "var(--fg-1)" }}>{l.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Numbers({
  counters,
}: {
  counters: { artifacts_total: number; investigations_total: number; events_last_24h: number };
}) {
  return (
    <section id="numbers" style={{ padding: "112px 32px", background: "var(--bg-2)", borderBottom: "1px solid var(--bd-1)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div className="overline-accent" style={{ marginBottom: 16 }}>Live numbers</div>
        <h2 style={{ margin: 0, fontSize: 42, fontWeight: 600, letterSpacing: -1.2, lineHeight: 1.05, maxWidth: 720 }}>
          Pulled from the running pipeline.
        </h2>
        <p style={{ margin: "20px 0 0", maxWidth: 680, fontSize: 16, lineHeight: 1.55, color: "var(--fg-1)" }}>
          Every number on this page reads from the same MongoDB cluster the Control Center reads
          from. There are no placeholders.
        </p>
        <div
          style={{
            marginTop: 56,
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 1,
            background: "var(--bd-1)",
            border: "1px solid var(--bd-1)",
            borderRadius: 6,
          }}
        >
          <NumberCell value={counters.artifacts_total.toLocaleString()} label="ContextSync artifacts in MongoDB" />
          <NumberCell value={counters.investigations_total.toLocaleString()} label="Investigations in agent memory" />
          <NumberCell value={counters.events_last_24h.toLocaleString()} label="Writes logged in the last 24 hours" />
          <NumberCell value="5 / 5" label="Incident archetypes generated" />
        </div>
      </div>
    </section>
  );
}

function NumberCell({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ background: "var(--bg-1)", padding: "32px 28px" }}>
      <div
        className="mono"
        style={{
          fontSize: 40,
          fontWeight: 600,
          letterSpacing: -1,
          lineHeight: 1,
          color: "var(--fg-0)",
        }}
      >
        {value}
      </div>
      <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--fg-1)", lineHeight: 1.45 }}>{label}</div>
    </div>
  );
}

function Footer() {
  return (
    <footer style={{ padding: "48px 32px 36px" }}>
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          gap: 16,
          fontSize: 12,
          color: "var(--fg-2)",
          flexWrap: "wrap",
        }}
        className="mono"
      >
        <span>© 2026 METIS ANALYTICS</span>
        <span>·</span>
        <span>SAINT LOUIS, MISSOURI</span>
        <span>·</span>
        <a href="https://metisos.co" style={{ color: "inherit" }}>metisos.co</a>
        <span>·</span>
        <a href="https://github.com/metisos" style={{ color: "inherit" }}>github.com/metisos</a>
        <span style={{ flex: 1 }} />
        <span>USC · 38.6270° N · −90.1994° W</span>
      </div>
    </footer>
  );
}
