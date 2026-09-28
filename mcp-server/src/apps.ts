/*
 * Arquitectura MCP Worker + D1: cada app tiene su propia base de datos D1.
 * Los bindings se declaran en `wrangler.toml` como `DB_<APP_UPPER_SNAKE>`.
 * La app `territorio-inteligencia` no está en APP_KEYS (sin ingesta real,
 * ver apps/territorio-inteligencia/README.md).
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
  "inversion-privada",
  "bcrp-la-libertad",
  "servicios-salud",
  "programas-sociales",
  "actividad-empresarial",
  "informes-control",
  "mindef",
  "mimp",
  "renamu",
  "autoridades-electas",
  "instituciones-educativas",
  "infracciones-ambientales",
  "red-vial-subnacional",
  "residuos-solidos",
  "infraestructura-mtc",
  "riesgo-fiscal-isds",
  "candidatos-erm",
  "poder-judicial",
  "violencia-escolar",
  "legislativo-congreso",
  "catastro-minero",
  "areas-protegidas",
  "senace-cartera-proyectos",
  "catastro-forestal",
  "emergencias-indeci",
  "geo-intersections",
] as const;

export type AppKey = (typeof APP_KEYS)[number];

/** Mapea AppKey → nombre del binding D1 declarado en wrangler.toml (env.DB_<SUFFIX>). */
export function d1BindingFor(app: AppKey): string {
  return `DB_${app.toUpperCase().replace(/-/g, "_")}`;
}

/** Puertos por defecto para fallback HTTP (modo stdio/local). */
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
  "inversion-privada": 4012,
  "bcrp-la-libertad": 4013,
  "servicios-salud": 4014,
  "programas-sociales": 4015,
  "actividad-empresarial": 4016,
  "informes-control": 4017,
  mindef: 4018,
  mimp: 4019,
  renamu: 4020,
  "autoridades-electas": 4021,
  "instituciones-educativas": 4022,
  "infracciones-ambientales": 4023,
  "red-vial-subnacional": 4024,
  "residuos-solidos": 4025,
  "infraestructura-mtc": 4026,
  "riesgo-fiscal-isds": 4027,
  "candidatos-erm": 4038,
  "poder-judicial": 4028,
  "violencia-escolar": 4029,
  "legislativo-congreso": 4030,
  "catastro-minero": 4031,
  "areas-protegidas": 4032,
  "senace-cartera-proyectos": 4033,
  "catastro-forestal": 4034,
  "emergencias-indeci": 4035,
  "geo-intersections": 4037,
};

function envVarFor(app: AppKey): string {
  return `${app.toUpperCase().replace(/-/g, "_")}_API_URL`;
}

/**
 * Resuelve la base URL de una app para fallback HTTP (modo stdio/local).
 * En el Worker, los handlers usan D1 directamente y no necesitan esta URL.
 */
export function baseUrlFor(app: AppKey): string {
  const fromEnv = process.env[envVarFor(app)];
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  return `http://localhost:${DEFAULT_PORTS[app]}`;
}
