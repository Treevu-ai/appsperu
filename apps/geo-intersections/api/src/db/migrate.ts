import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function runMigrations() {
  const migrationsDir = join(__dirname, "migrations");
  const migrationFiles = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of migrationFiles) {
    const path = join(__dirname, "migrations", file);
    const sql = readFileSync(path, "utf-8");
    console.log(`Ejecutando ${file}...`);
    await pool.query(sql);
    console.log(`  ✓ ${file} OK`);
  }

  console.log("Migraciones completadas.");
  await pool.end();
}

runMigrations().catch((err) => {
  console.error("Error en migraciones:", err);
  process.exit(1);
});
