import { fetchWithTimeout } from "../lib/fetch-with-timeout.js";

function baseUrl(envVar: string, fallback: string): string {
  return (process.env[envVar] ?? fallback).replace(/\/+$/, "");
}

export type DependencyStatus = {
  app: string;
  url: string;
  ok: boolean;
  error?: string;
};

export type InfobrasObra = {
  codigoInfobras: string;
  nombreObra: string;
  cui: string | null;
  departamento: string;
  provincia: string | null;
  distrito: string | null;
  estadoEjecucion: string | null;
  fuente?: { extraidoEl?: string };
};

export type Inversion = {
  cui: string;
  nombre: string;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  montoViable: number | null;
  costoActualizado: number | null;
  estado: string | null;
  fuente?: { extraidoEl?: string };
};

export type EjecucionRow = {
  entityCode: string;
  nombre: string;
  nivelGobierno: string;
  funcion: string;
  pim: number;
  devengado: number;
  fechaCorte: string;
};

async function fetchJson<T>(url: string): Promise<{ data: T; dependency: DependencyStatus }> {
  const dependency: DependencyStatus = { app: new URL(url).host, url, ok: false };
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

export async function fetchInfobrasObras(departamento: string): Promise<{
  obras: InfobrasObra[];
  dependency: DependencyStatus;
}> {
  const url = `${baseUrl("INFOBRAS_API_URL", "http://localhost:4003")}/api/public-works?departamento=${encodeURIComponent(departamento)}`;
  const { data, dependency } = await fetchJson<{ resultados: InfobrasObra[] }>(url);
  dependency.app = "infobras";
  return { obras: data.resultados ?? [], dependency };
}

export async function fetchInversiones(departamento: string): Promise<{
  inversiones: Inversion[];
  dependency: DependencyStatus;
}> {
  const url = `${baseUrl("RADAR_INVERSIONES_API_URL", "http://localhost:4002")}/api/investments?departamento=${encodeURIComponent(departamento)}`;
  const { data, dependency } = await fetchJson<{ resultados: Inversion[] }>(url);
  dependency.app = "radar-inversiones";
  return { inversiones: data.resultados ?? [], dependency };
}

export async function fetchEjecucionByUbigeo(ubigeo: string): Promise<{
  filas: EjecucionRow[];
  dependency: DependencyStatus;
}> {
  const url = `${baseUrl("RADAR_EJECUCION_API_URL", "http://localhost:4000")}/api/execution?ubigeo=${encodeURIComponent(ubigeo)}`;
  const { data, dependency } = await fetchJson<{
    resultados: Array<{
      entityCode: string;
      nombre: string;
      nivelGobierno: string;
      funcion: string;
      pim: number;
      devengado: number;
      fechaCorte: string;
    }>;
  }>(url);
  dependency.app = "radar-ejecucion";
  return {
    filas: (data.resultados ?? []).map((row) => ({
      entityCode: row.entityCode,
      nombre: row.nombre,
      nivelGobierno: row.nivelGobierno,
      funcion: row.funcion,
      pim: row.pim,
      devengado: row.devengado,
      fechaCorte: row.fechaCorte,
    })),
    dependency,
  };
}
