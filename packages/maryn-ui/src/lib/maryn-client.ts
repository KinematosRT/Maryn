import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "node:path";

let client: Client | null = null;
let clientReady: Promise<Client> | null = null;

function getMarynBin(): string {
  const bin = process.env.MARYN_BIN;
  if (!bin) throw new Error("MARYN_BIN not set — add it to .env.local");
  return resolve(bin);
}

function getContextRepo(): string {
  const repo = process.env.MARYN_CONTEXT_REPO;
  if (!repo) throw new Error("MARYN_CONTEXT_REPO not set — add it to .env.local");
  return resolve(repo);
}

async function createClient(): Promise<Client> {
  const transport = new StdioClientTransport({
    command: "node",
    args: [getMarynBin()],
    env: {
      PATH: process.env.PATH ?? "",
      NODE_ENV: process.env.NODE_ENV ?? "production",
      MARYN_CONTEXT_REPO: getContextRepo(),
    },
  });

  const c = new Client({ name: "maryn-ui", version: "0.1.0" });
  transport.onclose = () => {
    if (client === c) {
      client = null;
      clientReady = null;
    }
  };
  await c.connect(transport);
  client = c;
  return c;
}

function getClient(): Promise<Client> {
  if (client) return Promise.resolve(client);
  if (!clientReady) clientReady = createClient();
  return clientReady;
}

export async function callTool(
  name: string,
  args: Record<string, unknown> = {},
): Promise<string> {
  const c = await getClient();
  const result = await c.callTool({ name, arguments: args });
  const textContent = result.content as Array<{ type: string; text: string }>;
  return textContent?.[0]?.text ?? "";
}

export async function contextTree(): Promise<{
  files: string[];
  pinned: string[];
  unpinned: string[];
}> {
  const raw = await callTool("context_tree");
  try {
    return JSON.parse(raw);
  } catch {
    return { files: [], pinned: [], unpinned: [] };
  }
}

export async function contextSnapshot(): Promise<string> {
  return callTool("context_snapshot");
}

export async function contextSearch(
  query: string,
): Promise<Array<{ path: string; description: string; tags: string[]; preview: string }>> {
  const raw = await callTool("context_search", { query });
  if (raw.startsWith("No results")) return [];
  return JSON.parse(raw);
}

export async function contextRead(
  path: string,
): Promise<{ path: string; frontmatter: Record<string, unknown>; content: string }> {
  const raw = await callTool("context_read", { path });
  try {
    return JSON.parse(raw);
  } catch {
    return { path, frontmatter: {}, content: raw };
  }
}

export async function contextLog(
  count = 20,
): Promise<Array<{ hash: string; date: string; message: string; author: string }>> {
  const raw = await callTool("context_log", { count });
  if (raw === "No commits yet.") return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function contextStatus(): Promise<string> {
  return callTool("context_status");
}
