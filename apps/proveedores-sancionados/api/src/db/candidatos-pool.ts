import { Pool } from "pg";

const connectionString = process.env.CANDIDATOS_DATABASE_URL;
if (!connectionString) {
  throw new Error("CANDIDATOS_DATABASE_URL no está definida. Copia .env.example a .env.");
}

export const candidatosPool = new Pool({ connectionString });
