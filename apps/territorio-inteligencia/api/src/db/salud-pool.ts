import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.SALUD_DATABASE_URL;
if (!connectionString) {
  throw new Error("SALUD_DATABASE_URL no está definida. Copia .env.example a .env.");
}

/** Pool hacia `servicios-salud` (`ipress` de RENIPRESS, por UBIGEO). */
export const saludPool = new Pool({ connectionString });
