"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Markdown } from "./Markdown";

interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  /** base64-encoded content, no data: prefix */
  data_base64: string;
  /** local object URL for image previews; revoked on cleanup */
  preview_url?: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  cited?: string[];
  attachments?: Attachment[];
  /** Set when this assistant turn was routed to the canvas. Chat just shows a pointer. */
  canvasPointer?: boolean;
  done?: boolean;
}

interface ReportDoc {
  id: string;
  title: string;
  body: string;
  generatedAt: string;
  done: boolean;
  cited: string[];
}

const SUGGESTIONS: string[] = [
  "Summarize today's incidents for the exec team",
  "Highest-confidence open investigation right now?",
  "Draft a full incident report on the latest database outage",
  "Which incidents touched compliance assets this week?",
  "Write a weekly executive brief on every active investigation",
  "Walk me through the causal chain on the most recent incident",
];

function makeId() {
  return Math.random().toString(36).slice(2, 11);
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

function deriveReportTitle(markdown: string, fallback: string): string {
  const m = markdown.match(/^#\s+(.+)$/m);
  if (m && m[1]) return m[1].slice(0, 100);
  return fallback;
}

/* Detection: does the accumulated text indicate a canvas-bound document?
   The agent leads canvas documents with a single H1 on the first line. */
function isCanvasResponse(text: string): boolean {
  return /^\s*#\s+\S/.test(text);
}

/* We need at least this many characters before we commit to a routing decision —
   gives the model a chance to emit "# " on the first chunk. */
const ROUTING_THRESHOLD = 6;

export function Chat() {
  const params = useSearchParams();
  const initialQ = params.get("q") ?? "";

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(initialQ);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReportDoc | null>(null);
  const [rightTab, setRightTab] = useState<"sources" | "canvas">("sources");
  const [railWidth, setRailWidth] = useState(360);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  /* Drag-to-resize the right rail. The splitter sits on the rail's left edge;
     dragging left widens the rail, dragging right narrows it. Clamped to a
     readable range. */
  const RAIL_MIN = 280;
  const RAIL_MAX = 800;
  const startRailResize = (e: React.MouseEvent) => {
    e.preventDefault();
    if (railCollapsed) setRailCollapsed(false);
    const startX = e.clientX;
    const startW = railCollapsed ? 360 : railWidth;
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (mv: MouseEvent) => {
      const delta = mv.clientX - startX;
      const next = Math.max(RAIL_MIN, Math.min(RAIL_MAX, startW - delta));
      setRailWidth(next);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  /* Read a File into a base64 string (no data: prefix). */
  const readBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const r = reader.result;
        if (typeof r !== "string") return reject(new Error("read failed"));
        const idx = r.indexOf(",");
        resolve(idx >= 0 ? r.slice(idx + 1) : r);
      };
      reader.onerror = () => reject(reader.error ?? new Error("read failed"));
      reader.readAsDataURL(file);
    });

  const handleAttach = async (files: FileList) => {
    const incoming = Array.from(files);
    const room = 4 - pendingAttachments.length;
    if (room <= 0) return;
    const accepted: Attachment[] = [];
    for (const file of incoming.slice(0, room)) {
      if (file.size > 10 * 1024 * 1024) {
        setError(`${file.name} exceeds 10MB`);
        continue;
      }
      try {
        const b64 = await readBase64(file);
        const isImage = file.type.startsWith("image/");
        accepted.push({
          id: Math.random().toString(36).slice(2, 11),
          name: file.name,
          mime: file.type || "application/octet-stream",
          size: file.size,
          data_base64: b64,
          preview_url: isImage ? URL.createObjectURL(file) : undefined,
        });
      } catch (e) {
        setError(`Could not read ${file.name}: ${(e as Error).message}`);
      }
    }
    if (accepted.length > 0) {
      setPendingAttachments((prev) => [...prev, ...accepted]);
      setError(null);
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setPendingAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.preview_url) URL.revokeObjectURL(target.preview_url);
      return prev.filter((a) => a.id !== id);
    });
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if ((!trimmed && pendingAttachments.length === 0) || pending) return;
    setError(null);

    const attachmentsForTurn = pendingAttachments;
    const userMsg: Message = {
      id: makeId(),
      role: "user",
      content: trimmed,
      attachments: attachmentsForTurn.length > 0 ? attachmentsForTurn : undefined,
    };
    const assistantMsg: Message = { id: makeId(), role: "assistant", content: "" };
    const next = [...messages, userMsg, assistantMsg];
    setMessages(next);
    setInput("");
    setPendingAttachments([]);
    setPending(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    /* Routing state for this single turn */
    let bound: "chat" | "canvas" | null = null;
    let reportId: string | null = null;
    let acc = "";
    let citedFromMeta: string[] = [];

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.filter((m) => m.role === "user" || m.content).map((m) => ({
            role: m.role,
            content: m.content,
            attachments:
              m.role === "user" && m.attachments
                ? m.attachments.map((a) => ({
                    name: a.name,
                    mime: a.mime,
                    data_base64: a.data_base64,
                  }))
                : undefined,
          })),
        }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = parseSSE(buffer);
        buffer = rest;

        for (const ev of events) {
          let payload: { text?: string; cited?: string[]; message?: string } = {};
          try {
            payload = JSON.parse(ev.data);
          } catch {
            continue;
          }

          if (ev.event === "meta" && payload.cited) {
            citedFromMeta = payload.cited;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMsg.id ? { ...m, cited: payload.cited } : m)),
            );
          } else if (ev.event === "chunk" && payload.text) {
            acc += payload.text;

            // Commit a routing decision once we have enough text
            if (bound === null && (acc.length >= ROUTING_THRESHOLD || acc.includes("\n"))) {
              if (isCanvasResponse(acc)) {
                bound = "canvas";
                reportId = makeId();
                setReport({
                  id: reportId,
                  title: deriveReportTitle(acc, "Drafting…"),
                  body: acc,
                  generatedAt: new Date().toISOString(),
                  done: false,
                  cited: citedFromMeta,
                });
                setRightTab("canvas");
                setRailCollapsed(false);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id ? { ...m, canvasPointer: true, content: "" } : m,
                  ),
                );
              } else {
                bound = "chat";
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: acc } : m)),
                );
              }
            } else if (bound === "canvas" && reportId) {
              const titleNow = deriveReportTitle(acc, "Drafting…");
              setReport((r) => (r && r.id === reportId ? { ...r, body: acc, title: titleNow } : r));
            } else if (bound === "chat") {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: acc } : m)),
              );
            }
          } else if (ev.event === "done") {
            // If we never committed (response was empty or tiny), commit as chat
            if (bound === null) {
              bound = "chat";
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: acc } : m)),
              );
            }
            const wordCount = acc.split(/\s+/).filter(Boolean).length;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsg.id
                  ? {
                      ...m,
                      done: true,
                      content:
                        bound === "canvas"
                          ? `_Document drafted in canvas · **${deriveReportTitle(acc, "Untitled")}** · ${wordCount.toLocaleString()} words_`
                          : m.content,
                    }
                  : m,
              ),
            );
            if (bound === "canvas" && reportId) {
              setReport((r) =>
                r && r.id === reportId
                  ? { ...r, done: true, title: deriveReportTitle(acc, "Untitled") }
                  : r,
              );
            }
          } else if (ev.event === "error") {
            throw new Error(payload.message ?? "stream error");
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id && !m.content && !m.canvasPointer
            ? { ...m, content: `_Couldn't reach the agent: ${msg}_`, done: true }
            : m,
        ),
      );
    } finally {
      setPending(false);
      abortRef.current = null;
    }
  };

  useEffect(() => {
    if (initialQ) void send(initialQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const empty = messages.length === 0;
  const lastCited = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m && m.role === "assistant" && m.cited?.length) return m.cited;
    }
    return null;
  }, [messages]);

  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
      <section
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          background: "var(--bg-0)",
        }}
      >
        <header
          style={{
            padding: "16px 28px",
            borderBottom: "1px solid var(--bd-1)",
            background: "var(--bg-1)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="overline-accent">Ask Meridian</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--fg-0)", marginTop: 2, letterSpacing: -0.1 }}>
              Conversation grounded in your investigation memory
            </div>
          </div>
          {(messages.length > 0 || report) && (
            <button
              onClick={() => {
                setMessages([]);
                setError(null);
                setReport(null);
                setRightTab("sources");
                inputRef.current?.focus();
              }}
              style={{
                padding: "7px 13px",
                background: "transparent",
                color: "var(--fg-2)",
                border: "1px solid var(--bd-2)",
                borderRadius: 4,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              New conversation
            </button>
          )}
        </header>

        <div
          ref={scrollRef}
          className="scroll"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "28px 32px 20px",
          }}
        >
          {empty ? (
            <EmptyState onPick={send} />
          ) : (
            <div style={{ maxWidth: 780, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
              {messages.map((m) => (
                <MessageView
                  key={m.id}
                  message={m}
                  pending={pending && !m.done && m.role === "assistant"}
                  onOpenCanvas={() => setRightTab("canvas")}
                />
              ))}
            </div>
          )}
        </div>

        <Composer
          ref={inputRef}
          value={input}
          onChange={setInput}
          onSend={() => send(input)}
          pending={pending}
          error={error}
          attachments={pendingAttachments}
          onAttach={handleAttach}
          onRemoveAttachment={handleRemoveAttachment}
        />
      </section>

      <RightRail
        tab={rightTab}
        onTabChange={setRightTab}
        sources={lastCited}
        report={report}
        width={railWidth}
        collapsed={railCollapsed}
        onToggleCollapse={() => setRailCollapsed((c) => !c)}
        onStartResize={startRailResize}
      />
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div style={{ maxWidth: 760, margin: "24px auto 0" }}>
      <div className="overline-accent" style={{ marginBottom: 12 }}>Start a conversation</div>
      <h2 style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: -0.5, lineHeight: 1.25, color: "var(--fg-0)" }}>
        What do you want to understand?
      </h2>
      <p style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.6, color: "var(--fg-1)", maxWidth: 600 }}>
        Ask conversationally for a quick answer, or ask for a full report — Meridian decides which
        form to use. Longer written deliverables stream into the canvas on the right.
      </p>

      <div style={{ marginTop: 28, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            style={{
              textAlign: "left",
              padding: "14px 16px",
              background: "var(--bg-1)",
              border: "1px solid var(--bd-1)",
              borderRadius: 5,
              color: "var(--fg-0)",
              fontSize: 13,
              lineHeight: 1.45,
              cursor: "pointer",
            }}
          >
            <span style={{ color: "var(--accent)", marginRight: 8 }}>→</span>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageView({
  message,
  pending,
  onOpenCanvas,
}: {
  message: Message;
  pending: boolean;
  onOpenCanvas: () => void;
}) {
  if (message.role === "user") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div
          style={{
            maxWidth: "85%",
            padding: "12px 16px",
            background: "var(--accent-soft)",
            border: "1px solid var(--accent-bd)",
            borderRadius: 8,
            fontSize: 14,
            lineHeight: 1.55,
            color: "var(--fg-0)",
            whiteSpace: "pre-wrap",
          }}
        >
          {message.content || (
            <em style={{ color: "var(--fg-2)" }}>(attachment only)</em>
          )}
          {message.attachments && message.attachments.length > 0 && (
            <UserAttachmentList items={message.attachments} />
          )}
        </div>
      </div>
    );
  }

  // Canvas-bound assistant message — show a compact pointer card instead of streaming text
  if (message.canvasPointer) {
    return (
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <Avatar />
        <button
          onClick={onOpenCanvas}
          style={{
            flex: 1,
            textAlign: "left",
            padding: "14px 18px",
            background: "var(--bg-1)",
            border: "1px solid var(--accent-bd)",
            borderRadius: 6,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 28,
              height: 28,
              borderRadius: 4,
              background: "var(--accent-soft)",
              border: "1px solid var(--accent-bd)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              color: "var(--accent)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 1.5h5L11 4.5V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1Z" />
              <path d="M8 1.5V4.5h3M4.5 7.5h5M4.5 9.5h5" />
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 9.5,
                fontWeight: 600,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                color: "var(--accent)",
                marginBottom: 3,
              }}
            >
              {pending ? "Drafting in canvas" : "Document drafted in canvas"}
            </div>
            <div style={{ fontSize: 13.5, color: "var(--fg-0)", fontWeight: 500 }}>
              {message.content && !pending ? (
                <Markdown source={message.content} />
              ) : (
                <span style={{ color: "var(--fg-2)" }}>
                  {pending ? "Open the Canvas tab on the right to watch it stream →" : "Open in canvas →"}
                </span>
              )}
            </div>
          </div>
          <span style={{ color: "var(--accent)", fontSize: 18, flexShrink: 0 }}>→</span>
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <Avatar />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, lineHeight: 1.65, color: "var(--fg-0)" }}>
          {message.content ? (
            <Markdown source={message.content} />
          ) : pending ? (
            <span style={{ color: "var(--fg-2)" }}>Thinking…</span>
          ) : null}
          {pending && message.content && <Caret />}
        </div>
        {!pending && message.cited && message.cited.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 10.5, color: "var(--fg-3)" }}>
            grounded in {message.cited.length} investigation{message.cited.length === 1 ? "" : "s"}
          </div>
        )}
      </div>
    </div>
  );
}

