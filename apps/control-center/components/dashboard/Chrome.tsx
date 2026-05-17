"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useTheme } from "./ThemeProvider";
import { LiveDot } from "./atoms";

const TABS: { href: string; label: string }[] = [
  { href: "/app/overview", label: "Overview" },
  { href: "/app/ask", label: "Meridian Agent" },
  { href: "/app/incidents", label: "Incidents" },
  { href: "/app/risk-map", label: "Risk Map" },
  { href: "/app/casebook", label: "Casebook" },
  { href: "/app/sources", label: "Sources" },
];

const iconBtn: React.CSSProperties = {
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
};

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      onClick={() => setTheme(next)}
      style={iconBtn}
      title={`Switch to ${next} theme`}
      aria-label={`Switch to ${next} theme`}
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

export interface Workspace {
  id: string;
  name: string;
}

export function Chrome({
  children,
  workspace,
}: {
  children: ReactNode;
  workspace?: Workspace;
}) {
  const pathname = usePathname();
  return (
    <div
      style={{
        height: "100dvh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-0)",
        color: "var(--fg-0)",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          flexShrink: 0,
          background: "var(--bg-1)",
          borderBottom: "1px solid var(--bd-1)",
        }}
      >
        <div
          style={{
            height: 56,
            display: "flex",
            alignItems: "center",
            gap: 24,
            padding: "0 28px",
          }}
        >
          {/* Wordmark */}
          <Link
            href="/"
            style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16">
              <circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--accent)" strokeWidth="1.3" />
              <line x1="8" y1="0.5" x2="8" y2="15.5" stroke="var(--accent)" strokeWidth="1.3" />
              <line x1="0.5" y1="8" x2="15.5" y2="8" stroke="var(--accent)" strokeWidth="0.8" opacity="0.5" />
              <circle cx="8" cy="8" r="1.6" fill="var(--accent)" />
            </svg>
            <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: 0.2, color: "var(--fg-0)" }}>MERIDIAN</span>
          </Link>

          {/* Workspace breadcrumb */}
          {workspace && (
            <>
              <span style={{ color: "var(--fg-4)", fontSize: 14 }}>/</span>
              <Link
                href="/app"
                title="Back to console lobby"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "4px 10px 4px 8px",
                  background: "var(--bg-2)",
                  border: "1px solid var(--bd-1)",
                  borderRadius: 4,
                  fontSize: 12,
                  color: "var(--fg-1)",
                  textDecoration: "none",
                  fontWeight: 500,
                }}
              >
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
                  <path d="M6.5 2.5L3 5.5L6.5 8.5" />
                </svg>
                {workspace.name}
              </Link>
            </>
          )}

          <div style={{ flex: 1 }} />

          {/* Pipeline status + actions */}
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
              background: "linear-gradient(135deg, #2a313b 0%, #161a20 100%)",
              border: "1px solid var(--bd-2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--accent-2)",
              letterSpacing: 0.4,
            }}
          >
            CJ
          </div>
        </div>

        {/* Tabs */}
        <nav style={{ padding: "0 28px", display: "flex", gap: 0, alignItems: "flex-end" }}>
          {TABS.map((tab) => {
            const active = pathname === tab.href || pathname?.startsWith(tab.href + "/");
            return (
              <Link
                key={tab.href}
                href={tab.href}
                style={{
                  padding: "11px 18px 13px",
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  letterSpacing: 0.1,
                  color: active ? "var(--fg-0)" : "var(--fg-2)",
                  textDecoration: "none",
                  borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`,
                  marginBottom: -1,
                }}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex" }}>
        {children}
      </main>
    </div>
  );
}
