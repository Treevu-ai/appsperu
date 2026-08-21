import { Pool } from "pg";

const connectionString = process.env.FISCAL_DATABASE_URL;
if (!connectionString) {
  throw new Error("FISCAL_DATABASE_URL no está definida. Copia .env.example a .env.");
}

export const fiscalPool = new Pool({ connectionString });
