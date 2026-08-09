import { serve } from "@hono/node-server";
import { resolve, dirname } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { MemFSEngine } from "../memfs/engine.js";
import { createApp } from "./app.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const contextRepo = resolve(
  process.env.MARYN_CONTEXT_REPO || `${homedir()}/.maryn/context`,
);
const port = parseInt(process.env.MARYN_DASHBOARD_PORT || "3000", 10);
const host = process.env.MARYN_DASHBOARD_HOST || "127.0.0.1";

const css = readFileSync(
  resolve(__dirname, "../../src/dashboard/styles.css"),
  "utf-8",
);

async function main(): Promise<void> {
  const memfs = new MemFSEngine(contextRepo);
  await memfs.init();
  const app = createApp(memfs, css);

  serve({ fetch: app.fetch, port, hostname: host }, () => {
    process.stderr.write(`Maryn dashboard: http://${host}:${port}\n`);
    process.stderr.write(`Context repo: ${contextRepo}\n`);
  });
}

main();
