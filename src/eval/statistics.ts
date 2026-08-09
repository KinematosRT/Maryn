/**
 * Scoring helpers. Rates are reported with an upper confidence bound because a
 * suite of twenty tasks cannot demonstrate a failure rate of zero.
 */

import type { Confusion, FailureRate, FixtureOutcome, ScannerScore } from "./types.js";

/** Normal quantile for a one sided 95% bound. */
export const Z_95 = 1.6448536269514722;

/**
 * Wilson score upper bound for a binomial proportion. Chosen over the normal
 * approximation because it stays meaningful when no failure was observed.
 */
export function wilsonUpperBound(failures: number, trials: number, z = Z_95): number {
  if (!Number.isInteger(failures) || !Number.isInteger(trials)) {
    throw new RangeError("failures and trials must be integers");
  }
  if (trials < 0 || failures < 0 || failures > trials) {
    throw new RangeError(`invalid counts: ${failures} failures in ${trials} trials`);
  }
  if (trials === 0) return 1;

  const p = failures / trials;
  const denominator = 1 + (z * z) / trials;
  const center = (p + (z * z) / (2 * trials)) / denominator;
  const spread =
    (z * Math.sqrt((p * (1 - p)) / trials + (z * z) / (4 * trials * trials))) / denominator;

  // The bound sits above the observed rate by construction; the clamp keeps
  // that true at the ends of the range, where rounding would breach it.
  return Math.min(1, Math.max(p, center + spread));
}

export function failureRate(failures: number, trials: number): FailureRate {
  return {
    trials,
    failures,
    observed: trials === 0 ? 0 : failures / trials,
    upperBound95: wilsonUpperBound(failures, trials),
  };
}

export function confusionOf(outcomes: FixtureOutcome[]): Confusion {
  const confusion: Confusion = {
    truePositives: 0,
    falsePositives: 0,
    trueNegatives: 0,
    falseNegatives: 0,
  };

  for (const outcome of outcomes) {
    if (outcome.secret && outcome.blocked) confusion.truePositives++;
    else if (outcome.secret) confusion.falseNegatives++;
    else if (outcome.blocked) confusion.falsePositives++;
    else confusion.trueNegatives++;
  }

  return confusion;
}

/** Ratio helper. An empty denominator scores 1 because nothing was got wrong. */
function ratio(hits: number, total: number): number {
  return total === 0 ? 1 : hits / total;
}

export function scoreScanner(outcomes: FixtureOutcome[]): ScannerScore {
  const confusion = confusionOf(outcomes);
  const precision = ratio(
    confusion.truePositives,
    confusion.truePositives + confusion.falsePositives,
  );
  const recall = ratio(
    confusion.truePositives,
    confusion.truePositives + confusion.falseNegatives,
  );
  const f1 =
    precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  return { ...confusion, fixtures: outcomes.length, precision, recall, f1 };
}

export function percent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}
