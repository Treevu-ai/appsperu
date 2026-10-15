import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL no está definida. Copia .env.example a .env.");
}

// keepAlive + listener de error: mismo fix aplicado en catastro-rural
// (d003d78) para corridas largas con huecos entre requests HTTP externos —
// sin esto, una conexión idle cortada en silencio por NAT/firewall tumba
// el proceso completo con "Connection terminated unexpectedly".
export const pool = new Pool({
  connectionString,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
});

pool.on("error", (err) => {
  console.error("Error inesperado en conexión idle del pool:", err.message);
});
