import { Router } from "express";
import { z } from "zod";
import { extractRuc } from "@appsperu/shared-identity";
import { pool } from "../db/pool.js";
import { comprasPool } from "../db/compras-pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import { vigenteEnFecha } from "../lib/temporal-status.js";

export const velocidadSancionContratoRouter = Router();

const DEFAULT_VENTANA_DIAS_POST_SANCION = 90;

/**
 * Hallazgo real que origina este endpoint (2026-09-21, sesión de análisis de contratos MINSA
 * 2026): LABORATORIOS UNIDOS S.A. (RUC 20417180134) recibió una adjudicación de S/ 600,000 del
 * MINSA el 2026-08-31, con una inhabilitación OSCE VIGENTE desde el 2026-07-08 (Res.
 * 6898-2026-TCP-S1). `GET /api/crossref` ya detecta este caso vía `inhabilitadoEnFechaAdjudicacion`,
 * pero solo por entidad/departamento a la vez y sin una vista dedicada de "alerta" ordenada por
 * severidad. Este endpoint generaliza el hallazgo a nivel nacional (default, no La Libertad, a
 * diferencia de `crossref` — el objetivo es un radar completo, no un reporte regional) y añade el
 * caso "casi lo logra": contratos adjudicados poco después de que una inhabilitación terminó,
 * dentro de una ventana configurable — proveedores que esperan a que expire la sanción para volver
 * a contratar con el Estado, un patrón real de evasión que `crossref` no distingue explícitamente.
 */
const VelocidadQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
  ventanaDiasPostSancion: z.coerce.number().int().min(0).max(3650).default(DEFAULT_VENTANA_DIAS_POST_SANCION),
});

