import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const proyectosRouter = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

const SELECT_COLUMNS = `
  senace_id, titular, ruc, titulo_proyecto, unidad_proyecto, tipo, actividad,
  fecha_inicio, estado, descripcion, longitud, latitud, resolucion
`;

function toApiShape(r: Record<string, unknown>) {
  return {
    senaceId: r.senace_id,
    titular: r.titular,
    ruc: r.ruc,
    tituloProyecto: r.titulo_proyecto,
    unidadProyecto: r.unidad_proyecto,
    tipo: r.tipo,
    actividad: r.actividad,
    fechaInicio: r.fecha_inicio,
    estado: r.estado,
    descripcion: r.descripcion,
    longitud: r.longitud,
    latitud: r.latitud,
    resolucion: r.resolucion,
  };
}

const ProyectosQuerySchema = z.object({
  estado: z.string().min(1).optional().describe("Exacto: Aprobado, Desaprobado, o 'En Evaluación' (con tilde)."),
  actividad: z.string().min(1).optional().describe("Búsqueda parcial (ILIKE), ej. Minería, Transportes."),
  ruc: z.string().regex(/^\d{11}$/).optional(),
  texto: z.string().min(1).optional().describe("Búsqueda parcial (ILIKE) sobre título y titular."),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * `senace_id` es único globalmente (ver docs/data-contracts/senace-cartera-proyectos.md) -- no
 * hace falta filtrar por "batch más reciente", el upsert del conector ya mantiene una sola fila
 * vigente por proyecto, con su `estado` actualizado si cambió.
 */
proyectosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(ProyectosQuerySchema, req.query, res);
    if (!parsed) return;
    const { estado, actividad, ruc, texto, limit, offset } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];
    const addParam = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    const addIlike = (column: string, value: string) => conditions.push(`${column} ILIKE ${addParam(`%${value}%`)}`);

    if (estado) conditions.push(`estado = ${addParam(estado)}`);
    if (actividad) addIlike("actividad", actividad);
    if (ruc) conditions.push(`ruc = ${addParam(ruc)}`);
    if (texto) {
      const placeholder = addParam(`%${texto}%`);
      conditions.push(`(titulo_proyecto ILIKE ${placeholder} OR titular ILIKE ${placeholder})`);
    }

    const whereSql = conditions.length > 0 ? conditions.join(" AND ") : "TRUE";
    const listParams = [...params];
    const limitPlaceholder = `$${listParams.push(limit)}`;
    const offsetPlaceholder = `$${listParams.push(offset)}`;

    // Un `pool.query` por separado para el conteo y para la página podría intercalarse con una
    // ingesta concurrente y mezclar un `total` de un momento con `resultados` de otro, dejando
    // `hasMore` temporalmente incorrecto (hallazgo real de CodeRabbit) -- ambas consultas corren
    // sobre el mismo cliente dentro de una transacción `REPEATABLE READ`, que ve un snapshot
    // fijo de la base para las dos.
    const client = await pool.connect();
    let countRows: { total: string }[];
    let rows: Record<string, unknown>[];
    try {
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      ({ rows: countRows } = await client.query<{ total: string }>(
        `SELECT COUNT(*) AS total FROM senace_cartera_proyectos WHERE ${whereSql}`,
        params
      ));
      ({ rows } = await client.query(
        `SELECT ${SELECT_COLUMNS} FROM senace_cartera_proyectos
         WHERE ${whereSql}
         ORDER BY senace_id DESC
         LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
        listParams
      ));
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const total = Number(countRows[0].total);

    res.json({
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map(toApiShape),
      fuente: {
        dataset: "SENACE - Cartera de Proyectos (portal público de datos abiertos, sin autenticación)",
        nota: "No incluye proyectos gestionados solo por la API gateada de SENACE (/Api/), que requiere un auth_key que no poseemos. Ver docs/data-contracts/senace-cartera-proyectos.md.",
      },
    });
  })
);

const DetailParamsSchema = z.object({
  senaceId: z.coerce.number().int(),
});

proyectosRouter.get(
  "/:senaceId",
  asyncHandler(async (req, res) => {
    const parsedParams = DetailParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ error: "senaceId debe ser un entero." });
      return;
    }

    const { rows } = await pool.query(
      `SELECT ${SELECT_COLUMNS} FROM senace_cartera_proyectos WHERE senace_id = $1`,
      [parsedParams.data.senaceId]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Proyecto no encontrado." });
      return;
    }

    res.json(toApiShape(rows[0]));
  })
);
