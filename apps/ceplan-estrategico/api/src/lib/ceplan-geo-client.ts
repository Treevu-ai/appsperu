import { fetchWithTimeout } from "./fetch-with-timeout.js";

export type TerritorySummary = {
  departamento: string;
  ubigeoPrefijo: string;
  distritos: number;
  infraestructura: Record<string, number>;
  fuente: "ceplan-geo";
};

export function getCeplanGeoApiUrl(): string {
  return (process.env.CEPLAN_GEO_API_URL ?? "http://localhost:4005").replace(/\/$/, "");
}

export async function fetchTerritorySummary(departamento: string): Promise<
  | { ok: true; summary: TerritorySummary; url: string }
  | { ok: false; url: string; error: string }
> {
  const baseUrl = getCeplanGeoApiUrl();
  const url = `${baseUrl}/api/territories/summary?departamento=${encodeURIComponent(departamento)}`;

  try {
    const response = await fetchWithTimeout(url, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      return { ok: false, url, error: `HTTP ${response.status}` };
    }
    const summary = (await response.json()) as TerritorySummary;
    return { ok: true, summary, url };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return { ok: false, url, error: message };
  }
}
