import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { LettaMemoryBridge } from "../letta/bridge.js";

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
 * Register MCP tools for Letta memory bridge operations.
 * These tools are only functional when LETTA_API_KEY or LETTA_BASE_URL is set.
 */
export function registerLettaTools(
  server: McpServer,
  bridge: LettaMemoryBridge | null,
): void {
  const requireBridge = (): LettaMemoryBridge => {
    if (!bridge) {
      throw new Error(
        "Letta not configured. Set LETTA_API_KEY and LETTA_BASE_URL to enable.",
      );
    }
    return bridge;
  };

  server.registerTool(
    "letta_sync_to",
    {
      description:
        "Push pinned context files (system/) into a Letta agent's core memory blocks.",
      inputSchema: {
        agent_id: z.string().describe("Letta agent ID"),
      },
    },
    async ({ agent_id }) => {
      audit("letta_sync_to", { agent_id });
      try {
        const b = requireBridge();
        const result = await b.syncToLetta(agent_id);
        return {
          content: [
            {
              type: "text" as const,
              text: `Synced ${result.blocksUpdated} blocks to Letta agent ${agent_id}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${sanitizeError(err)}` },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "letta_snapshot",
    {
      description:
        "Pull Letta agent memory blocks and commit them to Git under state/letta/.",
      inputSchema: {
        agent_id: z.string().describe("Letta agent ID"),
      },
    },
    async ({ agent_id }) => {
      audit("letta_snapshot", { agent_id });
      try {
        const b = requireBridge();
        const result = await b.snapshotToGit(agent_id);
        return {
          content: [
            {
              type: "text" as const,
              text: `Committed ${result.filesCommitted} memory files from Letta agent ${agent_id}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${sanitizeError(err)}` },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "letta_message",
    {
      description: "Send a message to a Letta agent and return the response.",
      inputSchema: {
        agent_id: z.string().describe("Letta agent ID"),
        text: z.string().describe("Message to send"),
      },
    },
    async ({ agent_id, text }) => {
      audit("letta_message", { agent_id, text_length: text.length });
      try {
        const b = requireBridge();
        const response = await b.sendMessage(agent_id, text);
        return {
          content: [{ type: "text" as const, text: response }],
        };
      } catch (err) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${sanitizeError(err)}` },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "letta_list_agents",
    {
      description: "List all agents on the configured Letta server.",
    },
    async () => {
      audit("letta_list_agents", {});
      try {
        const b = requireBridge();
        const agents = await b.listAgents();
        return {
          content: [
            {
              type: "text" as const,
              text: agents.length
                ? JSON.stringify(agents, null, 2)
                : "No agents found.",
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${sanitizeError(err)}` },
          ],
          isError: true,
        };
      }
    },
  );
}
