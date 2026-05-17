import { NextResponse } from "next/server";
import { fetchBusinessImpact } from "@/lib/businessImpact";
import { fetchInvestigations } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  const investigations = await fetchInvestigations(100);
  const inv = investigations.find((i) => i.investigation_uri === id);
  if (!inv) {
    return NextResponse.json({ error: "investigation not found" }, { status: 404 });
  }

  const line = await fetchBusinessImpact(inv);
  return NextResponse.json({ line });
}
