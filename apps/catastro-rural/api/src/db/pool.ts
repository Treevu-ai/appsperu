import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL no está definida. Copia .env.example a .env.");
}

export const pool = new Pool({ connectionString });

// Sin este listener, un error en una conexión idle del pool (ej. reset de
// red de Neon) se emite como 'error' no manejado y tumba el proceso Node
// completo -- confirmado en vivo durante la ingesta de catastro-rural.
// pg.Pool ya descarta la conexión rota por su cuenta; solo hace falta
// evitar que el evento quede sin listener.
pool.on("error", (err) => {
  console.error("Error inesperado en conexión idle del pool:", err.message);
});