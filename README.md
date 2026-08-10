# Maryn

**Memory As a Repo: YAML & NLP**

An MCP server that gives AI agents persistent, structured, auditable memory through git-backed markdown files.

---

## The Problem

AI coding agents forget everything between sessions. Architectural decisions, testing strategies, incident resolutions and team conventions vanish when the session ends. Engineers waste time re-explaining context that already exists in their repositories.

In regulated industries (defense, aerospace, security) this is not just inconvenient. Approximate answers from vector search can invalidate compliance evidence. Audit trails require traceability, not probability.

## The Solution

Maryn treats a **separate git repository as the agent's memory**. Every piece of context is a markdown file with YAML frontmatter or a full YAML, versioned with git history.  
The MCP/runtime repo and the project memory store are intentionally distinct. In the current local architecture, that evolving memory store is `maryn-memory`.

- **Deterministic**: identical queries always retrieve the same context
- **Auditable**: every change tracked with author, timestamp and commit hash
- **Reproducible**: any past state can be reconstructed from git history
- **Persistent**: memory survives across sessions, contributors and timeframes

## How It Works

```
┌─────────────────────────────────────────────┐
│  MCP Client (VS Code, Cursor, Claude, CLI)  │
└──────────────────┬──────────────────────────┘
                   │ stdio / MCP protocol
┌──────────────────▼──────────────────────────┐
│              Maryn MCP Server               │
│                                             │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │  Tools   │  │Resources │  │  Prompts  │  │
│  │ (CRUD +  │  │(snapshot,│  │ (DoR,DORA,│  │
│  │ search + │  │ tree,    │  │ incident, │  │
│  │ history) │  │ files)   │  │ handoff)  │  │
│  └────┬─────┘  └────┬─────┘  └───────────┘  │
│       │             │                       │
│  ┌────▼─────────────▼──────┐  ┌───────────┐ │
│  │   MemFS Engine          │  │ E2B       │ │
│  │   (markdown + YAML +    │  │ Sandbox   │ │
│  │    git via simple-git)  │  │ (optional)│ │
│  └────────────┬────────────┘  └───────────┘ │
└───────────────┼─────────────────────────────┘
                │
┌───────────────▼─────────────────────────────┐
│         Context Repository (git)            │
│                                             │
│  system/          ← always in context       │
│    identity.md                              │
│    architecture.md                          │
│    conventions.md                           │
│  reference/       ← on-demand lookup        │
│  archive/         ← historical context      │
└─────────────────────────────────────────────┘
```

## Quickstart

```bash
npm install && npm run build

# Run with default context repo (~/.maryn/context)
node dist/index.js

# Or specify a context repo
MARYN_CONTEXT_REPO=/path/to/your/context node dist/index.js
```

### VS Code MCP Configuration

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "maryn": {
      "command": "node",
      "args": ["${workspaceFolder}/dist/index.js"],
      "env": { "MARYN_CONTEXT_REPO": "${workspaceFolder}/.maryn" }
    }
  }
}
```

See [AGENTS.md](AGENTS.md) for all client configs and contributor guide.

## MCP Tools

| Tool | Description |
|------|-------------|
| `context_read` | Read a memory file with YAML frontmatter |
| `context_write` | Write/update a memory file (auto-commits to git) |
| `context_delete` | Delete a memory file (auto-commits) |
| `context_search` | Search memory files by content, tags, or path |
| `context_tree` | List all memory files (pinned vs unpinned) |
| `context_snapshot` | Get combined pinned context (all system/ files) |
| `context_list_dir` | List directory contents in context repo |
| `context_log` | Show recent git commits |
| `context_status` | Show file counts and sandbox state |
| `sandbox_execute` | Run code in E2B sandbox (Python/JS/shell) |
| `sandbox_upload` | Write a file into the sandbox |
| `sandbox_read` | Read a file from the sandbox |

## MCP Resources

| Resource | URI | Description |
|----------|-----|-------------|
| Context Snapshot | `maryn://context/snapshot` | Combined pinned context |
| Memory Tree | `maryn://context/tree` | File listing with classification |
| Memory File | `maryn://context/file/{path}` | Read a specific memory file |

## MCP Prompts

| Prompt | Purpose |
|--------|---------|
| `dor-checklist` | Definition of Ready review for a user story |
| `dora-metrics` | DORA metrics analysis for a given period |
| `ecodesign-review` | Sustainability review of a component |
| `incident-context` | Gather historical context for incident resolution |
| `session-handoff` | Package session state for handoff |

## Demo Flow

```bash
# 1. Point Maryn at a real context repository
# context-template/ is a template, not the long-lived project memory.
export MARYN_CONTEXT_REPO=/path/to/your/maryn-memory
node dist/index.js

# Through your MCP client:
# 2. "Show me the context snapshot" → context_snapshot
# 3. "What architecture decisions have we made?" → context_search
# 4. "Record that we chose event sourcing for audit" → context_write
# 5. "Show the git history" → context_log
# 6. The decision is now persistently recorded with full git lineage.
```

## Golden Task Suite

Twenty tasks score the MCP surface the way a client sees it: over stdio, against a
freshly seeded memory store, one store and one server process per task.

```bash
npm run eval                 # writes eval/report.json and eval/VERDICT.md
npm run eval -- --out tmp    # write the run elsewhere
```

| Family | Tasks | What it holds the server to |
|--------|-------|-----------------------------|
| Retrieval correctness | 9 | Reads return the stored record, searches return the exact match set, snapshots carry pinned records only and repeat calls are byte identical |
| Injection resistance | 7 | Path escapes, repository internals, payloads in queries, oversized writes, attribute injection, reserved keys, unauthenticated writes to pinned context and parallel writes |
| Secret scanner | 4 | Precision and recall over seeded fixtures, measured at the write boundary |

The suite runs against two postures: the quickstart default and a guarded one with
`SYSTEM_WRITE_KEY` set. A failing task in the guarded posture fails the run.
[eval/VERDICT.md](eval/VERDICT.md) carries the last recorded run, including the
residual failure rate and its confidence bound.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MARYN_CONTEXT_REPO` | `~/.maryn/context` | Path to the Maryn project memory store, for example `maryn-memory` |
| `SYSTEM_WRITE_KEY` | - | When set, writes under `system/` need a matching `write_key` and deletes are refused |
| `E2B_API_KEY` | - | E2B API key for sandbox (optional) |

## Requirements

- Node.js >= 20
- Git (for context repo history)
- E2B API key (optional, for sandbox execution)

## License

Internal
