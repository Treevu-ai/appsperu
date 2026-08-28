const ACCENT_MAP: Record<string, string> = {
  Á: "A",
  É: "E",
  Í: "I",
  Ó: "O",
  Ú: "U",
  Ñ: "N",
  Ü: "U",
};

export function normalizeTerritoryToken(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const upper = trimmed
    .toUpperCase()
    .replace(/[ÁÉÍÓÚÑÜ]/g, (ch) => ACCENT_MAP[ch] ?? ch)
    .replace(/\s+/g, " ");
  return upper;
}

export type DistrictProperties = {
  ubigeo: string;
  departamento: string;
  provincia: string | null;
  distrito: string | null;
};

export function parseDistrictProperties(properties: Record<string, unknown> | null): DistrictProperties | null {
  if (!properties) return null;
  const ubigeo = String(properties.ubigeo ?? properties.iddist ?? "").trim();
  const departamento = normalizeTerritoryToken(String(properties.dpto ?? properties.departamen ?? properties.departamento ?? ""));
  const provincia = normalizeTerritoryToken(String(properties.prov ?? properties.provincia ?? ""));
  const distrito = normalizeTerritoryToken(String(properties.dist ?? properties.distrito ?? ""));

  if (!/^\d{6}$/.test(ubigeo) || !departamento) return null;
  return { ubigeo, departamento, provincia, distrito };
}

export function parseInfrastructureName(
  properties: Record<string, unknown> | null,
  infraType: "aeropuerto" | "puerto"
): string | null {
  if (!properties) return null;
  if (infraType === "aeropuerto") {
    const name = String(properties.fna ?? properties.nam ?? "").trim();
    return name || null;
  }
  const name = String(properties.nompue ?? properties.nomins ?? properties.label ?? "").trim();
  return name || null;
}

export function parseHydroPrincipalName(properties: Record<string, unknown> | null): string | null {
  if (!properties) return null;
  const name = String(properties.nombre_ca ?? properties.categoria ?? properties.codigo_rh ?? "").trim();
  return name || null;
}

export function parseAgroProjectName(properties: Record<string, unknown> | null): string | null {
  if (!properties) return null;
  const name = String(
    properties.nombre ?? properties.nombrepry ?? properties.codigounic ?? properties.codsnip ?? ""
  ).trim();
  return name || null;
}

export function featureIdFromGeoJson(feature: { id?: string | number }, fallbackIndex: number): string {
  if (feature.id != null && String(feature.id).trim()) return String(feature.id);
  return `feature-${fallbackIndex}`;
}
