import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.CATASTRO_MINERO_DATABASE_URL;
if (!connectionString) {
  throw new Error("CATASTRO_MINERO_DATABASE_URL no está definida. Copia .env.example a .env.");
}

export const catastroMineroPool = new Pool({ connectionString });
