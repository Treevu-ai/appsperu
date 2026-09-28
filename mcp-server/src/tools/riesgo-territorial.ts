/**
 * Vista compuesta `riesgo-territorial`.
 *
 * Orquesta 4 tools del catálogo y devuelve un solo response agregado:
 * - territorio_inteligencia_captura_territorio  (HOY NO DISPONIBLE)
 * - geo_intersections_reporte
 * - territorio_inteligencia_riesgo_eudr         (HOY NO DISPONIBLE)
 * - emergencias_indeci_preparacion_riesgo
 *
 * `territorio-inteligencia` está fuera de `APP_KEYS` y del catálogo (sin
 * ingesta real, ver apps/territorio-inteligencia/README.md), así que en la
 * práctica esta vista corre con 2 de 4 fuentes. Eso se declara en la
 * respuesta en vez de esconderse:
 *
 * - Cada fuente que no respondió de verdad va a `metadata.fuentesNoDisponibles`
 *   con un motivo: tool fuera del catálogo, HTTP >= 400, enriquecimiento no
 *   configurado en la app (`estado: ENRIQUECIMIENTO_NO_CONFIGURADO`, que la app
 *   devuelve con 200) o error de invocación.
 * - El `resumen` usa `null` (no `0` ni `"N/A"`) para cada métrica cuya fuente
 *   falta: `0` se lee como "no hay riesgo", que es justo la conclusión que no
 *   se puede sacar sin dato.
 * - `metadata.cobertura` ("N/4") y `metadata.advertencia` lo dicen en texto.
 *
 * `invokeTool` devuelve el texto de `serializeToolResponse`, es decir
 * `{ status, body }` (o `{ status, truncated: true, ... }` si excedió el
 * límite). Se desempaqueta acá: el status HTTP decide si la fuente respondió.
 */

import { findTool, invokeTool, type InvokeContext } from "../index.js";

export interface RiesgoTerritorialParams {
  departamento: string;
  ruc?: string;
}

export type MotivoNoDisponible =
  | "TOOL_NO_EN_CATALOGO"
  | "HTTP_ERROR"
  | "ENRIQUECIMIENTO_NO_CONFIGURADO"
  | "ERROR_INVOCACION";

interface ToolResult {
  ok: boolean;
  /** Status HTTP de la API de la app, cuando hubo respuesta HTTP. */
  status?: number;
  /** `body` desempaquetado de la respuesta de la app. */
  data?: unknown;
  /** `true` si la respuesta excedió el límite del tool y `data` es solo un preview. */
  truncated?: boolean;
  error?: string;
}

export interface FuenteNoDisponible {
  tool: string;
  motivo: MotivoNoDisponible;
  status?: number;
  detalle: string;
}

type NivelEudr = "BAJO" | "MEDIO" | "ALTO" | "NO_EVALUABLE";

interface RiesgoTerritorialMetadata {
  /** Lo que envió el cliente. */
  departamento: string;
  /** Nombre normalizado que se envió a las APIs (ej. "LA LIBERTAD"). */
  departamentoConsultado: string;
  ruc?: string;
  generadoEn: string;
  /** "N/4": cuántas de las 4 fuentes respondieron con dato utilizable. */
  cobertura: string;
  fuentesRespondidas: string[];
  /** Nombres de las fuentes no disponibles (compatibilidad); el motivo está en `fuentesNoDisponibles`. */
  fuentesFallidas: string[];
  fuentesNoDisponibles: FuenteNoDisponible[];
  advertencia: string;
}

export interface RiesgoTerritorialResponse {
  metadata: RiesgoTerritorialMetadata;
  captura: ToolResult;
  superposiciones: ToolResult;
  eudr: ToolResult;
  emergencias: ToolResult;
  /** Cada métrica es `null` cuando su fuente no está disponible o no se pudo leer — nunca `0` por defecto. */
  resumen: {
    totalRucsConcentracion: number | null;
    superposicionesCount: number | null;
    nivelRiesgoEudr: NivelEudr | null;
    distritosConEmergenciasCount: number | null;
  };
}

