"use client";
import type { CSSProperties, ReactNode } from "react";

export function Pill({
  children,
  color = "muted",
  mono = false,
}: {
  children: ReactNode;
  color?: "muted" | "accent" | "info" | "ok" | "crit";
  mono?: boolean;
}) {
  const map = {
    muted: { fg: "var(--fg-2)", bg: "transparent", bd: "var(--bd-2)" },
    accent: { fg: "var(--accent-2)", bg: "var(--accent-soft)", bd: "var(--accent-bd)" },
    info: { fg: "var(--info)", bg: "var(--info-soft)", bd: "var(--info)" },
    ok: { fg: "var(--ok)", bg: "var(--ok-soft)", bd: "var(--ok)" },
    crit: { fg: "var(--crit)", bg: "var(--crit-soft)", bd: "var(--crit)" },
  };
  const c = map[color];
  return (
    <span
      className={mono ? "mono" : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "2px 8px",
        borderRadius: 3,
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: 0.3,
        color: c.fg,
        background: c.bg,
        border: `1px solid ${color === "muted" ? c.bd : c.bd + "44"}`,
      }}
    >
      {children}
    </span>
  );
}

export function Dot({ color }: { color: "ok" | "warn" | "crit" | "info" | "muted" }) {
  const map = {
    ok: "var(--ok)",
    warn: "var(--accent)",
    crit: "var(--crit)",
    info: "var(--info)",
    muted: "var(--fg-3)",
  };
  return (
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: 4,
        background: map[color],
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}

export function LiveDot({ color = "var(--accent-2)" }: { color?: string }) {
  return (
    <span
      className="live-dot"
      style={{
        width: 6,
        height: 6,
        borderRadius: 3,
        background: color,
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}

export function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <div className="overline">{label}</div>
      <div className="mono" style={{ fontSize: 22, fontWeight: 600, color: "var(--fg-0)", lineHeight: 1, letterSpacing: -0.5 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11.5, color: "var(--fg-2)", lineHeight: 1.3 }}>{sub}</div>
      )}
    </div>
  );
}

export function Panel({
  title,
  extra,
  children,
  style,
}: {
  title?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <section
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--bd-1)",
        borderRadius: 6,
        overflow: "hidden",
        ...style,
      }}
    >
      {(title || extra) && (
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--bd-1)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          {title && <div className="overline" style={{ flex: 1 }}>{title}</div>}
          {extra}
        </div>
      )}
      <div>{children}</div>
    </section>
  );
}
