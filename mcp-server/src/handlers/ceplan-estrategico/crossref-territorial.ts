import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { crossAppPool } from "../proveedores-sancionados/_helpers.js";
import { CROSSREFEABLE_NIVELES_GOBIERNO, anioFromMeasurementDate, getPilotDepartment, isPilotDepartment, PILOT_DEPARTMENT_NAMES } from "./_helpers.js";

const RESTRICCION =
  "Indicadores CEPLAN son nacionales por nivel de gobierno; el bloque territorial describe el departamento en ceplan-geo, no desempeño estratégico regional.";

type IndicadorRow = NeonRow & {
  indicator_code: string;
  nivel_gobierno: string;
  value: string;
  measurement_date: string;
};

function buildNivelMarco(rows: IndicadorRow[], nivelGobierno: string) {
  const cump02 = rows.find((row) => row.indicator_code === "CUMP02" && row.nivel_gobierno === nivelGobierno);
  const cump03 = rows.find((row) => row.indicator_code === "CUMP03" && row.nivel_gobierno === nivelGobierno);

  if (!cump02 && !cump03) {
    return { CUMP02: null, CUMP03: null, nota: "serie disponible en catálogo; validar measurement_date" };
  }

  const cump02Value = cump02 ? Number(cump02.value) : null;
  const cump03Value = cump03 ? Number(cump03.value) : null;
  const segPp = cump02Value !== null && cump03Value !== null ? Math.round((cump03Value - cump02Value) * 100) / 100 : null;
  const executionEfficiency =
    cump02Value !== null && cump03Value !== null && cump03Value > 0
      ? Math.round((cump02Value / cump03Value) * 1000) / 1000
      : null;

  return { CUMP02: cump02Value, CUMP03: cump03Value, segPp, executionEfficiency };
}

/**
 * @fidelity: precomputado
 *
 * Handler para `ceplan_estrategico_crossref_territorial` — GET /api/crossref/territorial.
 *
 * El route de origen (`apps/ceplan-estrategico/api/src/routes/crossref-territorial.ts`,
 * vía `apps/ceplan-estrategico/api/src/lib/ceplan-geo-client.ts::fetchTerritorySummary`)
 * llama por HTTP a `ceplan-geo` (`GET /api/territories/summary`). Igual que el
 * resto de cruces cross-app ya portados, ese salto HTTP se reemplaza por el
 * mismo SELECT que `../ceplan-geo/territories.ts::summary` (ya portado),
 * consultado directo vía `crossAppPool`.
 */
export async function territorial(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;
  const departamentoArg = args.departamento as string;

  const departamento = departamentoArg.toUpperCase().trim();
  if (!isPilotDepartment(departamento)) {
    return {
      status: 400,
      body: { error: "Departamento fuera del piloto ALSOL Fase 2.", departamentosPermitidos: PILOT_DEPARTMENT_NAMES },
    };
  }

  const pilot = getPilotDepartment(departamento);
  if (!pilot) {
    return {
      status: 400,
      body: { error: "Departamento fuera del piloto ALSOL Fase 2.", departamentosPermitidos: PILOT_DEPARTMENT_NAMES },
    };
  }

  const { rows: ceplanRows } = await db.query<IndicadorRow>(
    `SELECT DISTINCT ON (indicator_code, nivel_gobierno)
            indicator_code, nivel_gobierno, value, measurement_date
     FROM strategic_indicators
     WHERE indicator_code IN ('CUMP02', 'CUMP03') AND nivel_gobierno = ANY($1)
     ORDER BY indicator_code, nivel_gobierno, measurement_date DESC`,
    [[...CROSSREFEABLE_NIVELES_GOBIERNO]]
  );

  const ejecucionDb = crossAppPool("radar-ejecucion", env);
  const anioEjecucion = ejecucionDb
    ? (
        await ejecucionDb.query<NeonRow & { max: number | null }>(`SELECT MAX(anio_fiscal) AS max FROM budget_execution`)
      ).rows[0]?.max ?? null
    : null;

  const geoDb = crossAppPool("ceplan-geo", env);
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
    corte: { generadoEl, anioCeplan, anioEjecucion },
    departamento,
    ubigeoPrefijo: pilot.ubigeoPrefix,
    marcoEstrategicoNacional,
  };

  if (!geoDb) {
    return {
      status: 502,
      body: {
        ...base,
        cobertura: "BLOQUEADA",
        dependencias: [{ app: "ceplan-geo", ok: false, error: "No hay base Neon configurada." }],
        contextoTerritorial: null,
      },
    };
  }

  // @nuevo: reemplaza fetchTerritorySummary (HTTP a ceplan-geo); SELECT idéntico a apps/ceplan-geo/api/src/lib/territory-summary.ts
  const { rows: districtRows } = await geoDb.query<NeonRow & { distritos: string }>(
    `SELECT COUNT(*)::text AS distritos FROM territories WHERE departamento = $1`,
    [departamento]
  );
  // @nuevo: reemplaza fetchTerritorySummary (HTTP a ceplan-geo); SELECT idéntico a apps/ceplan-geo/api/src/lib/territory-summary.ts
  const { rows: infraRows } = await geoDb.query<NeonRow & { infra_type: string; total: string }>(
    `SELECT i.infra_type, COUNT(*)::text AS total
     FROM infrastructure i
     JOIN territories t ON ST_Within(i.geometry, t.geometry)
     WHERE t.departamento = $1
     GROUP BY i.infra_type
     ORDER BY i.infra_type`,
    [departamento]
  );

  return {
    status: 200,
    body: {
      ...base,
      cobertura: "PARCIAL",
      dependencias: [{ app: "ceplan-geo", ok: true }],
      contextoTerritorial: {
        distritos: Number(districtRows[0]?.distritos ?? 0),
        infraestructura: Object.fromEntries(infraRows.map((row) => [row.infra_type, Number(row.total)])),
        fuente: "ceplan-geo",
      },
    },
  };
}
