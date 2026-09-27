/**
 * Vista compuesta `riesgo-territorial`.
 *
 * Orchestra 4 tools existentes del catálogo y devuelve un solo response agregado:
 * - territorio_inteligencia_captura_territorio
 * - geo_intersections_reporte
 * - territorio_inteligencia_riesgo_eudr
 * - emergencias_indeci_preparacion_riesgo
 *
 * Cada fuente puede fallar independientemente — se captura el error y se
 * agrega a `fuentesFallidas`; las demás se incluyen en `fuentesRespondidas`.
 */

import { findTool, invokeTool } from "../index.js";

export interface RiesgoTerritorialParams {
  departamento: string;
  ruc?: string;
}

interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

interface RiesgoTerritorialMetadata {
  departamento: string;
  ruc?: string;
  generadoEn: string;
  fuentesRespondidas: string[];
  fuentesFallidas: string[];
}

export interface RiesgoTerritorialResponse {
  metadata: RiesgoTerritorialMetadata;
  captura: ToolResult;
  superposiciones: ToolResult;
  eudr: ToolResult;
  emergencias: ToolResult;
  resumen: {
    totalRucsConcentracion: number;
    superposicionesCount: number;
    nivelRiesgoEudr: "BAJO" | "MEDIO" | "ALTO" | "CRITICO" | "N/A";
    emergenciasActivasCount: number;
  };
}

/** Nombres exactos de las 4 tools del catálogo que esta vista composea. */
const TOOL_NAMES = {
  captura: "territorio_inteligencia_captura_territorio",
  superposiciones: "geo_intersections_reporte",
  eudr: "territorio_inteligencia_riesgo_eudr",
  emergencias: "emergencias_indeci_preparacion_riesgo",
} as const;

/** Keys del resumen que se extraen de cada respuesta. */
type SummaryKey = keyof typeof TOOL_NAMES;

function parseEudrNivel(raw: unknown): "BAJO" | "MEDIO" | "ALTO" | "CRITICO" | "N/A" {
  if (!raw || typeof raw !== "object") return "N/A";
  const obj = raw as Record<string, unknown>;
  const nivel = String(obj.nivel ?? obj.riesgo ?? obj.nivelRiesgo ?? "").toUpperCase();
  if (nivel === "BAJO" || nivel === "MEDIO" || nivel === "ALTO" || nivel === "CRITICO") {
    return nivel;
  }
  return "N/A";
}

function countSuperposiciones(raw: unknown): number {
  if (!raw || typeof raw !== "object") return 0;
  const obj = raw as Record<string, unknown>;
  const data = obj.data ?? obj.superposiciones ?? obj.intersecciones ?? obj.items;
  if (Array.isArray(data)) return data.length;
  if (typeof obj.count === "number") return obj.count;
  if (typeof obj.total === "number") return obj.total;
  return 0;
}

function countEmergenciasActivas(raw: unknown): number {
  if (!raw || typeof raw !== "object") return 0;
  const obj = raw as Record<string, unknown>;
  const data = obj.data ?? obj.emergencias ?? obj.eventos ?? obj.items;
  if (Array.isArray(data)) return data.length;
  if (typeof obj.count === "number") return obj.count;
  if (typeof obj.total === "number") return obj.total;
  return 0;
}

function countRucsConcentracion(raw: unknown): number {
  if (!raw || typeof raw !== "object") return 0;
  const obj = raw as Record<string, unknown>;
  const data = obj.data ?? obj.rucs ?? obj.items;
  if (Array.isArray(data)) return data.length;
  if (typeof obj.count === "number") return obj.count;
  if (typeof obj.total === "number") return obj.total;
  return 0;
}

/**
 * Ejecuta las 4 tools del catálogo en paralelo, captura errores independientes,
 * y devuelve el response unificado con metadata y resumen.
 */
