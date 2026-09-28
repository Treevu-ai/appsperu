#!/usr/bin/env node
/**
 * Emite el SQL de provisioning de Neon a partir de APP_KEYS, para que la lista
 * de bases nunca se mantenga a mano y no pueda divergir del catálogo que
 * consume el MCP.
 *
 *   node scripts/gen-neon-provisioning.mjs            # a stdout
 *   node scripts/gen-neon-provisioning.mjs --checks   # checklist para el runbook
 *
 * No crea nada: imprime. Aplicar es una decisión manual y deliberada contra
 * una base de producción.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const appsSource = readFileSync(join(here, "..", "src", "apps.ts"), "utf8");

const bloque = appsSource.match(/export const APP_KEYS = \[([\s\S]*?)\] as const;/);
if (!bloque) {
  console.error("No se pudo leer APP_KEYS de src/apps.ts — revisa que la forma no haya cambiado.");
  process.exit(1);
}

const apps = [...bloque[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);

/** Aplana el AppKey al nombre de base, igual que db/neon-env.ts. */
const databaseName = (app) => app.replace(/-/g, "_");

/** Postponidas a la segunda fase: dependen de PostGIS. Deben estar en DEFERRED_APPS. */
const diferidas = new Set(["geo-intersections", "ceplan-geo"]);

const activas = apps.filter((a) => !diferidas.has(a));
const baseMcp = "mcp";
const enDiferida = apps.filter((a) => diferidas.has(a));

if (process.argv.includes("--checks")) {
  console.log(`# Provisioning Neon — ${activas.length} apps + 1 base de auth\n`);
  for (const app of activas) {
    console.log(`- [ ] \`${databaseName(app)}\`  ← ${app}`);
  }
  console.log(`- [ ] \`${baseMcp}\`  ← auth, budgets y rate limits (mcp-server/src/db/migrations/)`);
  console.log(`\n# Segunda fase (PostGIS, no crear todavía)`);
  for (const app of enDiferida) {
    console.log(`- \`${databaseName(app)}\`  ← ${app}`);
  }
  process.exit(0);
}

console.log(`-- Generado por scripts/gen-neon-provisioning.mjs — ${activas.length + 1} bases.`);
console.log(`-- Fase 1: apps sin PostGIS. Fase 2 (${enDiferida.length} apps) aparte.\n`);
console.log(`CREATE DATABASE ${baseMcp};`);
for (const app of activas) {
  console.log(`CREATE DATABASE ${databaseName(app)};`);
}
console.log(`
-- Todas las bases comparten un solo rol y un solo compute: viven en el mismo
-- proyecto. El secret del Worker es la connection string de cualquiera de
-- ellas; el resolver reescribe el path por app (ver src/db/neon-env.ts).`);
