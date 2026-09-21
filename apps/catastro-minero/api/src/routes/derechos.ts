import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const derechosRouter = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

const DerechosQuerySchema = z.object({
  departamento: z.string().min(1).optional().describe("DEPA exacto, ej. 'LA LIBERTAD'."),
  provincia: z.string().min(1).optional(),
  distrito: z.string().min(1).optional(),
  estado: z.string().min(1).optional().describe("Código de ESTADO tal cual la fuente (ej. 'T'), sin normalizar a enum."),
  sustancia: z.string().min(1).optional(),
  concesion: z.string().min(1).optional().describe("Búsqueda parcial (ILIKE)."),
  titular: z.string().min(1).optional().describe("Búsqueda parcial (ILIKE)."),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Listado de derechos mineros. Igual que `legislativo-congreso`: la clave real (`codigou`) es
 * única y verificada -- el conector hace upsert, no hay que filtrar por "batch más reciente".
 */
derechosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(DerechosQuerySchema, req.query, res);
    if (!parsed) return;
    const { departamento, provincia, distrito, estado, sustancia, concesion, titular, limit, offset } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];
    const addParam = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    const addIlike = (column: string, value: string) => conditions.push(`${column} ILIKE ${addParam(`%${value}%`)}`);

    if (departamento) conditions.push(`departamento = ${addParam(departamento)}`);
    if (provincia) conditions.push(`provincia = ${addParam(provincia)}`);
    if (distrito) conditions.push(`distrito = ${addParam(distrito)}`);
    if (estado) conditions.push(`estado = ${addParam(estado)}`);
    if (sustancia) conditions.push(`sustancia = ${addParam(sustancia)}`);
    if (concesion) addIlike("concesion", concesion);
    if (titular) addIlike("titular", titular);

    const whereSql = conditions.length > 0 ? conditions.join(" AND ") : "TRUE";
    const listParams = [...params];
    const limitPlaceholder = `$${listParams.push(limit)}`;
    const offsetPlaceholder = `$${listParams.push(offset)}`;

    const [{ rows: countRows }, { rows }] = await Promise.all([
      pool.query<{ total: string }>(`SELECT COUNT(*) AS total FROM catastro_minero_derechos WHERE ${whereSql}`, params),
      pool.query(
        `SELECT codigou, fecha_denuncio, concesion, titular, hectareas, estado, estado_descripcion, sustancia, departamento, provincia, distrito, fecha_actualizacion
         FROM catastro_minero_derechos
         WHERE ${whereSql}
         ORDER BY codigou
         LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
        listParams
      ),
    ]);

    const total = Number(countRows[0].total);

    res.json({
      total,
      hasMore: offset + rows.length < total,
      resultados: rows.map((r) => ({
        codigou: r.codigou,
        fechaDenuncio: r.fecha_denuncio,
        concesion: r.concesion,
        titular: r.titular,
        hectareas: r.hectareas,
        estado: r.estado,
        estadoDescripcion: r.estado_descripcion,
        sustancia: r.sustancia,
        departamento: r.departamento,
        provincia: r.provincia,
        distrito: r.distrito,
        fechaActualizacion: r.fecha_actualizacion,
      })),
      fuente: {
        dataset: "INGEMMET - Catastro Minero (capa 'Catastro Minero', derechos mineros)",
        nota: "Carácter referencial, solo de consulta (aviso de la propia fuente). `estado` es el código tal cual INGEMMET (ej. 'T'=Titulado) — ver `estadoDescripcion` para el texto legible.",
      },
    });
  })
);

const DetailParamsSchema = z.object({ codigou: z.string().min(1) });

derechosRouter.get(
  "/:codigou",
  asyncHandler(async (req, res) => {
    const parsedParams = DetailParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ error: "codigou es obligatorio." });
      return;
    }
    const { codigou } = parsedParams.data;

    const { rows } = await pool.query(
      `SELECT codigou, fecha_denuncio, concesion, titular, hectareas, estado, estado_descripcion, sustancia, departamento, provincia, distrito, fecha_actualizacion
       FROM catastro_minero_derechos
       WHERE codigou = $1`,
      [codigou]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Derecho minero no encontrado." });
      return;
    }

    const r = rows[0];
    res.json({
      codigou: r.codigou,
      fechaDenuncio: r.fecha_denuncio,
      concesion: r.concesion,
      titular: r.titular,
      hectareas: r.hectareas,
      estado: r.estado,
      estadoDescripcion: r.estado_descripcion,
      sustancia: r.sustancia,
      departamento: r.departamento,
      provincia: r.provincia,
      distrito: r.distrito,
      fechaActualizacion: r.fecha_actualizacion,
    });
  })
);
