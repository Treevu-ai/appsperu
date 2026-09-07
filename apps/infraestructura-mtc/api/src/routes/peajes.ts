import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const peajesRouter = Router();

const QuerySchema = z.object({
  idDepartamento: z.string().min(1).optional().describe("Código UBIGEO de departamento, ej. '13' para La Libertad."),
  codigoRuta: z.string().min(1).optional(),
  estado: z.string().min(1).optional(),
});

peajesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(QuerySchema, req.query, res);
    if (!parsed) return;
    const { idDepartamento, codigoRuta, estado } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (idDepartamento) {
      params.push(idDepartamento);
      conditions.push(`p.id_departamento = $${params.length}`);
    }
    if (codigoRuta) {
      params.push(`%${codigoRuta}%`);
      conditions.push(`p.codigo_ruta ILIKE $${params.length}`);
    }
    if (estado) {
      params.push(`%${estado}%`);
      conditions.push(`p.estado ILIKE $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT p.codigo_peaje, p.nombre, p.codigo_ruta, p.inicio_km, p.departamento, p.provincia,
              p.distrito, p.localidad, p.es_concesionado, p.titular, p.ubicacion, p.estado,
              p.administrador, p.latitud, p.longitud, p.fecha_corte, rb.fetched_at
       FROM peajes p
       JOIN raw_infraestructura_mtc_batches rb ON rb.id = p.source_batch_id
       ${where}
       ORDER BY p.fecha_corte DESC, p.codigo_peaje
       LIMIT 500`,
      params
    );

    res.json({
      resultados: rows.map((r) => ({
        codigoPeaje: r.codigo_peaje,
        nombre: r.nombre,
        codigoRuta: r.codigo_ruta,
        inicioKm: r.inicio_km === null ? null : Number(r.inicio_km),
        departamento: r.departamento,
        provincia: r.provincia,
        distrito: r.distrito,
        localidad: r.localidad,
        esConcesionado: r.es_concesionado,
        titular: r.titular,
        ubicacion: {
          direccion: r.ubicacion,
          latitud: r.latitud === null ? null : Number(r.latitud),
          longitud: r.longitud === null ? null : Number(r.longitud),
        },
        estado: r.estado,
        administrador: r.administrador,
        fechaCorte: r.fecha_corte,
        fuente: { dataset: "MTC - Unidades de Peaje de la Red Vial Nacional", extraidoEl: r.fetched_at },
      })),
    });
  })
);