function Avatar() {
  return (
    <div
      aria-hidden
      style={{
        width: 26,
        height: 26,
        borderRadius: 13,
        border: "1px solid var(--accent-bd)",
        background: "var(--accent-soft)",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginTop: 2,
      }}
    >
      <svg width="13" height="13" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--accent)" strokeWidth="1.3" />
        <line x1="8" y1="0.5" x2="8" y2="15.5" stroke="var(--accent)" strokeWidth="1.3" />
        <circle cx="8" cy="8" r="1.6" fill="var(--accent)" />
      </svg>
    </div>
  );
}

function AttachmentStrip({
  items,
  onRemove,
}: {
  items: Attachment[];
  onRemove: (id: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        marginBottom: 10,
      }}
    >
      {items.map((a) => {
        const isImage = a.mime.startsWith("image/") && a.preview_url;
        return (
          <div
            key={a.id}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 6px 4px 4px",
              background: "var(--bg-1)",
              border: "1px solid var(--bd-2)",
              borderRadius: 5,
              maxWidth: 240,
            }}
          >
            {isImage ? (
              <img
                src={a.preview_url}
                alt={a.name}
                style={{
                  width: 28,
                  height: 28,
                  objectFit: "cover",
                  borderRadius: 3,
                  flexShrink: 0,
                }}
              />
            ) : (
              <span
                aria-hidden
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 3,
                  background: "var(--bg-3)",
                  color: "var(--accent)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: 0.2,
                  flexShrink: 0,
                }}
              >
                {extLabel(a)}
              </span>
            )}
            <span style={{ minWidth: 0, flex: 1 }}>
              <span
                style={{
                  display: "block",
                  fontSize: 12,
                  color: "var(--fg-0)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  lineHeight: 1.2,
                }}
              >
                {a.name}
              </span>
              <span
                className="mono"
                style={{ display: "block", fontSize: 10, color: "var(--fg-3)" }}
              >
                {humanSize(a.size)}
              </span>
            </span>
            <button
              onClick={() => onRemove(a.id)}
              aria-label={`Remove ${a.name}`}
              style={{
                width: 18,
                height: 18,
                borderRadius: 9,
                background: "transparent",
                border: "none",
                color: "var(--fg-3)",
                cursor: "pointer",
                fontSize: 11,
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}

function extLabel(a: Attachment): string {
  const fromName = a.name.split(".").pop()?.toUpperCase();
  if (fromName && fromName.length <= 4) return fromName;
  if (a.mime === "application/pdf") return "PDF";
  if (a.mime.includes("wordprocessingml")) return "DOCX";
  if (a.mime === "text/csv") return "CSV";
  if (a.mime === "application/json") return "JSON";
  return "FILE";
}

function humanSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function UserAttachmentList({ items }: { items: Attachment[] }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        marginTop: 8,
      }}
    >
      {items.map((a) => {
        const isImage = a.mime.startsWith("image/") && a.preview_url;
        return isImage ? (
          <img
            key={a.id}
            src={a.preview_url}
            alt={a.name}
            style={{
              maxWidth: 180,
              maxHeight: 120,
              objectFit: "cover",
              borderRadius: 4,
              border: "1px solid var(--accent-bd)",
            }}
          />
        ) : (
          <span
            key={a.id}
            className="mono"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 8px",
              fontSize: 10.5,
              color: "var(--accent)",
              background: "var(--accent-soft)",
              border: "1px solid var(--accent-bd)",
              borderRadius: 3,
            }}
          >
            {extLabel(a)} · {a.name}
          </span>
        );
      })}
    </div>
  );
}

