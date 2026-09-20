import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { ceplanGeoPool } from "../db/external-pools.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import { NUMERIC_COLUMNS } from "../ingest/procesos-judiciales-normalize.js";

export const procesosJudicialesRouter = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

const NUMERIC_COLS_LOWER = NUMERIC_COLUMNS.map((c) => c.toLowerCase());
const COLUMNS = `anio, mes, distrito_judicial, provincia, distrito, codigo_dependencia, dependencia,
       estado, tipo_organo, espec_exp, espec_dep, condicion, ${NUMERIC_COLS_LOWER.join(", ")}`;

function toResultado(r: Record<string, unknown>, ubigeo: string | null) {
  const conteos: Record<string, number> = {};
  for (const col of NUMERIC_COLS_LOWER) conteos[col] = Number(r[col]);
  return {
    anio: r.anio,
    mes: r.mes,
    distritoJudicial: r.distrito_judicial,
    provincia: r.provincia,
    distrito: r.distrito,
    ubigeo,
    codigoDependencia: r.codigo_dependencia,
    dependencia: r.dependencia,
    estado: r.estado,
    tipoOrgano: r.tipo_organo,
    especExp: r.espec_exp,
    especDep: r.espec_dep,
    condicion: r.condicion,
    conteos,
  };
}

// Mismo mapeo que `normalizeTerritoryToken` de ceplan-geo (duplicado a
// propósito: apps independientes, sin import cruzado de src/). `territory_name_crosswalk`
// guarda provincia/distrito ya normalizados así -- acá hace falta igualar la
// convención para que el lookup por texto calce (esta base sí tiene "CAÑETE"/
// "MARAÑON" con tilde/Ñ tal cual el CSV fuente, sin normalizar en la ingesta).
const ACCENT_MAP: Record<string, string> = { Á: "A", É: "E", Í: "I", Ó: "O", Ú: "U", Ñ: "N", Ü: "U" };
function normalizeToken(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .trim()
    .toUpperCase()
    .replace(/[ÁÉÍÓÚÑÜ]/g, (ch) => ACCENT_MAP[ch] ?? ch)
    .replace(/\s+/g, " ");
}

/**
 * `ubigeo` no vive en esta base -- se resuelve vía `territory_name_crosswalk`
 * de ceplan-geo (fuente `poder-judicial`, ver
 * `ceplan-geo/api/src/crossref/build-crosswalk.ts`), cruzando por
 * provincia+distrito (esta app no tiene columna `departamento`, ver el
 * comentario de `GET /territorios` sobre por qué `distrito_judicial` no
 * sirve como proxy). Solo se usan matches `confirmada` -- un `candidata`
 * (nombre ambiguo a nivel nacional) o `sin_match` se exponen como
 * `ubigeo: null`, nunca se adivina cuál territorio es. Sin
 * `CEPLAN_GEO_DATABASE_URL` configurada, todas las filas quedan con
 * `ubigeo: null` sin romper el endpoint.
 */
async function fetchUbigeoByProvinciaDistrito(): Promise<Map<string, string>> {
  if (!ceplanGeoPool) return new Map();
  const { rows } = await ceplanGeoPool.query<{ provincia: string | null; distrito: string | null; ubigeo: string }>(
    `SELECT provincia, distrito, ubigeo FROM territory_name_crosswalk
     WHERE source = 'poder-judicial' AND match_status = 'confirmada' AND ubigeo IS NOT NULL`
  );
  return new Map(rows.map((r) => [`${r.provincia ?? ""}|${r.distrito ?? ""}`, r.ubigeo]));
}

