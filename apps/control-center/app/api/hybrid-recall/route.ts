import { NextResponse } from "next/server";
import { fetchHybridRecall } from "@/lib/hybridRecall";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const hits = await fetchHybridRecall(id);
  return NextResponse.json({ hits });
}
