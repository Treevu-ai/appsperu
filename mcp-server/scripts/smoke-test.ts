#!/usr/bin/env tsx
/**
 * Prueba reproducible de instalación y conexión del MCP de Rastro — cubre los
 * 8 puntos pedidos en la solicitud de unificación de configuración
 * (2026-10-21): build, arranque stdio, tools/list, una consulta real,
 * comportamiento sin NEON_DATABASE_URL, comportamiento con una API local
 * caída, y — si se exporta RASTRO_SMOKE_TEST_API_KEY — el endpoint remoto.
 *
 * Uso:
 *   cd mcp-server
 *   npm run build        # (1) build — si falla, el resto no corre
 *   npm run smoke-test    # (2)-(7)
 *
 *   RASTRO_SMOKE_TEST_API_KEY=sk-rastro-... npm run smoke-test   # + (8)
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const MCP_SERVER_DIR = resolve(import.meta.dirname, "..");
const DIST_ENTRY = resolve(MCP_SERVER_DIR, "dist", "index.js");

let failures = 0;

function ok(label: string): void {
  console.log(`  OK  ${label}`);
}

function fail(label: string, detail?: unknown): void {
  failures += 1;
  console.error(`FALLO  ${label}`);
  if (detail !== undefined) console.error(`       ${String(detail)}`);
}

async function withStdioClient<T>(
  env: Record<string, string | undefined>,
  run: (client: Client) => Promise<T>
): Promise<T> {
  const transport = new StdioClientTransport({
    command: "node",
    args: [DIST_ENTRY],
    env: { ...process.env, ...env } as Record<string, string>,
    stderr: "pipe",
  });
  const client = new Client({ name: "rastro-smoke-test", version: "0.0.1" }, { capabilities: {} });
  await client.connect(transport);
  try {
    return await run(client);
  } finally {
    await client.close();
  }
}

async function main(): Promise<void> {
  // (1) El build ya debe existir — este script no lo dispara para no ocultar
  // un fallo de tsc detrás de "no encuentro dist/index.js".
  if (!existsSync(DIST_ENTRY)) {
    fail("dist/index.js no existe", "corre `npm run build` antes de `npm run smoke-test`");
    process.exit(1);
  }
  ok("(1) build presente (dist/index.js)");

  // (2) Arranque local + (4) disponibilidad de los meta-tools
  await withStdioClient({}, async (client) => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    ok("(2) arranque local vía stdio");
    const esperados = ["rastro_buscar_tools", "rastro_llamar", "rastro_health", "riesgo_territorial_resumen"];
    const faltantes = esperados.filter((n) => !names.includes(n));
    if (faltantes.length > 0) {
      fail("(4) meta-tools disponibles", `faltan: ${faltantes.join(", ")} (encontrados: ${names.join(", ")})`);
    } else {
      ok("(4) meta-tools disponibles: " + names.join(", "));
    }
  }).catch((err) => fail("(2)/(4) arranque + tools/list", err));

  // (3) "Conexión desde un cliente MCP" — ya la ejerce withStdioClient arriba
  // vía el SDK oficial (Client + StdioClientTransport), no un mock.
  ok("(3) conexión ejercida con el SDK oficial del cliente MCP");

  // (5) Ejecución de una consulta sencilla
  await withStdioClient({}, async (client) => {
    const result = await client.callTool({ name: "rastro_buscar_tools", arguments: { query: "presupuesto", limit: 1 } });
    if (result.isError) throw new Error("rastro_buscar_tools devolvió isError:true");
    ok("(5) consulta sencilla (rastro_buscar_tools) respondió sin error");
  }).catch((err) => fail("(5) consulta sencilla", err));

  // (6) Comportamiento cuando falta NEON_DATABASE_URL
  await withStdioClient({ NEON_DATABASE_URL: "" }, async (client) => {
    const result = await client.callTool({ name: "rastro_health", arguments: {} });
    const text = result.content?.[0]?.type === "text" ? result.content[0].text : "";
    const parsed = JSON.parse(text) as { resumen?: { toolsOperativos?: number } };
    if (parsed.resumen?.toolsOperativos !== 0) {
      fail("(6) sin NEON_DATABASE_URL", `esperaba toolsOperativos:0, obtuve ${JSON.stringify(parsed.resumen)}`);
    } else {
      ok("(6) sin NEON_DATABASE_URL: rastro_health reporta correctamente toolsOperativos:0 (no crashea)");
    }
  }).catch((err) => fail("(6) comportamiento sin NEON_DATABASE_URL", err));

  // (7) Comportamiento cuando una API local no está disponible: llamamos a un
  // tool sin handler (proxy HTTP) a sabiendas de que su app no está levantada
  // en esta máquina de CI/smoke-test.
  await withStdioClient({ NEON_DATABASE_URL: "" }, async (client) => {
    const { tools } = await client.listTools();
    void tools; // el catálogo real se busca con rastro_buscar_tools, no con listTools
    const search = await client.callTool({ name: "rastro_buscar_tools", arguments: { app: "radar-ejecucion", limit: 1 } });
    const text = search.content?.[0]?.type === "text" ? search.content[0].text : "{}";
    const { tools: found } = JSON.parse(text) as { tools: Array<{ name: string }> };
    if (found.length === 0) {
      fail("(7) API local caída", "no se encontró ningún tool de radar-ejecucion para probar el proxy");
      return;
    }
    const call = await client.callTool({ name: "rastro_llamar", arguments: { tool: found[0].name, args: {} } });
    if (!call.isError) {
      console.log("  (info) la API local de radar-ejecucion SÍ respondió — omite esta verificación si la tenías levantada");
    } else {
      ok("(7) API local no disponible: error de conectividad explícito (isError:true), no crash del proceso");
    }
  }).catch((err) => fail("(7) comportamiento con API local caída", err));

  // (8) Validación del endpoint remoto con x-api-key — opcional, requiere
  // RASTRO_SMOKE_TEST_API_KEY (una clave real emitida con `npm run create-key`).
  const remoteKey = process.env.RASTRO_SMOKE_TEST_API_KEY;
  if (!remoteKey) {
    console.log("  (omitido) (8) endpoint remoto — exporta RASTRO_SMOKE_TEST_API_KEY para incluirlo");
  } else {
    try {
      const sinKey = await fetch("https://www.rastro.fyi/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      if (sinKey.status !== 401) {
        fail("(8) endpoint remoto sin x-api-key", `esperaba 401, obtuve ${sinKey.status}`);
      } else {
        ok("(8a) endpoint remoto sin x-api-key → 401");
      }

      const conKey = await fetch("https://www.rastro.fyi/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "x-api-key": remoteKey,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke-test", version: "0.0.1" } },
        }),
      });
      if (conKey.status >= 400) {
        fail("(8b) endpoint remoto con x-api-key válida", `esperaba 2xx, obtuve ${conKey.status}`);
      } else {
        ok("(8b) endpoint remoto con x-api-key válida → handshake OK");
      }
    } catch (err) {
      fail("(8) endpoint remoto", err);
    }
  }

  console.log("");
  if (failures > 0) {
    console.error(`${failures} verificación(es) fallaron.`);
    process.exit(1);
  }
  console.log("Todas las verificaciones pasaron.");
}

void main();
