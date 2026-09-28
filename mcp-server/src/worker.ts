import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import { buildMcpServer } from "./index.js";
import type { Env } from "./env.js";
import type { ApiKeyRecord } from "./auth/api-key.js";

const transports: Record<string, StreamableHTTPServerTransport> = {};

/**
 * Pseudo ServerResponse que adapta la Node.js-style API (setHeader, writeHead,
 * write, end, json, status) al modelo Web Streams de Workers.
 * El StreamableHTTPServerTransport necesita este interface para enviar
 * respuestas HTTP al cliente MCP.
 */
class WorkerResponseAdapter {
  private headers: Record<string, string> = {};
  private bodyChunks: Uint8Array[] = [];
  private statusCode: number = 200;
  private _ended: boolean = false;

  setStatus(code: number): this {
    this.statusCode = code;
    return this;
  }

  setHeader(name: string, value: string | string[]): this {
    this.headers[name] = Array.isArray(value) ? value.join(", ") : value;
    return this;
  }

  writeHead(statusCode: number, headers?: Record<string, string>): this {
    this.statusCode = statusCode;
    if (headers) {
      Object.assign(this.headers, headers);
    }
    return this;
  }

  write(chunk: string | Uint8Array): this {
    if (this._ended) return this;
    if (typeof chunk === "string") {
      this.bodyChunks.push(new TextEncoder().encode(chunk));
    } else {
      this.bodyChunks.push(chunk);
    }
    return this;
  }

  json(data: unknown): this {
    const jsonStr = JSON.stringify(data);
    this.setHeader("content-type", "application/json");
    this.write(jsonStr);
    this.end();
    return this;
  }

  end(): this {
    this._ended = true;
    return this;
  }

  get status(): number {
    return this.statusCode;
  }

  get response(): Response {
    const body = this.bodyChunks.length > 0 ? concatUint8Arrays(this.bodyChunks) : undefined;
    return new Response(body as BodyInit, { status: this.statusCode, headers: this.headers });
  }

  flushHeaders(): this {
    return this;
  }
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

async function validateKeyForEnv(rawKey: string, env: Env): Promise<ApiKeyRecord | null> {
  if (!env.MCP_DB) return null;
  const { validateApiKey } = await import("./auth/api-key.js");
  const result = await validateApiKey(rawKey, { MCP_DB: env.MCP_DB });
  return result.ok ? result.key : null;
}

/**
 * Cloudflare Worker handler — reemplaza Express http-transport.ts.
 * Soporta MCP sobre Streamable HTTP (Claude Desktop, Cursor, agents).
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { "content-type": "application/json" },
      });
    }

    if (url.pathname !== "/mcp") {
      return new Response("Not found", { status: 404 });
    }

    const method = request.method;

    // Auth: valida x-api-key en POST y GET (modo abierto si no se provee)
    if (method === "POST" || method === "GET") {
      const rawKey = request.headers.get("x-api-key");
      if (rawKey) {
        const activeKey = await validateKeyForEnv(rawKey, env);
        if (!activeKey) {
          return new Response(JSON.stringify({ error: "x-api-key inválida." }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
      }
    }

    if (method === "POST") {
      const body = await request.clone().json().catch(() => null);
      const sessionId = request.headers.get("mcp-session-id");

      // Existing session — delegate to transport
      if (sessionId && transports[sessionId]) {
        const adapter = new WorkerResponseAdapter();
        await transports[sessionId].handleRequest(request as never, adapter as never, body);
        return adapter.response;
      }

      // New session — initialize
      if (!sessionId && body && isInitializeRequest(body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            transports[newSessionId] = transport;
          },
        });
        transport.onclose = () => {
          if (transport.sessionId) delete transports[transport.sessionId];
        };

        const activeKey = await validateKeyForEnv(request.headers.get("x-api-key") ?? "", env);
        const server = buildMcpServer(activeKey, env as Record<string, unknown>);
        await server.connect(transport);

        const adapter = new WorkerResponseAdapter();
        await transport.handleRequest(request as never, adapter as never, body);
        return adapter.response;
      }

      return new Response(
        JSON.stringify({
          error: "Sesión MCP inválida: falta mcp-session-id de una sesión existente, o el request no es un initialize.",
        }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    if (method === "GET" || method === "DELETE") {
      const sessionId = request.headers.get("mcp-session-id");
      const transport = sessionId ? transports[sessionId] : undefined;
      if (!transport) {
        return new Response(JSON.stringify({ error: "Sesión MCP inválida o inexistente." }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
      const adapter = new WorkerResponseAdapter();
      await transport.handleRequest(request as never, adapter as never);
      return adapter.response;
    }

    return new Response("Method not allowed", { status: 405 });
  },
};
