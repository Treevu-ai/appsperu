import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const institucionesRouter = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

const InstitucionesQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
  provincia: z.string().min(1).optional(),
  distrito: z.string().min(1).optional(),
  ubigeo: z.string().regex(/^\d{6}$/).optional(),
  estado: z.string().min(1).optional().describe("Ej. 'Activo'."),
  gestion: z.string().min(1).optional().describe("Búsqueda parcial (ILIKE)."),
  nombre: z.string().min(1).optional().describe("Búsqueda parcial (ILIKE) sobre el nombre de la IE."),
  areaCenso: z.enum(["Urbana", "Rural"]).optional().describe("DQ-07: área censal urbano/rural, tal cual la trae la fuente."),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

institucionesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(InstitucionesQuerySchema, req.query, res);
    if (!parsed) return;
    const { departamento, provincia, distrito, ubigeo, estado, gestion, nombre, areaCenso, limit, offset } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];
    const addIlike = (column: string, value: string) => {
      params.push(`%${value}%`);
      conditions.push(`${column} ILIKE $${params.length}`);
    };

    if (departamento) addIlike("i.departamento", departamento);
    if (provincia) addIlike("i.provincia", provincia);
    if (distrito) addIlike("i.distrito", distrito);
    if (gestion) addIlike("i.gestion", gestion);
    if (nombre) addIlike("i.nombre", nombre);
    if (estado) {
      params.push(estado);
      conditions.push(`i.estado = $${params.length}`);
    }
    if (ubigeo) {
      params.push(ubigeo);
      conditions.push(`i.ubigeo = $${params.length}`);
    }
    if (areaCenso) {
      params.push(areaCenso);
      conditions.push(`i.area_censo = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows: countRows } = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM instituciones_educativas i ${where}`,
      params
    );
    const total = Number(countRows[0].total);

    const { rows } = await pool.query(
      `SELECT i.cod_mod, i.anexo, i.nombre, i.nivel_modalidad, i.gestion, i.direccion,
              i.ubigeo, i.departamento, i.provincia, i.distrito, i.ugel, i.latitud, i.longitud,
              i.turno, i.ruc, i.razon_social, i.estado, i.area_censo, i.fecha_actualizacion, rb.fetched_at
       FROM instituciones_educativas i
       JOIN raw_padron_batches rb ON rb.id = i.source_batch_id
       ${where}
       ORDER BY i.departamento, i.provincia, i.distrito, i.nombre
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map((r) => ({
        codModular: r.cod_mod,
        anexo: r.anexo,
        nombre: r.nombre,
        nivelModalidad: r.nivel_modalidad,
        gestion: r.gestion,
        direccion: r.direccion,
        ubigeo: r.ubigeo,
        departamento: r.departamento,
        provincia: r.provincia,
        distrito: r.distrito,
        ugel: r.ugel,
        coordenadas: r.latitud !== null && r.longitud !== null ? { lat: Number(r.latitud), lon: Number(r.longitud) } : null,
        turno: r.turno,
        ruc: r.ruc,
        razonSocial: r.razon_social,
        estado: r.estado,
        areaCenso: r.area_censo,
        fechaActualizacion: r.fecha_actualizacion,
        fuente: { dataset: "MINEDU/ESCALE - Padrón de Instituciones Educativas", extraidoEl: r.fetched_at },
      })),
    });
  })
);
