import type { NeonRow } from "../../db/neon-pool.js";

/**
 * Utilidades compartidas por los handlers de `ceplan-estrategico`, copiadas
 * de `apps/ceplan-estrategico/api/src/lib/indicators/*.ts` y
 * `apps/ceplan-estrategico/api/src/lib/pilot-departments.ts`. Viven en un
 * módulo interno (no un tool por sí mismo) porque varias rutas de origen
 * las importan tal cual.
 *
 * Solo utilidades SIN SQL: cada función que ejecuta una query vive inline en
 * el módulo handler que la usa (duplicada si la comparten varios), para que
 * el test de fidelidad SQL (`sql-fidelity.test.ts`) pueda rastrearla — este
 * archivo está excluido de ese escaneo por convención (`_helpers.ts`).
 */

/** Copiado de `apps/ceplan-estrategico/api/src/ingest/field-mapping.ts`. */
export const CROSSREFEABLE_NIVELES_GOBIERNO = ["GN", "GR"] as const;

/** Copiado de `apps/ceplan-estrategico/api/src/lib/pilot-departments.ts`. */
const PILOT_DEPARTMENTS = [
  { name: "LA LIBERTAD", ubigeoPrefix: "13" },
  { name: "LAMBAYEQUE", ubigeoPrefix: "14" },
  { name: "PIURA", ubigeoPrefix: "20" },
  { name: "CAJAMARCA", ubigeoPrefix: "06" },
  { name: "CUSCO", ubigeoPrefix: "08" },
] as const;

export const PILOT_DEPARTMENT_NAMES = PILOT_DEPARTMENTS.map((d) => d.name);

export function isPilotDepartment(value: string): boolean {
  return PILOT_DEPARTMENTS.some((row) => row.name === value.toUpperCase().trim());
}

export function getPilotDepartment(value: string) {
  const normalized = value.toUpperCase().trim();
  return PILOT_DEPARTMENTS.find((row) => row.name === normalized) ?? null;
}

/** Copiado de `apps/ceplan-estrategico/api/src/lib/indicators/ceplan-national.ts`. */
export type CeplanIndicatorRow = NeonRow & {
  indicator_code: string;
  nivel_gobierno: string;
  value: string;
  measurement_date: string;
};

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

export function buildNationalLevel(rows: CeplanIndicatorRow[], nivelGobierno: string, anioEjecucion: number | null) {
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
    segPp: cump02Value !== null && cump03Value !== null ? round2(cump03Value - cump02Value) : null,
    executionEfficiency:
      cump02Value !== null && cump03Value !== null && cump03Value > 0 ? round3(cump02Value / cump03Value) : null,
  };
}

/** Copiado de `apps/ceplan-estrategico/api/src/lib/indicators/department-proxy.ts`. */
export type DepartmentProxyMetrics = {
  anio: number;
  ejecucionPresupuestalPct: number | null;
  avanceFisicoMedioPct: number | null;
  segPp: number | null;
  executionEfficiency: number | null;
  pim: number;
  devengado: number;
  obrasConAvance: number;
  restriccion: string | null;
  dependencias: Array<{ app: string; ok: boolean; error?: string }>;
};

