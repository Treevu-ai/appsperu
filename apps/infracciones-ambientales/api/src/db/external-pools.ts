import { Pool } from "pg";

/** Opcional: solo para el cruce contra compras-publicas (GET /api/crossref).
 * Si no está configurada, ese endpoint responde con `estado:
 * "ENRIQUECIMIENTO_NO_CONFIGURADO"` sin romper el resto de la app -- mismo
 * patrón que `external-pools.ts` de poder-judicial/radar-ejecucion. */
export const comprasPool = process.env.COMPRAS_DATABASE_URL ? new Pool({ connectionString: process.env.COMPRAS_DATABASE_URL }) : null;
