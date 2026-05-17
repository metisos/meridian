"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Investigation } from "@/lib/types";
import { computeConfidenceBreakdown, type ConfidenceBreakdown } from "@/lib/confidence";
import { Pill } from "./atoms";

/* Confidence pill that opens a popover with the per-component breakdown.
   Click to toggle. Portal-rendered to escape overflow:hidden ancestors. */
export function ConfidencePill({ inv }: { inv: Investigation }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; flip: boolean } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const compute = () => {
      const el = btnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const flip = r.top < 320;
      setPos({
        top: flip ? r.bottom + 8 : r.top - 8,
        left: r.right - 20,
        flip,
      });
    };
    compute();
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const breakdown = computeConfidenceBreakdown(inv);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-label="Show confidence breakdown"
        aria-expanded={open}
        title="Click for breakdown"
        style={{
          padding: 0,
          background: "transparent",
          border: "none",
          cursor: "pointer",
        }}
      >
        <Pill color="accent" mono>
          {Math.round(inv.confidence * 100)}% confidence
        </Pill>
      </button>
      {mounted && open && pos
        ? createPortal(
            <BreakdownPopover ref={popRef} breakdown={breakdown} pos={pos} />,
            document.body,
          )
        : null}
    </>
  );
}

const BreakdownPopover = function BreakdownPopoverInner({
  ref,
  breakdown,
  pos,
}: {
  ref: React.RefObject<HTMLDivElement | null>;
  breakdown: ConfidenceBreakdown;
  pos: { top: number; left: number; flip: boolean };
}) {
  return (
    <div
      ref={ref}
      role="tooltip"
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        transform: pos.flip ? "translateX(-100%)" : "translate(-100%, -100%)",
        zIndex: 9999,
        width: 360,
        padding: "14px 16px",
        background: "var(--bg-1)",
        border: "1px solid var(--bd-2)",
        borderRadius: 6,
        boxShadow: "var(--shadow-2)",
        fontSize: 12,
        color: "var(--fg-1)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--accent)", letterSpacing: 0.3, textTransform: "uppercase" }}>
          Confidence breakdown
        </span>
        <span style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 16, fontWeight: 600, color: "var(--accent)" }}>
          {Math.round(breakdown.stored * 100)}%
        </span>
      </div>
      <div style={{ fontSize: 11, color: "var(--fg-3)", marginBottom: 14, lineHeight: 1.45 }}>
        How the agent arrived at this number.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {breakdown.components.map((c) => (
          <ComponentRow key={c.key} component={c} />
        ))}
      </div>

      <div
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: "1px solid var(--bd-1)",
          fontSize: 11,
          color: "var(--fg-2)",
          lineHeight: 1.5,
        }}
      >
        <div style={{ marginBottom: 4 }}>
          <span className="mono" style={{ color: "var(--fg-1)" }}>
            estimate = {breakdown.formula}
          </span>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <span>
            estimate{" "}
            <span className="mono" style={{ color: "var(--fg-0)", fontWeight: 600 }}>
              {Math.round(breakdown.estimated * 100)}%
            </span>
          </span>
          <span>·</span>
          <span>
            stored{" "}
            <span className="mono" style={{ color: "var(--fg-0)", fontWeight: 600 }}>
              {Math.round(breakdown.stored * 100)}%
            </span>
          </span>
          {Math.abs(breakdown.estimated - breakdown.stored) > 0.05 && (
            <>
              <span>·</span>
              <span style={{ color: "var(--warn)" }}>
                Δ {Math.round(Math.abs(breakdown.estimated - breakdown.stored) * 100)}%
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

function ComponentRow({
  component,
}: {
  component: ConfidenceBreakdown["components"][number];
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
        <span style={{ fontSize: 12, color: "var(--fg-0)", fontWeight: 500, flex: 1 }}>
          {component.label}
        </span>
        <span
          className="mono"
          style={{ fontSize: 10.5, color: "var(--fg-3)" }}
          title={`weight ${component.weight.toFixed(2)}`}
        >
          ×{component.weight.toFixed(2)}
        </span>
        <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-0)", width: 40, textAlign: "right" }}>
          {Math.round(component.value * 100)}%
        </span>
      </div>
      <div
        style={{
          height: 5,
          background: "var(--bg-3)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.round(component.value * 100)}%`,
            height: "100%",
            background: "var(--accent)",
            transition: "width 200ms ease",
          }}
        />
      </div>
      <div style={{ fontSize: 10.5, color: "var(--fg-3)", marginTop: 4 }}>{component.note}</div>
    </div>
  );
}
