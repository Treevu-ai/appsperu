import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL no está definida. Copia .env.example a .env.");
}

export const pool = new Pool({ connectionString });
