import "dotenv/config";
import { Pool, type PoolClient } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL no está definida. Copia .env.example a .env.");
}

export const pool = new Pool({ connectionString });

// Sin este listener, un error en una conexión IDLE del pool (ej. reset de
// red de Neon) se emite como 'error' no manejado y tumba el proceso Node
// completo -- confirmado en vivo durante la ingesta de catastro-rural.
// pg.Pool ya descarta la conexión rota por su cuenta; solo hace falta
// evitar que el evento quede sin listener.
pool.on("error", (err) => {
  console.error("Error inesperado en conexión idle del pool:", err.message);
});

/**
 * pool.connect() devuelve un PoolClient que emite SU PROPIO evento 'error'
 * mientras está en uso (fuera del pool) -- el listener de arriba en `pool`
 * NO lo cubre. Sin un listener por cliente, un reset de red a mitad de una
 * query también tumba el proceso completo -- confirmado en vivo una
 * segunda vez (2026-10-13) con el stack apuntando a Client._handleErrorEvent,
 * no a Pool. Usar connectSafe() en vez de pool.connect() directo.
 */
export async function connectSafe(): Promise<PoolClient> {
  const client = await pool.connect();
  client.on("error", (err) => {
    console.error("Error inesperado en conexión activa del pool:", err.message);
  });
  return client;
}