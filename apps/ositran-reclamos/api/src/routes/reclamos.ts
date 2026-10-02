import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const reclamosRouter = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

interface ReclamoRow {
  anio: number;
  mes: number;
  entidad_prestadora: string;
  concesion: string | null;
  siglas_concesion: string | null;
  medio_presentacion: string | null;
  motivo_reclamo: string | null;
  materia_reclamo: string | null;
  estado_reclamo: string | null;
  cantidad_reclamos: number;
}

function toApiShape(r: ReclamoRow) {
  return {
    anio: r.anio,
    mes: r.mes,
    entidadPrestadora: r.entidad_prestadora,
    concesion: r.concesion,
    siglasConcesion: r.siglas_concesion,
    medioPresentacion: r.medio_presentacion,
    motivoReclamo: r.motivo_reclamo,
    materiaReclamo: r.materia_reclamo,
    estadoReclamo: r.estado_reclamo,
    cantidadReclamos: r.cantidad_reclamos,
  };
}

const ReclamosQuerySchema = z.object({
  anio: z.coerce.number().int().min(2000).max(2100).optional(),
  mes: z.coerce.number().int().min(1).max(12).optional(),
  entidadPrestadora: z.string().min(1).optional(),
  siglasConcesion: z.string().min(1).optional(),
  estadoReclamo: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Reclamos de usuarios sobre carreteras concesionadas (OSITRAN). */
reclamosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(ReclamosQuerySchema, req.query, res);
    if (!parsed) return;
    const { anio, mes, entidadPrestadora, siglasConcesion, estadoReclamo, limit, offset } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];
    const addEq = (column: string, value: unknown) => {
      params.push(value);
      conditions.push(`${column} = $${params.length}`);
    };
    const addIlike = (column: string, value: string) => {
      params.push(`%${value}%`);
      conditions.push(`${column} ILIKE $${params.length}`);
    };

    if (anio !== undefined) addEq("anio", anio);
    if (mes !== undefined) addEq("mes", mes);
    if (entidadPrestadora) addIlike("entidad_prestadora", entidadPrestadora);
    if (siglasConcesion) addEq("siglas_concesion", siglasConcesion);
    if (estadoReclamo) addIlike("estado_reclamo", estadoReclamo);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows: countRows } = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM reclamos_carreteras ${where}`,
      params
    );
    const total = Number(countRows[0].total);

    const { rows } = await pool.query<ReclamoRow>(
      `SELECT anio, mes, entidad_prestadora, concesion, siglas_concesion, medio_presentacion,
              motivo_reclamo, materia_reclamo, estado_reclamo, cantidad_reclamos
       FROM reclamos_carreteras
       ${where}
       ORDER BY anio DESC, mes DESC, entidad_prestadora
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map(toApiShape),
      fuente: { dataset: "OSITRAN - Reclamos sobre Carreteras Concesionadas" },
    });
  })
);
