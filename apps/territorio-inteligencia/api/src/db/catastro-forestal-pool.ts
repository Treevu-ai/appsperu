import { Pool } from "pg";

const connectionString = process.env.CATASTRO_FORESTAL_DATABASE_URL;
if (!connectionString) {
  throw new Error("CATASTRO_FORESTAL_DATABASE_URL no está definida. Copia .env.example a .env.");
}

export const catastroForestalPool = new Pool({ connectionString });