type ContractRow = {
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

interface InhabilitacionRow {
  resolucion: string;
  desde: string | Date | null;
  hasta: string | Date | null;
  estado: string | null;
}

function diffEnDias(desde: unknown, hasta: unknown): number | null {
  if (typeof desde !== "string" && !(desde instanceof Date)) return null;
  if (typeof hasta !== "string" && !(hasta instanceof Date)) return null;
  const start = new Date(typeof desde === "string" ? `${desde.slice(0, 10)}T00:00:00Z` : desde).getTime();
  const end = new Date(typeof hasta === "string" ? `${hasta.slice(0, 10)}T00:00:00Z` : hasta).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.round((end - start) / 86_400_000);
}

/**
 * Evalúa un contrato contra todas las resoluciones de inhabilitación del mismo RUC y se queda
 * con el caso más severo: "durante" una sanción vigente pesa más que "poco después" de que
 * terminó. Un contrato sin ninguna coincidencia dentro de la ventana no genera alerta.
 */
function peorCoincidencia(
  fechaContrato: unknown,
  inhabilitaciones: readonly InhabilitacionRow[],
  ventanaDiasPostSancion: number
): { severidad: "DURANTE_SANCION_VIGENTE" | "POCO_DESPUES_DE_SANCION"; resolucion: string; diasDesdeFinSancion: number | null } | null {
  let mejor: { severidad: "DURANTE_SANCION_VIGENTE" | "POCO_DESPUES_DE_SANCION"; resolucion: string; diasDesdeFinSancion: number | null } | null = null;

  for (const inhab of inhabilitaciones) {
    const estabaVigente = vigenteEnFecha(fechaContrato, inhab.desde, inhab.hasta);
    if (estabaVigente === true) {
      // El caso más severo posible -- no hay uno peor, se puede devolver de inmediato.
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

velocidadSancionContratoRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(VelocidadQuerySchema, req.query, res);
    if (!parsed) return;
    // A diferencia de `crossref` (default LA LIBERTAD), este endpoint es un radar de alerta --
    // el default es nacional; pasar `departamento` lo acota igual que en `crossref`.
    const wantedDepartamento = parsed.departamento?.toUpperCase().trim() ?? null;
    const { ventanaDiasPostSancion } = parsed;

    const [{ rows: awardRows }, { rows: minorContractRows }] = await Promise.all([
      wantedDepartamento
        ? comprasPool.query(
            `SELECT ocid, award_id, supplier_id, supplier_name, buyer_name, valor_monto, valor_moneda, fecha
             FROM awards WHERE departamento = $1`,
            [wantedDepartamento]
          )
        : comprasPool.query(
            `SELECT ocid, award_id, supplier_id, supplier_name, buyer_name, valor_monto, valor_moneda, fecha
             FROM awards`
          ),
      wantedDepartamento
        ? comprasPool.query(
            `SELECT c.contracting_id, c.ocid, c.award_id, c.winning_supplier_id AS supplier_id,
                    s.legal_name AS supplier_name, m.official_name AS buyer_name,
                    c.awarded_amount AS valor_monto, c.award_date AS fecha
             FROM minor_contracts c
             LEFT JOIN supplier_profiles s ON s.supplier_id = c.winning_supplier_id
             LEFT JOIN municipalities m ON m.municipality_id = c.municipality_id
             WHERE c.winning_supplier_id IS NOT NULL AND (m.department = $1 OR c.execution_department = $1)`,
            [wantedDepartamento]
          )
        : comprasPool.query(
            `SELECT c.contracting_id, c.ocid, c.award_id, c.winning_supplier_id AS supplier_id,
                    s.legal_name AS supplier_name, m.official_name AS buyer_name,
                    c.awarded_amount AS valor_monto, c.award_date AS fecha
             FROM minor_contracts c
             LEFT JOIN supplier_profiles s ON s.supplier_id = c.winning_supplier_id
             LEFT JOIN municipalities m ON m.municipality_id = c.municipality_id
             WHERE c.winning_supplier_id IS NOT NULL`
          ),
    ]);

    const contractRows: ContractRow[] = [
      ...awardRows.map((row): ContractRow => ({
        origen: "awards",
        ocid: row.ocid,
        awardId: row.award_id,
        supplierId: row.supplier_id,
        supplierName: row.supplier_name,
        buyerName: row.buyer_name,
        valorMonto: row.valor_monto === null ? null : Number(row.valor_monto),
        valorMoneda: row.valor_moneda,
        fecha: row.fecha,
      })),
      ...minorContractRows.map((row): ContractRow => ({
        origen: "minor_contracts",
        ocid: row.ocid,
        awardId: row.award_id,
        supplierId: row.supplier_id,
        supplierName: row.supplier_name,
        buyerName: row.buyer_name,
        valorMonto: row.valor_monto === null ? null : Number(row.valor_monto),
        valorMoneda: null,
        fecha: row.fecha,
      })),
    ];

    const rucBySupplierId = new Map<string, string>();
    for (const row of contractRows) {
      if (!row.supplierId) continue;
      const ruc = extractRuc(row.supplierId);
      if (ruc) rucBySupplierId.set(row.supplierId, ruc);
    }
    const rucs = [...new Set(rucBySupplierId.values())];

    const inhabilitacionesByRuc = new Map<string, InhabilitacionRow[]>();
    if (rucs.length > 0) {
      const { rows: inhabRows } = await pool.query(
        `SELECT ruc, resolucion, desde, hasta, estado FROM inhabilitaciones WHERE ruc = ANY($1) AND desde IS NOT NULL`,
        [rucs]
      );
      for (const r of inhabRows) {
        if (!inhabilitacionesByRuc.has(r.ruc)) inhabilitacionesByRuc.set(r.ruc, []);
        inhabilitacionesByRuc.get(r.ruc)!.push({ resolucion: r.resolucion, desde: r.desde, hasta: r.hasta, estado: r.estado });
      }
    }

    const alertas = contractRows
      .map((row) => {
        const ruc = row.supplierId ? rucBySupplierId.get(row.supplierId) ?? null : null;
        if (!ruc) return null;
        const inhabilitaciones = inhabilitacionesByRuc.get(ruc) ?? [];
        if (inhabilitaciones.length === 0) return null;
        const coincidencia = peorCoincidencia(row.fecha, inhabilitaciones, ventanaDiasPostSancion);
        if (!coincidencia) return null;

        return {
          origen: row.origen,
          ocid: row.ocid,
          awardId: row.awardId,
          ruc,
          supplierName: row.supplierName,
          buyerName: row.buyerName,
          valorMonto: row.valorMonto,
          valorMoneda: row.valorMoneda,
          fechaContrato: row.fecha,
          severidad: coincidencia.severidad,
          resolucionInhabilitacion: coincidencia.resolucion,
          diasDesdeFinSancion: coincidencia.diasDesdeFinSancion,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => {
        if (a.severidad !== b.severidad) return a.severidad === "DURANTE_SANCION_VIGENTE" ? -1 : 1;
        const diasA = a.diasDesdeFinSancion ?? -1;
        const diasB = b.diasDesdeFinSancion ?? -1;
        return diasA - diasB;
      });

    res.json({
      departamento: wantedDepartamento ?? "TODOS",
      ventanaDiasPostSancion,
      totalAlertas: alertas.length,
      alertas,
      nota:
        "DURANTE_SANCION_VIGENTE: el contrato se adjudicó mientras la inhabilitación estaba activa. " +
        "POCO_DESPUES_DE_SANCION: el contrato se adjudicó dentro de la ventana configurada después de que la inhabilitación terminó. " +
        "Ninguna de las dos conclusiones determina irregularidad por sí sola — requiere revisión humana, mismo estándar que el resto de señales del catálogo.",
    });
  })
);
