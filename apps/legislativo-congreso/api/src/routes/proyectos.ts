import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const proyectosRouter = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

const ProyectosQuerySchema = z.object({
  periodo: z.coerce.number().int().optional().describe("perParId exacto."),
  estado: z.string().min(1).optional().describe("desEstado exacto (ver GET /api/proyectos/estados si existiera un catálogo)."),
  autor: z.string().min(1).optional().describe("Búsqueda parcial (ILIKE) sobre autores."),
  texto: z.string().min(1).optional().describe("Búsqueda parcial (ILIKE) sobre el título."),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Listado de proyectos de ley. A diferencia de `violencia-escolar`, aquí sí hay una clave
 * natural real (per_par_id + pley_num, verificada única sobre 14,864 filas -- ver
 * docs/data-contracts/congreso-spley-portal-service.md), así que no hace falta filtrar por
 * "batch más reciente": el upsert del conector ya mantiene una sola fila vigente por proyecto.
 */
proyectosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(ProyectosQuerySchema, req.query, res);
    if (!parsed) return;
    const { periodo, estado, autor, texto, limit, offset } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];
    const addParam = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    const addIlike = (column: string, value: string) => conditions.push(`${column} ILIKE ${addParam(`%${value}%`)}`);

    if (periodo !== undefined) conditions.push(`per_par_id = ${addParam(periodo)}`);
    if (estado) conditions.push(`estado = ${addParam(estado)}`);
    if (autor) addIlike("autores", autor);
    if (texto) addIlike("titulo", texto);

    const whereSql = conditions.length > 0 ? conditions.join(" AND ") : "TRUE";
    const listParams = [...params];
    const limitPlaceholder = `$${listParams.push(limit)}`;
    const offsetPlaceholder = `$${listParams.push(offset)}`;

    const [{ rows: countRows }, { rows }] = await Promise.all([
      pool.query<{ total: string }>(`SELECT COUNT(*) AS total FROM legislativo_congreso_proyectos WHERE ${whereSql}`, params),
      pool.query(
        `SELECT per_par_id, pley_num, proyecto_ley, estado, fecha_presentacion, titulo, proponente, autores, cod_tipo_parl, cod_tipo_parl_actual
         FROM legislativo_congreso_proyectos
         WHERE ${whereSql}
         ORDER BY per_par_id DESC, pley_num DESC
         LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
        listParams
      ),
    ]);

    const total = Number(countRows[0].total);

    res.json({
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map((r) => ({
        perParId: r.per_par_id,
        pleyNum: r.pley_num,
        proyectoLey: r.proyecto_ley,
        estado: r.estado,
        fechaPresentacion: r.fecha_presentacion,
        titulo: r.titulo,
        proponente: r.proponente,
        autores: r.autores,
        codTipoParl: r.cod_tipo_parl,
        codTipoParlActual: r.cod_tipo_parl_actual,
      })),
      fuente: {
        dataset: "Congreso de la República - Proyectos de Ley (spley-portal-service)",
        nota: "Un resultado vacío para un periodo que aparece en GET /api/proyectos/periodos significa 'sin match para el filtro'; un periodo ausente de esa lista significa 'no ingerido todavía', no 'cero proyectos confirmados'. Ver GET /api/proyectos/periodos.",
      },
    });
  })
);

/**
 * Declara explícitamente qué periodos parlamentarios están disponibles (ingeridos con éxito al
 * menos una vez), para distinguir un filtro real sin match de un periodo que nunca se ingirió --
 * ver el hallazgo real de Copilot documentado en docs/PRD_Inteligencia_Legislativa_Congreso_v1.md.
 */
proyectosRouter.get(
  "/periodos",
  asyncHandler(async (_req, res) => {
    // `MAX(fetched_at)` y `MAX(record_count)` por separado pueden mezclar columnas de dos
    // corridas distintas del mismo periodo -- si una ingesta posterior trae menos proyectos, el
    // MAX de record_count seguiría mostrando el máximo histórico, no el de la última corrida
    // real (hallazgo real de Copilot). `DISTINCT ON` fija ambas columnas al mismo batch, el más
    // reciente por `fetched_at`.
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (per_par_id) per_par_id, fetched_at AS ultima_ingesta, record_count AS proyectos_en_ultima_ingesta
       FROM raw_congreso_batches
       ORDER BY per_par_id DESC, fetched_at DESC, id DESC`
    );

    res.json({
      periodos: rows.map((r) => ({
        perParId: r.per_par_id,
        disponible: true,
        ultimaIngesta: r.ultima_ingesta,
        proyectosEnUltimaIngesta: Number(r.proyectos_en_ultima_ingesta),
      })),
      nota: "Cualquier perParId que no aparezca en esta lista es 'no_disponible' -- nunca se ha ingerido, no tiene cero proyectos confirmados.",
    });
  })
);

const DetailParamsSchema = z.object({
  periodo: z.coerce.number().int(),
  numero: z.coerce.number().int(),
});

/**
 * `:periodo/:numero` (per_par_id + pley_num), no `:codigo` -- el código legible
 * (`proyectoLey`, ej. "14864/2025-CR") contiene "/" y no es un segmento de ruta válido sin
 * codificar (hallazgo real de Copilot, ver el PRD).
 */
proyectosRouter.get(
  "/:periodo/:numero",
  asyncHandler(async (req, res) => {
    const parsedParams = DetailParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ error: "periodo y numero deben ser enteros." });
      return;
    }
    const { periodo, numero } = parsedParams.data;

    const { rows } = await pool.query(
      `SELECT per_par_id, pley_num, proyecto_ley, estado, fecha_presentacion, titulo, proponente, autores, cod_tipo_parl, cod_tipo_parl_actual
       FROM legislativo_congreso_proyectos
       WHERE per_par_id = $1 AND pley_num = $2`,
      [periodo, numero]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Proyecto no encontrado." });
      return;
    }

    const r = rows[0];
    res.json({
      perParId: r.per_par_id,
      pleyNum: r.pley_num,
      proyectoLey: r.proyecto_ley,
      estado: r.estado,
      fechaPresentacion: r.fecha_presentacion,
      titulo: r.titulo,
      proponente: r.proponente,
      autores: r.autores,
      codTipoParl: r.cod_tipo_parl,
      codTipoParlActual: r.cod_tipo_parl_actual,
    });
  })
);
