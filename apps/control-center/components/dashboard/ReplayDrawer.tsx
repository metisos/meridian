"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Investigation } from "@/lib/types";

interface Step {
  number: number;
  label: string;
  detail?: string;
  duration_ms?: number;
  status: "pending" | "running" | "ok";
}

interface Meta {
  total_steps: number;
  estimated_ms: number;
}

function parseSSE(buffer: string): { events: Array<{ event: string; data: string }>; rest: string } {
  const events: Array<{ event: string; data: string }> = [];
  let rest = buffer;
  let idx;
  while ((idx = rest.indexOf("\n\n")) !== -1) {
    const raw = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    let event = "message";
    const dataLines: string[] = [];
    for (const line of raw.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    events.push({ event, data: dataLines.join("\n") });
  }
  return { events, rest };
}

export function ReplayDrawer({
  inv,
  open,
  onClose,
}: {
  inv: Investigation;
  open: boolean;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [done, setDone] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startedAtRef = useRef<number>(0);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    void runReplay();
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, inv.investigation_uri]);

  // tick elapsed
  useEffect(() => {
    if (!open || done) return;
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 50);
    return () => clearInterval(interval);
  }, [open, done]);

  // ESC to close (only after done — don't kill mid-replay accidentally)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && done) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, done, onClose]);

  const runReplay = async () => {
    setSteps([]);
    setMeta(null);
    setDone(false);
    setElapsedMs(0);
    setError(null);
    startedAtRef.current = Date.now();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch(`/api/replay/${encodeURIComponent(inv.investigation_uri)}`, {
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buf += decoder.decode(value, { stream: true });
        const { events, rest } = parseSSE(buf);
        buf = rest;
        for (const ev of events) {
          let payload: Record<string, unknown> = {};
          try {
            payload = JSON.parse(ev.data);
          } catch {
            continue;
          }
          if (ev.event === "meta") {
            setMeta({
              total_steps: payload.total_steps as number,
              estimated_ms: payload.estimated_ms as number,
            });
          } else if (ev.event === "step-start") {
            setSteps((prev) => [
              ...prev,
              {
                number: payload.number as number,
                label: payload.label as string,
                status: "running",
              },
            ]);
          } else if (ev.event === "step-end") {
            setSteps((prev) =>
              prev.map((s) =>
                s.number === payload.number
                  ? {
                      ...s,
                      status: "ok",
                      detail: payload.detail as string,
                      duration_ms: payload.duration_ms as number,
                    }
                  : s,
              ),
            );
          } else if (ev.event === "done") {
            setDone(true);
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : String(e));
      setDone(true);
    }
  };

  if (!open || !mounted) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(7, 11, 18, 0.78)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        zIndex: 9998,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
      onClick={done ? onClose : undefined}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 880,
          maxHeight: "92vh",
          background: "var(--bg-1)",
          border: "1px solid var(--bd-2)",
          borderRadius: 8,
          boxShadow: "var(--shadow-2)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <ReplayHeader
          inv={inv}
          done={done}
          steps={steps}
          meta={meta}
          elapsedMs={elapsedMs}
          onClose={onClose}
          onReplay={runReplay}
        />
        {error && (
          <div
            style={{
              padding: "10px 18px",
              background: "var(--crit-soft)",
              color: "var(--crit)",
              fontSize: 12,
              borderBottom: "1px solid var(--bd-1)",
            }}
          >
            Replay failed: {error}
          </div>
        )}
        <div className="scroll" style={{ flex: 1, overflowY: "auto", padding: "8px 18px 24px" }}>
          <StepsList steps={steps} totalSteps={meta?.total_steps ?? 7} />
        </div>
        <ReplayFooter done={done} elapsedMs={elapsedMs} stepsDone={steps.filter((s) => s.status === "ok").length} totalSteps={meta?.total_steps ?? 7} />
      </div>
    </div>,
    document.body,
  );
}

