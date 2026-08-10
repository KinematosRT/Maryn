/**
 * Runs every task against every posture.
 *
 * One task gets one temporary store and one server process. That costs a few
 * seconds over the whole suite and buys the property that matters: no task can
 * pass or fail because of what another task did before it.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import { seedContextRepo } from "./corpus.js";
import { MarynSession } from "./session.js";
import { failureRate, scoreScanner } from "./statistics.js";
import type {
  ConfigReport,
  EvalConfig,
  FamilyScore,
  FixtureOutcome,
  GoldenTask,
  SuiteReport,
  TaskFamily,
  TaskResult,
} from "./types.js";

const FAMILIES: TaskFamily[] = ["retrieval", "injection", "scanner"];

export interface RunOptions {
  /** Called after each task so a long run reports progress as it goes. */
  onTaskComplete?: (config: EvalConfig, result: TaskResult) => void;
}

async function runTask(
  task: GoldenTask,
  config: EvalConfig,
  fixtures: Map<string, FixtureOutcome>,
): Promise<TaskResult> {
  const store = await mkdtemp(join(tmpdir(), `maryn-golden-${task.id.toLowerCase()}-`));
  const started = Date.now();
  let passed = true;
  let detail = "ok";
  let session: MarynSession | undefined;

  try {
    await seedContextRepo(store);
    session = await MarynSession.start(store, config.env);

    await task.run({
      session,
      config,
      recordFixture(outcome) {
        const seen = fixtures.get(outcome.fixture);
        if (seen && seen.blocked !== outcome.blocked) {
          throw new Error(
            `fixture ${outcome.fixture} was decided both ways across tasks`,
          );
        }
        fixtures.set(outcome.fixture, outcome);
      },
    });
  } catch (err) {
    passed = false;
    detail = err instanceof Error ? err.message : String(err);
  } finally {
    await session?.close().catch(() => {});
    await rm(store, { recursive: true, force: true }).catch(() => {});
  }

  return {
    id: task.id,
    family: task.family,
    title: task.title,
    claim: task.claim,
    passed,
    detail,
    durationMs: Date.now() - started,
  };
}

function scoreFamilies(results: TaskResult[]): FamilyScore[] {
  return FAMILIES.map((family) => {
    const inFamily = results.filter((result) => result.family === family);
    return {
      family,
      passed: inFamily.filter((result) => result.passed).length,
      total: inFamily.length,
    };
  });
}

async function runConfig(
  tasks: GoldenTask[],
  config: EvalConfig,
  options: RunOptions,
): Promise<ConfigReport> {
  const fixtures = new Map<string, FixtureOutcome>();
  const results: TaskResult[] = [];

  for (const task of tasks) {
    const result = await runTask(task, config, fixtures);
    results.push(result);
    options.onTaskComplete?.(config, result);
  }

  const passed = results.filter((result) => result.passed).length;
  const outcomes = [...fixtures.values()].sort((a, b) => a.fixture.localeCompare(b.fixture));

  return {
    config,
    results,
    passed,
    total: results.length,
    passRate: results.length === 0 ? 0 : passed / results.length,
    families: scoreFamilies(results),
    fixtureOutcomes: outcomes,
    scanner: scoreScanner(outcomes),
    residual: failureRate(results.length - passed, results.length),
  };
}

async function codeUnderTest(): Promise<{ revision: string; clean: boolean }> {
  try {
    const git = simpleGit();
    const revision = (await git.revparse(["--short", "HEAD"])).trim();
    return { revision, clean: (await git.status()).isClean() };
  } catch {
    return { revision: "unknown", clean: false };
  }
}

export async function runSuite(
  tasks: GoldenTask[],
  configs: EvalConfig[],
  options: RunOptions = {},
): Promise<SuiteReport> {
  const reports: ConfigReport[] = [];
  for (const config of configs) {
    reports.push(await runConfig(tasks, config, options));
  }

  const trials = reports.reduce((sum, report) => sum + report.total, 0);
  const failures = reports.reduce((sum, report) => sum + (report.total - report.passed), 0);

  const code = await codeUnderTest();

  return {
    generatedAt: new Date().toISOString(),
    revision: code.revision,
    workingTreeClean: code.clean,
    taskCount: tasks.length,
    configs: reports,
    pooled: failureRate(failures, trials),
    pooledScanner: scoreScanner(reports.flatMap((report) => report.fixtureOutcomes)),
  };
}
