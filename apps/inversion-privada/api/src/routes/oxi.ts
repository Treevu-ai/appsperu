import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const oxiRouter = Router();

const OxiQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
  provincia: z.string().min(1).optional(),
  entidad: z.string().min(1).optional(),
  codigoSnip: z.string().min(1).optional(),
});

oxiRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(OxiQuerySchema, req.query, res);
    if (!parsed) return;

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (parsed.departamento) {
      values.push(parsed.departamento.trim().toUpperCase());
      conditions.push(`o.departamento = $${values.length}`);
    }
    if (parsed.provincia) {
      values.push(parsed.provincia.trim().toUpperCase());
      conditions.push(`o.provincia = $${values.length}`);
    }
    if (parsed.entidad) {
      values.push(`%${parsed.entidad}%`);
      conditions.push(`o.entidad ILIKE $${values.length}`);
    }
    if (parsed.codigoSnip) {
      values.push(parsed.codigoSnip.trim());
      conditions.push(`o.codigo_snip = $${values.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT o.oxi_id, o.fase_oxi, o.tipo_inversion, o.nivel_gobierno, o.departamento, o.provincia,
              o.distrito, o.entidad, o.codigo_snip, o.nombre, o.funcion, o.tipologia,
              o.monto_referencial, o.monto_referencial_soles, o.rango_monto, rb.fetched_at
       FROM oxi_promotion_projects o
       JOIN raw_oxi_batches rb ON rb.id = o.source_batch_id
       ${where}
       ORDER BY o.monto_referencial_soles DESC NULLS LAST, o.nombre
       LIMIT 1000`,
      values
    );

    const { rows: metaRows } = await pool.query<{ records_total: number; fetched_at: string }>(
      `SELECT records_total, fetched_at FROM raw_oxi_batches ORDER BY fetched_at DESC LIMIT 1`
    );
    const latest = metaRows[0];

    res.json({
      resultados: rows.map((r) => ({
        oxiId: r.oxi_id,
        faseOxi: r.fase_oxi,
        tipoInversion: r.tipo_inversion,
        nivelGobierno: r.nivel_gobierno,
        departamento: r.departamento,
        provincia: r.provincia,
        distrito: r.distrito,
        entidad: r.entidad,
        codigoSnip: r.codigo_snip,
        nombre: r.nombre,
        funcion: r.funcion,
        tipologia: r.tipologia,
        montoReferencial: r.monto_referencial,
        montoReferencialSoles: r.monto_referencial_soles === null ? null : Number(r.monto_referencial_soles),
        rangoMonto: r.rango_monto,
        fuente: {
          dataset: "PROINVERSIÓN / OxI (investinperu.pe)",
          extraidoEl: r.fetched_at,
        },
      })),
      cobertura: "oxi_promocion",
      recordsTotalFuente: latest?.records_total ?? null,
      extraidoEl: latest?.fetched_at ?? null,
    });
  })
);

oxiRouter.get(
  "/:oxiId",
  asyncHandler(async (req, res) => {
    const oxiId = Number(req.params.oxiId);
    if (!Number.isInteger(oxiId) || oxiId <= 0) {
      res.status(400).json({ error: "oxiId inválido." });
      return;
    }

    const { rows } = await pool.query(
      `SELECT o.*, rb.fetched_at
       FROM oxi_promotion_projects o
       JOIN raw_oxi_batches rb ON rb.id = o.source_batch_id
       WHERE o.oxi_id = $1`,
      [oxiId]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Proyecto OxI no encontrado." });
      return;
    }

    const r = rows[0];
    res.json({
      oxiId: r.oxi_id,
      faseOxi: r.fase_oxi,
      tipoInversion: r.tipo_inversion,
      ultimoNivelEstudio: r.ultimo_nivel_estudio,
      nivelGobierno: r.nivel_gobierno,
      departamento: r.departamento,
      provincia: r.provincia,
      distrito: r.distrito,
      entidad: r.entidad,
      codigoSnip: r.codigo_snip,
      nombre: r.nombre,
      funcion: r.funcion,
      tipologia: r.tipologia,
      montoReferencial: r.monto_referencial,
      montoReferencialSoles: r.monto_referencial_soles === null ? null : Number(r.monto_referencial_soles),
      rangoMonto: r.rango_monto,
      fuente: { dataset: "PROINVERSIÓN / OxI", extraidoEl: r.fetched_at },
    });
  })
);
