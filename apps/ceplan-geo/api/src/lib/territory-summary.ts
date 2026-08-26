import { pool } from "../db/pool.js";
import { getPilotDepartment, isPilotDepartment } from "./pilot-departments.js";

export type DepartmentTerritorySummary = {
  departamento: string;
  ubigeoPrefijo: string;
  distritos: number;
  infraestructura: Record<string, number>;
  fuente: "ceplan-geo";
};

export async function getDepartmentTerritorySummary(departamento: string): Promise<DepartmentTerritorySummary | null> {
  const normalized = departamento.toUpperCase().trim();
  if (!isPilotDepartment(normalized)) return null;

  const pilot = getPilotDepartment(normalized);
  if (!pilot) return null;

  const { rows: districtRows } = await pool.query<{ distritos: string }>(
    `SELECT COUNT(*)::text AS distritos FROM territories WHERE departamento = $1`,
    [normalized]
  );

  const { rows: infraRows } = await pool.query<{ infra_type: string; total: string }>(
    `SELECT i.infra_type, COUNT(*)::text AS total
     FROM infrastructure i
     JOIN territories t ON ST_Within(i.geometry, t.geometry)
     WHERE t.departamento = $1
     GROUP BY i.infra_type
     ORDER BY i.infra_type`,
    [normalized]
  );

  return {
    departamento: normalized,
    ubigeoPrefijo: pilot.ubigeoPrefix,
    distritos: Number(districtRows[0]?.distritos ?? 0),
    infraestructura: Object.fromEntries(infraRows.map((row) => [row.infra_type, Number(row.total)])),
    fuente: "ceplan-geo",
  };
}
