import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { bootstrap } from "./bootstrap.js";
import {
  verifyToken,
  protectedResourceMetadata,
  type EntraConfig,
} from "../auth/entra.js";

const PORT = parseInt(process.env.PORT || "8080", 10);
const HOST = process.env.HOST || "0.0.0.0";

const TENANT_ID = process.env.AZURE_TENANT_ID ?? "";
const CLIENT_ID = process.env.AZURE_CLIENT_ID ?? "";

const entra: EntraConfig | null =
  TENANT_ID && CLIENT_ID
    ? { tenantId: TENANT_ID, clientId: CLIENT_ID }
    : null;

class AuthError extends Error {
  readonly status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

async function authenticate(req: IncomingMessage): Promise<void> {
  if (!entra) return;
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new AuthError("Missing bearer token");
  }
  await verifyToken(header.slice(7), entra);
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function setCors(res: ServerResponse): void {
  const origin = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");
}

async function main(): Promise<void> {
  const { createServer, sandbox } = await bootstrap();
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = createHttpServer(async (req, res) => {
    const url = req.url ?? "/";
    setCors(res);

    if (url === "/health") {
      return json(res, 200, {
        status: "ok",
        version: "0.3.0",
        auth: !!entra,
      });
    }

    // RFC 9728 OAuth Protected Resource Metadata
    if (url === "/.well-known/oauth-protected-resource" && entra) {
      const proto = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers.host || "localhost";
      return json(
        res,
        200,
        protectedResourceMetadata(entra, `${proto}://${host}`),
      );
    }

    if (req.method === "OPTIONS") {
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, DELETE, OPTIONS",
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, mcp-session-id",
      );
      res.writeHead(204);
      return res.end();
    }

    if (url === "/mcp") {
      try {
        await authenticate(req);
      } catch (err) {
        const status = err instanceof AuthError ? err.status : 401;
        const msg = err instanceof Error ? err.message : "Auth failed";
        return json(res, status, { error: msg });
      }

      const rawSid = req.headers["mcp-session-id"];
      const sessionId = Array.isArray(rawSid) ? rawSid[0] : rawSid;

      // New session
      if (req.method === "POST" && !sessionId) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            sessions.set(sid, transport);
          },
        });
        transport.onclose = () => {
          if (transport.sessionId) sessions.delete(transport.sessionId);
        };
        const server = createServer();
        await server.connect(transport);
        await transport.handleRequest(req, res);
        return;
      }

      // Existing session
      if (sessionId) {
        const transport = sessions.get(sessionId);
        if (!transport) return json(res, 404, { error: "Session not found" });
        await transport.handleRequest(req, res);
        return;
      }

      return json(res, 400, {
        error: "POST to create session or provide mcp-session-id",
      });
    }

    json(res, 404, { error: "Not found" });
  });

  httpServer.listen(PORT, HOST, () => {
    process.stderr.write(`maryn http: http://${HOST}:${PORT}/mcp\n`);
    if (entra) {
      process.stderr.write(`auth: Entra ID tenant=${TENANT_ID}\n`);
    } else {
      process.stderr.write(
        "auth: disabled (set AZURE_TENANT_ID + AZURE_CLIENT_ID)\n",
      );
    }
  });

  const shutdown = async () => {
    for (const t of sessions.values()) await t.close().catch(() => {});
    await sandbox.stop();
    httpServer.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err: unknown) => {
  process.stderr.write(
    `maryn-http: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
