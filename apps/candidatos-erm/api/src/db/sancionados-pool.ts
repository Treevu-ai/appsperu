import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.SANCIONADOS_DATABASE_URL;
if (!connectionString) {
  throw new Error("SANCIONADOS_DATABASE_URL no está definida. Copia .env.example a .env.");
}

/** Pool hacia `proveedores-sancionados` (inhabilitaciones y multas del Tribunal de Contrataciones). */
export const sancionadosPool = new Pool({ connectionString });
