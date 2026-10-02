import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pool } from "./pool.js";

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

async function ensureMigrationsTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       filename TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`
  );
}

// Clave arbitraria pero estable para el advisory lock de esta app -- dos
// invocaciones concurrentes de `migrate` pueden ambas leer el mismo archivo
// como pendiente; los `IF NOT EXISTS` del DDL lo toleran, pero las dos
// terminan insertando el mismo filename en `schema_migrations` (PK), y una
// falla con error de clave duplicada. Hallazgo de CodeRabbit en PR #224,
// confirmado.
const ADVISORY_LOCK_KEY = 726569; // arbitraria, solo necesita ser estable para esta app

async function migrate() {
  await ensureMigrationsTable();

  const lockClient = await pool.connect();
  try {
    await lockClient.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_KEY]);

    const { rows } = await pool.query<{ filename: string }>("SELECT filename FROM schema_migrations");
    const applied = new Set(rows.map((r) => r.filename));

    const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
    let appliedCount = 0;

    for (const file of files) {
      if (applied.has(file)) continue;

      const sql = readFileSync(path.join(migrationsDir, file), "utf-8");
      console.log(`Aplicando migración: ${file}`);

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
        await client.query("COMMIT");
        appliedCount += 1;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }

    console.log(
      appliedCount === 0
        ? "Sin migraciones nuevas por aplicar."
        : `${appliedCount} migración(es) nueva(s) aplicada(s).`
    );
  } finally {
    await lockClient.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]).catch(() => {});
    lockClient.release();
  }
  await pool.end();
}

migrate().catch((err) => {
  console.error("Error al migrar:", err);
  process.exit(1);
});
