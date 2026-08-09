# Verdict: Maryn MCP surface, golden task run

Run 2026-08-09T20:34:57.875Z against revision `6e108dd`. 20 tasks, 2 configurations, 40 trials.

## Bottom line

`default` passed 19 of 20 and failed I6. `guarded` passed 20 of 20. The suite supports a residual failure rate of at most 11.9% for `guarded`, at 95% one sided confidence.

Set SYSTEM_WRITE_KEY on any deployment whose pinned records have to hold against an unauthenticated caller.

## What was measured

Every task drives the server over stdio through the same tool calls a client uses, against a freshly seeded store with known contents and known history. Tasks cover retrieval correctness, resistance to hostile input, and the secret scanner decision at the write boundary. Each task runs in its own store and its own server process.

## Configurations

| Configuration | Setting under test | Pass rate | Passed |
| --- | --- | --- | --- |
| `default` | Server started as the quickstart describes, with no write key configured. | 95.0% | 19/20 |
| `guarded` | Server started with SYSTEM_WRITE_KEY set, so pinned records need an authenticated write. | 100.0% | 20/20 |

## Pass rate by family

| Family | `default` | `guarded` |
| --- | --- | --- |
| Retrieval correctness | 9/9 | 9/9 |
| Injection resistance | 6/7 | 7/7 |
| Secret scanner | 4/4 | 4/4 |

## Secret scanner on seeded fixtures

| Scope | Fixtures | Precision | Recall | F1 | False positives | False negatives |
| --- | --- | --- | --- | --- | --- | --- |
| `default` | 20 | 100.0% | 100.0% | 1.000 | 0 | 0 |
| `guarded` | 20 | 100.0% | 100.0% | 1.000 | 0 | 0 |
| pooled | 40 | 100.0% | 100.0% | 1.000 | 0 | 0 |

## Failures

| Task | Configuration | Title | Observation |
| --- | --- | --- | --- |
| I6 | default | pinned context refuses unauthenticated changes | pinned record was rewritten without a write key |

## Residual failure rate

- `default`: 1 failure in 20 tasks, observed 5.0%, upper bound 19.6% at 95% one sided confidence.
- `guarded`: 0 failures in 20 tasks, observed 0.0%, upper bound 11.9% at 95% one sided confidence.
- pooled: 1 failure in 40 trials, observed 2.5%, upper bound 10.5%.

The number worth defending is the bound, not the observed rate. For the `guarded` configuration the suite supports a residual failure rate of at most 11.9% across the behaviours it covers. A twenty task suite cannot demonstrate zero, and the bound is what twenty trials can carry.

## What this verdict does not cover

- Scanner precision and recall are measured against a curated fixture set. They bound rule coverage for the credential families in that set and say nothing about families absent from it.
- Sandbox execution tools are out of scope; the suite runs without a sandbox key, so those tools stay inert.
- Remote stores are out of scope. Every run uses a local store, so clone, pull and push behaviour is untested here.
- Retrieval is scored against a store of 8 records. Behaviour at scale, ranking across large stores and many concurrent readers are not part of this run.

