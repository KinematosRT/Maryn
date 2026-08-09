import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemFSEngine } from "../memfs/engine.js";
import type { E2BSandbox } from "../sandbox/e2b.js";

const SYSTEM_WRITE_KEY = process.env.SYSTEM_WRITE_KEY ?? "";

function sanitizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg
    .replace(/[A-Z]:\\[^'"]*(?:\.(?:md|yaml|yml|ts|js|json|txt))/gi, "[path]")
    .replace(/\/(?:home|app)\/[^'"]+/g, "[path]");
}

function audit(tool: string, args: Record<string, unknown>): void {
  const safe = { ...args };
  if (safe.content && typeof safe.content === "string" && safe.content.length > 200) {
    safe.content = safe.content.slice(0, 200) + "...(truncated)";
  }
  process.stderr.write(
    `AUDIT ${JSON.stringify({ ts: new Date().toISOString(), tool, args: safe })}\n`,
  );
}

export function registerTools(
  server: McpServer,
  memfs: MemFSEngine,
  sandbox: E2BSandbox,
): void {

  // -- context memory tools --

  server.registerTool(
    "context_read",
    {
      description: "Read a memory file. Returns content and YAML frontmatter.",
      inputSchema: { path: z.string().describe("Relative path, e.g. system/architecture.md") },
    },
    async ({ path }) => {
      audit("context_read", { path });
      try {
        const file = await memfs.readFile(path);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(file, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${sanitizeError(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "context_write",
    {
      description: "Write or update a memory file. system/ files require SYSTEM_WRITE_KEY.",
      inputSchema: {
        path: z.string().describe("Relative path (.md or .yaml)"),
        content: z.string().describe("Body text (markdown) or YAML content string"),
        description: z.string().describe("Short description for frontmatter"),
        tags: z.array(z.string()).optional().describe("Tags for search"),
        read_only: z.boolean().optional(),
        char_limit: z.number().optional(),
        data: z.record(z.unknown()).optional().describe("Structured data for YAML files"),
        write_key: z.string().optional().describe("Required for system/ writes"),
      },
    },
    async ({ path, content, description, tags, read_only, char_limit, data, write_key }) => {
      audit("context_write", { path, description, tags });
      try {
        if (path.startsWith("system/") && SYSTEM_WRITE_KEY) {
          if (write_key !== SYSTEM_WRITE_KEY) {
            return {
              content: [{ type: "text" as const, text: "Error: system/ writes require valid write_key" }],
              isError: true,
            };
          }
        }

        const now = new Date().toISOString();
        let created = now;

        try {
          const existing = await memfs.readFile(path);
          if (existing.frontmatter.read_only) {
            return {
              content: [{ type: "text" as const, text: `Error: ${path} is read-only` }],
              isError: true,
            };
          }
          created = existing.frontmatter.created || now;
        } catch {
          // new file
        }

        await memfs.writeFile(path, content, {
          description, tags, read_only, char_limit, created, updated: now,
        }, data);
        return {
          content: [{ type: "text" as const, text: `Written: ${path}` }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${sanitizeError(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "context_delete",
    {
      description: "Delete a memory file.",
      inputSchema: { path: z.string().describe("Relative path to delete") },
    },
    async ({ path }) => {
      audit("context_delete", { path });
      try {
        if (path.startsWith("system/") && SYSTEM_WRITE_KEY) {
          return {
            content: [{ type: "text" as const, text: "Error: system/ files cannot be deleted via MCP" }],
            isError: true,
          };
        }
        try {
          const existing = await memfs.readFile(path);
          if (existing.frontmatter.read_only) {
            return {
              content: [{ type: "text" as const, text: `Error: ${path} is read-only` }],
              isError: true,
            };
          }
        } catch {
          // file does not exist; deleteFile will throw its own error
        }
        await memfs.deleteFile(path);
        return {
          content: [{ type: "text" as const, text: `Deleted: ${path}` }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${sanitizeError(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "context_search",
    {
      description: "Search memory files by content, tags, or path.",
      inputSchema: { query: z.string().describe("Search query") },
    },
    async ({ query }) => {
      audit("context_search", { query });
      const results = await memfs.search(query);
      const summary = results.map((f) => ({
        path: f.path,
        description: f.frontmatter.description,
        tags: f.frontmatter.tags,
        preview: f.content.slice(0, 200),
      }));
      return {
        content: [
          {
            type: "text" as const,
            text: results.length
              ? JSON.stringify(summary, null, 2)
              : `No results for "${query}"`,
          },
        ],
      };
    },
  );

  server.registerTool(
    "context_tree",
    {
      description: "List all memory files with pinned/unpinned classification.",
    },
    async () => {
      const tree = await memfs.getTree();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(tree, null, 2) }],
      };
    },
  );

  server.registerTool(
    "context_snapshot",
    {
      description: "Get combined pinned context (all system/ files).",
    },
    async () => {
      const snapshot = await memfs.getContextSnapshot();
      return {
        content: [
          {
            type: "text" as const,
            text: `# Context Snapshot (${snapshot.pinnedChars} chars, ${snapshot.tree.pinned.length} pinned)\n\n${snapshot.systemContext}`,
          },
        ],
      };
    },
  );

  server.registerTool(
    "context_list_dir",
    {
      description: "List directory contents in the context repository.",
      inputSchema: { path: z.string().default("").describe("Directory path relative to repo root") },
    },
    async ({ path }) => {
      const entries = await memfs.listDir(path);
      return {
        content: [{ type: "text" as const, text: entries.join("\n") || "(empty)" }],
      };
    },
  );

  server.registerTool(
    "context_log",
    {
      description: "Show recent git commits in the context repository.",
      inputSchema: { count: z.number().int().min(1).max(500).default(10).describe("Number of commits") },
    },
    async ({ count }) => {
      const log = await memfs.getLog(count);
      return {
        content: [
          {
            type: "text" as const,
            text: log.length
              ? JSON.stringify(log, null, 2)
              : "No commits yet.",
          },
        ],
      };
    },
  );

  server.registerTool(
    "context_status",
    {
      description: "Show context repo path, file counts, and sandbox state.",
    },
    async () => {
      const tree = await memfs.getTree();
      const lines = [
        `files: ${tree.files.length}`,
        `pinned: ${tree.pinned.length}`,
        `unpinned: ${tree.unpinned.length}`,
        `sandbox: ${!sandbox.isAvailable ? "unavailable (no E2B_API_KEY)" : sandbox.isRunning ? "running" : "stopped"}`,
      ];
      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );

  // -- sandbox tools --

  server.registerTool(
    "sandbox_execute",
    {
      description: "Run code in an E2B sandbox. Python, JavaScript, or shell.",
      inputSchema: {
        code: z.string().describe("Code to execute"),
        language: z.enum(["python", "javascript", "shell"]).default("python"),
      },
    },
    async ({ code, language }) => {
      audit("sandbox_execute", { language, code_length: code.length });
      try {
        const result = await sandbox.execute(code, language);
        const parts: string[] = [];
        if (result.stdout) parts.push(`stdout:\n${result.stdout}`);
        if (result.stderr) parts.push(`stderr:\n${result.stderr}`);
        if (result.error) parts.push(`error: ${result.error}`);
        parts.push(`exit: ${result.exitCode}`);
        return {
          content: [{ type: "text" as const, text: parts.join("\n\n") }],
          isError: result.exitCode !== 0,
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Sandbox error: ${sanitizeError(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "sandbox_upload",
    {
      description: "Write a file into the sandbox filesystem.",
      inputSchema: {
        path: z.string().describe("Path inside the sandbox"),
        content: z.string().describe("File content"),
      },
    },
    async ({ path, content }) => {
      audit("sandbox_upload", { path });
      try {
        await sandbox.writeFile(path, content);
        return { content: [{ type: "text" as const, text: `Written: ${path}` }] };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${sanitizeError(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "sandbox_read",
    {
      description: "Read a file from the sandbox filesystem.",
      inputSchema: { path: z.string().describe("Path inside the sandbox") },
    },
    async ({ path }) => {
      audit("sandbox_read", { path });
      try {
        const text = await sandbox.readFile(path);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${sanitizeError(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "sandbox_stop",
    {
      description: "Kill the sandbox session.",
    },
    async () => {
      audit("sandbox_stop", {});
      try {
        await sandbox.stop();
        return { content: [{ type: "text" as const, text: "Sandbox stopped." }] };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error stopping sandbox: ${sanitizeError(err)}` }],
          isError: true,
        };
      }
    },
  );
}
