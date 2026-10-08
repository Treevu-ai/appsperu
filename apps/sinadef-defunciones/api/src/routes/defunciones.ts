import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const defuncionesRouter = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

/**
 * Fallecidos del Sistema Informático Nacional de Defunciones (SINADEF,
 * MINSA). Cobertura: solo La Libertad (ver `sinadef-connector.ts` para el
 * motivo). `muerteViolenta` es la clasificación que registra quien emite el
 * certificado de defunción (HOMICIDIO, SUICIDIO, ACCIDENTE DE TRANSITO,
 * ACCIDENTE DE TRABAJO, OTRO ACCIDENTE, SIN REGISTRO) — no es una
 * calificación forense definitiva ni equivale a una denuncia SIDPOL.
 *
 * Limitación de frescura: el archivo fuente tiene `Last-Modified:
 * 2026-05-06` (confirmado en vivo 2026-10-07) — más de 2 años desactualizado
 * respecto al momento de la ingesta. Sirve como línea base histórica, no
 * como fuente de monitoreo del año en curso.
 */
const DefuncionesQuerySchema = z.object({
  provincia: z.string().min(1).optional(),
  distrito: z.string().min(1).optional(),
  muerteViolenta: z.string().min(1).optional(),
  anio: z.coerce.number().int().min(2000).max(2100).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

defuncionesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(DefuncionesQuerySchema, req.query, res);
    if (!parsed) return;
    const { provincia, distrito, muerteViolenta, anio, limit, offset } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (provincia) { params.push(provincia.toUpperCase()); conditions.push(`provincia_domicilio = $${params.length}`); }
    if (distrito) { params.push(distrito.toUpperCase()); conditions.push(`distrito_domicilio = $${params.length}`); }
    if (muerteViolenta) { params.push(muerteViolenta.toUpperCase()); conditions.push(`muerte_violenta = $${params.length}`); }
    if (anio !== undefined) { params.push(anio); conditions.push(`anio_defuncion = $${params.length}`); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows: countRows } = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM defunciones ${where}`,
      params
    );
    const total = Number(countRows[0].total);

    const { rows } = await pool.query(
      `SELECT provincia_domicilio, distrito_domicilio, sexo, edad, fecha_defuncion, anio_defuncion, mes_defuncion,
              tipo_lugar, muerte_violenta, necropsia, causa_a, cie_a
       FROM defunciones
       ${where}
       ORDER BY anio_defuncion DESC NULLS LAST, mes_defuncion DESC NULLS LAST, id
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map((r) => ({
        provincia: r.provincia_domicilio,
        distrito: r.distrito_domicilio,
        sexo: r.sexo,
        edad: r.edad,
        fechaDefuncion: r.fecha_defuncion,
        anioDefuncion: r.anio_defuncion,
        mesDefuncion: r.mes_defuncion,
        tipoLugar: r.tipo_lugar,
        muerteViolenta: r.muerte_violenta,
        necropsia: r.necropsia,
        causaA: r.causa_a,
        cieA: r.cie_a,
      })),
      meta: {
        cobertura: "La Libertad únicamente",
        limitacion: "Archivo fuente desactualizado desde 2026-05-06 — línea base histórica, no refleja el año en curso.",
        fuente: "SINADEF / MINSA",
      },
    });
  })
);

interface ResumenRow {
  muerte_violenta: string | null;
  total: string;
}

/** Conteo de defunciones por categoría de `muerte_violenta`, para cruzar contra denuncias SIDPOL. */
defuncionesRouter.get(
  "/resumen",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(
      z.object({
        provincia: z.string().min(1).optional(),
        anio: z.coerce.number().int().min(2000).max(2100).optional(),
      }),
      req.query,
      res
    );
    if (!parsed) return;
    const { provincia, anio } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (provincia) { params.push(provincia.toUpperCase()); conditions.push(`provincia_domicilio = $${params.length}`); }
    if (anio !== undefined) { params.push(anio); conditions.push(`anio_defuncion = $${params.length}`); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query<ResumenRow>(
      `SELECT muerte_violenta, COUNT(*) AS total
       FROM defunciones
       ${where}
       GROUP BY muerte_violenta
       ORDER BY total DESC`,
      params
    );

    res.json({
      filtros: { provincia: provincia ?? null, anio: anio ?? null },
      porCategoria: rows.map((r) => ({ muerteViolenta: r.muerte_violenta, total: Number(r.total) })),
      meta: {
        cobertura: "La Libertad únicamente",
        nota: "`muerte_violenta` es la clasificación del certificado de defunción, no una calificación forense ni una denuncia SIDPOL.",
      },
    });
  })
);