function Caret() {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 7,
        height: 13,
        marginLeft: 2,
        background: "var(--accent)",
        verticalAlign: "-2px",
        animation: "live-pulse 0.9s ease-in-out infinite",
      }}
    />
  );
}

const ACCEPTED_MIME =
  "image/*,application/pdf,.txt,.md,.csv,.log,.json,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx";
const MAX_FILES = 4;
const MAX_PER_FILE = 10 * 1024 * 1024;

const Composer = function ComposerInner({
  ref,
  value,
  onChange,
  onSend,
  pending,
  error,
  attachments,
  onAttach,
  onRemoveAttachment,
}: {
  ref: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  pending: boolean;
  error: string | null;
  attachments: Attachment[];
  onAttach: (files: FileList) => void;
  onRemoveAttachment: (id: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canSend = (value.trim().length > 0 || attachments.length > 0) && !pending;

  return (
    <div style={{ padding: "14px 28px 20px", background: "var(--bg-0)", borderTop: "1px solid var(--bd-1)" }}>
      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        {error && (
          <div
            style={{
              marginBottom: 10,
              padding: "8px 12px",
              fontSize: 12,
              color: "var(--crit)",
              background: "var(--crit-soft)",
              border: "1px solid var(--crit)",
              borderRadius: 4,
            }}
          >
            {error}
          </div>
        )}
        {attachments.length > 0 && (
          <AttachmentStrip items={attachments} onRemove={onRemoveAttachment} />
        )}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 8,
            padding: "10px 12px 10px 10px",
            background: "var(--bg-1)",
            border: "1px solid var(--bd-2)",
            borderRadius: 8,
            boxShadow: "var(--shadow-1)",
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_MIME}
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                onAttach(e.target.files);
                e.target.value = "";
              }
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Attach files (images, PDFs, docs)"
            aria-label="Attach files"
            disabled={pending || attachments.length >= MAX_FILES}
            style={{
              width: 34,
              height: 34,
              borderRadius: 4,
              border: "1px solid transparent",
              background: "transparent",
              color: attachments.length >= MAX_FILES ? "var(--fg-4)" : "var(--fg-2)",
              cursor: attachments.length >= MAX_FILES || pending ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4.5L5.5 10a2 2 0 1 0 2.83 2.83L13 8.17a4 4 0 1 0-5.66-5.66L3.5 6.34" />
            </svg>
          </button>
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Ask a question, attach a screenshot, or ask Meridian to draft a report…"
            rows={1}
            disabled={pending}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            style={{
              flex: 1,
              resize: "none",
              border: "none",
              outline: "none",
              background: "transparent",
              color: "var(--fg-0)",
              fontSize: 14,
              lineHeight: 1.5,
              minHeight: 24,
              maxHeight: 200,
              padding: "6px 0",
            }}
          />
          <button
            onClick={onSend}
            disabled={!canSend}
            style={{
              padding: "8px 18px",
              background: canSend ? "var(--accent)" : "var(--bg-3)",
              color: canSend ? "var(--accent-text)" : "var(--fg-3)",
              border: "none",
              borderRadius: 4,
              fontSize: 13,
              fontWeight: 600,
              cursor: canSend ? "pointer" : "not-allowed",
              letterSpacing: 0.1,
            }}
          >
            {pending ? "Thinking…" : "Send"}
          </button>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: "var(--fg-3)", display: "flex", gap: 14 }}>
          <span>Enter to send · Shift+Enter for newline · ≤4 files, ≤10MB each</span>
          <span style={{ flex: 1 }} />
          <span className="mono">Gemini 3.1 Pro · Vertex AI · multimodal</span>
        </div>
      </div>
    </div>
  );
};