/** Nombres exactos de las 4 tools del catálogo que esta vista compone. */
export const TOOL_NAMES = {
  captura: "territorio_inteligencia_captura_territorio",
  superposiciones: "geo_intersections_reporte",
  eudr: "territorio_inteligencia_riesgo_eudr",
  emergencias: "emergencias_indeci_preparacion_riesgo",
} as const;

type SummaryKey = keyof typeof TOOL_NAMES;

const TOTAL_FUENTES = Object.keys(TOOL_NAMES).length;

/**
 * UBIGEO INEI de departamento (2 dígitos) → nombre tal como lo guardan las
 * fuentes: `DEPA` de INGEMMET (catastro-minero → `mining_departamento` de
 * geo-intersections) y el departamento de SINPAD (emergencias-indeci). Ambas
 * filtran por igualdad exacta en MAYÚSCULAS sin tildes (ej. "LA LIBERTAD");
 * ninguna acepta el código.
 */
export const DEPARTAMENTOS_POR_UBIGEO: Record<string, string> = {
  "01": "AMAZONAS",
  "02": "ANCASH",
  "03": "APURIMAC",
  "04": "AREQUIPA",
  "05": "AYACUCHO",
  "06": "CAJAMARCA",
  "07": "CALLAO",
  "08": "CUSCO",
  "09": "HUANCAVELICA",
  "10": "HUANUCO",
  "11": "ICA",
  "12": "JUNIN",
  "13": "LA LIBERTAD",
  "14": "LAMBAYEQUE",
  "15": "LIMA",
  "16": "LORETO",
  "17": "MADRE DE DIOS",
  "18": "MOQUEGUA",
  "19": "PASCO",
  "20": "PIURA",
  "21": "PUNO",
  "22": "SAN MARTIN",
  "23": "TACNA",
  "24": "TUMBES",
  "25": "UCAYALI",
};

/**
 * Acepta el UBIGEO de 2 dígitos ("13", o "1" → "01") o el nombre ("La Libertad",
 * "Junín") y devuelve el nombre en MAYÚSCULAS sin tildes. `null` si es un código
 * numérico que no corresponde a ningún departamento.
 */
export function resolverDepartamento(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d{1,2}$/.test(trimmed)) {
    return DEPARTAMENTOS_POR_UBIGEO[trimmed.padStart(2, "0")] ?? null;
  }
  return trimmed
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ");
}

const ADVERTENCIA_BASE =
  "Sin dato no significa sin riesgo: una métrica en null indica que su fuente no respondió o no está " +
  "disponible, no que el riesgo sea cero. Coincidencias territoriales y de texto, no causalidad; requiere revisión humana.";

