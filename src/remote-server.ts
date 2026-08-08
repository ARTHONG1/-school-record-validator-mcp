import { timingSafeEqual } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import { hostHeaderValidation } from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type { Services } from "./handlers.ts";
import type { RemoteConfig } from "./remote-config.ts";
import { createServer } from "./server.ts";

interface LegacySession {
  transport: SSEServerTransport;
  server: ReturnType<typeof createServer>;
}

export interface RemoteApp {
  app: Express;
  close(): Promise<void>;
}

export interface ListeningRemoteApp {
  port: number;
  close(): Promise<void>;
}

function jsonRpcError(res: Response, status: number, message: string): void {
  res.status(status).json({
    jsonrpc: "2.0",
    error: { code: status === 500 ? -32603 : -32000, message },
    id: null,
  });
}

function authorized(header: string | undefined, token: string): boolean {
  if (header === undefined || !header.startsWith("Bearer ")) return false;
  const provided = Buffer.from(header.slice("Bearer ".length), "utf8");
  const expected = Buffer.from(token, "utf8");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function bearerAuth(token: string | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (token === undefined || authorized(req.header("authorization"), token)) {
      next();
      return;
    }
    res.setHeader("WWW-Authenticate", 'Bearer realm="school-record-validator"');
    res.status(401).json({ error: "unauthorized" });
  };
}

export function createRemoteApp(services: Services, config: RemoteConfig): RemoteApp {
  const app = express();
  const parseJson = express.json({ limit: "10mb" });
  if (config.allowedHosts !== undefined) {
    app.use(hostHeaderValidation(config.allowedHosts));
  }
  const sessions = new Map<string, LegacySession>();
  const requireAuth = bearerAuth(config.authToken);

  app.disable("x-powered-by");
  app.get(["/health", "/healthz"], (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ status: "ok" });
  });

  app.all("/mcp", requireAuth, parseJson, async (req, res) => {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      jsonRpcError(res, 405, "Method not allowed");
      return;
    }

    const server = createServer(services);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    let closed = false;
    const close = async (): Promise<void> => {
      if (closed) return;
      closed = true;
      await server.close().catch(() => undefined);
    };

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) jsonRpcError(res, 500, "Internal server error");
    } finally {
      await close();
    }
  });

  if (config.enableLegacySse) {
    app.get("/sse", requireAuth, async (_req, res) => {
      const transport = new SSEServerTransport("/messages", res);
      const server = createServer(services);
      const sessionId = transport.sessionId;
      sessions.set(sessionId, { transport, server });
      transport.onclose = () => {
        sessions.delete(sessionId);
      };
      try {
        await server.connect(transport);
      } catch {
        sessions.delete(sessionId);
        if (!res.headersSent) res.status(500).json({ error: "connection_failed" });
      }
    });

    app.post("/messages", requireAuth, parseJson, async (req, res) => {
      const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : undefined;
      const session = sessionId === undefined ? undefined : sessions.get(sessionId);
      if (session === undefined) {
        res.status(404).json({ error: "session_not_found" });
        return;
      }
      try {
        await session.transport.handlePostMessage(req, res, req.body);
      } catch {
        if (!res.headersSent) res.status(500).json({ error: "request_failed" });
      }
    });
  } else {
    app.all(["/sse", "/messages"], (_req, res) => {
      res.status(404).json({ error: "not_found" });
    });
  }

  app.use((_req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = typeof error === "object" && error !== null && "status" in error
      && typeof error.status === "number" && error.status === 413
      ? 413
      : 400;
    res.status(status).json({ error: status === 413 ? "payload_too_large" : "invalid_json" });
  });

  return {
    app,
    async close() {
      const active = [...sessions.values()];
      sessions.clear();
      await Promise.all(active.map(async ({ server }) => {
        await server.close().catch(() => undefined);
      }));
    },
  };
}

export async function listenRemoteApp(
  remote: RemoteApp,
  address: { host: string; port: number },
): Promise<ListeningRemoteApp> {
  const httpServer = await new Promise<HttpServer>((resolve, reject) => {
    const server = remote.app.listen(address.port, address.host, () => resolve(server));
    server.once("error", reject);
  });
  const socketAddress = httpServer.address();
  if (socketAddress === null || typeof socketAddress === "string") {
    httpServer.close();
    throw new Error("Remote server did not bind to a TCP port");
  }
  return {
    port: socketAddress.port,
    async close() {
      await remote.close();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => error ? reject(error) : resolve());
      });
    },
  };
}
