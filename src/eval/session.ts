/**
 * A live MCP client bound to a freshly spawned Maryn server. Tasks talk to the
 * server the way any client does, over stdio, so the suite scores the published
 * surface rather than the internals behind it.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SERVER_ENTRY = resolve(PACKAGE_ROOT, "dist", "index.js");

/** Cleared before every run so the posture is exactly the one under test. */
const RESET_KEYS = [
  "MARYN_CONTEXT_REPO",
  "SYSTEM_WRITE_KEY",
  "E2B_API_KEY",
  "GITLAB_TOKEN",
  "LETTA_API_KEY",
  "LETTA_BASE_URL",
  "LETTA_AGENT_ID",
];

export interface ToolReply {
  text: string;
  isError: boolean;
}

interface TextBlock {
  type: string;
  text?: string;
}

export class MarynSession {
  private constructor(private readonly client: Client) {}

  static async start(contextRepo: string, env: Record<string, string>): Promise<MarynSession> {
    if (!existsSync(SERVER_ENTRY)) {
      throw new Error(`server build missing at ${SERVER_ENTRY}; run "npm run build" first`);
    }

    const base: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined && !RESET_KEYS.includes(key)) base[key] = value;
    }

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [SERVER_ENTRY],
      env: { ...base, ...env, MARYN_CONTEXT_REPO: contextRepo },
      stderr: process.env.MARYN_EVAL_VERBOSE ? "inherit" : "ignore",
    });

    const client = new Client({ name: "maryn-golden-suite", version: "1.0.0" });
    await client.connect(transport);
    return new MarynSession(client);
  }

  async call(tool: string, args: Record<string, unknown> = {}): Promise<ToolReply> {
    const result = await this.client.callTool({ name: tool, arguments: args });
    const blocks = (result.content ?? []) as TextBlock[];
    const text = blocks
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("\n");
    return { text, isError: result.isError === true };
  }

  async listToolNames(): Promise<string[]> {
    const { tools } = await this.client.listTools();
    return tools.map((tool) => tool.name).sort();
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