const NIVEL_ORDEN: Record<Exclude<NivelEudr, "NO_EVALUABLE">, number> = { BAJO: 1, MEDIO: 2, ALTO: 3 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** captura-territorio devuelve un array de titulares. */
function countRucsConcentracion(body: unknown): number | null {
  return Array.isArray(body) ? body.length : null;
}

/** geo-intersections `/api/cruce/report` devuelve `{ total, resultados, ... }`; `total` es el conteo real, no la página. */
function countSuperposiciones(body: unknown): number | null {
  if (!isRecord(body)) return null;
  if (typeof body.total === "number") return body.total;
  if (Array.isArray(body.resultados)) return body.resultados.length;
  return null;
}

/**
 * emergencias-indeci `/api/crossref/preparacion-riesgo` devuelve `{ distritos: [...] }`, que
 * mezcla distritos con historial de emergencias y distritos que solo tienen proyectos: se
 * cuentan solo los que tienen `historialEmergencias`.
 */
function countDistritosConEmergencias(body: unknown): number | null {
  if (!isRecord(body) || !Array.isArray(body.distritos)) return null;
  return body.distritos.filter((d) => isRecord(d) && d.historialEmergencias != null).length;
}

/**
 * riesgo-eudr devuelve un array de `{ estadoRiesgo: ALTO|MEDIO|BAJO|NO_EVALUABLE }`: se toma el
 * peor nivel evaluado; si ninguna fila fue evaluable, `NO_EVALUABLE`; sin filas, `null`.
 */
function parseEudrNivel(body: unknown): NivelEudr | null {
  if (!Array.isArray(body) || body.length === 0) return null;
  let peor: Exclude<NivelEudr, "NO_EVALUABLE"> | null = null;
  let hayNoEvaluable = false;
  for (const row of body) {
    const estado = isRecord(row) ? String(row.estadoRiesgo ?? "").toUpperCase() : "";
    if (estado === "ALTO" || estado === "MEDIO" || estado === "BAJO") {
      if (!peor || NIVEL_ORDEN[estado] > NIVEL_ORDEN[peor]) peor = estado;
    } else if (estado === "NO_EVALUABLE") {
      hayNoEvaluable = true;
    }
  }
  return peor ?? (hayNoEvaluable ? "NO_EVALUABLE" : null);
}

/** Si la fuente no respondió o la respuesta vino truncada, la métrica es `null`. */
function metric<T>(result: ToolResult, extract: (body: unknown) => T | null): T | null {
  if (!result.ok || result.truncated) return null;
  return extract(result.data);
}

/**
 * Ejecuta las 4 tools del catálogo en paralelo, clasifica cada fuente como
 * respondida o no disponible (con motivo) y devuelve el response unificado.
 */
export async function runRiesgoTerritorial(params: RiesgoTerritorialParams, env?: Record<string, unknown>): Promise<RiesgoTerritorialResponse> {
  const { departamento, ruc } = params;
  const departamentoConsultado = resolverDepartamento(departamento);
  if (departamentoConsultado === null) {
    throw new Error(
      `Departamento "${departamento}" no reconocido: usa el UBIGEO de 2 dígitos (01-25, ej. "13") o el nombre (ej. "LA LIBERTAD").`
    );
  }

  const [captura, superposiciones, eudr, emergencias] = await Promise.all([
     invokeToolFor("captura", { departamento: departamentoConsultado }, env),
    // `limit` acotado: el resumen usa `total` (conteo real); `resultados` es solo el top por km².
    invokeToolFor("superposiciones", { departamento: departamentoConsultado, limit: 20 }, env),
    invokeToolFor("eudr", { departamento: departamentoConsultado, ...(ruc ? { ruc } : {}) }, env),
    invokeToolFor("emergencias", { departamento: departamentoConsultado }, env),
  ]);

  const results: Record<SummaryKey, { result: ToolResult; noDisponible?: FuenteNoDisponible }> = {
    captura,
    superposiciones,
    eudr,
    emergencias,
  };

  const fuentesRespondidas: string[] = [];
  const fuentesNoDisponibles: FuenteNoDisponible[] = [];
  for (const key of Object.keys(TOOL_NAMES) as SummaryKey[]) {
    const { result, noDisponible } = results[key];
    if (result.ok) fuentesRespondidas.push(TOOL_NAMES[key]);
    else if (noDisponible) fuentesNoDisponibles.push(noDisponible);
  }

  const truncadas = (Object.keys(TOOL_NAMES) as SummaryKey[]).filter(
    (key) => results[key].result.ok && results[key].result.truncated
  );

  const partes = [ADVERTENCIA_BASE];
  if (fuentesNoDisponibles.length > 0) {
    partes.push(
      `Fuentes no disponibles (${fuentesNoDisponibles.length}/${TOTAL_FUENTES}): ` +
        fuentesNoDisponibles.map((f) => `${f.tool} (${f.motivo})`).join(", ") +
        "."
    );
  }
  if (truncadas.length > 0) {
    partes.push(
      `Respuesta truncada por el límite del tool en: ${truncadas.map((k) => TOOL_NAMES[k]).join(", ")}; su métrica queda en null.`
    );
  }

  return {
    metadata: {
      departamento,
      departamentoConsultado,
      ruc,
      generadoEn: new Date().toISOString(),
      cobertura: `${fuentesRespondidas.length}/${TOTAL_FUENTES}`,
      fuentesRespondidas,
      fuentesFallidas: fuentesNoDisponibles.map((f) => f.tool),
      fuentesNoDisponibles,
      advertencia: partes.join(" "),
    },
    captura: captura.result,
    superposiciones: superposiciones.result,
    eudr: eudr.result,
    emergencias: emergencias.result,
    resumen: {
      totalRucsConcentracion: metric(captura.result, countRucsConcentracion),
      superposicionesCount: metric(superposiciones.result, countSuperposiciones),
      nivelRiesgoEudr: metric(eudr.result, parseEudrNivel),
      distritosConEmergenciasCount: metric(emergencias.result, countDistritosConEmergencias),
    },
  };
}

function errorText(body: unknown): string {
  if (isRecord(body)) {
    const msg = body.error ?? body.detalle ?? body.message;
    if (typeof msg === "string") return msg;
  }
  return typeof body === "string" ? body : JSON.stringify(body);
}

/**
 * Invoca una tool del catálogo por nombre, desempaqueta `{ status, body }` y
 * clasifica el resultado. Nunca lanza: todo fallo vuelve como `noDisponible`.
 */
async function invokeToolFor(
  key: SummaryKey,
  args: Record<string, unknown>,
  env?: Record<string, unknown>
): Promise<{ result: ToolResult; noDisponible?: FuenteNoDisponible }> {
  const tool = TOOL_NAMES[key];
  const fail = (motivo: MotivoNoDisponible, detalle: string, status?: number) => ({
    result: { ok: false, ...(status !== undefined ? { status } : {}), error: detalle },
    noDisponible: { tool, motivo, ...(status !== undefined ? { status } : {}), detalle },
  });

  const spec = findTool(tool);
  if (!spec) {
    return fail(
      "TOOL_NO_EN_CATALOGO",
      `Tool "${tool}" no está en el catálogo MCP` +
        (key === "captura" || key === "eudr"
          ? " (territorio-inteligencia está fuera del catálogo: sin ingesta real, ver apps/territorio-inteligencia/README.md)."
          : ".")
    );
  }

  let text = "";
  let isError = false;
  try {
    const response = await invokeTool(spec, args, { env });
    const first = Array.isArray(response.content) ? response.content[0] : undefined;
    text = first && typeof first.text === "string" ? first.text : "";
    isError = response.isError === true;
  } catch (err) {
    return fail("ERROR_INVOCACION", err instanceof Error ? err.message : String(err));
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(text);
  } catch {
    envelope = undefined;
  }

  // Sin `{ status }`: fallo antes de obtener respuesta HTTP (conexión, args inválidos, etc.).
  if (!isRecord(envelope) || typeof envelope.status !== "number") {
    return fail("ERROR_INVOCACION", text || "Respuesta vacía de invokeTool.");
  }

  const status = envelope.status;
  if (envelope.truncated === true) {
    if (status >= 400) return fail("HTTP_ERROR", `HTTP ${status} (respuesta truncada).`, status);
    return { result: { ok: true, status, truncated: true, data: envelope.bodyPreview } };
  }

  const body = envelope.body;
  if (status >= 400 || isError) {
    return fail("HTTP_ERROR", `HTTP ${status}: ${errorText(body)}`, status);
  }
  if (isRecord(body) && body.estado === "ENRIQUECIMIENTO_NO_CONFIGURADO") {
    return fail(
      "ENRIQUECIMIENTO_NO_CONFIGURADO",
      "La app respondió 200 pero sin el cruce configurado (estado ENRIQUECIMIENTO_NO_CONFIGURADO): no hay dato, no es ausencia de riesgo.",
      status
    );
  }
  return { result: { ok: true, status, data: body } };
}
