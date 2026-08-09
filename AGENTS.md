# AGENTS.md

Instructions for AI agents and human contributors working on the Maryn MCP server.

See [README.md](README.md) for product overview, architecture, and MCP surface.
Usage guides, decision records live in the Maryn context repo.

## Build & test

```bash
npm install
npm run build          # tsc
npm test               # unit tests
npm run test:e2e       # MCP protocol e2e
npm run eval           # 20 golden tasks over two postures, writes eval/
npm run dashboard      # dev dashboard (tsx src/dashboard/server.ts)
npm run sync:jira      # run Jira sync agent
```

## Client setup

Maryn is an MCP server. Connect it from any MCP-compatible client.

### VS Code / GitHub Copilot

Add to `.vscode/mcp.json` in your workspace root:

```json
{
  "servers": {
    "maryn": {
      "command": "node",
      "args": ["${workspaceFolder}/dist/index.js"],
      "env": { "MARYN_CONTEXT_REPO": "https://gitlab.thalesdigital.io/io-days-2026-hackathon/maryn-agent/maryn-memory.git" }
    }
  }
}
```

`MARYN_CONTEXT_REPO` accepts a git remote URL or a local path. When given a URL, the engine clones to `~/.maryn/clones/`, pulls on startup, and pushes after every write.

Copilot Chat picks up all tools, resources and prompts automatically.

### Claude Code

Add to `.mcp.json` at your working directory root. Use **absolute paths** for the binary (Claude Code does not expand `${workspaceFolder}`).

```json
{
  "mcpServers": {
    "maryn": {
      "command": "node",
      "args": ["/absolute/path/to/dist/index.js"],
      "env": { "MARYN_CONTEXT_REPO": "https://gitlab.thalesdigital.io/io-days-2026-hackathon/maryn-agent/maryn-memory.git" }
    }
  }
}
```

### Continue.dev

Add to `.continue/config.yaml`:

```yaml
mcpServers:
  - name: maryn
    command: node
    args:
      - /path/to/dist/index.js
    env:
      MARYN_CONTEXT_REPO: https://gitlab.thalesdigital.io/io-days-2026-hackathon/maryn-agent/maryn-memory.git
```

### Codex

Codex does not support MCP natively. Use shell helpers that pipe JSON-RPC to the Maryn binary, or read/write the context repo files directly via the filesystem.

## Context repo structure

Every actor (human, AI agent, or automated sync job) follows this path convention:

```
system/                              # always loaded into agent context (pinned)
journal/<date>/<actor>/<slug>.md     # daily work log
features/<feature-key>/status.md     # feature state
features/<feature-key>/decisions/    # feature-scoped ADRs
incidents/<date>-<slug>.md           # incident records
reference/                           # on-demand lookup (agent status, docs, ADRs)
archive/                             # completed work
```

`actor` = human name, agent id, or sync job name (e.g. `opus`, `claude-code`, `jira-sync`).

Full specification in the memory store's `system/identity.md`.

## Components

### maryn-mcp-server (`src/`)

Core MCP server. Git-backed markdown memory with auto-commit, multi-term search, context snapshots, and optional E2B sandbox execution.

### maryn-ui (`packages/maryn-ui/`)

PM-facing dashboard. Next.js 15, Vercel AI SDK (`ai/rsc`) for generative UI, MCP client connection via `@modelcontextprotocol/client`. Read-only for PMs. Views: overview, timeline, decisions, chat with citations, file viewer.

### maryn-sync (`src/sync/`)

Backend agents that pull from external tools on a schedule and write to the context repo.

| Actor | Source | Cadence | Target path |
|-------|--------|---------|-------------|
| `jira-sync` | Jira REST v3 | 15 min | `journal/<date>/jira-sync/` |
| `gitlab-sync` | GitLab API | 15 min | `journal/<date>/gitlab-sync/` |
| `sharepoint-sync` | MS Graph | 1 hr | `reference/sharepoint/` |

### Golden task suite (`src/eval/`)

Scores the MCP surface over stdio: retrieval correctness, injection resistance and
secret scanner precision and recall on seeded fixtures. Each task gets its own
seeded store and its own server process, so tasks cannot influence each other.

| Module | Role |
|--------|------|
| `tasks/` | The twenty tasks, grouped by family |
| `corpus.ts` | Seeded records and the ground truth a correct read has to return |
| `fixtures.ts` | Labelled payloads for the scanner, credential and benign |
| `session.ts` | MCP client bound to a freshly spawned server |
| `statistics.ts` | Pass rates, confusion table and the Wilson upper bound |
| `report.ts` | The one page verdict |

Add a task by appending to the family module. The catalogue tests check the count,
the identifiers and that every fixture belongs to exactly one group, so update
`test/eval.test.ts` in the same change.

### Dashboard (`src/dashboard/`)

Dev dashboard (Hono + TSX). Run via `npm run dashboard`. Pages: overview, files, history, search.

## Workflow: developing with Maryn tools

When working on this codebase, use the Maryn MCP tools to maintain a persistent record of decisions and progress.

Before starting a feature:
1. Run `context_search` to check for prior decisions or conventions related to the work
2. Read any relevant ADRs or feature specs in the context repo

During implementation:
1. Write progress entries to `journal/<date>/<actor>/<slug>.md` using `context_write`
2. Record architectural decisions in `features/<key>/decisions/` when choosing between approaches

After completing work:
1. Update the feature status via `context_write` to `features/<key>/status.md`
2. Run `npm test` and `npx tsc --noEmit` to verify nothing broke

### TrustNest APIM integration

The Thales TrustNest API Management gateway provides LLM access through OpenAI-compatible endpoints.

Base URL: `https://api.thalesdigital.io/ai-models/openai`

Authentication requires two headers:
- `Authorization: Bearer <access-token>` (OAuth2 via service principal or user identity)
- `TrustNest-Apim-Subscription-Key: <api-key>`

Service principal credentials (shared hackathon SP):
- Client ID: 
- Client secret and APIM key: stored in Azure Key Vault

Available models: gpt-4.1, gpt-4.1-mini, gpt-5, gpt-5-mini, gpt-5.1, gemini-2.5-flash, gemini-2.5-pro.
