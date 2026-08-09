#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { bootstrap } from "./server/bootstrap.js";

async function main(): Promise<void> {
  const { createServer, sandbox } = await bootstrap();
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = async () => {
    await sandbox.stop();
    await server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err: unknown) => {
  process.stderr.write(
    `maryn: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
