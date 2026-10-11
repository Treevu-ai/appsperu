import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const perdidaRouter = Router();

interface PerdidaRow {
  anio: number;
  perdida_ha: number | string | null;
  rango1_ha: number | string | null;
  rango2_ha: number | string | null;
  rango3_ha: number | string | null;
  rango4_ha: number | string | null;
  rango5_ha: number | string | null;
  tipo_bosque: string | null;
}

function toApiShape(r: PerdidaRow) {
  return {
    anio: r.anio,
    perdidaHa: r.perdida_ha === null ? null : Number(r.perdida_ha),
    rangos: {
      rango1Ha: r.rango1_ha === null ? null : Number(r.rango1_ha),
      rango2Ha: r.rango2_ha === null ? null : Number(r.rango2_ha),
      rango3Ha: r.rango3_ha === null ? null : Number(r.rango3_ha),
      rango4Ha: r.rango4_ha === null ? null : Number(r.rango4_ha),
      rango5Ha: r.rango5_ha === null ? null : Number(r.rango5_ha),
    },
    tipoBosque: r.tipo_bosque,
  };
}

const PerdidaQuerySchema = z.object({
  ubigeo: z.string().min(2).max(2),
});

/** Serie anual de pérdida de bosque (2001 en adelante) para un departamento. */
perdidaRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(PerdidaQuerySchema, req.query, res);
    if (!parsed) return;
    const { ubigeo } = parsed;

    const { rows } = await pool.query<PerdidaRow>(
      `SELECT anio, perdida_ha, rango1_ha, rango2_ha, rango3_ha, rango4_ha, rango5_ha, tipo_bosque
       FROM perdida_bosque_anual
       WHERE nivel = '01' AND ubigeo = $1
       ORDER BY anio`,
      [ubigeo]
    );

    res.json({
      ubigeo,
      serieAnual: rows.map(toApiShape),
      fuente: { dataset: "Geobosques (MINAM) - Pérdida de bosque húmedo amazónico" },
    });
  })
);

interface PostCorteRow {
  ubigeo: string;
  nivel: string;
  perdida_ha_post_corte: number | string | null;
  anios_con_perdida: number | string;
}

/** Pérdida acumulada después del corte EUDR (2020-12-31), por departamento. */
perdidaRouter.get(
  "/post-corte-eudr",
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query<PostCorteRow>(
      `SELECT ubigeo, nivel, perdida_ha_post_corte, anios_con_perdida
       FROM v_perdida_bosque_post_corte_eudr
       WHERE nivel = '01'
       ORDER BY perdida_ha_post_corte DESC NULLS LAST`
    );

    res.json({
      resultados: rows.map((r) => ({
        ubigeo: r.ubigeo,
        perdidaHaPostCorte: r.perdida_ha_post_corte === null ? null : Number(r.perdida_ha_post_corte),
        aniosConPerdida: Number(r.anios_con_perdida),
      })),
      corte: "2020-12-31",
      fuente: { dataset: "Geobosques (MINAM) - Pérdida de bosque húmedo amazónico" },
    });
  })
);
