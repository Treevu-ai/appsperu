import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.SANCIONES_DATABASE_URL;
if (!connectionString) {
  throw new Error("SANCIONES_DATABASE_URL no está definida. Copia .env.example a .env.");
}

/** Pool hacia `proveedores-sancionados` (inhabilitaciones, inhabilitaciones_judiciales, multas). */
export const sancionesPool = new Pool({ connectionString });
