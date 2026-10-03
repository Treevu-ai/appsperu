import { Pool } from "pg";

const connectionString = process.env.IDENTIDAD_FISCAL_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "IDENTIDAD_FISCAL_DATABASE_URL no está definida. Apunta a la base de identidad-fiscal " +
      "(ver apps/identidad-fiscal/api/.env.example) — el resumen de salas autorizadas necesita " +
      "leer el estado del contribuyente en el Padrón RUC."
  );
}

/**
 * Segundo pool, hacia la base de `identidad-fiscal`. Solo LEE de ahí
 * (`contribuyentes`) para cruzar el RUC del operador de la sala contra su
 * estado/condición de domicilio en SUNAT, nunca escribe.
 */
export const identidadFiscalPool = new Pool({ connectionString });
