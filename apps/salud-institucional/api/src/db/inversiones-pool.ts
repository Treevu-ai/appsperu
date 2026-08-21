import { Pool } from "pg";

const connectionString = process.env.INVERSIONES_DATABASE_URL;
if (!connectionString) {
  throw new Error("INVERSIONES_DATABASE_URL no está definida. Copia .env.example a .env.");
}

export const inversionesPool = new Pool({ connectionString });
