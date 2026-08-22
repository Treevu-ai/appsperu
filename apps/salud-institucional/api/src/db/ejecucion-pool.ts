import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.EJECUCION_DATABASE_URL;
if (!connectionString) {
  throw new Error("EJECUCION_DATABASE_URL no está definida. Copia .env.example a .env.");
}

/**
 * Fuente primaria — `entity_code` de radar-ejecucion es la llave canónica
 * sobre la que se arma todo el score (las otras 4 fuentes se cruzan hacia
 * esta, nunca al revés).
 */
export const ejecucionPool = new Pool({ connectionString });
