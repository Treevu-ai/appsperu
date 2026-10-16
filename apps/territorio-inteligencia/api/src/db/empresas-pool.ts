import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.EMPRESAS_DATABASE_URL;
if (!connectionString) {
  throw new Error("EMPRESAS_DATABASE_URL no está definida. Copia .env.example a .env.");
}

/** Pool hacia `actividad-empresarial` (`empresas_privadas_distrito` del MTPE, por UBIGEO). */
export const empresasPool = new Pool({ connectionString });
