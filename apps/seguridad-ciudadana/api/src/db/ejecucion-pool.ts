import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.EJECUCION_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "EJECUCION_DATABASE_URL no está definida. Apunta a la base de radar-ejecucion " +
      "(ver apps/radar-ejecucion/api/.env.example) — el cruce con la función ORDEN PUBLICO Y " +
      "SEGURIDAD y el registro de cobertura territorial necesitan escribir/leer ahí."
  );
}

/**
 * Segundo pool, hacia la base de `radar-ejecucion` (presupuesto MEF). No hay
 * FK real entre las dos bases: lee para el cruce con la función de gasto
 * ORDEN PUBLICO Y SEGURIDAD, y escribe el registro central de cobertura
 * territorial (`territorial_coverage`) — nunca denuncias ni gasto.
 */
export const ejecucionPool = new Pool({ connectionString });
