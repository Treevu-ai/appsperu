import { Pool } from "pg";

const connectionString = process.env.INVERSION_PRIVADA_DATABASE_URL;
if (!connectionString) {
  throw new Error("INVERSION_PRIVADA_DATABASE_URL no está definida. Copia .env.example a .env.");
}

/** Pool hacia `inversion-privada` (`oxi_investment_promotions` — Obras por Impuestos). */
export const inversionPrivadaPool = new Pool({ connectionString });
