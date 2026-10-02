import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const preciosRouter = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

interface PrecioRow {
  registro_hidrocarburos: string | null;
  ruc: string | null;
  razon_social: string;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  direccion: string | null;
  departamento_reparto: string | null;
  provincia_reparto: string | null;
  fecha_registro: string | null;
  producto: string;
  precio_min_soles: number | string | null;
  precio_max_soles: number | string | null;
  unidad: string | null;
}

function toApiShape(r: PrecioRow) {
  return {
    registroHidrocarburos: r.registro_hidrocarburos,
    ruc: r.ruc,
    razonSocial: r.razon_social,
    departamento: r.departamento,
    provincia: r.provincia,
    distrito: r.distrito,
    direccion: r.direccion,
    departamentoReparto: r.departamento_reparto,
    provinciaReparto: r.provincia_reparto,
    fechaRegistro: r.fecha_registro,
    producto: r.producto,
    precioMinSoles: r.precio_min_soles === null ? null : Number(r.precio_min_soles),
    precioMaxSoles: r.precio_max_soles === null ? null : Number(r.precio_max_soles),
    unidad: r.unidad,
  };
}

const PreciosQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
  provincia: z.string().min(1).optional(),
  producto: z.string().min(1).optional(),
  ruc: z.string().regex(/^\d{11}$/).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Reporte diario SCOP de precios registrados por Distribuidores Minoristas de Combustibles Líquidos (OSINERGMIN). */
preciosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(PreciosQuerySchema, req.query, res);
    if (!parsed) return;
    const { departamento, provincia, producto, ruc, limit, offset } = parsed;

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
    if (producto) addIlike("producto", producto);
    if (ruc) addEq("ruc", ruc);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows: countRows } = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM precios_combustibles_distribuidores ${where}`,
      params
    );
    const total = Number(countRows[0].total);

    const { rows } = await pool.query<PrecioRow>(
      `SELECT registro_hidrocarburos, ruc, razon_social, departamento, provincia, distrito,
              direccion, departamento_reparto, provincia_reparto, fecha_registro, producto,
              precio_min_soles, precio_max_soles, unidad
       FROM precios_combustibles_distribuidores
       ${where}
       ORDER BY departamento, producto, razon_social
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map(toApiShape),
      fuente: {
        dataset: "OSINERGMIN - SCOP, Registro de precios de Distribuidores Minoristas de Combustibles Líquidos",
        nota: "Precio registrado por el propio distribuidor mayorista, no precio al consumidor final en grifo.",
      },
    });
  })
);
