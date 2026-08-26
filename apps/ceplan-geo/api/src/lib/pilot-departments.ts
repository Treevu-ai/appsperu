import { pool } from "../db/pool.js";

/** Departamentos del piloto ALSOL Fase 2 (5 regiones). */
export const PILOT_DEPARTMENTS = [
  { name: "LA LIBERTAD", ubigeoPrefix: "13", expectedDistricts: 83 },
  { name: "LAMBAYEQUE", ubigeoPrefix: "14", expectedDistricts: 38 },
  { name: "PIURA", ubigeoPrefix: "20", expectedDistricts: 65 },
  { name: "CAJAMARCA", ubigeoPrefix: "06", expectedDistricts: 127 },
  { name: "CUSCO", ubigeoPrefix: "08", expectedDistricts: 112 },
] as const;

export type PilotDepartmentName = (typeof PILOT_DEPARTMENTS)[number]["name"];

export function isPilotDepartment(value: string): value is PilotDepartmentName {
  return PILOT_DEPARTMENTS.some((row) => row.name === value.toUpperCase().trim());
}

export async function countPilotDistricts(): Promise<Record<string, number>> {
  const names = PILOT_DEPARTMENTS.map((row) => row.name);
  const { rows } = await pool.query<{ departamento: string; distritos: string }>(
    `SELECT departamento, COUNT(*)::text AS distritos
     FROM territories
     WHERE departamento = ANY($1)
     GROUP BY departamento`,
    [names]
  );
  return Object.fromEntries(rows.map((row) => [row.departamento, Number(row.distritos)]));
}
