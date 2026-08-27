import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.EJECUCION_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "EJECUCION_DATABASE_URL no está definida. Apunta a la base de radar-ejecucion " +
      "(ver apps/radar-ejecucion/api/.env.example) — la materialización de cobertura territorial necesita escribir ahí."
  );
}

/**
 * Pool hacia la base de `radar-ejecucion`, usado únicamente para escribir el
 * registro central de cobertura territorial (`territorial_coverage`). No
 * hay FK real entre las dos bases; nunca lee ni escribe sanciones/multas.
 */
export const ejecucionPool = new Pool({ connectionString });
