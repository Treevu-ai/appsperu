import { Pool } from "pg";

const connectionString = process.env.EJECUCION_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "EJECUCION_DATABASE_URL no está definida. Apunta a la base de radar-ejecucion " +
      "(ver apps/radar-ejecucion/api/.env.example) — el cruce necesita leerla."
  );
}

/**
 * Segundo pool, hacia la base de `radar-ejecucion` (presupuesto MEF). Solo
 * LEE de ahí para el cruce por SEC_EJEC, nunca escribe.
 */
export const ejecucionPool = new Pool({ connectionString });
