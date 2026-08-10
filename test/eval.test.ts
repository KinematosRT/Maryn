import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_PATHS,
  ARCHITECTURE_CHAR_LIMIT,
  ARCHITECTURE_TAIL,
  CORPUS,
  PINNED_PATHS,
  SEARCH_CASES,
  UNPINNED_PATHS,
  corpusFile,
} from "../src/eval/corpus.js";
import { BENIGN_IDS, SECRET_FIXTURES, SECRET_IDS, WARN_TIER_IDS } from "../src/eval/fixtures.js";
import { EVAL_CONFIGS } from "../src/eval/configs.js";
import { GOLDEN_TASKS } from "../src/eval/tasks/index.js";
import { renderSummary, renderVerdict } from "../src/eval/report.js";
import {
  confusionOf,
  failureRate,
  percent,
  scoreScanner,
  wilsonUpperBound,
} from "../src/eval/statistics.js";
import type { ConfigReport, FixtureOutcome, SuiteReport } from "../src/eval/types.js";

describe("failure rate statistics", () => {
  it("bounds a clean run above zero", () => {
    assert.ok(Math.abs(wilsonUpperBound(0, 20) - 0.11916) < 1e-4);
    assert.ok(Math.abs(wilsonUpperBound(1, 40) - 0.10459) < 1e-4);
  });

  it("never reports a bound below the observed rate", () => {
    for (const trials of [1, 5, 20, 40, 500]) {
      for (const failures of [0, 1, Math.floor(trials / 2), trials]) {
        assert.ok(
          wilsonUpperBound(failures, trials) >= failures / trials,
          `bound below observation at ${failures}/${trials}`,
        );
      }
    }
  });

  it("grows with the number of failures and shrinks with evidence", () => {
    assert.ok(wilsonUpperBound(0, 20) < wilsonUpperBound(1, 20));
    assert.ok(wilsonUpperBound(0, 200) < wilsonUpperBound(0, 20));
  });

  it("claims nothing without trials", () => {
    assert.equal(wilsonUpperBound(0, 0), 1);
    assert.equal(failureRate(0, 0).observed, 0);
  });

  it("rejects impossible counts", () => {
    assert.throws(() => wilsonUpperBound(3, 2), RangeError);
    assert.throws(() => wilsonUpperBound(-1, 2), RangeError);
    assert.throws(() => wilsonUpperBound(1.5, 2), RangeError);
  });

  it("reports the rate alongside its bound", () => {
    const rate = failureRate(1, 20);

    assert.deepEqual(
      { trials: rate.trials, failures: rate.failures, observed: rate.observed },
      { trials: 20, failures: 1, observed: 0.05 },
    );
    assert.ok(rate.upperBound95 > rate.observed);
  });

  it("formats a rate as a percentage", () => {
    assert.equal(percent(0.119157), "11.9%");
    assert.equal(percent(1, 0), "100%");
  });
});

describe("scanner scoring", () => {
  const outcome = (fixture: string, secret: boolean, blocked: boolean): FixtureOutcome => ({
    fixture,
    secret,
    blocked,
  });

  it("counts each quadrant", () => {
    const confusion = confusionOf([
      outcome("a", true, true),
      outcome("b", true, false),
      outcome("c", false, true),
      outcome("d", false, false),
    ]);

    assert.deepEqual(confusion, {
      truePositives: 1,
      falsePositives: 1,
      trueNegatives: 1,
      falseNegatives: 1,
    });
  });

  it("scores a perfect separation", () => {
    const score = scoreScanner([outcome("a", true, true), outcome("b", false, false)]);

    assert.equal(score.precision, 1);
    assert.equal(score.recall, 1);
    assert.equal(score.f1, 1);
    assert.equal(score.fixtures, 2);
  });

  it("penalises a wrongly refused write", () => {
    const score = scoreScanner([outcome("a", true, true), outcome("b", false, true)]);

    assert.equal(score.precision, 0.5);
    assert.equal(score.recall, 1);
  });

  it("penalises a missed credential", () => {
    const score = scoreScanner([outcome("a", true, false), outcome("b", true, true)]);

    assert.equal(score.precision, 1);
    assert.equal(score.recall, 0.5);
  });

  it("scores an empty sample as vacuous rather than failing", () => {
    const score = scoreScanner([]);

    assert.equal(score.precision, 1);
    assert.equal(score.recall, 1);
    assert.equal(score.fixtures, 0);
  });
});

