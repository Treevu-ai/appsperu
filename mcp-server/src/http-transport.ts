import { randomUUID } from "node:crypto";
import express, { type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { requireApiKey } from "./auth/http-api-key.js";
import { buildMcpServer } from "./index.js";

/**
 * Fase 1-D: transporte Streamable HTTP sobre Express (Node.js local).
  * Usa pg Pool (no Neon) — el secret de Neon solo está disponible en el Worker.
 * La migración a Worker pasa por worker.ts con `Env` tipado.
 */
const transports: Record<string, StreamableHTTPServerTransport> = {};

async function handleMcpPost(req: Request, res: Response): Promise<void> {
  const sessionId = req.header("mcp-session-id");

  if (sessionId && transports[sessionId]) {
    await transports[sessionId].handleRequest(req, res, req.body);
    return;
  }

  if (!sessionId && isInitializeRequest(req.body)) {
    const activeKey = req.apiKey!;
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSessionId) => {
        transports[newSessionId] = transport;
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) delete transports[transport.sessionId];
    };

    const server = buildMcpServer(activeKey, undefined);
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    return;
  }

  res.status(400).json({
    error: "Sesión MCP inválida: falta mcp-session-id de una sesión existente, o el request no es un initialize.",
  });
}

async function handleMcpSessionRequest(req: Request, res: Response): Promise<void> {
  const sessionId = req.header("mcp-session-id");
  const transport = sessionId ? transports[sessionId] : undefined;
  if (!transport) {
    res.status(400).json({ error: "Sesión MCP inválida o inexistente." });
    return;
  }
  await transport.handleRequest(req, res);
}

/** Construye la app Express sin escuchar en ningún puerto — permite testearla con supertest. */
export function createHttpApp(): express.Express {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.post("/mcp", requireApiKey(), handleMcpPost);
  app.get("/mcp", requireApiKey(), handleMcpSessionRequest);
  app.delete("/mcp", requireApiKey(), handleMcpSessionRequest);

  return app;
}

export async function startHttpTransport(): Promise<void> {
  const app = createHttpApp();
  const port = Number(process.env.PORT ?? 8080);
  await new Promise<void>((resolve) => {
    app.listen(port, () => {
      console.error(`appsperu-mcp-server: transporte HTTP escuchando en :${port} (POST/GET/DELETE /mcp, GET /health).`);
      resolve();
    });
  });
}
