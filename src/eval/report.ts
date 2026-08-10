/**
 * Renders the one page verdict. Everything on the page comes from the run, so
 * the numbers cannot drift away from what the suite actually observed.
 */

import { ALL_PATHS } from "./corpus.js";
import { percent } from "./statistics.js";
import type { ConfigReport, ScannerScore, SuiteReport } from "./types.js";

const FAMILY_LABEL: Record<string, string> = {
  retrieval: "Retrieval correctness",
  injection: "Injection resistance",
  scanner: "Secret scanner",
};

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function table(rows: string[][]): string {
  const [header, ...body] = rows;
  const divider = header.map(() => "---");
  return [header, divider, ...body].map((row) => `| ${row.join(" | ")} |`).join("\n");
}

function scannerRow(label: string, score: ScannerScore): string[] {
  return [
    label,
    String(score.fixtures),
    percent(score.precision),
    percent(score.recall),
    score.f1.toFixed(3),
    String(score.falsePositives),
    String(score.falseNegatives),
  ];
}

function failingIds(report: ConfigReport): string[] {
  return report.results.filter((result) => !result.passed).map((result) => result.id);
}

function failuresOf(report: ConfigReport): string[][] {
  return report.results
    .filter((result) => !result.passed)
    .map((result) => [
      result.id,
      report.config.id,
      result.title,
      result.detail.replace(/\s+/g, " ").slice(0, 160),
    ]);
}

export function renderVerdict(report: SuiteReport): string {
  const configs = report.configs;
  const enforcing = configs.find((entry) => entry.config.enforcing) ?? configs[0];
  const failures = configs.flatMap(failuresOf);
  const lines: string[] = [];

  lines.push("# Verdict: Maryn MCP surface, golden task run");
  lines.push("");
  lines.push(
    `Run ${report.generatedAt} against revision \`${report.revision}\`` +
      `${report.workingTreeClean ? "" : " plus uncommitted changes"}. ` +
      `${report.taskCount} tasks, ${configs.length} configurations, ${report.pooled.trials} trials.`,
  );
  lines.push("");

  lines.push("## Bottom line");
  lines.push("");
  const standing = configs.map(
    (entry) =>
      `\`${entry.config.id}\` passed ${entry.passed} of ${entry.total}` +
      (entry.passed === entry.total
        ? ""
        : ` and failed ${failingIds(entry).join(", ")}`),
  );
  lines.push(
    `${standing.join(". ")}. The suite supports a residual failure rate of at most ` +
      `${percent(enforcing.residual.upperBound95)} for \`${enforcing.config.id}\`, at 95% one sided confidence.`,
  );
  if (enforcing.config.recommendation && configs.some((entry) => entry.passed < enforcing.passed)) {
    lines.push("");
    lines.push(enforcing.config.recommendation);
  }
  lines.push("");

  lines.push("## What was measured");
  lines.push("");
  lines.push(
    "Every task drives the server over stdio through the same tool calls a client uses, " +
      "against a freshly seeded store with known contents and known history. Tasks cover " +
      "retrieval correctness, resistance to hostile input, and the secret scanner decision " +
      "at the write boundary. Each task runs in its own store and its own server process.",
  );
  lines.push("");

  lines.push("## Configurations");
  lines.push("");
  lines.push(
    table([
      ["Configuration", "Setting under test", "Pass rate", "Passed"],
      ...configs.map((entry) => [
        `\`${entry.config.id}\``,
        entry.config.summary,
        percent(entry.passRate),
        `${entry.passed}/${entry.total}`,
      ]),
    ]),
  );
  lines.push("");

  lines.push("## Pass rate by family");
  lines.push("");
  const familyIds = enforcing.families.map((family) => family.family);
  lines.push(
    table([
      ["Family", ...configs.map((entry) => `\`${entry.config.id}\``)],
      ...familyIds.map((family) => [
        FAMILY_LABEL[family] ?? family,
        ...configs.map((entry) => {
          const score = entry.families.find((item) => item.family === family);
          return score ? `${score.passed}/${score.total}` : "0/0";
        }),
      ]),
    ]),
  );
  lines.push("");

  lines.push("## Secret scanner on seeded fixtures");
  lines.push("");
  lines.push(
    table([
      ["Scope", "Fixtures", "Precision", "Recall", "F1", "False positives", "False negatives"],
      ...configs.map((entry) => scannerRow(`\`${entry.config.id}\``, entry.scanner)),
      scannerRow("pooled", report.pooledScanner),
    ]),
  );
  lines.push("");

  lines.push("## Failures");
  lines.push("");
  if (failures.length === 0) {
    lines.push("No task failed in either configuration.");
  } else {
    lines.push(
      table([["Task", "Configuration", "Title", "Observation"], ...failures]),
    );
  }
  lines.push("");

  lines.push("## Residual failure rate");
  lines.push("");
  for (const entry of configs) {
    lines.push(
      `- \`${entry.config.id}\`: ${plural(entry.residual.failures, "failure")} in ` +
        `${plural(entry.residual.trials, "task")}, observed ${percent(entry.residual.observed)}, ` +
        `upper bound ${percent(entry.residual.upperBound95)} at 95% one sided confidence.`,
    );
  }
  lines.push(
    `- pooled: ${plural(report.pooled.failures, "failure")} in ` +
      `${plural(report.pooled.trials, "trial")}, observed ${percent(report.pooled.observed)}, ` +
      `upper bound ${percent(report.pooled.upperBound95)}.`,
  );
  lines.push("");
  lines.push(
    `The number worth defending is the bound, not the observed rate. For the \`${enforcing.config.id}\` ` +
      `configuration the suite supports a residual failure rate of at most ` +
      `${percent(enforcing.residual.upperBound95)} across the behaviours it covers. A twenty task suite ` +
      "cannot demonstrate zero, and the bound is what twenty trials can carry.",
  );
  lines.push("");

  lines.push("## What this verdict does not cover");
  lines.push("");
  lines.push(
    "- Scanner precision and recall are measured against a curated fixture set. They bound rule " +
      "coverage for the credential families in that set and say nothing about families absent from it.",
  );
  lines.push(
    "- Sandbox execution tools are out of scope; the suite runs without a sandbox key, so those " +
      "tools stay inert.",
  );
  lines.push(
    "- Remote stores are out of scope. Every run uses a local store, so clone, pull and push " +
      "behaviour is untested here.",
  );
  lines.push(
    `- Retrieval is scored against a store of ${ALL_PATHS.length} records. Behaviour at scale, ` +
      "ranking across large stores and many concurrent readers are not part of this run.",
  );
  lines.push("");

  return lines.join("\n");
}

export function renderSummary(report: SuiteReport): string {
  const lines = report.configs.map(
    (entry) =>
      `${entry.config.id.padEnd(8)} ${entry.passed}/${entry.total} passed ` +
      `(${percent(entry.passRate)}), scanner precision ${percent(entry.scanner.precision)} ` +
      `recall ${percent(entry.scanner.recall)}`,
  );
  lines.push(
    `pooled   ${report.pooled.failures} failures in ${report.pooled.trials} trials, ` +
      `residual upper bound ${percent(report.pooled.upperBound95)}`,
  );
  return lines.join("\n");
}
