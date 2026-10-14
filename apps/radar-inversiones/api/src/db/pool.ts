import "dotenv/config";
import { Pool, type PoolClient } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL no está definida. Copia .env.example a .env.");
}

export const pool = new Pool({ connectionString });

// Sin este listener, un error en una conexión IDLE del pool (ej. reset de
// red de Neon) se emite como 'error' no manejado y tumba el proceso Node
// completo -- confirmado en vivo en apps/catastro-rural/api.
pool.on("error", (err) => {
  console.error("Error inesperado en conexión idle del pool:", err.message);
});

/**
 * pool.connect() devuelve un PoolClient que emite SU PROPIO evento 'error'
 * mientras está en uso (fuera del pool) -- el listener de arriba en `pool`
 * NO lo cubre. Usar connectSafe() en vez de pool.connect() directo.
 */
export async function connectSafe(): Promise<PoolClient> {
  const client = await pool.connect();
  client.on("error", (err) => {
    console.error("Error inesperado en conexión activa del pool:", err.message);
  });
  return client;
}
