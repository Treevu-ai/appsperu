import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const resumenRouter = Router();

const ResumenQuerySchema = z.object({
  dre: z.string().min(1).optional().describe("Búsqueda parcial (ILIKE). Sin filtro: agrega a nivel nacional por DRE."),
});

/**
 * Agregado de casos por tipo de violencia -- por DRE (sin filtro) o por UGEL dentro de un DRE
 * (con `dre`). Pensado para no forzar paginar miles de filas de `GET /api/casos` cuando lo que
 * se necesita es el conteo por territorio.
 */
resumenRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(ResumenQuerySchema, req.query, res);
    if (!parsed) return;
    const { dre } = parsed;

    const groupCol = dre ? "ugel" : "dre";
    const conditions: string[] = ["source_batch_id = (SELECT MAX(source_batch_id) FROM violencia_escolar_casos)"];
    const params: unknown[] = [];
    if (dre) {
      params.push(`%${dre}%`);
      conditions.push(`dre ILIKE $${params.length}`);
    }

    const { rows } = await pool.query<{ territorio: string; psicologica: string; fisica: string; sexual: string; total: string }>(
      `SELECT ${groupCol} AS territorio,
              COUNT(*) FILTER (WHERE tipo_violencia = 'Psicológica')::int AS psicologica,
              COUNT(*) FILTER (WHERE tipo_violencia = 'Física')::int AS fisica,
              COUNT(*) FILTER (WHERE tipo_violencia = 'Sexual')::int AS sexual,
              COUNT(*)::int AS total
       FROM violencia_escolar_casos
       WHERE ${conditions.join(" AND ")}
       GROUP BY ${groupCol}
       ORDER BY total DESC`,
      params
    );

    res.json({
      agregadoPor: dre ? "ugel" : "dre",
      dre: dre ?? null,
      resultados: rows.map((r) => ({
        territorio: r.territorio,
        psicologica: Number(r.psicologica),
        fisica: Number(r.fisica),
        sexual: Number(r.sexual),
        total: Number(r.total),
      })),
      fuente: { dataset: "SíseVe/MINEDU - Listado detallado de casos reportados" },
    });
  })
);
