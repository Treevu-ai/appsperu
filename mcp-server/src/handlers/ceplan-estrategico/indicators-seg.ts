import type { NeonRow } from "../../db/neon-pool.js";
import { LATEST_BUDGET_CTE } from "../../db/latest-budget.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import {
  CROSSREFEABLE_NIVELES_GOBIERNO,
  anioFromMeasurementDate,
  buildNationalLevel,
  getPilotDepartment,
  isPilotDepartment,
  PILOT_DEPARTMENT_NAMES,
  round2,
  round3,
  type CeplanIndicatorRow,
  type DepartmentProxyMetrics,
} from "./_helpers.js";
import { crossAppPool } from "../proveedores-sancionados/_helpers.js";

/**
 * @fidelity: precomputado
 *
 * `loadLatestCumpIndicators`, `loadMaxAnioEjecucion` y `loadDepartmentProxyMetrics`
 * son ports literales de `apps/ceplan-estrategico/api/src/lib/indicators/ceplan-national.ts`
 * y `.../department-proxy.ts` — funciones que el route de origen importa, no
 * SQL inline en `routes/indicators-seg.ts`, así que el test de fidelidad no
 * puede rastrearlas contra el route homónimo. Cada SELECT está marcado
 * `@nuevo:` abajo; el SQL en sí es idéntico al de esos archivos `lib/`.
 */

/** Copiado de `apps/ceplan-estrategico/api/src/lib/indicators/ceplan-national.ts`. */
// @nuevo: port literal de apps/ceplan-estrategico/api/src/lib/indicators/ceplan-national.ts (no vive en routes/ ni crossref/)
async function loadLatestCumpIndicators(db: ToolHandlerContext["db"]): Promise<CeplanIndicatorRow[]> {
  const { rows } = await db.query<CeplanIndicatorRow>(
    `SELECT DISTINCT ON (indicator_code, nivel_gobierno)
            indicator_code, nivel_gobierno, value, measurement_date
     FROM strategic_indicators
     WHERE indicator_code IN ('CUMP02', 'CUMP03') AND nivel_gobierno = ANY($1)
     ORDER BY indicator_code, nivel_gobierno, measurement_date DESC`,
    [[...CROSSREFEABLE_NIVELES_GOBIERNO]]
  );
  return rows;
}

// @nuevo: port literal de apps/ceplan-estrategico/api/src/lib/indicators/ceplan-national.ts (no vive en routes/ ni crossref/)
async function loadMaxAnioEjecucion(ejecucionDb: ToolHandlerContext["db"]): Promise<number | null> {
  const { rows } = await ejecucionDb.query<NeonRow & { max: number | null }>(
    `SELECT MAX(anio_fiscal) AS max FROM budget_execution`
  );
  return rows[0]?.max ?? null;
}

const PROXY_RESTRICCION =
  "Proxy departamental MEF+INFOBRAS; no equivale a SEG CEPLAN regional ni a desempeño estratégico por territorio.";

/**
 * `env` viene de `ToolHandlerContext.env`: `ejecucionPool`/`infobrasPool` del
 * route de origen son pools abiertos hacia otras bases — acá se resuelven
 * con `crossAppPool`, igual que el resto de handlers cross-app ya portados.
 */
async function loadDepartmentProxyMetrics(
  env: Record<string, unknown>,
  departamento: string,
  anio?: number
): Promise<DepartmentProxyMetrics | null> {
  const ejecucionDb = crossAppPool("radar-ejecucion", env);
  if (!ejecucionDb) {
    return {
      anio: anio ?? new Date().getFullYear(),
      ejecucionPresupuestalPct: null,
      avanceFisicoMedioPct: null,
      segPp: null,
      executionEfficiency: null,
      pim: 0,
      devengado: 0,
      obrasConAvance: 0,
      restriccion: "radar-ejecucion no disponible: falta la conexión a su base de datos.",
      dependencias: [{ app: "radar-ejecucion", ok: false, error: "No hay base Neon configurada." }],
    };
  }

  const anioFiscal = anio ?? (await loadMaxAnioEjecucion(ejecucionDb));

  if (!anioFiscal) {
    return null;
  }

  // @nuevo: port literal de apps/ceplan-estrategico/api/src/lib/indicators/department-proxy.ts (no vive en routes/ ni crossref/)
  const { rows: budgetRows } = await ejecucionDb.query<NeonRow & { pim: string; devengado: string }>(
    `${LATEST_BUDGET_CTE}
     SELECT COALESCE(SUM(b.pim), 0)::text AS pim, COALESCE(SUM(b.devengado), 0)::text AS devengado
     FROM latest_budget b
     JOIN entities e ON e.entity_code = b.entity_code
     LEFT JOIN territories t ON t.ubigeo = e.ubigeo
     WHERE b.anio_fiscal = $1
       AND (b.meta_departamento = $2 OR (b.meta_departamento IS NULL AND t.departamento = $2))`,
    [anioFiscal, departamento]
  );

  const pim = Number(budgetRows[0]?.pim ?? 0);
  const devengado = Number(budgetRows[0]?.devengado ?? 0);
  const ejecucionPresupuestalPct = pim > 0 ? round2((devengado / pim) * 100) : null;

  const dependencias: DepartmentProxyMetrics["dependencias"] = [{ app: "radar-ejecucion", ok: true }];

  let avanceFisicoMedioPct: number | null = null;
  let obrasConAvance = 0;

  const infobrasDb = crossAppPool("infobras", env);
  if (!infobrasDb) {
    dependencias.push({ app: "infobras", ok: false, error: "INFOBRAS_DATABASE_URL no configurada" });
  } else {
    // @nuevo: port literal de apps/ceplan-estrategico/api/src/lib/indicators/department-proxy.ts (no vive en routes/ ni crossref/)
    const { rows: obraRows } = await infobrasDb.query<NeonRow & { avance: string | null; obras: string }>(
      `SELECT AVG(avance_fisico_real_pct)::text AS avance,
              COUNT(*) FILTER (WHERE avance_fisico_real_pct IS NOT NULL)::text AS obras
       FROM public_works
       WHERE departamento = $1`,
      [departamento]
    );
    obrasConAvance = Number(obraRows[0]?.obras ?? 0);
    avanceFisicoMedioPct = obraRows[0]?.avance === null ? null : round2(Number(obraRows[0]?.avance));
    dependencias.push({ app: "infobras", ok: obrasConAvance > 0 });
  }

  let restriccion: string | null = PROXY_RESTRICCION;
  let segPp: number | null = null;
  let executionEfficiency: number | null = null;

  if (pim <= 0) {
    restriccion = `${PROXY_RESTRICCION} PIM=0 o sin registros MEF para el departamento.`;
  } else if (avanceFisicoMedioPct === null) {
    restriccion = `${PROXY_RESTRICCION} Sin avance físico INFOBRAS reportado para el departamento.`;
  } else if (ejecucionPresupuestalPct !== null) {
    segPp = round2(ejecucionPresupuestalPct - avanceFisicoMedioPct);
    executionEfficiency = ejecucionPresupuestalPct > 0 ? round3(avanceFisicoMedioPct / ejecucionPresupuestalPct) : null;
  }

  return {
    anio: anioFiscal,
    ejecucionPresupuestalPct,
    avanceFisicoMedioPct,
    segPp,
    executionEfficiency,
    pim,
    devengado,
    obrasConAvance,
    restriccion,
    dependencias,
  };
}

