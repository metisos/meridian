/**
 * `meridian splunk search|indexes|sourcetypes` — passthrough wrappers.
 */

import { splSearch, splListIndexes } from "../splunkClient.js";
import { color, emitJSON, renderTable, section, type CommandFlags } from "../output.js";

export async function splunkSearch(
  query: string,
  options: { limit?: number; earliest?: string; latest?: string } & CommandFlags = {},
): Promise<unknown> {
  const rows = await splSearch({
    query,
    maxResults: options.limit ?? 50,
    earliest: options.earliest,
    latest: options.latest,
  });
  if (options.json) {
    emitJSON(rows);
    return rows;
  }
  section(`splunk search ${color.dim(`(${rows.length} results)`)}`);
  for (const r of rows.slice(0, 20)) {
    process.stdout.write(
      `${color.dim(r._time)} ${color.amber(r.sourcetype)} ${color.blue(r.host ?? "?")} ${r._raw?.slice(0, 200) ?? ""}\n`,
    );
  }
  if (rows.length > 20) process.stdout.write(color.dim(`\n... and ${rows.length - 20} more (use --limit to widen, --json for full)\n`));
  return rows;
}

export async function splunkIndexes(options: CommandFlags = {}): Promise<unknown> {
  const idx = await splListIndexes();
  if (options.json) {
    emitJSON(idx);
    return idx;
  }
  section("splunk indexes");
  process.stdout.write(
    "\n" +
      renderTable(
        [{ header: "Name" }, { header: "Events", align: "right" }],
        idx.map((i) => ({ Name: i.name, Events: i.totalEventCount.toLocaleString() })),
      ) +
      "\n",
  );
  return idx;
}

export async function splunkSourcetypes(
  options: { earliest?: string } & CommandFlags = {},
): Promise<unknown> {
  const rows = await splSearch({
    query: `search index=* | stats count by sourcetype`,
    earliest: options.earliest ?? "-24h",
    maxResults: 100,
  });
  if (options.json) {
    emitJSON(rows);
    return rows;
  }
  section(`splunk sourcetypes ${color.dim(`(last 24h)`)}`);
  process.stdout.write(
    "\n" +
      renderTable(
        [{ header: "Sourcetype" }, { header: "Count", align: "right" }],
        rows.map((r) => ({ Sourcetype: r.sourcetype, Count: r.count ?? "0" })),
      ) +
      "\n",
  );
  return rows;
}
