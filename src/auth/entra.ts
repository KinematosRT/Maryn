import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export interface TokenClaims extends JWTPayload {
  oid?: string;
  preferred_username?: string;
  name?: string;
  scp?: string;
  roles?: string[];
}

export interface EntraConfig {
  tenantId: string;
  clientId: string;
  requiredScopes?: string[];
}

const jwksSets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(tenantId: string) {
  let jwks = jwksSets.get(tenantId);
  if (!jwks) {
    const url = new URL(
      `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
    );
    jwks = createRemoteJWKSet(url);
    jwksSets.set(tenantId, jwks);
  }
  return jwks;
}

function extractScopes(claims: TokenClaims): Set<string> {
  const scopes = new Set<string>();
  // Entra ID puts delegated scopes in `scp` (space-separated)
  // and app roles in `roles` (array)
  if (claims.scp) {
    for (const s of claims.scp.split(" ")) scopes.add(s);
  }
  if (claims.roles) {
    for (const r of claims.roles) scopes.add(r);
  }
  return scopes;
}

export async function verifyToken(
  token: string,
  config: EntraConfig,
): Promise<TokenClaims> {
  const jwks = getJwks(config.tenantId);

  const { payload } = await jwtVerify(token, jwks, {
    issuer: `https://login.microsoftonline.com/${config.tenantId}/v2.0`,
    audience: config.clientId,
  });

  if (config.requiredScopes?.length) {
    const granted = extractScopes(payload as TokenClaims);
    const missing = config.requiredScopes.filter((s) => !granted.has(s));
    if (missing.length > 0) {
      throw new Error(`Insufficient scopes: ${missing.join(" ")}`);
    }
  }

  return payload as TokenClaims;
}

export function protectedResourceMetadata(
  config: EntraConfig,
  serverUrl: string,
) {
  return {
    resource: serverUrl,
    bearer_methods_supported: ["header"],
    authorization_servers: [
      `https://login.microsoftonline.com/${config.tenantId}/v2.0`,
    ],
    scopes_supported: [`api://${config.clientId}/MCP.ReadWrite`],
  };
}
