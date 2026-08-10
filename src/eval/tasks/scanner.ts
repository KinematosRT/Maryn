/**
 * Secret scanner precision and recall, measured at the write boundary where the
 * rule set actually decides. Each fixture write is recorded, so the runner can
 * build a confusion table alongside the pass or fail of the task itself.
 */

import { BENIGN_IDS, SECRET_IDS, WARN_TIER_IDS, fixture } from "../fixtures.js";
import { check } from "../expect.js";
import { listDir, readLog, readTree, writeMemory } from "../surface.js";
import type { GoldenTask, TaskContext } from "../types.js";

const FIXTURE_DIR = "reference/fixtures";

function fixturePath(id: string): string {
  return `${FIXTURE_DIR}/${id}.md`;
}

/** Writes one fixture, records the decision and reports whether it was refused. */
async function attempt(ctx: TaskContext, id: string): Promise<boolean> {
  const entry = fixture(id);
  const reply = await writeMemory(ctx.session, {
    path: fixturePath(id),
    content: entry.content,
    description: `scanner fixture ${id}`,
  });

  const blocked = reply.isError && reply.text.includes("Sanitizer blocked");
  check(
    !reply.isError || blocked,
    `fixture ${id} failed for an unrelated reason: ${reply.text}`,
  );

  ctx.recordFixture({ fixture: id, secret: entry.secret, blocked });
  return blocked;
}

export const SCANNER_TASKS: GoldenTask[] = [
  {
    id: "S1",
    family: "scanner",
    title: "credential payloads are refused",
    claim: "Every seeded credential family is caught before it can be stored.",
    async run(ctx) {
      const missed: string[] = [];
      for (const id of SECRET_IDS) {
        if (!(await attempt(ctx, id))) missed.push(id);
      }
      check(missed.length === 0, `credentials accepted: ${missed.join(", ")}`);
    },
  },
  {
    id: "S2",
    family: "scanner",
    title: "documentation payloads are accepted",
    claim: "Placeholders, identifiers and prose about credentials do not block a write.",
    async run(ctx) {
      const refused: string[] = [];
      for (const id of BENIGN_IDS) {
        if (await attempt(ctx, id)) refused.push(id);
      }
      check(refused.length === 0, `documentation refused: ${refused.join(", ")}`);
    },
  },
  {
    id: "S3",
    family: "scanner",
    title: "warn tier data is recorded, not blocked",
    claim: "Personal data and network topology are flagged for review without stopping the write.",
    async run(ctx) {
      const refused: string[] = [];
      for (const id of WARN_TIER_IDS) {
        if (await attempt(ctx, id)) refused.push(id);
      }
      check(refused.length === 0, `warn tier payloads refused: ${refused.join(", ")}`);
    },
  },
  {
    id: "S4",
    family: "scanner",
    title: "a refused write leaves nothing behind",
    claim: "A refused credential appears in no record, no listing and no commit.",
    async run(ctx) {
      const id = "aws-access-key";
      const path = fixturePath(id);

      const blocked = await attempt(ctx, id);
      check(blocked, `fixture ${id} was accepted`);

      const tree = await readTree(ctx.session);
      check(!tree.files.includes(path), "refused write left a record in the store");

      const listing = await listDir(ctx.session, FIXTURE_DIR);
      check(!listing.includes(`${id}.md`), "refused write left a file in the listing");

      const log = await readLog(ctx.session, 50);
      const traced = log.filter((commit) => commit.message.includes(id));
      check(traced.length === 0, "refused write left a commit in history");
    },
  },
];
