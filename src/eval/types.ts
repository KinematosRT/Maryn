/**
 * Shared shapes for the golden task suite that scores Maryn's MCP surface.
 */

import type { MarynSession } from "./session.js";

export type TaskFamily = "retrieval" | "injection" | "scanner";

export interface EvalConfig {
  /** Short identifier used as a column heading in the report. */
  id: string;
  title: string;
  summary: string;
  /** Environment applied to the server process on top of a cleaned base. */
  env: Record<string, string>;
  /** When true, any failing task in this configuration fails the run. */
  enforcing: boolean;
  /** Advice printed on the verdict when this configuration outscores another. */
  recommendation?: string;
}

export interface FixtureOutcome {
  fixture: string;
  /** Ground truth: the payload carries a real credential. */
  secret: boolean;
  /** Observed: the sanitizer refused the write. */
  blocked: boolean;
}

export interface TaskContext {
  readonly session: MarynSession;
  readonly config: EvalConfig;
  /** Records one sanitizer decision so the runner can score precision and recall. */
  recordFixture(outcome: FixtureOutcome): void;
}

export interface GoldenTask {
  id: string;
  family: TaskFamily;
  title: string;
  /** The property asserted, written as a claim about the server. */
  claim: string;
  run(ctx: TaskContext): Promise<void>;
}

export interface TaskResult {
  id: string;
  family: TaskFamily;
  title: string;
  claim: string;
  passed: boolean;
  detail: string;
  durationMs: number;
}

export interface Confusion {
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
}

export interface ScannerScore extends Confusion {
  fixtures: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface FailureRate {
  trials: number;
  failures: number;
  observed: number;
  /** One sided 95% upper bound on the true failure rate. */
  upperBound95: number;
}

export interface FamilyScore {
  family: TaskFamily;
  passed: number;
  total: number;
}

export interface ConfigReport {
  config: EvalConfig;
  results: TaskResult[];
  passed: number;
  total: number;
  passRate: number;
  families: FamilyScore[];
  /** One entry per seeded fixture, kept so the confusion table stays auditable. */
  fixtureOutcomes: FixtureOutcome[];
  scanner: ScannerScore;
  residual: FailureRate;
}

export interface SuiteReport {
  generatedAt: string;
  revision: string;
  /** False when the run included changes that the revision does not carry. */
  workingTreeClean: boolean;
  taskCount: number;
  configs: ConfigReport[];
  pooled: FailureRate;
  pooledScanner: ScannerScore;
}
