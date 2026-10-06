/**
 * Helper para conectar a bases de datos de otras apps (cross-app queries).
 * Versión local de la lógica del mcp-server para evitar dependencias directas.
 */

import { Pool } from "pg";

const pools = new Map<string, Pool>();

/**
 * Error tipado para "la app cruzada no está configurada".
 * Se usa una clase en vez de comparar strings para que el route pueda
 * distinguir "INFOBRAS no configurada" de un fallo real de Postgres.
 */
export class CrossAppUnavailableError extends Error {
  readonly appName: string;

  constructor(appName: string) {
    super(`${appName} no disponible`);
    this.name = "CrossAppUnavailableError";
    this.appName = appName;
  }
}

export function crossAppPool(appName: string, env: NodeJS.ProcessEnv): Pool | null {
  const envVar = `${appName.toUpperCase()}_DATABASE_URL`;
  const dbUrl = env[envVar];

  if (!dbUrl) {
    return null;
  }

  if (!pools.has(appName)) {
    pools.set(appName, new Pool({ connectionString: dbUrl }));
  }

  return pools.get(appName)!;
}

/**
 * Devuelve el pool de la app o lanza CrossAppUnavailableError si no está configurada.
 */
export function requireCrossAppPool(appName: string, env: NodeJS.ProcessEnv): Pool {
  const db = crossAppPool(appName, env);
  if (!db) {
    crossAppUnavailable(appName);
  }
  return db;
}

export function crossAppUnavailable(appName: string): never {
  throw new CrossAppUnavailableError(appName);
}

/**
 * Cierra y limpia los pools cacheados (tests / hot reload).
 */
export async function resetCrossAppPools(): Promise<void> {
  const entries = [...pools.values()];
  pools.clear();
  await Promise.allSettled(entries.map((p) => p.end()));
}