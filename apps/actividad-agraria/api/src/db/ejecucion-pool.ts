import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.EJECUCION_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "EJECUCION_DATABASE_URL no está definida. Apunta a la base de radar-ejecucion " +
      "(ver apps/radar-ejecucion/api/.env.example) — el cruce por departamento necesita leerla."
  );
}

/**
 * Segundo pool, hacia la base de `radar-ejecucion` (presupuesto MEF). No hay
 * FK real entre las dos bases — este servicio lee de ahí para construir el
 * cruce agregado por departamento, y escribe el registro central de
 * cobertura territorial (`territorial_coverage`), nunca presupuesto ni gasto.
 */
export const ejecucionPool = new Pool({ connectionString });
