import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.INFOBRAS_DATABASE_URL;
if (!connectionString) {
  throw new Error("INFOBRAS_DATABASE_URL no está definida. Copia .env.example a .env.");
}

export const infobrasPool = new Pool({ connectionString });
