import { NextResponse } from "next/server";
import { env } from "@/lib/env";

/* Server-side redirect to the Splunk Web UI for the "Run in Splunk" button
 * on `spl` code blocks. The actual SPLUNK_WEB_URL never reaches the client
 * bundle — the browser only sees /api/splunk-search?q=... in the rendered
 * markdown, and the redirect happens server-side at click time. */

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!env.SPLUNK_WEB_URL) {
    return NextResponse.json({ error: "splunk_web_url_not_configured" }, { status: 503 });
  }
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  if (!q) {
    return NextResponse.json({ error: "missing_q" }, { status: 400 });
  }
  // Cap the query length defensively — Splunk search bar has a real cap and
  // overlong inputs are likely garbage anyway.
  const trimmed = q.slice(0, 2000);
  const dest = new URL(
    `${env.SPLUNK_WEB_URL.replace(/\/+$/, "")}/en-US/app/search/search`,
  );
  dest.searchParams.set("q", trimmed.startsWith("search") ? trimmed : `search ${trimmed}`);
  dest.searchParams.set("earliest", "-24h");
  dest.searchParams.set("latest", "now");
  return NextResponse.redirect(dest.toString(), 302);
}
