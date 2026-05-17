import { NextResponse } from "next/server";
import { fetchInvestigations } from "@/lib/queries";
import { detectPatterns } from "@/lib/patterns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const investigations = await fetchInvestigations(200);
  const subject = investigations.find((i) => i.investigation_uri === id);
  if (!subject) return NextResponse.json({ error: "not found" }, { status: 404 });

  const patterns = detectPatterns(subject, investigations);
  return NextResponse.json({ patterns });
}