const NACIONAL_RESTRICCION =
  "SEG nacional CEPLAN = CUMP03% − CUMP02% por nivel de gobierno; no implica cobertura departamental.";

/**
 * Handler para `ceplan_estrategico_indicators_seg` — GET /api/indicators/seg.
 * Idéntico a `apps/ceplan-estrategico/api/src/routes/indicators-seg.ts`.
 */
export async function seg(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;
  const departamentoArg = args.departamento as string | undefined;
  const anio = args.anio !== undefined ? Number(args.anio) : undefined;

  if (departamentoArg) {
    const departamento = departamentoArg.toUpperCase().trim();
    if (!isPilotDepartment(departamento)) {
      return {
        status: 400,
        body: { error: "Departamento fuera del piloto ALSOL Fase 2.", departamentosPermitidos: PILOT_DEPARTMENT_NAMES },
      };
    }

    const pilot = getPilotDepartment(departamento);
    const proxy = await loadDepartmentProxyMetrics(env, departamento, anio);
    const generadoEl = new Date().toISOString();

    return {
      status: 200,
      body: {
        matcher: "mef_infobras_departamento",
        cobertura: proxy?.segPp !== null ? "PARCIAL" : "INCOMPLETA",
        restriccion: proxy?.restriccion ?? "Sin datos MEF/INFOBRAS para calcular proxy departamental.",
        dependencias: proxy?.dependencias ?? [{ app: "radar-ejecucion", ok: false }],
        corte: { generadoEl, anio: proxy?.anio ?? anio ?? null },
        fuente: "radar-ejecucion+infobras",
        variante: "PROXY_DEPARTAMENTAL",
        departamento,
        ubigeoPrefijo: pilot?.ubigeoPrefix ?? null,
        ejecucionPresupuestalPct: proxy?.ejecucionPresupuestalPct ?? null,
        avanceFisicoMedioPct: proxy?.avanceFisicoMedioPct ?? null,
        segPp: proxy?.segPp ?? null,
        pim: proxy?.pim ?? null,
        devengado: proxy?.devengado ?? null,
        obrasConAvance: proxy?.obrasConAvance ?? 0,
      },
    };
  }

  const ejecucionDb = crossAppPool("radar-ejecucion", env);
  const [rows, anioEjecucion] = await Promise.all([
    loadLatestCumpIndicators(db),
    ejecucionDb ? loadMaxAnioEjecucion(ejecucionDb) : Promise.resolve(null),
  ]);
  const generadoEl = new Date().toISOString();
  const anioCeplan =
    anioFromMeasurementDate(rows[0]?.measurement_date) ??
    anioFromMeasurementDate(rows.find((row) => row.measurement_date)?.measurement_date);

  return {
    status: 200,
    body: {
      matcher: "nivel_gobierno_ceplan",
      cobertura: "NACIONAL",
      restriccion: NACIONAL_RESTRICCION,
      dependencias: [
        { app: "ceplan-estrategico", ok: rows.length > 0 },
        { app: "radar-ejecucion", ok: anioEjecucion !== null },
      ],
      corte: { generadoEl, anioCeplan, anioEjecucion },
      fuente: "ceplan+radar-ejecucion",
      resultados: [...CROSSREFEABLE_NIVELES_GOBIERNO].map((nivel) => {
        const item = buildNationalLevel(rows, nivel, anioEjecucion);
        return {
          nivelGobierno: item.nivelGobierno,
          variante: item.variante,
          anioCeplan: item.anioCeplan,
          anioEjecucion: item.anioEjecucion,
          cump02: item.cump02,
          cump03: item.cump03,
          segPp: item.segPp,
        };
      }),
    },
  };
}
