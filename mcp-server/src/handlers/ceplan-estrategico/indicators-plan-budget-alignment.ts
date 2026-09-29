import type { NeonRow } from "../../db/neon-pool.js";
import { LATEST_BUDGET_CTE } from "../../db/latest-budget.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { getPilotDepartment, isPilotDepartment, PILOT_DEPARTMENT_NAMES, round3 } from "./_helpers.js";
import { crossAppPool } from "../proveedores-sancionados/_helpers.js";

/**
 * @fidelity: precomputado
 *
 * `loadMaxAnioEjecucion` y `loadPlanBudgetAlignment` son ports literales de
 * `apps/ceplan-estrategico/api/src/lib/indicators/ceplan-national.ts` y
 * `.../plan-budget-alignment.ts` — funciones que el route de origen importa,
 * no SQL inline en `routes/indicators-plan-budget-alignment.ts`, así que el
 * test de fidelidad no puede rastrearlas contra el route homónimo. Cada
 * SELECT está marcado `@nuevo:` abajo; el SQL en sí es idéntico al de esos
 * archivos `lib/`.
 */

// @nuevo: port literal de apps/ceplan-estrategico/api/src/lib/indicators/ceplan-national.ts (no vive en routes/ ni crossref/)
async function loadMaxAnioEjecucion(ejecucionDb: ToolHandlerContext["db"]): Promise<number | null> {
  const { rows } = await ejecucionDb.query<NeonRow & { max: number | null }>(
    `SELECT MAX(anio_fiscal) AS max FROM budget_execution`
  );
  return rows[0]?.max ?? null;
}

/** Copiado de `apps/ceplan-estrategico/api/src/lib/indicators/plan-budget-alignment.ts`. */
const PBA_MAPPING_V1 = [
  { dimension: "Salud y nutrición", indicadoresCeplan: ["SOC*", "CUMP* (salud)"], funcionesMef: ["SALUD"], confianza: "Media" },
  { dimension: "Educación", indicadoresCeplan: ["SOC*", "ip_pryedux"], funcionesMef: ["EDUCACION"], confianza: "Media" },
  { dimension: "Turismo y cultura", indicadoresCeplan: ["ip_pryturx", "PN turismo"], funcionesMef: ["TURISMO", "CULTURA"], confianza: "Media" },
  { dimension: "Agro y riego", indicadoresCeplan: ["ip_prysecagr", "ECO*"], funcionesMef: ["AGROPECUARIA", "PESCA"], confianza: "Media" },
  { dimension: "Ambiente", indicadoresCeplan: ["AMB*", "ma_* geo"], funcionesMef: ["AMBIENTE"], confianza: "Baja" },
  { dimension: "Infraestructura vial", indicadoresCeplan: ["ip_prysectra", "cn_redvial*"], funcionesMef: ["TRANSPORTES", "COMUNICACIONES"], confianza: "Media" },
  { dimension: "Seguridad ciudadana", indicadoresCeplan: ["ip_pryordpubsegx"], funcionesMef: ["SEGURIDAD CIUDADANA", "JUSTICIA"], confianza: "Media" },
  { dimension: "Desarrollo económico", indicadoresCeplan: ["ECO*", "INV*"], funcionesMef: ["COMERCIO", "PRODUCCION"], confianza: "Baja" },
  { dimension: "Institucional", indicadoresCeplan: ["INST*", "PLAN*"], funcionesMef: ["GOBIERNO GENERAL", "PLANEAMIENTO"], confianza: "Baja" },
  { dimension: "Vivienda", indicadoresCeplan: ["ip_pryvivdesurbx"], funcionesMef: ["VIVIENDA", "SANEAMIENTO"], confianza: "Media" },
] as const;

const PBA_RESTRICCION =
  "Mapeo CEPLAN→MEF heurístico v1; no prueba alineación del PEI regional. Indicadores CEPLAN citados son referencia nacional.";

function normalizeFuncion(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .trim();
}

