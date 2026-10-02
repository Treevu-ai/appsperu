/**
 * Clave canónica para el snapshot semanal (ver docs del "corte" — se comparte
 * entre el cliente (api-client.ts) y el script exportador (export-snapshot.mjs)
 * para que ambos calculen exactamente la misma clave para la misma consulta.
 */

export type SnapshotQuery = Record<string, string | number | boolean | undefined> | undefined;

export function snapshotKey(appKey: string, path: string, query?: SnapshotQuery): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!query) return `${appKey}:${normalizedPath}`;
  const parts = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => [k, String(v)] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  if (parts.length === 0) return `${appKey}:${normalizedPath}`;
  const qs = parts.map(([k, v]) => `${k}=${v}`).join("&");
  return `${appKey}:${normalizedPath}?${qs}`;
}
