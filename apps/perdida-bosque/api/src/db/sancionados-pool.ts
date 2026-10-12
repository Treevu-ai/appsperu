import { Pool } from "pg";

const connectionString = process.env.SANCIONADOS_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "SANCIONADOS_DATABASE_URL no está definida. Apunta a la base de proveedores-sancionados " +
      "(ver apps/proveedores-sancionados/api/.env.example) — la ficha de evidencia EUDR la necesita."
  );
}

/**
 * Pool hacia `proveedores-sancionados` (inhabilitaciones y multas OSCE-RNP).
 * Solo LEE, para la ficha de evidencia EUDR (riesgo de legalidad del titular).
 */
export const sancionadosPool = new Pool({ connectionString });
