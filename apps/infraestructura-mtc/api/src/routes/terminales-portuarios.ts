import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const terminalesPortuariosRouter = Router();

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;

const QuerySchema = z.object({
  idDepartamento: z.string().min(1).optional().describe("Código UBIGEO de departamento, ej. '13' para La Libertad."),
  ambito: z.string().min(1).optional(),
  estado: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

terminalesPortuariosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(QuerySchema, req.query, res);
    if (!parsed) return;
    const { idDepartamento, ambito, estado, limit, offset } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (idDepartamento) {
      params.push(idDepartamento);
      conditions.push(`t.id_departamento = $${params.length}`);
    }
    if (ambito) {
      params.push(`%${ambito}%`);
      conditions.push(`t.ambito ILIKE $${params.length}`);
    }
    if (estado) {
      params.push(`%${estado}%`);
      conditions.push(`t.estado ILIKE $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows: countRows } = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM terminales_portuarios t ${where}`,
      params
    );
    const total = Number(countRows[0].total);

    const { rows } = await pool.query(
      `SELECT t.codigo_puerto, t.nombre_terminal, t.ambito, t.tipo_terminal, t.alcance, t.uso,
              t.trafico, t.actividad, t.estado, t.estado_conservacion, t.titularidad,
              t.administrador, t.es_concesionado, t.latitud, t.longitud, t.fecha_corte,
              rb.fetched_at
       FROM terminales_portuarios t
       JOIN raw_infraestructura_mtc_batches rb ON rb.id = t.source_batch_id
       ${where}
       ORDER BY t.fecha_corte DESC, t.codigo_puerto
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map((r) => ({
        codigoPuerto: r.codigo_puerto,
        nombreTerminal: r.nombre_terminal,
        ambito: r.ambito,
        tipoTerminal: r.tipo_terminal,
        alcance: r.alcance,
        uso: r.uso,
        trafico: r.trafico,
        actividad: r.actividad,
        estado: r.estado,
        estadoConservacion: r.estado_conservacion,
        titularidad: r.titularidad,
        administrador: r.administrador,
        esConcesionado: r.es_concesionado,
        ubicacion: { latitud: r.latitud === null ? null : Number(r.latitud), longitud: r.longitud === null ? null : Number(r.longitud) },
        fechaCorte: r.fecha_corte,
        fuente: { dataset: "MTC - Infraestructura Portuaria (Terminales Portuarios y Embarcaderos)", extraidoEl: r.fetched_at },
      })),
    });
  })
);
