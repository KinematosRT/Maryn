import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MemFSEngine } from "../memfs/engine.js";
import { E2BSandbox } from "../sandbox/e2b.js";
import { registerTools } from "./tools.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";
import { registerLettaTools } from "./letta-tools.js";
import { registerFilterTools } from "./filter-tools.js";
import { LettaMemoryBridge } from "../letta/bridge.js";
import { getLettaClient, isLettaConfigured } from "../letta/registry.js";
import { resolve } from "node:path";
import { homedir } from "node:os";

export interface MarynServices {
  createServer: () => McpServer;
  memfs: MemFSEngine;
  sandbox: E2BSandbox;
}

export async function bootstrap(): Promise<MarynServices> {
  const raw = process.env.MARYN_CONTEXT_REPO || `${homedir()}/.maryn/context`;
  const contextRepo = /^(https?:\/\/|git@|ssh:\/\/)/.test(raw)
    ? raw
    : resolve(raw);

  const memfs = new MemFSEngine(contextRepo);
  const sandbox = new E2BSandbox(process.env.E2B_API_KEY);

  await memfs.init();

  let lettaBridge: LettaMemoryBridge | null = null;
  if (isLettaConfigured()) {
    const letta = await getLettaClient();
    lettaBridge = new LettaMemoryBridge(letta, memfs);
  }

  const createServer = (): McpServer => {
    const server = new McpServer({ name: "maryn", version: "0.3.0" });
    registerTools(server, memfs, sandbox);
    registerFilterTools(server, memfs, sandbox);
    registerLettaTools(server, lettaBridge);
    registerResources(server, memfs);
    registerPrompts(server);
    return server;
  };

  return { createServer, memfs, sandbox };
}
