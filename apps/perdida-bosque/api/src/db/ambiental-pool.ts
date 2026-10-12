import { Pool } from "pg";

const connectionString = process.env.AMBIENTAL_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "AMBIENTAL_DATABASE_URL no está definida. Apunta a la base de infracciones-ambientales " +
      "(ver apps/infracciones-ambientales/api/.env.example) — la ficha de evidencia EUDR la necesita."
  );
}

/**
 * Pool hacia `infracciones-ambientales` (sanciones OEFA, RUIAS). Solo LEE,
 * para la ficha de evidencia EUDR (riesgo de legalidad del titular).
 */
export const ambientalPool = new Pool({ connectionString });
