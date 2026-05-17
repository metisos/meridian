import { NextResponse } from "next/server";
import { fetchCorrelation } from "@/lib/uscChain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const data = await fetchCorrelation(id);
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ data });
}
