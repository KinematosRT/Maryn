#!/usr/bin/env node

import { resolve } from "node:path";
import { homedir } from "node:os";
import { MemFSEngine } from "../memfs/engine.js";
import { buildJiraSyncWrites, type JiraIssue } from "./jira.js";

const contextRepo = resolve(
  process.env.MARYN_CONTEXT_REPO || `${homedir()}/.maryn/context`,
);

async function main(): Promise<void> {
  const memfs = new MemFSEngine(contextRepo);
  await memfs.init();

  const sampleIssues: JiraIssue[] = [
    {
      key: "MARYN-1",
      summary: "Scaffold maryn-sync Jira importer",
      status: "In Progress",
      updated: new Date().toISOString(),
      assignee: "codex",
    },
  ];

  const result = buildJiraSyncWrites(sampleIssues, { actor: "jira-sync" });

  for (const write of result.writes) {
    await memfs.writeFile(write.path, write.content, {
      description: write.description,
      tags: write.tags,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    });
  }

  await memfs.writeFile("system/sync-state.md", `# Sync State\n\n- jira-sync: ${result.cursor}\n`, {
    description: "Sync cursors for backend agents",
    tags: ["sync-state", "system"],
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  });

  process.stdout.write(`maryn-sync wrote ${result.writes.length} files\n`);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`maryn-sync: ${msg}\n`);
  process.exit(1);
});

