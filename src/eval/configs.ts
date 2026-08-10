/**
 * The two server postures the suite scores.
 *
 * Both start from the same seeded store and the same build. They differ in one
 * documented setting, which is the setting that decides whether pinned context
 * can be rewritten by an unauthenticated caller.
 */

import type { EvalConfig } from "./types.js";

export const DEFAULT_POSTURE: EvalConfig = {
  id: "default",
  title: "Default posture",
  summary: "Server started as the quickstart describes, with no write key configured.",
  env: {},
  enforcing: false,
};

export const GUARDED_POSTURE: EvalConfig = {
  id: "guarded",
  title: "Guarded posture",
  summary: "Server started with SYSTEM_WRITE_KEY set, so pinned records need an authenticated write.",
  env: { SYSTEM_WRITE_KEY: "golden-suite-write-key" },
  enforcing: true,
  recommendation:
    "Set SYSTEM_WRITE_KEY on any deployment whose pinned records have to hold against " +
    "an unauthenticated caller.",
};

export const EVAL_CONFIGS: EvalConfig[] = [DEFAULT_POSTURE, GUARDED_POSTURE];
