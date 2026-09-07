#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { APP_KEYS, baseUrlFor, type AppKey } from "./apps.js";
import { TOOL_CATALOG, type ToolSpec } from "./catalog.js";
import { buildUrl, callApi } from "./http-client.js";
import { searchTools } from "./search.js";
import { serializeToolResponse } from "./tool-output.js";

export function buildPath(tool: ToolSpec, args: Record<string, unknown>): string {
  let path = tool.pathTemplate;
  for (const param of tool.pathParams) {
    const value = args[param];
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`Falta el parámetro requerido "${param}" para el tool "${tool.name}".`);
    }
    path = path.replace(`{${param}}`, encodeURIComponent(value));
  }
  return path;
}

export function buildQuery(tool: ToolSpec, args: Record<string, unknown>): Record<string, string | undefined> {
  const query: Record<string, string | undefined> = {};
  for (const key of Object.keys(tool.querySchema)) {
    const value = args[key];
    // Varios querySchema usan z.coerce.number()/z.coerce.boolean() (ej. "anio", "mes") — el
    // cliente MCP envía el tipo declarado (number/boolean), no un string. Antes esto se
    // descartaba en silencio (typeof value === "string" fallaba), así que el filtro nunca
    // llegaba a la API real sin ningún error visible para el agente.
    query[key] = typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : undefined;
  }
  return query;
}

export function findTool(name: string): ToolSpec | undefined {
  return TOOL_CATALOG.find((tool) => tool.name === name);
}

/** GET de solo lectura contra la API Express real de la app del tool, pass-through 1:1 del `{ status, body }`. */
export async function invokeTool(tool: ToolSpec, args: Record<string, unknown>) {
  try {
    const path = buildPath(tool, args);
    const query = buildQuery(tool, args);
    const url = buildUrl(baseUrlFor(tool.app), path, query);
    const { status, body } = await callApi(url);
    return {
      content: [{ type: "text" as const, text: serializeToolResponse(status, body) }],
      isError: status >= 500,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text" as const, text: message }], isError: true };
  }
}

/**
 * En vez de registrar un tool MCP por cada una de las 142 entradas de
 * `TOOL_CATALOG` (costo de contexto fijo por sesión, aunque el cliente use 2 o 3),
 * se exponen 2 meta-tools: `rastro_buscar_tools` descubre el nombre exacto por
 * palabra clave/app, `rastro_llamar` ejecuta ese nombre contra la API real vía la
 * misma lógica `buildPath`/`buildQuery`/`callApi` de siempre. Onboardear una app
 * nueva ahora es solo agregar filas a `TOOL_CATALOG` — no crece la superficie que
 * un cliente MCP carga por adelantado.
 */
function registerMetaTools(server: McpServer): void {
  server.registerTool(
    "rastro_buscar_tools",
    {
      title: "rastro_buscar_tools",
      description:
        `Busca en el catálogo de ${TOOL_CATALOG.length} tools de solo lectura de Rastro (una por endpoint GET ` +
        "real de cada app) por palabra clave y/o app. Los tools no están precargados individualmente — usa esto " +
        "primero para encontrar el nombre exacto y sus parámetros antes de llamarlo con rastro_llamar.",
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe('Palabras clave a buscar en nombre/descripción/app (ej. "ejecución presupuestal"). Vacío u omitido lista sin filtrar por texto.'),
        app: z.enum(APP_KEYS).optional().describe('Restringe la búsqueda a una sola app, ej. "infobras".'),
        limit: z.coerce.number().int().min(1).max(50).optional().describe("Máximo de resultados a devolver (default 20)."),
      },
    },
    async ({ query, app, limit }) => {
      const results = searchTools(TOOL_CATALOG, query ?? "", app as AppKey | undefined, limit);
      return { content: [{ type: "text" as const, text: JSON.stringify({ total: results.length, tools: results }, null, 2) }] };
    }
  );

  server.registerTool(
    "rastro_llamar",
    {
      title: "rastro_llamar",
      description:
        "Ejecuta un tool de Rastro por su nombre exacto (obtenido con rastro_buscar_tools) contra la API real de " +
        "su app. `args` lleva tanto los path params requeridos como los query params opcionales de ese tool.",
      inputSchema: {
        tool: z.string().min(1).describe('Nombre exacto del tool, ej. "infobras_public_work_by_codigo".'),
        args: z.record(z.unknown()).optional().describe("Params del tool (path + query) como pares clave-valor."),
      },
    },
    async ({ tool: toolName, args }) => runRastroLlamar(toolName, args as Record<string, unknown> | undefined)
  );
}

/** Cuerpo de `rastro_llamar`, extraído para poder probarlo sin pasar por el registro MCP. */
export async function runRastroLlamar(toolName: string, args?: Record<string, unknown>) {
  const tool = findTool(toolName);
  if (!tool) {
    return {
      content: [{ type: "text" as const, text: `No existe un tool llamado "${toolName}". Usa rastro_buscar_tools para encontrar el nombre exacto.` }],
      isError: true,
    };
  }
  return invokeTool(tool, args ?? {});
}

async function main(): Promise<void> {
  const server = new McpServer({ name: "appsperu-mcp-server", version: "0.1.0" });
  registerMetaTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`appsperu-mcp-server: 2 meta-tools registrados (catálogo de ${TOOL_CATALOG.length} tools buscable), esperando por stdio.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("appsperu-mcp-server falló al iniciar:", err);
    process.exit(1);
  });
}
