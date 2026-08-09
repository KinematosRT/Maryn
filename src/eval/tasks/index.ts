import { INJECTION_TASKS } from "./injection.js";
import { RETRIEVAL_TASKS } from "./retrieval.js";
import { SCANNER_TASKS } from "./scanner.js";
import type { GoldenTask } from "../types.js";

/**
 * The twenty golden tasks. Each one runs against a freshly seeded store and a
 * freshly started server, so order carries no meaning and a failure points at
 * one behaviour only.
 */
export const GOLDEN_TASKS: GoldenTask[] = [
  ...RETRIEVAL_TASKS,
  ...INJECTION_TASKS,
  ...SCANNER_TASKS,
];

export { INJECTION_TASKS, RETRIEVAL_TASKS, SCANNER_TASKS };
