import { Pool } from "pg";

const connectionString = process.env.COMPRAS_DATABASE_URL;
if (!connectionString) {
  throw new Error("COMPRAS_DATABASE_URL no está definida. Copia .env.example a .env.");
}

export const comprasPool = new Pool({ connectionString });
