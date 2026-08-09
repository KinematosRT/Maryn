/**
 * Configuration loader for Maryn MCP server.
 * Reads from environment variables following BYOK (Bring Your Own Key) pattern.
 */

export interface MarynConfig {
  contextRepo: string;
  e2bApiKey?: string;
  lettaApiKey?: string;
  lettaBaseUrl?: string;
  lettaAgentId?: string;
  gitlabToken?: string;
  gitlabUrl?: string;
}

const SAFE_ENV_PATTERN = /^[a-zA-Z0-9_\-./: @]+$/;

function readEnv(key: string): string | undefined {
  const val = process.env[key];
  if (!val) return undefined;
  if (!SAFE_ENV_PATTERN.test(val)) {
    process.stderr.write(`maryn: rejected env ${key} (invalid characters)\n`);
    return undefined;
  }
  return val;
}

export function loadConfig(overrides?: Partial<MarynConfig>): MarynConfig {
  return {
    contextRepo:
      overrides?.contextRepo ??
      process.env.MARYN_CONTEXT_REPO ??
      `${process.env.HOME ?? process.env.USERPROFILE ?? "."}/.maryn/context`,
    e2bApiKey: overrides?.e2bApiKey ?? readEnv("E2B_API_KEY"),
    lettaApiKey: overrides?.lettaApiKey ?? readEnv("LETTA_API_KEY"),
    lettaBaseUrl: overrides?.lettaBaseUrl ?? readEnv("LETTA_BASE_URL"),
    lettaAgentId: overrides?.lettaAgentId ?? readEnv("LETTA_AGENT_ID"),
    gitlabToken: overrides?.gitlabToken ?? readEnv("GITLAB_APP_DEV_TOKEN"),
    gitlabUrl: overrides?.gitlabUrl ?? readEnv("GITLAB_URL"),
  };
}
