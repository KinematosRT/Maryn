/**
 * The seeded memory store every task runs against.
 *
 * Each entry carries the literal bytes written to disk and, separately, the
 * values a correct read has to return. Ground truth is written by hand rather
 * than produced by the engine under test, so a parsing regression cannot move
 * the expectation along with the behaviour.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { simpleGit } from "simple-git";

export interface CorpusFile {
  path: string;
  /** Exact file content written during seeding. */
  raw: string;
  description: string;
  tags: string[];
  /** Expected body of a markdown file, trimmed. */
  body?: string;
  /** Expected structured data of a YAML file. */
  data?: Record<string, unknown>;
}

/** Character budget declared by system/architecture.md. */
export const ARCHITECTURE_CHAR_LIMIT = 140;

/** Sentence that sits past the budget and must never survive truncation. */
export const ARCHITECTURE_TAIL = "Sandbox execution stays optional and stays out of the pinned budget.";

const ARCHITECTURE_BODY = [
  "The server publishes tools, resources and prompts over stdio.",
  "The engine reads and writes files, then records every change in git history.",
  ARCHITECTURE_TAIL,
].join("\n");

export const CORPUS: CorpusFile[] = [
  {
    path: "system/identity.md",
    raw: `---
description: Project identity and actor roles
tags:
  - system
  - identity
---

Maryn keeps engineering memory as a repository of markdown and YAML files.
Every actor writes through the same path convention.
`,
    description: "Project identity and actor roles",
    tags: ["system", "identity"],
    body:
      "Maryn keeps engineering memory as a repository of markdown and YAML files.\n" +
      "Every actor writes through the same path convention.",
  },
  {
    path: "system/conventions.md",
    raw: `---
description: Path conventions for journal and feature records
tags:
  - system
  - conventions
---

Journal entries live under journal/<date>/<actor>/.
Feature records live under features/<key>/status.md.
`,
    description: "Path conventions for journal and feature records",
    tags: ["system", "conventions"],
    body:
      "Journal entries live under journal/<date>/<actor>/.\n" +
      "Feature records live under features/<key>/status.md.",
  },
  {
    path: "system/architecture.md",
    raw: `---
description: Runtime shape of the server
char_limit: ${ARCHITECTURE_CHAR_LIMIT}
tags:
  - system
  - architecture
---

${ARCHITECTURE_BODY}
`,
    description: "Runtime shape of the server",
    tags: ["system", "architecture"],
    body: ARCHITECTURE_BODY,
  },
  {
    path: "reference/decision-0007.md",
    raw: `---
description: Storage approach for the audit trail
tags:
  - storage
---

We chose event sourcing so that every state change stays reconstructable.
`,
    description: "Storage approach for the audit trail",
    tags: ["storage"],
    body: "We chose event sourcing so that every state change stays reconstructable.",
  },
  {
    path: "reference/incident-2026-03-14.md",
    raw: `---
description: Gateway timeouts during the March window
tags:
  - incident
  - gateway
---

The gateway returned 504 responses while the connection pool was exhausted.
Raising the pool size restored service.
`,
    description: "Gateway timeouts during the March window",
    tags: ["incident", "gateway"],
    body:
      "The gateway returned 504 responses while the connection pool was exhausted.\n" +
      "Raising the pool size restored service.",
  },
  {
    path: "reference/glossary.yaml",
    raw: `description: Shared vocabulary for the memory store
tags:
  - reference
  - glossary
terms:
  pinned: Files under system/ that always enter the agent context.
  unpinned: Files retrieved on demand.
  actor: A person, an agent or a scheduled job that writes to the store.
`,
    description: "Shared vocabulary for the memory store",
    tags: ["reference", "glossary"],
    data: {
      terms: {
        pinned: "Files under system/ that always enter the agent context.",
        unpinned: "Files retrieved on demand.",
        actor: "A person, an agent or a scheduled job that writes to the store.",
      },
    },
  },
  {
    path: "journal/2026-03-14/opus/handoff.md",
    raw: `---
description: Session handoff notes
tags:
  - journal
  - handoff
---

The next session picks up the retrieval checks.
`,
    description: "Session handoff notes",
    tags: ["journal", "handoff"],
    body: "The next session picks up the retrieval checks.",
  },
  {
    path: "archive/decision-0002.md",
    raw: `---
description: Earlier storage approach, superseded and archived
tags:
  - archived
---

Replaced by decision 0007 once the audit trail became a requirement.
`,
    description: "Earlier storage approach, superseded and archived",
    tags: ["archived"],
    body: "Replaced by decision 0007 once the audit trail became a requirement.",
  },
];

export const ALL_PATHS = CORPUS.map((file) => file.path);
export const PINNED_PATHS = ALL_PATHS.filter((path) => path.startsWith("system/"));
export const UNPINNED_PATHS = ALL_PATHS.filter((path) => !path.startsWith("system/"));

export function corpusFile(path: string): CorpusFile {
  const file = CORPUS.find((entry) => entry.path === path);
  if (!file) throw new Error(`unknown corpus file: ${path}`);
  return file;
}

export interface SearchCase {
  query: string;
  /** Every path a correct search returns, and nothing else. */
  expected: string[];
  note: string;
}

/** Search terms are matched against path, body, description and tags. */
export const SEARCH_CASES: SearchCase[] = [
  {
    query: "sourcing",
    expected: ["reference/decision-0007.md"],
    note: "single term present in exactly one body",
  },
  {
    query: "decision",
    expected: ["reference/decision-0007.md", "archive/decision-0002.md"],
    note: "term carried by the path of two files",
  },
  {
    query: "decision archived",
    expected: ["archive/decision-0002.md"],
    note: "two terms, one from the path and one from a tag, joined by AND",
  },
  {
    query: "gateway pool",
    expected: ["reference/incident-2026-03-14.md"],
    note: "two terms from tag and body of the same file",
  },
  {
    query: "quantum ledger",
    expected: [],
    note: "absent terms return nothing rather than a nearest neighbour",
  },
];

/**
 * Writes the corpus into an empty directory and commits it, so the server
 * starts from a repository whose contents and history are known.
 */
export async function seedContextRepo(root: string): Promise<void> {
  for (const file of CORPUS) {
    const target = join(root, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.raw, "utf-8");
  }

  const git = simpleGit(root);
  await git.init();
  await git.addConfig("user.name", "maryn-golden-suite");
  await git.addConfig("user.email", "suite@maryn.invalid");
  await git.add(".");
  await git.commit("seed evaluation corpus");
}
