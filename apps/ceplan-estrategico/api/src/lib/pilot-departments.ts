/** Departamentos del piloto ALSOL Fase 2 (5 regiones). */
export const PILOT_DEPARTMENTS = [
  { name: "LA LIBERTAD", ubigeoPrefix: "13" },
  { name: "LAMBAYEQUE", ubigeoPrefix: "14" },
  { name: "PIURA", ubigeoPrefix: "20" },
  { name: "CAJAMARCA", ubigeoPrefix: "06" },
  { name: "CUSCO", ubigeoPrefix: "08" },
] as const;

export const PILOT_DEPARTMENT_NAMES = PILOT_DEPARTMENTS.map((row) => row.name);

export type PilotDepartmentName = (typeof PILOT_DEPARTMENTS)[number]["name"];

export function isPilotDepartment(value: string): value is PilotDepartmentName {
  return PILOT_DEPARTMENTS.some((row) => row.name === value.toUpperCase().trim());
}

export function getPilotDepartment(value: string) {
  const normalized = value.toUpperCase().trim();
  return PILOT_DEPARTMENTS.find((row) => row.name === normalized) ?? null;
}
