import type { NeonPool } from "../../db/neon-pool.js";
import { getPoolForApp, type NeonEnv } from "../../db/neon-env.js";
import type { AppKey } from "../../apps.js";
import type { HandlerResult } from "../registry.js";

/*
 * Utilidades puras que `infracciones-ambientales/crossref` necesita y que este
 * bundle no puede importar (mismo motivo que proveedores-sancionados/_helpers.ts):
 * viven en el workspace de las apps y `mcp-server` no las declara como
 * dependencia. Copiadas tal cual desde `packages/shared-identity` para que la
 * lógica del cruce no diverja.
 */

const RUC_PREFIXES = ["PE-RUC-", "seace:ruc:"] as const;

export function extractRuc(supplierId: string): string | null {
  for (const prefix of RUC_PREFIXES) {
    if (supplierId.startsWith(prefix)) {
      const ruc = supplierId.slice(prefix.length);
      return /^\d{11}$/.test(ruc) ? ruc : null;
    }
  }
  return null;
}

/*
 * Origen: apps/infracciones-ambientales/api/src/db/external-pools.ts. Esta app
 * abre un pool opcional hacia compras-publicas (enriquecimiento, no bloqueante).
 */
export function crossAppPool(app: AppKey, env: Record<string, unknown>): NeonPool | null {
  return getPoolForApp(env as NeonEnv, app);
}

export function crossAppUnavailable(app: AppKey): HandlerResult {
  return {
    status: 503,
    body: { error: `Servicio ${app} no disponible: falta la conexión a su base de datos.` },
  };
}
