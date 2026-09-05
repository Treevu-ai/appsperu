import { Router } from "express";
import { z } from "zod";
import { LATEST_BUDGET_CTE } from "@appsperu/shared-queries";
import { pool } from "../db/pool.js";
import { radarPool } from "../db/radar-pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const crossrefRouter = Router();

const CrossrefQuerySchema = z.object({
  confidence: z.enum(["confirmada", "candidata"]).optional(),
});

/**
 * Sirve el cruce persistido en `entity_crosswalk`, pero los montos
 * (devengado, valor de compras) se consultan en vivo a cada fuente en vez
 * de guardarse en la tabla — evita servir cifras desactualizadas si se
 * ingiere más data sin recalcular el cruce.
 */
crossrefRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(CrossrefQuerySchema, req.query, res);
  if (!parsed) return;
  const { confidence } = parsed;

  const params: unknown[] = [];
  let where = "";
  if (confidence) {
    params.push(confidence);
    where = `WHERE confidence = $${params.length}`;
  }

  const { rows: crosswalk } = await pool.query(
    `SELECT mef_entity_code, mef_nombre, oece_buyer_id, oece_buyer_name, confidence, score, computed_at
     FROM entity_crosswalk
     ${where}
     ORDER BY confidence, mef_nombre`,
    params
  );

  if (crosswalk.length === 0) {
    res.json({ resultados: [] });
    return;
  }

  const entityCodes = crosswalk.map((r) => r.mef_entity_code);
  const buyerIds = crosswalk.map((r) => r.oece_buyer_id);

  const [devengadoResult, comprasResult] = await Promise.all([
    radarPool.query(
      `${LATEST_BUDGET_CTE}
       SELECT entity_code, SUM(devengado) AS devengado, array_agg(DISTINCT fecha_corte) AS cortes
       FROM latest_budget
       WHERE entity_code = ANY($1)
       GROUP BY entity_code`,
      [entityCodes]
    ),
    pool.query(
      `SELECT buyer_id, COUNT(*) AS procesos, SUM(valor_monto) AS valor_total
       FROM procurement_processes
       WHERE buyer_id = ANY($1)
       GROUP BY buyer_id`,
      [buyerIds]
    ),
  ]);

  const devengadoByEntity = new Map(devengadoResult.rows.map((r) => [r.entity_code, { devengado: Number(r.devengado), cortes: r.cortes }]));
  const comprasByBuyer = new Map(
    comprasResult.rows.map((r) => [r.buyer_id, { procesos: Number(r.procesos), valorTotal: Number(r.valor_total) || 0 }])
  );

  res.json({
    resultados: crosswalk.map((r) => {
      const compras = comprasByBuyer.get(r.oece_buyer_id) ?? { procesos: 0, valorTotal: 0 };
      return {
        mefEntityCode: r.mef_entity_code,
        mefNombre: r.mef_nombre,
        oeceBuyerId: r.oece_buyer_id,
        oeceBuyerName: r.oece_buyer_name,
        confidence: r.confidence,
        score: Number(r.score),
        devengado: devengadoByEntity.get(r.mef_entity_code)?.devengado ?? 0,
        coberturaTemporal: devengadoByEntity.has(r.mef_entity_code)
          ? { cortesUsados: devengadoByEntity.get(r.mef_entity_code)!.cortes, estado: "PARCIAL" }
          : null,
        comprasProcesos: compras.procesos,
        comprasValorTotal: compras.valorTotal,
        computedAt: r.computed_at,
      };
    }),
  });
}));
