import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.RADAR_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "RADAR_DATABASE_URL no está definida. Apunta a la base de radar-ejecucion " +
      "(ver apps/radar-ejecucion/api/.env.example) — el cruce necesita leerla."
  );
}

/**
 * Segundo pool, hacia la base de `radar-ejecucion` (presupuesto MEF). No hay
 * FK real entre las dos bases: lee para el cruce y solo escribe el registro
 * central de cobertura territorial, nunca procesos ni presupuesto.
 */
export const radarPool = new Pool({ connectionString });
