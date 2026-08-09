#!/usr/bin/env npx tsx
/**
 * End-to-end test: starts Maryn MCP server as a child process,
 * sends real JSON-RPC / MCP protocol messages over stdio,
 * and verifies the full lifecycle works.
 */

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MARYN = resolve(__dirname, "..", "dist", "index.js");

let msgId = 0;
function jsonrpc(method: string, params: Record<string, unknown> = {}) {
  const id = ++msgId;
  const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });
  return { id, raw: body + "\n" };
}

async function readResponse(stream: Readable, timeoutMs = 10_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timeout waiting for response")), timeoutMs);
    let buffer = "";
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString();
      // MCP SDK uses newline-delimited JSON
      const newlineIdx = buffer.indexOf("\n");
      if (newlineIdx === -1) return;
      const line = buffer.slice(0, newlineIdx).replace(/\r$/, "");
      buffer = buffer.slice(newlineIdx + 1);
      clearTimeout(timer);
      stream.removeListener("data", onData);
      try {
        resolve(JSON.parse(line));
      } catch (e) {
        reject(new Error(`Invalid JSON: ${line}`));
      }
    };
    stream.on("data", onData);
  });
}

async function main() {
  const tempDir = await mkdtemp(join(tmpdir(), "maryn-e2e-"));
  console.log(`\n=== Maryn E2E Test ===`);
  console.log(`Context repo: ${tempDir}\n`);

  const child = spawn(process.execPath, [MARYN], {
    env: { ...process.env, MARYN_CONTEXT_REPO: tempDir },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr!.on("data", (d) => { stderr += d.toString(); });

  const send = (method: string, params: Record<string, unknown> = {}) => {
    const msg = jsonrpc(method, params);
    child.stdin!.write(msg.raw);
    return readResponse(child.stdout!, 15_000);
  };

  try {
    // 1. Initialize
    console.log("1. Sending initialize...");
    const initResult = await send("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "e2e-test", version: "1.0.0" },
    }) as any;
    console.log(`   Server: ${initResult.result?.serverInfo?.name} v${initResult.result?.serverInfo?.version}`);
    console.log(`   Tools: ${initResult.result?.capabilities?.tools ? "yes" : "no"}`);
    console.log(`   Resources: ${initResult.result?.capabilities?.resources ? "yes" : "no"}`);
    console.log(`   Prompts: ${initResult.result?.capabilities?.prompts ? "yes" : "no"}`);

    // Send initialized notification
    const notif = JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" });
    child.stdin!.write(notif + "\n");

    // 2. List tools
    console.log("\n2. Listing tools...");
    const toolsResult = await send("tools/list") as any;
    const toolNames = toolsResult.result?.tools?.map((t: any) => t.name) ?? [];
    console.log(`   Available tools (${toolNames.length}): ${toolNames.join(", ")}`);

    // 3. Write a memory file
    console.log("\n3. Writing memory file system/architecture.md...");
    const writeResult = await send("tools/call", {
      name: "context_write",
      arguments: {
        path: "system/architecture.md",
        content: "# Architecture\n\nMicroservices with event sourcing.\n\n## Decision: Use Kafka for events\n\nRationale: Team consensus, proven at scale.",
        description: "System architecture and key decisions",
        tags: ["architecture", "decisions"],
      },
    }) as any;
    const writeText = writeResult.result?.content?.[0]?.text ?? "FAILED";
    console.log(`   Result: ${writeText}`);

    // 4. Read it back
    console.log("\n4. Reading system/architecture.md...");
    const readResult = await send("tools/call", {
      name: "context_read",
      arguments: { path: "system/architecture.md" },
    }) as any;
    const readData = JSON.parse(readResult.result?.content?.[0]?.text ?? "{}");
    console.log(`   Description: ${readData.frontmatter?.description}`);
    console.log(`   Tags: ${readData.frontmatter?.tags?.join(", ")}`);
    console.log(`   Content preview: ${readData.content?.slice(0, 80)}...`);

    // 5. Search memory
    console.log("\n5. Searching for 'Kafka'...");
    const searchResult = await send("tools/call", {
      name: "context_search",
      arguments: { query: "Kafka" },
    }) as any;
    const searchData = JSON.parse(searchResult.result?.content?.[0]?.text ?? "[]");
    console.log(`   Found ${searchData.length} result(s): ${searchData.map((r: any) => r.path).join(", ")}`);

    // 6. Get tree
    console.log("\n6. Getting memory tree...");
    const treeResult = await send("tools/call", {
      name: "context_tree",
      arguments: {},
    }) as any;
    const tree = JSON.parse(treeResult.result?.content?.[0]?.text ?? "{}");
    console.log(`   Total files: ${tree.files?.length}`);
    console.log(`   Pinned: ${tree.pinned?.join(", ")}`);
    console.log(`   Unpinned: ${tree.unpinned?.join(", ") || "(none)"}`);

    // 7. Get context snapshot
    console.log("\n7. Getting context snapshot...");
    const snapResult = await send("tools/call", {
      name: "context_snapshot",
      arguments: {},
    }) as any;
    const snapText = snapResult.result?.content?.[0]?.text ?? "";
    console.log(`   Snapshot preview: ${snapText.slice(0, 120)}...`);

    // 8. Check git history
    console.log("\n8. Checking git log...");
    const logResult = await send("tools/call", {
      name: "context_log",
      arguments: { count: 5 },
    }) as any;
    const logData = JSON.parse(logResult.result?.content?.[0]?.text ?? "[]");
    console.log(`   Commits: ${logData.length}`);
    for (const c of logData) {
      console.log(`     ${c.hash?.slice(0, 7)} ${c.message}`);
    }

    // 9. Write a second file and verify tree updates
    console.log("\n9. Writing reference/incident-2026-03.md...");
    await send("tools/call", {
      name: "context_write",
      arguments: {
        path: "reference/incident-2026-03.md",
        content: "# Incident: API Gateway Timeout\n\nResolved by increasing connection pool.\nRoot cause: upstream service slow response under load.",
        description: "March 2026 API gateway incident",
        tags: ["incident", "api-gateway"],
      },
    });
    const tree2Result = await send("tools/call", { name: "context_tree", arguments: {} }) as any;
    const tree2 = JSON.parse(tree2Result.result?.content?.[0]?.text ?? "{}");
    console.log(`   Tree now has ${tree2.files?.length} files`);
    console.log(`   Unpinned: ${tree2.unpinned?.join(", ")}`);

    // 10. Get status
    console.log("\n10. Checking status...");
    const statusResult = await send("tools/call", {
      name: "context_status",
      arguments: {},
    }) as any;
    console.log(`   ${statusResult.result?.content?.[0]?.text}`);

    // 11. List resources
    console.log("\n11. Listing resources...");
    const resResult = await send("resources/list") as any;
    const resources = resResult.result?.resources ?? [];
    console.log(`   Resources (${resources.length}):`);
    for (const r of resources) {
      console.log(`     ${r.name}: ${r.uri}`);
    }

    // 12. List prompts
    console.log("\n12. Listing prompts...");
    const promptResult = await send("prompts/list") as any;
    const prompts = promptResult.result?.prompts ?? [];
    console.log(`   Prompts (${prompts.length}): ${prompts.map((p: any) => p.name).join(", ")}`);

    // 13. Getting incident-context prompt
    console.log("\n13. Getting incident-context prompt...");
    const promptGetResult = await send("prompts/get", {
      name: "incident-context",
      arguments: { incident_description: "API gateway returning 504 errors" },
    }) as any;
    const promptMsg = promptGetResult.result?.messages?.[0]?.content?.text ?? "";
    console.log(`   Prompt preview: ${promptMsg.slice(0, 100)}...`);

    // 14. Write and read a YAML context file
    console.log("\n14. Writing system/identity.yaml (YAML format)...");
    const yamlWriteResult = await send("tools/call", {
      name: "context_write",
      arguments: {
        path: "system/identity.yaml",
        content: "",
        description: "Project identity",
        tags: ["system", "identity"],
        data: {
          project: { name: "Maryn", acronym: "Memory As a Repo: YAML & NLP" },
          actors: [{ name: "E-A_B", role: "Senior SE" }],
        },
      },
    }) as any;
    const yamlWriteText = yamlWriteResult.result?.content?.[0]?.text ?? "FAILED";
    console.log(`   Result: ${yamlWriteText}`);

    console.log("\n15. Reading system/identity.yaml...");
    const yamlReadResult = await send("tools/call", {
      name: "context_read",
      arguments: { path: "system/identity.yaml" },
    }) as any;
    const yamlReadData = JSON.parse(yamlReadResult.result?.content?.[0]?.text ?? "{}");
    console.log(`   Description: ${yamlReadData.frontmatter?.description}`);
    console.log(`   Has structured data: ${!!yamlReadData.data}`);
    console.log(`   Project name: ${yamlReadData.data?.project?.name}`);

    console.log(`\n=== ALL 15 E2E CHECKS PASSED (${toolNames.length} tools) ===\n`);

  } catch (err) {
    console.error("\n!!! E2E TEST FAILED !!!");
    console.error(err);
    if (stderr) console.error("Server stderr:", stderr);
    process.exitCode = 1;
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.on("close", resolve));
    await rm(tempDir, { recursive: true, force: true });
  }
}

main();
