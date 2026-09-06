import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const intervencionesRouter = Router();

const IntervencionesQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
  provincia: z.string().min(1).optional(),
  estado: z.string().min(1).optional().describe("Ej. 'BUENO', 'MALO'."),
  codigoRuta: z.string().min(1).optional(),
});

intervencionesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(IntervencionesQuerySchema, req.query, res);
    if (!parsed) return;
    const { departamento, provincia, estado, codigoRuta } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];
    const addIlike = (column: string, value: string) => {
      params.push(`%${value}%`);
      conditions.push(`${column} ILIKE $${params.length}`);
    };

    if (departamento) addIlike("v.departamento", departamento);
    if (provincia) addIlike("v.provincia", provincia);
    if (estado) addIlike("v.estado", estado);
    if (codigoRuta) addIlike("v.codigo_ruta", codigoRuta);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT v.codigo_ruta, v.trayectoria, v.inicio_km, v.final_km, v.departamento, v.provincia,
              v.estado, v.superficie, v.longitud_km, v.responsable, v.corredor_vial,
              v.nivel_intervencion, v.tramo, v.fecha_corte, rb.fetched_at
       FROM intervenciones_viales v
       JOIN raw_pvd_batches rb ON rb.id = v.source_batch_id
       ${where}
       ORDER BY v.departamento, v.provincia, v.codigo_ruta
       LIMIT 200`,
      params
    );

    res.json({
      resultados: rows.map((r) => ({
        codigoRuta: r.codigo_ruta,
        trayectoria: r.trayectoria,
        tramo: { inicioKm: r.inicio_km, finalKm: r.final_km },
        departamento: r.departamento,
        provincia: r.provincia,
        estado: r.estado,
        superficie: r.superficie,
        longitudKm: r.longitud_km === null ? null : Number(r.longitud_km),
        responsable: r.responsable,
        corredorVial: r.corredor_vial,
        nivelIntervencion: r.nivel_intervencion,
        tramoNumero: r.tramo,
        fechaCorte: r.fecha_corte,
        fuente: { dataset: "MTC/Provías Descentralizado - Intervenciones en Redes Viales Subnacionales", extraidoEl: r.fetched_at },
      })),
    });
  })
);
