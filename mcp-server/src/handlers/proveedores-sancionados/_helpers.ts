import type { NeonPool } from "../../db/neon-pool.js";
import { getPoolForApp, type NeonEnv } from "../../db/neon-env.js";
import type { AppKey } from "../../apps.js";
import type { HandlerResult } from "../registry.js";

/*
 * Utilidades puras que las rutas de `proveedores-sancionados` necesitan y que
 * este bundle no puede importar: viven en el workspace de las apps y
 * `mcp-server` no las declara como dependencia (ver mcp-server/package.json).
 * Se copiaron tal cual para que la lógica del cruce no diverja.
 */

/* ---------------------------------------------------------------------------
 * Origen: packages/shared-identity/src/index.ts (package @appsperu/shared-identity).
 * `extractRuc` normaliza `supplier_id` (formato OCDS `PE-RUC-` y formato SEACE
 * `seace:ruc:`) y `vigenteEnFecha`/`consolidarEstadoTemporal` resuelven el
 * estado temporal de un rango `[desde, hasta]` sin inventar un `false` cuando
 * falta la fecha.
 * ------------------------------------------------------------------------- */
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

export type EstadoTemporal = true | false | "NO_VERIFICABLE";

function toDateOnly(value: unknown): number | null {
  if (value instanceof Date) {
    const utc = Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
    return Number.isNaN(utc) ? null : utc;
  }
  if (typeof value !== "string" || value.trim() === "") return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`).getTime();
  return Number.isNaN(date) ? null : date;
}

export function vigenteEnFecha(fechaReferencia: unknown, desde: unknown, hasta: unknown): EstadoTemporal {
  const reference = toDateOnly(fechaReferencia);
  const start = toDateOnly(desde);
  const end = toDateOnly(hasta);
  if (reference === null || start === null) return "NO_VERIFICABLE";
  if (reference < start) return false;
  return end === null || reference <= end;
}

export function consolidarEstadoTemporal(estados: EstadoTemporal[]): EstadoTemporal {
  if (estados.some((estado) => estado === true)) return true;
  if (estados.length > 0 && estados.every((estado) => estado === false)) return false;
  return "NO_VERIFICABLE";
}

/* ---------------------------------------------------------------------------
 * Origen: apps/proveedores-sancionados/api/src/routes/personas-sancionadas.ts
 * (y su copia idéntica en
 * apps/proveedores-sancionados/api/src/routes/candidatos-sancionados.ts).
 * El DNI nunca se expone completo: solo los últimos 3 dígitos.
 * ------------------------------------------------------------------------- */
export function maskDocumento(numero: string | null): string | null {
  if (!numero || numero.length <= 3) return numero;
  return `${"*".repeat(numero.length - 3)}${numero.slice(-3)}`;
}

/* ---------------------------------------------------------------------------
 * Origen: apps/proveedores-sancionados/api/src/routes/velocidad-sancion-contrato.ts
 * (copia idéntica en
 * apps/proveedores-sancionados/api/src/routes/extorsion-velocidad-sancion.ts).
 * Evalúa un contrato contra las resoluciones de un mismo RUC y se queda con la
 * coincidencia más severa.
 * ------------------------------------------------------------------------- */
export interface InhabilitacionRow {
  resolucion: string;
  desde: string | Date | null;
  hasta: string | Date | null;
  estado: string | null;
}

export function diffEnDias(desde: unknown, hasta: unknown): number | null {
  if (typeof desde !== "string" && !(desde instanceof Date)) return null;
  if (typeof hasta !== "string" && !(hasta instanceof Date)) return null;
  const start = new Date(typeof desde === "string" ? `${desde.slice(0, 10)}T00:00:00Z` : desde).getTime();
  const end = new Date(typeof hasta === "string" ? `${hasta.slice(0, 10)}T00:00:00Z` : hasta).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.round((end - start) / 86_400_000);
}

export function peorCoincidencia(
  fechaContrato: unknown,
  inhabilitaciones: readonly InhabilitacionRow[],
  ventanaDiasPostSancion: number
): { severidad: "DURANTE_SANCION_VIGENTE" | "POCO_DESPUES_DE_SANCION"; resolucion: string; diasDesdeFinSancion: number | null } | null {
  let mejor: { severidad: "DURANTE_SANCION_VIGENTE" | "POCO_DESPUES_DE_SANCION"; resolucion: string; diasDesdeFinSancion: number | null } | null = null;

  for (const inhab of inhabilitaciones) {
    const estabaVigente = vigenteEnFecha(fechaContrato, inhab.desde, inhab.hasta);
    if (estabaVigente === true) {
      return { severidad: "DURANTE_SANCION_VIGENTE", resolucion: inhab.resolucion, diasDesdeFinSancion: null };
    }
    if (estabaVigente === false && inhab.hasta !== null) {
      const dias = diffEnDias(inhab.hasta, fechaContrato);
      if (dias !== null && dias >= 0 && dias <= ventanaDiasPostSancion) {
        if (!mejor || dias < (mejor.diasDesdeFinSancion ?? Infinity)) {
          mejor = { severidad: "POCO_DESPUES_DE_SANCION", resolucion: inhab.resolucion, diasDesdeFinSancion: dias };
        }
      }
    }
  }

  return mejor;
}

/* ---------------------------------------------------------------------------
 * Origen: apps/proveedores-sancionados/api/src/routes/crossref.ts (misma forma
 * en velocidad-sancion-contrato.ts). `ocid`+`awardId` son la clave de unicidad
 * de `awards` y `minor_contracts` en compras-publicas; prefijar con `origen`
 * evita colisiones entre ambas tablas.
 * ------------------------------------------------------------------------- */
export type ContractRow = {
  origen: "awards" | "minor_contracts";
  ocid: string | null;
  awardId: string | null;
  supplierId: string | null;
  supplierName: string | null;
  buyerName: string | null;
  valorMonto: number | null;
  valorMoneda: string | null;
  fecha: string | Date | null;
};

export function referenciaContrato(row: Pick<ContractRow, "origen" | "ocid" | "awardId">): string {
  return `${row.origen}:${row.ocid ?? ""}:${row.awardId ?? ""}`;
}

/* ---------------------------------------------------------------------------
 * Origen: apps/proveedores-sancionados/api/src/db/{compras,fiscal,candidatos,
 * seguridad}-pool.ts. Esta app abre pools hacia otras bases (compras-publicas,
 * identidad-fiscal, candidatos-erm, seguridad-ciudadana) y las consultas
 * viven en bases distintas: no se pueden resolver en un solo SQL.
 * ------------------------------------------------------------------------- */
export function crossAppPool(app: AppKey, env: Record<string, unknown>): NeonPool | null {
  return getPoolForApp(env as NeonEnv, app);
}

export function crossAppUnavailable(app: AppKey): HandlerResult {
  return {
    status: 503,
    body: { error: `Servicio ${app} no disponible: falta la conexión a su base de datos.` },
  };
}