describe("task catalogue", () => {
  it("holds twenty tasks with unique identifiers", () => {
    const ids = GOLDEN_TASKS.map((task) => task.id);

    assert.equal(GOLDEN_TASKS.length, 20);
    assert.equal(new Set(ids).size, 20);
  });

  it("covers each family", () => {
    const counted = (family: string) =>
      GOLDEN_TASKS.filter((task) => task.family === family).length;

    assert.equal(counted("retrieval"), 9);
    assert.equal(counted("injection"), 7);
    assert.equal(counted("scanner"), 4);
  });

  it("states a title and a claim for every task", () => {
    for (const task of GOLDEN_TASKS) {
      assert.ok(task.title.length > 0, `${task.id} has no title`);
      assert.ok(task.claim.length > 0, `${task.id} has no claim`);
      assert.equal(typeof task.run, "function");
    }
  });

  it("runs two postures that differ by one setting", () => {
    const ids = EVAL_CONFIGS.map((config) => config.id);

    assert.equal(new Set(ids).size, EVAL_CONFIGS.length);
    assert.equal(EVAL_CONFIGS.filter((config) => config.enforcing).length, 1);
    assert.deepEqual(Object.keys(EVAL_CONFIGS[0].env), []);
    assert.deepEqual(Object.keys(EVAL_CONFIGS[1].env), ["SYSTEM_WRITE_KEY"]);
  });
});

describe("seeded corpus", () => {
  it("keeps ground truth consistent with the bytes on disk", () => {
    for (const file of CORPUS) {
      assert.ok(file.raw.includes(file.description), `${file.path} lost its description`);
      if (file.body) {
        assert.ok(file.raw.includes(file.body), `${file.path} lost its body`);
      }
      for (const tag of file.tags) {
        assert.ok(file.raw.includes(tag), `${file.path} lost tag ${tag}`);
      }
    }
  });

  it("partitions pinned records by location", () => {
    assert.deepEqual(PINNED_PATHS, ALL_PATHS.filter((path) => path.startsWith("system/")));
    assert.deepEqual(
      [...PINNED_PATHS, ...UNPINNED_PATHS].sort(),
      [...ALL_PATHS].sort(),
    );
    assert.ok(PINNED_PATHS.length > 0 && UNPINNED_PATHS.length > 0);
  });

  it("declares a budget that actually truncates", () => {
    const architecture = corpusFile("system/architecture.md");
    const body = architecture.body ?? "";

    assert.ok(body.length > ARCHITECTURE_CHAR_LIMIT);
    assert.ok(body.slice(0, ARCHITECTURE_CHAR_LIMIT).includes(ARCHITECTURE_TAIL) === false);
    assert.ok(body.includes(ARCHITECTURE_TAIL));
  });

  it("expects only paths that exist, plus one query that matches nothing", () => {
    for (const testCase of SEARCH_CASES) {
      for (const path of testCase.expected) {
        assert.ok(ALL_PATHS.includes(path), `${testCase.query} expects unknown ${path}`);
      }
    }
    assert.equal(SEARCH_CASES.filter((testCase) => testCase.expected.length === 0).length, 1);
    assert.ok(SEARCH_CASES.some((testCase) => testCase.query.split(" ").length > 1));
  });
});

describe("scanner fixtures", () => {
  it("gives every fixture exactly one group", () => {
    const grouped = [...SECRET_IDS, ...BENIGN_IDS, ...WARN_TIER_IDS];

    assert.equal(new Set(grouped).size, grouped.length);
    assert.deepEqual(grouped.sort(), SECRET_FIXTURES.map((entry) => entry.id).sort());
  });

  it("labels warn tier and documentation payloads as writable", () => {
    for (const id of [...BENIGN_IDS, ...WARN_TIER_IDS]) {
      const entry = SECRET_FIXTURES.find((candidate) => candidate.id === id);
      assert.equal(entry?.secret, false, `${id} should not count as a credential`);
    }
  });

  it("keeps both sides of the line populated", () => {
    assert.ok(SECRET_IDS.length >= 8);
    assert.ok(BENIGN_IDS.length + WARN_TIER_IDS.length >= 8);
    for (const entry of SECRET_FIXTURES) {
      assert.ok(entry.note.length > 0, `${entry.id} has no note`);
      assert.ok(entry.content.length > 0, `${entry.id} has no content`);
    }
  });
});

