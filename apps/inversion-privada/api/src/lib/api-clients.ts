import { fetchWithTimeout } from "./fetch-with-timeout.js";

function baseUrl(envVar: string, fallback: string): string {
  return (process.env[envVar] ?? fallback).replace(/\/+$/, "");
}

export type DependencyStatus = {
  app: string;
  url: string;
  ok: boolean;
  error?: string;
};

export type InversionPublica = {
  cui: string;
  codigoSnip: string | null;
  nombre: string;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  montoViable: number | null;
  costoActualizado: number | null;
  estado: string | null;
  fuente?: { extraidoEl?: string };
};

async function fetchJson<T>(url: string, app: string): Promise<{ data: T; dependency: DependencyStatus }> {
  const dependency: DependencyStatus = { app, url, ok: false };
  try {
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      dependency.error = `HTTP ${response.status}`;
      throw new Error(dependency.error);
    }
    dependency.ok = true;
    return { data: (await response.json()) as T, dependency };
  } catch (error) {
    dependency.error = error instanceof Error ? error.message : "Error desconocido";
    throw Object.assign(new Error(dependency.error), { dependency });
  }
}

export async function fetchInversionesPublicas(departamento: string): Promise<{
  inversiones: InversionPublica[];
  dependency: DependencyStatus;
}> {
  const url = `${baseUrl("RADAR_INVERSIONES_API_URL", "http://localhost:4002")}/api/investments?departamento=${encodeURIComponent(departamento)}`;
  const { data, dependency } = await fetchJson<{
    resultados: Array<{
      cui: string;
      codigoSnip?: string | null;
      nombre: string;
      departamento?: string | null;
      provincia?: string | null;
      distrito?: string | null;
      montoViable?: number | null;
      costoActualizado?: number | null;
      estado?: string | null;
      fuente?: { extraidoEl?: string };
    }>;
  }>(url, "radar-inversiones");

  return {
    inversiones: (data.resultados ?? []).map((row) => ({
      cui: row.cui,
      codigoSnip: row.codigoSnip ?? null,
      nombre: row.nombre,
      departamento: row.departamento ?? null,
      provincia: row.provincia ?? null,
      distrito: row.distrito ?? null,
      montoViable: row.montoViable ?? null,
      costoActualizado: row.costoActualizado ?? null,
      estado: row.estado ?? null,
      fuente: row.fuente,
    })),
    dependency,
  };
}
