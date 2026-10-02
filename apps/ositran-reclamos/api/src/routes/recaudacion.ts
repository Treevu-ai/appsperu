import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const recaudacionRouter = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

interface RecaudacionRow {
  anio: number;
  mes: number;
  entidad_prestadora: string;
  concesion: string | null;
  siglas_concesion: string | null;
  peaje: string | null;
  tipo_recaudacion: string | null;
  tipo_tarifa: string | null;
  tipo_vehiculo: string | null;
  tipo_eje_veh: string | null;
  nro_ejes: string | null;
  importe_soles: number | string;
}

function toApiShape(r: RecaudacionRow) {
  return {
    anio: r.anio,
    mes: r.mes,
    entidadPrestadora: r.entidad_prestadora,
    concesion: r.concesion,
    siglasConcesion: r.siglas_concesion,
    peaje: r.peaje,
    tipoRecaudacion: r.tipo_recaudacion,
    tipoTarifa: r.tipo_tarifa,
    tipoVehiculo: r.tipo_vehiculo,
    tipoEjeVeh: r.tipo_eje_veh,
    nroEjes: r.nro_ejes,
    importeSoles: Number(r.importe_soles),
  };
}

const RecaudacionQuerySchema = z.object({
  anio: z.coerce.number().int().min(2000).max(2100).optional(),
  mes: z.coerce.number().int().min(1).max(12).optional(),
  siglasConcesion: z.string().min(1).optional(),
  peaje: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Recaudación por peaje en carreteras concesionadas (OSITRAN). */
recaudacionRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(RecaudacionQuerySchema, req.query, res);
    if (!parsed) return;
    const { anio, mes, siglasConcesion, peaje, limit, offset } = parsed;

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
    if (siglasConcesion) addEq("siglas_concesion", siglasConcesion);
    if (peaje) addIlike("peaje", peaje);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows: countRows } = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM recaudacion_carreteras ${where}`,
      params
    );
    const total = Number(countRows[0].total);

    const { rows } = await pool.query<RecaudacionRow>(
      `SELECT anio, mes, entidad_prestadora, concesion, siglas_concesion, peaje, tipo_recaudacion,
              tipo_tarifa, tipo_vehiculo, tipo_eje_veh, nro_ejes, importe_soles
       FROM recaudacion_carreteras
       ${where}
       ORDER BY anio DESC, mes DESC, siglas_concesion
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map(toApiShape),
      fuente: { dataset: "OSITRAN - Recaudación por Peajes en Carreteras Concesionadas" },
    });
  })
);
