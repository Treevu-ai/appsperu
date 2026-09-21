import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const trayectoriaRouter = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

const TrayectoriaQuerySchema = z.object({
  codMod: z.string().min(1).optional(),
  anio: z.coerce.number().int().min(2000).max(2100).optional().describe("Default: el año más reciente ingerido."),
  departamento: z.string().min(1).optional(),
  provincia: z.string().min(1).optional(),
  distrito: z.string().min(1).optional(),
  ubigeo: z.string().regex(/^\d{6}$/).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Agregado por servicio educativo (código modular + anexo) x año -- colapsa las filas de la
 * fuente (que vienen desagregadas por edad y tipo de discapacidad integrada) en un total por
 * escuela, que es la granularidad útil para cruces (ej. contra ejecución presupuestal por
 * UBIGEO). `LEFT JOIN` contra el padrón de IIEE: una escuela con trayectoria pero sin match en
 * el padrón vigente (cerrada, o el padrón trae un corte distinto) igual aparece, con ubigeo/
 * nombre en null en vez de desaparecer silenciosamente del resultado.
 */
trayectoriaRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(TrayectoriaQuerySchema, req.query, res);
    if (!parsed) return;
    const { codMod, anio, departamento, provincia, distrito, ubigeo, limit, offset } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];
    const addParam = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };

    conditions.push(`t.anio = COALESCE(${anio !== undefined ? addParam(anio) : "NULL"}, (SELECT MAX(anio) FROM siagie_trayectoria))`);
    if (codMod) conditions.push(`t.cod_mod = ${addParam(codMod)}`);
    if (ubigeo) conditions.push(`i.ubigeo = ${addParam(ubigeo)}`);
    if (departamento) conditions.push(`i.departamento ILIKE ${addParam(`%${departamento}%`)}`);
    if (provincia) conditions.push(`i.provincia ILIKE ${addParam(`%${provincia}%`)}`);
    if (distrito) conditions.push(`i.distrito ILIKE ${addParam(`%${distrito}%`)}`);

    const whereSql = conditions.join(" AND ");
    const joinSql = "FROM siagie_trayectoria t LEFT JOIN instituciones_educativas i ON i.cod_mod = t.cod_mod AND i.anexo = t.anexo";
    // Params clonados para la query de listado -- LIMIT/OFFSET no deben mutar el array que ya
    // se le pasó (por referencia) a la query de conteo, corriendo en paralelo en el mismo
    // Promise.all (mismo criterio que violencia-escolar/src/routes/casos.ts).
    const listParams = [...params];
    const limitPlaceholder = `$${listParams.push(limit)}`;
    const offsetPlaceholder = `$${listParams.push(offset)}`;

    const [{ rows: countRows }, { rows }] = await Promise.all([
      pool.query<{ total: string }>(
        `SELECT COUNT(*) AS total FROM (SELECT 1 ${joinSql} WHERE ${whereSql} GROUP BY t.cod_mod, t.anexo) sub`,
        params
      ),
      pool.query(
        `SELECT t.cod_mod, t.anexo, t.anio,
                COALESCE(i.nombre, MAX(t.nombre)) AS nombre,
                i.ubigeo, i.departamento, i.provincia, i.distrito,
                SUM(t.total_estudiantes)::int AS total_estudiantes,
                SUM(t.matriculado)::int AS matriculado,
                SUM(t.aprobado)::int AS aprobado,
                SUM(t.desaprobado)::int AS desaprobado,
                SUM(t.promocion_guiada)::int AS promocion_guiada,
                SUM(t.retirado)::int AS retirado,
                SUM(t.fallecido)::int AS fallecido,
                SUM(t.tot_atraso)::int AS tot_atraso
         ${joinSql}
         WHERE ${whereSql}
         GROUP BY t.cod_mod, t.anexo, t.anio, i.nombre, i.ubigeo, i.departamento, i.provincia, i.distrito
         ORDER BY t.cod_mod, t.anexo
         LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
        listParams
      ),
    ]);

    const totalGrupos = Number(countRows[0].total);

    res.json({
      total: totalGrupos,
      limit,
      offset,
      hasMore: offset + rows.length < totalGrupos,
      resultados: rows.map((r) => {
        const total = Number(r.total_estudiantes);
        return {
          codMod: r.cod_mod,
          anexo: r.anexo,
          anio: r.anio,
          nombre: r.nombre,
          ubigeo: r.ubigeo,
          departamento: r.departamento,
          provincia: r.provincia,
          distrito: r.distrito,
          totalEstudiantes: total,
          matriculado: Number(r.matriculado),
          aprobado: Number(r.aprobado),
          // NULL cuando ninguna fila de origen trajo esta columna ese año (2021/2022 no tienen
          // `Desaprobado`, 2023/2024 no tienen `PromocionGuiada`) -- ver 002_siagie_trayectoria.sql.
          desaprobado: r.desaprobado === null ? null : Number(r.desaprobado),
          promocionGuiada: r.promocion_guiada === null ? null : Number(r.promocion_guiada),
          retirado: Number(r.retirado),
          fallecido: Number(r.fallecido),
          totAtraso: Number(r.tot_atraso),
          tasaAtraso: total > 0 ? Number(r.tot_atraso) / total : null,
          tasaRetiro: total > 0 ? Number(r.retirado) / total : null,
        };
      }),
      fuente: {
        dataset: "SIAGIE/MINEDU - Matriculación y Trayectoria Estudiantil",
        nota: "Agregado por servicio educativo (código modular) y año. Sin dato de alumno individual.",
      },
    });
  })
);
