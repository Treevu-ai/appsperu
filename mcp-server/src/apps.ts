/**
 * Puertos por defecto de cada API — copiados de `README.md` (tabla "Apps") y
 * `docs/ESTADO.md`. Cada uno es sobreescribible vía env var para no asumir
 * que las apps siempre corren en localhost con estos puertos exactos.
 */
export const APP_KEYS = [
  "radar-ejecucion",
  "compras-publicas",
  "radar-inversiones",
  "infobras",
  "ceplan-estrategico",
  "ceplan-geo",
  "identidad-fiscal",
  "salud-institucional",
  "proveedores-sancionados",
  "actividad-agraria",
  "seguridad-ciudadana",
  "bcrp-comercio-exterior",
] as const;

export type AppKey = (typeof APP_KEYS)[number];

const DEFAULT_PORTS: Record<AppKey, number> = {
  "radar-ejecucion": 4000,
  "compras-publicas": 4001,
  "radar-inversiones": 4002,
  infobras: 4003,
  "ceplan-estrategico": 4004,
  "ceplan-geo": 4005,
  "identidad-fiscal": 4006,
  "salud-institucional": 4007,
  "proveedores-sancionados": 4008,
  "actividad-agraria": 4009,
  "seguridad-ciudadana": 4010,
  "bcrp-comercio-exterior": 4011,
};

function envVarFor(app: AppKey): string {
  return `${app.toUpperCase().replace(/-/g, "_")}_API_URL`;
}

/**
 * Resuelve la base URL de una app: `<APP>_API_URL` en el entorno si está
 * definida (ej. `RADAR_EJECUCION_API_URL=https://...`), si no
 * `http://localhost:<puerto-default>`.
 */
export function baseUrlFor(app: AppKey): string {
  const fromEnv = process.env[envVarFor(app)];
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  return `http://localhost:${DEFAULT_PORTS[app]}`;
}