async function loadPlanBudgetAlignment(env: Record<string, unknown>, departamento: string, anio: number) {
  const ejecucionDb = crossAppPool("radar-ejecucion", env);
  if (!ejecucionDb) {
    return {
      departamento,
      anio,
      mapeoVersion: "v1" as const,
      gastoDevengadoTotal: 0,
      dimensiones: [],
      restriccion: `${PBA_RESTRICCION} radar-ejecucion no disponible: falta la conexión a su base de datos.`,
    };
  }

  // @nuevo: port literal de apps/ceplan-estrategico/api/src/lib/indicators/plan-budget-alignment.ts (no vive en routes/ ni crossref/)
  const { rows } = await ejecucionDb.query<NeonRow & { funcion: string; devengado: string }>(
    `${LATEST_BUDGET_CTE}
     SELECT UPPER(TRIM(b.funcion)) AS funcion, COALESCE(SUM(b.devengado), 0)::text AS devengado
     FROM latest_budget b
     JOIN entities e ON e.entity_code = b.entity_code
     LEFT JOIN territories t ON t.ubigeo = e.ubigeo
     WHERE b.anio_fiscal = $1
       AND (b.meta_departamento = $2 OR (b.meta_departamento IS NULL AND t.departamento = $2))
     GROUP BY UPPER(TRIM(b.funcion))`,
    [anio, departamento]
  );

  const devengadoByFuncion = new Map(rows.map((row) => [normalizeFuncion(row.funcion), Number(row.devengado)]));
  const totalDevengado = rows.reduce((sum, row) => sum + Number(row.devengado), 0);

  const dimensiones = PBA_MAPPING_V1.map((mapping) => {
    const funcionesNormalizadas = mapping.funcionesMef.map(normalizeFuncion);
    const gastoDevengadoDepartamento = funcionesNormalizadas.reduce(
      (sum, funcion) => sum + (devengadoByFuncion.get(funcion) ?? 0),
      0
    );

    return {
      dimension: mapping.dimension,
      indicadoresCeplan: [...mapping.indicadoresCeplan],
      funcionesMef: [...mapping.funcionesMef],
      confianza: mapping.confianza,
      gastoDevengadoDepartamento: Math.round(gastoDevengadoDepartamento),
      participacionPresupuestoDept: totalDevengado > 0 ? round3(gastoDevengadoDepartamento / totalDevengado) : null,
      matcher: "heuristica_dimension_v1",
      restriccion: PBA_RESTRICCION,
    };
  });

  return {
    departamento,
    anio,
    mapeoVersion: "v1" as const,
    gastoDevengadoTotal: Math.round(totalDevengado),
    dimensiones,
    restriccion: PBA_RESTRICCION,
  };
}

/**
 * Handler para `ceplan_estrategico_indicators_plan_budget_alignment` —
 * GET /api/indicators/plan-budget-alignment. Idéntico a
 * `apps/ceplan-estrategico/api/src/routes/indicators-plan-budget-alignment.ts`.
 */
export async function planBudgetAlignment(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { args, env } = ctx;
  const departamentoArg = args.departamento as string;
  const anioArg = args.anio !== undefined ? Number(args.anio) : undefined;

  const departamento = departamentoArg.toUpperCase().trim();
  if (!isPilotDepartment(departamento)) {
    return {
      status: 400,
      body: { error: "Departamento fuera del piloto ALSOL Fase 2.", departamentosPermitidos: PILOT_DEPARTMENT_NAMES },
    };
  }

  const pilot = getPilotDepartment(departamento);
  const ejecucionDb = crossAppPool("radar-ejecucion", env);
  const anio = anioArg ?? (ejecucionDb ? await loadMaxAnioEjecucion(ejecucionDb) : null) ?? new Date().getFullYear();
  const alignment = await loadPlanBudgetAlignment(env, departamento, anio);
  const generadoEl = new Date().toISOString();

  return {
    status: 200,
    body: {
      matcher: "heuristica_dimension_v1",
      cobertura: alignment.gastoDevengadoTotal > 0 ? "PARCIAL" : "INCOMPLETA",
      restriccion: alignment.restriccion,
      dependencias: [{ app: "radar-ejecucion", ok: alignment.gastoDevengadoTotal > 0 }],
      corte: { generadoEl, anio },
      departamento,
      ubigeoPrefijo: pilot?.ubigeoPrefix ?? null,
      mapeoVersion: alignment.mapeoVersion,
      gastoDevengadoTotal: alignment.gastoDevengadoTotal,
      dimensiones: alignment.dimensiones,
    },
  };
}
