import { Pool } from "pg";

const connectionString = process.env.EJECUCION_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "EJECUCION_DATABASE_URL no está definida. Apunta a la base de radar-ejecucion " +
      "(ver apps/radar-ejecucion/api/.env.example) — el cruce por nivel de gobierno necesita leerla."
  );
}

/**
 * Segundo pool, hacia la base de `radar-ejecucion` (presupuesto MEF). No hay
 * FK real entre las dos bases — este servicio solo LEE de ahí para construir
 * el cruce agregado por nivel de gobierno, nunca escribe.
 */
export const ejecucionPool = new Pool({ connectionString });
