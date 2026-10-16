import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.SEGURIDAD_DATABASE_URL;
if (!connectionString) {
  throw new Error("SEGURIDAD_DATABASE_URL no está definida. Copia .env.example a .env.");
}

/** Pool hacia `seguridad-ciudadana` (`police_reports` de SIDPOL, por UBIGEO). */
export const seguridadPool = new Pool({ connectionString });
