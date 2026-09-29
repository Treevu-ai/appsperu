import type { NeonRow } from "../../db/neon-pool.js";
import { LATEST_BUDGET_CTE } from "../../db/latest-budget.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { crossAppPool, crossAppUnavailable } from "../proveedores-sancionados/_helpers.js";
import { CROSSREFEABLE_NIVELES_GOBIERNO } from "./_helpers.js";

/** CEPLAN usa GN/GR/MP/MD; radar-ejecucion no distingue MP de MD (ambos caen bajo
 * "GOBIERNOS LOCALES"). Solo GN/GR tienen un bucket equivalente exacto en las dos fuentes. */
const NIVEL_GOBIERNO_A_RADAR_EJECUCION: Record<string, string> = {
  GN: "GOBIERNO NACIONAL",
  GR: "GOBIERNOS REGIONALES",
};

/**
 * Handler para `ceplan_estrategico_crossref` — GET /api/crossref.
 * Idéntico a `apps/ceplan-estrategico/api/src/routes/crossref.ts`.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, env } = ctx;

  const { rows: ceplanRows } = await db.query<NeonRow & { indicator_code: string; nivel_gobierno: string; value: string; measurement_date: string }>(
    `SELECT DISTINCT ON (indicator_code, nivel_gobierno)
            indicator_code, nivel_gobierno, value, measurement_date
     FROM strategic_indicators
     WHERE indicator_code IN ('CUMP02', 'CUMP03') AND nivel_gobierno = ANY($1)
     ORDER BY indicator_code, nivel_gobierno, measurement_date DESC`,
    [[...CROSSREFEABLE_NIVELES_GOBIERNO]]
  );

  if (ceplanRows.length === 0) {
    return { status: 200, body: { resultados: [] } };
  }

  const ejecucionDb = crossAppPool("radar-ejecucion", env);
  if (!ejecucionDb) return crossAppUnavailable("radar-ejecucion");

  const { rows: maxAnioRows } = await ejecucionDb.query<NeonRow & { max: number | null }>(
    `SELECT MAX(anio_fiscal) AS max FROM budget_execution`
  );
  const anioRadarEjecucion = maxAnioRows[0]?.max ?? null;

  const bucketsRadarEjecucion = anioRadarEjecucion ? Object.values(NIVEL_GOBIERNO_A_RADAR_EJECUCION) : [];
  const { rows: radarRows } = anioRadarEjecucion
    ? await ejecucionDb.query<NeonRow & { nivel_gobierno: string; pim: string; devengado: string }>(
        `${LATEST_BUDGET_CTE}
         SELECT e.nivel_gobierno, SUM(b.pim) AS pim, SUM(b.devengado) AS devengado
         FROM latest_budget b
         JOIN entities e ON e.entity_code = b.entity_code
         WHERE b.anio_fiscal = $1 AND e.nivel_gobierno = ANY($2)
         GROUP BY e.nivel_gobierno`,
        [anioRadarEjecucion, bucketsRadarEjecucion]
      )
    : { rows: [] as (NeonRow & { nivel_gobierno: string; pim: string; devengado: string })[] };

  const radarByNivel = new Map(
    radarRows.map((r) => [
      r.nivel_gobierno,
      {
        pim: Number(r.pim),
        devengado: Number(r.devengado),
        ejecucionPct: Number(r.pim) > 0 ? Math.round((Number(r.devengado) / Number(r.pim)) * 10000) / 100 : null,
      },
    ])
  );

  const ceplanByNivelIndicador = new Map(ceplanRows.map((r) => [`${r.indicator_code}|${r.nivel_gobierno}`, r]));

  const resultados = [...CROSSREFEABLE_NIVELES_GOBIERNO].map((nivelGobierno) => {
    const cump02 = ceplanByNivelIndicador.get(`CUMP02|${nivelGobierno}`);
    const cump03 = ceplanByNivelIndicador.get(`CUMP03|${nivelGobierno}`);
    const radar = radarByNivel.get(NIVEL_GOBIERNO_A_RADAR_EJECUCION[nivelGobierno]);

    const ejecucionFisicaCeplan = cump02 ? Number(cump02.value) : null;
    const ejecucionPresupuestalRadarEjecucion = radar?.ejecucionPct ?? null;

    const strategicExecutionGap =
      ejecucionPresupuestalRadarEjecucion !== null && ejecucionFisicaCeplan !== null
        ? Math.round((ejecucionPresupuestalRadarEjecucion - ejecucionFisicaCeplan) * 100) / 100
        : null;
    const executionEfficiency =
      ejecucionPresupuestalRadarEjecucion !== null &&
      ejecucionPresupuestalRadarEjecucion > 0 &&
      ejecucionFisicaCeplan !== null
        ? Math.round((ejecucionFisicaCeplan / ejecucionPresupuestalRadarEjecucion) * 100) / 100
        : null;

    return {
      nivelGobierno,
      nivelGobiernoRadarEjecucion: NIVEL_GOBIERNO_A_RADAR_EJECUCION[nivelGobierno],
      anioCeplan: cump02?.measurement_date ?? cump03?.measurement_date ?? null,
      anioRadarEjecucion,
      ejecucionFisicaCeplan,
      ejecucionPresupuestalCeplan: cump03 ? Number(cump03.value) : null,
      ejecucionPresupuestalRadarEjecucion,
      strategicExecutionGap,
      executionEfficiency,
    };
  });

  return { status: 200, body: { resultados } };
}
