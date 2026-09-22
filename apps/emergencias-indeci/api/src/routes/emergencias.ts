import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const emergenciasRouter = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

const SELECT_COLUMNS = `
  id, sinpad_id, fecha_emergencia, anio, mes, cod_distrito, departamento, provincia, distrito,
  peligro, tipo_peligro, region_natural, fallecidos, desaparecidos, lesionados, damnificados,
  afectados, viviendas_destruidas, viviendas_afectadas, peso_ayuda, costo_ayuda, detalle_edan
`;

function toApiShape(r: Record<string, unknown>) {
  return {
    id: r.id,
    sinpadId: r.sinpad_id,
    fechaEmergencia: r.fecha_emergencia,
    anio: r.anio,
    mes: r.mes,
    codDistrito: r.cod_distrito,
    departamento: r.departamento,
    provincia: r.provincia,
    distrito: r.distrito,
    peligro: r.peligro,
    tipoPeligro: r.tipo_peligro,
    regionNatural: r.region_natural,
    fallecidos: r.fallecidos,
    desaparecidos: r.desaparecidos,
    lesionados: r.lesionados,
    damnificados: r.damnificados,
    afectados: r.afectados,
    viviendasDestruidas: r.viviendas_destruidas,
    viviendasAfectadas: r.viviendas_afectadas,
    pesoAyuda: r.peso_ayuda,
    costoAyuda: r.costo_ayuda,
    detalleEdan: r.detalle_edan,
  };
}

const EmergenciasQuerySchema = z.object({
  departamento: z.string().min(1).optional().describe("Nombre real (no código), ej. LA LIBERTAD."),
  provincia: z.string().min(1).optional(),
  distrito: z.string().min(1).optional(),
  peligro: z.string().min(1).optional().describe("Exacto, ej. LLUVIA INTENSA, SEQUIA, SISMO."),
  anio: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Snapshot completo del histórico -- cada ingesta reemplaza todas las filas (ver
 * indeci-connector.ts), no hace falta filtrar por "batch más reciente".
 */
emergenciasRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(EmergenciasQuerySchema, req.query, res);
    if (!parsed) return;
    const { departamento, provincia, distrito, peligro, anio, limit, offset } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];
    const addParam = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };

    if (departamento) conditions.push(`departamento = ${addParam(departamento)}`);
    if (provincia) conditions.push(`provincia = ${addParam(provincia)}`);
    if (distrito) conditions.push(`distrito = ${addParam(distrito)}`);
    if (peligro) conditions.push(`peligro = ${addParam(peligro)}`);
    if (anio !== undefined) conditions.push(`anio = ${addParam(anio)}`);

    const whereSql = conditions.length > 0 ? conditions.join(" AND ") : "TRUE";
    const listParams = [...params];
    const limitPlaceholder = `$${listParams.push(limit)}`;
    const offsetPlaceholder = `$${listParams.push(offset)}`;

    // El conteo y la página corren en una misma transacción REPEATABLE READ para no mezclar
    // snapshots si una ingesta corre en paralelo (mismo criterio que senace-cartera-proyectos y
    // catastro-forestal).
    const client = await pool.connect();
    let countRows: { total: string }[];
    let rows: Record<string, unknown>[];
    try {
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      ({ rows: countRows } = await client.query<{ total: string }>(
        `SELECT COUNT(*) AS total FROM indeci_emergencias WHERE ${whereSql}`,
        params
      ));
      ({ rows } = await client.query(
        `SELECT ${SELECT_COLUMNS} FROM indeci_emergencias
         WHERE ${whereSql}
         ORDER BY fecha_emergencia DESC NULLS LAST, id DESC
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
        dataset: "INDECI - Emergencias y daños a nivel nacional por departamento (SINPAD, 2003-2025)",
        nota: "sinpadId NO es una clave única (7 códigos repetidos entre eventos distintos, confirmado en vivo, pese a que la fuente lo documenta como clave primaria) -- usar el id interno para referenciar una fila específica.",
      },
    });
  })
);

const DetailParamsSchema = z.object({
  id: z.coerce.number().int(),
});

emergenciasRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsedParams = DetailParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ error: "id debe ser un entero." });
      return;
    }

    const { rows } = await pool.query(
      `SELECT ${SELECT_COLUMNS} FROM indeci_emergencias WHERE id = $1`,
      [parsedParams.data.id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Emergencia no encontrada." });
      return;
    }

    res.json(toApiShape(rows[0]));
  })
);
