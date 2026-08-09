import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemFSEngine } from "../memfs/engine.js";
import type { E2BSandbox } from "../sandbox/e2b.js";

function sanitizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg
    .replace(/[A-Z]:\\[^'"]*(?:\.(?:md|yaml|yml|ts|js|json|txt))/gi, "[path]")
    .replace(/\/(?:home|app)\/[^'"]+/g, "[path]");
}

function audit(tool: string, args: Record<string, unknown>): void {
  process.stderr.write(
    `AUDIT ${JSON.stringify({ ts: new Date().toISOString(), tool, args })}\n`,
  );
}

/**
 * Reads context files, runs a filter script in the E2B sandbox,
 * returns sanitized output. PII and classified content get
 * tokenized or masked before they enter the context window.
 */
export function registerFilterTools(
  server: McpServer,
  memfs: MemFSEngine,
  sandbox: E2BSandbox,
): void {

  server.registerTool(
    "context_filter",
    {
      description:
        "Read context files and run a filter script in the sandbox before " +
        "returning. Use this to tokenize PII, mask classified content, or " +
        "transform data before it enters the LLM context window.",
      inputSchema: {
        paths: z.array(z.string()).describe("Context file paths to read"),
        filter_code: z.string().describe(
          "Python or JavaScript code that receives a 'context' variable " +
          "(JSON string of file contents) and prints the filtered output.",
        ),
        language: z.enum(["python", "javascript"]).default("python"),
      },
    },
    async ({ paths, filter_code, language }) => {
      audit("context_filter", { paths, language, code_length: filter_code.length });
      try {
        if (!sandbox.isAvailable) {
          return {
            content: [{ type: "text" as const, text: "Error: E2B sandbox required for context_filter (set E2B_API_KEY)" }],
            isError: true,
          };
        }

        const files: Record<string, unknown> = {};
        for (const p of paths) {
          const file = await memfs.readFile(p);
          files[p] = {
            frontmatter: file.frontmatter,
            content: file.content,
            data: file.data,
          };
        }

        const contextJson = JSON.stringify(files);
        const escapedJson = contextJson.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

        let wrapper: string;
        if (language === "python") {
          wrapper = [
            "import json",
            `context = '${escapedJson}'`,
            "data = json.loads(context)",
            "",
            filter_code,
          ].join("\n");
        } else {
          wrapper = [
            `const context = '${escapedJson}';`,
            "const data = JSON.parse(context);",
            "",
            filter_code,
          ].join("\n");
        }

        const result = await sandbox.execute(wrapper, language, 30_000);

        if (result.exitCode !== 0) {
          return {
            content: [{ type: "text" as const, text: `Filter error: ${result.error || result.stderr}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text" as const, text: result.stdout || "(no output)" }],
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
    "context_validate",
    {
      description:
        "Validate context files against a schema or rule set. Runs validation " +
        "code in the sandbox and returns pass/fail results.",
      inputSchema: {
        paths: z.array(z.string()).describe("Context file paths to validate"),
        rules: z.string().describe(
          "Python or JavaScript code that receives 'data' (parsed context) " +
          "and prints validation results. Should print 'PASS' or 'FAIL: reason'.",
        ),
        language: z.enum(["python", "javascript"]).default("python"),
      },
    },
    async ({ paths, rules, language }) => {
      audit("context_validate", { paths, language, code_length: rules.length });
      try {
        if (!sandbox.isAvailable) {
          return {
            content: [{ type: "text" as const, text: "Error: E2B sandbox required for context_validate (set E2B_API_KEY)" }],
            isError: true,
          };
        }

        const files: Record<string, unknown> = {};
        for (const p of paths) {
          const file = await memfs.readFile(p);
          files[p] = {
            frontmatter: file.frontmatter,
            content: file.content,
            data: file.data,
          };
        }

        const contextJson = JSON.stringify(files);
        const escapedJson = contextJson.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

        let wrapper: string;
        if (language === "python") {
          wrapper = [
            "import json",
            `context = '${escapedJson}'`,
            "data = json.loads(context)",
            "",
            rules,
          ].join("\n");
        } else {
          wrapper = [
            `const context = '${escapedJson}';`,
            "const data = JSON.parse(context);",
            "",
            rules,
          ].join("\n");
        }

        const result = await sandbox.execute(wrapper, language, 30_000);

        if (result.exitCode !== 0) {
          return {
            content: [{ type: "text" as const, text: `Validation error: ${result.error || result.stderr}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text" as const, text: result.stdout || "PASS" }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${sanitizeError(err)}` }],
          isError: true,
        };
      }
    },
  );
}
