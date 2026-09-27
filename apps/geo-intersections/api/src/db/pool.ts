import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL no está definido. Ver .env");
}

export const pool = new Pool({ connectionString });

pool.on("error", (err) => {
  console.error("Error inesperado en el pool de Postgres", err);
});
