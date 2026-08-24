import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { comprasPool } from "../db/compras-pool.js";
import { fiscalPool } from "../db/fiscal-pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import { consolidarEstadoTemporal, vigenteEnFecha } from "../lib/temporal-status.js";

export const crossrefRouter = Router();

const CrossrefQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
  soloInhabilitados: z.enum(["true", "false"]).optional(),
});

const RUC_PREFIX = "PE-RUC-";
function extractRuc(supplierId: string): string | null {
  if (!supplierId.startsWith(RUC_PREFIX)) return null;
  const ruc = supplierId.slice(RUC_PREFIX.length);
  return /^\d{11}$/.test(ruc) ? ruc : null;
}

/**
 * Cruce proveedor <-> Tribunal de Contrataciones, por RUC exacto (extraído
 * de `supplier_id` de compras-publicas, mismo patrón que
 * identidad-fiscal/crossref.ts). El estado de la fuente no basta para
 * calificar una adjudicación histórica: el cruce conserva por separado el
 * periodo de inhabilitación, la fecha de adjudicación y la fecha de extracción.
 */
crossrefRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(CrossrefQuerySchema, req.query, res);
  if (!parsed) return;
  const wantedDepartamento = parsed.departamento?.toUpperCase().trim() ?? "LA LIBERTAD";
  const soloInhabilitados = parsed.soloInhabilitados === "true";

  const { rows: awardRows } = await comprasPool.query(
    `SELECT ocid, award_id, supplier_id, supplier_name, buyer_name, valor_monto, valor_moneda, fecha
     FROM awards WHERE departamento = $1`,
    [wantedDepartamento]
  );

  const rucBySupplierId = new Map<string, string>();
  for (const row of awardRows) {
    const ruc = extractRuc(row.supplier_id as string);
    if (ruc) rucBySupplierId.set(row.supplier_id as string, ruc);
  }
  const rucs = [...new Set(rucBySupplierId.values())];

  const inhabByRuc = new Map<string, {
    estado: string;
    periodo: string | null;
    resolucion: string;
    desde: string | Date | null;
    hasta: string | Date | null;
    extraidoEn: string | Date | null;
  }[]>();
  const estadoTributarioByRuc = new Map<string, { estado: string | null; condicion: string | null; extraidoEn: string | Date | null }>();

  if (rucs.length > 0) {
    const { rows: inhabRows } = await pool.query(
      `SELECT i.ruc, i.estado, i.periodo_inhabilitacion, i.resolucion, i.desde, i.hasta, b.fetched_at
         FROM inhabilitaciones i
         JOIN raw_sanciones_batches b ON b.id = i.source_batch_id
        WHERE i.ruc = ANY($1)`,
      [rucs]
    );
    for (const r of inhabRows) {
      if (!inhabByRuc.has(r.ruc)) inhabByRuc.set(r.ruc, []);
      inhabByRuc.get(r.ruc)!.push({ estado: r.estado, periodo: r.periodo_inhabilitacion, resolucion: r.resolucion, desde: r.desde, hasta: r.hasta, extraidoEn: r.fetched_at });
    }

    const { rows: fiscalRows } = await fiscalPool.query(
      `SELECT c.ruc, c.estado_contribuyente, c.condicion_domicilio, b.fetched_at
         FROM contribuyentes c
         JOIN raw_padron_batches b ON b.id = c.source_batch_id
        WHERE c.ruc = ANY($1)`,
      [rucs]
    );
    for (const r of fiscalRows) {
      estadoTributarioByRuc.set(r.ruc, { estado: r.estado_contribuyente, condicion: r.condicion_domicilio, extraidoEn: r.fetched_at });
    }
  }

  const resultados = awardRows.map((row) => {
    const supplierId = row.supplier_id as string;
    const ruc = rucBySupplierId.get(supplierId) ?? null;
    const inhabilitaciones = ruc ? inhabByRuc.get(ruc) ?? [] : [];
    const tieneInhabilitacionVigente = inhabilitaciones.some((i) => (i.estado ?? "").toUpperCase() === "VIGENTE");
    const inhabilitadoEnFechaAdjudicacion = consolidarEstadoTemporal(
      inhabilitaciones.map((i) => vigenteEnFecha(row.fecha, i.desde, i.hasta))
    );
      const fiscal = ruc ? estadoTributarioByRuc.get(ruc) ?? null : null;
    const inhabilitacionExtraidaEn = inhabilitaciones.reduce<string | Date | null>((latest, item) => {
      if (!item.extraidoEn) return latest;
      if (!latest || new Date(item.extraidoEn).getTime() > new Date(latest).getTime()) return item.extraidoEn;
      return latest;
    }, null);

    return {
      ocid: row.ocid,
      awardId: row.award_id,
      supplierId,
      supplierName: row.supplier_name,
      buyerName: row.buyer_name,
      valorMonto: row.valor_monto === null ? null : Number(row.valor_monto),
      valorMoneda: row.valor_moneda,
      fecha: row.fecha,
      rucValido: ruc !== null,
      fechaAdjudicacion: row.fecha,
      inhabilitacionesEncontradas: inhabilitaciones.length,
      tieneInhabilitacionVigente,
      estadoActualFuente: {
        tieneInhabilitacionVigente,
        inhabilitacionExtraidaEn,
        estadoContribuyente: fiscal?.estado ?? null,
        condicionDomicilio: fiscal?.condicion ?? null,
        padronExtraidoEn: fiscal?.extraidoEn ?? null,
      },
      inhabilitadoEnFechaAdjudicacion,
      estadoTributarioEnFechaAdjudicacion: "NO_DISPONIBLE",
      estadoContribuyente: fiscal?.estado ?? null,
      condicionDomicilio: fiscal?.condicion ?? null,
    };
  });

  res.json({
    departamento: wantedDepartamento,
    resultados: soloInhabilitados ? resultados.filter((r) => r.tieneInhabilitacionVigente) : resultados,
  });
}));