function ReplayHeader({
  inv,
  done,
  steps,
  meta,
  elapsedMs,
  onClose,
  onReplay,
}: {
  inv: Investigation;
  done: boolean;
  steps: Step[];
  meta: Meta | null;
  elapsedMs: number;
  onClose: () => void;
  onReplay: () => void;
}) {
  return (
    <header
      style={{
        padding: "18px 22px 14px",
        borderBottom: "1px solid var(--bd-1)",
        background: "var(--bg-2)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <span
          className="overline-accent"
          style={{ fontSize: 10.5, letterSpacing: 0.4 }}
        >
          Agent loop · replay
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "2px 9px",
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            color: done ? "var(--ok)" : "var(--accent)",
            background: done ? "var(--ok-soft)" : "var(--accent-soft)",
            border: `1px solid ${done ? "var(--ok)" : "var(--accent-bd)"}55`,
            borderRadius: 3,
          }}
        >
          <span
            className={done ? undefined : "live-dot"}
            style={{
              width: 6,
              height: 6,
              borderRadius: 4,
              background: done ? "var(--ok)" : "var(--accent)",
            }}
          />
          {done ? "Complete" : "Running"}
        </span>
        <span style={{ flex: 1 }} />
        <button
          onClick={onClose}
          aria-label="Close replay"
          title={done ? "Close (Esc)" : "Hide — replay finishes in background"}
          style={{
            width: 28,
            height: 28,
            border: "1px solid var(--bd-2)",
            borderRadius: 4,
            background: "transparent",
            color: "var(--fg-2)",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
          }}
        >
          ✕
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h2
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 600,
            color: "var(--fg-0)",
            letterSpacing: -0.2,
            lineHeight: 1.3,
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {inv.root_cause_hypothesis.split(/(?<=[.!?])\s+/)[0]}
        </h2>
        {done && (
          <button
            onClick={onReplay}
            style={{
              padding: "6px 12px",
              background: "transparent",
              color: "var(--accent)",
              border: "1px solid var(--accent-bd)",
              borderRadius: 3,
              fontSize: 11.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            ↻ Replay again
          </button>
        )}
      </div>
      <div className="mono" style={{ marginTop: 6, fontSize: 11, color: "var(--fg-3)" }}>
        {inv.investigation_uri}
      </div>
      <ProgressBar
        progress={steps.filter((s) => s.status === "ok").length / (meta?.total_steps ?? 7)}
        elapsedMs={elapsedMs}
        done={done}
      />
    </header>
  );
}

function ProgressBar({
  progress,
  elapsedMs,
  done,
}: {
  progress: number;
  elapsedMs: number;
  done: boolean;
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          height: 4,
          background: "var(--bg-3)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.min(100, Math.round(progress * 100))}%`,
            height: "100%",
            background: done ? "var(--ok)" : "var(--accent)",
            transition: "width 300ms ease",
          }}
        />
      </div>
      <div
        className="mono"
        style={{
          marginTop: 5,
          fontSize: 10.5,
          color: "var(--fg-3)",
          display: "flex",
          gap: 12,
        }}
      >
        <span>{(elapsedMs / 1000).toFixed(1)}s elapsed</span>
        <span style={{ flex: 1 }} />
        <span>{Math.round(progress * 100)}%</span>
      </div>
    </div>
  );
}

