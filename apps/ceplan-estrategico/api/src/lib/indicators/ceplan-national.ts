import { pool } from "../../db/pool.js";
import { ejecucionPool } from "../../db/ejecucion-pool.js";
import { CROSSREFEABLE_NIVELES_GOBIERNO } from "../../ingest/field-mapping.js";

export type CeplanIndicatorRow = {
  indicator_code: string;
  nivel_gobierno: string;
  value: string;
  measurement_date: string;
};

export async function loadLatestCumpIndicators(): Promise<CeplanIndicatorRow[]> {
  const { rows } = await pool.query<CeplanIndicatorRow>(
    `SELECT DISTINCT ON (indicator_code, nivel_gobierno)
            indicator_code, nivel_gobierno, value, measurement_date
     FROM strategic_indicators
     WHERE indicator_code IN ('CUMP02', 'CUMP03') AND nivel_gobierno = ANY($1)
     ORDER BY indicator_code, nivel_gobierno, measurement_date DESC`,
    [[...CROSSREFEABLE_NIVELES_GOBIERNO]]
  );
  return rows;
}

export async function loadMaxAnioEjecucion(): Promise<number | null> {
  const { rows } = await ejecucionPool.query<{ max: number | null }>(
    `SELECT MAX(anio_fiscal) AS max FROM budget_execution`
  );
  return rows[0]?.max ?? null;
}

export function anioFromMeasurementDate(value: string | undefined): number | null {
  if (!value) return null;
  const year = Number(value.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function buildNationalLevel(
  rows: CeplanIndicatorRow[],
  nivelGobierno: string,
  anioEjecucion: number | null
) {
  const cump02 = rows.find((row) => row.indicator_code === "CUMP02" && row.nivel_gobierno === nivelGobierno);
  const cump03 = rows.find((row) => row.indicator_code === "CUMP03" && row.nivel_gobierno === nivelGobierno);
  const cump02Value = cump02 ? Number(cump02.value) : null;
  const cump03Value = cump03 ? Number(cump03.value) : null;

  return {
    nivelGobierno,
    variante: "NACIONAL_CEPLAN" as const,
    anioCeplan: cump02?.measurement_date ?? cump03?.measurement_date ?? null,
    anioEjecucion,
    cump02: cump02Value,
    cump03: cump03Value,
    segPp:
      cump02Value !== null && cump03Value !== null ? round2(cump03Value - cump02Value) : null,
    executionEfficiency:
      cump02Value !== null && cump03Value !== null && cump03Value > 0
        ? round3(cump02Value / cump03Value)
        : null,
  };
}
