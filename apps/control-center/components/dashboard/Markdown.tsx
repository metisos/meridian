"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import type { ReactNode, ReactElement } from "react";

/* "Run in Splunk" routes through a server-side redirect endpoint so the
   actual SPLUNK_WEB_URL never lands in the client bundle. The button is
   always available; if SPLUNK_WEB_URL isn't configured on the server, the
   redirect returns 503 — visible to whoever clicks, but no infrastructure
   leakage. */
const SPLUNK_REDIRECT_PATH = "/api/splunk-search";

/* Pull the language hint + source text out of a <pre><code className="language-X">...</code></pre>
   structure that react-markdown produces. */
function extractCode(children: ReactNode): { lang: string; source: string } | null {
  const arr = Array.isArray(children) ? children : [children];
  for (const child of arr) {
    if (
      child &&
      typeof child === "object" &&
      "props" in child &&
      (child as ReactElement).props
    ) {
      const props = (child as ReactElement<{ className?: string; children?: ReactNode }>).props;
      const cls = props.className ?? "";
      const match = cls.match(/language-([\w-]+)/);
      if (!match) continue;
      const lang = match[1] ?? "";
      const source = flatten(props.children);
      return { lang, source };
    }
  }
  return null;
}

function flatten(node: ReactNode): string {
  if (node == null || node === false) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flatten).join("");
  if (typeof node === "object" && "props" in node) {
    return flatten((node as ReactElement<{ children?: ReactNode }>).props.children);
  }
  return "";
}

