import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const grifosRouter = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

interface GrifoRow {
  expediente: string;
  codigo_osinergmin: string | null;
  registro: string | null;
  ruc: string | null;
  razon_social: string;
  direccion_operativa: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  tipo_establecimiento: string | null;
  capacidad_total_cl_gln: number | string | null;
  fecha_emision: string | null;
  termino_vigencia: string | null;
  representante: string | null;
}

function toApiShape(r: GrifoRow) {
  return {
    expediente: r.expediente,
    codigoOsinergmin: r.codigo_osinergmin,
    registro: r.registro,
    ruc: r.ruc,
    razonSocial: r.razon_social,
    direccionOperativa: r.direccion_operativa,
    departamento: r.departamento,
    provincia: r.provincia,
    distrito: r.distrito,
    tipoEstablecimiento: r.tipo_establecimiento,
    capacidadTotalClGln: r.capacidad_total_cl_gln === null ? null : Number(r.capacidad_total_cl_gln),
    fechaEmision: r.fecha_emision,
    terminoVigencia: r.termino_vigencia,
    representante: r.representante,
  };
}

const GrifosQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
  provincia: z.string().min(1).optional(),
  distrito: z.string().min(1).optional(),
  ruc: z.string().regex(/^\d{11}$/).optional(),
  tipoEstablecimiento: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Registro de grifos y estaciones de servicio (OSINERGMIN). */
grifosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(GrifosQuerySchema, req.query, res);
    if (!parsed) return;
    const { departamento, provincia, distrito, ruc, tipoEstablecimiento, limit, offset } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];
    const addIlike = (column: string, value: string) => {
      params.push(`%${value}%`);
      conditions.push(`${column} ILIKE $${params.length}`);
    };
    const addEq = (column: string, value: string) => {
      params.push(value);
      conditions.push(`${column} = $${params.length}`);
    };

    if (departamento) addIlike("departamento", departamento);
    if (provincia) addIlike("provincia", provincia);
    if (distrito) addIlike("distrito", distrito);
    if (ruc) addEq("ruc", ruc);
    if (tipoEstablecimiento) addIlike("tipo_establecimiento", tipoEstablecimiento);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows: countRows } = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM grifos_estaciones ${where}`,
      params
    );
    const total = Number(countRows[0].total);

    const { rows } = await pool.query<GrifoRow>(
      `SELECT expediente, codigo_osinergmin, registro, ruc, razon_social, direccion_operativa,
              departamento, provincia, distrito, tipo_establecimiento, capacidad_total_cl_gln,
              fecha_emision, termino_vigencia, representante
       FROM grifos_estaciones
       ${where}
       ORDER BY departamento, provincia, razon_social
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map(toApiShape),
      fuente: { dataset: "OSINERGMIN - Registro de Grifos y Estaciones de Servicio" },
    });
  })
);
