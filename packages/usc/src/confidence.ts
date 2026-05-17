/**
 * Confidence aggregation — whitepaper §4.3:
 *
 *   C_answer = ( ∏ᵢ C(pᵢ, Q) )^(1/n)
 *
 * The geometric mean is the simplest defensible aggregation when matched
 * primitives are independent evidence. Whitepaper acknowledges that more
 * sophisticated forms apply for causal chains and partial redundancy — see
 * docs/pipeline-plan.md and reference_usc_whitepaper for the open question.
 *
 * Properties:
 *   - 0 ≤ C_answer ≤ 1
 *   - A single 0 in the input drives the result to 0 (no over-claim)
 *   - Empty input returns 0 (no evidence = no confidence)
 */

export function aggregateConfidence(scores: readonly number[]): number {
  if (scores.length === 0) return 0;
  if (scores.some((s) => s === 0)) return 0;

  // Use log-sum to avoid underflow when many small probabilities multiply
  let logSum = 0;
  for (const s of scores) {
    if (s < 0 || s > 1) {
      throw new RangeError(`aggregateConfidence: score out of [0,1]: ${s}`);
    }
    logSum += Math.log(s);
  }
  return Math.exp(logSum / scores.length);
}
