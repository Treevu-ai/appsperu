import { Router } from "express";
import { pool } from "../db/pool.js";
import { ejecucionPool } from "../db/ejecucion-pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { CROSSREFEABLE_NIVELES_GOBIERNO } from "../ingest/field-mapping.js";

export const crossrefRouter = Router();

/** CEPLAN usa GN/GR/MP/MD; radar-ejecucion no distingue MP de MD (ambos caen bajo
 * "GOBIERNOS LOCALES") — ver docs/data-contracts/ceplan-strategic-planning.md. Solo GN/GR
 * tienen un bucket equivalente exacto en las dos fuentes. */
const NIVEL_GOBIERNO_A_RADAR_EJECUCION: Record<string, string> = {
  GN: "GOBIERNO NACIONAL",
  GR: "GOBIERNOS REGIONALES",
};

/**
 * Cruce CEPLAN (ObservaPerú) <-> radar-ejecucion, agregado por nivel de gobierno —
 * no por entidad individual (ver ADR-0003, actualización 2026-08-17). Compara el año
 * más reciente disponible en cada fuente por separado: CEPLAN reporta indicadores
 * anuales retrospectivos (hasta 2024/2025 al momento de escribir esto), radar-ejecucion
 * trae el año fiscal corriente de la ingesta del MEF — no necesariamente coinciden, así
 * que ambos años se devuelven explícitos en la respuesta en vez de forzar uno solo.
 */
crossrefRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows: ceplanRows } = await pool.query(
      `SELECT DISTINCT ON (indicator_code, nivel_gobierno)
              indicator_code, nivel_gobierno, value, measurement_date
       FROM strategic_indicators
       WHERE indicator_code IN ('CUMP02', 'CUMP03') AND nivel_gobierno = ANY($1)
       ORDER BY indicator_code, nivel_gobierno, measurement_date DESC`,
      [[...CROSSREFEABLE_NIVELES_GOBIERNO]]
    );

    if (ceplanRows.length === 0) {
      res.json({ resultados: [] });
      return;
    }

    const { rows: maxAnioRows } = await ejecucionPool.query<{ max: number | null }>(
      `SELECT MAX(anio_fiscal) AS max FROM budget_execution`
    );
    const anioRadarEjecucion = maxAnioRows[0]?.max ?? null;

    const bucketsRadarEjecucion = anioRadarEjecucion
      ? Object.values(NIVEL_GOBIERNO_A_RADAR_EJECUCION)
      : [];
    const { rows: radarRows } = anioRadarEjecucion
      ? await ejecucionPool.query(
          `SELECT e.nivel_gobierno, SUM(b.pim) AS pim, SUM(b.devengado) AS devengado
           FROM budget_execution b
           JOIN entities e ON e.entity_code = b.entity_code
           WHERE b.anio_fiscal = $1 AND e.nivel_gobierno = ANY($2)
           GROUP BY e.nivel_gobierno`,
          [anioRadarEjecucion, bucketsRadarEjecucion]
        )
      : { rows: [] as { nivel_gobierno: string; pim: string; devengado: string }[] };

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

    const ceplanByNivelIndicador = new Map(
      ceplanRows.map((r) => [`${r.indicator_code}|${r.nivel_gobierno}`, r])
    );

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

    res.json({ resultados });
  })
);
