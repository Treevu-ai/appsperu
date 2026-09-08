import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const aerodromosRouter = Router();

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;

const QuerySchema = z.object({
  idDepartamento: z.string().min(1).optional().describe("Código UBIGEO de departamento, ej. '13' para La Libertad."),
  provincia: z.string().min(1).optional(),
  tipoAerodromo: z.string().min(1).optional(),
  fechaCorte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "debe tener formato YYYY-MM-DD").optional()
    .describe("Corte específico (YYYY-MM-DD). Sin este parámetro y sin `historico`, se usa solo el corte más reciente."),
  historico: z.enum(["true", "false"]).optional()
    .describe("true trae todos los cortes ingeridos (DQ-03) — sin esto, solo el más reciente, para no sumar aeródromos de distintos años como si fueran el universo actual."),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

aerodromosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(QuerySchema, req.query, res);
    if (!parsed) return;
    const { idDepartamento, provincia, tipoAerodromo, fechaCorte, historico, limit, offset } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (idDepartamento) {
      params.push(idDepartamento);
      conditions.push(`a.id_departamento = $${params.length}`);
    }
    if (provincia) {
      params.push(`%${provincia}%`);
      conditions.push(`a.provincia ILIKE $${params.length}`);
    }
    if (tipoAerodromo) {
      params.push(`%${tipoAerodromo}%`);
      conditions.push(`a.tipo_aerodromo ILIKE $${params.length}`);
    }
    if (fechaCorte) {
      params.push(fechaCorte);
      conditions.push(`a.fecha_corte = $${params.length}`);
    } else if (historico !== "true") {
      // DQ-03: sin fechaCorte/historico explícitos, solo el corte más reciente —
      // la tabla es un panel multi-año (UNIQUE codigo_aerodromo+fecha_corte) y
      // sumar sin filtro mezcla hasta 4 años de snapshots del mismo aeródromo.
      conditions.push(`a.fecha_corte = (SELECT MAX(fecha_corte) FROM aerodromos)`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows: countRows } = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM aerodromos a ${where}`,
      params
    );
    const total = Number(countRows[0].total);

    const { rows } = await pool.query(
      `SELECT a.codigo_aerodromo, a.nombre, a.departamento, a.provincia, a.distrito,
              a.tipo_aerodromo, a.codigo_oaci, a.escala, a.estado, a.administrador,
              a.jerarquia, a.titularidad, a.es_concesionado, a.latitud, a.longitud,
              a.fecha_corte, rb.fetched_at
       FROM aerodromos a
       JOIN raw_infraestructura_mtc_batches rb ON rb.id = a.source_batch_id
       ${where}
       ORDER BY a.fecha_corte DESC, a.codigo_aerodromo
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map((r) => ({
        codigoAerodromo: r.codigo_aerodromo,
        nombre: r.nombre,
        departamento: r.departamento,
        provincia: r.provincia,
        distrito: r.distrito,
        tipoAerodromo: r.tipo_aerodromo,
        codigoOaci: r.codigo_oaci,
        escala: r.escala,
        estado: r.estado,
        administrador: r.administrador,
        jerarquia: r.jerarquia,
        titularidad: r.titularidad,
        esConcesionado: r.es_concesionado,
        ubicacion: { latitud: r.latitud === null ? null : Number(r.latitud), longitud: r.longitud === null ? null : Number(r.longitud) },
        fechaCorte: r.fecha_corte,
        fuente: { dataset: "MTC - Infraestructura Aeroportuaria (Aeródromos)", extraidoEl: r.fetched_at },
      })),
    });
  })
);