function RightRail({
  tab,
  onTabChange,
  sources,
  report,
  width,
  collapsed,
  onToggleCollapse,
  onStartResize,
}: {
  tab: "sources" | "canvas";
  onTabChange: (t: "sources" | "canvas") => void;
  sources: string[] | null;
  report: ReportDoc | null;
  width: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onStartResize: (e: React.MouseEvent) => void;
}) {
  const canvasReady = !!report;
  const COLLAPSED_WIDTH = 40;
  const currentWidth = collapsed ? COLLAPSED_WIDTH : width;

  if (collapsed) {
    return (
      <aside
        style={{
          width: COLLAPSED_WIDTH,
          flexShrink: 0,
          borderLeft: "1px solid var(--bd-1)",
          background: "var(--bg-1)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <ResizeHandle onMouseDown={onStartResize} />
        <button
          onClick={onToggleCollapse}
          title="Expand panel"
          aria-label="Expand panel"
          style={{
            width: 28,
            height: 28,
            marginTop: 10,
            border: "1px solid var(--bd-2)",
            borderRadius: 4,
            background: "transparent",
            color: "var(--fg-2)",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M9 3l-3 3.5L9 10" />
          </svg>
        </button>
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
          <CollapsedTabIcon
            label="Sources"
            badge={sources?.length ?? 0}
            active={tab === "sources"}
            onClick={() => {
              onTabChange("sources");
              onToggleCollapse();
            }}
          />
          <CollapsedTabIcon
            label="Canvas"
            badge={report ? (report.done ? 0 : "•") : 0}
            active={tab === "canvas"}
            disabled={!canvasReady}
            onClick={() => {
              if (!canvasReady) return;
              onTabChange("canvas");
              onToggleCollapse();
            }}
          />
        </div>
      </aside>
    );
  }

  return (
    <aside
      style={{
        width: currentWidth,
        flexShrink: 0,
        borderLeft: "1px solid var(--bd-1)",
        background: "var(--bg-1)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <ResizeHandle onMouseDown={onStartResize} />
      <header style={{ borderBottom: "1px solid var(--bd-1)" }}>
        <div style={{ display: "flex", padding: "0 10px", alignItems: "center" }}>
          <RailTab
            label="Sources"
            badge={sources?.length ?? 0}
            active={tab === "sources"}
            onClick={() => onTabChange("sources")}
          />
          <RailTab
            label="Canvas"
            badge={report ? (report.done ? "" : "live") : ""}
            active={tab === "canvas"}
            onClick={() => onTabChange("canvas")}
            disabled={!canvasReady}
          />
          <span style={{ flex: 1 }} />
          <button
            onClick={onToggleCollapse}
            title="Collapse panel"
            aria-label="Collapse panel"
            style={{
              width: 26,
              height: 26,
              marginRight: 6,
              border: "1px solid transparent",
              borderRadius: 4,
              background: "transparent",
              color: "var(--fg-3)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M4 3l3 3.5L4 10" />
            </svg>
          </button>
        </div>
      </header>
      {tab === "sources" || !canvasReady ? (
        <SourcesPanel cited={sources} />
      ) : (
        <CanvasPanel report={report} />
      )}
    </aside>
  );
}

function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
      className="rail-splitter"
      style={{
        position: "absolute",
        left: -3,
        top: 0,
        bottom: 0,
        width: 6,
        cursor: "col-resize",
        zIndex: 5,
      }}
    >
      <span
        aria-hidden
        className="rail-splitter-grip"
        style={{
          position: "absolute",
          left: 2,
          top: 0,
          bottom: 0,
          width: 2,
          background: "transparent",
          transition: "background 120ms ease",
        }}
      />
    </div>
  );
}

function CollapsedTabIcon({
  label,
  badge,
  active,
  onClick,
  disabled,
}: {
  label: string;
  badge: number | string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      style={{
        position: "relative",
        width: 28,
        height: 28,
        border: `1px solid ${active ? "var(--accent-bd)" : "transparent"}`,
        borderRadius: 4,
        background: active ? "var(--accent-soft)" : "transparent",
        color: active ? "var(--accent)" : disabled ? "var(--fg-4)" : "var(--fg-2)",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {label[0]}
      {!!badge && (
        <span
          style={{
            position: "absolute",
            top: -3,
            right: -3,
            minWidth: 12,
            height: 12,
            padding: "0 3px",
            borderRadius: 6,
            background: typeof badge === "string" ? "var(--accent)" : "var(--bd-3)",
            color: typeof badge === "string" ? "var(--accent-text)" : "var(--bg-1)",
            fontSize: 8.5,
            lineHeight: "12px",
            fontWeight: 700,
            textAlign: "center",
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function RailTab({
  label,
  badge,
  active,
  onClick,
  disabled,
}: {
  label: string;
  badge: number | string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "12px 14px 14px",
        background: "transparent",
        color: active ? "var(--fg-0)" : disabled ? "var(--fg-4)" : "var(--fg-2)",
        border: "none",
        borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`,
        marginBottom: -1,
        fontSize: 11.5,
        fontWeight: active ? 600 : 500,
        letterSpacing: 0.2,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {label}
      {!!badge && (
        <span
          className={typeof badge === "number" ? "mono" : undefined}
          style={{
            fontSize: 10,
            padding: "1px 6px",
            borderRadius: 9,
            background: typeof badge === "string" ? "var(--accent)" : "var(--bg-3)",
            color: typeof badge === "string" ? "var(--accent-text)" : "var(--fg-2)",
            fontWeight: 600,
            letterSpacing: typeof badge === "string" ? 0.3 : 0,
            textTransform: typeof badge === "string" ? "uppercase" : "none",
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function SourcesPanel({ cited }: { cited: string[] | null }) {
  return (
    <>
      <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid var(--bd-1)" }}>
        <div className="overline-accent" style={{ marginBottom: 4 }}>Grounded in</div>
        <div style={{ fontSize: 12, color: "var(--fg-2)", lineHeight: 1.4 }}>
          {cited?.length
            ? `${cited.length} investigations supplied as context.`
            : "The most recent investigations are loaded as context each time you ask a question."}
        </div>
      </div>
      <div className="scroll" style={{ flex: 1, overflowY: "auto", padding: "10px 10px 20px" }}>
        {!cited || cited.length === 0 ? (
          <div style={{ padding: 10, fontSize: 11.5, color: "var(--fg-3)" }}>No sources yet.</div>
        ) : (
          cited.map((uri) => {
            const id = uri.split("/").pop() ?? uri;
            return (
              <Link
                key={uri}
                href={`/app/incidents?id=${encodeURIComponent(uri)}`}
                title={`Open ${id} in Incidents`}
                className="source-card"
                style={{
                  display: "block",
                  padding: "9px 12px",
                  margin: "0 0 6px",
                  background: "var(--bg-2)",
                  border: "1px solid var(--bd-1)",
                  borderRadius: 4,
                  textDecoration: "none",
                  color: "inherit",
                  transition: "background 120ms ease, border-color 120ms ease",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span
                    className="mono"
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      color: "var(--accent)",
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {id}
                  </span>
                  <span
                    className="source-card-arrow"
                    aria-hidden
                    style={{
                      fontSize: 12,
                      color: "var(--fg-3)",
                      opacity: 0,
                      transition: "opacity 120ms ease, color 120ms ease",
                    }}
                  >
                    →
                  </span>
                </div>
                <div
                  className="mono"
                  style={{ fontSize: 9.5, color: "var(--fg-3)", marginTop: 2, wordBreak: "break-all" }}
                >
                  {uri}
                </div>
              </Link>
            );
          })
        )}
      </div>
    </>
  );
}

function CanvasPanel({ report }: { report: ReportDoc | null }) {
  return (
    <>
      <div
        style={{
          padding: "14px 18px 12px",
          borderBottom: "1px solid var(--bd-1)",
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="overline-accent" style={{ marginBottom: 4 }}>
            Canvas{report && !report.done ? " · drafting" : ""}
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--fg-0)",
              letterSpacing: -0.1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {report?.title ?? "Empty"}
          </div>
        </div>
        {report?.done && <ExportMenu report={report} />}
      </div>
      <div className="scroll" style={{ flex: 1, overflowY: "auto", padding: "18px 22px 32px" }}>
        {!report ? (
          <div
            style={{
              marginTop: 40,
              padding: 18,
              border: "1px dashed var(--bd-2)",
              borderRadius: 6,
              textAlign: "center",
            }}
          >
            <div className="overline" style={{ marginBottom: 8 }}>Canvas is empty</div>
            <div style={{ fontSize: 12, color: "var(--fg-2)", lineHeight: 1.55 }}>
              When Meridian decides a question deserves a written deliverable, the document
              streams in here.
            </div>
          </div>
        ) : report.body.length === 0 ? (
          <div style={{ padding: 12, fontSize: 12, color: "var(--fg-3)" }}>Drafting…</div>
        ) : (
          <>
            <Markdown source={report.body} />
            {!report.done && <Caret />}
            {report.done && report.cited.length > 0 && (
              <div
                style={{
                  marginTop: 22,
                  paddingTop: 14,
                  borderTop: "1px solid var(--bd-1)",
                  fontSize: 11,
                  color: "var(--fg-3)",
                }}
              >
                Grounded in {report.cited.length} investigation{report.cited.length === 1 ? "" : "s"}.
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function ExportMenu({ report }: { report: ReportDoc }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"pdf" | "docx" | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(report.body);
    } catch {
      // ignore
    }
    setOpen(false);
  };
  const handleExport = async (format: "markdown" | "pdf" | "docx") => {
    setOpen(false);
    if (format === "docx" || format === "pdf") setBusy(format);
    try {
      const { exportCanvas } = await import("@/lib/canvasExport");
      await exportCanvas(format, report.body, report.title);
    } catch (e) {
      console.error("[canvas export]", e);
      alert(`Export failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Export"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px 6px 14px",
          background: open ? "var(--accent-soft)" : "var(--accent)",
          color: open ? "var(--accent)" : "var(--accent-text)",
          border: open ? "1px solid var(--accent-bd)" : "1px solid var(--accent)",
          borderRadius: 4,
          fontSize: 11.5,
          fontWeight: 600,
          letterSpacing: 0.1,
          cursor: "pointer",
        }}
      >
        {busy ? `Building ${busy}…` : "Export"}
        <svg
          width="9"
          height="9"
          viewBox="0 0 9 9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        >
          <path d="M2 3.5L4.5 6L7 3.5" />
        </svg>
      </button>
      {open && (
        <div
          ref={popRef}
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 50,
            minWidth: 220,
            background: "var(--bg-1)",
            border: "1px solid var(--bd-2)",
            borderRadius: 5,
            boxShadow: "var(--shadow-2)",
            overflow: "hidden",
          }}
        >
          <ExportMenuItem
            label="Copy markdown"
            sub="to clipboard"
            onClick={handleCopy}
            icon={
              <svg width="13" height="13" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <rect x="4" y="4" width="9" height="9" rx="1.5" />
                <path d="M11 4V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h1" />
              </svg>
            }
          />
          <ExportMenuItem
            label="Markdown"
            sub=".md"
            onClick={() => handleExport("markdown")}
            icon={
              <svg width="13" height="13" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <path d="M7.5 2v8M4 7l3.5 3.5L11 7M2.5 13h10" />
              </svg>
            }
          />
          <ExportMenuItem
            label="PDF"
            sub=".pdf · opens print preview"
            onClick={() => handleExport("pdf")}
            icon={
              <svg width="13" height="13" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 1.5h6L12 4.5V13a0.5 0.5 0 0 1-0.5 0.5H3a0.5 0.5 0 0 1-0.5-0.5V2A0.5 0.5 0 0 1 3 1.5Z" />
                <path d="M9 1.5V4.5h3" />
                <text x="3.5" y="11" fontSize="3.6" fontFamily="Inter" fontWeight="700" fill="currentColor" stroke="none">PDF</text>
              </svg>
            }
          />
          <ExportMenuItem
            label="Word"
            sub=".docx"
            onClick={() => handleExport("docx")}
            icon={
              <svg width="13" height="13" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 1.5h6L12 4.5V13a0.5 0.5 0 0 1-0.5 0.5H3a0.5 0.5 0 0 1-0.5-0.5V2A0.5 0.5 0 0 1 3 1.5Z" />
                <path d="M9 1.5V4.5h3" />
                <text x="3.5" y="11" fontSize="3.4" fontFamily="Inter" fontWeight="700" fill="currentColor" stroke="none">DOC</text>
              </svg>
            }
          />
        </div>
      )}
    </div>
  );
}

function ExportMenuItem({
  label,
  sub,
  onClick,
  icon,
}: {
  label: string;
  sub: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      role="menuitem"
      className="export-menu-item"
      style={{
        width: "100%",
        display: "grid",
        gridTemplateColumns: "26px 1fr",
        gap: 10,
        padding: "9px 14px",
        background: "transparent",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        color: "var(--fg-0)",
      }}
    >
      <span
        style={{
          width: 22,
          height: 22,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--accent)",
          marginTop: 1,
        }}
      >
        {icon}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 12.5, fontWeight: 500, color: "var(--fg-0)", lineHeight: 1.3 }}>
          {label}
        </span>
        <span
          className="mono"
          style={{
            display: "block",
            fontSize: 10.5,
            color: "var(--fg-3)",
            marginTop: 1,
          }}
        >
          {sub}
        </span>
      </span>
    </button>
  );
}
