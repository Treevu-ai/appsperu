import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { ejecucionPool } from "../db/ejecucion-pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import { CROSSREFEABLE_NIVELES_GOBIERNO } from "../ingest/field-mapping.js";
import {
  getPilotDepartment,
  isPilotDepartment,
  PILOT_DEPARTMENT_NAMES,
} from "../lib/pilot-departments.js";
import { fetchTerritorySummary } from "../lib/ceplan-geo-client.js";

export const crossrefTerritorialRouter = Router();

const TerritorialQuerySchema = z.object({
  departamento: z.string().min(1),
});

const RESTRICCION =
  "Indicadores CEPLAN son nacionales por nivel de gobierno; el bloque territorial describe el departamento en ceplan-geo, no desempeño estratégico regional.";

type IndicadorRow = {
  indicator_code: string;
  nivel_gobierno: string;
  value: string;
  measurement_date: string;
};

function buildNivelMarco(rows: IndicadorRow[], nivelGobierno: string) {
  const cump02 = rows.find((row) => row.indicator_code === "CUMP02" && row.nivel_gobierno === nivelGobierno);
  const cump03 = rows.find((row) => row.indicator_code === "CUMP03" && row.nivel_gobierno === nivelGobierno);

  if (!cump02 && !cump03) {
    return {
      CUMP02: null,
      CUMP03: null,
      nota: "serie disponible en catálogo; validar measurement_date",
    };
  }

  const cump02Value = cump02 ? Number(cump02.value) : null;
  const cump03Value = cump03 ? Number(cump03.value) : null;
  const segPp =
    cump02Value !== null && cump03Value !== null
      ? Math.round((cump03Value - cump02Value) * 100) / 100
      : null;
  const executionEfficiency =
    cump02Value !== null && cump03Value !== null && cump03Value > 0
      ? Math.round((cump02Value / cump03Value) * 1000) / 1000
      : null;

  return {
    CUMP02: cump02Value,
    CUMP03: cump03Value,
    segPp,
    executionEfficiency,
  };
}

function anioFromMeasurementDate(value: string | undefined): number | null {
  if (!value) return null;
  const year = Number(value.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

crossrefTerritorialRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(TerritorialQuerySchema, req.query, res);
    if (!parsed) return;

    const departamento = parsed.departamento.toUpperCase().trim();
    if (!isPilotDepartment(departamento)) {
      res.status(400).json({
        error: "Departamento fuera del piloto ALSOL Fase 2.",
        departamentosPermitidos: PILOT_DEPARTMENT_NAMES,
      });
      return;
    }

    const pilot = getPilotDepartment(departamento);
    if (!pilot) {
      res.status(400).json({
        error: "Departamento fuera del piloto ALSOL Fase 2.",
        departamentosPermitidos: PILOT_DEPARTMENT_NAMES,
      });
      return;
    }

    const { rows: ceplanRows } = await pool.query<IndicadorRow>(
      `SELECT DISTINCT ON (indicator_code, nivel_gobierno)
              indicator_code, nivel_gobierno, value, measurement_date
       FROM strategic_indicators
       WHERE indicator_code IN ('CUMP02', 'CUMP03') AND nivel_gobierno = ANY($1)
       ORDER BY indicator_code, nivel_gobierno, measurement_date DESC`,
      [[...CROSSREFEABLE_NIVELES_GOBIERNO]]
    );

    const { rows: maxAnioRows } = await ejecucionPool.query<{ max: number | null }>(
      `SELECT MAX(anio_fiscal) AS max FROM budget_execution`
    );
    const anioEjecucion = maxAnioRows[0]?.max ?? null;

    const geoResult = await fetchTerritorySummary(departamento);
    const generadoEl = new Date().toISOString();
    const anioCeplan =
      anioFromMeasurementDate(ceplanRows[0]?.measurement_date) ??
      anioFromMeasurementDate(ceplanRows.find((row) => row.measurement_date)?.measurement_date);

    const marcoEstrategicoNacional = Object.fromEntries(
      [...CROSSREFEABLE_NIVELES_GOBIERNO].map((nivel) => [nivel, buildNivelMarco(ceplanRows, nivel)])
    );

    const base = {
      matcher: "departamento_prefijo_ubigeo" as const,
      restriccion: RESTRICCION,
      corte: {
        generadoEl,
        anioCeplan,
        anioEjecucion,
      },
      departamento,
      ubigeoPrefijo: pilot.ubigeoPrefix,
      marcoEstrategicoNacional,
    };

    if (!geoResult.ok) {
      res.status(502).json({
        ...base,
        cobertura: "BLOQUEADA",
        dependencias: [{ app: "ceplan-geo", url: geoResult.url, ok: false, error: geoResult.error }],
        contextoTerritorial: null,
      });
      return;
    }

    res.json({
      ...base,
      cobertura: "PARCIAL",
      dependencias: [{ app: "ceplan-geo", url: geoResult.url, ok: true }],
      contextoTerritorial: {
        distritos: geoResult.summary.distritos,
        infraestructura: geoResult.summary.infraestructura,
        fuente: geoResult.summary.fuente,
      },
    });
  })
);
