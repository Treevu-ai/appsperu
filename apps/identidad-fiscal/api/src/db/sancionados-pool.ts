import { Pool } from "pg";

const connectionString = process.env.SANCIONADOS_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "SANCIONADOS_DATABASE_URL no está definida. Apunta a la base de proveedores-sancionados " +
      "(ver apps/proveedores-sancionados/api/.env.example) — el cruce de legalidad EUDR la necesita."
  );
}

/**
 * Pool hacia la base de `proveedores-sancionados` (inhabilitaciones y multas
 * OSCE/RNP). Solo LEE para el cruce de riesgo de legalidad EUDR (art. 10),
 * nunca escribe.
 */
export const sancionadosPool = new Pool({ connectionString });
