import { NextResponse } from "next/server";
import { fetchProvenanceGraph } from "@/lib/provenanceGraph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const data = await fetchProvenanceGraph(id);
  return NextResponse.json({ data });
}
