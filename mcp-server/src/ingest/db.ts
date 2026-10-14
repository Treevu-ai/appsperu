import "dotenv/config";
import { Pool } from "pg";
import { databaseNameFor, withDatabase } from "../db/neon-env.js";
import type { AppKey } from "../apps.js";

/**
 * Resolución de conexión para los conectores que viven en `mcp-server/src/ingest/`
 * (fuentes nuevas que no tienen app Express propia — decisión explícita del repo:
 * conector + handler MCP + catálogo, sin scaffolding de API).
 *
 * Orden de resolución, de más específica a más general:
 *   1. `<APP>_DATABASE_URL`  — por app, igual que las apps Express con su propio .env
 *   2. `DATABASE_URL`        — una sola base para todo (Docker local de una app)
 *   3. `NEON_DATABASE_URL`   — el secreto del Worker, con el nombre de base derivado
 *      del AppKey (misma resolución que `db/neon-env.ts`)
 *
 * Sin variables, lanza con un mensaje que dice cuál falta: el fallo silencioso de
 * "no conectó" es peor que el error explícito.
 */
export function resolveConnectionString(app: AppKey): string {
  const perApp = process.env[`${app.toUpperCase().replace(/-/g, "_")}_DATABASE_URL`];
  if (perApp && perApp.length > 0) return perApp;

  const generic = process.env.DATABASE_URL;
  if (generic && generic.length > 0) return generic;

  const neon = process.env.NEON_DATABASE_URL;
  if (neon && neon.length > 0) return withDatabase(neon, databaseNameFor(app));

  throw new Error(
    `No hay conexión configurada para la app "${app}". Definí una de: ` +
      `${app.toUpperCase().replace(/-/g, "_")}_DATABASE_URL, DATABASE_URL, o NEON_DATABASE_URL.`
  );
}

/** Pool de `pg` para un conector. El caller es responsable de cerrarlo al terminar. */
export function connect(app: AppKey): Pool {
  return new Pool({ connectionString: resolveConnectionString(app), max: 4 });
}
