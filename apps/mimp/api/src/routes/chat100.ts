import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const chat100Router = Router();

const Chat100QuerySchema = z.object({
  anio: z.coerce.number().int().min(2000).max(2100).optional(),
});

chat100Router.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(Chat100QuerySchema, req.query, res);
  if (!parsed) return;
  const { anio } = parsed;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (anio) {
    params.push(anio);
    conditions.push(`ch.anio_reporte = $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `SELECT ch.anio_reporte, ch.periodo, ch.consultas_total, ch.consultas_hombres,
            ch.consultas_mujeres, ch.consultas_no_especifica_sexo, rb.fetched_at
     FROM chat100_consultas ch
     JOIN raw_mimp_batches rb ON rb.id = ch.source_batch_id
     ${where}
     ORDER BY ch.anio_reporte DESC`,
    params
  );

  res.json({
    resultados: rows.map((r) => ({
      anioReporte: r.anio_reporte,
      periodo: r.periodo,
      consultasTotal: r.consultas_total === null ? null : Number(r.consultas_total),
      consultasHombres: r.consultas_hombres === null ? null : Number(r.consultas_hombres),
      consultasMujeres: r.consultas_mujeres === null ? null : Number(r.consultas_mujeres),
      consultasNoEspecificaSexo: r.consultas_no_especifica_sexo === null ? null : Number(r.consultas_no_especifica_sexo),
      fuente: { dataset: "MIMP - Consultas atendidas por el servicio Chat 100, agregado nacional anual", extraidoEl: r.fetched_at },
    })),
  });
}));
