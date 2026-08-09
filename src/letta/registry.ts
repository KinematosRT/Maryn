import type { Letta } from "@letta-ai/letta-client";
import type { LettaConfig } from "./types.js";

let client: Letta | null = null;

/**
 * Build or return the singleton Letta client.
 * Reads LETTA_API_KEY and LETTA_BASE_URL from env when no config is given.
 */
export async function getLettaClient(config?: LettaConfig): Promise<Letta> {
  if (client) return client;

  const { Letta: LettaClass } = await import("@letta-ai/letta-client");

  const apiKey = config?.apiKey ?? process.env.LETTA_API_KEY ?? null;
  const baseURL = config?.baseUrl ?? process.env.LETTA_BASE_URL ?? undefined;

  client = new LettaClass({
    apiKey,
    baseURL,
    environment: baseURL ? undefined : "local",
  });

  return client;
}

/**
 * True when LETTA_API_KEY or LETTA_BASE_URL is configured.
 */
export function isLettaConfigured(config?: LettaConfig): boolean {
  return !!(
    config?.apiKey ??
    config?.baseUrl ??
    process.env.LETTA_API_KEY ??
    process.env.LETTA_BASE_URL
  );
}
