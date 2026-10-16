import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.RENAMU_DATABASE_URL;
if (!connectionString) {
  throw new Error("RENAMU_DATABASE_URL no está definida. Copia .env.example a .env.");
}

/** Pool hacia `renamu` (Registro Nacional de Municipalidades, INEI). */
export const renamuPool = new Pool({ connectionString });
