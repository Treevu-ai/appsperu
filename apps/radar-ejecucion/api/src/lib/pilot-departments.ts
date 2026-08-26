/** Departamentos piloto ALSOL Fase 2 (5 regiones). */
export const PILOT_DEPARTMENTS = [
  "LA LIBERTAD",
  "LAMBAYEQUE",
  "PIURA",
  "CAJAMARCA",
  "CUSCO",
] as const;

export type PilotDepartmentName = (typeof PILOT_DEPARTMENTS)[number];

export function isPilotDepartment(value: string): value is PilotDepartmentName {
  return PILOT_DEPARTMENTS.includes(value.toUpperCase().trim() as PilotDepartmentName);
}
