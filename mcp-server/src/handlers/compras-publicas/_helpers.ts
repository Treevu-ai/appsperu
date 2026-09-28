import type { NeonPool } from "../../db/neon-pool.js";
import type { AppKey } from "../../apps.js";
import type { HandlerResult } from "../registry.js";

/*
 * Utilidades puras que las rutas de `compras-publicas` necesitan y que este
 * bundle no puede importar: viven en el workspace de las apps y `mcp-server`
 * no las declara como dependencia (ver mcp-server/package.json). Se copiaron
 * tal cual para que la lógica no diverja.
 */

/* ---------------------------------------------------------------------------
 * Origen: apps/compras-publicas/api/src/suppliers/concentration.ts.
 * CR3/CR5 (razón de concentración: % del valor total que capturan los 3/5
 * proveedores más grandes) y HHI (Índice Herfindahl-Hirschman: suma de las
 * cuotas de mercado al cuadrado, en base 10,000 — un solo proveedor con
 * 100% da HHI=10000). Fórmulas estándar de organización industrial.
 * ------------------------------------------------------------------------- */
export interface SupplierShare {
  supplierId: string;
  valorTotal: number;
}

export interface ConcentrationResult {
  cr3: number;
  cr5: number;
  hhi: number;
  proveedoresConsiderados: number;
}

export function computeConcentration(shares: SupplierShare[]): ConcentrationResult {
  const total = shares.reduce((sum, s) => sum + s.valorTotal, 0);
  if (total <= 0 || shares.length === 0) {
    return { cr3: 0, cr5: 0, hhi: 0, proveedoresConsiderados: shares.length };
  }

  const sorted = [...shares].sort((a, b) => b.valorTotal - a.valorTotal);
  const percentages = sorted.map((s) => (s.valorTotal / total) * 100);

  const cr3 = percentages.slice(0, 3).reduce((sum, p) => sum + p, 0);
  const cr5 = percentages.slice(0, 5).reduce((sum, p) => sum + p, 0);
  const hhi = percentages.reduce((sum, p) => sum + p * p, 0);

  return {
    cr3: Math.round(cr3 * 10) / 10,
    cr5: Math.round(cr5 * 10) / 10,
    hhi: Math.round(hhi),
    proveedoresConsiderados: shares.length,
  };
}

/* ---------------------------------------------------------------------------
 * Origen: apps/compras-publicas/api/src/minor-contracts/types.ts (línea 1).
 * Límite legal vigente de contrataciones menores (8 UIT, revisado anual).
 * ------------------------------------------------------------------------- */
export const MINOR_CONTRACT_LIMIT_2026 = 44_000;

/* ---------------------------------------------------------------------------
 * Origen: apps/compras-publicas/api/src/routes/entity-profiles.ts (línea 7) y
 * apps/compras-publicas/api/src/routes/observatory.ts (línea 36). Misma
 * definición en ambos archivos — normaliza a number|null preservando null.
 * ------------------------------------------------------------------------- */
export function asNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

/* ---------------------------------------------------------------------------
 * Origen: apps/compras-publicas/api/src/routes/conformacion.ts (línea 13).
 * Enmascara DNI/CE de personas naturales: solo visibles los últimos 3 dígitos.
 * ------------------------------------------------------------------------- */
export function maskDocumento(numero: string | null): string | null {
  if (!numero || numero.length <= 3) return numero;
  return `${"*".repeat(numero.length - 3)}${numero.slice(-3)}`;
}

/* ---------------------------------------------------------------------------
 * Origen: apps/compras-publicas/api/src/routes/observatory.ts (líneas 38-71).
 * Construye el query de agregación territorial (provincia/distrito) para
 * analytics territorial. Recibe el WHERE pre-armado por el caller.
 * ------------------------------------------------------------------------- */
export function territorialAggregationQuery(level: "province" | "district", where: string): string {
  const keys = level === "province" ? "province" : "province, district";
  const district = level === "province" ? "NULL::text AS district" : "t.district";
  const join = level === "province" ? "pc.province = t.province" : "pc.province = t.province AND pc.district = t.district";
  return `
    WITH filtered AS (
      SELECT COALESCE(c.execution_province, 'NO PUBLICADA') AS province,
             COALESCE(c.execution_district, 'NO PUBLICADO') AS district,
             c.winning_supplier_id, c.awarded_amount
      FROM minor_contracts c
      JOIN municipalities m ON m.municipality_id = c.municipality_id
      ${where}
    ), territories AS (
      SELECT ${keys}, COUNT(*)::integer AS contracts, COALESCE(SUM(awarded_amount), 0) AS total_amount,
             COALESCE(AVG(awarded_amount), 0) AS average_amount,
             COUNT(DISTINCT winning_supplier_id)::integer AS supplier_count
      FROM filtered GROUP BY ${keys}
    ), supplier_spend AS (
      SELECT ${keys}, winning_supplier_id, SUM(awarded_amount) AS supplier_amount
      FROM filtered WHERE winning_supplier_id IS NOT NULL GROUP BY ${keys}, winning_supplier_id
    ), ranked AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY ${keys} ORDER BY supplier_amount DESC, winning_supplier_id) AS position
      FROM supplier_spend
    ), concentration AS (
      SELECT ${keys}, MAX(supplier_amount) FILTER (WHERE position = 1) AS cr1_amount,
             SUM(supplier_amount) FILTER (WHERE position <= 3) AS cr3_amount
      FROM ranked GROUP BY ${keys}
    )
    SELECT t.province, ${district}, t.contracts, t.total_amount, t.average_amount, t.supplier_count,
           COALESCE(pc.cr1_amount / NULLIF(t.total_amount, 0), 0) AS cr1,
           COALESCE(pc.cr3_amount / NULLIF(t.total_amount, 0), 0) AS cr3
    FROM territories t LEFT JOIN concentration pc ON ${join}
    ORDER BY t.total_amount DESC, t.province, ${level === "province" ? "t.province" : "t.district"}`;
}

/* ---------------------------------------------------------------------------
 * Origen: mcp-server/src/handlers/proveedores-sancionados/_helpers.ts.
 * El contexto de handler solo entrega el pool de la app propia; necesita que
 * registry.ts exponga `env` en ToolHandlerContext para resolver
 * `getPoolForApp(env, app)` y devolver el pool de la otra base. Hasta entonces,
 * siempre devuelve null.
 * ------------------------------------------------------------------------- */
export function crossAppPool(_app: AppKey): NeonPool | null {
  return null;
}

export function crossAppUnavailable(app: AppKey): HandlerResult {
  return {
    status: 503,
    body: { error: `Servicio ${app} no disponible: falta la conexión a su base de datos.` },
  };
}
