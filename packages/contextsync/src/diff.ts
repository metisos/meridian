/**
 * Line-level diff between two content payloads, with summary stats — spec §2 (Diff).
 *
 * Both inputs are normalized to a string by JSON-serialization if they are not
 * already strings. The diff is a simple LCS-based line diff returning a list of
 * operations and a summary count of added/removed lines.
 */

export interface DiffOp {
  kind: "+" | "-" | "=";
  line: string;
}

export interface DiffResult {
  ops: DiffOp[];
  stats: {
    added_lines: number;
    removed_lines: number;
    unchanged_lines: number;
  };
}

function toLines(content: unknown): string[] {
  const text =
    typeof content === "string" ? content : JSON.stringify(content, null, 2);
  return text.split(/\r?\n/);
}

/**
 * Standard LCS-based line diff. O(m*n) time and space; fine for the small
 * artifact bodies we deal with. For very large content, swap for Myers.
 */
export function diffContent(prev: unknown, next: unknown): DiffResult {
  const a = toLines(prev);
  const b = toLines(next);
  const m = a.length;
  const n = b.length;

  // LCS table
  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) lcs[i]![j] = lcs[i + 1]![j + 1]! + 1;
      else lcs[i]![j] = Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  // Walk back to emit ops
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  let added = 0;
  let removed = 0;
  let same = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      ops.push({ kind: "=", line: a[i]! });
      same++;
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      ops.push({ kind: "-", line: a[i]! });
      removed++;
      i++;
    } else {
      ops.push({ kind: "+", line: b[j]! });
      added++;
      j++;
    }
  }
  while (i < m) {
    ops.push({ kind: "-", line: a[i]! });
    removed++;
    i++;
  }
  while (j < n) {
    ops.push({ kind: "+", line: b[j]! });
    added++;
    j++;
  }

  return {
    ops,
    stats: { added_lines: added, removed_lines: removed, unchanged_lines: same },
  };
}
