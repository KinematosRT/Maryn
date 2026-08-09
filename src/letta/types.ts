/** Letta integration types for the memory bridge */

export interface LettaConfig {
  /** Letta API key (env: LETTA_API_KEY) */
  apiKey?: string;
  /** Letta server URL (env: LETTA_BASE_URL, default: http://localhost:8283) */
  baseUrl?: string;
  /** Letta agent ID to use for memory sync (env: LETTA_AGENT_ID) */
  agentId?: string;
}

export interface SyncResult {
  direction: "to-letta" | "to-git";
  blocksUpdated: number;
  filesCommitted: number;
  timestamp: string;
}
