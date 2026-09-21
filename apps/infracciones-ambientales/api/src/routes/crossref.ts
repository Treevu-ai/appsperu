import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { comprasPool } from "../db/external-pools.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import { extractRuc } from "../lib/extract-ruc.js";

export const crossrefRouter = Router();

const QuerySchema = z.object({
  ruc: z.string().regex(/^\d{11}$/, "RUC debe tener 11 dígitos").optional(),
  departamento: z.string().min(1).optional().describe("Filtra las infracciones OEFA por departamento antes de cruzar."),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

interface InfraccionAgregada {
  ruc: string;
  nombreAdministrado: string;
  totalInfracciones: number;
  subsectores: string[];
  ultimaFechaRd: string | null;
}

interface ComprasAgregado {
  adjudicaciones: number;
  buyersDistintos: number;
  montoTotal: number;
  ultimaFecha: string | null;
}

/**
 * ¿Qué empresas sancionadas por OEFA (RUIAS) siguen contratando activamente
 * con el Estado (compras-publicas)? Solo cruza `tipo_doc = 'R.U.C.'` -- las
 * 15 filas de persona natural (`D.N.I.`) vienen enmascaradas desde la
 * ingesta (últimos 3 dígitos, ver migración 001) y no se pueden cruzar por
 * RUC/DNI completo, mismo criterio de no adivinar identidad que el resto
 * del catálogo.
 *
 * Verificado en vivo 2026-09-21: 293 de 3,246 RUC sancionados por OEFA
 * (9.0%) tienen al menos una adjudicación u contrato menor real en
 * compras-publicas. No implica irregularidad -- una sanción ambiental no
 * inhabilita para contratar con el Estado (a diferencia de una
 * inhabilitación del Tribunal de Contrataciones), es solo una coincidencia
 * de identidad entre dos registros públicos independientes.
 */
crossrefRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(QuerySchema, req.query, res);
    if (!parsed) return;
    const { ruc, departamento, limit, offset } = parsed;

    if (!comprasPool) {
      res.json({ estado: "ENRIQUECIMIENTO_NO_CONFIGURADO", total: 0, resultados: [] });
      return;
    }

    const conditions: string[] = ["tipo_doc = 'R.U.C.'"];
    const params: unknown[] = [];
    if (ruc) {
      params.push(ruc);
      conditions.push(`id_doc_administrado = $${params.length}`);
    }
    if (departamento) {
      params.push(departamento.toUpperCase());
      conditions.push(`departamento = $${params.length}`);
    }

    const { rows: infraccionRows } = await pool.query<{
      ruc: string;
      nombre_administrado: string;
      total_infracciones: string;
      subsectores: string[] | null;
      ultima_fecha_rd: string | null;
    }>(
      `SELECT id_doc_administrado AS ruc,
              MAX(nombre_administrado) AS nombre_administrado,
              COUNT(*) AS total_infracciones,
              array_agg(DISTINCT subsector_economico) FILTER (WHERE subsector_economico IS NOT NULL) AS subsectores,
              MAX(fecha_rd) AS ultima_fecha_rd
       FROM infracciones_ambientales
       WHERE ${conditions.join(" AND ")}
       GROUP BY id_doc_administrado`,
      params
    );

    if (infraccionRows.length === 0) {
      res.json({ total: 0, resultados: [], limitation: LIMITATION });
      return;
    }

    const infraccionesPorRuc = new Map<string, InfraccionAgregada>(
      infraccionRows.map((r) => [
        r.ruc,
        {
          ruc: r.ruc,
          nombreAdministrado: r.nombre_administrado,
          totalInfracciones: Number(r.total_infracciones),
          subsectores: r.subsectores ?? [],
          ultimaFechaRd: r.ultima_fecha_rd,
        },
      ])
    );

    const rucs = [...infraccionesPorRuc.keys()];
    const awardsSupplierIds = rucs.map((r) => `PE-RUC-${r}`);
    const minorSupplierIds = rucs.map((r) => `seace:ruc:${r}`);

    let comprasPorRuc = new Map<string, ComprasAgregado>();
    try {
      const [{ rows: awardRows }, { rows: minorRows }] = await Promise.all([
        comprasPool.query<{ supplier_id: string; buyer_name: string | null; valor_monto: string | null; fecha: string | null }>(
          `SELECT supplier_id, buyer_name, valor_monto, fecha FROM awards WHERE supplier_id = ANY($1)`,
          [awardsSupplierIds]
        ),
        comprasPool.query<{ winning_supplier_id: string; buyer_name: string | null; awarded_amount: string | null; award_date: string | null }>(
          `SELECT c.winning_supplier_id, m.official_name AS buyer_name, c.awarded_amount, c.award_date
           FROM minor_contracts c
           LEFT JOIN municipalities m ON m.municipality_id = c.municipality_id
           WHERE c.winning_supplier_id = ANY($1)`,
          [minorSupplierIds]
        ),
      ]);

      const acc = new Map<string, { adjudicaciones: number; buyers: Set<string>; montoTotal: number; ultimaFecha: string | null }>();
      const addRow = (supplierId: string, buyerName: string | null, monto: string | null, fecha: string | null) => {
        const supplierRuc = extractRuc(supplierId);
        if (!supplierRuc) return;
        const entry = acc.get(supplierRuc) ?? { adjudicaciones: 0, buyers: new Set<string>(), montoTotal: 0, ultimaFecha: null };
        entry.adjudicaciones += 1;
        if (buyerName) entry.buyers.add(buyerName);
        entry.montoTotal += Number(monto) || 0;
        if (fecha && (!entry.ultimaFecha || fecha > entry.ultimaFecha)) entry.ultimaFecha = fecha;
        acc.set(supplierRuc, entry);
      };
      for (const r of awardRows) addRow(r.supplier_id, r.buyer_name, r.valor_monto, r.fecha);
      for (const r of minorRows) addRow(r.winning_supplier_id, r.buyer_name, r.awarded_amount, r.award_date);

      comprasPorRuc = new Map(
        [...acc.entries()].map(([ruc, v]) => [
          ruc,
          { adjudicaciones: v.adjudicaciones, buyersDistintos: v.buyers.size, montoTotal: v.montoTotal, ultimaFecha: v.ultimaFecha },
        ])
      );
    } catch (err) {
      console.error("No se pudo cruzar contra compras-publicas (enriquecimiento opcional):", err instanceof Error ? err.message : err);
      res.json({ estado: "ENRIQUECIMIENTO_NO_DISPONIBLE", total: 0, resultados: [] });
      return;
    }

    const resultados = rucs
      .filter((r) => comprasPorRuc.has(r))
      .map((r) => ({
        ...infraccionesPorRuc.get(r)!,
        comprasPublicas: comprasPorRuc.get(r)!,
      }))
      .sort((a, b) => b.comprasPublicas.montoTotal - a.comprasPublicas.montoTotal);

    res.json({
      total: resultados.length,
      resultados: resultados.slice(offset, offset + limit),
      limitation: LIMITATION,
    });
  })
);

const LIMITATION =
  "Solo cruza RUC (empresas) -- las infracciones a persona natural (D.N.I.) vienen enmascaradas desde la ingesta y no se pueden cruzar. Una sanción ambiental de OEFA no inhabilita legalmente para contratar con el Estado (a diferencia de una inhabilitación del Tribunal de Contrataciones): esta es una coincidencia de identidad entre dos registros públicos independientes, no una irregularidad por sí sola.";
