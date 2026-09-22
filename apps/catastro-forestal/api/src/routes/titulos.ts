import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const titulosRouter = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

const CAPAS = [
  "modalidad_permisos",
  "modalidad_cesiones_en_uso",
  "modalidad_autorizaciones_pfdm_avnb",
  "modalidad_autorizacion_cambio_uso_agropecuario",
  "modalidad_bosques_locales",
  "modalidad_unidad_aprovechamiento",
  "modalidad_concesiones_forestales",
  "ordenamiento_bosques_locales",
  "ordenamiento_bosques_protectores",
  "ordenamiento_bosques_produccion_permanente",
] as const;

const SELECT_COLUMNS = `
  capa, objectid, fuente, doc_reg, fec_reg, observ, zon_utm, origen,
  nom_dis, nom_pro, nom_dep, aut_for, fec_ini, fec_ter, situac, sup_sig,
  sup_apr, doc_leg, fec_leg, atributos_extra
`;

function toApiShape(r: Record<string, unknown>) {
  return {
    capa: r.capa,
    objectid: r.objectid,
    fuente: r.fuente,
    docReg: r.doc_reg,
    fecReg: r.fec_reg,
    observ: r.observ,
    zonUtm: r.zon_utm,
    origen: r.origen,
    nomDis: r.nom_dis,
    nomPro: r.nom_pro,
    nomDep: r.nom_dep,
    autFor: r.aut_for,
    fecIni: r.fec_ini,
    fecTer: r.fec_ter,
    situac: r.situac,
    supSig: r.sup_sig,
    supApr: r.sup_apr,
    docLeg: r.doc_leg,
    fecLeg: r.fec_leg,
    atributosExtra: r.atributos_extra,
  };
}

const TitulosQuerySchema = z.object({
  capa: z.enum(CAPAS).optional(),
  nomDep: z.string().min(1).optional().describe("Código UBIGEO de departamento en las 10 capas."),
  nomPro: z.string().min(1).optional().describe("Código UBIGEO de provincia en 9 de 10 capas -- nombre real (texto) solo en modalidad_autorizacion_cambio_uso_agropecuario."),
  nomDis: z.string().min(1).optional().describe("Código UBIGEO de distrito en 9 de 10 capas -- nombre real (texto) solo en modalidad_autorizacion_cambio_uso_agropecuario."),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Listado de títulos habilitantes y clasificación forestal. Cada capa es un snapshot completo
 * reemplazado en cada ingesta -- no hace falta filtrar por "batch más reciente".
 */
titulosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(TitulosQuerySchema, req.query, res);
    if (!parsed) return;
    const { capa, nomDep, nomPro, nomDis, limit, offset } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];
    const addParam = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };

    if (capa) conditions.push(`capa = ${addParam(capa)}`);
    if (nomDep) conditions.push(`nom_dep = ${addParam(nomDep)}`);
    if (nomPro) conditions.push(`nom_pro = ${addParam(nomPro)}`);
    if (nomDis) conditions.push(`nom_dis = ${addParam(nomDis)}`);

    const whereSql = conditions.length > 0 ? conditions.join(" AND ") : "TRUE";
    const listParams = [...params];
    const limitPlaceholder = `$${listParams.push(limit)}`;
    const offsetPlaceholder = `$${listParams.push(offset)}`;

    // Dos `pool.query` sueltos podrían intercalarse con una ingesta concurrente y mezclar un
    // `total` de un momento con `resultados` de otro (mismo hallazgo real que en
    // senace-cartera-proyectos) -- ambas consultas corren sobre el mismo cliente dentro de una
    // transacción `REPEATABLE READ`, que ve un snapshot fijo de la base para las dos.
    const client = await pool.connect();
    let countRows: { total: string }[];
    let rows: Record<string, unknown>[];
    try {
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      ({ rows: countRows } = await client.query<{ total: string }>(
        `SELECT COUNT(*) AS total FROM catastro_forestal_titulos WHERE ${whereSql}`,
        params
      ));
      ({ rows } = await client.query(
        `SELECT ${SELECT_COLUMNS} FROM catastro_forestal_titulos
         WHERE ${whereSql}
         ORDER BY capa, objectid
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
        dataset: "SERFOR - Catastro Forestal (Modalidad de Acceso + Ordenamiento Forestal)",
        nota: "nomDep es siempre un código UBIGEO numérico. nomPro/nomDis son códigos UBIGEO en 9 de 10 capas, pero nombres reales de texto en modalidad_autorizacion_cambio_uso_agropecuario (inconsistencia real de la fuente). Cruzar los códigos contra una tabla UBIGEO para mostrar nombres. objectid NO es una clave única global -- solo identifica una fila dentro de su propia capa. Cada capa es un snapshot completo reemplazado en cada ingesta.",
      },
    });
  })
);

const DetailParamsSchema = z.object({
  capa: z.enum(CAPAS),
  objectid: z.coerce.number().int(),
});

titulosRouter.get(
  "/:capa/:objectid",
  asyncHandler(async (req, res) => {
    const parsedParams = DetailParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ error: "capa debe ser una de las 10 capas soportadas, objectid debe ser entero." });
      return;
    }
    const { capa, objectid } = parsedParams.data;

    const { rows } = await pool.query(
      `SELECT ${SELECT_COLUMNS} FROM catastro_forestal_titulos WHERE capa = $1 AND objectid = $2`,
      [capa, objectid]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Título no encontrado." });
      return;
    }

    res.json(toApiShape(rows[0]));
  })
);