export async function runRiesgoTerritorial(params: RiesgoTerritorialParams): Promise<RiesgoTerritorialResponse> {
  const { departamento, ruc } = params;
  const fuentesRespondidas: string[] = [];
  const fuentesFallidas: string[] = [];

  const [capturaRaw, superposicionesRaw, eudrRaw, emergenciasRaw] = await Promise.all([
    invokeToolFor("captura", { departamento, ...(ruc ? { ruc } : {}) }),
    invokeToolFor("superposiciones", { departamento }),
    invokeToolFor("eudr", { departamento, ...(ruc ? { ruc } : {}) }),
    invokeToolFor("emergencias", { departamento }),
  ]);

  const results: Record<SummaryKey, ToolResult> = {
    captura: capturaRaw,
    superposiciones: superposicionesRaw,
    eudr: eudrRaw,
    emergencias: emergenciasRaw,
  };

  for (const [key, result] of Object.entries(results)) {
    const toolName = TOOL_NAMES[key as SummaryKey];
    if (result.ok) {
      fuentesRespondidas.push(toolName);
    } else {
      fuentesFallidas.push(toolName);
    }
  }

  // Parsear respuestas para el resumen
  let capturaParsed: unknown = null;
  let superposicionesParsed: unknown = null;
  let eudrParsed: unknown = null;
  let emergenciasParsed: unknown = null;

  if (capturaRaw.ok && capturaRaw.data) {
    try {
      capturaParsed = typeof capturaRaw.data === "string" ? JSON.parse(capturaRaw.data) : capturaRaw.data;
    } catch {
      // no parsear
    }
  }
  if (superposicionesRaw.ok && superposicionesRaw.data) {
    try {
      superposicionesParsed = typeof superposicionesRaw.data === "string" ? JSON.parse(superposicionesRaw.data) : superposicionesRaw.data;
    } catch {
      // no parsear
    }
  }
  if (eudrRaw.ok && eudrRaw.data) {
    try {
      eudrParsed = typeof eudrRaw.data === "string" ? JSON.parse(eudrRaw.data) : eudrRaw.data;
    } catch {
      // no parsear
    }
  }
  if (emergenciasRaw.ok && emergenciasRaw.data) {
    try {
      emergenciasParsed = typeof emergenciasRaw.data === "string" ? JSON.parse(emergenciasRaw.data) : emergenciasRaw.data;
    } catch {
      // no parsear
    }
  }

  const resumen = {
    totalRucsConcentracion: countRucsConcentracion(capturaParsed),
    superposicionesCount: countSuperposiciones(superposicionesParsed),
    nivelRiesgoEudr: parseEudrNivel(eudrParsed),
    emergenciasActivasCount: countEmergenciasActivas(emergenciasParsed),
  };

  return {
    metadata: {
      departamento,
      ruc,
      generadoEn: new Date().toISOString(),
      fuentesRespondidas,
      fuentesFallidas,
    },
    captura: capturaRaw,
    superposiciones: superposicionesRaw,
    eudr: eudrRaw,
    emergencias: emergenciasRaw,
    resumen,
  };
}

/**
 * Invoca una tool del catálogo por nombre y devuelve {ok, data?, error?}.
 * Si la tool no existe en el catálogo, se reporta como error.
 */
async function invokeToolFor(
  key: keyof typeof TOOL_NAMES,
  args: Record<string, string>
): Promise<ToolResult> {
  const toolName = TOOL_NAMES[key];
  const tool = findTool(toolName);
  if (!tool) {
    return { ok: false, error: `Tool "${toolName}" no encontrada en el catálogo.` };
  }

  try {
    const result = await invokeTool(tool, args);

    // invokeTool devuelve { content: [{type, text}], isError }
    // Extraer el texto del content
    const text = Array.isArray(result.content) && result.content.length > 0
      ? (result.content[0] as { type: string; text: string }).text
      : "";

    if (result.isError) {
      return { ok: false, error: text };
    }

    // Intentar parsear como JSON; si falla, devolver como texto
    try {
      const parsed = JSON.parse(text);
      return { ok: true, data: parsed };
    } catch {
      return { ok: true, data: text };
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, error };
  }
}