function SplBlock({ source }: { source: string }) {
  const clean = source.trim();
  const splunkUrl = `${SPLUNK_REDIRECT_PATH}?q=${encodeURIComponent(clean)}`;
  const copy = () => {
    if (typeof navigator !== "undefined") {
      navigator.clipboard.writeText(clean).catch(() => {});
    }
  };
  return (
    <div
      style={{
        margin: "0 0 14px",
        background: "var(--bg-2)",
        border: "1px solid var(--accent-bd)",
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          background: "var(--accent-soft)",
          borderBottom: "1px solid var(--accent-bd)",
          fontSize: 10.5,
          color: "var(--accent)",
          letterSpacing: 0.4,
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        <span
          aria-hidden
          style={{ width: 6, height: 6, borderRadius: 3, background: "var(--accent)" }}
        />
        SPL · Splunk search
        <span style={{ flex: 1 }} />
        <button
          onClick={copy}
          title="Copy query"
          style={{
            padding: "2px 8px",
            background: "transparent",
            border: "1px solid var(--accent-bd)",
            borderRadius: 3,
            fontSize: 9.5,
            fontWeight: 600,
            color: "var(--accent)",
            cursor: "pointer",
            letterSpacing: 0.4,
            textTransform: "uppercase",
          }}
        >
          Copy
        </button>
        <a
          href={splunkUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: "2px 8px",
            background: "var(--accent)",
            color: "var(--accent-text)",
            border: "none",
            borderRadius: 3,
            fontSize: 9.5,
            fontWeight: 700,
            textDecoration: "none",
            letterSpacing: 0.4,
            textTransform: "uppercase",
          }}
        >
          Run in Splunk →
        </a>
      </div>
      <pre
        className="mono scroll"
        style={{
          margin: 0,
          padding: "12px 14px",
          background: "transparent",
          fontSize: 12,
          lineHeight: 1.55,
          color: "var(--fg-0)",
          overflowX: "auto",
        }}
      >
        {clean}
      </pre>
    </div>
  );
}

const INVESTIGATION_PREFIX = "ctx://meridian/investigations/";

/* Returns the full ctx:// URI for an investigation citation, or null if the id
   doesn't look like an investigation reference. */
function toInvestigationUri(id: string): string | null {
  if (id.startsWith(INVESTIGATION_PREFIX)) return id;
  if (/^inv_[a-z0-9_]+$/i.test(id)) return `${INVESTIGATION_PREFIX}${id}`;
  return null;
}

/* Inline-citation renderer: matches [inv_...] / [ctx://...] / short hex/snake-case ids
   and renders them as accent pills. Investigation citations become clickable links
   that open the Incidents tab with that investigation pre-selected. */
export function renderCitations(input: string): ReactNode[] {
  const parts = input.split(/(\[[a-z0-9_:/.\-]{4,80}\])/gi);
  return parts.map((part, i) => {
    if (/^\[[a-z0-9_:/.\-]{4,80}\]$/i.test(part)) {
      const id = part.slice(1, -1);
      const display = id.replace(/^ctx:\/\/meridian\/investigations\//, "");
      const text = display.length > 28 ? display.slice(0, 25) + "…" : display;
      const uri = toInvestigationUri(id);
      if (uri) {
        return (
          <Link
            key={i}
            href={`/app/incidents?id=${encodeURIComponent(uri)}`}
            className="mono citation-pill"
            title={`Open investigation ${id}`}
          >
            {text}
          </Link>
        );
      }
      return (
        <span key={i} className="mono citation-pill" title={id}>
          {text}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function withCitations(children: ReactNode): ReactNode {
  if (typeof children === "string") return renderCitations(children);
  if (Array.isArray(children)) {
    return children.map((c, i) =>
      typeof c === "string" ? <span key={i}>{renderCitations(c)}</span> : c,
    );
  }
  return children;
}

export function Markdown({ source }: { source: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1
              style={{
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: -0.4,
                lineHeight: 1.25,
                margin: "8px 0 14px",
                color: "var(--fg-0)",
                paddingBottom: 10,
                borderBottom: "1px solid var(--bd-1)",
              }}
            >
              {withCitations(children)}
            </h1>
          ),
          h2: ({ children }) => (
            <h2
              style={{
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: -0.2,
                lineHeight: 1.3,
                margin: "22px 0 10px",
                color: "var(--fg-0)",
              }}
            >
              {withCitations(children)}
            </h2>
          ),
          h3: ({ children }) => (
            <h3
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                margin: "18px 0 8px",
                color: "var(--fg-0)",
                textTransform: "none",
              }}
            >
              {withCitations(children)}
            </h3>
          ),
          p: ({ children }) => (
            <p style={{ margin: "0 0 12px", fontSize: 14, lineHeight: 1.6, color: "var(--fg-1)" }}>
              {withCitations(children)}
            </p>
          ),
          ul: ({ children }) => (
            <ul style={{ margin: "0 0 14px", paddingLeft: 22, fontSize: 14, lineHeight: 1.6, color: "var(--fg-1)" }}>
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol style={{ margin: "0 0 14px", paddingLeft: 22, fontSize: 14, lineHeight: 1.6, color: "var(--fg-1)" }}>
              {children}
            </ol>
          ),
          li: ({ children }) => <li style={{ marginBottom: 4 }}>{withCitations(children)}</li>,
          strong: ({ children }) => (
            <strong style={{ color: "var(--fg-0)", fontWeight: 600 }}>{withCitations(children)}</strong>
          ),
          em: ({ children }) => <em style={{ color: "var(--fg-0)", fontStyle: "italic" }}>{withCitations(children)}</em>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: 2 }}
            >
              {children}
            </a>
          ),
          code: ({ children, className }) => {
            const isBlock = /language-/.test(className ?? "");
            if (isBlock) return <>{children}</>;
            return (
              <code
                className="mono"
                style={{
                  background: "var(--bg-2)",
                  border: "1px solid var(--bd-1)",
                  borderRadius: 3,
                  padding: "1px 5px",
                  fontSize: 12,
                  color: "var(--fg-0)",
                }}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => {
            // Detect ```spl fences — render with a "Run in Splunk" affordance.
            const code = extractCode(children);
            if (code?.lang === "spl") {
              return <SplBlock source={code.source} />;
            }
            return (
              <pre
                className="mono scroll"
                style={{
                  background: "var(--bg-2)",
                  border: "1px solid var(--bd-1)",
                  borderRadius: 4,
                  padding: "12px 14px",
                  fontSize: 12,
                  lineHeight: 1.55,
                  color: "var(--fg-0)",
                  overflowX: "auto",
                  margin: "0 0 14px",
                }}
              >
                {children}
              </pre>
            );
          },
          blockquote: ({ children }) => (
            <blockquote
              style={{
                margin: "0 0 14px",
                padding: "8px 14px",
                background: "var(--accent-soft)",
                borderLeft: "3px solid var(--accent)",
                color: "var(--fg-0)",
                fontSize: 14,
                lineHeight: 1.55,
                fontStyle: "normal",
                fontWeight: 500,
              }}
            >
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div style={{ overflowX: "auto", margin: "0 0 16px", border: "1px solid var(--bd-1)", borderRadius: 4 }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 12.5,
                }}
              >
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => <thead style={{ background: "var(--bg-2)" }}>{children}</thead>,
          th: ({ children }) => (
            <th
              style={{
                textAlign: "left",
                padding: "8px 12px",
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: 0.14,
                textTransform: "uppercase",
                color: "var(--fg-2)",
                borderBottom: "1px solid var(--bd-1)",
              }}
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td
              style={{
                padding: "8px 12px",
                color: "var(--fg-1)",
                borderBottom: "1px solid var(--bd-1)",
                verticalAlign: "top",
              }}
            >
              {withCitations(children)}
            </td>
          ),
          hr: () => <hr style={{ border: "none", borderTop: "1px solid var(--bd-1)", margin: "16px 0" }} />,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
