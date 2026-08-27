/** Departamentos piloto ALSOL Fase 2 (5 regiones). */
export const PILOT_DEPARTMENTS = [
  "LA LIBERTAD",
  "LAMBAYEQUE",
  "PIURA",
  "CAJAMARCA",
  "CUSCO",
] as const;

/** Prefijo UBIGEO departamental (2 dígitos) para filtrar filas MEF sin falsos positivos. */
export const PILOT_DEPARTMENT_UBIGEO: Record<PilotDepartmentName, string> = {
  "LA LIBERTAD": "13",
  LAMBAYEQUE: "14",
  PIURA: "20",
  CAJAMARCA: "06",
  CUSCO: "08",
};

export type PilotDepartmentName = (typeof PILOT_DEPARTMENTS)[number];

export function isPilotDepartment(value: string): value is PilotDepartmentName {
  return PILOT_DEPARTMENTS.includes(value.toUpperCase().trim() as PilotDepartmentName);
}
