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

async function migrate() {
  await ensureMigrationsTable();

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
  await pool.end();
}

migrate().catch((err) => {
  console.error("Error al migrar:", err);
  process.exit(1);
});
