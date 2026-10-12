import { Pool } from "pg";

const connectionString = process.env.IDENTIDAD_FISCAL_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "IDENTIDAD_FISCAL_DATABASE_URL no está definida. Apunta a la base de identidad-fiscal " +
      "(ver apps/identidad-fiscal/api/.env.example) — el check EUDR por organización lee eudr_parcela de ahí."
  );
}

/**
 * Pool hacia `identidad-fiscal`, donde vive `eudr_parcela`. Solo LEE, para
 * resolver el due diligence EUDR de todas las parcelas de una organización
 * (por RUC) de una sola vez.
 */
export const identidadFiscalPool = new Pool({ connectionString });
