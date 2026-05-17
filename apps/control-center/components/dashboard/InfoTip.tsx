"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface InfoTipProps {
  term: string;
  children: ReactNode;
  width?: number;
}

/* `?` icon that reveals a popover explanation. The popover renders via a
   React portal anchored to <body> with fixed coordinates, which lets it
   escape `overflow: hidden` ancestors (Panel, Chrome main, scroll containers).
   Click-to-toggle. Clicks outside or ESC close it. Auto-flips below when
   there isn't enough room above. */
export function InfoTip({ term, children, width = 300 }: InfoTipProps) {
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
      const flip = r.top < 220; // not enough room above → place below
      setPos({
        top: flip ? r.bottom + 8 : r.top - 8,
        left: r.left + r.width / 2,
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

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={`What is ${term}?`}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        style={{
          width: 14,
          height: 14,
          padding: 0,
          border: `1px solid ${open ? "var(--accent-bd)" : "var(--bd-2)"}`,
          background: open ? "var(--accent-soft)" : "transparent",
          color: open ? "var(--accent)" : "var(--fg-3)",
          borderRadius: 7,
          fontSize: 9,
          fontWeight: 700,
          fontFamily: "inherit",
          lineHeight: 1,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          marginLeft: 5,
          marginRight: 1,
          verticalAlign: "middle",
          transition: "background 120ms, color 120ms, border-color 120ms",
        }}
      >
        ?
      </button>
      {mounted && open && pos
        ? createPortal(
            <div
              ref={popRef}
              role="tooltip"
              style={{
                position: "fixed",
                top: pos.top,
                left: pos.left,
                transform: pos.flip ? "translateX(-50%)" : "translate(-50%, -100%)",
                zIndex: 9999,
                width,
                padding: "12px 14px",
                background: "var(--bg-1)",
                border: "1px solid var(--bd-2)",
                borderRadius: 6,
                boxShadow: "var(--shadow-2)",
                fontSize: 11.5,
                lineHeight: 1.55,
                color: "var(--fg-1)",
                whiteSpace: "normal",
                textAlign: "left",
                fontWeight: 400,
                textTransform: "none",
                letterSpacing: 0,
                pointerEvents: "auto",
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  color: "var(--fg-0)",
                  fontWeight: 600,
                  marginBottom: 6,
                  fontSize: 12,
                  letterSpacing: 0.1,
                }}
              >
                {term}
              </div>
              <div style={{ color: "var(--fg-1)" }}>{children}</div>
              {/* small arrow pointing at the trigger */}
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  left: "50%",
                  transform: "translateX(-50%) rotate(45deg)",
                  width: 8,
                  height: 8,
                  background: "var(--bg-1)",
                  border: "1px solid var(--bd-2)",
                  ...(pos.flip
                    ? { top: -5, borderRight: "none", borderBottom: "none" }
                    : { bottom: -5, borderLeft: "none", borderTop: "none" }),
                }}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
