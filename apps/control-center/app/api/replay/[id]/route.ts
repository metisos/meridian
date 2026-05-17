import { NextResponse } from "next/server";
import { fetchInvestigations } from "@/lib/queries";
import type { Investigation } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReplayStep {
  number: number;
  label: string;
  detail: string;
  duration_ms: number;
}

function buildSteps(inv: Investigation): ReplayStep[] {
  const chain = inv.causal_chain;
  const trigger = chain[0];
  const last = chain[chain.length - 1];
  const windowMs =
    trigger && last
      ? Math.abs(Date.parse(last.usc_temporal) - Date.parse(trigger.usc_temporal))
      : 0;
  const fmtWindow = (ms: number) => {
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${(s / 60).toFixed(1)}m`;
    return `${(s / 3600).toFixed(1)}h`;
  };

  const br = inv.blast_radius;
  const triggerShort = trigger?.artifact_uri.split("/").pop() ?? "(no trigger artifact)";
  const recallCount = inv.similar_past_investigations.length;
  const recallTop = inv.similar_past_investigations
    .slice()
    .sort((a, b) => b.similarity - a.similarity)[0];

  return [
    {
      number: 1,
      label: "Fetch trigger",
      detail: `Read artifact ${triggerShort} from ContextSync store · USC tier=temporal`,
      duration_ms: jitter(20, 12),
    },
    {
      number: 2,
      label: "Recall similar investigations",
      detail:
        recallCount > 0
          ? `Atlas Vector Search returned ${recallCount} candidate${recallCount === 1 ? "" : "s"} above 0.7 threshold · top similarity ${(
              (recallTop?.similarity ?? 0) * 100
            ).toFixed(0)}%`
          : "Atlas Vector Search returned 0 candidates above threshold (cold case)",
      duration_ms: jitter(380, 120),
    },
    {
      number: 3,
      label: "Reconstruct causal chain",
      detail: `Walked ${chain.length} event${chain.length === 1 ? "" : "s"} backward via USC cross-tier match · window ${fmtWindow(windowMs)}`,
      duration_ms: jitter(95, 40),
    },
    {
      number: 4,
      label: "Compute blast radius",
      detail: `Traversed entity_graph from ${br.root_entity_uri?.split("/").pop() ?? "(no root)"} · ${br.total_affected} entit${
        br.total_affected === 1 ? "y" : "ies"
      } affected (I·${br.infrastructure.length} B·${br.business.length} C·${br.compliance.length})`,
      duration_ms: jitter(70, 30),
    },
    {
      number: 5,
      label: "Generate root-cause hypothesis",
      detail: `Gemini 3.1 Pro · grounded with causal chain + ${recallCount} prior investigation${recallCount === 1 ? "" : "s"} · confidence ${(
        inv.confidence * 100
      ).toFixed(0)}%`,
      duration_ms: jitter(11500, 2500),
    },
    {
      number: 6,
      label: "Rank response actions",
      detail: `Surfaced ${inv.actions_recommended.length} action${inv.actions_recommended.length === 1 ? "" : "s"} · ${inv.actions_recommended
        .filter((a) => a.priority === "critical" || a.priority === "high")
        .length} high/critical priority`,
      duration_ms: jitter(220, 80),
    },
    {
      number: 7,
      label: "Persist to agent memory",
      detail: `Wrote investigation to ${inv.investigation_uri.split("/").pop()} · appended provenance entry · notified surface via change stream`,
      duration_ms: jitter(75, 25),
    },
  ];
}

function jitter(base: number, spread: number): number {
  return Math.round(base + (Math.random() - 0.5) * 2 * spread);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const investigations = await fetchInvestigations(100);
  const inv = investigations.find((i) => i.investigation_uri === decoded);
  if (!inv) {
    return NextResponse.json({ error: "investigation not found" }, { status: 404 });
  }

  const steps = buildSteps(inv);
  const totalEstimated = steps.reduce((s, x) => s + x.duration_ms, 0);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, payload: unknown) => {
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
      };

      send("meta", {
        total_steps: steps.length,
        investigation_uri: inv.investigation_uri,
        estimated_ms: totalEstimated,
      });

      for (const step of steps) {
        send("step-start", { number: step.number, label: step.label });
        // Demo pacing — shrink the long Gemini step a bit so the replay
        // runs in ~12-15s instead of the real ~20s
        const pacing = Math.min(step.duration_ms, 8000);
        await sleep(pacing);
        send("step-end", {
          number: step.number,
          label: step.label,
          detail: step.detail,
          duration_ms: step.duration_ms,
          status: "ok",
        });
      }

      send("done", { ok: true, total_steps: steps.length });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
