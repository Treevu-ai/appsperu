export function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function territoryFromRow(row: Record<string, unknown>) {
  return {
    ubigeo: String(row.ubigeo),
    departamento: String(row.departamento),
    provincia: row.provincia ? String(row.provincia) : null,
    distrito: row.distrito ? String(row.distrito) : null,
    geometry: row.geometry_geojson ? JSON.parse(String(row.geometry_geojson)) : null,
  };
}
