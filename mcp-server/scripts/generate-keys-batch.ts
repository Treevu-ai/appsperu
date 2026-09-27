#!/usr/bin/env node
/**
 * Script para generar múltiples códigos sk-rastro-... en batch.
 * Uso:
 *   tsx scripts/generate-keys-batch.ts --count 5 --group "taller-sept" --limit 500
 *   tsx scripts/generate-keys-batch.ts --count 3 --group "workshop-1" --limit 200 --expires-days 7
 */

import { pathToFileURL } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
import { pool } from "../src/db/pool.js";
import { createApiKey } from "../src/auth/api-key.js";

const args = process.argv.slice(2);
function flag(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

interface KeyOutput {
  id: number;
  rawKey: string;
  tier: string;
  group: string | null;
  workshop: string | null;
  queryLimit: number;
  expiresAt: string | null;
}

async function main(): Promise<void> {
  const countRaw = flag("count");
  const group = flag("group");
  const limitRaw = flag("limit");
  const expiresDaysRaw = flag("expires-days");

  if (!countRaw || !Number.isInteger(Number(countRaw)) || Number(countRaw) <= 0) {
    throw new Error("Uso: --count <entero > 0> requerido");
  }
  if (!group) {
    throw new Error("Uso: --group <nombre> requerido");
  }
  if (!limitRaw || !Number.isInteger(Number(limitRaw)) || Number(limitRaw) <= 0) {
    throw new Error("Uso: --limit <entero > 0> requerido");
  }

  const count = Number(countRaw);
  const queryLimit = Number(limitRaw);
  const expiresAt = expiresDaysRaw ? new Date(Date.now() + Number(expiresDaysRaw) * 24 * 60 * 60 * 1000) : undefined;

  console.log(`Generando ${count} código(s) para grupo "${group}" con límite ${queryLimit} queries...`);

  const keys: KeyOutput[] = [];
  for (let i = 0; i < count; i++) {
    const { rawKey, id } = await createApiKey({
      tier: "workshop",
      groupId: group,
      workshopId: null,
      queryLimit,
      expiresAt,
    });
    keys.push({
      id,
      rawKey,
      tier: "workshop",
      group,
      workshop: null,
      queryLimit,
      expiresAt: expiresAt?.toISOString() ?? null,
    });
    console.log(`  [${i + 1}/${count}] ${rawKey}`);
  }

  // Guardar en archivo JSON para referencia
  mkdirSync("./generated-keys", { recursive: true });
  const timestamp = new Date().toISOString().split("T")[0];
  const filename = `./generated-keys/keys-${group}-${timestamp}.json`;
  writeFileSync(filename, JSON.stringify(keys, null, 2));
  console.log(`\n✓ ${count} código(s) generado(s) y guardado(s) en: ${filename}`);
  console.log("\n⚠️  IMPORTANTE: Estos códigos solo se muestran aquí. Guárdalos en un lugar seguro — no son recuperables.\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((err) => {
      console.error("Error:", err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
