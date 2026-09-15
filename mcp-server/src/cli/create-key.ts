import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";
import { createApiKey } from "../auth/api-key.js";

/**
 * Emite un código `sk-rastro-...` para un grupo controlado (taller). El
 * código se imprime UNA SOLA VEZ acá — no queda guardado en texto plano en
 * ningún lado, solo su hash en `mcp_api_keys`. Si se pierde, hay que revocar
 * y emitir uno nuevo, no "recuperarlo".
 *
 * Uso:
 *   npm run create-key -- --group "taller-2026-09" --limit 200
 *   npm run create-key -- --group "taller-2026-09" --workshop "sesion-1" --limit 200 --expires-days 3
 */

const VALID_TIERS = ["workshop", "pilot", "internal"] as const;

const args = process.argv.slice(2);
function flag(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main(): Promise<void> {
  const group = flag("group");
  const workshop = flag("workshop");
  const tier = flag("tier") ?? "workshop";
  const limitRaw = flag("limit");
  const expiresDaysRaw = flag("expires-days");

  if (!limitRaw || !Number.isInteger(Number(limitRaw)) || Number(limitRaw) <= 0) {
    throw new Error(
      "Uso: npm run create-key -- --group <nombre> --limit <entero > 0> [--workshop <id>] [--tier <tier>] [--expires-days <n>]"
    );
  }
  if (!VALID_TIERS.includes(tier as (typeof VALID_TIERS)[number])) {
    // No hay CHECK constraint en la DB para esto (a propósito, evita migraciones
    // por cada tier nuevo) — pero un typo acá (ej. "--tier worshop") crearía un
    // código mal-tageado sin ningún error visible si no se valida en la CLI.
    throw new Error(`--tier debe ser uno de: ${VALID_TIERS.join(", ")} (recibido: "${tier}")`);
  }
  const queryLimit = Number(limitRaw);
  const expiresAt = expiresDaysRaw ? new Date(Date.now() + Number(expiresDaysRaw) * 24 * 60 * 60 * 1000) : undefined;

  const { rawKey, id } = await createApiKey({ tier, groupId: group, workshopId: workshop, queryLimit, expiresAt });

  console.log("Código emitido — cópialo ahora, no se vuelve a mostrar:");
  console.log("");
  console.log(`  ${rawKey}`);
  console.log("");
  console.log(
    JSON.stringify(
      { id, tier, group: group ?? null, workshop: workshop ?? null, queryLimit, expiresAt: expiresAt?.toISOString() ?? null },
      null,
      2
    )
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((err) => {
      console.error("No se pudo emitir el código:", err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
