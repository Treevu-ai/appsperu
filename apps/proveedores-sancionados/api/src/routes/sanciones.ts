import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const sancionesRouter = Router();

const RucQuerySchema = z.object({
  ruc: z.string().regex(/^\d{8,11}$/, "RUC debe tener entre 8 y 11 dígitos"),
});

/** Todo lo que se sabe de un RUC: inhabilitaciones + multas, sin cruzar nada — solo esta fuente. */
sancionesRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(RucQuerySchema, req.query, res);
  if (!parsed) return;

  const [inhabResult, multaResult] = await Promise.all([
    pool.query(
      `SELECT razon_social, resolucion, periodo_inhabilitacion, desde, hasta, infraccion, otra_infraccion, norma, estado
       FROM inhabilitaciones WHERE ruc = $1 ORDER BY desde DESC NULLS LAST`,
      [parsed.ruc]
    ),
    pool.query(
      `SELECT razon_social, resolucion, fecha_resolucion, monto_multa, infraccion, periodo_suspension, desde, hasta, norma, estado
       FROM multas WHERE ruc = $1 ORDER BY fecha_resolucion DESC NULLS LAST`,
      [parsed.ruc]
    ),
  ]);

  res.json({
    ruc: parsed.ruc,
    tieneInhabilitacionVigente: inhabResult.rows.some((r) => (r.estado ?? "").toUpperCase() === "VIGENTE"),
    inhabilitaciones: inhabResult.rows,
    multas: multaResult.rows,
  });
}));
