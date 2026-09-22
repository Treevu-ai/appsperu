import { Pool } from "pg";

/**
 * Opcionales: solo para GET /api/crossref/preparacion-riesgo. Si no están configuradas, ese
 * endpoint responde con `estado: "ENRIQUECIMIENTO_NO_CONFIGURADO"` sin romper el resto de la
 * app -- mismo patrón que `infracciones-ambientales/api/src/db/external-pools.ts`.
 *
 * No se usa el crossref HTTP de `infobras` (`GET /api/crossref`) porque ese endpoint agrega por
 * CUI a nivel departamental y no expone `distrito` -- el anclaje territorial de este cruce
 * necesita distrito, así que se lee directo de las dos bases (mismo criterio de "no adivinar
 * agregación" que el resto del catálogo).
 */
export const inversionesPool = process.env.INVERSIONES_DATABASE_URL
  ? new Pool({ connectionString: process.env.INVERSIONES_DATABASE_URL })
  : null;

export const infobrasPool = process.env.INFOBRAS_DATABASE_URL
  ? new Pool({ connectionString: process.env.INFOBRAS_DATABASE_URL })
  : null;
