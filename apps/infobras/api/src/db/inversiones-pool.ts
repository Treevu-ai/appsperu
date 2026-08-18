import { Pool } from "pg";

const connectionString = process.env.INVERSIONES_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "INVERSIONES_DATABASE_URL no está definida. Apunta a la base de radar-inversiones " +
      "(ver apps/radar-inversiones/api/.env.example) — el cruce necesita leerla."
  );
}

/**
 * Segundo pool, hacia la base de `radar-inversiones` (Invierte.pe). Solo
 * LEE de ahí para el cruce por CUI, nunca escribe.
 */
export const inversionesPool = new Pool({ connectionString });
