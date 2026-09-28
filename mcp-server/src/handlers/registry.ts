import type { NeonPool } from "../db/neon-pool.js";
import type { NeonEnv } from "../db/neon-env.js";
import { getPoolForApp } from "../db/neon-env.js";
import type { ToolSpec } from "../catalog.js";

export interface ToolHandlerContext {
  db: NeonPool;
  args: Record<string, unknown>;
  tool: ToolSpec;
}

export interface HandlerResult {
  status: number;
  body: unknown;
}

export type ToolHandler = (ctx: ToolHandlerContext) => Promise<HandlerResult>;

const handlerCache = new Map<string, ToolHandler>();

/**
 * Resuelve un handler desde el sistema de módulos. El campo `handler` del
 * ToolSpec tiene formato `"modulo:funcion"` (ej. `"execution:list"`).
 * Cada módulo vive en `src/handlers/<app>/<modulo>.ts` y exporta funciones
 * nombradas. Se cachea para evitar imports repetidos.
 */
export async function resolveHandler(tool: ToolSpec): Promise<ToolHandler | null> {
  const handlerKey = tool.handler;
  if (!handlerKey) return null;

  if (handlerCache.has(handlerKey)) {
    return handlerCache.get(handlerKey)!;
  }

  const [moduleName, fnName] = handlerKey.split(":");
  if (!moduleName || !fnName) return null;

  try {
    const mod = await import(`../handlers/${tool.app}/${moduleName}.js`);
    const fn = mod[fnName];
    if (typeof fn !== "function") {
      console.error(`Handler ${handlerKey} resuelto pero no es función en handlers/${tool.app}/${moduleName}.ts`);
      return null;
    }
    handlerCache.set(handlerKey, fn as ToolHandler);
    return fn as ToolHandler;
  } catch (err) {
    console.error(`No se pudo cargar handler ${handlerKey}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Ejecuta un handler contra Neon. Deriva el handler desde `tool.handler`; si no
 * existe, lanza para que el caller haga fallback a HTTP.
 */
export async function executeHandler(
  env: Record<string, unknown>,
  tool: ToolSpec,
  args: Record<string, unknown>
): Promise<HandlerResult> {
  const handler = await resolveHandler(tool);
  if (!handler) {
    throw new Error(`No hay handler para el tool "${tool.name}"`);
  }

  const db = getPoolForApp(env as NeonEnv, tool.app);
  if (!db) {
    throw new Error(`No hay base Neon configurada para la app "${tool.app}"`);
  }

  return handler({ db, args, tool });
}
