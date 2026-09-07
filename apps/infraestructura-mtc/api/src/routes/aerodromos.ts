import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const aerodromosRouter = Router();

const QuerySchema = z.object({
  idDepartamento: z.string().min(1).optional().describe("Código UBIGEO de departamento, ej. '13' para La Libertad."),
  provincia: z.string().min(1).optional(),
  tipoAerodromo: z.string().min(1).optional(),
});

aerodromosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(QuerySchema, req.query, res);
    if (!parsed) return;
    const { idDepartamento, provincia, tipoAerodromo } = parsed;

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
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT a.codigo_aerodromo, a.nombre, a.departamento, a.provincia, a.distrito,
              a.tipo_aerodromo, a.codigo_oaci, a.escala, a.estado, a.administrador,
              a.jerarquia, a.titularidad, a.es_concesionado, a.latitud, a.longitud,
              a.fecha_corte, rb.fetched_at
       FROM aerodromos a
       JOIN raw_infraestructura_mtc_batches rb ON rb.id = a.source_batch_id
       ${where}
       ORDER BY a.fecha_corte DESC, a.codigo_aerodromo
       LIMIT 500`,
      params
    );

    res.json({
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
