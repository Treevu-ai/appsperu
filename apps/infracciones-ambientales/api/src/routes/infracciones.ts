import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const infraccionesRouter = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

const InfraccionesQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
  provincia: z.string().min(1).optional(),
  distrito: z.string().min(1).optional(),
  subsectorEconomico: z.string().min(1).optional(),
  administrado: z.string().min(1).optional().describe("Búsqueda parcial (ILIKE) sobre nombre del administrado."),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

infraccionesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(InfraccionesQuerySchema, req.query, res);
    if (!parsed) return;
    const { departamento, provincia, distrito, subsectorEconomico, administrado, limit, offset } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];
    const addIlike = (column: string, value: string) => {
      params.push(`%${value}%`);
      conditions.push(`${column} ILIKE $${params.length}`);
    };

    if (departamento) addIlike("i.departamento", departamento);
    if (provincia) addIlike("i.provincia", provincia);
    if (distrito) addIlike("i.distrito", distrito);
    if (subsectorEconomico) addIlike("i.subsector_economico", subsectorEconomico);
    if (administrado) addIlike("i.nombre_administrado", administrado);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows: countRows } = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM infracciones_ambientales i ${where}`,
      params
    );
    const total = Number(countRows[0].total);

    const { rows } = await pool.query(
      `SELECT i.nombre_administrado, i.tipo_doc, i.id_doc_administrado, i.id_doc_enmascarado,
              i.unidad_fiscalizable, i.subsector_economico, i.departamento, i.provincia, i.distrito,
              i.nro_expediente, i.nro_rd, i.fecha_rd, i.detalle_infraccion, i.tipo_sancion,
              i.tipo_infraccion, i.medida_dictada, i.cantidad_multa, i.cantidad_infracciones,
              i.fecha_corte, rb.fetched_at
       FROM infracciones_ambientales i
       JOIN raw_ruias_batches rb ON rb.id = i.source_batch_id
       ${where}
       ORDER BY i.fecha_rd DESC NULLS LAST
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map((r) => ({
        administrado: {
          nombre: r.nombre_administrado,
          tipoDocumento: r.tipo_doc,
          numeroDocumento: r.id_doc_administrado,
          documentoEnmascarado: r.id_doc_enmascarado,
        },
        unidadFiscalizable: r.unidad_fiscalizable,
        subsectorEconomico: r.subsector_economico,
        departamento: r.departamento,
        provincia: r.provincia,
        distrito: r.distrito,
        expediente: r.nro_expediente,
        resolucion: r.nro_rd,
        fechaResolucion: r.fecha_rd,
        detalleInfraccion: r.detalle_infraccion,
        tipoSancion: r.tipo_sancion,
        tipoInfraccion: r.tipo_infraccion,
        medidaDictada: r.medida_dictada,
        cantidadMulta: r.cantidad_multa === null ? null : Number(r.cantidad_multa),
        cantidadInfracciones: r.cantidad_infracciones,
        fechaCorte: r.fecha_corte,
        fuente: { dataset: "OEFA - RUIAS (Registro Único de Infractores Ambientales Sancionados)", extraidoEl: r.fetched_at },
      })),
    });
  })
);
