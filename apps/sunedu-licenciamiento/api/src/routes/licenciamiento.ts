import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const licenciamientoRouter = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

interface LicenciamientoRow {
  codigo_entidad: string | null;
  nombre: string;
  tipo_gestion: string | null;
  estado_licenciamiento: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  periodo_licenciamiento: number | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  ubigeo: string | null;
  latitud: number | string | null;
  longitud: number | string | null;
  fecha_corte: string | null;
}

function toApiShape(r: LicenciamientoRow) {
  return {
    codigoEntidad: r.codigo_entidad,
    nombre: r.nombre,
    tipoGestion: r.tipo_gestion,
    estadoLicenciamiento: r.estado_licenciamiento,
    fechaInicio: r.fecha_inicio,
    fechaFin: r.fecha_fin,
    periodoLicenciamiento: r.periodo_licenciamiento,
    departamento: r.departamento,
    provincia: r.provincia,
    distrito: r.distrito,
    ubigeo: r.ubigeo,
    latitud: r.latitud === null ? null : Number(r.latitud),
    longitud: r.longitud === null ? null : Number(r.longitud),
    fechaCorte: r.fecha_corte,
  };
}

const LicenciamientoQuerySchema = z.object({
  nombre: z.string().min(1).optional(),
  estadoLicenciamiento: z.string().min(1).optional(),
  departamento: z.string().min(1).optional(),
  provincia: z.string().min(1).optional(),
  tipoGestion: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Licenciamiento institucional de universidades (SUNEDU) — otorgada/denegada/no presentado. */
licenciamientoRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(LicenciamientoQuerySchema, req.query, res);
    if (!parsed) return;
    const { nombre, estadoLicenciamiento, departamento, provincia, tipoGestion, limit, offset } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];
    const addIlike = (column: string, value: string) => {
      params.push(`%${value}%`);
      conditions.push(`${column} ILIKE $${params.length}`);
    };

    if (nombre) addIlike("nombre", nombre);
    if (estadoLicenciamiento) addIlike("estado_licenciamiento", estadoLicenciamiento);
    if (departamento) addIlike("departamento", departamento);
    if (provincia) addIlike("provincia", provincia);
    if (tipoGestion) addIlike("tipo_gestion", tipoGestion);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows: countRows } = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM licenciamiento_universidades ${where}`,
      params
    );
    const total = Number(countRows[0].total);

    const { rows } = await pool.query<LicenciamientoRow>(
      `SELECT codigo_entidad, nombre, tipo_gestion, estado_licenciamiento, fecha_inicio, fecha_fin,
              periodo_licenciamiento, departamento, provincia, distrito, ubigeo, latitud, longitud, fecha_corte
       FROM licenciamiento_universidades
       ${where}
       ORDER BY departamento, nombre, id
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map(toApiShape),
      fuente: { dataset: "SUNEDU - Licenciamiento Institucional" },
    });
  })
);
