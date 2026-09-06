import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.EJECUCION_DATABASE_URL;
if (!connectionString) {
  throw new Error("EJECUCION_DATABASE_URL no está definida. Copia .env.example a .env.");
}

export const ejecucionPool = new Pool({ connectionString });
