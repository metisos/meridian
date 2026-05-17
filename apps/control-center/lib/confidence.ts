import type { Investigation } from "./types";

export interface ConfidenceBreakdown {
  stored: number;
  estimated: number;
  components: Array<{
    key: "causal" | "recall" | "grounding";
    label: string;
    value: number;
    weight: number;
    note: string;
  }>;
  formula: string;
}

const W_CAUSAL = 0.45;
const W_RECALL = 0.3;
const W_GROUNDING = 0.25;

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function geomean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let sum = 0;
  for (const x of xs) sum += Math.log(Math.max(1e-6, x));
  return Math.exp(sum / xs.length);
}

function average(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

/* Causal chain coherence — how tightly the events in the chain cluster on the
   temporal axis. We use adjacent-pair temporal proximity as a proxy for
   per-link USC scores, then take the geometric mean (so any single wide gap
   drags the whole chain down). */
function causalCoherence(inv: Investigation): { value: number; note: string } {
  const chain = inv.causal_chain;
  if (chain.length === 0) return { value: 0.5, note: "no chain attached" };
  if (chain.length === 1) return { value: 0.9, note: "single anchor event" };

  const gaps: number[] = [];
  for (let i = 1; i < chain.length; i++) {
    const t1 = Date.parse(chain[i - 1]!.usc_temporal);
    const t2 = Date.parse(chain[i]!.usc_temporal);
    const dtSec = Math.abs(t2 - t1) / 1000;
    // Logistic-ish: 0s → 1.0, 60s → 0.5, 600s → ~0.09. Reasonable for SOC events.
    const score = 1 / (1 + dtSec / 60);
    gaps.push(score);
  }
  const value = geomean(gaps);
  return {
    value,
    note: `${chain.length} events, geometric mean of ${gaps.length} link scores`,
  };
}

/* Recall match strength — average vector-search similarity of any past
   investigations the agent surfaced as analogous. Strong recall increases
   confidence; absent recall is neutral, not penalizing. */
function recallStrength(inv: Investigation): { value: number; note: string } {
  if (inv.similar_past_investigations.length === 0) {
    return { value: 0.85, note: "no past matches above threshold (neutral)" };
  }
  const value = average(inv.similar_past_investigations.map((s) => s.similarity));
  return {
    value,
    note: `mean of ${inv.similar_past_investigations.length} past investigation${
      inv.similar_past_investigations.length === 1 ? "" : "s"
    }`,
  };
}

/* Action grounding — fraction of recommended actions whose text references a
   real artifact (ctx://) or event/investigation id. Untraced actions reduce
   the score. */
function actionGrounding(inv: Investigation): { value: number; note: string } {
  if (inv.actions_recommended.length === 0) {
    return { value: 0.5, note: "no actions surfaced" };
  }
  const cited = inv.actions_recommended.filter((a) =>
    /(ctx:\/\/|evt_[a-f0-9]{6,}|inv_[a-z0-9_]{6,})/i.test(a.action),
  ).length;
  const baseline = 0.6;
  const value = baseline + (1 - baseline) * (cited / inv.actions_recommended.length);
  return {
    value,
    note: `${cited}/${inv.actions_recommended.length} actions cite specific evidence`,
  };
}

export function computeConfidenceBreakdown(inv: Investigation): ConfidenceBreakdown {
  const causal = causalCoherence(inv);
  const recall = recallStrength(inv);
  const grounding = actionGrounding(inv);

  const estimated = clamp01(
    W_CAUSAL * causal.value + W_RECALL * recall.value + W_GROUNDING * grounding.value,
  );

  return {
    stored: inv.confidence,
    estimated,
    components: [
      {
        key: "causal",
        label: "Causal chain coherence",
        value: clamp01(causal.value),
        weight: W_CAUSAL,
        note: causal.note,
      },
      {
        key: "recall",
        label: "Recall match strength",
        value: clamp01(recall.value),
        weight: W_RECALL,
        note: recall.note,
      },
      {
        key: "grounding",
        label: "Action grounding",
        value: clamp01(grounding.value),
        weight: W_GROUNDING,
        note: grounding.note,
      },
    ],
    formula: `${W_CAUSAL.toFixed(2)} · causal + ${W_RECALL.toFixed(2)} · recall + ${W_GROUNDING.toFixed(2)} · grounding`,
  };
}
