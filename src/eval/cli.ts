#!/usr/bin/env node
/**
 * Runs the golden task suite and writes the run record and the verdict.
 *
 *   npm run eval              build, run, write to eval/
 *   npm run eval -- --out tmp write elsewhere
 *
 * Exit status is non zero when a task fails in an enforcing configuration.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { EVAL_CONFIGS } from "./configs.js";
import { renderSummary, renderVerdict } from "./report.js";
import { runSuite } from "./runner.js";
import { GOLDEN_TASKS } from "./tasks/index.js";

function outputDir(argv: string[]): string {
  const flag = argv.indexOf("--out");
  return resolve(flag === -1 ? "eval" : argv[flag + 1] ?? "eval");
}

async function main(): Promise<void> {
  const target = outputDir(process.argv.slice(2));

  process.stdout.write(
    `Running ${GOLDEN_TASKS.length} golden tasks against ${EVAL_CONFIGS.length} configurations.\n\n`,
  );

  const report = await runSuite(GOLDEN_TASKS, EVAL_CONFIGS, {
    onTaskComplete(config, result) {
      const mark = result.passed ? "pass" : "FAIL";
      process.stdout.write(
        `  ${config.id.padEnd(8)} ${result.id.padEnd(3)} ${mark}  ${result.title}\n`,
      );
      if (!result.passed) process.stdout.write(`           ${result.detail}\n`);
    },
  });

  await mkdir(target, { recursive: true });
  await writeFile(resolve(target, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  await writeFile(resolve(target, "VERDICT.md"), `${renderVerdict(report)}\n`, "utf-8");

  process.stdout.write(`\n${renderSummary(report)}\n`);
  process.stdout.write(`\nWritten: ${resolve(target, "report.json")}\n`);
  process.stdout.write(`Written: ${resolve(target, "VERDICT.md")}\n`);

  const blocking = report.configs.filter(
    (entry) => entry.config.enforcing && entry.passed < entry.total,
  );
  if (blocking.length > 0) {
    process.stdout.write(
      `\nEnforcing configuration failed: ${blocking.map((entry) => entry.config.id).join(", ")}\n`,
    );
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`golden suite: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
