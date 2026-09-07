#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { baseUrlFor } from "./apps.js";
import { TOOL_CATALOG, type ToolSpec } from "./catalog.js";
import { buildUrl, callApi } from "./http-client.js";
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

/**
 * Registra un tool MCP por cada entrada del catálogo — todos son GET
 * de solo lectura contra la API Express ya existente de cada app, sin
 * transformar el shape de la respuesta (pass-through 1:1). Un `{param}` en
 * `pathTemplate` se vuelve un campo requerido del input schema; el resto de
 * `querySchema` son query params opcionales tal como los valida cada
 * `routes/*.ts` de origen.
 */
function registerCatalog(server: McpServer): void {
  for (const tool of TOOL_CATALOG) {
    const inputSchema: Record<string, z.ZodTypeAny> = {};
    for (const param of tool.pathParams) {
      inputSchema[param] = z.string().min(1);
    }
    Object.assign(inputSchema, tool.querySchema);

    server.registerTool(
      tool.name,
      { title: tool.name, description: tool.description, inputSchema },
      async (args) => {
        const path = buildPath(tool, args as Record<string, unknown>);
        const query = buildQuery(tool, args as Record<string, unknown>);
        const url = buildUrl(baseUrlFor(tool.app), path, query);

        try {
          const { status, body } = await callApi(url);
          return {
            content: [{ type: "text", text: serializeToolResponse(status, body) }],
            isError: status >= 500,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { content: [{ type: "text", text: message }], isError: true };
        }
      }
    );
  }
}

async function main(): Promise<void> {
  const server = new McpServer({ name: "appsperu-mcp-server", version: "0.1.0" });
  registerCatalog(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`appsperu-mcp-server: ${TOOL_CATALOG.length} tools registrados, esperando por stdio.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("appsperu-mcp-server falló al iniciar:", err);
    process.exit(1);
  });
}
