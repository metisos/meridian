"use client";
import { marked, type Tokens } from "marked";
import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  type ParagraphChild,
} from "docx";

/* Client-side export helpers. PDF goes through the browser's native print
 * pipeline (window.print on a styled new tab). DOCX is built in JS from the
 * marked AST and saved as a Blob. No server round-trip. */

export type ExportFormat = "markdown" | "pdf" | "docx";

function fileSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60) || "report";
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Markdown                                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

export function exportMarkdown(markdown: string, title: string) {
  const blob = new Blob([markdown], { type: "text/markdown" });
  triggerDownload(blob, `meridian-${fileSlug(title)}-${todayIso()}.md`);
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  PDF — open a styled new window and trigger the browser's Save as PDF      */
/* ────────────────────────────────────────────────────────────────────────── */

const PRINT_STYLES = `
  @page { size: Letter; margin: 0.75in; }
  * { box-sizing: border-box; }
  html, body {
    background: #ffffff;
    color: #111418;
    font: 11.5pt/1.55 "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    margin: 0;
    padding: 0;
  }
  .meridian-doc {
    max-width: 7.0in;
    margin: 0 auto;
  }
  .meridian-doc header {
    border-bottom: 1px solid #d0d4dc;
    padding-bottom: 14px;
    margin-bottom: 22px;
  }
  .meridian-doc header .eyebrow {
    font-size: 9.5pt;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #168954;
    font-weight: 600;
    margin-bottom: 6px;
  }
  .meridian-doc header .meta {
    margin-top: 8px;
    font: 9.5pt/1.4 "IBM Plex Mono", monospace;
    color: #56627a;
  }
  h1 {
    margin: 0;
    font-size: 22pt;
    font-weight: 700;
    letter-spacing: -0.3pt;
    line-height: 1.18;
    color: #0c1320;
  }
  h2 {
    margin: 26pt 0 8pt;
    font-size: 13.5pt;
    font-weight: 700;
    color: #0c1320;
    letter-spacing: -0.1pt;
  }
  h3 {
    margin: 18pt 0 6pt;
    font-size: 11pt;
    font-weight: 700;
    color: #0c1320;
  }
  h4, h5, h6 {
    margin: 14pt 0 5pt;
    font-size: 10.5pt;
    font-weight: 700;
    color: #0c1320;
  }
  p { margin: 0 0 10pt; }
  ul, ol { margin: 0 0 11pt; padding-left: 22pt; }
  li { margin-bottom: 3pt; }
  strong { font-weight: 700; color: #0c1320; }
  em { font-style: italic; }
  blockquote {
    margin: 0 0 12pt;
    padding: 8pt 12pt;
    border-left: 3px solid #168954;
    background: #f3f8f5;
    font-weight: 500;
    color: #0c1320;
  }
  code {
    font: 10pt "IBM Plex Mono", monospace;
    background: #f3f5f9;
    border: 0.5pt solid #e2e2e2;
    padding: 0.5pt 4pt;
    border-radius: 2pt;
  }
  pre {
    font: 9.5pt/1.55 "IBM Plex Mono", monospace;
    background: #f8f8f8;
    border: 0.5pt solid #d8dde6;
    padding: 10pt 12pt;
    border-radius: 2pt;
    margin: 0 0 12pt;
    overflow-wrap: break-word;
    word-wrap: break-word;
    white-space: pre-wrap;
  }
  pre code { background: transparent; border: none; padding: 0; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 14pt;
    font-size: 10pt;
  }
  th, td {
    text-align: left;
    padding: 6pt 9pt;
    border: 0.5pt solid #d0d4dc;
    vertical-align: top;
  }
  th {
    background: #f5f7fa;
    font-weight: 700;
    font-size: 9pt;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #2d3849;
  }
  hr { border: none; border-top: 0.5pt solid #d0d4dc; margin: 16pt 0; }
  a { color: #168954; text-decoration: underline; }
  .footer {
    margin-top: 32pt;
    padding-top: 12pt;
    border-top: 0.5pt solid #d0d4dc;
    font: 9pt/1.4 "IBM Plex Mono", monospace;
    color: #828b9c;
  }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    h2, h3 { break-after: avoid; }
    table, pre, blockquote { break-inside: avoid; }
  }
`;

/** Citation token regex (matches `[inv_…]` ids that the agent emits inline). */
const CITATION_RE = /\[([a-z0-9_:/.\-]{4,80})\]/gi;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function markdownToPrintHtml(markdown: string, title: string): string {
  // Use marked default settings, GFM-flavored
  const body = marked.parse(markdown, { async: false, gfm: true }) as string;
  const safeTitle = escapeHtml(title);
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<title>${safeTitle}</title>
<style>${PRINT_STYLES}</style>
</head>
<body>
<div class="meridian-doc">
  <header>
    <div class="eyebrow">Meridian · incident report</div>
    <h1>${safeTitle}</h1>
    <div class="meta">Generated ${ts} · meridian.metisos.co</div>
  </header>
  ${body}
  <div class="footer">
    Produced by Meridian — context-aware incident intelligence. Every claim in
    this report is traceable to a ctx:// artifact via the Control Center.
  </div>
</div>
<script>window.addEventListener("load", () => setTimeout(() => window.print(), 250));<\/script>
</body></html>`;
}

export function exportPdf(markdown: string, title: string) {
  const html = markdownToPrintHtml(markdown, title);
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) {
    alert("Pop-up was blocked. Allow pop-ups to export PDF.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  DOCX — walk marked tokens, emit docx primitives                            */
/* ────────────────────────────────────────────────────────────────────────── */

const HEADING_LEVEL: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

/** Walk inline tokens and produce TextRun children, including citation pills as styled mono runs. */
function inlineRuns(
  tokens: Tokens.Generic[] | undefined,
  base: { bold?: boolean; italics?: boolean } = {},
): TextRun[] {
  if (!tokens) return [];
  const out: TextRun[] = [];
  for (const tok of tokens) {
    if (tok.type === "text" || tok.type === "escape") {
      const txt = (tok as Tokens.Text).text;
      // Split off citation tokens to give them mono styling
      const parts = txt.split(CITATION_RE);
      parts.forEach((p, i) => {
        if (!p) return;
        const isCitation = i % 2 === 1;
        out.push(
          new TextRun({
            text: isCitation ? `[${p}]` : p,
            font: isCitation ? "Consolas" : undefined,
            color: isCitation ? "168954" : undefined,
            bold: base.bold,
            italics: base.italics,
          }),
        );
      });
    } else if (tok.type === "strong") {
      out.push(...inlineRuns((tok as Tokens.Strong).tokens, { ...base, bold: true }));
    } else if (tok.type === "em") {
      out.push(...inlineRuns((tok as Tokens.Em).tokens, { ...base, italics: true }));
    } else if (tok.type === "codespan") {
      out.push(
        new TextRun({
          text: (tok as Tokens.Codespan).text,
          font: "Consolas",
        }),
      );
    } else if (tok.type === "link") {
      // Flatten link inner tokens to text and emit one styled run per chunk.
      const linkText = ((tok as Tokens.Link).tokens ?? [])
        .map((t) => (t as Tokens.Text).text ?? "")
        .join("");
      out.push(
        new TextRun({
          text: linkText,
          color: "168954",
          underline: {},
          bold: base.bold,
          italics: base.italics,
        }),
      );
    } else if (tok.type === "br") {
      out.push(new TextRun({ text: "", break: 1 }));
    } else if (tok.type === "html") {
      // skip raw HTML in docx
    } else if ((tok as { tokens?: Tokens.Generic[] }).tokens) {
      out.push(...inlineRuns((tok as { tokens: Tokens.Generic[] }).tokens, base));
    } else {
      const text = (tok as { text?: unknown }).text;
      if (typeof text === "string" && text.length > 0) {
        out.push(new TextRun({ text, bold: base.bold, italics: base.italics }));
      }
    }
  }
  return out;
}

function tableFrom(tok: Tokens.Table): Table {
  const headerRow = new TableRow({
    children: tok.header.map(
      (cell) =>
        new TableCell({
          width: { size: 100 / tok.header.length, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              children: inlineRuns(cell.tokens as Tokens.Generic[], { bold: true }),
            }),
          ],
        }),
    ),
    tableHeader: true,
  });
  const bodyRows = tok.rows.map(
    (row) =>
      new TableRow({
        children: row.map(
          (cell) =>
            new TableCell({
              width: { size: 100 / tok.header.length, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  children: inlineRuns(cell.tokens as Tokens.Generic[]),
                }),
              ],
            }),
        ),
      }),
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows],
  });
}

function paragraphsFromList(tok: Tokens.List, depth = 0): Paragraph[] {
  const out: Paragraph[] = [];
  tok.items.forEach((item, i) => {
    const prefix = tok.ordered ? `${i + 1}. ` : "• ";
    const children: ParagraphChild[] = [
      new TextRun({ text: "  ".repeat(depth) + prefix }),
      ...inlineRuns(item.tokens.filter((t) => t.type !== "list") as Tokens.Generic[]),
    ];
    out.push(new Paragraph({ children, spacing: { after: 80 } }));
    // Nested lists
    for (const child of item.tokens) {
      if (child.type === "list") {
        out.push(...paragraphsFromList(child as Tokens.List, depth + 1));
      }
    }
  });
  return out;
}

function blocksFromTokens(tokens: Tokens.Generic[]): Array<Paragraph | Table> {
  const out: Array<Paragraph | Table> = [];
  for (const tok of tokens) {
    if (tok.type === "heading") {
      const h = tok as Tokens.Heading;
      out.push(
        new Paragraph({
          heading: HEADING_LEVEL[h.depth] ?? HeadingLevel.HEADING_3,
          children: inlineRuns(h.tokens as Tokens.Generic[], { bold: true }),
          spacing: { before: h.depth === 1 ? 0 : 240, after: 120 },
        }),
      );
    } else if (tok.type === "paragraph") {
      out.push(
        new Paragraph({
          children: inlineRuns((tok as Tokens.Paragraph).tokens as Tokens.Generic[]),
          spacing: { after: 120 },
        }),
      );
    } else if (tok.type === "blockquote") {
      const inner = blocksFromTokens(
        (tok as Tokens.Blockquote).tokens as Tokens.Generic[],
      );
      for (const blk of inner) {
        if (blk instanceof Paragraph) {
          out.push(blk);
        }
      }
    } else if (tok.type === "list") {
      out.push(...paragraphsFromList(tok as Tokens.List));
    } else if (tok.type === "code") {
      const code = tok as Tokens.Code;
      out.push(
        new Paragraph({
          children: [new TextRun({ text: code.text, font: "Consolas", size: 18 })],
          shading: { type: "clear", color: "auto", fill: "F5F5F5" },
          spacing: { before: 120, after: 120 },
          border: {
            top: { style: "single", size: 4, color: "D8DDE6" },
            bottom: { style: "single", size: 4, color: "D8DDE6" },
            left: { style: "single", size: 4, color: "D8DDE6" },
            right: { style: "single", size: 4, color: "D8DDE6" },
          },
        }),
      );
    } else if (tok.type === "hr") {
      out.push(
        new Paragraph({
          children: [],
          border: {
            top: { style: "single", size: 6, color: "D0D4DC" },
          },
          spacing: { before: 200, after: 200 },
        }),
      );
    } else if (tok.type === "table") {
      out.push(tableFrom(tok as Tokens.Table));
      out.push(new Paragraph({ children: [], spacing: { after: 200 } }));
    } else if (tok.type === "space") {
      // skip
    } else if (tok.type === "html") {
      // skip raw HTML
    }
  }
  return out;
}

export async function exportDocx(markdown: string, title: string) {
  const tokens = marked.lexer(markdown);
  const body = blocksFromTokens(tokens as Tokens.Generic[]);

  const ts = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

  const doc = new Document({
    creator: "Meridian",
    title,
    description: "Incident intelligence report generated by Meridian",
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 22 }, // 11pt
        },
      },
    },
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: "MERIDIAN · INCIDENT REPORT",
                bold: true,
                color: "168954",
                size: 18,
                font: "Calibri",
              }),
            ],
            spacing: { after: 120 },
          }),
          new Paragraph({
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.LEFT,
            children: [
              new TextRun({ text: title, bold: true, size: 44 }),
            ],
            spacing: { after: 120 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Generated ${ts} · meridian.metisos.co`,
                color: "56627A",
                font: "Consolas",
                size: 18,
              }),
            ],
            spacing: { after: 320 },
            border: {
              bottom: { style: "single", size: 4, color: "D0D4DC" },
            },
          }),
          ...body,
          new Paragraph({
            children: [
              new TextRun({
                text: "Produced by Meridian — context-aware incident intelligence. Every claim in this report is traceable to a ctx:// artifact via the Control Center.",
                color: "828B9C",
                italics: true,
                size: 18,
              }),
            ],
            spacing: { before: 360 },
            border: {
              top: { style: "single", size: 4, color: "D0D4DC" },
            },
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, `meridian-${fileSlug(title)}-${todayIso()}.docx`);
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Unified entry point                                                        */
/* ────────────────────────────────────────────────────────────────────────── */

export async function exportCanvas(
  format: ExportFormat,
  markdown: string,
  title: string,
) {
  if (format === "markdown") exportMarkdown(markdown, title);
  else if (format === "pdf") exportPdf(markdown, title);
  else if (format === "docx") await exportDocx(markdown, title);
}
