import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const municipalidadesRouter = Router();

const MunicipalidadesQuerySchema = z.object({
  anio: z.coerce.number().int().min(2000).max(2100).optional(),
  departamento: z.string().min(1).optional(),
  ubigeo: z
    .string()
    .regex(/^\d{6}$/, "ubigeo debe tener 6 dígitos")
    .optional(),
  historico: z.enum(["true", "false"]).optional()
    .describe("true trae todos los años ingeridos (DQ-16) — sin esto y sin `anio`, solo el año más reciente."),
});

municipalidadesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(MunicipalidadesQuerySchema, req.query, res);
    if (!parsed) return;
    const { anio, departamento, ubigeo, historico } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (anio) {
      params.push(anio);
      conditions.push(`m.anio = $${params.length}`);
    } else if (historico !== "true") {
      // DQ-16: sin anio/historico explícitos, solo el año más reciente — la
      // tabla es un panel multi-año (UNIQUE idmunici+anio) y sin este filtro
      // cada municipalidad aparecía duplicada una vez por año ingerido
      // (ej. Pataz: 26 filas para 13 municipalidades en vez de 13).
      conditions.push(`m.anio = (SELECT MAX(anio) FROM renamu_municipalidades)`);
    }
    if (departamento) {
      params.push(`%${departamento}%`);
      conditions.push(`m.departamento ILIKE $${params.length}`);
    }
    if (ubigeo) {
      params.push(ubigeo);
      conditions.push(`m.ubigeo = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT m.id, m.anio, m.idmunici, m.ubigeo, m.departamento, m.provincia, m.distrito, m.tipomuni, rb.fetched_at
       FROM renamu_municipalidades m
       JOIN raw_renamu_batches rb ON rb.id = m.source_batch_id
       ${where}
       ORDER BY m.anio DESC, m.ubigeo`,
      params
    );

    res.json({
      resultados: rows.map((r) => ({
        idmunici: r.idmunici,
        anio: r.anio,
        ubigeo: r.ubigeo,
        departamento: r.departamento,
        provincia: r.provincia,
        distrito: r.distrito,
        tipomuni: { "1": "Provincial", "2": "Distrital", "3": "Centro Poblado" }[r.tipomuni as string] ?? r.tipomuni,
        fuente: { dataset: "INEI - RENAMU", extraidoEl: r.fetched_at },
      })),
    });
  })
);
