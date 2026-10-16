import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.AUTORIDADES_DATABASE_URL;
if (!connectionString) {
  throw new Error("AUTORIDADES_DATABASE_URL no está definida. Copia .env.example a .env.");
}

/** Pool hacia `autoridades-electas` (autoridades proclamadas por el JNE). */
export const autoridadesPool = new Pool({ connectionString });