const SearchQuerySchema = z.object({
  anio: z.coerce.number().int().min(2000).max(2100).optional(),
  mes: z.string().min(1).optional(),
  distritoJudicial: z.string().min(1).optional(),
  provincia: z.string().min(1).optional(),
  distrito: z.string().min(1).optional(),
  tipoOrgano: z.string().min(1).optional(),
  especExp: z.string().min(1).optional(),
  condicion: z.string().min(1).optional(),
  estado: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

procesosJudicialesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(SearchQuerySchema, req.query, res);
    if (!parsed) return;
    const { anio, mes, distritoJudicial, provincia, distrito, tipoOrgano, especExp, condicion, estado, limit, offset } =
      parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (anio) {
      params.push(anio);
      conditions.push(`anio = $${params.length}`);
    }
    if (mes) {
      params.push(mes);
      conditions.push(`mes = $${params.length}`);
    }
    if (distritoJudicial) {
      params.push(distritoJudicial);
      conditions.push(`distrito_judicial = $${params.length}`);
    }
    if (provincia) {
      params.push(provincia.toUpperCase());
      conditions.push(`provincia = $${params.length}`);
    }
    if (distrito) {
      params.push(distrito.toUpperCase());
      conditions.push(`distrito = $${params.length}`);
    }
    if (tipoOrgano) {
      params.push(tipoOrgano);
      conditions.push(`tipo_organo = $${params.length}`);
    }
    if (especExp) {
      params.push(especExp);
      conditions.push(`espec_exp = $${params.length}`);
    }
    if (condicion) {
      params.push(condicion);
      conditions.push(`condicion = $${params.length}`);
    }
    if (estado) {
      params.push(estado);
      conditions.push(`estado = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows: countRows } = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM procesos_judiciales_jurisdiccional ${where}`,
      params
    );
    const total = Number(countRows[0].total);

    const { rows } = await pool.query(
      `SELECT ${COLUMNS} FROM procesos_judiciales_jurisdiccional ${where}
       ORDER BY distrito_judicial, dependencia
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const ubigeoByProvinciaDistrito = await fetchUbigeoByProvinciaDistrito();

    res.json({
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map((r) =>
        toResultado(r, ubigeoByProvinciaDistrito.get(`${normalizeToken(r.provincia as string | null)}|${normalizeToken(r.distrito as string | null)}`) ?? null)
      ),
    });
  })
);

const GROUP_BY_COLUMNS: Record<string, string> = {
  distritoJudicial: "distrito_judicial",
  tipoOrgano: "tipo_organo",
  especExp: "espec_exp",
  anio: "anio",
  mes: "mes",
  estado: "estado",
  condicion: "condicion",
};

// Subconjunto "titular" de las 47 columnas de conteo -- los totales
// (PENDIENTE/RESUELTO) y los de mayor interés para lectura agregada. El
// resto queda disponible fila por fila en GET /, no en el resumen.
const RESUMEN_COLUMNS = ["pendiente", "resuelto", "ingreso_sin", "ingreso_con", "sentencia", "conciliado"] as const;

const ResumenQuerySchema = z.object({
  groupBy: z.enum(["distritoJudicial", "tipoOrgano", "especExp", "anio", "mes", "estado", "condicion"]),
  anio: z.coerce.number().int().min(2000).max(2100).optional(),
  mes: z.string().min(1).optional(),
  distritoJudicial: z.string().min(1).optional(),
});

procesosJudicialesRouter.get(
  "/resumen",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(ResumenQuerySchema, req.query, res);
    if (!parsed) return;
    const { groupBy, anio, mes, distritoJudicial } = parsed;

    const groupCol = GROUP_BY_COLUMNS[groupBy];
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (anio) {
      params.push(anio);
      conditions.push(`anio = $${params.length}`);
    }
    if (mes) {
      params.push(mes);
      conditions.push(`mes = $${params.length}`);
    }
    if (distritoJudicial) {
      params.push(distritoJudicial);
      conditions.push(`distrito_judicial = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const sumCols = RESUMEN_COLUMNS.map((c) => `SUM(${c})::bigint AS ${c}`).join(", ");
    const { rows } = await pool.query(
      `SELECT ${groupCol} AS grupo, COUNT(*)::bigint AS filas, ${sumCols}
       FROM procesos_judiciales_jurisdiccional ${where}
       GROUP BY ${groupCol}
       ORDER BY grupo`,
      params
    );

    res.json({
      groupBy,
      porGrupo: rows.map((r) => ({
        grupo: r.grupo,
        filas: Number(r.filas),
        ...Object.fromEntries(RESUMEN_COLUMNS.map((c) => [c, Number(r[c])])),
      })),
    });
  })
);

/**
 * GET /api/procesos-judiciales/territorios
 *
 * Triadas (provincia, distrito) distintas presentes en el dataset, con el
 * conteo de filas de cada una — pensado para que otro sistema (ej.
 * ceplan-geo, catálogo territorial UBIGEO) construya un cruce de nombres,
 * no para consumo analítico directo. NO trae `distrito_judicial`: esa
 * columna es una circunscripción judicial, no un territorio administrativo
 * (ej. "Lima Norte"/"Lima Este"/"Lima Sur" son 3 distritos judiciales
 * distintos dentro del mismo departamento Lima; "Puente Piedra-Ventanilla"
 * cruza Lima y Callao) — no sirve como proxy de departamento.
 */
procesosJudicialesRouter.get(
  "/territorios",
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT provincia, distrito, COUNT(*)::bigint AS filas
       FROM procesos_judiciales_jurisdiccional
       GROUP BY provincia, distrito
       ORDER BY provincia, distrito`
    );

    res.json({
      total: rows.length,
      territorios: rows.map((r) => ({ provincia: r.provincia, distrito: r.distrito, filas: Number(r.filas) })),
    });
  })
);
