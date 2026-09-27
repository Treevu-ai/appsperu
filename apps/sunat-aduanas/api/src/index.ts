import "dotenv/config";
import { createApp } from "./app.js";
import { pool } from "./db/pool.js";

const port = Number(process.env.PORT ?? 4015);

const app = createApp();

const server = app.listen(port, () => {
  console.log(`[sunat-aduanas] API escuchando en http://localhost:${port}`);
  console.log(`[sunat-aduanas] Entorno: ${process.env.NODE_ENV ?? "development"}`);
});

// Graceful shutdown
async function shutdown() {
  console.log("\n[sunat-aduanas] Cerrando servidor...");
  server.close();
  await pool.end();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