describe("verdict rendering", () => {
  const configReport = (
    id: string,
    enforcing: boolean,
    failing: string[],
  ): ConfigReport => {
    const results = GOLDEN_TASKS.map((task) => ({
      id: task.id,
      family: task.family,
      title: task.title,
      claim: task.claim,
      passed: !failing.includes(task.id),
      detail: failing.includes(task.id) ? "observed the wrong behaviour" : "ok",
      durationMs: 5,
    }));
    const outcomes: FixtureOutcome[] = SECRET_FIXTURES.map((entry) => ({
      fixture: entry.id,
      secret: entry.secret,
      blocked: entry.secret,
    }));
    const passed = results.filter((result) => result.passed).length;

    return {
      config: {
        id,
        title: id,
        summary: `${id} posture`,
        env: {},
        enforcing,
        recommendation: enforcing ? "Set the write key." : undefined,
      },
      results,
      passed,
      total: results.length,
      passRate: passed / results.length,
      families: [
        { family: "retrieval", passed: 9, total: 9 },
        { family: "injection", passed: 7 - failing.length, total: 7 },
        { family: "scanner", passed: 4, total: 4 },
      ],
      fixtureOutcomes: outcomes,
      scanner: scoreScanner(outcomes),
      residual: failureRate(failing.length, results.length),
    };
  };

  const report: SuiteReport = {
    generatedAt: "2026-03-14T09:00:00.000Z",
    revision: "abc1234",
    workingTreeClean: true,
    taskCount: GOLDEN_TASKS.length,
    configs: [configReport("default", false, ["I6"]), configReport("guarded", true, [])],
    pooled: failureRate(1, 40),
    pooledScanner: scoreScanner([]),
  };

  it("carries the numbers the run produced", () => {
    const verdict = renderVerdict(report);

    assert.ok(verdict.includes("abc1234"));
    assert.ok(!verdict.includes("uncommitted"));
    assert.ok(renderVerdict({ ...report, workingTreeClean: false }).includes("uncommitted"));
    assert.ok(verdict.includes("19/20"));
    assert.ok(verdict.includes("20/20"));
    assert.ok(verdict.includes(percent(failureRate(0, 20).upperBound95)));
    assert.ok(verdict.includes(percent(failureRate(1, 40).upperBound95)));
  });

  it("names every failing task once", () => {
    const verdict = renderVerdict(report);
    const rows = verdict.split("\n").filter((line) => line.startsWith("| I6 |"));

    assert.equal(rows.length, 1);
    assert.ok(rows[0].includes("observed the wrong behaviour"));
  });

  it("keeps the required sections", () => {
    const verdict = renderVerdict(report);

    for (const heading of [
      "## Bottom line",
      "## What was measured",
      "## Configurations",
      "## Pass rate by family",
      "## Secret scanner on seeded fixtures",
      "## Failures",
      "## Residual failure rate",
      "## What this verdict does not cover",
    ]) {
      assert.ok(verdict.includes(heading), `missing section ${heading}`);
    }
  });

  it("carries the advice of the stricter posture when it scores higher", () => {
    assert.ok(renderVerdict(report).includes("Set the write key."));

    const tied: SuiteReport = {
      ...report,
      configs: [configReport("default", false, []), configReport("guarded", true, [])],
    };
    assert.ok(!renderVerdict(tied).includes("Set the write key."));
  });

  it("says so plainly when nothing failed", () => {
    const clean: SuiteReport = {
      ...report,
      configs: [configReport("guarded", true, [])],
      pooled: failureRate(0, 20),
    };

    assert.ok(renderVerdict(clean).includes("No task failed"));
  });

  it("summarises the run in a few lines", () => {
    const summary = renderSummary(report);

    assert.ok(summary.includes("default"));
    assert.ok(summary.includes("guarded"));
    assert.ok(summary.includes("residual upper bound"));
  });
});
