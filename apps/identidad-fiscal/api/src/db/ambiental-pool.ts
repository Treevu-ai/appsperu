import { Pool } from "pg";

const connectionString = process.env.AMBIENTAL_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "AMBIENTAL_DATABASE_URL no está definida. Apunta a la base de infracciones-ambientales " +
      "(ver apps/infracciones-ambientales/api/.env.example) — el cruce de legalidad EUDR la necesita."
  );
}

/**
 * Pool hacia la base de `infracciones-ambientales` (sanciones OEFA, RUIAS).
 * Solo LEE para el cruce de riesgo de legalidad EUDR (art. 10), nunca escribe.
 */
export const ambientalPool = new Pool({ connectionString });
