import { Pool } from "pg";

/** Bases opcionales para enriquecer una ficha solo mediante claves exactas.
 * Si una conexión no está configurada, el contrato devuelve su ausencia y no
 * intenta sustituirla con nombre, distrito o similitud semántica. */
export const infobrasPool = process.env.INFOBRAS_DATABASE_URL ? new Pool({ connectionString: process.env.INFOBRAS_DATABASE_URL }) : null;
export const comprasPool = process.env.COMPRAS_DATABASE_URL ? new Pool({ connectionString: process.env.COMPRAS_DATABASE_URL }) : null;
export const identidadFiscalPool = process.env.IDENTIDAD_FISCAL_DATABASE_URL ? new Pool({ connectionString: process.env.IDENTIDAD_FISCAL_DATABASE_URL }) : null;
export const sancionesPool = process.env.SANCIONES_DATABASE_URL ? new Pool({ connectionString: process.env.SANCIONES_DATABASE_URL }) : null;
export const ceplanGeoPool = process.env.CEPLAN_GEO_DATABASE_URL ? new Pool({ connectionString: process.env.CEPLAN_GEO_DATABASE_URL }) : null;
