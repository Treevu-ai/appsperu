import { Pool } from "pg";

const connectionString = process.env.SEGURIDAD_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "SEGURIDAD_DATABASE_URL no está definida. Apunta a la base de seguridad-ciudadana " +
      "(ver apps/seguridad-ciudadana/api/.env.example) — el resumen-geo de financieras " +
      "informales necesita leer la tasa de extorsión por departamento."
  );
}

/**
 * Segundo pool, hacia la base de `seguridad-ciudadana`. Solo LEE de ahí
 * (`police_reports`/`poblacion_departamental`) para la tasa de extorsión por
 * departamento, nunca escribe.
 */
export const seguridadPool = new Pool({ connectionString });
