import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import { buildMcpServer } from "./index.js";
import type { Env } from "./env.js";
import type { ApiKeyRecord } from "./auth/api-key.js";

/**
 * Cloudflare Workers habla Web Standards (Request/Response), no los streams de
 * Node que asume `server/streamableHttp.js`. Por eso se usa el transporte
 * `webStandardStreamableHttp`, que devuelve un `Response` ya construido.
 *
 * Antes se usaba el transporte de Node con un `WorkerResponseAdapter` que
 * emulaba la mitad del contrato: `write`/`end`/`json` sí, pero no `on` ni
 * `destroy`. Eso rompía de dos formas distintas al inicializar sesión — primero
 * `outgoing.on is not a function` (500), y una vez añadidos esos métodos, el
 * SDK seguía sin ver el `Accept` del request y respondía 406. Ninguna de las
 * dos era un problema de Neon; era el shim. Con el transporte web no hace falta
 * adaptar nada.
 */
/**
 * Cada request crea su propio transport. Un isolate de Workers es efímero y se
 * atiende en paralelo: guardar sesiones en un `Map` de módulo funciona solo si
 * las peticiones consecutivas caen en el mismo isolate, y en la práctica no es
 * garantía — el cliente recibe un `mcp-session-id` válido y la petición
 * siguiente aterriza en otro isolate con el mapa vacío ("Sesión MCP inválida").
 *
 * El modo stateless del SDK (sin `sessionIdGenerator`) elimina ese acoplamiento.
 * El precio: se reconstruye el server por request y no hay stream SSE abierto,
 * así que GET/DELETE no tienen sentido sin estado de sesión.
 */
async function answerPost(request: Request, env: Env): Promise<Response> {
  const body = await request.clone().json().catch(() => null);
  if (body === null) {
    return jsonResponse({ error: "Cuerpo JSON inválido." }, 400);
  }

  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  const activeKey = await validateKeyForEnv(request.headers.get("x-api-key") ?? "", env);
  const server = buildMcpServer(activeKey, env as Record<string, unknown>);
  await server.connect(transport);

  try {
    return await transport.handleRequest(request, { parsedBody: body });
  } finally {
    await transport.close().catch(() => {});
  }
}

async function validateKeyForEnv(rawKey: string, env: Env): Promise<ApiKeyRecord | null> {
  if (!env.NEON_DATABASE_URL) return null;
  const { validateApiKey } = await import("./auth/api-key.js");
  const result = await validateApiKey(rawKey, env);
  return result.ok ? result.key : null;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Cloudflare Worker handler — reemplaza Express http-transport.ts.
 * Soporta MCP sobre Streamable HTTP (Claude Desktop, Cursor, agents).
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    void ctx;
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return jsonResponse({ status: "ok" }, 200);
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
          return jsonResponse({ error: "x-api-key inválida." }, 401);
        }
      }
    }

    if (method === "POST") {
      return answerPost(request, env);
    }

    if (method === "GET" || method === "DELETE") {
      return jsonResponse(
        {
          error:
            "Transporte MCP stateless: sin estado de sesión no hay stream SSE. El protocolo se sirve por POST/JSON.",
        },
        405
      );
    }

    return new Response("Method not allowed", { status: 405 });
  },
};