function StepsList({ steps, totalSteps }: { steps: Step[]; totalSteps: number }) {
  // Reserve slots for steps we haven't seen yet
  const placeholders: Step[] = [];
  for (let i = steps.length + 1; i <= totalSteps; i++) {
    placeholders.push({ number: i, label: "", status: "pending" });
  }
  return (
    <ol
      style={{
        margin: 0,
        padding: 0,
        listStyle: "none",
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      {steps.map((s) => (
        <StepRow key={s.number} step={s} />
      ))}
      {placeholders.map((s) => (
        <StepRow key={`p-${s.number}`} step={s} />
      ))}
    </ol>
  );
}

function StepRow({ step }: { step: Step }) {
  const isPending = step.status === "pending";
  const isRunning = step.status === "running";
  const isOk = step.status === "ok";
  return (
    <li
      style={{
        display: "grid",
        gridTemplateColumns: "44px 24px 1fr auto",
        gap: 14,
        padding: "12px 8px",
        alignItems: "start",
        opacity: isPending ? 0.42 : 1,
        transition: "opacity 200ms ease",
      }}
    >
      <span
        className="mono"
        style={{
          fontSize: 11,
          color: "var(--fg-3)",
          paddingTop: 2,
        }}
      >
        0{step.number}
      </span>
      <StatusIcon step={step} />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: isOk || isRunning ? 600 : 500,
            color: isPending ? "var(--fg-3)" : "var(--fg-0)",
            lineHeight: 1.35,
          }}
        >
          {step.label || stepLabelFor(step.number)}
        </div>
        {step.detail && (
          <div
            className="mono"
            style={{
              marginTop: 4,
              fontSize: 11,
              color: "var(--fg-2)",
              lineHeight: 1.45,
            }}
          >
            {step.detail}
          </div>
        )}
        {isRunning && !step.detail && (
          <div
            style={{
              marginTop: 4,
              fontSize: 11,
              color: "var(--fg-3)",
              fontStyle: "italic",
            }}
          >
            running…
          </div>
        )}
      </div>
      <span
        className="mono"
        style={{
          alignSelf: "start",
          paddingTop: 2,
          fontSize: 11,
          color: isOk ? "var(--accent)" : "var(--fg-3)",
          whiteSpace: "nowrap",
        }}
      >
        {step.duration_ms != null ? `${step.duration_ms.toLocaleString()}ms` : ""}
      </span>
    </li>
  );
}

function stepLabelFor(n: number): string {
  return [
    "",
    "Fetch trigger",
    "Recall similar investigations",
    "Reconstruct causal chain",
    "Compute blast radius",
    "Generate root-cause hypothesis",
    "Rank response actions",
    "Persist to agent memory",
  ][n] ?? `Step ${n}`;
}

function StatusIcon({ step }: { step: Step }) {
  if (step.status === "ok") {
    return (
      <span
        aria-hidden
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          background: "var(--accent-soft)",
          border: "1px solid var(--accent)",
          color: "var(--accent)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          fontWeight: 700,
          marginTop: 1,
        }}
      >
        ✓
      </span>
    );
  }
  if (step.status === "running") {
    return (
      <span
        aria-hidden
        className="live-dot"
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          border: "2px solid var(--accent)",
          borderTopColor: "transparent",
          animation: "live-rotate 0.9s linear infinite",
          marginTop: 1,
        }}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{
        width: 18,
        height: 18,
        borderRadius: 9,
        border: "1px dashed var(--bd-3)",
        marginTop: 1,
      }}
    />
  );
}

function ReplayFooter({
  done,
  elapsedMs,
  stepsDone,
  totalSteps,
}: {
  done: boolean;
  elapsedMs: number;
  stepsDone: number;
  totalSteps: number;
}) {
  return (
    <footer
      style={{
        padding: "12px 22px",
        borderTop: "1px solid var(--bd-1)",
        background: "var(--bg-2)",
        display: "flex",
        alignItems: "center",
        gap: 14,
        fontSize: 11.5,
        color: "var(--fg-2)",
      }}
    >
      <span>
        {stepsDone} / {totalSteps} steps
      </span>
      <span>·</span>
      <span className="mono">{(elapsedMs / 1000).toFixed(1)}s</span>
      <span style={{ flex: 1 }} />
      <span className="mono" style={{ color: "var(--fg-3)" }}>
        {done ? "click outside or press Esc to close" : "replay running"}
      </span>
    </footer>
  );
}
