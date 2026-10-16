import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.PROGRAMAS_DATABASE_URL;
if (!connectionString) {
  throw new Error("PROGRAMAS_DATABASE_URL no está definida. Copia .env.example a .env.");
}

/** Pool hacia `programas-sociales` (`cobertura_social` de INFOMIDIS, por UBIGEO). */
export const programasPool = new Pool({ connectionString });
