import { Router } from "express";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";

export const metaFreshnessRouter = Router();

/** Devuelve la frescura de la fuente proveedoresSancionados (TCE/OSCE). */
metaFreshnessRouter.get("/freshness", asyncHandler(async (_req, res) => {
  const row = await pool.query<{
    ultima_ejecucion: Date | null;
    filas_ingeridas: number | null;
    fuente: string | null;
  }>(
    `SELECT fuente, ultima_ejecucion, filas_ingeridas
     FROM ingestion_log
     WHERE fuente = 'tce_osce'
     ORDER BY ultima_ejecucion DESC
     LIMIT 1`
  );

  const first = row.rows[0];

  res.json({
    proveedoresSancionados: {
      ultimaIngesta: first?.ultima_ejecucion ? first.ultima_ejecucion.toISOString() : null,
      diasSinActualizar: first?.ultima_ejecucion
        ? Math.floor((Date.now() - new Date(first.ultima_ejecucion).getTime()) / 86_400_000)
        : null,
      fuente: "tce_osce",
      filasIngeridas: first?.filas_ingeridas ?? 0,
    },
  });
}));
