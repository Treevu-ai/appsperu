import { pool } from "./pool.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  console.log("[migrate] Aplicando migraciones...");

  // Create migrations tracking table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id        BIGSERIAL PRIMARY KEY,
      name      TEXT NOT NULL UNIQUE,
      applied   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const migrationFiles = ["001_init.sql", "002_normalizer_version.sql"];

  for (const file of migrationFiles) {
    const result = await pool.query<{ name: string }>(
      "SELECT name FROM _migrations WHERE name = $1",
      [file]
    );
    if (result.rowCount && result.rowCount > 0) {
      console.log(`[migrate] Ya aplicada: ${file}`);
      continue;
    }

    const sql = readFileSync(join(__dirname, "migrations", file), "utf8");
    await pool.query(sql);
    await pool.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
    console.log(`[migrate] Aplicada: ${file}`);
  }

  console.log("[migrate] Listo.");
  await pool.end();
  process.exit(0);
}

migrate().catch((err) => {
  console.error("[migrate] Error:", err);
  process.exit(1);
});
