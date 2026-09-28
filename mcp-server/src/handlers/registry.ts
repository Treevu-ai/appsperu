import type { NeonPool } from "../db/neon-pool.js";
import type { NeonEnv } from "../db/neon-env.js";
import { getPoolForApp } from "../db/neon-env.js";
import type { ToolSpec } from "../catalog.js";
import { MODULOS } from "./modules.js";

export interface ToolHandlerContext {
  /**
   * Pool de la base de la propia app. Es el caso mayoritario: la mayoría de
   * las consultas son de una sola base.
   */
  db: NeonPool;
  args: Record<string, unknown>;
  tool: ToolSpec;
  /**
   * Entorno del Worker, para las apps cuyo SQL cruza bases. Quince de las 38
   * apps abren pools hacia otras (`apps/<app>/api/src/db/*-pool.ts`) y esas
   * consultas no se pueden resolver en un solo SQL: se abren como
   * `getPoolForApp(env, app)`.
   *
   * Cada `db.query` abre y cierra su conexión, así que mientras las consultas
   * de una app y otra se hagan de forma secuencial —que es como están
   * escritas— hay una sola conexión en vuelo y el tope de 6 de Workers no
   * aparece. Lo que no se puede es paralelizar consultas contra bases
   * distintas dentro de un mismo handler.
   */
  env: Record<string, unknown>;
}

export interface HandlerResult {
  status: number;
  body: unknown;
}

export type ToolHandler = (ctx: ToolHandlerContext) => Promise<HandlerResult>;

const handlerCache = new Map<string, ToolHandler>();

/**
 * Resuelve un handler desde el mapa estático de módulos. El campo `handler` del
 * ToolSpec tiene formato `"modulo:funcion"` (ej. `"execution:list"`); el módulo
 * vive en `src/handlers/<app>/<modulo>.ts` y se indexa por `"<app>/<modulo>"`.
 *
 * Antes esto usaba `await import(`../handlers/${app}/${modulo}.js`)` con una
 * ruta completamente dinámica. esbuild no puede resolverla y la degrada a un
 * glob que no matchea nada (los fuentes son `.ts`), así que el bundle
 * desplegado se llevaba cero handlers y los 55 tools con `handler` fallaban en
 * runtime sin que ningún test lo notara. `MODULOS` es un import estático: lo
 * empaqueta el bundler y el typecheck lo valida. Se regenera con
 * `node scripts/gen-handler-registry.mjs`.
 */
export function resolveHandler(tool: ToolSpec): ToolHandler | null {
  const handlerKey = tool.handler;
  if (!handlerKey) return null;

  if (handlerCache.has(handlerKey)) {
    return handlerCache.get(handlerKey)!;
  }

  const [moduleName, fnName] = handlerKey.split(":");
  if (!moduleName || !fnName) return null;

  const mod = MODULOS[`${tool.app}/${moduleName}`];
  if (!mod) {
    console.error(`Handler ${handlerKey}: no existe el módulo "${tool.app}/${moduleName}" en MODULOS`);
    return null;
  }

  const fn = mod[fnName];
  if (typeof fn !== "function") {
    console.error(`Handler ${handlerKey} resuelto pero "${fnName}" no es una función exportada por ${tool.app}/${moduleName}`);
    return null;
  }

  handlerCache.set(handlerKey, fn as ToolHandler);
  return fn as ToolHandler;
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

  return handler({ db, args, tool, env });
}
