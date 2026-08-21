import { Pool } from "pg";

const connectionString = process.env.COMPRAS_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "COMPRAS_DATABASE_URL no está definida. Apunta a la base de compras-publicas " +
      "(ver apps/compras-publicas/api/.env.example) — el cruce necesita leerla."
  );
}

/**
 * Segundo pool, hacia la base de `compras-publicas` (OCDS). Solo LEE de ahí
 * para el cruce por RUC (`awards.supplier_id` = `PE-RUC-<11 dígitos>`),
 * nunca escribe.
 */
export const comprasPool = new Pool({ connectionString });
