/**
 * Output helpers for the CLI. Single mode switch (`--json`) toggles between
 * human-friendly tables/colors and machine-readable JSON.
 *
 * Color usage:
 *   - green:  success / healthy / high confidence (>=0.7)
 *   - amber:  warning / medium confidence (0.3..0.7)
 *   - red:    failure / low confidence (<0.3) / errors
 *   - dim:    separators, labels, low-importance metadata
 */

import pc from "picocolors";

const TTY = process.stdout.isTTY;

export const color = {
  green: (s: string) => (TTY ? pc.green(s) : s),
  red: (s: string) => (TTY ? pc.red(s) : s),
  amber: (s: string) => (TTY ? pc.yellow(s) : s),
  blue: (s: string) => (TTY ? pc.blue(s) : s),
  dim: (s: string) => (TTY ? pc.dim(s) : s),
  bold: (s: string) => (TTY ? pc.bold(s) : s),
};

export const symbols = {
  ok: TTY ? "✓" : "OK",
  fail: TTY ? "✗" : "FAIL",
  warn: TTY ? "!" : "!",
  arrow: TTY ? "→" : "->",
  bullet: TTY ? "•" : "*",
};

export function statusBadge(ok: boolean): string {
  return ok ? color.green(symbols.ok) : color.red(symbols.fail);
}

export interface TableColumn {
  header: string;
  /** Right-align numbers; default left. */
  align?: "left" | "right";
  /** Soft max width; long values get truncated with an ellipsis. */
  maxWidth?: number;
}

export function renderTable(
  columns: TableColumn[],
  rows: Array<Record<string, string>>,
): string {
  const widths = columns.map((c) =>
    Math.max(
      c.header.length,
      ...rows.map((r) => visibleLength(r[c.header] ?? "")),
    ),
  );
  // Apply soft maxWidth
  for (let i = 0; i < columns.length; i++) {
    const mw = columns[i]!.maxWidth;
    if (mw && widths[i]! > mw) widths[i] = mw;
  }

  const lines: string[] = [];
  // Header
  lines.push(
    columns
      .map((c, i) => color.bold(pad(c.header, widths[i]!, c.align ?? "left")))
      .join(color.dim("  ")),
  );
  // Divider
  lines.push(columns.map((_, i) => color.dim("─".repeat(widths[i]!))).join(color.dim("  ")));
  // Rows
  for (const row of rows) {
    lines.push(
      columns
        .map((c, i) => {
          const cell = truncate(row[c.header] ?? "", widths[i]!);
          return pad(cell, widths[i]!, c.align ?? "left");
        })
        .join(color.dim("  ")),
    );
  }
  return lines.join("\n");
}

/** Length ignoring ANSI escape codes. */
function visibleLength(s: string): number {
  // strip ANSI: ESC[ ... m
  return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}

function pad(s: string, width: number, align: "left" | "right"): string {
  const visible = visibleLength(s);
  if (visible >= width) return s;
  const padding = " ".repeat(width - visible);
  return align === "right" ? padding + s : s + padding;
}

function truncate(s: string, width: number): string {
  if (visibleLength(s) <= width) return s;
  return s.slice(0, Math.max(0, width - 1)) + "…";
}

export function emitJSON(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}

export function section(title: string): void {
  process.stdout.write(`\n${color.bold(title)}\n`);
}

export interface CommandFlags {
  json?: boolean;
}
